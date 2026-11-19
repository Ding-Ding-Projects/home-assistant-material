"""End-to-end check of live clips with real programs.

A second go2rtc stands in for the camera service, fed by an ffmpeg test pattern.
A pretend camera entity forwards each offer to it, as a provider integration
would. The bundled go2rtc then pulls through the real one-time view, ffmpeg
records from it, and the clip is checked. Skipped when go2rtc or ffmpeg is absent.
"""

import asyncio
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import timedelta
import logging
import os
from pathlib import Path
import shutil
import socket
import time
from types import SimpleNamespace
from unittest.mock import patch

from aiohttp import ClientSession, web
import av
from go2rtc_client import Go2RtcRestClient
import pytest
from pytest_homeassistant.common import MockConfigEntry
from webrtc_models import RTCIceCandidateInit

from homeassistant.components.camera import (
    DATA_COMPONENT,
    Camera,
    CameraEntityFeature,
    WebRTCAnswer,
    WebRTCSendMessage,
)
from homeassistant.components.camera_recording.events import ClipReason, ClipState
from homeassistant.components.camera_recording.live import (
    LIVE_BROKER,
    LiveOfferView,
    broker_for,
)
from homeassistant.components.camera_recording.manager import RecordingManager
from homeassistant.components.http import KEY_HASS
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.setup import async_setup_component
from homeassistant.util import dt as dt_util

from .conftest import CAMERA

pytestmark = pytest.mark.skipif(
    shutil.which("go2rtc") is None or shutil.which("ffmpeg") is None,
    reason="needs the go2rtc and ffmpeg programs",
)

BUNDLED_RTSP = 18554
LONG = pytest.mark.skipif(
    not os.environ.get("CAMERA_RECORDING_E2E_LONG"),
    reason="long clips run only when CAMERA_RECORDING_E2E_LONG is set",
)
CLIP_SECONDS = 10


def free_port() -> int:
    """A free loopback TCP port."""
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


async def start_go2rtc(config: Path, api_port: int) -> asyncio.subprocess.Process:
    """Start one go2rtc and wait until its API answers."""
    process = await asyncio.create_subprocess_exec(
        "go2rtc",
        "-c",
        str(config),
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
    )
    async with ClientSession() as session:
        for _ in range(100):
            try:
                async with session.get(f"http://127.0.0.1:{api_port}/api"):
                    return process
            except OSError:
                await asyncio.sleep(0.1)
    process.kill()
    raise AssertionError("go2rtc did not start")


@dataclass
class Rig:
    """The programs and ports of one run."""

    service_api: int
    bundled_api: int
    view_port: int
    rest: Go2RtcRestClient


@pytest.fixture
async def rig(tmp_path: Path, socket_enabled: None) -> AsyncIterator[Rig]:
    """The pretend camera service, the bundled go2rtc and the real view on a real port."""
    service_api = free_port()
    bundled_api = free_port()
    service = tmp_path / "service.yaml"
    service.write_text(
        f"""api:
  listen: '127.0.0.1:{service_api}'
rtsp:
  listen: '127.0.0.1:{free_port()}'
webrtc:
  listen: ':{free_port()}'
  ice_servers: []
streams:
  pretend: 'exec:ffmpeg -re -f lavfi -i testsrc=size=640x360:rate=15 -c:v libx264 -preset ultrafast -tune zerolatency -g 30 -f rtsp {{output}}'
  drops15: 'exec:ffmpeg -re -f lavfi -i testsrc=size=640x360:rate=15 -t 15 -c:v libx264 -preset ultrafast -tune zerolatency -g 30 -f rtsp {{output}}'
  drops2: 'exec:ffmpeg -re -f lavfi -i testsrc=size=640x360:rate=15 -t 2 -c:v libx264 -preset ultrafast -tune zerolatency -g 30 -f rtsp {{output}}'
"""
    )
    bundled = tmp_path / "bundled.yaml"
    bundled.write_text(
        f"""api:
  listen: '127.0.0.1:{bundled_api}'
rtsp:
  listen: '127.0.0.1:{BUNDLED_RTSP}'
webrtc:
  listen: ':{free_port()}/tcp'
  ice_servers: []
exec:
  allow_paths:
    - ffmpeg
"""
    )
    first = await start_go2rtc(service, service_api)
    second = await start_go2rtc(bundled, bundled_api)
    session = ClientSession()
    rest = Go2RtcRestClient(session, f"http://127.0.0.1:{bundled_api}")
    try:
        yield Rig(service_api, bundled_api, 0, rest)
    finally:
        await session.close()
        for process in (first, second):
            process.kill()
            await process.wait()


class PretendCamera(Camera):
    """A camera whose offer handling forwards to the pretend service, like a provider integration."""

    _attr_name = "Front door"
    _attr_supported_features = CameraEntityFeature.STREAM

    def __init__(self, service_api: int, stream: str = "pretend") -> None:
        """Remember where the pretend service is and which of its streams to show."""
        super().__init__()
        self.service_api = service_api
        self.source_name = stream
        self.refuse = False
        self.offers = 0
        self._webrtc_sessions: dict[str, object] = {}

    async def async_handle_async_webrtc_offer(
        self, offer_sdp: str, session_id: str, send_message: WebRTCSendMessage
    ) -> None:
        """Ask the pretend service, or refuse the way a rate-limited service does."""
        self.offers += 1
        if self.refuse:
            raise HomeAssistantError("429 Too Many Requests: slow down")
        async with (
            ClientSession() as session,
            session.post(
                f"http://127.0.0.1:{self.service_api}/api/webrtc?src={self.source_name}",
                data=offer_sdp,
                headers={"Content-Type": "application/sdp"},
            ) as response,
        ):
            response.raise_for_status()
            send_message(WebRTCAnswer(await response.text()))

    async def async_on_webrtc_candidate(
        self, session_id: str, candidate: RTCIceCandidateInit
    ) -> None:
        """Not needed."""


@pytest.fixture
async def view_server(hass: HomeAssistant) -> AsyncIterator[int]:
    """The real one-time view served on a real loopback port."""
    app = web.Application()
    app[KEY_HASS] = hass
    LiveOfferView().register(hass, app, app.router)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0)
    await site.start()
    port = site._server.sockets[0].getsockname()[1]
    yield port
    await runner.cleanup()


async def run_event(
    hass: HomeAssistant,
    entry: MockConfigEntry,
    rig: Rig,
    view_port: int,
    camera: PretendCamera,
    clip_seconds: int = CLIP_SECONDS,
    fire: bool = True,
) -> tuple[RecordingManager, list[str]]:
    """Start a manager for the pretend camera and fire one event."""
    manager = RecordingManager(hass, entry)
    await manager.async_start()
    manager.recorders[CAMERA].no_source = True
    await manager.async_set_live_options(CAMERA, clip_seconds=clip_seconds)
    tokens: list[str] = []

    def source(_hass: HomeAssistant, token: str) -> str:
        tokens.append(token)
        return (
            f"webrtc:http://127.0.0.1:{view_port}/api/camera_recording/whep/{token}"
            "#format=whep"
        )

    rest = SimpleNamespace(_rest_client=rig.rest)
    for patcher in (
        patch("homeassistant.components.camera_recording.manager.whep_source", source),
        patch("homeassistant.components.camera_recording.live.whep_source", source),
        patch.object(manager, "_camera_for_device", return_value=CAMERA),
        patch.object(
            hass.config_entries,
            "async_loaded_entries",
            return_value=[SimpleNamespace(runtime_data=rest)],
        ),
    ):
        patcher.start()
        manager._unsubs.append(patcher.stop)
    if fire:
        fire_event(hass)
        await hass.async_block_till_done()
    return manager, tokens


def fire_event(hass: HomeAssistant, seconds_ago: float = 0) -> None:
    """An event from the provider integration, in the shape it fires."""
    hass.bus.async_fire(
        "nest_event",
        {
            "device_id": "d",
            "type": "camera_motion",
            "timestamp": dt_util.utcnow() - timedelta(seconds=seconds_ago),
        },
    )


@pytest.mark.parametrize(
    "seconds",
    [
        pytest.param(CLIP_SECONDS, id="10s"),
        pytest.param(40, id="40s-default", marks=LONG),
        pytest.param(120, id="120s-longest", marks=LONG),
    ],
)
async def test_live_clip_end_to_end(
    hass: HomeAssistant,
    local_entry: MockConfigEntry,
    rig: Rig,
    view_server: int,
    caplog: pytest.LogCaptureFixture,
    seconds: int,
) -> None:
    """An event becomes a real clip of the chosen length, and nothing is left running."""
    assert await async_setup_component(hass, "ffmpeg", {})
    assert await async_setup_component(hass, "camera", {})
    camera = PretendCamera(rig.service_api)
    await hass.data[DATA_COMPONENT].async_add_entities([camera])
    local_entry.add_to_hass(hass)
    caplog.set_level(logging.DEBUG)

    started = time.monotonic()
    with patch(
        "homeassistant.components.camera_recording.recorder.CameraRecorder.start"
    ):
        manager, tokens = await run_event(
            hass, local_entry, rig, view_server, camera, seconds
        )
        assert manager.live_active.get(CAMERA) is not None
        assert manager.events_between(CAMERA, 0, 4_000_000_000)[0]["state"] == "saving"
        await asyncio.wait_for(asyncio.gather(*manager._live_tasks), seconds + 120)
    elapsed = time.monotonic() - started

    (row,) = manager.events_between(CAMERA, 0, 4_000_000_000)
    assert (row["state"], row["origin"], row["kind"]) == ("saved", "home", "clip")
    assert abs(row["duration"] - seconds) <= 3
    assert row["cut_short"] is False
    assert row["size"] > 20_000
    clip = manager.folder(CAMERA) / row["name"]
    assert clip.stat().st_size == row["size"]
    print(  # noqa: T201
        f"E2E live clip: {elapsed:.1f}s total, clip {row['duration']:.2f}s, {row['size']} bytes"
    )

    with av.open(str(clip)) as container:
        video = container.streams.video[0]
        assert (video.codec_context.name, video.width, video.height) == (
            "h264",
            640,
            360,
        )

    assert camera.offers == 1
    streams = await rig.rest.streams.list()
    assert not [name for name in streams if name.startswith("camera_recording_")]
    assert manager.live_active == {}
    (token,) = tokens
    ours = " ".join(
        record.getMessage()
        for record in caplog.records
        if record.name.startswith("homeassistant.components.camera_recording")
    )
    assert token not in ours
    assert broker_for(hass).claim(token) is None
    for secret_word in ("v=0", "a=candidate", "ice-ufrag", "a=fingerprint"):
        assert secret_word not in caplog.text
    await manager.async_stop()


async def test_refusing_service_gives_reason_and_waits(
    hass: HomeAssistant,
    local_entry: MockConfigEntry,
    rig: Rig,
    view_server: int,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """A service that answers too many requests ends in that reason and starts the wait."""
    assert await async_setup_component(hass, "ffmpeg", {})
    assert await async_setup_component(hass, "camera", {})
    camera = PretendCamera(rig.service_api)
    camera.refuse = True
    await hass.data[DATA_COMPONENT].async_add_entities([camera])
    local_entry.add_to_hass(hass)

    started = time.monotonic()
    with patch(
        "homeassistant.components.camera_recording.recorder.CameraRecorder.start"
    ):
        manager, _tokens = await run_event(hass, local_entry, rig, view_server, camera)
        await asyncio.wait_for(asyncio.gather(*manager._live_tasks), 120)
    elapsed = time.monotonic() - started

    (row,) = manager.events_between(CAMERA, 0, 4_000_000_000)
    assert (row["state"], row["reason"]) == (
        ClipState.NONE.value,
        ClipReason.RATE_LIMITED.value,
    )
    assert manager._limited(CAMERA, time.time())
    assert camera.offers == 1
    assert "slow down" not in caplog.text
    print(f"E2E refusal: reason after {elapsed:.1f}s")  # noqa: T201
    await manager.async_stop()


async def setup_camera(
    hass: HomeAssistant, entry: MockConfigEntry, rig: Rig, stream: str = "pretend"
) -> PretendCamera:
    """Set up ffmpeg, the camera component and the pretend camera."""
    assert await async_setup_component(hass, "ffmpeg", {})
    assert await async_setup_component(hass, "camera", {})
    camera = PretendCamera(rig.service_api, stream)
    await hass.data[DATA_COMPONENT].async_add_entities([camera])
    entry.add_to_hass(hass)
    return camera


@pytest.mark.parametrize(
    ("stream", "expected"),
    [
        pytest.param("drops15", "cut_short", id="drops-after-15s"),
        pytest.param("drops2", "no_clip", id="drops-after-2s"),
    ],
)
async def test_service_dropping_the_stream(
    hass: HomeAssistant,
    local_entry: MockConfigEntry,
    rig: Rig,
    view_server: int,
    caplog: pytest.LogCaptureFixture,
    stream: str,
    expected: str,
) -> None:
    """Video that stops early is kept when long enough and marked cut short; otherwise the reason is plain."""
    camera = await setup_camera(hass, local_entry, rig, stream)
    started = time.monotonic()
    with patch(
        "homeassistant.components.camera_recording.recorder.CameraRecorder.start"
    ):
        manager, _tokens = await run_event(
            hass, local_entry, rig, view_server, camera, 40
        )
        await asyncio.wait_for(asyncio.gather(*manager._live_tasks), 160)
    elapsed = time.monotonic() - started
    (row,) = manager.events_between(CAMERA, 0, 4_000_000_000)
    print(  # noqa: T201
        f"E2E {stream}: {elapsed:.1f}s, state {row['state']}, reason {row['reason']},"
        f" clip {row['duration']:.2f}s, {row['size']} bytes, cut short {row['cut_short']}"
    )
    if expected == "cut_short":
        assert (row["state"], row["cut_short"]) == ("saved", True)
        assert 10 <= row["duration"] <= 20
        assert (manager.folder(CAMERA) / row["name"]).stat().st_size == row["size"]
    else:
        assert row["state"] == "none"
        assert row["reason"] in (
            ClipReason.STREAM_ENDED.value,
            ClipReason.TIMED_OUT.value,
        )
    assert camera.offers == 1
    streams = await rig.rest.streams.list()
    assert not [name for name in streams if name.startswith("camera_recording_")]
    assert not list(manager.folder(CAMERA).glob(".*.part"))
    for secret_word in ("v=0", "a=candidate", "ice-ufrag", "a=fingerprint"):
        assert secret_word not in caplog.text
    await manager.async_stop()


async def test_two_events_five_seconds_apart(
    hass: HomeAssistant,
    local_entry: MockConfigEntry,
    rig: Rig,
    view_server: int,
) -> None:
    """Two events of one camera 5 seconds apart use one provider session and one clip."""
    camera = await setup_camera(hass, local_entry, rig)
    with patch(
        "homeassistant.components.camera_recording.recorder.CameraRecorder.start"
    ):
        manager, tokens = await run_event(hass, local_entry, rig, view_server, camera)
        await asyncio.sleep(5)
        fire_event(hass)
        await hass.async_block_till_done()
        await asyncio.wait_for(asyncio.gather(*manager._live_tasks), 120)
    rows = manager.events_between(CAMERA, 0, 4_000_000_000)
    assert len(rows) == 1
    assert rows[0]["state"] == "saved"
    assert camera.offers == 1
    assert len(tokens) == 1
    await manager.async_stop()


async def test_event_while_a_browser_watches(
    hass: HomeAssistant,
    local_entry: MockConfigEntry,
    rig: Rig,
    view_server: int,
) -> None:
    """While a live view is open from a browser, no second provider session is opened."""
    camera = await setup_camera(hass, local_entry, rig)
    camera._webrtc_sessions["browser"] = object()
    with (
        patch(
            "homeassistant.components.camera_recording.recorder.CameraRecorder.start"
        ),
        patch(
            "homeassistant.components.camera_recording.manager.LIVE_BUSY_WAIT_SECONDS",
            2,
        ),
        patch(
            "homeassistant.components.camera_recording.manager.LIVE_BUSY_POLL_SECONDS",
            1,
        ),
    ):
        manager, tokens = await run_event(hass, local_entry, rig, view_server, camera)
        await asyncio.wait_for(asyncio.gather(*manager._live_tasks), 30)
    (row,) = manager.events_between(CAMERA, 0, 4_000_000_000)
    assert (row["state"], row["reason"]) == ("none", ClipReason.CAMERA_BUSY.value)
    assert camera.offers == 0
    assert tokens == []
    assert manager.live_budget_left(CAMERA, time.time()) == 12
    await manager.async_stop()


async def test_hourly_budget_reached_end_to_end(
    hass: HomeAssistant,
    local_entry: MockConfigEntry,
    rig: Rig,
    view_server: int,
) -> None:
    """With the hourly budget spent, the next event opens no session and says why."""
    camera = await setup_camera(hass, local_entry, rig)
    with patch(
        "homeassistant.components.camera_recording.recorder.CameraRecorder.start"
    ):
        manager, _tokens = await run_event(
            hass, local_entry, rig, view_server, camera, fire=False
        )
        await manager.async_set_live_options(CAMERA, clips_per_hour=1)
        fire_event(hass, 60)
        await hass.async_block_till_done()
        await asyncio.wait_for(asyncio.gather(*manager._live_tasks), 120)
        fire_event(hass)
        await hass.async_block_till_done()
    first, second = manager.events_between(CAMERA, 0, 4_000_000_000)
    assert first["state"] == "saved"
    assert (second["state"], second["reason"]) == (
        "none",
        ClipReason.HOURLY_LIMIT.value,
    )
    assert camera.offers == 1
    await manager.async_stop()


async def test_one_time_address_dead_after_restart(
    hass: HomeAssistant,
    local_entry: MockConfigEntry,
    rig: Rig,
    view_server: int,
) -> None:
    """An address minted before a restart answers nothing afterwards, over a real socket."""
    camera = await setup_camera(hass, local_entry, rig)
    token = broker_for(hass).mint(CAMERA).token
    hass.data.pop(LIVE_BROKER)
    async with (
        ClientSession() as session,
        session.post(
            f"http://127.0.0.1:{view_server}/api/camera_recording/whep/{token}",
            data=b"v=0\r\n",
            headers={"Content-Type": "application/sdp"},
        ) as response,
    ):
        assert response.status == 404
    assert camera.offers == 0
