"""Safety always wins: hot rooms, emergencies, and every heat floor rule."""

import pytest

from homeassistant.components.ac_defender.guards.safety import (
    EmergencyProtocols,
    HotRoomOverride,
)
from homeassistant.components.ac_defender.model import Standdown
from homeassistant.components.ac_defender.pipeline import (
    FLOOR_MIN,
    clamp_floor,
    decide,
    effective_floor,
)

from .common import make, minutes_ago, only, run, touch

PAUSED = Standdown("paused", None, "paused by the owner")
STOPPED = Standdown("stopped", None, "everything stopped", stop_everything=True)


def test_hot_room_acts_while_courtesy_waits_are_holding() -> None:
    """A hot room skips every wait, even when courtesy guards want to hold."""
    decision, _ = run(
        keys=("hot_room_override", "dynamic_cooldown", "comfort_sync"),
        room=28.5,
        setpoint=30.0,
        touches=[touch(1, 23.0, 30.0)],
    )
    assert decision.action == "set_temperature"
    assert decision.value == 28.0
    assert decision.guard == "hot_room_override"


def test_hot_room_acts_while_paused() -> None:
    """Pausing is courtesy, safety guards keep watching."""
    decision, _ = run(
        keys=("hot_room_override",), room=29.0, setpoint=30.0, pause=PAUSED
    )
    assert decision.action == "set_temperature"


def test_stop_everything_stops_even_the_hot_room_guard() -> None:
    """An explicit stop is the owner's emergency brake and sends nothing."""
    decision, _ = run(
        keys=("hot_room_override",), room=29.0, setpoint=30.0, pause=STOPPED
    )
    assert decision.action is None
    assert decision.state == "stopped"


def test_emergency_protocol_stops_everything() -> None:
    """An emergency stand-down sends no command, a hot room included."""
    ctx, guards = make(
        options=only("hot_room_override", "emergency_protocols"), room=29.0
    )
    guard = next(g for g in guards if isinstance(g, EmergencyProtocols))
    guard.start(ctx, "someone_upset")
    decision = decide(ctx, guards)
    assert decision.state == "emergency"
    assert decision.action is None


def test_too_cold_emergency_turns_the_unit_off_once() -> None:
    """The too cold protocol parks the unit off."""
    ctx, guards = make(options=only("emergency_protocols"), room=22.0)
    next(g for g in guards if isinstance(g, EmergencyProtocols)).start(ctx, "too_cold")
    first = decide(ctx, guards)
    assert first.action == "turn_off"
    assert decide(ctx, guards).action is None


def test_hot_room_restores_cool_mode() -> None:
    """A hot room with the wrong mode gets the mode back first."""
    decision, _ = run(keys=("hot_room_override",), room=29.0, hvac_mode="heat")
    assert (decision.action, decision.value) == ("set_hvac_mode", "cool")
    assert HotRoomOverride.spec.safety


def test_front_door_turns_off_and_pauses() -> None:
    """A person at the door stands the defender down and turns the unit off."""
    decision, _ = run(keys=("front_door_guard_post",), person_at_door=True)
    assert decision.action == "turn_off"


def test_cooling_failure_needs_a_rising_room_to_turn_off() -> None:
    """MEGA alone only alerts, OMEGA (a rising room) authorizes OFF."""
    samples = [(minutes_ago(4), 25.0), (minutes_ago(0), 25.6)]
    ctx, guards = make(
        options=only("cooling_failure_watch"),
        room=25.6,
        setpoint=22.0,
        room_samples=samples,
    )
    ctx.state["cooling_failure_watch"] = {"idle_since": minutes_ago(45)}
    decision = decide(ctx, guards)
    assert ctx.state["cooling_failure_watch"]["alert"] == "omega"
    assert decision.action == "turn_off"

    flat = [(minutes_ago(4), 25.6), (minutes_ago(0), 25.6)]
    ctx, guards = make(
        options=only("cooling_failure_watch"),
        room=25.6,
        setpoint=22.0,
        room_samples=flat,
    )
    ctx.state["cooling_failure_watch"] = {"idle_since": minutes_ago(45)}
    decision = decide(ctx, guards)
    assert ctx.state["cooling_failure_watch"]["alert"] == "mega"
    assert decision.action is None


@pytest.mark.parametrize("value", [5.0, 0.0, -3.0, None, "bad", 9.99])
def test_floor_is_clamped_to_ten(value: object) -> None:
    """Every route that sets a floor ends at 10 or above."""
    assert clamp_floor(value) == FLOOR_MIN  # type: ignore[arg-type]
    floor, _ = effective_floor(value, None, True, 5.0)  # type: ignore[arg-type]
    assert floor == FLOOR_MIN


def test_engine_clamps_a_floor_of_five() -> None:
    """The engine itself ignores a floor under ten, whatever the caller passed."""
    decision, ctx = run(
        "heat", keys=(), floor=5.0, room=7.0, setpoint=20.0, my_temp=19.0
    )
    assert ctx.floor == FLOOR_MIN
    assert decision.state == "heating_allowed"


@pytest.mark.parametrize("mode", ["heat", "off", "auto"])
def test_heating_is_allowed_below_the_floor_whatever_the_mode(mode: str) -> None:
    """At 15.9 with a floor of 16 the defender never stops the heating."""
    decision, _ = run(
        "heat",
        keys=("hot_room_override",),
        floor=16.0,
        room=15.9,
        setpoint=12.0,
        hvac_mode=mode,
        my_temp=19.0,
        desired_mode="off",
    )
    assert decision.state == "heating_allowed"
    assert decision.action != "turn_off"
    if mode == "off":
        assert (decision.action, decision.value) == ("set_hvac_mode", "heat")
    else:
        assert (decision.action, decision.value) == ("set_temperature", 17.0)


def test_heating_stays_allowed_until_floor_plus_margin() -> None:
    """Hysteresis: defending resumes only above the floor plus the margin."""
    ctx, guards = make(
        "heat", only(), floor=16.0, room=15.9, setpoint=17.0, my_temp=19.0
    )
    assert decide(ctx, guards).state == "heating_allowed"
    ctx.room = 16.5
    assert decide(ctx, guards).state == "heating_allowed"
    ctx.room = 17.1
    assert decide(ctx, guards).state != "heating_allowed"


def test_stale_reading_stands_down_completely() -> None:
    """No reading for 30 minutes: no command at all, and it says so."""
    decision, _ = run(
        "heat",
        keys=("hot_room_override",),
        floor=16.0,
        room=30.0,
        setpoint=25.0,
        reading_age=31 * 60.0,
        safety_temp=26.0,
    )
    assert decision.action is None
    assert "no fresh room temperature" in decision.reason
    missing, _ = run("heat", keys=(), floor=16.0, room=None, setpoint=25.0)
    assert missing.action is None


def test_fresh_reading_still_defends() -> None:
    """A fresh reading above the floor defends normally."""
    decision, _ = run(
        "heat",
        keys=("hot_room_override",),
        floor=16.0,
        room=27.0,
        setpoint=28.0,
        safety_temp=26.0,
        my_temp=21.0,
        reading_age=60.0,
    )
    assert decision.action == "set_temperature"


def test_freezing_outdoors_raises_the_floor() -> None:
    """At or below 0 outside the floor rises to 18, and the guard can be disabled."""
    decision, ctx = run(
        "heat",
        keys=(),
        floor=16.0,
        freeze_floor=18.0,
        outdoor=-2.0,
        room=17.0,
        setpoint=12.0,
        my_temp=19.0,
    )
    assert ctx.floor == 18.0
    assert decision.state == "heating_allowed"
    assert effective_floor(16.0, -2.0, False, 18.0) == (16.0, False)
    assert effective_floor(16.0, 1.0, True, 18.0) == (16.0, False)
    assert effective_floor(16.0, 0.0, True, 18.0) == (18.0, True)


@pytest.mark.parametrize("preset", ["frost_protection", "away"])
def test_protective_preset_stands_down(preset: str) -> None:
    """A frost protection or away minimum mode on the device is left alone."""
    decision, _ = run(
        "heat",
        keys=("hot_room_override",),
        floor=16.0,
        room=30.0,
        setpoint=25.0,
        preset_mode=preset,
        protective_preset=True,
        safety_temp=26.0,
    )
    assert decision.action is None
    assert "frost protection" in decision.reason


def test_unavailable_device_gets_no_command() -> None:
    """Heating is never turned off while the climate entity is unavailable."""
    decision, _ = run(
        "heat",
        keys=("hot_room_override",),
        floor=16.0,
        room=30.0,
        setpoint=25.0,
        available=False,
        safety_temp=26.0,
    )
    assert decision.action is None


def test_no_command_goes_under_the_floor() -> None:
    """A walk-back toward a low cap never commands below the floor."""
    decision, ctx = run(
        "heat",
        keys=("hot_room_override",),
        floor=16.0,
        room=18.0,
        setpoint=21.0,
        my_temp=12.0,
        reading_age=0.0,
    )
    assert ctx.target >= 16.0
    assert decision.action == "set_temperature"
    assert decision.value >= 16.0
