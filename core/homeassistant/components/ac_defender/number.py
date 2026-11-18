"""Number: the temperature to hold."""

from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .entity import FloorNumber, MyTemperatureNumber
from .types import DefenderConfigEntry


async def async_setup_entry(
    hass: HomeAssistant,
    entry: DefenderConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Set up the number entity."""
    coordinator = entry.runtime_data
    entities = [MyTemperatureNumber(coordinator)]
    if coordinator.run_mode == "heat":
        entities.append(FloorNumber(coordinator))
    async_add_entities(entities)
