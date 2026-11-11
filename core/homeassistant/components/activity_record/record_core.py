"""Pure helpers of the activity record: entries, lines, days and matching.

Nothing here imports Home Assistant or starts a process, so every function can
be tested on its own.
"""

from collections.abc import Iterable, Iterator, Mapping
from datetime import UTC, date, datetime
import json
import os
from pathlib import Path
import re
from typing import Any

from homeassistant.components.problem_log.problem_core import redact

from .const import MAX_TEXT

DAY_FORMAT = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}")
DAY_FILE = re.compile(r"([0-9]{4})-([0-9]{2})-([0-9]{2})\.jsonl")

# Fields of a logbook entry that are kept as text.
TEXT_FIELDS = (
    "name",
    "message",
    "entity_id",
    "domain",
    "state",
    "icon",
    "source",
    "item_id",
    "run_id",
    "context_entity_id",
    "context_entity_id_name",
    "context_domain",
    "context_service",
    "context_event_type",
    "context_name",
    "context_message",
    "context_source",
    "context_state",
)

# Text fields that may hold something confidential and are masked.
MASKED_FIELDS = (
    "name",
    "message",
    "state",
    "source",
    "context_entity_id_name",
    "context_name",
    "context_message",
    "context_source",
    "context_state",
)

KIND_STATE = "state_change"
KIND_LOGBOOK = "logbook"
KIND_DROPPED = "dropped"


def _text(value: Any) -> str | None:
    if value is None:
        return None
    text = value if isinstance(value, str) else str(value)
    return text[:MAX_TEXT]


def _small_mapping(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, Mapping) or not value:
        return None
    result: dict[str, Any] = {}
    for key, item in list(value.items())[:8]:
        if isinstance(item, str):
            result[str(key)] = item[:MAX_TEXT]
        elif isinstance(item, bool | int | float) or item is None:
            result[str(key)] = item
    return result or None


def iso_utc(timestamp: float) -> str:
    """Return a timestamp as an ISO string in UTC."""
    return datetime.fromtimestamp(timestamp, UTC).isoformat()


def entry_from_logbook(
    data: Mapping[str, Any],
    *,
    context_id: str | None,
    parent_id: str | None,
    user_id: str | None,
) -> dict[str, Any]:
    """Build one record entry from what the Activity page would show."""
    when = data.get("when")
    entry: dict[str, Any] = {
        "when": iso_utc(float(when)) if isinstance(when, int | float) else str(when)
    }
    entry["kind"] = KIND_STATE if "state" in data and "message" not in data else KIND_LOGBOOK
    for field in TEXT_FIELDS:
        if (value := _text(data.get(field))) is not None:
            entry[field] = value
    if attributes := _small_mapping(data.get("attributes")):
        entry["attributes"] = attributes
    entry["context_id"] = context_id
    entry["context_parent_id"] = parent_id
    entry["context_user_id"] = data.get("context_user_id") or user_id
    return entry


def dropped_entry(count: int, when: float) -> dict[str, Any]:
    """Return the entry that records how many entries could not be kept."""
    return {
        "when": iso_utc(when),
        "kind": KIND_DROPPED,
        "name": "Activity record",
        "message": f"{count} entries were dropped because the record could not keep up",
        "count": count,
    }


def mask_entry(entry: dict[str, Any], secrets: Iterable[str] = ()) -> dict[str, Any]:
    """Return a copy of an entry with anything confidential removed."""
    secret_list = list(secrets)
    masked = dict(entry)
    for field in MASKED_FIELDS:
        if isinstance(masked.get(field), str):
            masked[field] = redact(masked[field], secret_list)
    if isinstance(masked.get("attributes"), dict):
        masked["attributes"] = {
            key: redact(value, secret_list) if isinstance(value, str) else value
            for key, value in masked["attributes"].items()
        }
    return masked


def serialize(entry: Mapping[str, Any]) -> bytes:
    """Return one entry as a single UTF-8 line that ends in a newline."""
    text = json.dumps(entry, ensure_ascii=False, separators=(",", ":"), default=str)
    return text.encode("utf-8", errors="replace") + b"\n"


def parse_line(line: bytes | str) -> dict[str, Any] | None:
    """Read one line back; return None for anything that is not an entry."""
    try:
        value = json.loads(line)
    except ValueError:
        return None
    if isinstance(value, dict) and isinstance(value.get("when"), str):
        return value
    return None


def day_of(entry: Mapping[str, Any]) -> str:
    """Return the UTC day of an entry as YYYY-MM-DD."""
    return str(entry["when"])[:10]


def valid_day(day: str) -> date | None:
    """Return the date of a YYYY-MM-DD string, or None when it is not one."""
    if not DAY_FORMAT.fullmatch(day):
        return None
    try:
        return date.fromisoformat(day)
    except ValueError:
        return None


def day_path(root: Path, day: str) -> Path:
    """Return the file of one day: <root>/YYYY/MM/YYYY-MM-DD.jsonl."""
    return root / day[:4] / day[5:7] / f"{day}.jsonl"


def commit_message(entries: int, reason: str | None = None) -> str:
    """Return the commit message for a batch of entries."""
    if reason:
        return reason
    return f"Record {entries} activity {'entry' if entries == 1 else 'entries'}"


def count_lines(path: Path) -> int:
    """Count the lines of a file, including an unfinished last line."""
    count = 0
    last = b"\n"
    with path.open("rb") as handle:
        while chunk := handle.read(1 << 20):
            count += chunk.count(b"\n")
            last = chunk[-1:]
    return count + (0 if last == b"\n" else 1)


def iter_lines_reversed(path: Path, chunk_size: int = 1 << 16) -> Iterator[bytes]:
    """Yield the non-empty lines of a file, last line first."""
    with path.open("rb") as handle:
        handle.seek(0, os.SEEK_END)
        position = handle.tell()
        buffer = b""
        while position > 0:
            size = min(chunk_size, position)
            position -= size
            handle.seek(position)
            buffer = handle.read(size) + buffer
            parts = buffer.split(b"\n")
            buffer = parts[0]
            for line in reversed(parts[1:]):
                if line:
                    yield line
        if buffer:
            yield buffer


def iter_lines(path: Path) -> Iterator[bytes]:
    """Yield the non-empty lines of a file, first line first."""
    with path.open("rb") as handle:
        for line in handle:
            if line.strip():
                yield line


def matches(
    entry: Mapping[str, Any], entity_id: str | None, text: str | None
) -> bool:
    """Return True when an entry is for the entity and holds the text."""
    if entity_id and entry.get("entity_id") != entity_id:
        return False
    if not text:
        return True
    needle = text.lower()
    return any(
        isinstance(entry.get(field), str) and needle in entry[field].lower()
        for field in ("name", "message", "state", "entity_id", "context_name",
                      "context_message", "context_entity_id_name")
    )
