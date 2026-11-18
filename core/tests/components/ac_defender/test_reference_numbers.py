"""The numbers taken from the original program, each pinned so the old guesses fail."""

import pytest

from homeassistant.components.ac_defender.guards.pacing import LowProfileGovernor
from homeassistant.components.ac_defender.pipeline import decide

from .common import command, make, only, run, touch


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
