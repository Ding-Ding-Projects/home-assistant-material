"""Tests for credential masking and de-duplicated problem logging."""

import logging

import pytest

from homeassistant.components.camera_recording.problem_log import (
    REPEAT_SECONDS,
    ProblemLog,
    mask_secrets,
    source_summary,
)

RTSPS = "rtsps://bblp:12345678@203.0.113.50:322/streaming/live/1"


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        (RTSPS, "rtsps://***@203.0.113.50:322/streaming/live/1"),
        (
            f"Input #0, rtsp, from '{RTSPS}':",
            "Input #0, rtsp, from 'rtsps://***@203.0.113.50:322/streaming/live/1':",
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
    assert source_summary(RTSPS) == "rtsps://203.0.113.50:322"
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


@pytest.mark.parametrize(
    ("text", "secrets"),
    [
        ("rtsp://admin:pa/ss@203.0.113.7/stream: Invalid argument", ["pa/ss", "admin"]),
        ("rtsp://admin:pa'ss@203.0.113.7/stream: Invalid", ["pa'ss", "admin"]),
        ("rtsp://admin:P@ss/w0rd@203.0.113.7/stream", ["P@ss", "w0rd", "admin"]),
        (
            "rtsp://203.0.113.7:554/user=admin_password=S3cret_channel=1_stream=0.sdp?real_stream",
            ["S3cret", "admin"],
        ),
        ("rtsp://cam/user=admin&password=S3cret&channel=1", ["S3cret", "admin"]),
        ("rtsps://cam:7441/x?hdnts=exp=1~hmac=zz&channel=1", ["hmac=zz"]),
    ],
)
def test_mask_secrets_in_odd_addresses(text: str, secrets: list[str]) -> None:
    """Passwords with slashes, quotes or at signs, and secrets in paths, are hidden."""
    masked = mask_secrets(text)
    for secret in secrets:
        assert secret not in masked


@pytest.mark.parametrize(
    "source",
    [
        "rtsp://admin:pa/ss@203.0.113.7/stream",
        "rtsp://admin:P@ss/w0rd@203.0.113.7/stream",
    ],
)
def test_source_summary_survives_odd_passwords(source: str) -> None:
    """The host is taken after the last at sign, so no part of the login is shown."""
    assert source_summary(source) == "rtsp://203.0.113.7"


def test_detail_is_written_once_and_repeats_get_rarer(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Extra lines come with a new problem only, and reminders become less frequent."""
    problems = ProblemLog(logging.getLogger("test_problem_log"), "Recording camera.x")
    with caplog.at_level(logging.INFO, logger="test_problem_log"):
        problems.failed("down", now=0, detail="    ffmpeg: line")
        problems.failed("down", now=REPEAT_SECONDS, detail="    ffmpeg: line")
        assert not problems.failed("down", now=REPEAT_SECONDS * 2)
        assert problems.failed("down", now=REPEAT_SECONDS + 3600)
    lines = [record.getMessage() for record in caplog.records]
    assert lines[0] == "Recording camera.x: down\n    ffmpeg: line"
    assert "ffmpeg: line" not in lines[1]
    assert len(lines) == 3


def test_key_decides_what_is_the_same_problem(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Messages with the same key are one problem, and a process address is ignored."""
    problems = ProblemLog(logging.getLogger("test_problem_log"), "Recording camera.x")
    with caplog.at_level(logging.INFO, logger="test_problem_log"):
        assert problems.failed("[a @ 0x1] stopped", now=0)
        assert not problems.failed("[a @ 0x2] stopped", now=1)
        assert problems.failed("x", now=2, key="one")
        assert not problems.failed("y", now=3, key="one")
