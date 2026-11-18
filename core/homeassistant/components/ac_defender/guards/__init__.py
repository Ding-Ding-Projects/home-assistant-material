"""The guards of the AC Defender engine."""

from ..spec import Guard
from .energy import ENERGY_GUARDS
from .pacing import PACING_GUARDS
from .people import PEOPLE_GUARDS
from .recovery import RECOVERY_GUARDS
from .safety import SAFETY_GUARDS
from .sensing import SENSING_GUARDS
from .shaping import SHAPING_GUARDS

ALL_GUARD_CLASSES = (
    *SAFETY_GUARDS,
    *RECOVERY_GUARDS,
    *SHAPING_GUARDS,
    *PACING_GUARDS,
    *SENSING_GUARDS,
    *PEOPLE_GUARDS,
    *ENERGY_GUARDS,
)

COOL_ONLY = frozenset(
    {
        "cooling_failure_watch",
        "cool_outdoor_shutdown",
        "fan_energy_saver",
        "upstairs_comfort_guard",
        "room_trend_guard",
        "thermal_momentum",
        "weather_drift_timing",
        "savings_pantry",
        "siesta_watch",
    }
)

TARGET_ORDER = (
    "schedule_weather_rules",
    "comfort_memory",
    "comfort_compromise",
    "repeated_raise_surrender",
    "wake_up_truce",
    "upstairs_comfort_guard",
)
NON_BYPASSABLE = frozenset({"peak_power_saver", "schedule_weather_rules"})


def guards_for(run_mode: str) -> list[Guard]:
    """Return fresh guard instances offered for a direction (cool or heat)."""
    return [
        cls()
        for cls in ALL_GUARD_CLASSES
        if run_mode == "cool" or cls.spec.key not in COOL_ONLY
    ]
