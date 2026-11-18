"""End-to-end check of live clips with real programs.

A second go2rtc stands in for the camera service, fed by an ffmpeg test pattern.
A pretend camera entity forwards each offer to it, as a provider integration
would. The bundled go2rtc then pulls through the real one-time view, ffmpeg
records from it, and the clip is checked. Skipped when go2rtc or ffmpeg is absent.
"""

import asyncio
from collections.abc import AsyncIterator
from dataclasses import dataclass
import logging
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
from homeassistant.components.camera_recording.live import LiveOfferView, broker_for
from homeassistant.components.camera_recording.manager import RecordingManager
from homeassistant.components.http import KEY_HASS
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.setup import async_setup_component

from .conftest import CAMERA

pytestmark = pytest.mark.skipif(
    shutil.which("go2rtc") is None or shutil.which("ffmpeg") is None,
    reason="needs the go2rtc and ffmpeg programs",
)

BUNDLED_RTSP = 18554
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

    def __init__(self, service_api: int) -> None:
        """Remember where the pretend service is."""
        super().__init__()
        self.service_api = service_api
        self.refuse = False
        self.offers = 0

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
                f"http://127.0.0.1:{self.service_api}/api/webrtc?src=pretend",
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
) -> tuple[RecordingManager, list[str]]:
    """Start a manager for the pretend camera and fire one event."""
    manager = RecordingManager(hass, entry)
    await manager.async_start()
    manager.recorders[CAMERA].no_source = True
    await manager.async_set_live_options(CAMERA, clip_seconds=CLIP_SECONDS)
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
    hass.bus.async_fire("nest_event", {"device_id": "d", "timestamp": None})
    await hass.async_block_till_done()
    return manager, tokens


async def test_live_clip_end_to_end(
    hass: HomeAssistant,
    local_entry: MockConfigEntry,
    rig: Rig,
    view_server: int,
    caplog: pytest.LogCaptureFixture,
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
        manager, tokens = await run_event(hass, local_entry, rig, view_server, camera)
        assert manager.live_active.get(CAMERA) is not None
        assert manager.events_between(CAMERA, 0, 4_000_000_000)[0]["state"] == "saving"
        await asyncio.wait_for(asyncio.gather(*manager._live_tasks), 120)
    elapsed = time.monotonic() - started

    (row,) = manager.events_between(CAMERA, 0, 4_000_000_000)
    assert (row["state"], row["origin"], row["kind"]) == ("saved", "home", "clip")
    assert abs(row["duration"] - CLIP_SECONDS) <= 3
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
