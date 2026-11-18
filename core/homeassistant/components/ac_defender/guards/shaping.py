"""Guards that change the size of the setpoint step before it is sent."""

from ..model import Ctx
from ..reasons import Reason
from ..spec import GROUP_TIMING, Guard, GuardSpec, cnt, deg, mins


class NaturalWalkback(Guard):
    """Walk the setpoint back in small, slightly varied steps."""

    spec = GuardSpec(
        "natural_walkback",
        "shaping",
        GROUP_TIMING,
        (
            cnt("trigger_touches", 2),
            deg("step", 0.5),
            deg("jitter", 0.1),
            deg("band", 1.0),
        ),
    )

    def shape(self, ctx: Ctx, proposal: float) -> tuple[float, str] | None:
        """Apply this rule of the guard."""
        c = self.cfg(ctx)
        if (
            ctx.setpoint is None
            or len(ctx.touches_in(30)) < c.trigger_touches
            or ctx.over_band(c.band)
        ):
            return None
        step = max(0.1, c.step + ctx.rng.uniform(-c.jitter, c.jitter))
        value = max(proposal, ctx.setpoint - step)
        return (value, Reason("walking_back", step=step)) if value != proposal else None


class TouchSignature(Guard):
    """Match nudges to the step size people use on the wall."""

    spec = GuardSpec(
        "touch_signature",
        "shaping",
        GROUP_TIMING,
        (
            cnt("trigger_touches", 2),
            mins("retention_minutes", 90, 720),
            deg("min_step", 0.3),
            deg("max_step", 1.0),
            deg("band", 1.0),
        ),
    )

    def learned_step(self, ctx: Ctx) -> float | None:
        """Return the median recent step size, if enough steps were seen."""
        c = self.cfg(ctx)
        sizes = sorted(
            abs(t.new - t.old)
            for t in ctx.touches_in(c.retention_minutes)
            if t.new is not None and t.old is not None and t.new != t.old
        )
        if len(sizes) < c.trigger_touches:
            return None
        return min(max(sizes[len(sizes) // 2], c.min_step), c.max_step)

    def shape(self, ctx: Ctx, proposal: float) -> tuple[float, str] | None:
        """Apply this rule of the guard."""
        c = self.cfg(ctx)
        step = self.learned_step(ctx)
        self.st(ctx)["learned_step"] = step
        if step is None or ctx.setpoint is None or ctx.over_band(c.band):
            return None
        value = max(proposal, ctx.setpoint - step)
        return (
            (value, Reason("matching_wall_step", step=step))
            if value != proposal
            else None
        )


class HumanNudge(Guard):
    """Snap safe follow-up commands to a normal thermostat step."""

    spec = GuardSpec(
        "human_nudge",
        "shaping",
        GROUP_TIMING,
        (cnt("trigger_touches", 2), deg("step", 0.5), deg("band", 1.0)),
    )

    def shape(self, ctx: Ctx, proposal: float) -> tuple[float, str] | None:
        """Apply this rule of the guard."""
        c = self.cfg(ctx)
        if (
            ctx.setpoint is None
            or c.step <= 0
            or len(ctx.touches_in(30)) < c.trigger_touches
            or ctx.over_band(c.band)
        ):
            return None
        steps = max(1, round((ctx.setpoint - proposal) / c.step))
        value = max(ctx.target, ctx.setpoint - steps * c.step)
        return (
            (value, Reason("snapped_to_step", step=c.step))
            if value != proposal
            else None
        )


SHAPING_GUARDS = (NaturalWalkback, TouchSignature, HumanNudge)
