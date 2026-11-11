"""Tests for the pure helpers of the activity record."""

import json
from pathlib import Path

import pytest

from homeassistant.components.activity_record.record_core import (
    KIND_DROPPED,
    KIND_LOGBOOK,
    KIND_STATE,
    commit_message,
    count_lines,
    day_of,
    day_path,
    dropped_entry,
    entry_from_logbook,
    iter_lines,
    iter_lines_reversed,
    mask_entry,
    matches,
    parse_line,
    serialize,
    valid_day,
)

WHEN = 1_794_394_800.5  # 2026-11-11T11:00:00.5+00:00


def _state_entry() -> dict:
    return entry_from_logbook(
        {
            "when": WHEN,
            "state": "on",
            "entity_id": "light.kitchen",
            "name": "Kitchen",
            "context_user_id": None,
            "context_entity_id": "switch.wall",
        },
        context_id="C1",
        parent_id="P1",
        user_id="U1",
    )


def test_state_entry_has_the_fields_the_page_shows() -> None:
    """A state change keeps time, name, state, entity and who caused it."""
    entry = _state_entry()
    assert entry["when"].endswith("+00:00")
    assert entry["kind"] == KIND_STATE
    assert entry["name"] == "Kitchen"
    assert entry["state"] == "on"
    assert entry["entity_id"] == "light.kitchen"
    assert entry["context_entity_id"] == "switch.wall"
    assert entry["context_id"] == "C1"
    assert entry["context_parent_id"] == "P1"
    assert entry["context_user_id"] == "U1"


def test_message_entry_is_a_logbook_entry() -> None:
    """An entry with a message is not a state change."""
    entry = entry_from_logbook(
        {"when": WHEN, "name": "Door", "message": "was opened", "domain": "x"},
        context_id=None,
        parent_id=None,
        user_id=None,
    )
    assert entry["kind"] == KIND_LOGBOOK
    assert entry["message"] == "was opened"


def test_user_from_logbook_wins_over_context() -> None:
    """The logbook may have found the user through a parent context."""
    entry = entry_from_logbook(
        {"when": WHEN, "state": "on", "context_user_id": "FROM_PARENT"},
        context_id="C",
        parent_id=None,
        user_id=None,
    )
    assert entry["context_user_id"] == "FROM_PARENT"


def test_long_text_is_cut() -> None:
    """One field never makes a line larger than the limit."""
    entry = entry_from_logbook(
        {"when": WHEN, "message": "x" * 100_000},
        context_id=None,
        parent_id=None,
        user_id=None,
    )
    assert len(entry["message"]) == 2000


def test_mask_removes_secret_looking_values_and_keeps_ids() -> None:
    """Secrets are masked in text fields; identifiers are untouched."""
    entry = _state_entry()
    entry["message"] = "token=abcdef123456 sent, key hunter2hunter2 used"
    entry["context_id"] = "01JABCDEFGHJKMNPQRSTVWXYZ0"
    masked = mask_entry(entry, ["hunter2hunter2"])
    assert "abcdef123456" not in masked["message"]
    assert "hunter2hunter2" not in masked["message"]
    assert masked["context_id"] == entry["context_id"]
    assert masked["entity_id"] == "light.kitchen"
    assert entry["message"].startswith("token=abcdef")


def test_serialize_is_one_line_and_round_trips() -> None:
    """A line holds one entry, ends in a newline and reads back."""
    entry = _state_entry()
    entry["message"] = "line one\nline two   é"
    line = serialize(entry)
    assert line.endswith(b"\n")
    assert line.count(b"\n") == 1
    assert parse_line(line) == entry


def test_serialize_survives_lone_surrogates() -> None:
    """Text that cannot be encoded is replaced, never raised."""
    assert serialize({"when": "2026-11-11T00:00:00+00:00", "message": "a\ud800b"})


@pytest.mark.parametrize("line", [b"", b"not json", b"[1]", b'{"x": 1}', b'{"when": 5}'])
def test_parse_line_rejects_anything_but_an_entry(line: bytes) -> None:
    """Damaged or foreign lines are skipped."""
    assert parse_line(line) is None


def test_dropped_entry_says_how_many() -> None:
    """The drop counter is itself recorded."""
    entry = dropped_entry(7, WHEN)
    assert entry["kind"] == KIND_DROPPED
    assert entry["count"] == 7
    assert "7 entries were dropped" in entry["message"]


def test_day_helpers() -> None:
    """Days come from the UTC time and map to one file."""
    assert day_of(_state_entry()) == "2026-11-11"
    assert day_path(Path("r"), "2026-11-11") == Path("r/2026/11/2026-11-11.jsonl")
    assert valid_day("2026-11-11") is not None
    for bad in ("2026-13-01", "2026-1-1", "../2026-11-1", "2026-11-11\n", ""):
        assert valid_day(bad) is None


def test_commit_message() -> None:
    """The message counts entries and uses the right plural."""
    assert commit_message(1) == "Record 1 activity entry"
    assert commit_message(3) == "Record 3 activity entries"
    assert commit_message(3, "Because") == "Because"


def test_line_reading(tmp_path: Path) -> None:
    """Lines read the same forwards and backwards, across chunk borders."""
    path = tmp_path / "f.jsonl"
    lines = [json.dumps({"when": "w", "n": i, "pad": "p" * (i % 50)}) for i in range(500)]
    path.write_text("\n".join(lines) + "\n\n", encoding="utf-8")
    forward = [json.loads(line)["n"] for line in iter_lines(path)]
    backward = [json.loads(line)["n"] for line in iter_lines_reversed(path, 97)]
    assert forward == list(range(500))
    assert backward == list(reversed(range(500)))
    assert count_lines(path) == 501


def test_count_lines_counts_an_unfinished_last_line(tmp_path: Path) -> None:
    """A line without its newline still counts."""
    path = tmp_path / "f.jsonl"
    path.write_bytes(b'{"a":1}\n{"a"')
    assert count_lines(path) == 2


def test_matches() -> None:
    """Matching is by entity and by case-insensitive text."""
    entry = {"entity_id": "light.a", "name": "Kitchen Light", "message": "turned on"}
    assert matches(entry, None, None)
    assert matches(entry, "light.a", "KITCHEN")
    assert not matches(entry, "light.b", None)
    assert not matches(entry, None, "bedroom")
