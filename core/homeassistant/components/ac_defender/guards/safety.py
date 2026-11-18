"""Safety guards: hot rooms, emergencies, cooling failure and a detached thermostat."""

from datetime import timedelta

from ..model import Ctx, Decision
from ..spec import GROUP_SAFETY, Guard, GuardSpec, flag, mins, num

APPROACH = 0.5
PROTOCOLS: dict[str, tuple[int, bool]] = {
    "too_cold": (30, True),
    "someone_upset": (45, False),
    "suspicion_quiet": (90, False),
}


class HotRoomOverride(Guard):
    """At or above the safety temperature every wait is skipped."""

    spec = GuardSpec("hot_room_override", "safety", GROUP_SAFETY, safety=True)

    def act(self, ctx: Ctx) -> Decision | None:
        """Apply this rule of the guard."""
        if not ctx.hot() or ctx.room is None:
            return None
        reason = f"the room reached {ctx.room:.1f} degrees, cooling now"
        if ctx.hvac_mode not in (None, ctx.desired_mode):
            off = ctx.desired_mode == "off"
            return Decision(
                action="turn_off" if off else "set_hvac_mode",
                value=None if off else ctx.desired_mode,
                reason=reason,
                guard=self.spec.key,
                acted=[(self.spec.key, reason)],
            )
        goal = max(ctx.min_temp, ctx.room - APPROACH)
        if ctx.setpoint is not None and ctx.setpoint <= goal + 0.05:
            return None
        return Decision(
            action="set_temperature",
            value=goal,
            reason=reason,
            guard=self.spec.key,
            acted=[(self.spec.key, reason)],
        )


class UpstairsComfortGuard(Guard):
    """Cool first when the upstairs rooms are hot and someone is home."""

    spec = GuardSpec(
        "upstairs_comfort_guard",
        "safety",
        GROUP_SAFETY,
        (
            num("max_comfort", 24.0, 16, 35, 0.5, "°C"),
            num("comfort_target", 22.0, 16, 30, 0.5, "°C"),
            num("boost", 1.0, 0, 5, 0.5, "°C"),
            flag("presence_required", False),
        ),
        safety=True,
    )

    def active(self, ctx: Ctx) -> bool:
        """Return True when upstairs is too hot and someone is (or may be) home."""
        c = self.cfg(ctx)
        if ctx.upstairs is None or ctx.upstairs <= c.max_comfort:
            return False
        return not (c.presence_required and ctx.presence_home is False)

    def observe(self, ctx: Ctx) -> None:
        """Apply this rule of the guard."""
        c = self.cfg(ctx)
        self.st(ctx)["severe"] = self.active(ctx) and ctx.upstairs >= c.max_comfort + 2

    def adjust_target(self, ctx: Ctx, target: float) -> tuple[float, str] | None:
        """Apply this rule of the guard."""
        if not self.active(ctx):
            return None
        c = self.cfg(ctx)
        value = max(ctx.min_temp, min(target, c.comfort_target) - c.boost)
        return (value, "upstairs is hot, cooling first") if value < target else None

    def bypass(self, ctx: Ctx) -> str | None:
        """Apply this rule of the guard."""
        if self.st(ctx).get("severe"):
            return "upstairs is very hot, skipping the waits"
        return None


class EmergencyProtocols(Guard):
    """One-tap stand-down modes."""

    spec = GuardSpec("emergency_protocols", "safety", GROUP_SAFETY, safety=True)

    def start(self, ctx: Ctx, protocol: str) -> None:
        """Begin a protocol."""
        minutes, turns_off = PROTOCOLS[protocol]
        self.st(ctx).update(
            name=protocol,
            until=ctx.now + timedelta(minutes=minutes),
            turns_off=turns_off,
            off_pending=turns_off,
        )

    def stop(self, ctx: Ctx) -> None:
        """End the protocol early."""
        self.st(ctx).clear()

    def standdown(self, ctx: Ctx) -> str | None:
        """Apply this rule of the guard."""
        state = self.st(ctx)
        if state.get("until") and ctx.now < state["until"]:
            return f"emergency protocol {state['name']}"
        state.clear()
        return None

    def holds_off(self, ctx: Ctx) -> bool:
        """Apply this rule of the guard."""
        return bool(self.standdown(ctx) and self.st(ctx).get("turns_off"))

    def act(self, ctx: Ctx) -> Decision | None:
        """Apply this rule of the guard."""
        state = self.st(ctx)
        if self.standdown(ctx) and state.get("off_pending") and ctx.hvac_mode != "off":
            state["off_pending"] = False
            reason = "too cold, turning the air conditioner off"
            return Decision(
                action="turn_off",
                reason=reason,
                guard=self.spec.key,
                acted=[(self.spec.key, reason)],
            )
        return None


class CoolingFailureWatch(Guard):
    """Alert when cooling is wanted but not happening; only a rising room turns it off."""

    spec = GuardSpec("cooling_failure_watch", "safety", GROUP_SAFETY, safety=True)
    IDLE_MINUTES = 30
    RISE_DEGREES = 0.4
    RISE_MINUTES = 5
    NO_DROP_MINUTES = 45
    RESTORE_RISE = 0.5

    def observe(self, ctx: Ctx) -> None:
        """Apply this rule of the guard."""
        state = self.st(ctx)
        demanded = (
            ctx.hvac_mode == "cool"
            and ctx.room is not None
            and ctx.setpoint is not None
            and ctx.room > ctx.setpoint + 0.5
        )
        if not demanded:
            for key in ("idle_since", "alert", "respect"):
                state.pop(key, None)
            return
        alert = None
        if ctx.hvac_action in ("idle", "off"):
            state.setdefault("idle_since", ctx.now)
            if ctx.now - state["idle_since"] >= timedelta(minutes=self.IDLE_MINUTES):
                alert = "mega"
        else:
            state.pop("idle_since", None)
            window = ctx.now - timedelta(minutes=self.NO_DROP_MINUTES)
            samples = [s for s in ctx.room_samples if s[0] >= window]
            started = ctx.cooling_started
            if (
                ctx.hvac_action == "cooling"
                and started is not None
                and started <= window
                and len(samples) >= 2
                and samples[-1][1] - samples[0][1] >= -0.1
            ):
                alert = "mega"
        if alert == "mega" and "idle_since" in state:
            window = ctx.now - timedelta(minutes=self.RISE_MINUTES)
            recent = [s for s in ctx.room_samples if s[0] >= window]
            if len(recent) >= 2 and recent[-1][1] - recent[0][1] >= self.RISE_DEGREES:
                alert = "omega"
        state["alert"] = alert

    def holds_off(self, ctx: Ctx) -> bool:
        """Apply this rule of the guard."""
        return bool(self.st(ctx).get("off"))

    def act(self, ctx: Ctx) -> Decision | None:
        """Apply this rule of the guard."""
        state = self.st(ctx)
        if state.get("off"):
            if ctx.hvac_mode != "off":
                state["off"] = False
                state["respect"] = True
                return None
            if (
                ctx.room is not None
                and ctx.room >= state["off_room"] + self.RESTORE_RISE
            ):
                state["off"] = False
                reason = "the room warmed up, restoring cool mode"
                return Decision(
                    action="set_hvac_mode",
                    value="cool",
                    reason=reason,
                    guard=self.spec.key,
                    acted=[(self.spec.key, reason)],
                )
            return None
        if (
            state.get("alert") == "omega"
            and not state.get("respect")
            and ctx.room is not None
        ):
            state["off"] = True
            state["off_room"] = ctx.room
            reason = "cooling failure confirmed by a rising room, turning the unit off"
            return Decision(
                action="turn_off",
                reason=reason,
                guard=self.spec.key,
                acted=[(self.spec.key, reason)],
            )
        return None


class TamperTruce(Guard):
    """A thermostat that vanishes right after an exchange is probably detached."""

    spec = GuardSpec(
        "tamper_truce",
        "safety",
        GROUP_SAFETY,
        (
            mins("command_window_minutes", 20, 240),
            mins("touch_window_minutes", 45, 240),
            mins("truce_minutes", 120, 1440),
        ),
        safety=True,
    )

    def observe(self, ctx: Ctx) -> None:
        """Apply this rule of the guard."""
        c = self.cfg(ctx)
        state = self.st(ctx)
        if state.get("until") and ctx.now >= state["until"]:
            state.clear()
        if ctx.available or state.get("until"):
            return
        if ctx.commands_in(c.command_window_minutes) and ctx.touches_in(
            c.touch_window_minutes
        ):
            state["until"] = ctx.now + timedelta(minutes=c.truce_minutes)

    def standdown(self, ctx: Ctx) -> str | None:
        """Apply this rule of the guard."""
        state = self.st(ctx)
        if state.get("until") and ctx.now < state["until"]:
            return "tamper truce: the thermostat disappeared right after an exchange"
        return None


class FrontDoorGuardPost(Guard):
    """Pause, and optionally turn the unit off, when a person detector trips."""

    spec = GuardSpec(
        "front_door_guard_post",
        "safety",
        GROUP_SAFETY,
        (mins("hold_minutes", 20, 240), flag("turns_thermostat_off", True)),
        safety=True,
    )

    def observe(self, ctx: Ctx) -> None:
        """Apply this rule of the guard."""
        state = self.st(ctx)
        if ctx.person_at_door:
            state["until"] = ctx.now + timedelta(minutes=self.cfg(ctx).hold_minutes)
            state.setdefault("off_pending", True)
        elif state.get("until") and ctx.now >= state["until"]:
            state.clear()

    def standdown(self, ctx: Ctx) -> str | None:
        """Apply this rule of the guard."""
        until = self.st(ctx).get("until")
        return (
            "a person was detected at the front door"
            if until and ctx.now < until
            else None
        )

    def holds_off(self, ctx: Ctx) -> bool:
        """Apply this rule of the guard."""
        return bool(self.standdown(ctx) and self.cfg(ctx).turns_thermostat_off)

    def act(self, ctx: Ctx) -> Decision | None:
        """Apply this rule of the guard."""
        state = self.st(ctx)
        if (
            self.standdown(ctx)
            and self.cfg(ctx).turns_thermostat_off
            and state.get("off_pending")
            and ctx.hvac_mode != "off"
        ):
            state["off_pending"] = False
            reason = "a person at the front door, turning the unit off"
            return Decision(
                action="turn_off",
                reason=reason,
                guard=self.spec.key,
                acted=[(self.spec.key, reason)],
            )
        return None


SAFETY_GUARDS = (
    HotRoomOverride,
    UpstairsComfortGuard,
    EmergencyProtocols,
    CoolingFailureWatch,
    TamperTruce,
    FrontDoorGuardPost,
)
