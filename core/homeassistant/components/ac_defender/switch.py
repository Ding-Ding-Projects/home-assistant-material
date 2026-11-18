"""Switches: one per guard."""

from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .entity import GuardSwitch
from .types import DefenderConfigEntry


async def async_setup_entry(
    hass: HomeAssistant,
    entry: DefenderConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Set up one switch per guard."""
    coordinator = entry.runtime_data
    async_add_entities(GuardSwitch(coordinator, g.spec.key) for g in coordinator.guards)
