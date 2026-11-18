"""Guards that time corrections to real readings from the device and the home."""

from datetime import datetime, timedelta

from ..model import Ctx, Hold
from ..spec import GROUP_TIMING, GuardSpec, cnt, deg, flag, mins, num, sec
from .base import EpochHold
from .pacing import median_interval

GRACE_BAND = 0.8


class StartedHold(EpochHold):
    """Hold that counts from the moment its condition first became true."""

    def anchor(self, ctx: Ctx) -> datetime | None:
        """Apply this rule of the guard."""
        state = self.st(ctx)
        return state.setdefault("start", ctx.now)


def window_delta(samples: list[tuple[datetime, float]], now: datetime, minutes: float):
    """Return newest minus oldest value inside the window, or None."""
    limit = now - timedelta(minutes=minutes)
    inside = [s for s in samples if s[0] >= limit]
    if len(inside) < 2:
        return None
    return inside[-1][1] - inside[0][1], inside


class SetpointEcho(EpochHold):
    """Wait for the device to report the last setpoint."""

    spec = GuardSpec(
        "setpoint_echo",
        "sensing",
        GROUP_TIMING,
        (sec("grace_seconds", 30), deg("band", 1.0)),
    )
    reason_text = "waiting for the device to report the last setpoint"

    def trigger(self, ctx: Ctx) -> bool:
        """Apply this rule of the guard."""
        echo = ctx.pending_echo
        return echo is not None and (
            ctx.setpoint is None or abs(ctx.setpoint - echo[0]) > 0.15
        )

    def anchor(self, ctx: Ctx) -> datetime | None:
        """Apply this rule of the guard."""
        return ctx.pending_echo[1] if ctx.pending_echo else None

    def duration(self, ctx: Ctx) -> float:
        """Apply this rule of the guard."""
        return self.cfg(ctx).grace_seconds


class RepeatQuiet(EpochHold):
    """Wait before sending the same number again."""

    spec = GuardSpec(
        "repeat_quiet",
        "sensing",
        GROUP_TIMING,
        (
            sec("min_wait_seconds", 90),
            sec("pressure_extra_seconds", 240),
            deg("band", 1.0),
        ),
    )
    reason_text = "the same number was just sent, waiting before repeating it"

    def trigger(self, ctx: Ctx) -> bool:
        """Apply this rule of the guard."""
        return (
            bool(ctx.commands)
            and ctx.proposal is not None
            and ctx.commands[-1].setpoint is not None
            and abs(ctx.proposal - ctx.commands[-1].setpoint) < 0.01
        )

    def anchor(self, ctx: Ctx) -> datetime | None:
        """Apply this rule of the guard."""
        return self.last_command(ctx)

    def duration(self, ctx: Ctx) -> float:
        """Apply this rule of the guard."""
        c = self.cfg(ctx)
        pressure = max(ctx.touch_pressure(), ctx.command_pressure())
        return c.min_wait_seconds + c.pressure_extra_seconds * pressure / 100.0


class SetpointStillness(EpochHold):
    """Wait until the wall setpoint stops moving."""

    spec = GuardSpec(
        "setpoint_stillness",
        "sensing",
        GROUP_TIMING,
        (
            cnt("trigger_touches", 2),
            cnt("required_samples", 3, 20),
            sec("max_hold_seconds", 180),
            deg("tolerance", 0.05, 1.0),
            deg("band", 1.0),
        ),
    )
    reason_text = "waiting for the wall setting to hold still"

    def observe(self, ctx: Ctx) -> None:
        """Apply this rule of the guard."""
        state = self.st(ctx)
        if not ctx.reading_times or ctx.setpoint is None:
            return
        latest = ctx.reading_times[-1]
        if state.get("last_reading") == latest:
            return
        state["last_reading"] = latest
        last = state.get("last_setpoint")
        if last is not None and abs(last - ctx.setpoint) <= self.cfg(ctx).tolerance:
            state["same"] = state.get("same", 1) + 1
        else:
            state["same"] = 1
        state["last_setpoint"] = ctx.setpoint

    def trigger(self, ctx: Ctx) -> bool:
        """Apply this rule of the guard."""
        c = self.cfg(ctx)
        return (
            len(ctx.touches_in(30)) >= c.trigger_touches
            and self.st(ctx).get("same", 0) < c.required_samples
        )

    def anchor(self, ctx: Ctx) -> datetime | None:
        """Apply this rule of the guard."""
        return self.latest_touch(ctx)

    def duration(self, ctx: Ctx) -> float:
        """Apply this rule of the guard."""
        return self.cfg(ctx).max_hold_seconds

    def hold(self, ctx: Ctx) -> Hold | None:
        """Apply this rule of the guard."""
        # The sample counter lives in the same state dict that a clear wipes.
        keep = {
            k: v
            for k, v in self.st(ctx).items()
            if k in ("last_reading", "last_setpoint", "same")
        }
        result = super().hold(ctx)
        self.st(ctx).update(keep)
        return result


class SensorRhythm(EpochHold):
    """Time a nudge to just after the usual reading beat."""

    spec = GuardSpec(
        "sensor_rhythm",
        "sensing",
        GROUP_TIMING,
        (
            cnt("min_samples", 3, 50),
            mins("window_minutes", 120, 720),
            sec("jitter_seconds", 25, 300),
            deg("band", 1.0),
        ),
    )
    reason_text = "waiting for the next sensor update"

    def trigger(self, ctx: Ctx) -> bool:
        """Apply this rule of the guard."""
        c = self.cfg(ctx)
        limit = ctx.now - timedelta(minutes=c.window_minutes)
        enough = len([t for t in ctx.reading_times if t >= limit]) >= c.min_samples
        return enough and bool(ctx.touches_in(30))

    def anchor(self, ctx: Ctx) -> datetime | None:
        """Apply this rule of the guard."""
        return self.latest_touch(ctx)

    def duration(self, ctx: Ctx) -> float:
        """Apply this rule of the guard."""
        c = self.cfg(ctx)
        anchor = self.latest_touch(ctx)
        beat = median_interval(ctx, c.window_minutes)
        if anchor is None or not beat or not ctx.reading_times:
            return 0.0
        nxt = ctx.reading_times[-1]
        while nxt <= anchor:
            nxt += timedelta(seconds=beat)
        return (nxt - anchor).total_seconds() + ctx.rng.uniform(0, c.jitter_seconds)


class HvacAlibi(EpochHold):
    """Wait for a real change of the device's activity."""

    spec = GuardSpec(
        "hvac_alibi",
        "sensing",
        GROUP_TIMING,
        (
            cnt("trigger_touches", 2),
            sec("transition_window_seconds", 90),
            mins("max_hold_minutes", 12),
            deg("band", 1.0),
        ),
    )
    reason_text = "waiting for the air conditioner to change what it is doing"

    def trigger(self, ctx: Ctx) -> bool:
        """Apply this rule of the guard."""
        c = self.cfg(ctx)
        anchor = self.latest_touch(ctx)
        if anchor is None or len(ctx.touches_in(30)) < c.trigger_touches:
            return False
        recent = anchor - timedelta(seconds=c.transition_window_seconds)
        return not any(t >= recent for t, _ in ctx.action_changes)

    def anchor(self, ctx: Ctx) -> datetime | None:
        """Apply this rule of the guard."""
        return self.latest_touch(ctx)

    def duration(self, ctx: Ctx) -> float:
        """Apply this rule of the guard."""
        return self.cfg(ctx).max_hold_minutes * 60

    def hold(self, ctx: Ctx) -> Hold | None:
        """Apply this rule of the guard."""
        result = super().hold(ctx)
        anchor = self.latest_touch(ctx)
        if result and anchor and any(t > anchor for t, _ in ctx.action_changes):
            return None
        return result


class TelemetryAlibi(EpochHold):
    """Wait for the next real telemetry update."""

    spec = GuardSpec(
        "telemetry_alibi",
        "sensing",
        GROUP_TIMING,
        (
            cnt("trigger_touches", 2),
            sec("min_hold_seconds", 90),
            mins("max_hold_minutes", 10),
            deg("band", 1.0),
            flag("use_weather", True),
            flag("use_sensor_beat", True),
            flag("use_peak_power", True),
        ),
    )
    reason_text = "waiting for the next normal update from the home"

    def _signals(self, ctx: Ctx) -> list[datetime]:
        c = self.cfg(ctx)
        signals: list[datetime] = []
        if c.use_sensor_beat:
            signals += ctx.reading_times
        if c.use_weather and ctx.last_weather_update:
            signals.append(ctx.last_weather_update)
        if c.use_peak_power and ctx.last_power_update:
            signals.append(ctx.last_power_update)
        return signals

    def trigger(self, ctx: Ctx) -> bool:
        """Apply this rule of the guard."""
        return len(ctx.touches_in(30)) >= self.cfg(ctx).trigger_touches and bool(
            self._signals(ctx)
        )

    def anchor(self, ctx: Ctx) -> datetime | None:
        """Apply this rule of the guard."""
        return self.latest_touch(ctx)

    def duration(self, ctx: Ctx) -> float:
        """Apply this rule of the guard."""
        return self.cfg(ctx).max_hold_minutes * 60

    def hold(self, ctx: Ctx) -> Hold | None:
        """Apply this rule of the guard."""
        result = super().hold(ctx)
        anchor = self.latest_touch(ctx)
        if result and anchor:
            ready = anchor + timedelta(seconds=self.cfg(ctx).min_hold_seconds)
            if any(s > ready for s in self._signals(ctx)):
                return None
            if ctx.now < ready:
                return self.hold_for(ctx, ready, self.reason(ctx))
        return result


class CoolingRunway(EpochHold):
    """Let a new cooling cycle run before nudging again."""

    spec = GuardSpec(
        "cooling_runway",
        "sensing",
        GROUP_TIMING,
        (sec("min_seconds", 120), sec("pressure_extra_seconds", 240), deg("band", 1.0)),
    )
    reason_text = "the air conditioner just started cooling, letting it work"

    def trigger(self, ctx: Ctx) -> bool:
        """Apply this rule of the guard."""
        return ctx.hvac_action == ctx.active_action and ctx.cooling_started is not None

    def anchor(self, ctx: Ctx) -> datetime | None:
        """Apply this rule of the guard."""
        return ctx.cooling_started

    def duration(self, ctx: Ctx) -> float:
        """Apply this rule of the guard."""
        c = self.cfg(ctx)
        return c.min_seconds + c.pressure_extra_seconds * ctx.command_pressure() / 100.0


class RoomTrendGuard(StartedHold):
    """Keep watching while the room is already cooling on its own."""

    spec = GuardSpec(
        "room_trend_guard",
        "sensing",
        GROUP_TIMING,
        (
            mins("window_minutes", 12, 120),
            deg("stable_tolerance", 0.2),
            mins("hold_minutes", 8),
        ),
    )
    reason_text = "the room is already cooling, watching it"

    def clear(self, ctx: Ctx) -> bool:
        """Apply this rule of the guard."""
        return ctx.over_band(GRACE_BAND)

    def trigger(self, ctx: Ctx) -> bool:
        """Apply this rule of the guard."""
        c = self.cfg(ctx)
        result = window_delta(ctx.room_samples, ctx.now, c.window_minutes)
        return result is not None and result[0] < -c.stable_tolerance

    def duration(self, ctx: Ctx) -> float:
        """Apply this rule of the guard."""
        return self.cfg(ctx).hold_minutes * 60


class ThermalMomentum(StartedHold):
    """Wait when the room will reach the target soon by itself."""

    spec = GuardSpec(
        "thermal_momentum",
        "sensing",
        GROUP_TIMING,
        (
            num("min_cooling_rate", 0.4, 0.0, 10.0, 0.05, "°C/h"),
            mins("look_ahead_minutes", 45, 240),
            mins("hold_minutes", 6),
        ),
    )
    reason_text = "the room is cooling fast enough to reach the target soon"

    def clear(self, ctx: Ctx) -> bool:
        """Apply this rule of the guard."""
        return (
            ctx.over_band(GRACE_BAND)
            or ctx.room is None
            or ctx.room <= ctx.target + 0.2
        )

    def trigger(self, ctx: Ctx) -> bool:
        """Apply this rule of the guard."""
        c = self.cfg(ctx)
        result = window_delta(ctx.room_samples, ctx.now, 30)
        if result is None or ctx.room is None:
            return False
        delta, inside = result
        hours = (inside[-1][0] - inside[0][0]).total_seconds() / 3600
        if hours <= 0 or delta >= 0:
            return False
        rate = -delta / hours
        if rate < c.min_cooling_rate:
            return False
        return (ctx.room - ctx.target) / rate * 60 <= c.look_ahead_minutes

    def duration(self, ctx: Ctx) -> float:
        """Apply this rule of the guard."""
        return self.cfg(ctx).hold_minutes * 60


class WeatherDriftTiming(EpochHold):
    """Hold while the outdoor temperature is stable or falling."""

    spec = GuardSpec(
        "weather_drift_timing",
        "sensing",
        GROUP_TIMING,
        (
            mins("window_minutes", 45, 240),
            deg("min_change", 0.3),
            mins("hold_minutes", 7),
            deg("band", 1.0),
        ),
    )
    reason_text = "waiting for the outdoor temperature to move"

    def trigger(self, ctx: Ctx) -> bool:
        """Apply this rule of the guard."""
        c = self.cfg(ctx)
        result = window_delta(ctx.outdoor_samples, ctx.now, c.window_minutes)
        return (
            result is not None
            and result[0] < c.min_change
            and bool(ctx.touches_in(c.window_minutes))
        )

    def anchor(self, ctx: Ctx) -> datetime | None:
        """Apply this rule of the guard."""
        return self.latest_touch(ctx, self.cfg(ctx).window_minutes)

    def duration(self, ctx: Ctx) -> float:
        """Apply this rule of the guard."""
        return self.cfg(ctx).hold_minutes * 60


class RemoteSettlingGuard(EpochHold):
    """Give repeated phone or automation changes a quiet window."""

    spec = GuardSpec(
        "remote_settling_guard",
        "sensing",
        GROUP_TIMING,
        (
            cnt("trigger_changes", 2),
            mins("window_minutes", 30, 240),
            mins("hold_minutes", 12),
            deg("band", 1.0),
        ),
    )
    reason_text = "repeated changes from a phone or automation, letting them settle"

    def _remote(self, ctx: Ctx):
        return ctx.touches_in(self.cfg(ctx).window_minutes, remote=True)

    def trigger(self, ctx: Ctx) -> bool:
        """Apply this rule of the guard."""
        return len(self._remote(ctx)) >= self.cfg(ctx).trigger_changes

    def anchor(self, ctx: Ctx) -> datetime | None:
        """Apply this rule of the guard."""
        remote = self._remote(ctx)
        return remote[-1].time if remote else None

    def duration(self, ctx: Ctx) -> float:
        """Apply this rule of the guard."""
        return self.cfg(ctx).hold_minutes * 60


SENSING_GUARDS = (
    SetpointEcho,
    RepeatQuiet,
    SetpointStillness,
    SensorRhythm,
    HvacAlibi,
    TelemetryAlibi,
    CoolingRunway,
    RoomTrendGuard,
    ThermalMomentum,
    WeatherDriftTiming,
    RemoteSettlingGuard,
)
