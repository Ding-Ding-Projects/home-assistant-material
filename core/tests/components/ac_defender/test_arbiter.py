"""The brother and sister share one band and never fight."""

from datetime import timedelta

import pytest

from homeassistant.components.ac_defender.arbiter import (
    AC,
    HEAT,
    NEITHER,
    SAFETY,
    Arbiter,
    BandError,
    validate_band,
)

from .common import NOW


def pair() -> Arbiter:
    """Return an arbiter with both siblings and a 21 to 23 band."""
    arbiter = Arbiter(21.0, 23.0)
    arbiter.register(AC)
    arbiter.register(HEAT)
    return arbiter


@pytest.mark.parametrize(
    ("low", "high", "floor", "error"),
    [
        (23.0, 21.0, None, "band_crossed"),
        (22.0, 22.0, None, "band_crossed"),
        (22.5, 23.0, None, "band_too_narrow"),
        (16.0, 23.0, 16.0, "band_under_floor"),
    ],
)
def test_band_validation(
    low: float, high: float, floor: float | None, error: str
) -> None:
    """A crossed, overlapping or too narrow band is refused with a plain key."""
    with pytest.raises(BandError, match=error):
        validate_band(low, high, floor)
    arbiter = pair()
    with pytest.raises(BandError, match=error):
        arbiter.set_band(low, high, floor)
    assert (arbiter.low, arbiter.high) == (21.0, 23.0)
    validate_band(21.0, 23.0, 16.0)


def test_inside_the_band_neither_moves() -> None:
    """Inside the band nobody holds the room and nobody may command."""
    arbiter = pair()
    assert arbiter.evaluate(NOW, 22.0) == NEITHER
    assert not arbiter.may_command(AC, NOW)


def test_hot_room_with_heating_on_hands_over_after_heat_is_off() -> None:
    """She turns heating off first, he does not cool until hers is confirmed off."""
    arbiter = pair()
    arbiter.members[HEAT].running = True
    assert arbiter.evaluate(NOW, 24.0) == HEAT
    assert not arbiter.may_command(AC, NOW)
    assert arbiter.may_command(HEAT, NOW)
    arbiter.members[HEAT].running = False
    arbiter.members[HEAT].off_confirmed = True
    later = NOW + timedelta(minutes=1)
    assert arbiter.evaluate(later, 24.0) == AC
    assert arbiter.may_command(AC, later)
    assert "Yours" in arbiter.events[-1].text()


def test_cooling_toward_her_floor_stops_and_hands_over() -> None:
    """When cooling pulls the room under the band he stops and hands to her."""
    arbiter = pair()
    arbiter.holder = AC
    arbiter.members[AC].running = True
    assert arbiter.evaluate(NOW, 20.5) == HEAT
    assert not arbiter.may_command(AC, NOW)
    assert arbiter.events[-1].kind == "stop"
    assert "20.5" in arbiter.events[-1].text()


def test_pause_is_told_to_the_other_and_it_stays_in_band() -> None:
    """Pausing one tells the other and the paused one never commands."""
    arbiter = pair()
    arbiter.set_paused(AC, True, NOW, 24.0)
    assert arbiter.events[-1].kind == "paused"
    assert arbiter.evaluate(NOW, 24.0) == NEITHER
    assert not arbiter.may_command(AC, NOW)


def test_hysteresis_limits_handovers() -> None:
    """No ping-pong: at most one brother and sister handover per interval."""
    arbiter = pair()
    arbiter.holder = AC
    arbiter.evaluate(NOW, 20.5)
    assert arbiter.holder == HEAT
    assert arbiter.evaluate(NOW + timedelta(minutes=1), 23.5) == HEAT
    assert arbiter.evaluate(NOW + timedelta(minutes=11), 23.5) == AC


def test_guard_time_blocks_a_command_right_after_the_other() -> None:
    """Neither sends a command inside the other's guard time."""
    arbiter = pair()
    arbiter.holder = NEITHER
    arbiter.note_command(AC, NOW)
    assert not arbiter.may_command(HEAT, NOW + timedelta(seconds=30))
    assert arbiter.may_command(HEAT, NOW + timedelta(minutes=3))


@pytest.mark.parametrize(
    ("room", "role", "other"),
    [(18.0, HEAT, AC), (29.0, AC, HEAT)],
)
def test_safety_outranks_comfort_both_ways(room: float, role: str, other: str) -> None:
    """Her floor and his hot-room limit outrank the other's comfort, always."""
    arbiter = pair()
    arbiter.members[role].safety_active = True
    assert arbiter.evaluate(NOW, room) == f"{SAFETY}:{role}"
    assert arbiter.may_command(role, NOW)
    assert not arbiter.may_command(other, NOW)
    assert arbiter.events[-1].kind == "safety"
    assert "brother" not in arbiter.events[-1].text()


def test_alone_behaves_as_before() -> None:
    """With one sibling the arbiter never blocks or reports anything."""
    arbiter = Arbiter(21.0, 23.0)
    arbiter.register(AC)
    assert arbiter.alone()
    assert arbiter.evaluate(NOW, 30.0) == NEITHER
    assert arbiter.may_command(AC, NOW)
    assert not arbiter.events
    arbiter.register(HEAT)
    arbiter.unregister(HEAT)
    assert arbiter.alone()
