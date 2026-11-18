"""Cooling time and an estimated cost from a configurable time-of-use price table."""

from dataclasses import dataclass
from datetime import datetime

PERIODS = ("off_peak", "mid_peak", "on_peak")
MAX_SLICE_SECONDS = 300.0


@dataclass(frozen=True, slots=True)
class PriceTable:
    """Prices per kWh for three periods and the weekday hour bands they apply to."""

    on_peak: float = 0.203
    mid_peak: float = 0.157
    off_peak: float = 0.098
    summer_months: tuple[int, ...] = (5, 6, 7, 8, 9, 10)
    morning_end: int = 11
    midday_end: int = 17
    evening_end: int = 19
    day_start: int = 7
    multiplier: float = 1.0
    adder: float = 0.0

    def period(self, when: datetime) -> str:
        """Return the period for a local time (weekends are off peak)."""
        if (
            when.weekday() >= 5
            or when.hour < self.day_start
            or when.hour >= self.evening_end
        ):
            return "off_peak"
        summer = when.month in self.summer_months
        if when.hour < self.morning_end:
            return "mid_peak" if summer else "on_peak"
        if when.hour < self.midday_end:
            return "on_peak" if summer else "mid_peak"
        return "mid_peak" if summer else "on_peak"

    def price(self, when: datetime) -> float:
        """Return the effective price per kWh at a local time."""
        base = {
            "on_peak": self.on_peak,
            "mid_peak": self.mid_peak,
            "off_peak": self.off_peak,
        }[self.period(when)]
        return base * self.multiplier + self.adder


@dataclass(slots=True)
class CostTracker:
    """Accumulates cooling seconds and an estimated cost per day and per month."""

    table: PriceTable
    power_kw: float | None
    day: str | None = None
    month: str | None = None
    seconds_today: float = 0.0
    seconds_month: float = 0.0
    cost_today: float = 0.0
    cost_month: float = 0.0
    last: datetime | None = None
    last_cooling: bool = False

    def update(self, now: datetime, cooling: bool) -> None:
        """Account for the time since the last update."""
        day, month = now.strftime("%Y-%m-%d"), now.strftime("%Y-%m")
        if self.last is not None and self.last_cooling:
            seconds = min(
                MAX_SLICE_SECONDS, max(0.0, (now - self.last).total_seconds())
            )
            self.seconds_today += seconds
            self.seconds_month += seconds
            if self.power_kw:
                cost = seconds / 3600 * self.power_kw * self.table.price(self.last)
                self.cost_today += cost
                self.cost_month += cost
        if day != self.day:
            self.day, self.seconds_today, self.cost_today = day, 0.0, 0.0
        if month != self.month:
            self.month, self.seconds_month, self.cost_month = month, 0.0, 0.0
        self.last, self.last_cooling = now, cooling

    def estimate(self, month: bool = False) -> float | None:
        """Return the estimated cost, or None when no power was supplied."""
        if not self.power_kw:
            return None
        return round(self.cost_month if month else self.cost_today, 2)
