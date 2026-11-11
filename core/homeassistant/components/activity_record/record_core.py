"""Pure helpers of the activity record: entries, lines, days, chunks and matching.

Nothing here imports Home Assistant or starts a process, so every function can
be tested on its own.
"""

from collections.abc import Iterable, Iterator, Mapping
from datetime import UTC, date, datetime
import json
import os
from pathlib import Path
import re
import time
from typing import Any

from homeassistant.components.problem_log.problem_core import REMOVED, redact

from .const import MAX_ATTRIBUTES, MAX_TEXT

DAY_FORMAT = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}")
CHUNK_FILE = re.compile(r"([0-9]{4})-([0-9]{2})-([0-9]{2})(?:\.([0-9]{3}))?\.jsonl")
CURSOR_FORMAT = re.compile(r"([0-9]{1,3}):([0-9]{1,15})")
MAX_CHUNK_INDEX = 999

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

# Text fields that may hold something confidential and are masked as text.
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

# Entity ids whose object id is hidden when it looks like a random token.
ENTITY_ID_FIELDS = ("entity_id", "context_entity_id")

KIND_STATE = "state_change"
KIND_LOGBOOK = "logbook"
KIND_DROPPED = "dropped"
KIND_UNWRITABLE = "unwritable"
KIND_RESTORED = "restored"

_SEGMENT_SPLIT = re.compile(r"[_.:-]")
_NOT_ALNUM = re.compile(r"[^A-Za-z0-9]")


def _text(value: Any) -> tuple[str | None, bool]:
    if value is None:
        return None, False
    text = value if isinstance(value, str) else str(value)
    return text[:MAX_TEXT], len(text) > MAX_TEXT


def _small_mapping(value: Any) -> tuple[dict[str, Any] | None, bool]:
    """Keep up to MAX_ATTRIBUTES simple values; say whether anything was left out."""
    if not isinstance(value, Mapping) or not value:
        return None, False
    result: dict[str, Any] = {}
    cut = len(value) > MAX_ATTRIBUTES
    for key, item in list(value.items())[:MAX_ATTRIBUTES]:
        if isinstance(item, str):
            result[str(key)] = item[:MAX_TEXT]
            cut = cut or len(item) > MAX_TEXT
        elif isinstance(item, bool | int | float) or item is None:
            result[str(key)] = item
        else:
            cut = True
    return result or None, cut


def iso_utc(timestamp: float) -> str:
    """Return a timestamp as an ISO string in UTC."""
    return datetime.fromtimestamp(timestamp, UTC).isoformat()


def entry_from_logbook(
    data: Mapping[str, Any],
    *,
    context_id: str | None,
    parent_id: str | None,
    user_id: str | None,
    now: float | None = None,
) -> dict[str, Any]:
    """Build one record entry from what the Activity page would show.

    A time that cannot be read never loses the entry: the entry is filed at the
    time it arrived and the original value is kept as `when_raw`.
    """
    when = data.get("when")
    entry: dict[str, Any] = {}
    try:
        if not isinstance(when, int | float) or isinstance(when, bool):
            raise ValueError  # noqa: TRY301
        entry["when"] = iso_utc(float(when))
    except (ValueError, OverflowError, OSError):
        entry["when"] = iso_utc(time.time() if now is None else now)
        entry["when_raw"] = str(when)[:100]
    entry["kind"] = (
        KIND_STATE if "state" in data and "message" not in data else KIND_LOGBOOK
    )
    cut = False
    for field in TEXT_FIELDS:
        value, was_cut = _text(data.get(field))
        if value is not None:
            entry[field] = value
        cut = cut or was_cut
    attributes, was_cut = _small_mapping(data.get("attributes"))
    if attributes:
        entry["attributes"] = attributes
    cut = cut or was_cut
    entry["context_id"] = context_id
    entry["context_parent_id"] = parent_id
    entry["context_user_id"] = data.get("context_user_id") or user_id
    if cut:
        entry["cut"] = True
    return entry


def dropped_entry(
    count: int, first_at: float, last_at: float, *, started: bool = False
) -> dict[str, Any]:
    """Return the entry that records entries that could not be kept."""
    if started:
        message = (
            "Entries are being dropped because the record could not keep up; "
            "a summary follows when the queue is empty again"
        )
    else:
        message = (
            f"{count} entries were dropped because the record could not keep up"
        )
    return {
        "when": iso_utc(last_at),
        "kind": KIND_DROPPED,
        "name": "Activity record",
        "message": message,
        "count": count,
        "first_at": iso_utc(first_at),
        "last_at": iso_utc(last_at),
    }


def unwritable_entry(entry: Mapping[str, Any], reason: str, now: float) -> dict[str, Any]:
    """Return the line that stands in for an entry that could not be written."""
    raw_when = entry.get("when")
    day = str(raw_when)[:10] if isinstance(raw_when, str) else ""
    placeholder: dict[str, Any] = {
        "when": raw_when if valid_day(day) is not None else iso_utc(now),
        "kind": KIND_UNWRITABLE,
        "name": "Activity record",
        "message": f"An entry could not be written: {reason[:200]}",
    }
    if raw_when is not None:
        placeholder["when_raw"] = str(raw_when)[:100]
    if isinstance(entity_id := entry.get("entity_id"), str):
        placeholder["entity_id"] = entity_id[:200]
    return placeholder


def restored_entry(message: str, now: float) -> dict[str, Any]:
    """Return the entry that says a hand edit of the record was undone."""
    return {
        "when": iso_utc(now),
        "kind": KIND_RESTORED,
        "name": "Activity record",
        "message": message[:500],
    }


def prepare_secrets(secrets: Iterable[str]) -> re.Pattern[str] | None:
    """Return one pattern that finds every exact secret, longest first."""
    values = sorted({s for s in secrets if s and len(s) >= 4}, key=len, reverse=True)
    if not values:
        return None
    return re.compile("|".join(re.escape(value) for value in values))


def _mask_text(text: str, pattern: re.Pattern[str] | None) -> str:
    if pattern is not None:
        text = pattern.sub(REMOVED, text)
    return redact(text)


def looks_like_token(text: str) -> bool:
    """Return True for a string made of one random-looking run (an id)."""
    plain = _NOT_ALNUM.sub("", text)
    if len(plain) < 16:
        return False
    return any(c.isdigit() for c in plain) and any(c.isalpha() for c in plain)


def _object_id_is_random(object_id: str) -> bool:
    return any(
        len(segment) >= 16
        and segment.isalnum()
        and any(c.isdigit() for c in segment)
        and any(c.isalpha() for c in segment)
        for segment in _SEGMENT_SPLIT.split(object_id)
    )


def mask_entity_id(entity_id: str) -> str:
    """Hide the object id of an entity id when it looks like a random token."""
    domain, dot, object_id = entity_id.partition(".")
    if not dot:
        return REMOVED if _object_id_is_random(entity_id) else entity_id
    return f"{domain}.{REMOVED}" if _object_id_is_random(object_id) else entity_id


def mask_entry(
    entry: dict[str, Any],
    secrets: Iterable[str] | re.Pattern[str] | None = (),
) -> dict[str, Any]:
    """Return a copy of an entry with anything confidential removed.

    Pass the secrets as one prepared pattern when masking many entries.
    """
    pattern = (
        secrets
        if secrets is None or isinstance(secrets, re.Pattern)
        else prepare_secrets(secrets)
    )
    masked = dict(entry)
    for field in MASKED_FIELDS:
        if isinstance(masked.get(field), str):
            masked[field] = _mask_text(masked[field], pattern)
    for field in ENTITY_ID_FIELDS:
        if isinstance(masked.get(field), str):
            masked[field] = mask_entity_id(masked[field])
    if isinstance(item_id := masked.get("item_id"), str) and looks_like_token(item_id):
        masked["item_id"] = REMOVED
    if isinstance(masked.get("attributes"), dict):
        masked["attributes"] = {
            _mask_text(str(key), pattern): (
                _mask_text(value, pattern) if isinstance(value, str) else value
            )
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


def valid_day(day: str) -> date | None:
    """Return the date of a YYYY-MM-DD string, or None when it is not one."""
    if not DAY_FORMAT.fullmatch(day):
        return None
    try:
        return date.fromisoformat(day)
    except ValueError:
        return None


def day_of(entry: Mapping[str, Any], fallback: str | None = None) -> str:
    """Return the UTC day of an entry as YYYY-MM-DD.

    An entry without a usable time is filed under `fallback` (today); a
    `ValueError` is raised when there is none.
    """
    when = entry.get("when")
    day = str(when)[:10] if when is not None else ""
    if valid_day(day) is not None:
        return day
    if fallback is None:
        raise ValueError("The entry has no usable time.")
    return fallback


def chunk_name(day: str, index: int) -> str:
    """Return the file name of a chunk; chunk 0 is a first-version day file."""
    return f"{day}.jsonl" if index == 0 else f"{day}.{index:03d}.jsonl"


def chunk_path(root: Path, day: str, index: int) -> Path:
    """Return the file of one chunk: <root>/YYYY/MM/YYYY-MM-DD[.NNN].jsonl."""
    return root / day[:4] / day[5:7] / chunk_name(day, index)


def parse_chunk_name(name: str) -> tuple[str, int] | None:
    """Return (day, index) for a chunk file name, or None for anything else."""
    match = CHUNK_FILE.fullmatch(name)
    if match is None:
        return None
    day = f"{match[1]}-{match[2]}-{match[3]}"
    if valid_day(day) is None:
        return None
    return day, int(match[4] or 0)


def parse_cursor(text: str) -> tuple[int, int] | None:
    """Return (chunk, byte position) of a cursor, or None when it is not one."""
    match = CURSOR_FORMAT.fullmatch(text)
    return (int(match[1]), int(match[2])) if match else None


def format_cursor(index: int, position: int) -> str:
    """Return the cursor that continues after a line of a chunk."""
    return f"{index}:{position}"


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


def iter_lines_reversed_pos(
    path: Path, end: int | None = None, chunk_size: int = 1 << 16
) -> Iterator[tuple[int, bytes]]:
    """Yield (start byte, line) of the non-empty lines before `end`, last first."""
    with path.open("rb") as handle:
        if end is None:
            handle.seek(0, os.SEEK_END)
            end = handle.tell()
        position = end
        buffer = b""
        while position > 0:
            size = min(chunk_size, position)
            position -= size
            handle.seek(position)
            buffer = handle.read(size) + buffer
            parts = buffer.split(b"\n")
            buffer = parts[0]
            line_end = position + len(buffer) + sum(len(p) + 1 for p in parts[1:])
            for part in reversed(parts[1:]):
                start = line_end - len(part)
                line_end = start - 1
                if part:
                    yield start, part
        if buffer:
            yield 0, buffer


def iter_lines_reversed(path: Path, chunk_size: int = 1 << 16) -> Iterator[bytes]:
    """Yield the non-empty lines of a file, last line first."""
    for _, line in iter_lines_reversed_pos(path, None, chunk_size):
        yield line


def iter_lines_pos(path: Path, start: int = 0) -> Iterator[tuple[int, bytes]]:
    """Yield (end byte, line) of the non-empty lines from `start`, first first."""
    with path.open("rb") as handle:
        handle.seek(start)
        position = start
        for line in handle:
            position += len(line)
            if line.strip():
                yield position, line


def iter_lines(path: Path) -> Iterator[bytes]:
    """Yield the non-empty lines of a file, first line first."""
    for _, line in iter_lines_pos(path):
        yield line


def raw_needle(text: str | None) -> bytes | None:
    """Return a lowercase byte string that every matching line must contain.

    None when the text cannot be tested safely on the raw line (it has quotes,
    backslashes, control characters or letters beyond ASCII).
    """
    if not text:
        return None
    needle = text.lower()
    if not needle.isascii() or any(c in needle for c in '"\\') or any(
        ord(c) < 32 for c in needle
    ):
        return None
    return needle.encode("ascii")


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
        for field in (
            "name",
            "message",
            "state",
            "entity_id",
            "context_name",
            "context_message",
            "context_entity_id_name",
        )
    )
