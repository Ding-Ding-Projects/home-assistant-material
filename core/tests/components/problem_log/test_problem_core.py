"""Tests for the pure helpers of the problem log."""

import importlib.util
from pathlib import Path

_PATH = (
    Path(__file__).parents[3]
    / "homeassistant"
    / "components"
    / "problem_log"
    / "problem_core.py"
)
_SPEC = importlib.util.spec_from_file_location("problem_core_under_test", _PATH)
assert _SPEC and _SPEC.loader
core = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(core)


def _doc(**over: object) -> str:
    args = {
        "logger": "homeassistant.components.demo",
        "level": "ERROR",
        "version": "2026.11.1",
        "message": "Update failed\nsecond line",
        "traceback": "Traceback (most recent call last):\nValueError: x",
        "first_seen": "2026-11-10T10:00:00+00:00",
        "last_seen": "2026-11-10T10:00:00+00:00",
        "count": 1,
    }
    args.update(over)
    return core.render_problem(**args)


def test_filename_is_stable_and_safe() -> None:
    """The name uses the logger and a hash of the first line only."""
    a = core.problem_filename("homeassistant.components.Demo", "Timeout after 12s\nx")
    b = core.problem_filename("homeassistant.components.Demo", "Timeout after 340s\ny")
    c = core.problem_filename("homeassistant.components.Demo", "Other failure")
    assert a == b
    assert a != c
    assert a.startswith("homeassistant.components.demo-")
    assert a.endswith(".md")
    assert len(a.rsplit("-", 1)[1]) == len("12345678.md")


def test_filename_handles_odd_logger() -> None:
    """Unsafe characters never reach the file name."""
    name = core.problem_filename("../../etc/pa ss", "boom")
    assert "/" not in name
    assert " " not in name
    assert ".." not in name.replace("...", "")


def test_render_and_parse_roundtrip() -> None:
    """A rendered document can be read back."""
    parsed = core.parse_problem(_doc(count=4))
    assert parsed["count"] == 4
    assert parsed["logger"] == "homeassistant.components.demo"
    assert parsed["first_seen"] == "2026-11-10T10:00:00+00:00"
    assert "ValueError" in parsed["body"]


def test_parse_rejects_other_text() -> None:
    """Text that is not a problem document is ignored."""
    assert core.parse_problem("hello") is None
    assert core.parse_problem("# Title\n\nnothing") is None


def test_merge_counts_and_keeps_first_seen() -> None:
    """Another sighting raises the count and the last seen only."""
    first = core.merge_problem(
        None,
        logger="l",
        level="ERROR",
        version="1",
        message="m",
        traceback="",
        seen_at="2026-01-01T00:00:00+00:00",
    )
    second = core.merge_problem(
        first,
        logger="l",
        level="ERROR",
        version="2",
        message="m",
        traceback="",
        seen_at="2026-01-02T00:00:00+00:00",
        occurrences=3,
    )
    parsed = core.parse_problem(second)
    assert parsed["count"] == 4
    assert parsed["first_seen"] == "2026-01-01T00:00:00+00:00"
    assert parsed["last_seen"] == "2026-01-02T00:00:00+00:00"
    assert parsed["version"] == "2"


def test_redaction_removes_confidential_values() -> None:
    """Tokens, passwords, emails and credentials in URLs are removed."""
    text = (
        "GET https://user:hunter2@example.com/x failed "
        "Authorization: Bearer abcdef123456 password=hunter2 api_key: 'AbC123xyz' "
        "mail me at a.b@example.org "
        "hex 0123456789abcdef0123456789abcdef "
        "b64 QWxhZGRpbjpvcGVuIHNlc2FtZVRoaXNJc0xvbmc1MjM0NTY3ODkw"
    )
    out = core.redact(text)
    for leaked in (
        "hunter2",
        "abcdef123456",
        "AbC123xyz",
        "a.b@example.org",
        "0123456789abcdef0123456789abcdef",
        "QWxhZGRpbjpvcGVuIHNlc2FtZVRoaXNJc0xvbmc1MjM0NTY3ODkw",
    ):
        assert leaked not in out
    assert "[removed]" in out
    assert "example.com/x" in out


def test_redaction_keeps_ordinary_text() -> None:
    """Paths and plain sentences stay readable."""
    text = "Error in /usr/src/homeassistant/homeassistant/components/demo/sensor.py line 5"
    assert core.redact(text) == text


def test_redaction_removes_secret_values() -> None:
    """Exact values from secrets.yaml are removed wherever they appear."""
    out = core.redact("host is my-private-host.lan now", secrets=["my-private-host.lan"])
    assert "my-private-host" not in out


def test_rendered_document_is_redacted() -> None:
    """Redaction happens before anything is written."""
    doc = _doc(message="login with token=abc123456789 failed")
    assert "abc123456789" not in doc


def test_prune_removes_oldest_first() -> None:
    """The oldest last seen are removed to reach the limit."""
    entries = [("c.md", "2026-03"), ("a.md", "2026-01"), ("b.md", "2026-02")]
    assert core.files_to_prune(entries, 3) == []
    assert core.files_to_prune(entries, 2) == ["a.md"]
    assert core.files_to_prune(entries, 1) == ["a.md", "b.md"]


def test_commit_message() -> None:
    """The commit message is plain."""
    assert core.commit_message(1) == "Record 1 problem"
    assert core.commit_message(3) == "Record 3 problems"
