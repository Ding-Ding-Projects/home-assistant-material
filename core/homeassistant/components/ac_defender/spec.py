"""Guard and setting descriptions shared by the engine, the flows and the frontend."""

from dataclasses import dataclass
from datetime import datetime
from types import SimpleNamespace
from typing import Any, ClassVar

from .model import Ctx, Decision, Hold

GROUP_SAFETY = "safety"
GROUP_PEOPLE = "people"
GROUP_MONEY = "money"
GROUP_TIMING = "timing"


@dataclass(frozen=True, slots=True)
class Setting:
    """One tunable value of a guard."""

    key: str
    default: Any
    kind: str = "number"  # number, bool, select, time, text
    minimum: float = 0.0
    maximum: float = 100.0
    step: float = 1.0
    unit: str | None = None
    options: tuple[str, ...] = ()


def num(
    key: str,
    default: float,
    minimum: float,
    maximum: float,
    step: float = 1.0,
    unit: str | None = None,
) -> Setting:
    """Return a numeric setting."""
    return Setting(key, default, "number", minimum, maximum, step, unit)


def sec(key: str, default: float, maximum: float = 3600.0) -> Setting:
    """Return a duration in seconds."""
    return num(key, default, 0, maximum, 1, "s")


def mins(key: str, default: float, maximum: float = 1440.0) -> Setting:
    """Return a duration in minutes."""
    return num(key, default, 0, maximum, 1, "min")


def deg(key: str, default: float, maximum: float = 10.0) -> Setting:
    """Return a temperature difference or limit."""
    return num(key, default, 0, maximum, 0.05, "°C")


def cnt(key: str, default: int, maximum: int = 20) -> Setting:
    """Return a count."""
    return num(key, default, 1, maximum, 1)


def flag(key: str, default: bool) -> Setting:
    """Return an on/off setting."""
    return Setting(key, default, "bool")


def choice(key: str, default: str, options: tuple[str, ...]) -> Setting:
    """Return a choice setting."""
    return Setting(key, default, "select", options=options)


def clock(key: str, default: str) -> Setting:
    """Return a time of day setting."""
    return Setting(key, default, "time")


@dataclass(frozen=True, slots=True)
class GuardSpec:
    """The static description of one guard."""

    key: str
    family: str
    group: str
    settings: tuple[Setting, ...] = ()
    safety: bool = False
    default_on: bool = True
    directions: tuple[str, ...] = ("cool", "heat")


class Guard:
    """Base class of every guard."""

    spec: ClassVar[GuardSpec]

    def on(self, ctx: Ctx) -> bool:
        """Return True when the guard is switched on."""
        return ctx.enabled.get(self.spec.key, False)

    def cfg(self, ctx: Ctx) -> SimpleNamespace:
        """Return the settings of this guard."""
        return ctx.cfg[self.spec.key]

    def st(self, ctx: Ctx) -> dict[str, Any]:
        """Return the mutable state of this guard."""
        return ctx.state.setdefault(self.spec.key, {})

    def hold_for(self, ctx: Ctx, until: datetime, reason: str) -> Hold:
        """Return a hold owned by this guard."""
        return Hold(self.spec.key, until, reason)

    # Hooks, all optional.
    def adjust_target(self, ctx: Ctx, target: float) -> tuple[float, str] | None:
        """Change the effective target; return the new value and a reason."""
        return None

    def shape(self, ctx: Ctx, proposal: float) -> tuple[float, str] | None:
        """Reshape the proposed setpoint."""
        return None

    def bypass(self, ctx: Ctx) -> str | None:
        """Return a reason when quiet waits must be skipped."""
        return None

    def hold(self, ctx: Ctx) -> Hold | None:
        """Return a hold when the correction must wait."""
        return None

    def standdown(self, ctx: Ctx) -> str | None:
        """Return a reason when the defender must stand down."""
        return None

    def act(self, ctx: Ctx) -> Decision | None:
        """Return an own action (mode, fan or off) that precedes the correction."""
        return None

    def holds_off(self, ctx: Ctx) -> bool:
        """Return True while this guard keeps the air conditioner off on purpose."""
        return False

    def observe(self, ctx: Ctx) -> None:
        """Update this guard's own bookkeeping on every evaluation."""


def settings_with_defaults(
    spec: GuardSpec, stored: dict[str, Any] | None
) -> SimpleNamespace:
    """Return the settings of a guard with defaults filled in and values clamped."""
    values: dict[str, Any] = {}
    stored = stored or {}
    for setting in spec.settings:
        value = stored.get(setting.key, setting.default)
        if setting.kind == "number":
            try:
                value = float(value)
            except TypeError, ValueError:
                value = float(setting.default)
            value = min(max(value, setting.minimum), setting.maximum)
        elif setting.kind == "bool":
            value = bool(value)
        elif setting.kind == "select" and value not in setting.options:
            value = setting.default
        values[setting.key] = value
    return SimpleNamespace(**values)
