"""Tests for the files a send writes and for the one-send-an-hour rule."""

from datetime import UTC, datetime, timedelta
import json

import pytest

from homeassistant.components.problem_log.send_files import (
    STATUS_HELD,
    STATUS_NOT_SENT,
    STATUS_SENT,
    Problem,
    SystemInfo,
    build_files,
    counts,
    integration_of,
    may_send,
    next_allowed,
    parse_repository,
    status_of,
)

SYSTEM = SystemInfo(
    "2026.11.1.525", "3.14.0", "unknown", "Linux", "x86_64", ["zha", "camera"]
)


def _problem(file: str, last_seen: str, count: int = 1) -> Problem:
    return Problem(
        file=file,
        title=f"Title of {file}",
        logger="homeassistant.components.camera_recording.clip",
        level="ERROR",
        version="2026.11.1.525",
        first_seen="2026-11-17T09:00:00+00:00",
        last_seen=last_seen,
        count=count,
        detail="## Message\n\nNo clip kept",
    )


OLD = _problem("old.md", "2026-11-17T10:00:00+00:00")
NEW = _problem("new.md", "2026-11-18T18:52:00+00:00", count=4)
HELD = _problem("held.md", "2026-11-18T17:04:00+00:00")


def test_files_and_order() -> None:
    """Every promised file is written, newest first, held problems left out."""
    files = build_files([OLD, NEW, HELD], {"held.md"}, SYSTEM, UTC)
    assert set(files) == {
        "README.md",
        "latest.md",
        "problems/2026-11-17.md",
        "problems/2026-11-18.md",
        "problems/index.json",
        "system.md",
    }
    latest = files["latest.md"]
    assert latest.index("Title of new.md") < latest.index("Title of old.md")
    assert "held.md" not in "".join(files.values())
    index = json.loads(files["problems/index.json"])
    assert [p["id"] for p in index["problems"]] == ["new", "old"]
    assert index["problems"][0]["integration"] == "camera_recording"
    assert "seen 4 times" in latest
    assert "- camera\n- zha" in files["system.md"]


def test_statuses_and_counts() -> None:
    """A problem is sent until its count grows; a held one stays held."""
    sent = {"old.md": 1, "new.md": 3}
    assert status_of(OLD, sent, set()) == STATUS_SENT
    assert status_of(NEW, sent, set()) == STATUS_NOT_SENT
    assert status_of(OLD, sent, {"old.md"}) == STATUS_HELD
    assert counts([OLD, NEW, HELD], sent, {"held.md"}) == {
        "all": 3,
        STATUS_SENT: 1,
        STATUS_NOT_SENT: 1,
        STATUS_HELD: 1,
    }


def test_one_send_an_hour() -> None:
    """The next send waits an hour after the last, and longer when backed off."""
    last = datetime(2026, 11, 18, 18, 41, tzinfo=UTC)
    assert next_allowed(None, None) is None
    assert may_send(last, None, None)
    assert next_allowed(last, None) == last + timedelta(hours=1)
    assert not may_send(last + timedelta(minutes=59), last, None)
    assert may_send(last + timedelta(hours=1), last, None)
    later = last + timedelta(hours=3)
    assert next_allowed(last, later) == later
    assert not may_send(last + timedelta(hours=2), last, later)


@pytest.mark.parametrize(
    ("address", "expected"),
    [
        (
            "https://github.com/your-account/home-problem-log",
            ("your-account", "home-problem-log"),
        ),
        ("github.com/a/b.git", ("a", "b")),
        ("a/b/", ("a", "b")),
        ("https://gitlab.com/a/b", None),
        ("https://user:pw@github.com/a/b", None),
        ("a/b/c", None),
        ("a/..", None),
        ("a b/c", None),
    ],
)
def test_parse_repository(address: str, expected: tuple[str, str] | None) -> None:
    """Only a GitHub owner and name are accepted."""
    assert parse_repository(address) == expected


def test_integration_of() -> None:
    """The integration is read from the logger name."""
    assert integration_of("homeassistant.components.tuya.light") == "tuya"
    assert integration_of("custom_components.foo") == "foo"
    assert integration_of("homeassistant.core") == "core"
