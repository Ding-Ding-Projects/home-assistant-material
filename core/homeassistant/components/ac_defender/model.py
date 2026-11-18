"""Data model used by the AC Defender decision engine (no Home Assistant imports)."""

from dataclasses import dataclass, field
from datetime import datetime, timedelta
import random
from types import SimpleNamespace
from typing import Any

HUMAN_SOURCES = frozenset({"wall", "user", "automation"})
REMOTE_SOURCES = frozenset({"user", "automation"})


@dataclass(slots=True)
class Touch:
    """An external change of the setpoint."""

    time: datetime
    old: float | None
    new: float | None
    source: str  # wall, user, automation or schedule
    user_id: str | None = None


@dataclass(slots=True)
class Command:
    """A setpoint command sent by the defender."""

    time: datetime
    setpoint: float | None


@dataclass(frozen=True, slots=True)
class RivalBlock:
    """One block of the air conditioner app's own schedule."""

    name: str
    start: str
    low: float
    high: float
    days: tuple[int, ...]


@dataclass(frozen=True, slots=True)
class Hold:
    """A guard asks the defender to wait."""

    guard: str
    until: datetime
    reason: str


@dataclass(slots=True)
class Standdown:
    """The defender is deliberately not correcting."""

    kind: str  # paused, emergency, siesta, front_door, tamper_truce, stopped
    until: datetime | None
    reason: str
    stop_everything: bool = False


@dataclass(slots=True)
class Decision:
    """The outcome of one evaluation."""

    state: str = "defending"  # defending, waiting, paused, standing_down, emergency
    reason: str = ""
    action: str | None = None  # set_temperature, set_hvac_mode, set_fan_mode, turn_off
    value: float | str | None = None
    next_check: datetime | None = None
    holds: list[Hold] = field(default_factory=list)
    acted: list[tuple[str, str]] = field(default_factory=list)
    target: float | None = None
    guard: str | None = None


@dataclass(slots=True)
class Ctx:
    """Everything a guard may look at during one evaluation."""

    now: datetime
    rng: random.Random
    room: float | None
    setpoint: float | None
    hvac_mode: str | None
    hvac_action: str | None
    fan_mode: str | None
    fan_modes: list[str]
    min_temp: float
    max_temp: float
    step: float
    my_temp: float
    safety_temp: float
    cfg: dict[str, SimpleNamespace]
    enabled: dict[str, bool]
    state: dict[str, dict[str, Any]]
    touches: list[Touch] = field(default_factory=list)
    commands: list[Command] = field(default_factory=list)
    room_samples: list[tuple[datetime, float]] = field(default_factory=list)
    outdoor_samples: list[tuple[datetime, float]] = field(default_factory=list)
    reading_times: list[datetime] = field(default_factory=list)
    action_changes: list[tuple[datetime, str | None]] = field(default_factory=list)
    cooling_started: datetime | None = None
    outdoor: float | None = None
    forecast_peak: float | None = None
    upstairs: float | None = None
    presence_home: bool | None = None
    person_at_door: bool = False
    door_opened_at: datetime | None = None
    price_cents: float = 0.0
    price_period: str = "off_peak"
    power_kw: float | None = None
    schedule_block: RivalBlock | None = None
    off_owner: str | None = None
    available: bool = True
    run_mode: str = (
        "cool"  # cool: hold cooling at my temperature; heat: keep heating off or capped
    )
    desired_mode: str = (
        "cool"  # hvac mode the defender keeps the device in (cool, heat or off)
    )
    active_action: str = "cooling"
    floor: float | None = None  # heat only: never let the room fall below this
    floor_margin: float = 1.0
    freeze_floor: float = 18.0
    freeze_guard: bool = True
    reading_age: float = (
        0.0  # seconds since the room temperature changed or was confirmed
    )
    preset_mode: str | None = None
    protective_preset: bool = False
    pending_echo: tuple[float, datetime] | None = None
    last_weather_update: datetime | None = None
    last_power_update: datetime | None = None
    last_command_time: datetime | None = None
    price_period_started: datetime | None = None
    # Filled in during the decision.
    target: float = 0.0
    proposal: float | None = None
    direct: bool = False
    bypass: list[tuple[str, str]] = field(default_factory=list)

    def over_band(self, band: float) -> bool:
        """Return True when the room is above my temperature's target plus band."""
        return self.room is not None and self.room >= self.target + band

    def touches_in(self, minutes: float, *, remote: bool = False) -> list[Touch]:
        """Return human touches inside the last number of minutes."""
        limit = self.now - timedelta(minutes=minutes)
        sources = REMOTE_SOURCES if remote else HUMAN_SOURCES
        return [t for t in self.touches if t.time >= limit and t.source in sources]

    def commands_in(self, minutes: float) -> list[Command]:
        """Return the defender's own commands inside the last number of minutes."""
        limit = self.now - timedelta(minutes=minutes)
        return [c for c in self.commands if c.time >= limit]

    def touch_pressure(self) -> float:
        """Return 0 to 100: how strongly people changed the setpoint in 30 minutes."""
        return min(100.0, 25.0 * len(self.touches_in(30)))

    def command_pressure(self) -> float:
        """Return 0 to 100: how many commands the defender sent in 30 minutes."""
        return min(100.0, 25.0 * len(self.commands_in(30)))

    def notices(self, window: float, after_seconds: float) -> list[Touch]:
        """Return touches that landed shortly after a defender command."""
        found = []
        for touch in self.touches_in(window):
            for command in self.commands:
                delta = (touch.time - command.time).total_seconds()
                if 0 <= delta <= after_seconds:
                    found.append(touch)
                    break
        return found

    def hot(self) -> bool:
        """Return True when the room is at or above the safety temperature."""
        return self.room is not None and self.room >= self.safety_temp
