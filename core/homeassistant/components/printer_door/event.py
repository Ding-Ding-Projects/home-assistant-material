"""The Door events entity."""

from typing import override

from homeassistant.components.event import EventEntity
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .const import DOOR_EVENT_TYPES
from .coordinator import PrinterDoorConfigEntry
from .entity import PrinterDoorEntity


async def async_setup_entry(
    hass: HomeAssistant,
    entry: PrinterDoorConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Add the door events entity."""
    async_add_entities([PrinterDoorEvents(entry)])


class PrinterDoorEvents(PrinterDoorEntity, EventEntity):
    """Opened, closed, and opened while printing."""

    _attr_event_types = DOOR_EVENT_TYPES

    def __init__(self, entry: PrinterDoorConfigEntry) -> None:
        """Create the entity."""
        super().__init__(entry, "door_events")

    @override
    async def async_added_to_hass(self) -> None:
        """Listen for door events."""
        await super().async_added_to_hass()
        self.async_on_remove(
            self.coordinator.async_add_door_listener(self._handle_door_event)
        )

    @callback
    def _handle_door_event(self, event_type: str) -> None:
        self._trigger_event(event_type)
        self.async_write_ha_state()
