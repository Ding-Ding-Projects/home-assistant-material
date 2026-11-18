"""Energy and schedule guards."""

from datetime import datetime, timedelta

from ..model import Ctx, Decision, Hold
from ..spec import GROUP_MONEY, Guard, GuardSpec, Setting, choice, deg, flag, mins, num
from .people import in_window

WEATHER_MODES = (
    "always",
    "room_above_outdoor",
    "room_below_outdoor",
    "outdoor_above_target",
    "outdoor_below_target",
)
ROOM_BAND = 1.5
PARK_SETPOINT = 28.0  # the original stand-down park number
DEBOUNCE_SECONDS = 120


def weather_allows(mode: str, ctx: Ctx, target: float) -> bool:
    """Return True when the weather condition for corrective action holds."""
    if mode == "always" or ctx.outdoor is None or ctx.room is None:
        return True
    return {
        "room_above_outdoor": ctx.room > ctx.outdoor,
        "room_below_outdoor": ctx.room < ctx.outdoor,
        "outdoor_above_target": ctx.outdoor > target,
        "outdoor_below_target": ctx.outdoor < target,
    }[mode]


class PeakPowerSaver(Guard):
    """Hold extra cooling during peak price or high power use."""

    spec = GuardSpec(
        "peak_power_saver",
        "energy",
        GROUP_MONEY,
        (
            flag("on_peak", True),
            flag("high_power", True),
            num("power_threshold_kw", 2.5, 0, 50, 0.1, "kW"),
            num("price_threshold_cents", 15.0, 0, 500, 0.5, "¢/kWh"),
            mins("hold_minutes", 20),
            deg("band", 1.0),
            flag("fan_saver", True),
            Setting("fan_mode", "auto", "text"),
        ),
    )

    def observe(self, ctx: Ctx) -> None:
        """Apply this rule of the guard."""
        c = self.cfg(ctx)
        state = self.st(ctx)
        triggered = (
            (c.on_peak and ctx.price_period == "on_peak")
            or ctx.price_cents > c.price_threshold_cents
            or (
                c.high_power
                and ctx.power_kw is not None
                and ctx.power_kw > c.power_threshold_kw
            )
        )
        if triggered:
            state["until"] = ctx.now + timedelta(minutes=c.hold_minutes)
        elif state.get("until") and ctx.now >= state["until"]:
            state.clear()

    def armed(self, ctx: Ctx) -> bool:
        """Return True while the saver window is open."""
        until = self.st(ctx).get("until")
        return bool(until and ctx.now < until)

    def hold(self, ctx: Ctx) -> Hold | None:
        """Apply this rule of the guard."""
        c = self.cfg(ctx)
        if (
            not self.armed(ctx)
            or ctx.over_band(c.band)
            or ctx.proposal is None
            or ctx.setpoint is None
            or ctx.proposal >= ctx.setpoint
        ):
            return None
        return self.hold_for(
            ctx,
            self.st(ctx)["until"],
            "peak price or high power use, holding extra cooling",
        )

    def act(self, ctx: Ctx) -> Decision | None:
        """Apply this rule of the guard."""
        c = self.cfg(ctx)
        if (
            self.armed(ctx)
            and c.fan_saver
            and c.fan_mode in ctx.fan_modes
            and ctx.fan_mode != c.fan_mode
            and not ctx.over_band(c.band)
        ):
            reason = "peak hours, using the saver fan mode"
            return Decision(
                action="set_fan_mode",
                value=c.fan_mode,
                reason=reason,
                guard=self.spec.key,
                acted=[(self.spec.key, reason)],
            )
        return None


class FanEnergySaver(Guard):
    """Move the fan to a saver mode when the room is near the target."""

    spec = GuardSpec(
        "fan_energy_saver",
        "energy",
        GROUP_MONEY,
        (deg("threshold", 0.6), Setting("fan_mode", "auto", "text")),
        default_on=False,
    )

    def act(self, ctx: Ctx) -> Decision | None:
        """Apply this rule of the guard."""
        c = self.cfg(ctx)
        if (
            ctx.room is None
            or abs(ctx.room - ctx.target) > c.threshold
            or c.fan_mode not in ctx.fan_modes
            or ctx.fan_mode == c.fan_mode
        ):
            return None
        reason = "the room is near my temperature, saving fan energy"
        return Decision(
            action="set_fan_mode",
            value=c.fan_mode,
            reason=reason,
            guard=self.spec.key,
            acted=[(self.spec.key, reason)],
        )


class CoolOutdoorShutdown(Guard):
    """Turn the unit off when it is genuinely cool outside, and back on later."""

    spec = GuardSpec(
        "cool_outdoor_shutdown",
        "energy",
        GROUP_MONEY,
        (
            num("below", 20.0, -20, 40, 0.5, "°C"),
            deg("restore_margin", 1.5),
            mins("min_off_minutes", 30),
            flag("forecast_gate", True),
            mins("forecast_gate_hours", 4, 48),
        ),
        default_on=False,
    )

    def holds_off(self, ctx: Ctx) -> bool:
        """Apply this rule of the guard."""
        return bool(self.st(ctx).get("off"))

    def act(self, ctx: Ctx) -> Decision | None:
        """Apply this rule of the guard."""
        c = self.cfg(ctx)
        state = self.st(ctx)
        if ctx.outdoor is None:
            return None
        warm = ctx.outdoor >= c.below + c.restore_margin
        if warm and not state.get("off"):
            state.clear()
            return None
        if state.get("off"):
            dwell = ctx.now - state["since"] >= timedelta(minutes=c.min_off_minutes)
            if ctx.hvac_mode != "off":
                state["off"] = False
                state["done"] = True
                return None
            if ctx.over_band(ROOM_BAND) or (warm and dwell):
                state["off"] = False
                reason = (
                    "the room is warming, restoring cool mode"
                    if ctx.over_band(ROOM_BAND)
                    else "it is warm outside again, restoring cool mode"
                )
                return Decision(
                    action="set_hvac_mode",
                    value="cool",
                    reason=reason,
                    guard=self.spec.key,
                    acted=[(self.spec.key, reason)],
                )
            return None
        if state.get("done") or ctx.outdoor >= c.below or ctx.over_band(ROOM_BAND):
            return None
        if c.forecast_gate and (
            ctx.forecast_peak is None or ctx.forecast_peak >= c.below + c.restore_margin
        ):
            return None
        state["since"] = ctx.now
        state["off"] = True
        if ctx.hvac_mode == "off":
            return None
        reason = "it is cool outside and stays cool, turning the unit off"
        return Decision(
            action="turn_off",
            reason=reason,
            guard=self.spec.key,
            acted=[(self.spec.key, reason)],
        )


class SiestaWatch(Guard):
    """A timed nap: the unit is parked or turned off until the timer ends."""

    spec = GuardSpec(
        "siesta_watch",
        "energy",
        GROUP_MONEY,
        (
            choice("thermostat_action", "park", ("park", "off")),
            deg("wake_band", 1.0),
            mins("max_minutes", 480, 1440),
        ),
    )

    def start(self, ctx: Ctx, minutes: float) -> None:
        """Begin a siesta."""
        c = self.cfg(ctx)
        length = min(minutes, c.max_minutes)
        self.st(ctx).update(
            until=ctx.now + timedelta(minutes=length),
            since=ctx.now,
            action_pending=True,
        )

    def stop(self, ctx: Ctx) -> None:
        """End the siesta."""
        self.st(ctx).clear()

    def standdown(self, ctx: Ctx) -> str | None:
        """Apply this rule of the guard."""
        state = self.st(ctx)
        if not state.get("until"):
            return None
        c = self.cfg(ctx)
        if ctx.now >= state["until"] or ctx.hot() or ctx.over_band(c.wake_band):
            state.clear()
            return None
        return "siesta: the unit is resting until the timer ends"

    def holds_off(self, ctx: Ctx) -> bool:
        """Apply this rule of the guard."""
        return bool(self.standdown(ctx) and self.cfg(ctx).thermostat_action == "off")

    def act(self, ctx: Ctx) -> Decision | None:
        """Apply this rule of the guard."""
        state = self.st(ctx)
        if not (self.standdown(ctx) and state.get("action_pending")):
            return None
        state["action_pending"] = False
        reason = "siesta started"
        if self.cfg(ctx).thermostat_action == "off":
            return Decision(
                action="turn_off",
                reason=reason,
                guard=self.spec.key,
                acted=[(self.spec.key, reason)],
            )
        park = min(ctx.max_temp, max(PARK_SETPOINT, ctx.setpoint or 0))
        return Decision(
            action="set_temperature",
            value=park,
            reason=reason,
            guard=self.spec.key,
            acted=[(self.spec.key, reason)],
        )


class SavingsPantry(Guard):
    """Bookkeeping only: the logic lives in cost.py."""

    spec = GuardSpec(
        "savings_pantry",
        "energy",
        GROUP_MONEY,
        (
            num("balance_max", 20.0, 0, 1000, 0.5),
            num("release_hot_threshold", 30.0, 15, 50, 0.5, "°C"),
            mins("release_lookahead_hours", 12, 48),
            num("release_max_per_day", 5.0, 0, 1000, 0.5),
            num("ration_size", 0.25, 0, 100, 0.05),
        ),
    )


class ScheduleWeatherRules(Guard):
    """Time-of-day target rules gated by a weather condition."""

    spec = GuardSpec(
        "schedule_weather_rules",
        "energy",
        GROUP_MONEY,
        (
            choice("weather_mode", "always", WEATHER_MODES),
            Setting("rules", [], "object"),
        ),
        default_on=False,
    )

    def rule(self, ctx: Ctx) -> dict | None:
        """Return the rule in force now."""
        for rule in self.cfg(ctx).rules:
            days = rule.get("days") or list(range(7))
            if ctx.now.weekday() in days and in_window(
                ctx.now, rule["start"], rule["end"]
            ):
                return rule
        return None

    def adjust_target(self, ctx: Ctx, target: float) -> tuple[float, str] | None:
        """Apply this rule of the guard."""
        rule = self.rule(ctx)
        if rule is None:
            return None
        value = min(ctx.max_temp, max(ctx.min_temp, float(rule["target"])))
        return value, "a time-of-day rule sets this target"

    def hold(self, ctx: Ctx) -> Hold | None:
        """Apply this rule of the guard."""
        rule = self.rule(ctx)
        mode = (rule or {}).get("weather") or self.cfg(ctx).weather_mode
        if rule is None or weather_allows(mode, ctx, ctx.target):
            return None
        return self.hold_for(
            ctx,
            ctx.now + timedelta(minutes=5),
            "the weather rule does not allow a correction now",
        )


class WebsiteDebounce(Guard):
    """Ignore repeated presses of the same control for two minutes."""

    spec = GuardSpec("website_debounce", "energy", GROUP_MONEY)

    def remaining(
        self, state: dict[str, datetime], key: str, now: datetime, *, emergency: bool
    ) -> float:
        """Return seconds left before a repeat is accepted and register a press."""
        last = state.get(key)
        wait = 0.0
        if last is not None and not emergency:
            wait = max(0.0, DEBOUNCE_SECONDS - (now - last).total_seconds())
        if wait == 0.0:
            state[key] = now
        return wait


ENERGY_GUARDS = (
    PeakPowerSaver,
    FanEnergySaver,
    CoolOutdoorShutdown,
    SiestaWatch,
    SavingsPantry,
    ScheduleWeatherRules,
    WebsiteDebounce,
)
