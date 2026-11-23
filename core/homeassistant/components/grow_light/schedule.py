"""Daily on-hours window for a grow light."""

from dataclasses import dataclass
from datetime import datetime, time, timedelta

DAY = timedelta(days=1)


@dataclass(frozen=True, slots=True)
class OnHours:
    """A window that starts at a time of day and lasts a number of hours."""

    start: time
    hours: float

    @property
    def length(self) -> timedelta:
        """Window length, capped at one day."""
        return min(timedelta(hours=self.hours), DAY)

    def _window_start(self, now: datetime) -> datetime:
        """Start of the most recent window that began at or before now."""
        start = now.replace(
            hour=self.start.hour,
            minute=self.start.minute,
            second=self.start.second,
            microsecond=0,
        )
        if start > now:
            start -= DAY
        return start

    def is_on(self, now: datetime) -> bool:
        """Whether now falls inside the on hours."""
        if self.length >= DAY:
            return True
        if self.length <= timedelta(0):
            return False
        return now < self._window_start(now) + self.length

    def next_change(self, now: datetime) -> datetime | None:
        """When the window next opens or closes, or None if it never does."""
        if self.length >= DAY or self.length <= timedelta(0):
            return None
        start = self._window_start(now)
        end = start + self.length
        if now < end:
            return end
        return start + DAY
