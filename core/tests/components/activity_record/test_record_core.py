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
    KIND_UNWRITABLE,
    chunk_path,
    day_of,
    dropped_entry,
    entry_from_logbook,
    iter_lines,
    iter_lines_reversed,
    iter_lines_reversed_pos,
    mask_entry,
    matches,
    parse_chunk_name,
    parse_cursor,
    parse_line,
    prepare_secrets,
    raw_needle,
    serialize,
    unwritable_entry,
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
    assert entry["cut"] is True


def test_cut_is_flagged_only_when_something_was_left_out() -> None:
    """An entry that fits has no flag; too many or nested attributes set it."""
    plain = entry_from_logbook(
        {"when": WHEN, "message": "short", "attributes": {"a": 1}},
        context_id=None,
        parent_id=None,
        user_id=None,
    )
    assert "cut" not in plain
    many = entry_from_logbook(
        {"when": WHEN, "attributes": {str(n): n for n in range(12)}},
        context_id=None,
        parent_id=None,
        user_id=None,
    )
    assert many["cut"] is True
    nested = entry_from_logbook(
        {"when": WHEN, "attributes": {"a": {"deep": 1}}},
        context_id=None,
        parent_id=None,
        user_id=None,
    )
    assert nested["cut"] is True


@pytest.mark.parametrize("when", [None, "garbage", float("nan"), 1e30, "../../etc"])
def test_an_odd_time_never_loses_the_entry(when: object) -> None:
    """The entry is filed at its arrival time and keeps the original value."""
    entry = entry_from_logbook(
        {"when": when, "name": "x"},
        context_id=None,
        parent_id=None,
        user_id=None,
        now=WHEN,
    )
    assert entry["when"].startswith("2026-11-11")
    assert entry["when_raw"] == str(when)[:100]


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


def test_dropped_entry_says_how_many_and_when() -> None:
    """The drop record has a count and the time span it covers."""
    entry = dropped_entry(7, WHEN - 10, WHEN)
    assert entry["kind"] == KIND_DROPPED
    assert entry["count"] == 7
    assert "7 entries were dropped" in entry["message"]
    assert entry["first_at"] < entry["last_at"]
    opening = dropped_entry(1, WHEN, WHEN, started=True)
    assert "being dropped" in opening["message"]


def test_unwritable_entry_stands_in_for_a_bad_one() -> None:
    """The placeholder says why and keeps the original time when it is usable."""
    placeholder = unwritable_entry(
        {"when": "2026-11-10T01:00:00+00:00", "entity_id": "light.a"},
        "KeyError: x",
        WHEN,
    )
    assert placeholder["kind"] == KIND_UNWRITABLE
    assert placeholder["when"].startswith("2026-11-10")
    assert "could not be written" in placeholder["message"]
    assert day_of(unwritable_entry({"when": "nonsense"}, "bad", WHEN)) == "2026-11-11"


def test_day_helpers() -> None:
    """Days come from the UTC time and map to one file."""
    assert day_of(_state_entry()) == "2026-11-11"
    assert chunk_path(Path("r"), "2026-11-11", 2) == Path("r/2026/11/2026-11-11.002.jsonl")
    assert chunk_path(Path("r"), "2026-11-11", 0) == Path("r/2026/11/2026-11-11.jsonl")
    assert parse_chunk_name("2026-11-11.002.jsonl") == ("2026-11-11", 2)
    assert parse_chunk_name("2026-11-11.jsonl") == ("2026-11-11", 0)
    for name in ("2026-11-11.2.jsonl", "2026-13-11.001.jsonl", "x.jsonl", "2026-11-11.001.jsonl.bak"):
        assert parse_chunk_name(name) is None
    with pytest.raises(ValueError):
        day_of({"when": "../../etc/x"})
    assert day_of({"when": "../../etc/x"}, "2026-11-11") == "2026-11-11"
    assert parse_cursor("1:200") == (1, 200)
    for bad in ("", "x", "1:", "1:2:3", "-1:2", "1:99999999999999999"):
        assert parse_cursor(bad) is None
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


def test_reversed_lines_report_where_they_start(tmp_path: Path) -> None:
    """Each backwards line comes with the byte where it starts, from an end point."""
    path = tmp_path / "f.jsonl"
    lines = [f'{{"when":"w","n":{i}}}'.encode() for i in range(40)]
    path.write_bytes(b"\n".join(lines) + b"\n")
    seen = list(iter_lines_reversed_pos(path, None, 23))
    assert [line for _, line in seen] == list(reversed(lines))
    data = path.read_bytes()
    assert all(data[start : start + len(line)] == line for start, line in seen)
    before = list(iter_lines_reversed_pos(path, seen[5][0], 23))
    assert [line for _, line in before] == list(reversed(lines[:34]))


def test_count_lines_counts_an_unfinished_last_line(tmp_path: Path) -> None:
    """A line without its newline still counts."""
    path = tmp_path / "f.jsonl"
    path.write_bytes(b'{"a":1}\n{"a"')
    assert count_lines(path) == 2


def test_masking_hides_random_ids_and_attribute_keys() -> None:
    """Random-looking object ids, item ids and secret-like attribute keys go."""
    entry = {
        "when": "2026-11-11T00:00:00+00:00",
        "entity_id": "text.code_a1b2c3d4e5f6a7b8c9d0",
        "context_entity_id": "light.kitchen_ceiling",
        "item_id": "A1b2C3d4E5f6G7h8I9j0K1l2",
        "attributes": {"token=abcdef123456": "x", "plain": 1},
    }
    masked = mask_entry(entry)
    assert masked["entity_id"] == "text.[removed]"
    assert masked["context_entity_id"] == "light.kitchen_ceiling"
    assert masked["item_id"] == "[removed]"
    assert "abcdef123456" not in json.dumps(masked["attributes"])
    assert mask_entry({"item_id": "1700000000000"})["item_id"] == "1700000000000"
    assert mask_entry({"entity_id": "sensor.living_room_temperature_1"})[
        "entity_id"
    ] == "sensor.living_room_temperature_1"


def test_prepared_secrets_are_applied_longest_first() -> None:
    """One pattern for a whole batch removes every exact secret."""
    pattern = prepare_secrets(["abcd", "abcdefgh", "xy"])
    masked = mask_entry({"message": "see abcdefgh and abcd"}, pattern)
    assert masked["message"] == "see [removed] and [removed]"
    assert prepare_secrets(["xy", ""]) is None


@pytest.mark.parametrize(
    ("text", "expected"),
    [("Kitchen", b"kitchen"), ("a\"b", None), ("é", None), ("", None), (None, None)],
)
def test_raw_needle_only_when_the_raw_line_can_be_tested(
    text: str | None, expected: bytes | None
) -> None:
    """Texts that JSON would escape or that are not ASCII skip the raw prefilter."""
    assert raw_needle(text) == expected


def test_matches() -> None:
    """Matching is by entity and by case-insensitive text."""
    entry = {"entity_id": "light.a", "name": "Kitchen Light", "message": "turned on"}
    assert matches(entry, None, None)
    assert matches(entry, "light.a", "KITCHEN")
    assert not matches(entry, "light.b", None)
    assert not matches(entry, None, "bedroom")
