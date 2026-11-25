"""Tests for the ffmpeg command and the recorder's logging."""

import logging
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from homeassistant.components.camera_recording.recorder import (
    CameraRecorder,
    RecorderState,
    build_command,
)
from homeassistant.core import HomeAssistant

from .conftest import CAMERA

RTSPS = "rtsps://bblp:12345678@192.168.1.50:322/streaming/live/1"


def test_command_copies_video_into_segments() -> None:
    """Video is copied as it is, files are cut on the clock and named by UTC start time."""
    command = build_command("ffmpeg", "rtsp://cam/stream", Path("/rec/front"), 300)
    assert command[:1] == ["ffmpeg"]
    assert command[command.index("-rtsp_transport") + 1] == "tcp"
    assert command[command.index("-timeout") + 1] == "15000000"
    assert command[command.index("-loglevel") + 1] == "warning"
    assert command[command.index("-c:v") + 1] == "copy"
    assert command[command.index("-segment_time") + 1] == "300"
    assert command[-1] == "/rec/front/%Y%m%dT%H%M%SZ.mp4"


def test_command_without_rtsp() -> None:
    """Other sources get no RTSP options."""
    command = build_command("ffmpeg", "http://cam/video.mjpg", Path("/rec/front"), 60)
    assert "-rtsp_transport" not in command
    assert "-timeout" not in command


def test_command_honours_stream_options() -> None:
    """The camera's own transport and wall clock timestamps reach ffmpeg."""
    command = build_command(
        "ffmpeg",
        RTSPS,
        Path("/rec/front"),
        300,
        {"use_wallclock_as_timestamps": True, "rtsp_transport": "udp"},
    )
    assert command[command.index("-rtsp_transport") + 1] == "udp"
    flag = command.index("-use_wallclock_as_timestamps")
    assert command[flag + 1] == "1"
    assert flag < command.index("-i")
    assert command[command.index("-tls_verify") + 1] == "0"


def test_command_without_wallclock_option() -> None:
    """Timestamps are left alone unless the camera asks for the wall clock."""
    command = build_command("ffmpeg", RTSPS, Path("/rec/front"), 300, {})
    assert "-use_wallclock_as_timestamps" not in command


def make_recorder(hass: HomeAssistant, tmp_path: Path) -> CameraRecorder:
    """A recorder that has not been started."""
    return CameraRecorder(hass, CAMERA, tmp_path, 300, lambda: None, "memory")


async def test_no_stream_is_logged_once_with_the_reason(
    hass: HomeAssistant, tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    """A camera without a stream address says why, once, however often it is retried."""
    hass.states.async_set(CAMERA, "unavailable")
    recorder = make_recorder(hass, tmp_path)
    with (
        caplog.at_level(logging.INFO),
        patch(
            "homeassistant.components.camera_recording.recorder.async_get_stream_source",
            return_value=None,
        ),
    ):
        first = await recorder._attempt()
        second = await recorder._attempt()
    assert first == 60
    assert second == 120
    warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert len(warnings) == 1
    text = warnings[0].getMessage()
    assert CAMERA in text
    assert "the camera is unavailable" in text
    assert "memory" in text
    assert "retry in 60 s" in text
    assert recorder.state is RecorderState.NO_STREAM


class FakeStderr:
    """Lines ffmpeg wrote, readable with async for."""

    def __init__(self, lines: list[str]) -> None:
        """Keep the lines."""
        self._lines = [f"{line}\n".encode() for line in lines]

    def __aiter__(self) -> "FakeStderr":
        """Iterate from the start."""
        return self

    async def __anext__(self) -> bytes:
        """The next line."""
        if not self._lines:
            raise StopAsyncIteration
        return self._lines.pop(0)


class FakeProcess:
    """An ffmpeg process that exits at once."""

    returncode: int | None = None

    def __init__(self, lines: list[str], code: int) -> None:
        """Set up the output and the exit code."""
        self.stderr = FakeStderr(lines)
        self._code = code

    async def wait(self) -> int:
        """Exit."""
        self.returncode = self._code
        return self._code


async def test_ffmpeg_exit_logs_code_and_masked_output(
    hass: HomeAssistant, tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    """The exit code and the last output lines are logged without the stream password."""
    hass.states.async_set(CAMERA, "idle")
    recorder = make_recorder(hass, tmp_path)
    lines = [f"noise {i}" for i in range(30)] + [
        f"[rtsp @ 0x1] method DESCRIBE failed: 401 for {RTSPS}",
        f"{RTSPS}: Server returned 401 Unauthorized",
    ]
    commands: list[tuple[str, ...]] = []

    async def fake_exec(*command: str, **kwargs: object) -> FakeProcess:
        commands.append(command)
        return FakeProcess(lines, 1)

    with (
        caplog.at_level(logging.INFO),
        patch(
            "homeassistant.components.camera_recording.recorder.async_get_stream_source",
            return_value=RTSPS,
        ),
        patch(
            "homeassistant.components.camera_recording.recorder.get_ffmpeg_manager",
            return_value=MagicMock(binary="ffmpeg"),
        ),
        patch(
            "homeassistant.components.camera_recording.recorder.asyncio.create_subprocess_exec",
            fake_exec,
        ),
    ):
        delay = await recorder._attempt()
    assert delay == 2
    assert commands
    text = caplog.text
    assert "ffmpeg exited with code 1" in text
    assert "Server returned 401 Unauthorized" in text
    assert "noise 29" in text
    assert "noise 11" not in text  # only the last 20 lines are kept
    assert "12345678" not in text
    assert "bblp" not in text
    assert "12345678" not in str(recorder.last_error)
    assert len(recorder.stderr_tail) == 20
    assert recorder.last_exit_code == 1


async def test_unexpected_error_is_logged_and_retried(
    hass: HomeAssistant, tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    """An error that is not a Home Assistant error no longer kills the recorder silently."""
    recorder = make_recorder(hass, tmp_path)

    async def explode(*args: object) -> str | None:
        raise ValueError("resolver failed")

    async def stop_after_wait(seconds: float) -> None:
        recorder._stopping = True

    with (
        caplog.at_level(logging.INFO),
        patch(
            "homeassistant.components.camera_recording.recorder.async_get_stream_source",
            explode,
        ),
        patch.object(recorder, "_wait", side_effect=stop_after_wait) as wait,
    ):
        await recorder._run()
    wait.assert_called_once_with(2)
    assert "unexpected ValueError: resolver failed" in caplog.text
