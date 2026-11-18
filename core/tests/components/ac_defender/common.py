"""Helpers for the AC Defender engine tests (fake clock, fake device)."""

from datetime import UTC, datetime, timedelta
import random
from typing import Any

from homeassistant.components.ac_defender.guards import guards_for
from homeassistant.components.ac_defender.model import Command, Ctx, Touch
from homeassistant.components.ac_defender.pipeline import build_runtime, decide

NOW = datetime(2026, 7, 14, 14, 0, tzinfo=UTC)


def minutes_ago(minutes: float) -> datetime:
    """Return a time in the past relative to the fake clock."""
    return NOW - timedelta(minutes=minutes)


def make(
    mode: str = "cool",
    options: dict[str, Any] | None = None,
    **fields: Any,
) -> tuple[Ctx, list]:
    """Build a context and the guards offered for a direction."""
    guards = guards_for(mode)
    cfg, enabled = build_runtime(guards, options or {})
    base: dict[str, Any] = {
        "now": NOW,
        "rng": random.Random(1),
        "room": 24.0,
        "setpoint": 26.0,
        "hvac_mode": "cool" if mode == "cool" else "heat",
        "hvac_action": "idle",
        "fan_mode": None,
        "fan_modes": [],
        "min_temp": 16.0,
        "max_temp": 30.0,
        "step": 0.5,
        "my_temp": 23.0,
        "safety_temp": 28.0,
        "cfg": cfg,
        "enabled": enabled,
        "state": {},
        "run_mode": mode,
        "desired_mode": "cool" if mode == "cool" else "heat",
        "active_action": "cooling" if mode == "cool" else "heating",
    }
    base.update(fields)
    return Ctx(**base), guards


def only(*keys: str) -> dict[str, Any]:
    """Return options that switch every guard off except the named ones."""
    from homeassistant.components.ac_defender.guards import ALL_GUARD_CLASSES  # noqa: PLC0415

    guards = {
        cls.spec.key: {"enabled": cls.spec.key in keys} for cls in ALL_GUARD_CLASSES
    }
    return {"guards": guards}


def touch(minutes: float, old: float, new: float, source: str = "wall") -> Touch:
    """Return a touch some minutes ago."""
    return Touch(minutes_ago(minutes), old, new, source)


def command(minutes: float, setpoint: float) -> Command:
    """Return a defender command some minutes ago."""
    return Command(minutes_ago(minutes), setpoint)


def run(
    mode: str = "cool",
    keys: tuple[str, ...] | None = None,
    pause: Any = None,
    **fields: Any,
):
    """Decide once with only the named guards on (all default guards when None)."""
    options = only(*keys) if keys is not None else None
    ctx, guards = make(mode, options, **fields)
    return decide(ctx, guards, pause), ctx
