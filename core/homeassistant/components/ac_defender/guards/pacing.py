"""Timing guards: they space corrections out after people touch the thermostat."""

from datetime import datetime, timedelta
from itertools import pairwise
import math

from ..model import Ctx, Hold
from ..spec import GROUP_TIMING, GuardSpec, cnt, deg, flag, mins, sec
from .base import EpochHold


def scaled(low: float, high: float, pressure: float) -> float:
    """Scale between two values by a 0 to 100 pressure."""
    return low + (high - low) * max(0.0, min(100.0, pressure)) / 100.0


def median_interval(ctx: Ctx, window_minutes: float = 120) -> float | None:
    """Return the median seconds between recent readings."""
    limit = ctx.now - timedelta(minutes=window_minutes)
    times = [t for t in ctx.reading_times if t >= limit]
    gaps = sorted((b - a).total_seconds() for a, b in pairwise(times))
    gaps = [g for g in gaps if g > 0]
    if not gaps:
        return None
    return gaps[len(gaps) // 2]


class VisibilityGuard(EpochHold):
    """Slow down after a touch lands right after a command."""

    spec = GuardSpec(
        "visibility_guard",
        "pacing",
        GROUP_TIMING,
        (
            cnt("trigger_notices", 1),
            mins("window_minutes", 45),
            sec("after_command_seconds", 180),
            mins("min_hold_minutes", 8),
            mins("max_hold_minutes", 35),
            deg("band", 1.0),
        ),
    )
    reason_text = "a touch followed the last command, so the next step waits"

    def _notices(self, ctx: Ctx):
        c = self.cfg(ctx)
        return ctx.notices(c.window_minutes, c.after_command_seconds)

    def trigger(self, ctx: Ctx) -> bool:
        """Apply this rule of the guard."""
        return len(self._notices(ctx)) >= self.cfg(ctx).trigger_notices

    def anchor(self, ctx: Ctx) -> datetime | None:
        """Apply this rule of the guard."""
        notices = self._notices(ctx)
        return notices[-1].time if notices else None

    def duration(self, ctx: Ctx) -> float:
        """Apply this rule of the guard."""
        c = self.cfg(ctx)
        pressure = min(100.0, 50.0 * len(self._notices(ctx)))
        return 60 * scaled(c.min_hold_minutes, c.max_hold_minutes, pressure)


class RoutineTiming(EpochHold):
    """Wait for the next tidy clock boundary."""

    spec = GuardSpec(
        "routine_timing",
        "pacing",
        GROUP_TIMING,
        (
            cnt("trigger_touches", 2),
            mins("interval_minutes", 5, 60),
            mins("jitter_minutes", 2, 30),
            mins("max_delay_minutes", 12, 120),
            deg("band", 1.0),
        ),
    )
    reason_text = "lining the correction up with the next routine time slot"

    def trigger(self, ctx: Ctx) -> bool:
        """Apply this rule of the guard."""
        return len(ctx.touches_in(30)) >= self.cfg(ctx).trigger_touches

    def anchor(self, ctx: Ctx) -> datetime | None:
        """Apply this rule of the guard."""
        return self.latest_touch(ctx)

    def duration(self, ctx: Ctx) -> float:
        """Apply this rule of the guard."""
        c = self.cfg(ctx)
        anchor = self.latest_touch(ctx)
        if anchor is None:
            return 0.0
        interval = max(1.0, c.interval_minutes) * 60
        epoch = anchor.timestamp()
        wait = interval - (epoch % interval)
        wait += ctx.rng.uniform(0, c.jitter_minutes * 60)
        return min(wait, c.max_delay_minutes * 60)


class ComfortBudget(EpochHold):
    """Cap the number of corrections in a rolling window."""

    spec = GuardSpec(
        "comfort_budget",
        "pacing",
        GROUP_TIMING,
        (mins("window_minutes", 30, 240), cnt("max_commands", 3), deg("band", 1.2)),
    )

    def hold(self, ctx: Ctx) -> Hold | None:
        """Apply this rule of the guard."""
        c = self.cfg(ctx)
        if ctx.over_band(c.band):
            return None
        recent = ctx.commands_in(c.window_minutes)
        if len(recent) < c.max_commands:
            return None
        until = recent[0].time + timedelta(minutes=c.window_minutes)
        if ctx.now >= until:
            return None
        return self.hold_for(
            ctx, until, "the correction budget for this window is used"
        )


class CommandSpacing(EpochHold):
    """Keep a minimum gap after each command, longer under pressure."""

    spec = GuardSpec(
        "command_spacing",
        "pacing",
        GROUP_TIMING,
        (
            sec("min_gap_seconds", 180),
            sec("pressure_extra_seconds", 360),
            deg("band", 1.0),
        ),
    )
    reason_text = "giving the last command room before the next one"

    def trigger(self, ctx: Ctx) -> bool:
        """Apply this rule of the guard."""
        return bool(ctx.commands)

    def anchor(self, ctx: Ctx) -> datetime | None:
        """Apply this rule of the guard."""
        return self.last_command(ctx)

    def duration(self, ctx: Ctx) -> float:
        """Apply this rule of the guard."""
        c = self.cfg(ctx)
        pressure = max(ctx.touch_pressure(), ctx.command_pressure())
        return c.min_gap_seconds + c.pressure_extra_seconds * pressure / 100.0


class LowProfileGovernor(EpochHold):
    """Hold safe corrections when the whole exchange has become busy."""

    spec = GuardSpec(
        "low_profile_governor",
        "pacing",
        GROUP_TIMING,
        (
            cnt("trigger_score", 65, 100),
            mins("min_hold_minutes", 5),
            mins("max_hold_minutes", 25),
            deg("band", 1.2),
        ),
    )
    reason_text = "too much back and forth, holding a low profile"

    def score(self, ctx: Ctx) -> float:
        """Return the 0 to 100 pressure score."""
        found = ctx.notices(45, 180)
        notices = 0.0
        if found:
            minutes = max(
                0.0, (ctx.now - max(t.time for t in found)).total_seconds() / 60
            )
            notices = min(
                100.0,
                min(75.0, 25.0 * len(found)) + max(0.0, 25.0 - round(minutes * 3.0)),
            )
        touch = ctx.touch_pressure()
        commands = min(90.0, 22.0 * len(ctx.commands_in(30)))
        remote = min(85.0, 24.0 * len(ctx.touches_in(30, remote=True)))
        blend = round(0.45 * touch + 0.25 * notices + 0.2 * commands + 0.1 * remote)
        return max(touch, notices, commands, blend)

    def trigger(self, ctx: Ctx) -> bool:
        """Apply this rule of the guard."""
        return self.score(ctx) >= self.cfg(ctx).trigger_score

    def anchor(self, ctx: Ctx) -> datetime | None:
        """Apply this rule of the guard."""
        times = [t.time for t in ctx.touches_in(30)] + [
            c.time for c in ctx.commands_in(30)
        ]
        return max(times) if times else None

    def duration(self, ctx: Ctx) -> float:
        """Apply this rule of the guard."""
        c = self.cfg(ctx)
        return 60 * scaled(c.min_hold_minutes, c.max_hold_minutes, self.score(ctx))


class NaturalCadence(EpochHold):
    """Pick a variable future slot for the next nudge."""

    spec = GuardSpec(
        "natural_cadence",
        "pacing",
        GROUP_TIMING,
        (
            cnt("trigger_touches", 2),
            mins("min_minutes", 3),
            mins("max_minutes", 18),
            mins("jitter_minutes", 4, 60),
            deg("band", 1.0),
        ),
    )
    reason_text = "waiting for the next nudge slot"

    def trigger(self, ctx: Ctx) -> bool:
        """Apply this rule of the guard."""
        return len(ctx.touches_in(30)) >= self.cfg(ctx).trigger_touches

    def anchor(self, ctx: Ctx) -> datetime | None:
        """Apply this rule of the guard."""
        return self.latest_touch(ctx)

    def duration(self, ctx: Ctx) -> float:
        """Apply this rule of the guard."""
        c = self.cfg(ctx)
        pressure = max(ctx.touch_pressure(), ctx.command_pressure())
        base = scaled(c.min_minutes, c.max_minutes, pressure)
        return 60 * (base + ctx.rng.uniform(0, c.jitter_minutes))


class ComfortPace(EpochHold):
    """Plan a calm slot under heavy back and forth."""

    spec = GuardSpec(
        "comfort_pace",
        "pacing",
        GROUP_TIMING,
        (
            cnt("trigger_touches", 3),
            mins("min_minutes", 8),
            mins("max_minutes", 45),
            mins("jitter_minutes", 6, 60),
            flag("prefer_weather_slots", True),
            flag("prefer_sensor_beat", True),
            deg("band", 1.0),
        ),
    )
    reason_text = "waiting for a calm moment to answer"

    def trigger(self, ctx: Ctx) -> bool:
        """Apply this rule of the guard."""
        return len(ctx.touches_in(30)) >= self.cfg(ctx).trigger_touches

    def anchor(self, ctx: Ctx) -> datetime | None:
        """Apply this rule of the guard."""
        return self.latest_touch(ctx)

    def duration(self, ctx: Ctx) -> float:
        """Apply this rule of the guard."""
        c = self.cfg(ctx)
        anchor = self.latest_touch(ctx)
        if anchor is None:
            return 0.0
        pressure = max(ctx.touch_pressure(), ctx.command_pressure())
        base = anchor + timedelta(
            minutes=scaled(c.min_minutes, c.max_minutes, pressure)
            + ctx.rng.uniform(0, c.jitter_minutes)
        )
        slots: list[datetime] = []
        if c.prefer_weather_slots and ctx.last_weather_update:
            slots.append(ctx.last_weather_update + timedelta(minutes=30))
        beat = median_interval(ctx)
        if c.prefer_sensor_beat and beat and ctx.reading_times:
            slots.append(ctx.reading_times[-1] + timedelta(seconds=beat))
        for size in (5, 10):
            step = size * 60
            slots.append(
                datetime.fromtimestamp(
                    math.ceil(base.timestamp() / step) * step, tz=base.tzinfo
                )
            )
        best = min(slots, key=lambda slot: abs((slot - base).total_seconds()))
        best = max(best, anchor)
        return (best - anchor).total_seconds()


class ComfortEnvelope(EpochHold):
    """Let a small wall preference rest while it stays inside the envelope."""

    spec = GuardSpec(
        "comfort_envelope",
        "pacing",
        GROUP_TIMING,
        (
            cnt("trigger_touches", 2),
            mins("hold_minutes", 18),
            deg("max_offset", 0.8),
            deg("band", 1.0),
        ),
    )
    reason_text = (
        "the wall setting is only slightly above my temperature, letting it rest"
    )

    def trigger(self, ctx: Ctx) -> bool:
        """Apply this rule of the guard."""
        c = self.cfg(ctx)
        return (
            len(ctx.touches_in(30)) >= c.trigger_touches
            and ctx.setpoint is not None
            and ctx.setpoint <= ctx.target + c.max_offset
        )

    def anchor(self, ctx: Ctx) -> datetime | None:
        """Apply this rule of the guard."""
        return self.latest_touch(ctx)

    def duration(self, ctx: Ctx) -> float:
        """Apply this rule of the guard."""
        return self.cfg(ctx).hold_minutes * 60

    def clear(self, ctx: Ctx) -> bool:
        """Apply this rule of the guard."""
        return super().clear(ctx) or ctx.direct


class ConflictQuiet(EpochHold):
    """Stand down during an obvious tug of war."""

    spec = GuardSpec(
        "conflict_quiet",
        "pacing",
        GROUP_TIMING,
        (cnt("touch_threshold", 4), mins("quiet_minutes", 35), deg("band", 1.2)),
    )
    reason_text = "an obvious tug of war, standing down for a while"

    def trigger(self, ctx: Ctx) -> bool:
        """Apply this rule of the guard."""
        return len(ctx.touches_in(30)) >= self.cfg(ctx).touch_threshold

    def anchor(self, ctx: Ctx) -> datetime | None:
        """Apply this rule of the guard."""
        return self.latest_touch(ctx)

    def duration(self, ctx: Ctx) -> float:
        """Apply this rule of the guard."""
        return self.cfg(ctx).quiet_minutes * 60


class TugOfWarTruce(EpochHold):
    """Call a truce when the setpoint flips up and down."""

    spec = GuardSpec(
        "tug_of_war_truce",
        "pacing",
        GROUP_TIMING,
        (
            cnt("min_flips", 2),
            mins("window_minutes", 12, 120),
            mins("hold_minutes", 20),
            deg("band", 1.0),
        ),
    )
    reason_text = "the setting keeps bouncing up and down, calling a truce"

    def _flips(self, ctx: Ctx) -> list[datetime]:
        directions = []
        for touch in ctx.touches_in(self.cfg(ctx).window_minutes):
            if touch.old is None or touch.new is None or touch.new == touch.old:
                continue
            directions.append((touch.new > touch.old, touch.time))
        return [b[1] for a, b in pairwise(directions) if a[0] != b[0]]

    def trigger(self, ctx: Ctx) -> bool:
        """Apply this rule of the guard."""
        return len(self._flips(ctx)) >= self.cfg(ctx).min_flips

    def anchor(self, ctx: Ctx) -> datetime | None:
        """Apply this rule of the guard."""
        flips = self._flips(ctx)
        return flips[-1] if flips else None

    def duration(self, ctx: Ctx) -> float:
        """Apply this rule of the guard."""
        return self.cfg(ctx).hold_minutes * 60


class WallSettling(EpochHold):
    """Wait for someone who is still tapping the wall to stop."""

    spec = GuardSpec(
        "wall_settling",
        "pacing",
        GROUP_TIMING,
        (
            cnt("min_touches", 2),
            mins("window_minutes", 10, 120),
            sec("base_seconds", 45),
            sec("pressure_extra_seconds", 120),
            deg("band", 1.0),
        ),
    )
    reason_text = "waiting for the wall setting to settle"

    def trigger(self, ctx: Ctx) -> bool:
        """Apply this rule of the guard."""
        return (
            len(ctx.touches_in(self.cfg(ctx).window_minutes))
            >= self.cfg(ctx).min_touches
        )

    def anchor(self, ctx: Ctx) -> datetime | None:
        """Apply this rule of the guard."""
        return self.latest_touch(ctx, self.cfg(ctx).window_minutes)

    def duration(self, ctx: Ctx) -> float:
        """Apply this rule of the guard."""
        c = self.cfg(ctx)
        return c.base_seconds + c.pressure_extra_seconds * ctx.touch_pressure() / 100.0


PACING_GUARDS = (
    VisibilityGuard,
    RoutineTiming,
    ComfortBudget,
    CommandSpacing,
    LowProfileGovernor,
    NaturalCadence,
    ComfortPace,
    ComfortEnvelope,
    ConflictQuiet,
    TugOfWarTruce,
    WallSettling,
)
