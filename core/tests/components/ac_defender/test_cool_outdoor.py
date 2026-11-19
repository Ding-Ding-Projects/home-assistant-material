"""Cool-outdoor shutdown and the off dwell, as the original program settles them."""

from datetime import timedelta

import pytest

from homeassistant.components.ac_defender.pipeline import decide

from .common import NOW, make, minutes_ago, only

OPTIONS = {"guards": {"cool_outdoor_shutdown": {"enabled": True}}}


def episode(**fields: object):
    """Return a context in a cool episode whose off command was just decided."""
    ctx, guards = make(
        options=OPTIONS,
        outdoor=15.0,
        forecast_peak=17.0,
        room=22.0,
        setpoint=23.0,
        **fields,
    )
    assert decide(ctx, guards).action == "turn_off"
    return ctx, guards


def test_an_off_command_that_was_not_sent_is_sent_again() -> None:
    """A unit still on because the command never went out is not a person overriding."""
    ctx, guards = episode()
    ctx.now = NOW + timedelta(minutes=1)
    assert decide(ctx, guards).action == "turn_off"


@pytest.mark.parametrize(
    ("seconds", "overridden"),
    [pytest.param(10, False, id="inside_grace"), pytest.param(30, True, id="after")],
)
def test_someone_turning_it_back_on_is_respected_after_the_command_grace(
    seconds: int, overridden: bool
) -> None:
    """Back on within 15 seconds of the command is the device catching up."""
    ctx, guards = episode()
    ctx.off_command_at = NOW
    ctx.now = NOW + timedelta(seconds=seconds)
    decide(ctx, guards)
    state = ctx.state["cool_outdoor_shutdown"]
    holding = bool(state.get("off")) and not state.get("override")
    assert holding is not overridden


def test_an_override_stands_aside_until_it_is_warm_outside() -> None:
    """After a person turned it on, no new off command in the same cool spell."""
    ctx, guards = episode()
    ctx.off_command_at = NOW
    ctx.now = NOW + timedelta(minutes=1)
    decide(ctx, guards)
    ctx.now = NOW + timedelta(hours=2)
    assert decide(ctx, guards).action is None
    ctx.outdoor = 25.0
    decide(ctx, guards)
    assert ctx.state["cool_outdoor_shutdown"] == {}


def test_the_off_dwell_counts_from_the_command_that_was_sent() -> None:
    """A command sent three minutes after the decision moves the dwell with it."""
    options = {
        "guards": {
            "cool_outdoor_shutdown": {
                "enabled": True,
                "settings": {"min_off_minutes": 5},
            }
        }
    }
    ctx, guards = make(
        options=options, outdoor=15.0, forecast_peak=17.0, room=22.0, setpoint=23.0
    )
    assert decide(ctx, guards).action == "turn_off"
    ctx.now = NOW + timedelta(minutes=3)
    assert decide(ctx, guards).action == "turn_off"
    ctx.off_command_at = ctx.now
    ctx.hvac_mode = "off"
    ctx.outdoor = 25.0
    ctx.now = NOW + timedelta(minutes=6)
    assert decide(ctx, guards).action is None
    ctx.now = NOW + timedelta(minutes=8)
    restore = decide(ctx, guards)
    assert (restore.action, restore.value) == ("set_hvac_mode", "cool")


def test_a_warming_room_restores_even_without_an_outdoor_reading() -> None:
    """An unknown outdoor reading blocks only the shutdown, never a restore."""
    ctx, guards = episode()
    ctx.off_command_at = NOW
    ctx.hvac_mode = "off"
    ctx.outdoor = None
    ctx.room = 24.8
    ctx.now = NOW + timedelta(minutes=1)
    restore = decide(ctx, guards)
    assert (restore.action, restore.value) == ("set_hvac_mode", "cool")


def test_an_off_it_did_not_send_is_handed_back_without_a_command() -> None:
    """A unit someone else turned off is adopted, and its restore is left to the usual rules."""
    ctx, guards = make(
        options=only("cool_outdoor_shutdown"),
        outdoor=15.0,
        forecast_peak=17.0,
        room=22.0,
        setpoint=23.0,
        hvac_mode="off",
    )
    assert decide(ctx, guards).action is None
    ctx.room = 24.8
    ctx.now = NOW + timedelta(minutes=1)
    assert decide(ctx, guards).action is None
    assert ctx.state["cool_outdoor_shutdown"]["reentry_until"] > ctx.now


@pytest.mark.parametrize(
    ("minutes_off", "restores"),
    [pytest.param(2, False, id="inside_dwell"), pytest.param(6, True, id="after")],
)
def test_cool_mode_restore_waits_for_the_five_minute_off_dwell(
    minutes_off: float, restores: bool
) -> None:
    """The mode is put back no sooner than five minutes after the unit went off."""
    ctx, guards = make(
        options=only("cool_mode_restore"),
        hvac_mode="off",
        room=23.5,
        setpoint=23.0,
        last_off_at=minutes_ago(minutes_off),
    )
    ctx.state["cool_mode_restore"] = {"since": minutes_ago(2), "delay": 10.0}
    assert (decide(ctx, guards).action == "set_hvac_mode") is restores


def test_a_warm_room_skips_the_off_dwell() -> None:
    """Room comfort still wins inside the dwell."""
    ctx, guards = make(
        options=only("cool_mode_restore"),
        hvac_mode="off",
        room=25.0,
        setpoint=23.0,
        last_off_at=minutes_ago(1),
    )
    assert decide(ctx, guards).action == "set_hvac_mode"
