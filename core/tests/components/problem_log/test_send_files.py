"""Tests for the files a send writes and for the one-send-an-hour rule."""

from datetime import UTC, datetime, timedelta
import json

import pytest

from homeassistant.components.problem_log.send_files import (
    STATUS_HELD,
    STATUS_NOT_SENT,
    STATUS_SENT,
    README,
    README_MARKER,
    Problem,
    SystemInfo,
    build_files,
    commit_message,
    counts,
    integration_of,
    is_problem_log_readme,
    may_send,
    next_allowed,
    parse_repository,
    status_of,
    valid_repository_name,
)
from homeassistant.components.problem_log.send_wording import (
    WordingRefused,
    build_replacer,
    check_entries,
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

def test_files_in_their_own_folder() -> None:
    """In a repository with other files, every path gets the folder in front."""
    files = build_files([NEW], set(), SYSTEM, UTC, folder="problem-log/")
    assert set(files) == {
        "problem-log/README.md",
        "problem-log/latest.md",
        "problem-log/problems/2026-11-18.md",
        "problem-log/problems/index.json",
        "problem-log/system.md",
    }


def test_readme_carries_the_marker() -> None:
    """A later send can tell its own README, including one from before the marker."""
    readme = build_files([NEW], set(), SYSTEM, UTC)["README.md"]
    assert readme.startswith(README_MARKER)
    assert is_problem_log_readme(readme)
    assert is_problem_log_readme(README)
    assert not is_problem_log_readme("# My notes\n\nShopping and plans.\n")


@pytest.mark.parametrize(
    ("name", "valid"),
    [
        ("home-problem-log", True),
        ("a.b_c-1", True),
        ("x" * 100, True),
        ("x" * 101, False),
        ("", False),
        ("..", False),
        ("has space", False),
        ("slash/name", False),
        ("name.git", False),
    ],
)
def test_valid_repository_name(name: str, valid: bool) -> None:
    """Only names GitHub accepts are offered for a new repository."""
    assert valid_repository_name(name) is valid


WORDING = {"problems": "troubles", "Logger": "Source", "seen once": "met once"}
LOGGED = Problem(
    file="queue.md",
    title="3 problems in queue for Logger",
    logger="homeassistant.components.problems_watch",
    level="ERROR",
    version="2026.11.1.525",
    first_seen="2026-11-18T09:00:00+00:00",
    last_seen="2026-11-18T10:00:00+00:00",
    count=1,
    detail="## Message\n\nproblems: 3\n\n```\nproblems = []\n```",
)


def test_wording_changes_only_generated_prose() -> None:
    """Headings and labels take the owner's wording; log lines stay exact."""
    words = build_replacer(check_entries(WORDING))
    files = build_files([LOGGED], set(), SYSTEM, UTC, words=words)
    latest = files["latest.md"]
    assert latest.startswith("# Latest troubles\n")
    assert "- Source: homeassistant.components.problems_watch" in latest
    assert "met once" in latest
    # The log's own text, its logger name and its fenced detail are unchanged.
    assert "3 problems in queue for Logger" in latest
    assert "problems: 3" in latest
    assert "problems = []" in latest
    assert "Troubles last seen on" in files["problems/2026-11-18.md"]
    index = json.loads(files["problems/index.json"])
    assert index["problems"][0]["title"] == "3 problems in queue for Logger"
    assert "troubles" not in json.dumps(index)
    # The mapping is never written out as a list.
    assert "met once" not in files["README.md"]
    assert "seen once" not in "".join(files.values()).replace("met once", "")
    message = commit_message(2, datetime(2026, 11, 18, 19, 0, tzinfo=UTC), words)
    assert message == "Problem log: 2 troubles, sent 2026-11-18 19:00"


@pytest.mark.parametrize(
    ("entries", "code"),
    [
        pytest.param({}, "bad_entries", id="empty"),
        pytest.param({"a": 1}, "bad_value", id="not_text"),
        pytest.param({" ": "x"}, "bad_key", id="blank_key"),
        pytest.param({"k" * 161: "x"}, "bad_key", id="long_key"),
        pytest.param({"a": "v" * 1001}, "bad_value", id="long_value"),
        pytest.param({"a": "line\nbreak"}, "control_character", id="control"),
        pytest.param({"__proto__": "x"}, "unsafe_key", id="unsafe"),
        pytest.param(
            {f"key{i}": "v" * 900 for i in range(300)}, "too_large", id="too_large"
        ),
    ],
)
def test_wording_is_checked_like_the_browser(entries: object, code: str) -> None:
    """The server checks the wording again, with the browser's limits."""
    with pytest.raises(WordingRefused) as err:
        check_entries(entries)
    assert err.value.code == code
