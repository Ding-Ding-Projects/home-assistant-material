"""People guards: courtesy for humans, firmness for machines, and who wins when."""

from datetime import datetime, time, timedelta

from ..model import Ctx, Decision, RivalBlock
from ..spec import (
    GROUP_PEOPLE,
    Guard,
    GuardSpec,
    Setting,
    clock,
    cnt,
    deg,
    flag,
    mins,
    num,
    sec,
)

SURRENDER_CAP = 27.0


def parse_clock(value: str) -> time:
    """Parse HH:MM or HH:MM:SS."""
    parts = [int(p) for p in value.split(":")[:2]]
    return time(parts[0], parts[1])


def in_window(now: datetime, start: str, end: str) -> bool:
    """Return True when the local time of day is inside a window that may wrap."""
    begin, finish, current = parse_clock(start), parse_clock(end), now.time()
    if begin <= finish:
        return begin <= current <= finish
    return current >= begin or current <= finish


def active_block(blocks: list[RivalBlock], now: datetime) -> RivalBlock | None:
    """Return the block of the rival schedule that is in force now."""
    best: tuple[datetime, RivalBlock] | None = None
    for day_offset in (0, -1):
        day = (now + timedelta(days=day_offset)).date()
        for block in blocks:
            if day.weekday() not in block.days:
                continue
            start = datetime.combine(day, parse_clock(block.start), tzinfo=now.tzinfo)
            if start <= now and (best is None or start > best[0]):
                best = (start, block)
    return best[1] if best else None


def matches_block(
    block: RivalBlock | None, value: float | None, tolerance: float
) -> bool:
    """Return True when a setpoint lands on the block's low or high number."""
    if block is None or value is None:
        return False
    return abs(value - block.low) <= tolerance or abs(value - block.high) <= tolerance


class ComfortCompromise(Guard):
    """Blend a repeated wall choice into a temporary target."""

    spec = GuardSpec(
        "comfort_compromise",
        "people",
        GROUP_PEOPLE,
        (
            cnt("trigger_touches", 2),
            mins("hold_minutes", 20),
            mins("decay_minutes", 30),
            deg("max_offset", 1.0),
            deg("band", 1.0),
        ),
    )

    def adjust_target(self, ctx: Ctx, target: float) -> tuple[float, str] | None:
        """Apply this rule of the guard."""
        c = self.cfg(ctx)
        horizon = c.hold_minutes + c.decay_minutes
        touches = ctx.touches_in(horizon)
        if len(touches) < c.trigger_touches or ctx.over_band(c.band):
            return None
        last = touches[-1]
        if last.new is None:
            return None
        offset = min(max(last.new - target, 0.0), c.max_offset)
        elapsed = (ctx.now - last.time).total_seconds() / 60
        if elapsed > c.hold_minutes:
            offset *= max(0.0, 1 - (elapsed - c.hold_minutes) / max(c.decay_minutes, 1))
        if offset <= 0:
            return None
        return target + offset, "easing toward the wall choice for a while"


class ComfortMemory(Guard):
    """Learn a small time-of-day bias from repeated safe wall choices."""

    spec = GuardSpec(
        "comfort_memory",
        "people",
        GROUP_PEOPLE,
        (
            cnt("learning_touches", 2),
            mins("retention_hours", 24, 168),
            deg("max_offset", 0.6),
            deg("band", 0.8),
        ),
    )

    def observe(self, ctx: Ctx) -> None:
        """Apply this rule of the guard."""
        c = self.cfg(ctx)
        state = self.st(ctx)
        hours = state.setdefault("hours", {})
        touches = ctx.touches_in(60)
        if (
            len(touches) >= c.learning_touches
            and not ctx.over_band(c.band)
            and touches[-1].new is not None
            and state.get("seen") != touches[-1].time
        ):
            state["seen"] = touches[-1].time
            offset = min(max(touches[-1].new - ctx.target, 0.0), c.max_offset)
            hours[ctx.now.hour] = {"offset": offset, "at": ctx.now}
        limit = ctx.now - timedelta(hours=c.retention_hours)
        for hour in [h for h, v in hours.items() if v["at"] < limit]:
            del hours[hour]

    def adjust_target(self, ctx: Ctx, target: float) -> tuple[float, str] | None:
        """Apply this rule of the guard."""
        entry = self.st(ctx).get("hours", {}).get(ctx.now.hour)
        severe = ctx.state.get("upstairs_comfort_guard", {}).get("severe", False)
        if (
            not entry
            or entry["offset"] <= 0
            or severe
            or ctx.over_band(self.cfg(ctx).band)
        ):
            return None
        return target + entry["offset"], "using what was learned about this hour"


class RepeatedRaiseSurrender(Guard):
    """A persistent human wins: adopt their number for a while."""

    spec = GuardSpec(
        "repeated_raise_surrender",
        "people",
        GROUP_PEOPLE,
        (
            cnt("raises", 3),
            mins("window_minutes", 30, 240),
            deg("tolerance", 0.7),
            mins("hold_minutes", 240, 1440),
            num("cap", SURRENDER_CAP, 16, 32, 0.5, "°C"),
        ),
    )

    def observe(self, ctx: Ctx) -> None:
        """Apply this rule of the guard."""
        c = self.cfg(ctx)
        state = self.st(ctx)
        if state.get("until") and ctx.now >= state["until"]:
            state.clear()
        if state.get("until"):
            return
        raises = [
            t.new
            for t in ctx.touches_in(c.window_minutes)
            if t.new is not None and t.old is not None and t.new > t.old
        ]
        if len(raises) >= c.raises and max(raises) - min(raises) <= c.tolerance:
            state["adopted"] = min(c.cap, sum(raises) / len(raises))
            state["until"] = ctx.now + timedelta(minutes=c.hold_minutes)

    def adjust_target(self, ctx: Ctx, target: float) -> tuple[float, str] | None:
        """Apply this rule of the guard."""
        state = self.st(ctx)
        if (
            state.get("until")
            and ctx.now < state["until"]
            and state["adopted"] > target
        ):
            return state[
                "adopted"
            ], "someone keeps asking for this number, so it is theirs for now"
        return None


class WakeUpTruce(Guard):
    """A bedroom door opening at dawn means someone is awake: agree early."""

    spec = GuardSpec(
        "wake_up_truce",
        "people",
        GROUP_PEOPLE,
        (
            clock("window_start", "04:00"),
            clock("window_end", "09:00"),
            num("target", 25.0, 16, 32, 0.5, "°C"),
            mins("hold_minutes", 120, 1440),
        ),
        default_on=False,
    )

    def observe(self, ctx: Ctx) -> None:
        """Apply this rule of the guard."""
        c = self.cfg(ctx)
        state = self.st(ctx)
        opened = ctx.door_opened_at
        if (
            opened
            and state.get("seen") != opened
            and in_window(opened, c.window_start, c.window_end)
        ):
            state["seen"] = opened
            state["until"] = opened + timedelta(minutes=c.hold_minutes)
            state["adopted"] = min(SURRENDER_CAP, max(ctx.my_temp, c.target))

    def adjust_target(self, ctx: Ctx, target: float) -> tuple[float, str] | None:
        """Apply this rule of the guard."""
        state = self.st(ctx)
        if (
            state.get("until")
            and ctx.now < state["until"]
            and state["adopted"] > target
        ):
            return state[
                "adopted"
            ], "good morning: the door opened, agreeing on a warmer number"
        return None


class CoolerIntentFastLane(Guard):
    """People keep dialing cooler: stop being quiet and cool the room."""

    spec = GuardSpec(
        "cooler_intent_fast_lane",
        "people",
        GROUP_PEOPLE,
        (
            cnt("min_touches", 2),
            mins("window_minutes", 90, 480),
            mins("hold_minutes", 20),
            deg("net_cool_threshold", 0.8),
            deg("band", 2.0),
        ),
    )

    def bypass(self, ctx: Ctx) -> str | None:
        """Apply this rule of the guard."""
        c = self.cfg(ctx)
        state = self.st(ctx)
        touches = ctx.touches_in(c.window_minutes)
        net = sum(
            (t.new - t.old) for t in touches if t.new is not None and t.old is not None
        )
        if len(touches) >= c.min_touches and net <= -c.net_cool_threshold:
            state.setdefault("until", ctx.now + timedelta(minutes=c.hold_minutes))
        if state.get("until") and ctx.now >= state["until"]:
            state.clear()
        if not state.get("until") or ctx.room is None or ctx.room <= ctx.target:
            return None
        if ctx.over_band(c.band):
            return None
        return "people keep asking for cooler air, skipping the quiet waits"


class SuperDefender(Guard):
    """Detect repeated phone or automation changes and answer without waiting."""

    spec = GuardSpec(
        "super_defender",
        "people",
        GROUP_PEOPLE,
        (
            cnt("remote_change_threshold", 2),
            mins("window_minutes", 30, 240),
            mins("hold_minutes", 45, 480),
            deg("band", 1.5),
            flag("bypass_quiet_timing", True),
        ),
    )

    def observe(self, ctx: Ctx) -> None:
        """Apply this rule of the guard."""
        c = self.cfg(ctx)
        state = self.st(ctx)
        if state.get("until") and ctx.now >= state["until"]:
            state.clear()
        remote = ctx.touches_in(c.window_minutes, remote=True)
        if len(remote) >= c.remote_change_threshold and not state.get("until"):
            state["until"] = ctx.now + timedelta(minutes=c.hold_minutes)

    def bypass(self, ctx: Ctx) -> str | None:
        """Apply this rule of the guard."""
        c = self.cfg(ctx)
        state = self.st(ctx)
        if (
            c.bypass_quiet_timing
            and state.get("until")
            and ctx.room is not None
            and ctx.room > ctx.target
            and not ctx.over_band(c.band)
        ):
            return "repeated phone or automation changes, answering without waiting"
        return None


class RivalScheduleWatch(Guard):
    """Answer the air conditioner app's own schedule as a machine, not a person."""

    spec = GuardSpec(
        "rival_schedule_watch",
        "people",
        GROUP_PEOPLE,
        (
            deg("tolerance", 0.3, 2.0),
            flag("bypass_quiet_timing", True),
            deg("band", 3.0),
        ),
    )

    def bypass(self, ctx: Ctx) -> str | None:
        """Apply this rule of the guard."""
        c = self.cfg(ctx)
        if not c.bypass_quiet_timing or ctx.room is None or ctx.setpoint is None:
            return None
        if not matches_block(ctx.schedule_block, ctx.setpoint, c.tolerance):
            return None
        if (
            ctx.setpoint <= ctx.target
            or ctx.room <= ctx.target
            or ctx.over_band(c.band)
        ):
            return None
        return "the air conditioner app's schedule pushed it warmer, answering back"


class DesiredStateEnforcer(Guard):
    """Restore the chosen state when someone other than the owner changes it."""

    spec = GuardSpec(
        "desired_state_enforcer",
        "people",
        GROUP_PEOPLE,
        (
            flag("enforce_mode", True),
            flag("enforce_setpoint", True),
            flag("gentle_shaping", True),
            flag("respect_owner", True),
            Setting("owner_user_ids", "", "text"),
            sec("debounce_seconds", 8),
            sec("cooldown_seconds", 30),
            mins("rate_window_minutes", 15, 240),
            cnt("max_asserts_per_window", 6, 50),
            cnt("escalate_after_overrides", 3, 50),
            sec("backoff_base_seconds", 20),
            sec("backoff_max_seconds", 300),
            flag("schedule_enabled", False),
            clock("start_time", "00:00"),
            clock("end_time", "23:59"),
            flag("require_presence", False),
            flag("notify", False),
        ),
        default_on=False,
    )

    def act(self, ctx: Ctx) -> Decision | None:
        """Apply this rule of the guard."""
        c = self.cfg(ctx)
        state = self.st(ctx)
        owners = {o.strip() for o in c.owner_user_ids.split(",") if o.strip()}
        if c.schedule_enabled and not in_window(ctx.now, c.start_time, c.end_time):
            return None
        if c.require_presence and ctx.presence_home is False:
            return None
        if state.get("backoff_until") and ctx.now < state["backoff_until"]:
            return None
        foreign = [
            t
            for t in ctx.touches_in(c.rate_window_minutes)
            if not (c.respect_owner and t.user_id in owners and t.user_id)
        ]
        mode_off = (
            ctx.hvac_mode not in (None, "cool", "heat_cool") and not ctx.off_owner
        )
        if not foreign and not (c.enforce_mode and mode_off):
            return None
        latest = foreign[-1].time if foreign else None
        if latest and (ctx.now - latest).total_seconds() < c.debounce_seconds:
            return None
        last_assert = state.get("last_assert")
        if last_assert and (ctx.now - last_assert).total_seconds() < c.cooldown_seconds:
            return None
        asserts = [
            t
            for t in state.get("asserts", [])
            if (ctx.now - t) < timedelta(minutes=c.rate_window_minutes)
        ]
        state["asserts"] = asserts
        if len(asserts) >= c.max_asserts_per_window:
            state["backoff_until"] = ctx.now + timedelta(seconds=c.backoff_max_seconds)
            return None
        firm = len(foreign) >= c.escalate_after_overrides
        decision: Decision | None = None
        if c.enforce_mode and mode_off:
            decision = Decision(
                action="set_hvac_mode", value="cool", reason="restoring cool mode"
            )
        elif c.enforce_setpoint and ctx.setpoint is not None:
            off_target = ctx.setpoint < ctx.target - 0.05 or (
                ctx.setpoint > ctx.target + 0.05 and (firm or not c.gentle_shaping)
            )
            if off_target:
                decision = Decision(
                    action="set_temperature",
                    value=ctx.target,
                    reason="restoring my temperature",
                )
        if decision is None:
            return None
        state["last_assert"] = ctx.now
        asserts.append(ctx.now)
        reason = decision.reason + (" firmly" if firm else "")
        decision.reason = reason
        decision.guard = self.spec.key
        decision.acted = [(self.spec.key, reason)]
        if c.notify and firm:
            state["notify"] = reason
        return decision

    def rejected(self, ctx: Ctx) -> None:
        """Back off after the device rejected a command."""
        c = self.cfg(ctx)
        state = self.st(ctx)
        step = min(
            c.backoff_max_seconds, c.backoff_base_seconds * 2 ** state.get("rejects", 0)
        )
        state["rejects"] = state.get("rejects", 0) + 1
        state["backoff_until"] = ctx.now + timedelta(seconds=step)


PEOPLE_GUARDS = (
    ComfortCompromise,
    ComfortMemory,
    RepeatedRaiseSurrender,
    WakeUpTruce,
    CoolerIntentFastLane,
    SuperDefender,
    RivalScheduleWatch,
    DesiredStateEnforcer,
)
