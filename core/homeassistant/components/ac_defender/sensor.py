"""Sensors and the pause, stop and resume services."""

import probatio

from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_platform
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .const import (
    ATTR_ALSO_SIBLING,
    ATTR_HOURS,
    SERVICE_DEFEND_AGAIN,
    SERVICE_PAUSE,
    SERVICE_STOP_EVERYTHING,
)
from .entity import (
    CostSensor,
    HolderSensor,
    NextCheckSensor,
    RunTimeSensor,
    StateSensor,
)
from .types import DefenderConfigEntry

SERVICE_LET_IT_HEAT = "let_it_heat"
ALSO_SIBLING = {probatio.Optional(ATTR_ALSO_SIBLING, default=False): bool}
HOURS_SCHEMA = {
    **ALSO_SIBLING,
    probatio.Required(ATTR_HOURS): probatio.All(
        probatio.Coerce(float), probatio.Range(min=0.25, max=24)
    ),
}


async def async_setup_entry(
    hass: HomeAssistant,
    entry: DefenderConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Set up the sensors and register the services."""
    coordinator = entry.runtime_data
    entities = [
        StateSensor(coordinator),
        NextCheckSensor(coordinator),
        HolderSensor(coordinator),
        RunTimeSensor(coordinator, month=False),
        RunTimeSensor(coordinator, month=True),
    ]
    if coordinator.cost.power_kw:
        entities += [
            CostSensor(coordinator, month=False),
            CostSensor(coordinator, month=True),
        ]
    async_add_entities(entities)

    platform = entity_platform.async_get_current_platform()
    platform.async_register_entity_service(SERVICE_PAUSE, HOURS_SCHEMA, "async_pause")
    platform.async_register_entity_service(
        SERVICE_STOP_EVERYTHING, ALSO_SIBLING, "async_stop_everything"
    )
    platform.async_register_entity_service(
        SERVICE_DEFEND_AGAIN, ALSO_SIBLING, "async_defend_again"
    )
    if coordinator.run_mode == "heat":
        platform.async_register_entity_service(
            SERVICE_LET_IT_HEAT, HOURS_SCHEMA, "async_let_it_heat"
        )
