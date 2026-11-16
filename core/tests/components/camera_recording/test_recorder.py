"""Tests for the ffmpeg command."""

from pathlib import Path

from homeassistant.components.camera_recording.recorder import build_command


def test_command_copies_video_into_segments() -> None:
    """Video is copied as it is, files are cut on the clock and named by UTC start time."""
    command = build_command("ffmpeg", "rtsp://cam/stream", Path("/rec/front"), 300)
    assert command[:1] == ["ffmpeg"]
    assert command[command.index("-rtsp_transport") + 1] == "tcp"
    assert command[command.index("-c:v") + 1] == "copy"
    assert command[command.index("-segment_time") + 1] == "300"
    assert command[-1] == "/rec/front/%Y%m%dT%H%M%SZ.mp4"


def test_command_without_rtsp() -> None:
    """Other sources get no RTSP options."""
    command = build_command("ffmpeg", "http://cam/video.mjpg", Path("/rec/front"), 60)
    assert "-rtsp_transport" not in command
