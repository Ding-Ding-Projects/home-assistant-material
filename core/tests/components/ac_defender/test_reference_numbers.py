"""The numbers taken from the original program, each pinned so the old guesses fail."""

from datetime import timedelta
from types import SimpleNamespace

import pytest

from homeassistant.components.ac_defender.coordinator import (
    MAX_COMMANDS,
    MAX_TOUCHES,
    DefenderCoordinator,
)
from homeassistant.components.ac_defender.guards.pacing import LowProfileGovernor
from homeassistant.components.ac_defender.pipeline import decide

from .common import NOW, command, make, only, run, touch


@pytest.mark.parametrize(
    ("room", "direct"),
    [(24.5, False), (24.99, False), (25.0, True), (26.0, True)],
)
def test_direct_cooling_starts_at_target_plus_two(room: float, direct: bool) -> None:
    """Direct cooling needs the room at my temperature plus 2.0, not plus 1.0."""
    _, ctx = run(keys=(), room=room, setpoint=27.0, my_temp=23.0)
    assert ctx.direct is direct


@pytest.mark.parametrize(
    ("touches", "expected"),
    [
        pytest.param([], 0.0, id="none"),
        pytest.param([touch(10, 23.0, 25.0)], 18.0, id="one_old_touch"),
        pytest.param([touch(1, 23.0, 25.0)], 36.0, id="one_fresh_touch"),
        pytest.param(
            [touch(5, 23.0, 25.0), touch(1, 24.0, 26.0)], 54.0, id="two_touches"
        ),
        pytest.param([touch(1, 23.0, 25.0)] * 6, 98.0, id="capped_at_80_plus_recency"),
    ],
)
def test_touch_pressure_is_eighteen_a_touch_plus_recency(
    touches: list, expected: float
) -> None:
    """18 points a touch up to 80, plus up to 20 for how recent the last touch is."""
    ctx, _ = make(touches=touches)
    assert ctx.touch_pressure() == pytest.approx(expected)


@pytest.mark.parametrize(
    ("commands", "expected"),
    [
        (0, 0.0),
        (1, 100 / 3),
        (2, 200 / 3),
        (3, 100.0),
        (5, 100.0),
    ],
)
def test_command_pressure_counts_against_three_commands(
    commands: int, expected: float
) -> None:
    """Three commands in the window is full pressure; the old formula needed four."""
    ctx, _ = make(commands=[command(5, 24.0) for _ in range(commands)])
    assert ctx.command_pressure() == pytest.approx(expected)


def governor(**fields):
    """Return the governor and a context."""
    ctx, guards = make(**fields)
    return next(g for g in guards if isinstance(g, LowProfileGovernor)), ctx


def test_governor_takes_the_command_score_at_twenty_two_a_command() -> None:
    """Three commands alone score 66, because the biggest of the parts wins."""
    guard, ctx = governor(commands=[command(5, 24.0) for _ in range(3)])
    assert guard.score(ctx) == 66


def test_governor_caps_commands_at_ninety() -> None:
    """Five commands cap at 90."""
    guard, ctx = governor(commands=[command(5, 24.0) for _ in range(5)])
    assert guard.score(ctx) == 90


def test_governor_scores_a_notice_by_count_and_recency() -> None:
    """A touch right after a command is a notice: 25 each up to 75, plus recency."""
    guard, ctx = governor(
        commands=[command(10, 24.0)],
        touches=[touch(9.5, 24.0, 25.0, "wall")],
    )
    assert len(ctx.notices(45, 180)) == 1
    assert ctx.touch_pressure() == 19
    assert guard.score(ctx) == 25


@pytest.mark.parametrize(
    ("setpoint", "parked"),
    [(24.0, 28.0), (27.0, 28.0), (29.0, 29.0)],
)
def test_siesta_parks_at_twenty_eight_and_never_lowers(
    setpoint: float, parked: float
) -> None:
    """The park number is 28.0 whatever the target is, and it only ever raises."""
    ctx, guards = make(options=only("siesta_watch"), room=23.0, setpoint=setpoint)
    siesta = next(g for g in guards if g.spec.key == "siesta_watch")
    siesta.start(ctx, 60)
    decision = decide(ctx, guards)
    assert decision.action == "set_temperature"
    assert decision.value == parked


def prune(touches: list, commands: list) -> SimpleNamespace:
    """Run the coordinator's pruning on plain data."""
    holder = SimpleNamespace(
        room_samples=[],
        outdoor_samples=[],
        reading_times=[],
        action_changes=[],
        touches=touches,
        commands=commands,
    )
    DefenderCoordinator._prune(holder, NOW)
    return holder


def test_touches_are_kept_by_count_not_by_a_two_hour_guess() -> None:
    """The original keeps its newest 100 changes whatever their age, up to a day here."""
    three_hours = prune([touch(180, 22.0, 23.0)], [])
    assert len(three_hours.touches) == 1
    old = prune([touch(25 * 60, 22.0, 23.0)], [])
    assert old.touches == []
    many = prune([touch(m % 60 + 1, 22.0, 23.0) for m in range(150)], [])
    assert len(many.touches) == MAX_TOUCHES == 100


def test_manual_comfort_grace_sees_a_touch_from_three_hours_ago() -> None:
    """Grace looks back 180 minutes, so the retention must reach that far."""
    kept = prune([touch(170, 22.0, 24.0)], []).touches
    ctx, _ = make(touches=kept)
    assert ctx.touches_in(180)


def test_commands_are_kept_up_to_two_hundred() -> None:
    """The original caps its own command times at 200."""
    many = prune([], [command(m % 60 + 1, 24.0) for m in range(300)])
    assert len(many.commands) == MAX_COMMANDS == 200


def cool_outdoor(minutes_off: int):
    """Return the context and guards of a cool-outdoor episode with a one minute dwell."""
    options = {
        "guards": {
            "cool_outdoor_shutdown": {
                "enabled": True,
                "settings": {"min_off_minutes": 1},
            }
        }
    }
    ctx, guards = make(
        options=options, outdoor=15.0, forecast_peak=17.0, room=22.0, setpoint=23.0
    )
    assert decide(ctx, guards).action == "turn_off"
    ctx.off_command_at = NOW
    ctx.hvac_mode = "off"
    ctx.outdoor = 25.0
    ctx.now = NOW + timedelta(minutes=minutes_off)
    return ctx, guards


@pytest.mark.parametrize(("minutes", "restored"), [(4, False), (5, True)])
def test_cool_outdoor_never_restores_before_the_five_minute_dwell(
    minutes: int, restored: bool
) -> None:
    """A setting of one minute still waits five, the original compressor dwell."""
    ctx, guards = cool_outdoor(minutes)
    assert (decide(ctx, guards).action == "set_hvac_mode") is restored


def test_cool_outdoor_settings_use_the_original_ranges() -> None:
    """The original clamps the trigger to 5 to 25, the margin to 0.5 to 5 and the dwell to 5 to 240."""
    ctx, _ = make(
        options={
            "guards": {
                "cool_outdoor_shutdown": {
                    "enabled": True,
                    "settings": {
                        "below": 40,
                        "restore_margin": 0,
                        "min_off_minutes": 1000,
                        "forecast_gate_hours": 48,
                    },
                }
            }
        }
    )
    cfg = ctx.cfg["cool_outdoor_shutdown"]
    assert (cfg.below, cfg.restore_margin, cfg.min_off_minutes) == (25, 0.5, 240)
    assert cfg.forecast_gate_hours == 12


def test_cool_outdoor_cannot_start_again_in_the_five_minutes_after_a_safety_restore() -> (
    None
):
    """A room-warming restore blocks a new shutdown for the minimum-on dwell."""
    options = {"guards": {"cool_outdoor_shutdown": {"enabled": True}}}
    ctx, guards = make(
        options=options, outdoor=15.0, forecast_peak=17.0, room=22.0, setpoint=23.0
    )
    assert decide(ctx, guards).action == "turn_off"
    ctx.off_command_at = NOW
    ctx.hvac_mode = "off"
    ctx.room = 24.8
    ctx.now = NOW + timedelta(minutes=1)
    assert decide(ctx, guards).value == "cool"
    ctx.hvac_mode = "cool"
    ctx.room = 22.0
    ctx.now = NOW + timedelta(minutes=3)
    assert decide(ctx, guards).action != "turn_off"
    ctx.now = NOW + timedelta(minutes=7)
    assert decide(ctx, guards).action == "turn_off"


@pytest.mark.parametrize(("minutes_on", "turns_off"), [(2, False), (6, True)])
def test_cooling_failure_does_not_turn_off_inside_the_minimum_on_dwell(
    minutes_on: int, turns_off: bool
) -> None:
    """Five minutes after cooling was restored, an old alert cannot turn it off."""
    from .common import minutes_ago  # noqa: PLC0415

    samples = [(minutes_ago(4), 25.0), (minutes_ago(0), 25.6)]
    ctx, guards = make(
        options=only("cooling_failure_watch"),
        room=25.6,
        setpoint=22.0,
        room_samples=samples,
    )
    ctx.state["cooling_failure_watch"] = {
        "idle_since": minutes_ago(45),
        "on_since": minutes_ago(minutes_on),
    }
    assert (decide(ctx, guards).action == "turn_off") is turns_off


def courtesy(seconds: float):
    """Return the decision about manual heating with a given courtesy wait."""
    decision, _ = run(
        "heat",
        keys=(),
        hvac_mode="heat",
        desired_mode="off",
        room=22.0,
        floor=16.0,
        courtesy_wait_seconds=seconds,
    )
    return decision


def test_a_courtesy_wait_of_zero_turns_manual_heating_off_at_once() -> None:
    """Zero minutes means no wait at all."""
    decision = courtesy(0.0)
    assert (decision.action, decision.value) == ("set_hvac_mode", "off")


@pytest.mark.parametrize("seconds", [60.0, 600.0, 1800.0])
def test_a_courtesy_wait_holds_first_for_the_chosen_time(seconds: float) -> None:
    """Any wait above zero holds, and the next check is when it ends."""
    decision = courtesy(seconds)
    assert decision.action is None
    assert decision.next_check == NOW + timedelta(seconds=seconds)
    assert decision.reason.code == "courtesy_wait"
