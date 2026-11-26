"""Tests for a running recorder: the watchdog, restarts and what is logged."""

import asyncio
from collections.abc import Iterator
import logging
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from homeassistant.components.camera_recording import recorder as recorder_module
from homeassistant.components.camera_recording.recorder import (
    CameraRecorder,
    RecorderState,
    build_command,
)
from homeassistant.core import HomeAssistant

from .conftest import CAMERA
from .test_recorder import RTSPS, FakeProcess, make_recorder

SEGMENT = "20261125T000000Z.mp4"
EVENT_CLIP = "20261125T000100Z-event.mp4"
LIVE_CLIP = "20261125T000200Z-123-live.mp4"
PATCH = "homeassistant.components.camera_recording.recorder"


class LiveProcess:
    """An ffmpeg process that keeps running until it is finished or killed."""

    def __init__(self) -> None:
        """Start alive."""
        self.returncode: int | None = None
        self.killed = False
        self.stderr = self
        self._done = asyncio.Event()

    def __aiter__(self) -> "LiveProcess":
        """Iterate until the process ends."""
        return self

    async def __anext__(self) -> bytes:
        """No output, then the end."""
        await self._done.wait()
        raise StopAsyncIteration

    async def wait(self) -> int:
        """Wait for the end."""
        await self._done.wait()
        assert self.returncode is not None
        return self.returncode

    def finish(self, code: int) -> None:
        """End with an exit code."""
        self.returncode = code
        self._done.set()

    def kill(self) -> None:
        """End as if killed."""
        self.killed = True
        self.finish(-9)

    def send_signal(self, _signal: int) -> None:
        """Interrupt."""
        self.finish(0)


@pytest.fixture
def fast_watchdog(monkeypatch: pytest.MonkeyPatch) -> None:
    """Make the watchdog quick."""
    monkeypatch.setattr(recorder_module, "WATCHDOG_INTERVAL_SECONDS", 0.01)
    monkeypatch.setattr(recorder_module, "FIRST_FILE_SECONDS", 0.1)
    monkeypatch.setattr(recorder_module, "STALL_SECONDS", 0.1)


@pytest.fixture(name="stream")
def stream_fixture() -> Iterator[None]:
    """A camera that gives an RTSPS address, and a fake ffmpeg binary."""
    with (
        patch(f"{PATCH}.async_get_stream_source", return_value=RTSPS),
        patch(
            f"{PATCH}.get_ffmpeg_manager",
            return_value=MagicMock(binary="ffmpeg"),
        ),
    ):
        yield


def spawn(*processes: LiveProcess | FakeProcess):
    """Patch process creation to hand out the given processes in turn."""
    remaining = list(processes)

    async def fake_exec(*command: str, **kwargs: object) -> LiveProcess | FakeProcess:
        return remaining.pop(0)

    return patch(f"{PATCH}.asyncio.create_subprocess_exec", fake_exec)


async def wait_for(condition) -> None:
    """Wait for something that a background task does."""
    async with asyncio.timeout(5):
        while not condition():
            await asyncio.sleep(0.01)


@pytest.mark.parametrize(
    ("source", "options", "expected"),
    [
        ("rtsps://cam/s", {"verify_ssl": True}, "1"),
        ("rtsps://cam/s", {"verify_ssl": False}, "0"),
        ("rtsps://cam/s", {}, "0"),
        ("https://cam/video", {"verify_ssl": True}, "1"),
        ("https://cam/video", {}, "0"),
    ],
)
def test_tls_verify_follows_the_camera(
    source: str, options: dict[str, bool], expected: str
) -> None:
    """Encrypted sources are verified exactly as the camera's stream options say."""
    command = build_command("ffmpeg", source, Path("/rec"), 300, options)
    assert command[command.index("-tls_verify") + 1] == expected


@pytest.mark.parametrize("source", ["rtsp://cam/s", "http://cam/video"])
def test_plain_sources_get_no_tls_option(source: str) -> None:
    """An option that nothing consumes is not passed."""
    assert "-tls_verify" not in build_command("ffmpeg", source, Path("/rec"), 300)


def test_http_sources_get_an_io_timeout() -> None:
    """A hung web stream is given up on."""
    command = build_command("ffmpeg", "http://cam/video", Path("/rec"), 300)
    assert command[command.index("-rw_timeout") + 1] == "15000000"


@pytest.mark.usefixtures("stream")
async def test_same_failure_with_new_addresses_logs_once(
    hass: HomeAssistant, tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    """Process addresses and counters in ffmpeg's last line do not make a new problem."""
    hass.states.async_set(CAMERA, "idle")
    recorder = make_recorder(hass, tmp_path)
    first = FakeProcess(["[out#0/segment @ 0x7a05cc1357c0] missed 12 packets"], 1)
    second = FakeProcess(["[out#0/segment @ 0x79a5ffd7d7c0] missed 31 packets"], 1)
    with caplog.at_level(logging.INFO), spawn(first, second):
        await recorder._attempt()
        await recorder._attempt()
    warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert len(warnings) == 1
    assert "missed 12 packets" in warnings[0].getMessage()


@pytest.mark.usefixtures("stream", "fast_watchdog")
async def test_connected_but_silent_run_is_cut(
    hass: HomeAssistant, tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    """Event and live clips in the folder do not make a silent ffmpeg look healthy."""
    hass.states.async_set(CAMERA, "idle")
    recorder = make_recorder(hass, tmp_path)
    (tmp_path / EVENT_CLIP).write_bytes(b"x")
    (tmp_path / LIVE_CLIP).write_bytes(b"x")
    process = LiveProcess()
    with caplog.at_level(logging.INFO), spawn(process):
        delay = await recorder._attempt()
    assert process.killed
    assert delay == 2
    assert recorder.state is RecorderState.RECONNECTING
    text = caplog.text
    assert "no video was written" in text
    assert "rtsps://203.0.113.50:322" in text
    assert "12345678" not in text
    assert "resumed" not in text


@pytest.mark.usefixtures("stream", "fast_watchdog")
async def test_new_segment_means_recording_but_backoff_is_kept(
    hass: HomeAssistant, tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    """A run that writes a file and soon dies still escalates the retry delay."""
    hass.states.async_set(CAMERA, "idle")
    recorder = make_recorder(hass, tmp_path)
    process = LiveProcess()
    with caplog.at_level(logging.INFO), spawn(process):
        task = asyncio.create_task(recorder._attempt())
        await wait_for(lambda: recorder.state is RecorderState.STARTING)
        (tmp_path / SEGMENT).write_bytes(b"x")
        await wait_for(lambda: recorder.state is RecorderState.RECORDING)
        process.finish(1)
        delay = await task
    assert not process.killed
    assert delay == 2
    assert recorder._failures == 1
    assert recorder.problems.active
    assert "resumed" not in caplog.text


@pytest.mark.usefixtures("stream", "fast_watchdog")
async def test_stable_run_clears_the_problem(
    hass: HomeAssistant,
    tmp_path: Path,
    caplog: pytest.LogCaptureFixture,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Only a run that has stayed up is a recovery, and it is logged once."""
    monkeypatch.setattr(recorder_module, "STABLE_RUN_SECONDS", 0.05)
    hass.states.async_set(CAMERA, "idle")
    recorder = make_recorder(hass, tmp_path)
    recorder.problems.failed("it was down")
    recorder._failures = 3
    process = LiveProcess()
    with caplog.at_level(logging.INFO), spawn(process):
        task = asyncio.create_task(recorder._attempt())
        await wait_for(lambda: recorder.state is RecorderState.STARTING)
        (tmp_path / SEGMENT).write_bytes(b"x")
        await wait_for(lambda: not recorder.problems.active)
        process.finish(0)
        await task
    assert "Recording camera.front_door resumed after 1 attempts" in caplog.text


@pytest.mark.usefixtures("stream", "fast_watchdog")
async def test_stalled_run_is_cut(
    hass: HomeAssistant, tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    """A run whose file stops growing is cut with a reason."""
    hass.states.async_set(CAMERA, "idle")
    recorder = make_recorder(hass, tmp_path)
    process = LiveProcess()
    with caplog.at_level(logging.INFO), spawn(process):
        task = asyncio.create_task(recorder._attempt())
        await wait_for(lambda: recorder.state is RecorderState.STARTING)
        (tmp_path / SEGMENT).write_bytes(b"x")
        await task
    assert process.killed
    assert "no new video was written" in caplog.text


@pytest.mark.usefixtures("stream")
async def test_error_after_spawn_does_not_leave_ffmpeg_running(
    hass: HomeAssistant, tmp_path: Path
) -> None:
    """If anything fails once ffmpeg is running, that process is ended first."""
    hass.states.async_set(CAMERA, "idle")
    recorder = make_recorder(hass, tmp_path)
    process = LiveProcess()
    with (
        spawn(process),
        patch.object(recorder, "_set", side_effect=RuntimeError("listener failed")),
        pytest.raises(RuntimeError),
    ):
        await recorder._attempt()
    assert process.killed
    assert recorder._process is None


@pytest.mark.usefixtures("stream")
async def test_secret_in_unexpected_error_is_not_logged(
    hass: HomeAssistant, tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    """A credential that an error echoes is hidden, debug logging included."""
    hass.states.async_set(CAMERA, "idle")
    recorder = make_recorder(hass, tmp_path)
    recorder._source = "rtsp://admin:pa/ss@203.0.113.7/stream"
    recorder.source_text = "rtsp://203.0.113.7"

    async def explode() -> float | None:
        raise ValueError(f"cannot open {recorder._source}?x")

    async def stop(seconds: float) -> None:
        recorder._stopping = True

    with (
        caplog.at_level(logging.DEBUG),
        patch.object(recorder, "_attempt", explode),
        patch.object(recorder, "_wait", side_effect=stop),
    ):
        await recorder._run()
    assert "unexpected ValueError" in caplog.text
    assert "pa/ss" not in caplog.text
    assert "admin" not in caplog.text


async def test_provider_only_camera_is_not_a_warning(
    hass: HomeAssistant, tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    """A camera that never gives a stream address says so once, at INFO."""
    hass.states.async_set(CAMERA, "idle")
    recorder: CameraRecorder = make_recorder(hass, tmp_path)
    with (
        caplog.at_level(logging.INFO),
        patch(f"{PATCH}.async_get_stream_source", return_value=None),
    ):
        await recorder._attempt()
        await recorder._attempt()
    assert not [r for r in caplog.records if r.levelno >= logging.WARNING]
    notes = [r for r in caplog.records if "nothing to record" in r.getMessage()]
    assert len(notes) == 1
    assert recorder.state is RecorderState.NO_STREAM
