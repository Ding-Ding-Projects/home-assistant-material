"""What became of each event of a camera: a clip kept, one being kept, or why none exists."""

from dataclasses import dataclass
from datetime import UTC, datetime
from enum import StrEnum
import errno
from typing import Any

from .backoff import is_rate_limited


class ClipState(StrEnum):
    """Whether a clip for an event is on disk."""

    SAVED = "saved"
    SAVING = "saving"
    NONE = "none"


class ClipReason(StrEnum):
    """Why an event has no clip. These codes are shown to the owner as one plain line."""

    RECORDING_OFF = "recording_off"
    RATE_LIMITED = "rate_limited"
    TIMED_OUT = "timed_out"
    UNSUPPORTED = "unsupported"
    STORAGE_FULL = "storage_full"
    STORAGE_UNREACHABLE = "storage_unreachable"
    REMOVED = "removed"
    NO_MEDIA = "no_media"
    FAILED = "failed"
    STREAM_ENDED = "stream_ended"
    CAMERA_BUSY = "camera_busy"
    HOURLY_LIMIT = "hourly_limit"


# Two reports of one event (the integration's event and its media list) are one event
# when they are this close in time.
MATCH_SECONDS = 30
# A clip that has not turned up this long after its event is given up on.
GIVE_UP_SECONDS = 600
MAX_RECORDS_PER_CAMERA = 400


def classify_error(err: BaseException) -> ClipReason:
    """The reason code for a failure. Only the kind of error is used, never its text.

    The text of a provider error can carry addresses, so it is not stored or logged.
    """
    if isinstance(err, TimeoutError):
        return ClipReason.TIMED_OUT
    if isinstance(err, OSError):
        return (
            ClipReason.STORAGE_FULL
            if err.errno in (errno.ENOSPC, errno.EDQUOT)
            else ClipReason.STORAGE_UNREACHABLE
        )
    if is_rate_limited(f"{type(err).__name__} {err}"):
        return ClipReason.RATE_LIMITED
    return ClipReason.FAILED


def event_time(value: Any, now: float) -> float:
    """The time of an integration's event as a UNIX time, never later than now.

    Integrations put a timezone-aware datetime in the event; a text form is
    accepted too. Anything unreadable means the event is happening now.
    """
    if isinstance(value, datetime):
        moment = value if value.tzinfo else value.replace(tzinfo=UTC)
    elif isinstance(value, str) and value:
        try:
            moment = datetime.fromisoformat(value)
        except ValueError:
            return now
        if moment.tzinfo is None:
            moment = moment.replace(tzinfo=UTC)
    else:
        return now
    return min(moment.timestamp(), now)


def _reason(value: Any) -> ClipReason | None:
    """A stored reason code, or None for an empty or unknown one."""
    try:
        return ClipReason(value) if value else None
    except ValueError:
        return ClipReason.FAILED


@dataclass(slots=True)
class EventRecord:
    """One event of one camera and what was kept for it."""

    start: float
    state: ClipState = ClipState.SAVING
    reason: ClipReason | None = None
    name: str | None = None
    kind: str | None = None  # "clip" or "image" once something is kept
    duration: float = 0
    size: int = 0
    attempts: int = 0
    origin: str | None = None  # "service" (its own clip) or "home" (recorded live here)
    # The live video stopped before the chosen length; what came is kept.
    cut_short: bool = False
    # Why no live clip was started, used when the service's own clip never comes.
    skip: ClipReason | None = None

    def as_list(self) -> list[Any]:
        """Compact form for storage."""
        return [
            self.start,
            self.state.value,
            self.reason.value if self.reason else None,
            self.name,
            self.kind,
            self.duration,
            self.size,
            self.origin,
            self.cut_short,
            self.skip.value if self.skip else None,
        ]

    @classmethod
    def from_list(cls, row: list[Any]) -> EventRecord:
        """Read the compact form. A clip that was still being saved when stopped is retried."""
        return cls(
            float(row[0]),
            ClipState(row[1]),
            _reason(row[2]),
            row[3],
            row[4],
            float(row[5]),
            int(row[6]),
            origin=row[7] if len(row) > 7 else None,
            cut_short=bool(row[8]) if len(row) > 8 else False,
            skip=_reason(row[9]) if len(row) > 9 else None,
        )

    def as_dict(self, entry_id: str, now: float) -> dict[str, Any]:
        """The form the frontend reads."""
        return {
            "start": self.start,
            "state": self.state.value,
            "reason": self.reason.value if self.reason else None,
            "name": self.name,
            "kind": self.kind,
            "duration": self.duration,
            "size": self.size,
            "origin": self.origin,
            "cut_short": self.cut_short,
            "progress": (
                max(0, round(now - self.start))
                if self.state is ClipState.SAVING
                else None
            ),
            "entry_id": entry_id,
        }
