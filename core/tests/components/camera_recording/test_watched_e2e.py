"""End-to-end check that watching and keeping share one camera session, with real programs.

A second go2rtc stands in for the camera service. The bundled go2rtc pulls the
camera once through the real one-time view; ffmpeg readers of the same go2rtc
stream stand in for browsers, and the keeper's ffmpeg keeps what they watch.
Skipped when go2rtc or ffmpeg is absent.
"""

import asyncio
from collections.abc import AsyncIterator
import logging
import time
from types import SimpleNamespace
from unittest.mock import patch

import av
import pytest
from pytest_homeassistant.common import MockConfigEntry

from homeassistant.components.camera_recording import watched
from homeassistant.components.camera_recording.events import ClipReason
from homeassistant.components.camera_recording.manager import RecordingManager
from homeassistant.components.camera_recording.watched import (
    WatchedKeeper,
    WatchRefused,
)
from homeassistant.core import HomeAssistant

from . import test_live_e2e
from .conftest import CAMERA
from .test_live_e2e import BUNDLED_RTSP, Rig, setup_camera

pytestmark = test_live_e2e.pytestmark
rig = test_live_e2e.rig
view_server = test_live_e2e.view_server

LINGER = 5


async def start_keeper(
    hass: HomeAssistant, entry: MockConfigEntry, rig: Rig, view_port: int
) -> AsyncIterator[WatchedKeeper]:
    """A manager and keeper for the pretend camera, wired to the real programs."""
    manager = RecordingManager(hass, entry)
    await manager.async_start()
    manager.recorders[CAMERA].no_source = True
    keeper = WatchedKeeper(hass, manager)
    await keeper.async_start()

    def source(_hass: HomeAssistant, token: str) -> str:
        return (
            f"webrtc:http://127.0.0.1:{view_port}/api/camera_recording/whep/{token}"
            "#format=whep"
        )

    rest = SimpleNamespace(_rest_client=rig.rest)
    patchers = [
        patch.object(watched, "whep_source", source),
        patch.object(watched, "LINGER_SECONDS", LINGER),
        patch.object(
            hass.config_entries,
            "async_loaded_entries",
            return_value=[SimpleNamespace(runtime_data=rest)],
        ),
    ]
    for patcher in patchers:
        patcher.start()
    try:
        yield keeper
    finally:
        await keeper.async_stop()
        await manager.async_stop()
        for patcher in patchers:
            patcher.stop()


async def viewer(stream: str) -> asyncio.subprocess.Process:
    """An ffmpeg reader of the shared go2rtc stream, standing in for a browser."""
    return await asyncio.create_subprocess_exec(
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-rtsp_transport",
        "tcp",
        "-i",
        f"rtsp://127.0.0.1:{BUNDLED_RTSP}/{stream}",
        "-f",
        "null",
        "-",
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
    )


async def leave(process: asyncio.subprocess.Process) -> None:
    """The stand-in browser closes its page."""
    process.kill()
    await process.wait()


@pytest.mark.usefixtures("no_ffmpeg")
async def test_watch_and_keep_share_one_session(
    hass: HomeAssistant,
    local_entry: MockConfigEntry,
    rig: Rig,
    view_server: int,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Two viewers and the keeper use one camera session; the clip matches the watching time."""
    camera = await setup_camera(hass, local_entry, rig)
    closed: list[str] = []
    camera.close_webrtc_session = closed.append
    caplog.set_level(logging.DEBUG)
    async for keeper in start_keeper(hass, local_entry, rig, view_server):
        opened = time.monotonic()
        watch = await keeper.async_open(CAMERA, "phone")
        assert watch.stream is not None
        first = await viewer(watch.stream)
        await asyncio.sleep(4)
        same = await keeper.async_open(CAMERA, "tablet")
        assert same is watch
        second = await viewer(watch.stream)
        await asyncio.sleep(4)
        assert camera.offers == 1
        keeper.close(CAMERA, "tablet")
        await leave(second)
        await asyncio.sleep(6)
        keeper.close(CAMERA, "phone")
        watched_for = time.monotonic() - opened
        await leave(first)

        await asyncio.sleep(LINGER - 2)
        streams = await rig.rest.streams.list()
        assert watch.stream in streams
        assert closed == []
        assert watch.task is not None
        await asyncio.wait_for(watch.task, 60)
        closed_after = time.monotonic() - opened - watched_for

        assert camera.offers == 1
        assert len(closed) == 1
        streams = await rig.rest.streams.list()
        assert not [name for name in streams if name.startswith("camera_recording_")]
        (row,) = [row for row in keeper.rows[CAMERA] if row.kind == "live_view"]
        assert row.state == "saved"
        path = keeper.folder(CAMERA) / row.name
        with av.open(str(path)) as container:
            assert container.streams.video[0].codec_context.name == "h264"
        print(  # noqa: T201
            f"E2E watched: offers {camera.offers}, watched {watched_for:.1f}s,"
            f" kept {row.duration:.2f}s, {row.size} bytes,"
            f" session closed {closed_after:.1f}s after the last viewer left"
        )
        assert abs(row.duration - watched_for) <= 3
        assert LINGER - 1 <= closed_after <= LINGER + 10
    for secret_word in ("v=0", "a=candidate", "ice-ufrag", "a=fingerprint"):
        assert secret_word not in caplog.text


@pytest.mark.usefixtures("no_ffmpeg")
async def test_refusal_waits_then_starts_again(
    hass: HomeAssistant,
    local_entry: MockConfigEntry,
    rig: Rig,
    view_server: int,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Too many requests: nothing asks again during the wait, then live video starts again."""
    camera = await setup_camera(hass, local_entry, rig)
    camera.refuse = True
    with patch(
        "homeassistant.components.camera_recording.manager.RATE_LIMIT_WAIT_SECONDS",
        (4,),
    ):
        async for keeper in start_keeper(hass, local_entry, rig, view_server):
            with pytest.raises(WatchRefused) as err:
                await keeper.async_open(CAMERA, "phone")
            assert err.value.code == ClipReason.RATE_LIMITED.value
            assert camera.offers == 1
            for _ in range(3):
                with pytest.raises(WatchRefused):
                    await keeper.async_open(CAMERA, "phone")
                await asyncio.sleep(1)
            assert camera.offers == 1
            await asyncio.sleep(2)
            camera.refuse = False
            watch = await keeper.async_open(CAMERA, "phone")
            assert camera.offers == 2
            await asyncio.sleep(3)
            keeper._end(watch)
            await asyncio.wait_for(watch.task, 60)
            reasons = [row.reason for row in keeper.rows[CAMERA]]
            assert reasons[0] == "rate_limited"
            print(f"E2E watched refusal: offers {camera.offers}")  # noqa: T201
    assert "slow down" not in caplog.text
