"""The decision pipeline: one evaluation of every guard for one device."""

from datetime import timedelta
import math

from .guards import NON_BYPASSABLE, TARGET_ORDER
from .model import Ctx, Decision, Standdown
from .spec import Guard

FLOOR_MIN = 10.0
STALE_SECONDS = 30 * 60
DIRECT_BAND = 2.0  # the original natural safety override
APPROACH = 0.5
TOLERANCE = 0.1
FLOOR_STATE = "_floor"
KEEP_OFF_GAP_SECONDS = 600
KEEP_OFF_STATE = "_keep_off"


def clamp_floor(value: float | None) -> float:
    """Return a floor that is never below the hard minimum."""
    try:
        return max(FLOOR_MIN, float(value))
    except TypeError, ValueError:
        return FLOOR_MIN


def effective_floor(
    floor: float | None, outdoor: float | None, freeze_guard: bool, freeze_floor: float
) -> tuple[float, bool]:
    """Return the floor in force and whether freezing outdoors raised it."""
    value = clamp_floor(floor)
    freezing = freeze_guard and outdoor is not None and outdoor <= 0
    if freezing:
        value = max(value, clamp_floor(freeze_floor))
    return value, freezing


def _floor_stage(ctx: Ctx) -> Decision | None:
    """Heat safety: runs before everything else and cannot be switched off."""
    state = ctx.state.setdefault(FLOOR_STATE, {})
    floor, freezing = effective_floor(
        ctx.floor, ctx.outdoor, ctx.freeze_guard, ctx.freeze_floor
    )
    ctx.floor = floor
    state.update(effective=floor, freezing=freezing)
    if ctx.protective_preset:
        state["latched"] = False
        return Decision(
            state="standing_down",
            reason="the device is in a frost protection or away mode, leaving it alone",
            guard="heat_safety",
        )
    if ctx.room is None or ctx.reading_age > STALE_SECONDS:
        state["latched"] = False
        return Decision(
            state="standing_down",
            reason="no fresh room temperature for 30 minutes, leaving the heating to whatever controls it",
            guard="heat_safety",
        )
    if ctx.room < floor:
        state["latched"] = True
    elif state.get("latched") and ctx.room >= floor + max(0.0, ctx.floor_margin):
        state["latched"] = False
    if not state.get("latched"):
        return None
    reason = f"the room is at {ctx.room:.1f} degrees, below the floor of {floor:.1f}: heating is allowed"
    if ctx.hvac_mode == "off":
        return Decision(
            state="heating_allowed",
            reason=reason,
            action="set_hvac_mode",
            value="heat",
            guard="heat_safety",
            acted=[("heat_safety", reason)],
        )
    want = floor + max(0.0, ctx.floor_margin)
    if ctx.setpoint is not None and ctx.setpoint < want:
        return Decision(
            state="heating_allowed",
            reason=reason,
            action="set_temperature",
            value=min(ctx.max_temp, want),
            guard="heat_safety",
            acted=[("heat_safety", reason)],
        )
    return Decision(state="heating_allowed", reason=reason, guard="heat_safety")


def _grid(value: float, step: float) -> float:
    """Round up to the device's step so the result is never below the value."""
    if step <= 0:
        return value
    return round(math.ceil(round(value / step, 6)) * step, 6)


def _finish(ctx: Ctx, decision: Decision) -> Decision:
    """Last line of defence: no caller can command under the floor or turn heating off below it."""
    decision.target = ctx.target
    if ctx.run_mode != "heat" or ctx.floor is None:
        return decision
    if decision.action == "set_temperature" and isinstance(decision.value, float):
        decision.value = max(decision.value, clamp_floor(ctx.floor))
    turns_off = decision.action == "turn_off" or (
        decision.action == "set_hvac_mode" and decision.value == "off"
    )
    if turns_off and ctx.room is not None and ctx.room < clamp_floor(ctx.floor):
        return Decision(
            state="heating_allowed", reason="below the floor, heating stays allowed"
        )
    return decision


def decide(  # noqa: C901
    ctx: Ctx, guards: list[Guard], pause: Standdown | None = None
) -> Decision:
    """Evaluate every guard once and return what the defender should do."""
    by_key = {g.spec.key: g for g in guards}
    ctx.target = ctx.my_temp
    for guard in guards:
        if guard.on(ctx):
            guard.observe(ctx)
        else:
            ctx.state.pop(guard.spec.key, None)
    ctx.off_owner = next(
        (g.spec.key for g in guards if g.on(ctx) and g.holds_off(ctx)), None
    )
    if not ctx.available:
        return Decision(state="standing_down", reason="the device is unavailable")
    if pause and pause.stop_everything:
        return Decision(state=pause.kind, reason=pause.reason)
    if ctx.floor is not None:
        stage = _floor_stage(ctx)
        if stage is not None:
            return _finish(ctx, stage)

    target = ctx.my_temp
    reasons: list[tuple[str, str]] = []
    for key in TARGET_ORDER:
        guard = by_key.get(key)
        if guard and guard.on(ctx):
            result = guard.adjust_target(ctx, target)
            if result:
                target = result[0]
                reasons.append((key, result[1]))
    target = min(ctx.max_temp, max(ctx.min_temp, target))
    if ctx.floor is not None:
        target = max(target, ctx.floor)
    ctx.target = target
    ctx.direct = ctx.room is not None and ctx.room >= target + DIRECT_BAND

    standing = [
        (g, reason) for g in guards if g.on(ctx) and (reason := g.standdown(ctx))
    ]
    emergency = next(
        (s for s in standing if s[0].spec.key == "emergency_protocols"), None
    )
    if emergency:
        first = emergency[0].act(ctx)
        if first is not None:
            return _finish(ctx, first)
        return Decision(
            state="emergency", reason=emergency[1], guard="emergency_protocols"
        )
    for guard in guards:
        if guard.on(ctx) and (
            guard.spec.safety or any(g is guard for g, _ in standing)
        ):
            action = guard.act(ctx)
            if action is not None:
                return _finish(ctx, action)
    if pause:
        return Decision(state="paused", reason=pause.reason)
    if standing:
        guard, reason = standing[0]
        return Decision(state="standing_down", reason=reason, guard=guard.spec.key)

    for guard in guards:
        if guard.on(ctx) and not guard.spec.safety:
            action = guard.act(ctx)
            if action is not None:
                if action.action is None:
                    action.next_check = min(
                        (h.until for h in action.holds), default=None
                    )
                return _finish(ctx, action)

    keep_off = (
        ctx.run_mode == "heat"
        and ctx.desired_mode == "off"
        and ctx.hvac_mode in ("heat", "heat_cool", "auto")
    )
    if not keep_off:
        ctx.state.pop(KEEP_OFF_STATE, None)
    else:
        since = ctx.state.setdefault(KEEP_OFF_STATE, {}).setdefault("since", ctx.now)
        wait_until = since + timedelta(seconds=KEEP_OFF_GAP_SECONDS)
        if ctx.now < wait_until:
            return Decision(
                state="waiting",
                reason="the heating was turned on, giving it a courtesy wait before turning it off",
                target=target,
                next_check=wait_until,
            )
        reason = "heating is kept off, the room is above its floor"
        return _finish(
            ctx,
            Decision(
                action="set_hvac_mode",
                value="off",
                reason=reason,
                guard="keep_heating_off",
                acted=[("keep_heating_off", reason)],
                target=target,
            ),
        )
    if ctx.desired_mode == "off" or ctx.room is None or ctx.setpoint is None:
        return Decision(state="defending", reason="holding", target=target, guard=None)
    if ctx.off_owner or ctx.hvac_mode != ctx.desired_mode:
        reason = (
            "heating is off and the room is comfortable, nothing to do"
            if ctx.run_mode == "heat"
            else "the unit is off on purpose"
        )
        return Decision(state="defending", reason=reason, target=target)
    if ctx.setpoint <= target + TOLERANCE:
        return Decision(
            state="defending", reason="at my temperature, nothing to do", target=target
        )

    proposal = max(target, ctx.room - APPROACH) if ctx.direct else target
    if proposal >= ctx.setpoint - 0.05:
        return Decision(
            state="defending",
            reason="already cooling toward my temperature",
            target=target,
        )
    shaped: list[tuple[str, str]] = []
    for guard in guards:
        if guard.on(ctx):
            result = guard.shape(ctx, proposal) if not ctx.direct else None
            if result:
                proposal = result[0]
                shaped.append((guard.spec.key, result[1]))
    proposal = max(_grid(proposal, ctx.step), target)
    proposal = min(proposal, ctx.max_temp)
    proposal = max(proposal, ctx.min_temp)
    ctx.proposal = proposal
    if proposal >= ctx.setpoint - 0.05:
        return Decision(
            state="defending", reason="the step rounds to no change", target=target
        )

    ctx.bypass = [
        (g.spec.key, reason) for g in guards if g.on(ctx) and (reason := g.bypass(ctx))
    ]
    holds = [h for g in guards if g.on(ctx) and (h := g.hold(ctx))]
    if ctx.bypass:
        holds = [h for h in holds if h.guard in NON_BYPASSABLE]
    if holds:
        holds.sort(key=lambda h: h.until)
        return Decision(
            state="waiting",
            reason=holds[0].reason,
            holds=holds,
            next_check=holds[0].until,
            target=target,
            guard=holds[0].guard,
        )
    decision = Decision(
        action="set_temperature",
        value=proposal,
        reason=f"holding {target:.1f}: "
        + (shaped[0][1] if shaped else "stepping back to my temperature"),
        acted=[*reasons, *ctx.bypass, *shaped],
        target=target,
    )
    decision.guard = decision.acted[0][0] if decision.acted else None
    return _finish(ctx, decision)


def build_runtime(
    guards: list[Guard], options: dict
) -> tuple[dict[str, object], dict[str, bool]]:
    """Return the settings and on/off state of every guard from the stored options."""
    from .spec import settings_with_defaults  # noqa: PLC0415

    stored = options.get("guards", {})
    cfg = {}
    enabled = {}
    for guard in guards:
        entry = stored.get(guard.spec.key, {})
        cfg[guard.spec.key] = settings_with_defaults(guard.spec, entry.get("settings"))
        enabled[guard.spec.key] = bool(entry.get("enabled", guard.spec.default_on))
    return cfg, enabled
