"""Events: a guard acted, and a handover between brother and sister."""

from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .entity import GuardActedEvent, HandoverEvent
from .types import DefenderConfigEntry


async def async_setup_entry(
    hass: HomeAssistant,
    entry: DefenderConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Set up the event entities."""
    coordinator = entry.runtime_data
    async_add_entities([GuardActedEvent(coordinator), HandoverEvent(coordinator)])
