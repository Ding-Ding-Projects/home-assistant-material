"""Tests for credential masking and de-duplicated problem logging."""

import logging

import pytest

from homeassistant.components.camera_recording.problem_log import (
    REPEAT_SECONDS,
    ProblemLog,
    mask_secrets,
    source_summary,
)

RTSPS = "rtsps://bblp:12345678@192.168.1.50:322/streaming/live/1"


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        (RTSPS, "rtsps://***@192.168.1.50:322/streaming/live/1"),
        (
            f"Input #0, rtsp, from '{RTSPS}':",
            "Input #0, rtsp, from 'rtsps://***@192.168.1.50:322/streaming/live/1':",
        ),
        (
            "http://cam/video?token=abc123&channel=1&api_key=zzz",
            "http://cam/video?token=***&channel=1&api_key=***",
        ),
        (
            "rtsp://user@cam:554/s?password=hunter2#frag",
            "rtsp://***@cam:554/s?password=***#frag",
        ),
        ("rtsp://cam/stream", "rtsp://cam/stream"),
        ("Connection refused", "Connection refused"),
    ],
)
def test_mask_secrets(text: str, expected: str) -> None:
    """User info and secret query values are hidden, everything else stays."""
    assert mask_secrets(text) == expected


def test_source_summary_has_scheme_and_host_only() -> None:
    """The summary never carries a user, a path or a query."""
    assert source_summary(RTSPS) == "rtsps://192.168.1.50:322"
    assert "12345678" not in source_summary(RTSPS)


def test_problem_is_logged_once_then_repeated_rarely(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """A repeating problem is quiet until the repeat time, then logs the attempt count."""
    problems = ProblemLog(logging.getLogger("test_problem_log"), "Recording camera.x")
    with caplog.at_level(logging.INFO, logger="test_problem_log"):
        assert problems.failed("ffmpeg exited with code 1", now=0, suffix=" [retry 2 s]")
        assert not problems.failed("ffmpeg exited with code 1", now=5)
        assert not problems.failed("ffmpeg exited with code 1", now=REPEAT_SECONDS - 1)
        assert problems.failed("ffmpeg exited with code 1", now=REPEAT_SECONDS)
        assert problems.failed("a different problem", now=REPEAT_SECONDS + 1)
        assert problems.recovered()
        assert not problems.recovered()
    lines = [record.getMessage() for record in caplog.records]
    assert lines == [
        "Recording camera.x: ffmpeg exited with code 1 [retry 2 s]",
        "Recording camera.x: still failing after 4 attempts: ffmpeg exited with code 1",
        "Recording camera.x: a different problem",
        "Recording camera.x resumed after 5 attempts",
    ]
    assert caplog.records[-1].levelno == logging.INFO


def test_problem_log_masks_credentials(caplog: pytest.LogCaptureFixture) -> None:
    """A message that echoes a stream address is masked before it is written."""
    problems = ProblemLog(logging.getLogger("test_problem_log"), "Recording camera.x")
    with caplog.at_level(logging.INFO, logger="test_problem_log"):
        problems.failed(f"Connection to {RTSPS} failed", now=0)
    assert "12345678" not in caplog.text
    assert "bblp" not in caplog.text
