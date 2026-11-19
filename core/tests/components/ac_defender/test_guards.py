"""Behaviour of the guard families with a fake clock and a fake device."""

from datetime import timedelta

import pytest

from homeassistant.components.ac_defender.guards import ALL_GUARD_CLASSES, guards_for
from homeassistant.components.ac_defender.guards.people import RivalBlock, active_block
from homeassistant.components.ac_defender.pipeline import decide

from .common import NOW, command, make, minutes_ago, only, run, touch


def test_registry_lists_every_guard_once() -> None:
    """All 51 guards exist exactly once and heat offers a reduced set."""
    keys = [cls.spec.key for cls in ALL_GUARD_CLASSES]
    assert len(keys) == len(set(keys)) == 51
    heat = {g.spec.key for g in guards_for("heat")}
    assert "cooling_failure_watch" not in heat
    assert "rival_schedule_watch" in heat
    assert len(heat) < len(keys)


def test_my_temp_is_walked_back_in_gentle_steps() -> None:
    """A raised setpoint is stepped back toward my temperature, never jumped."""
    decision, _ = run(keys=("comfort_sync",), room=23.4, setpoint=26.0)
    assert decision.action == "set_temperature"
    assert decision.value == 25.0
    again, _ = run(keys=(), room=23.4, setpoint=25.0)
    assert again.value == 23.0


def test_nothing_to_do_at_my_temperature() -> None:
    """At my temperature nothing is sent."""
    decision, _ = run(keys=(), room=23.0, setpoint=23.0)
    assert decision.action is None


def test_people_get_courtesy_machines_do_not() -> None:
    """A wall touch waits, a rival schedule push is answered at once."""
    wall, _ = run(
        keys=("wall_settling",),
        room=23.5,
        setpoint=26.0,
        touches=[touch(0.2, 23.0, 25.0), touch(0.1, 25.0, 26.0)],
    )
    assert wall.state == "waiting"
    assert wall.action is None
    block = RivalBlock("Sleep", "00:00", 23.0, 26.0, tuple(range(7)))
    schedule, _ = run(
        keys=("wall_settling", "rival_schedule_watch"),
        room=23.5,
        setpoint=26.0,
        touches=[touch(0.1, 23.0, 26.0, "schedule")],
        schedule_block=block,
    )
    assert schedule.action == "set_temperature"


@pytest.mark.parametrize(
    ("guard", "extra"),
    [
        ("wall_settling", {"touches": [touch(0.2, 23, 26), touch(0.1, 26, 26.5)]}),
        ("dynamic_cooldown", {"touches": [touch(0.2, 23, 26)]}),
        ("comfort_sync", {"touches": [touch(0.2, 23, 26)]}),
        ("command_spacing", {"commands": [command(0.5, 25.0)]}),
        (
            "visibility_guard",
            {"touches": [touch(2, 25, 26)], "commands": [command(2.5, 25)]},
        ),
        (
            "remote_settling_guard",
            {"touches": [touch(1, 23, 25, "user"), touch(0.5, 25, 26, "user")]},
        ),
        ("conflict_quiet", {"touches": [touch(i, 23, 26) for i in (4, 3, 2, 1)]}),
        ("comfort_budget", {"commands": [command(i, 25) for i in (20, 10, 5)]}),
        (
            "tug_of_war_truce",
            {"touches": [touch(6, 23, 25), touch(4, 25, 23), touch(2, 23, 25)]},
        ),
        ("natural_cadence", {"touches": [touch(0.5, 23, 26), touch(0.2, 26, 27)]}),
    ],
)
def test_pacing_guards_hold_then_release(guard: str, extra: dict) -> None:
    """Each timing guard holds a safe correction and lets it through later."""
    decision, _ = run(keys=(guard,), room=23.5, setpoint=27.0, **extra)
    assert decision.state == "waiting"
    assert decision.guard == guard
    assert decision.next_check is not None
    late, _ = run(
        keys=(guard,),
        room=23.5,
        setpoint=27.0,
        now=decision.next_check + timedelta(seconds=1),
        **extra,
    )
    assert late.state != "waiting" or late.guard != guard


def test_a_warm_room_steps_every_pacing_guard_aside() -> None:
    """Above the guard's band the waits are cleared."""
    decision, _ = run(
        keys=("wall_settling", "comfort_sync"),
        room=25.5,
        setpoint=27.0,
        touches=[touch(0.2, 23, 26), touch(0.1, 26, 27)],
    )
    assert decision.state != "waiting"


def test_cooler_intent_clears_quiet_waits() -> None:
    """People dialing cooler skip the quiet waits."""
    touches = [touch(30, 25, 24), touch(10, 24, 23)]
    decision, _ = run(
        keys=("cooler_intent_fast_lane", "dynamic_cooldown"),
        room=23.6,
        setpoint=25.0,
        touches=touches,
    )
    assert decision.action == "set_temperature"


def test_repeated_raise_surrender_adopts_the_persons_number() -> None:
    """Three raises to about the same number: the person wins for four hours."""
    touches = [touch(20, 23, 25), touch(12, 24, 25.2), touch(5, 24, 25)]
    decision, ctx = run(
        keys=("repeated_raise_surrender",), room=24.0, setpoint=25.0, touches=touches
    )
    assert ctx.target == pytest.approx(25.07, abs=0.1)
    assert decision.action is None


def test_wake_up_truce_adopts_a_warmer_target_at_dawn() -> None:
    """The bedroom door opening in the dawn window adopts the truce number."""
    opened = NOW.replace(hour=6, minute=0)
    ctx, guards = make(
        options=only("wake_up_truce"),
        room=24.0,
        setpoint=25.0,
        door_opened_at=opened,
        now=opened + timedelta(minutes=5),
    )
    decision = decide(ctx, guards)
    assert ctx.target == 25.0
    assert decision.action is None


def test_cool_mode_restore_waits_then_restores() -> None:
    """A changed mode is restored after a pause, immediately in a warm room."""
    waiting, ctx = run(keys=("cool_mode_restore",), hvac_mode="heat", room=23.2)
    assert waiting.state == "waiting"
    later, _ = run(
        keys=("cool_mode_restore",),
        hvac_mode="heat",
        room=23.2,
        now=waiting.next_check + timedelta(seconds=1),
        state=ctx.state,
    )
    assert (later.action, later.value) == ("set_hvac_mode", "cool")
    urgent, _ = run(keys=("cool_mode_restore",), hvac_mode="off", room=24.5)
    assert urgent.action == "set_hvac_mode"


@pytest.mark.parametrize(
    ("desired", "hvac_mode", "room", "expected"),
    [
        ("off", "cool", 24.0, None),
        ("off", "heat", 22.0, "turn_off"),
        ("heat", "cool", 19.0, None),
        ("heat", "off", 24.0, None),
        ("heat", "off", 19.0, "set_hvac_mode"),
    ],
)
def test_heat_mode_restore_only_restores_her_own_choice(
    desired: str, hvac_mode: str, room: float, expected: str | None
) -> None:
    """The heat direction never turns heating on above her cap or against a cool mode."""
    first, ctx = run(
        "heat",
        keys=("cool_mode_restore",),
        hvac_mode=hvac_mode,
        desired_mode=desired,
        room=room,
        my_temp=21.0,
    )
    if expected is None:
        assert first.action is None
        assert first.state != "waiting"
        return
    later, _ = run(
        "heat",
        keys=("cool_mode_restore",),
        hvac_mode=hvac_mode,
        desired_mode=desired,
        room=room,
        my_temp=21.0,
        now=first.next_check + timedelta(seconds=1),
        state=ctx.state,
    )
    assert later.action == expected


def test_manual_heating_is_turned_off_after_a_courtesy_wait_from_the_change() -> None:
    """The wait counts from when heating was seen on, not from her last command."""
    first, ctx = run(
        "heat",
        keys=(),
        hvac_mode="heat",
        desired_mode="off",
        room=22.0,
        floor=16.0,
        last_command_time=NOW - timedelta(hours=3),
    )
    assert first.action is None
    assert first.state == "waiting"
    later, _ = run(
        "heat",
        keys=(),
        hvac_mode="heat",
        desired_mode="off",
        room=22.0,
        floor=16.0,
        now=first.next_check + timedelta(seconds=1),
        state=ctx.state,
    )
    assert (later.action, later.value) == ("set_hvac_mode", "off")


def test_keeping_heat_off_never_touches_the_cool_mode() -> None:
    """A mode that belongs to the air conditioner is left alone by the sister."""
    decision, _ = run(
        "heat", keys=(), hvac_mode="cool", desired_mode="off", room=24.0, floor=16.0
    )
    assert decision.action is None


def test_repeat_quiet_and_echo_use_the_real_command_history() -> None:
    """The same number is not repeated at once, and an echo is awaited."""
    repeat, _ = run(
        keys=("repeat_quiet",), room=23.5, setpoint=24.0, commands=[command(1, 23.0)]
    )
    assert repeat.state == "waiting"
    echo, _ = run(
        keys=("setpoint_echo",),
        room=23.5,
        setpoint=26.0,
        pending_echo=(25.0, minutes_ago(0.1)),
    )
    assert echo.state == "waiting"


def test_cooling_runway_and_trend_guards() -> None:
    """A fresh cooling cycle and a room cooling on its own both hold the nudge."""
    runway, _ = run(
        keys=("cooling_runway",),
        room=23.5,
        setpoint=25.0,
        hvac_action="cooling",
        cooling_started=minutes_ago(0.5),
    )
    assert runway.state == "waiting"
    samples = [(minutes_ago(10), 24.6), (minutes_ago(0), 23.7)]
    trend, _ = run(
        keys=("room_trend_guard",), room=23.7, setpoint=25.0, room_samples=samples
    )
    assert trend.state == "waiting"


def test_peak_saver_holds_extra_cooling_but_not_in_a_hot_room() -> None:
    """During peak hours extra cooling waits unless the room is warm."""
    decision, _ = run(
        keys=("peak_power_saver",), room=23.4, setpoint=25.0, price_period="on_peak"
    )
    assert decision.state == "waiting"
    hot, _ = run(
        keys=("peak_power_saver",), room=25.0, setpoint=27.0, price_period="on_peak"
    )
    assert hot.state != "waiting"


def test_cool_outdoor_shutdown_turns_off_once_and_restores() -> None:
    """Cool outside with a cool forecast: one off command, then restore when warm."""
    options = {"guards": {"cool_outdoor_shutdown": {"enabled": True}}}
    ctx, guards = make(
        options=options, outdoor=15.0, forecast_peak=17.0, room=22.0, setpoint=23.0
    )
    assert decide(ctx, guards).action == "turn_off"
    ctx.off_command_at = NOW
    ctx.hvac_mode = "off"
    assert decide(ctx, guards).action is None
    ctx.outdoor = 25.0
    ctx.now = NOW + timedelta(minutes=45)
    restore = decide(ctx, guards)
    assert (restore.action, restore.value) == ("set_hvac_mode", "cool")


def test_siesta_parks_then_wakes_on_heat() -> None:
    """A siesta parks the unit and wakes when the room passes the wake band."""
    ctx, guards = make(options=only("siesta_watch"), room=23.2, setpoint=23.0)
    siesta = next(g for g in guards if g.spec.key == "siesta_watch")
    siesta.start(ctx, 120)
    assert decide(ctx, guards).action == "set_temperature"
    assert decide(ctx, guards).state == "standing_down"
    ctx.room = 25.0
    assert decide(ctx, guards).state != "standing_down"


def test_enforcer_restores_state_changed_by_someone_else() -> None:
    """A change by a non-owner is debounced, then restored firmly."""
    options = {
        "guards": {
            "desired_state_enforcer": {
                "enabled": True,
                "settings": {"gentle_shaping": False},
            }
        }
    }
    touches = [touch(1, 23, 21)]
    ctx, guards = make(options=options, room=22.0, setpoint=21.0, touches=touches)
    result = decide(ctx, guards)
    assert (result.action, result.value) == ("set_temperature", 23.0)
    assert decide(ctx, guards).action is None


def test_active_rival_block_follows_the_weekday_and_start_time() -> None:
    """The block in force is the latest one that started."""
    blocks = [
        RivalBlock("Sleep", "22:00", 23.0, 26.0, tuple(range(7))),
        RivalBlock("Morning", "06:00", 24.0, 26.0, tuple(range(7))),
    ]
    assert active_block(blocks, NOW.replace(hour=7)).name == "Morning"
    assert active_block(blocks, NOW.replace(hour=2)).name == "Sleep"


def test_tamper_truce_stands_down_after_an_exchange() -> None:
    """The thermostat vanishing right after an exchange starts a two hour truce."""
    ctx, guards = make(
        options=only("tamper_truce"),
        available=False,
        commands=[command(5, 24)],
        touches=[touch(10, 23, 25)],
    )
    decide(ctx, guards)
    ctx.available = True
    result = decide(ctx, guards)
    assert result.state == "standing_down"
    assert "tamper truce" in result.reason
