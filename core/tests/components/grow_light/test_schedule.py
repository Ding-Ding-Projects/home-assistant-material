"""Tests for the daily on-hours window."""

from datetime import UTC, datetime, time

import pytest

from homeassistant.components.grow_light.schedule import OnHours

DAYTIME = OnHours(time(6, 0), 14)
OVERNIGHT = OnHours(time(20, 0), 8)


def _at(hour: int, minute: int = 0, day: int = 10) -> datetime:
    return datetime(2026, 11, day, hour, minute, tzinfo=UTC)


@pytest.mark.parametrize(
    ("window", "now", "expected"),
    [
        pytest.param(DAYTIME, _at(5, 59), False, id="before-start"),
        pytest.param(DAYTIME, _at(6, 0), True, id="at-start"),
        pytest.param(DAYTIME, _at(19, 59), True, id="before-end"),
        pytest.param(DAYTIME, _at(20, 0), False, id="at-end"),
        pytest.param(OVERNIGHT, _at(23, 0), True, id="overnight-evening"),
        pytest.param(OVERNIGHT, _at(3, 0), True, id="overnight-after-midnight"),
        pytest.param(OVERNIGHT, _at(4, 0), False, id="overnight-end"),
        pytest.param(OVERNIGHT, _at(12, 0), False, id="overnight-midday"),
        pytest.param(OnHours(time(6, 0), 24), _at(3, 0), True, id="all-day"),
    ],
)
def test_is_on(window: OnHours, now: datetime, expected: bool) -> None:
    """The window covers exactly its hours, including across midnight."""
    assert window.is_on(now) is expected


@pytest.mark.parametrize(
    ("window", "now", "expected"),
    [
        pytest.param(DAYTIME, _at(5, 0), _at(6, 0), id="next-start"),
        pytest.param(DAYTIME, _at(12, 0), _at(20, 0), id="next-end"),
        pytest.param(DAYTIME, _at(21, 0), _at(6, 0, day=11), id="tomorrow"),
        pytest.param(OVERNIGHT, _at(2, 0), _at(4, 0), id="overnight-end"),
        pytest.param(OVERNIGHT, _at(23, 0), _at(4, 0, day=11), id="overnight-next-day"),
        pytest.param(OnHours(time(6, 0), 24), _at(3, 0), None, id="all-day"),
    ],
)
def test_next_change(window: OnHours, now: datetime, expected: datetime | None) -> None:
    """The next change is the window's next start or end."""
    assert window.next_change(now) == expected
