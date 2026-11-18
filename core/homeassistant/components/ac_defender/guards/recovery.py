"""Core recovery guards: the quiet pacing after a manual change and the cool mode."""

from datetime import datetime, timedelta

from ..model import Ctx, Decision, Hold
from ..spec import GROUP_TIMING, Guard, GuardSpec, cnt, deg, flag, mins, num, sec
from .base import EpochHold

QUIET_LEVELS = ("Calm", "Light", "Quiet", "Extra quiet", "Softest")


def quiet_level(ctx: Ctx) -> int:
    """Return 0 (calm) to 4 (softest) from how often people touched the setting."""
    return min(4, len(ctx.touches_in(30)))


class ComfortSync(EpochHold):
    """Space out and soften corrections after a manual change."""

    spec = GuardSpec(
        "comfort_sync",
        "recovery",
        GROUP_TIMING,
        (
            flag("adaptive_quietness", True),
            sec("min_seconds", 20),
            sec("max_seconds", 180),
            deg("step", 1.0),
            num("hold_chance_percent", 25, 0, 100, 1, "%"),
            sec("gap_seconds", 30),
            deg("band", 2.0),
        ),
    )
    reason_text = "taking a calm pause after a change on the thermostat"

    def trigger(self, ctx: Ctx) -> bool:
        """Apply this rule of the guard."""
        return bool(ctx.touches_in(60))

    def anchor(self, ctx: Ctx) -> datetime | None:
        """Apply this rule of the guard."""
        return self.latest_touch(ctx, 60)

    def _scale(self, ctx: Ctx) -> float:
        return 1 + 0.5 * quiet_level(ctx) if self.cfg(ctx).adaptive_quietness else 1.0

    def duration(self, ctx: Ctx) -> float:
        """Apply this rule of the guard."""
        c = self.cfg(ctx)
        wait = ctx.rng.uniform(c.min_seconds, c.max_seconds) * self._scale(ctx)
        beats = 0
        while beats < 2 and ctx.rng.uniform(0, 100) < c.hold_chance_percent:
            wait += ctx.rng.uniform(5, 20)
            beats += 1
        return wait

    def hold(self, ctx: Ctx) -> Hold | None:
        """Apply this rule of the guard."""
        result = super().hold(ctx)
        c = self.cfg(ctx)
        if ctx.over_band(c.band) or not ctx.commands:
            return result
        gap_end = ctx.commands[-1].time + timedelta(seconds=c.gap_seconds)
        if ctx.now < gap_end and (result is None or gap_end > result.until):
            return self.hold_for(ctx, gap_end, "keeping a minimum gap between commands")
        return result

    def shape(self, ctx: Ctx, proposal: float) -> tuple[float, str] | None:
        """Apply this rule of the guard."""
        c = self.cfg(ctx)
        if ctx.setpoint is None or ctx.over_band(c.band):
            return None
        step = (
            c.step / (1 + 0.25 * quiet_level(ctx)) if c.adaptive_quietness else c.step
        )
        floor = ctx.setpoint - max(step, 0.1)
        if proposal < floor:
            return floor, f"softened to a {step:.1f} degree step"
        return None


class CoolModeRestore(Guard):
    """Put the mode back to cool after a short pause."""

    spec = GuardSpec(
        "cool_mode_restore",
        "recovery",
        GROUP_TIMING,
        (sec("min_seconds", 8), sec("max_seconds", 60), deg("band", 0.6)),
    )

    def act(self, ctx: Ctx) -> Decision | None:
        """Apply this rule of the guard."""
        state = self.st(ctx)
        modes_ok = (
            ctx.hvac_mode in (None, ctx.desired_mode, "heat_cool") or ctx.off_owner
        )
        if modes_ok:
            state.clear()
            return None
        c = self.cfg(ctx)
        severe = self.st_other(ctx, "upstairs_comfort_guard").get("severe", False)
        urgent = ctx.over_band(c.band) or ctx.hot() or severe
        if urgent:
            return self._restore(ctx, "the room is warm, restoring the mode now")
        started = state.setdefault("since", ctx.now)
        delay = state.setdefault("delay", ctx.rng.uniform(c.min_seconds, c.max_seconds))
        until = started + timedelta(seconds=delay)
        if ctx.now >= until:
            return self._restore(ctx, "someone changed the mode, putting it back")
        return Decision(
            state="waiting",
            reason="waiting a moment before restoring cool mode",
            holds=[self.hold_for(ctx, until, "waiting before restoring cool mode")],
            guard=self.spec.key,
        )

    def st_other(self, ctx: Ctx, key: str) -> dict:
        """Return another guard's state."""
        return ctx.state.get(key, {})

    def _restore(self, ctx: Ctx, reason: str) -> Decision:
        off = ctx.desired_mode == "off"
        return Decision(
            action="turn_off" if off else "set_hvac_mode",
            value=None if off else ctx.desired_mode,
            reason=reason,
            guard=self.spec.key,
            acted=[(self.spec.key, reason)],
        )


class DynamicCooldown(EpochHold):
    """A quiet period after a manual change that grows with touch frequency."""

    spec = GuardSpec(
        "dynamic_cooldown",
        "recovery",
        GROUP_TIMING,
        (
            sec("base_seconds", 45),
            sec("max_seconds", 600),
            mins("window_minutes", 30, 240),
        ),
    )
    reason_text = "quiet period after a manual change"

    def trigger(self, ctx: Ctx) -> bool:
        """Apply this rule of the guard."""
        return bool(ctx.touches_in(self.cfg(ctx).window_minutes))

    def anchor(self, ctx: Ctx) -> datetime | None:
        """Apply this rule of the guard."""
        return self.latest_touch(ctx, self.cfg(ctx).window_minutes)

    def duration(self, ctx: Ctx) -> float:
        """Apply this rule of the guard."""
        c = self.cfg(ctx)
        count = len(ctx.touches_in(c.window_minutes))
        return min(c.max_seconds, c.base_seconds * count) + ctx.rng.uniform(0, 10)

    def clear(self, ctx: Ctx) -> bool:
        """Apply this rule of the guard."""
        return ctx.hot()


class ManualComfortGrace(EpochHold):
    """Leave a manual change alone while the room is comfortable."""

    spec = GuardSpec(
        "manual_comfort_grace",
        "recovery",
        GROUP_TIMING,
        (mins("grace_minutes", 20), deg("band", 0.8)),
    )
    reason_text = "the room is still comfortable, leaving the change alone"

    def trigger(self, ctx: Ctx) -> bool:
        """Apply this rule of the guard."""
        severe = ctx.state.get("upstairs_comfort_guard", {}).get("severe", False)
        return (
            ctx.hvac_mode in (None, ctx.desired_mode)
            and not severe
            and bool(ctx.touches_in(180))
        )

    def anchor(self, ctx: Ctx) -> datetime | None:
        """Apply this rule of the guard."""
        return self.latest_touch(ctx, 180)

    def duration(self, ctx: Ctx) -> float:
        """Apply this rule of the guard."""
        extra = ctx.state.get("touch_intent", {}).get("extra_minutes", 0)
        return (self.cfg(ctx).grace_minutes + extra) * 60


class TouchIntent(Guard):
    """Extend grace when recent changes clearly ask for warmer air."""

    spec = GuardSpec(
        "touch_intent",
        "recovery",
        GROUP_TIMING,
        (
            cnt("min_touches", 2),
            mins("window_minutes", 90, 480),
            deg("net_warm_threshold", 0.8),
            mins("extra_grace_minutes", 25),
            deg("band", 1.0),
        ),
    )

    def observe(self, ctx: Ctx) -> None:
        """Apply this rule of the guard."""
        c = self.cfg(ctx)
        touches = ctx.touches_in(c.window_minutes)
        net = sum(
            (t.new - t.old) for t in touches if t.new is not None and t.old is not None
        )
        warmer = (
            len(touches) >= c.min_touches
            and net >= c.net_warm_threshold
            and not ctx.over_band(c.band)
        )
        self.st(ctx)["extra_minutes"] = c.extra_grace_minutes if warmer else 0


RECOVERY_GUARDS = (
    ComfortSync,
    CoolModeRestore,
    DynamicCooldown,
    ManualComfortGrace,
    TouchIntent,
)
