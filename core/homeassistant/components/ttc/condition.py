"""Automation conditions for TTC transit."""

from typing import Unpack, cast, override

import probatio

from homeassistant.const import CONF_OPTIONS
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.condition import (
    Condition,
    ConditionCheckParams,
    ConditionConfig,
)
from homeassistant.helpers.typing import ConfigType

from .api import LiveAlerts
from .const import KIND_ELEVATOR, STATUS_REGULAR
from .coordinator import async_get_entry

CONF_ROUTE = "route"
CONF_STATION = "station"

_ROUTE_SCHEMA = probatio.Schema(
    {probatio.Required(CONF_OPTIONS): {probatio.Required(CONF_ROUTE): cv.string}}
)
_STATION_SCHEMA = probatio.Schema(
    {probatio.Required(CONF_OPTIONS): {probatio.Required(CONF_STATION): cv.string}}
)


def _fresh_alerts(hass: HomeAssistant) -> LiveAlerts | None:
    """Return the most recent fresh alerts answer, if any."""
    if (entry := async_get_entry(hass)) is None:
        return None
    answers = [
        coordinator.data
        for coordinator in (entry.runtime_data.alerts, entry.runtime_data.lifts)
        if coordinator is not None and coordinator.data and coordinator.is_fresh
    ]
    return max(answers, key=lambda data: data.read_at) if answers else None


class RouteHasProblemCondition(Condition):
    """Tests if a route has a delay, detour, closure or slow zone."""

    @classmethod
    @override
    async def async_validate_config(
        cls, hass: HomeAssistant, config: ConfigType
    ) -> ConfigType:
        """Validate config."""
        return cast(ConfigType, _ROUTE_SCHEMA(config))

    def __init__(self, hass: HomeAssistant, config: ConditionConfig) -> None:
        """Initialize the condition."""
        super().__init__(hass, config)
        assert config.options is not None
        self._route: str = config.options[CONF_ROUTE]

    @override
    def _async_check(self, **kwargs: Unpack[ConditionCheckParams]) -> bool:
        """Check the condition. Unknown or old information does not pass."""
        if (data := _fresh_alerts(self._hass)) is None:
            return False
        return data.route_status(self._route) != STATUS_REGULAR


class StationIsStepFreeCondition(Condition):
    """Tests if no elevator is reported out at a station."""

    @classmethod
    @override
    async def async_validate_config(
        cls, hass: HomeAssistant, config: ConfigType
    ) -> ConfigType:
        """Validate config."""
        return cast(ConfigType, _STATION_SCHEMA(config))

    def __init__(self, hass: HomeAssistant, config: ConditionConfig) -> None:
        """Initialize the condition."""
        super().__init__(hass, config)
        assert config.options is not None
        self._station: str = config.options[CONF_STATION]

    @override
    def _async_check(self, **kwargs: Unpack[ConditionCheckParams]) -> bool:
        """Check the condition. Unknown or old information does not pass."""
        if (data := _fresh_alerts(self._hass)) is None:
            return False
        return not data.station_outages(self._station, KIND_ELEVATOR)


CONDITIONS: dict[str, type[Condition]] = {
    "route_has_problem": RouteHasProblemCondition,
    "station_is_step_free": StationIsStepFreeCondition,
}


async def async_get_conditions(hass: HomeAssistant) -> dict[str, type[Condition]]:
    """Return the TTC transit conditions."""
    return CONDITIONS
