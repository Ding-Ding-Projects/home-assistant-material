"""Cooling time and cost arithmetic."""

from datetime import UTC, datetime, timedelta

import pytest

from homeassistant.components.ac_defender.cost import CostTracker, PriceTable

TUE = datetime(2026, 7, 14, 13, 0, tzinfo=UTC)


@pytest.mark.parametrize(
    ("when", "period"),
    [
        (TUE, "on_peak"),
        (TUE.replace(hour=9), "mid_peak"),
        (TUE.replace(hour=18), "mid_peak"),
        (TUE.replace(hour=22), "off_peak"),
        (TUE.replace(day=18), "off_peak"),
        (TUE.replace(month=1, hour=8), "on_peak"),
        (TUE.replace(month=1, hour=13), "mid_peak"),
    ],
)
def test_period(when: datetime, period: str) -> None:
    """The weekday bands follow the season."""
    assert PriceTable().period(when) == period


def test_cost_accumulates_only_while_cooling() -> None:
    """One hour of cooling at 2 kW on peak costs 2 times the price."""
    tracker = CostTracker(PriceTable(), 2.0)
    now = TUE
    tracker.update(now, True)
    for _ in range(12):
        now += timedelta(minutes=5)
        tracker.update(now, True)
    tracker.update(now + timedelta(minutes=5), False)
    tracker.update(now + timedelta(minutes=10), False)
    assert tracker.seconds_today == pytest.approx(3600 + 300)
    assert tracker.estimate() == pytest.approx(round(13 / 12 * 2 * 0.203, 2))


def test_without_power_only_time_is_shown() -> None:
    """No owner supplied power means no invented amount."""
    tracker = CostTracker(PriceTable(), None)
    tracker.update(TUE, True)
    tracker.update(TUE + timedelta(minutes=5), True)
    assert tracker.seconds_today == 300
    assert tracker.estimate() is None


def test_day_rollover_resets_today_but_not_the_month() -> None:
    """A new day starts from zero while the month keeps adding."""
    tracker = CostTracker(PriceTable(), 1.0)
    tracker.update(TUE, True)
    tracker.update(TUE + timedelta(minutes=5), True)
    tracker.update(TUE + timedelta(days=1), True)
    assert tracker.seconds_today == 0
    assert tracker.seconds_month == 600
