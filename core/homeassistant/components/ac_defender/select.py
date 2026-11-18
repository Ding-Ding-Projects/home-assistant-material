"""Select: how the Heat Defender keeps the heating."""

from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .entity import HeatModeSelect
from .types import DefenderConfigEntry


async def async_setup_entry(
    hass: HomeAssistant,
    entry: DefenderConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Set up the select for the Heat Defender; the AC Defender has none."""
    coordinator = entry.runtime_data
    if coordinator.run_mode == "heat":
        async_add_entities([HeatModeSelect(coordinator)])
