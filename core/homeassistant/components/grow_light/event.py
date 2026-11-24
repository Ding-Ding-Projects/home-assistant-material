"""Event entity with the grow light's alerts, for automations and history."""

from typing import override

from homeassistant.components.event import EventEntity
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from . import GrowLightConfigEntry
from .const import ALERTS
from .entity import GrowLightEntity


async def async_setup_entry(
    hass: HomeAssistant,
    entry: GrowLightConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Add the Alerts event entity."""
    async_add_entities([GrowLightAlertEvent(entry)])


class GrowLightAlertEvent(GrowLightEntity, EventEntity):
    """Stage changes, harvest, watering, dry soil and sowing reminders."""

    _attr_event_types = ALERTS

    def __init__(self, entry: GrowLightConfigEntry) -> None:
        """Create the event entity."""
        super().__init__(entry, "alerts")

    @override
    async def async_added_to_hass(self) -> None:
        """Listen for alerts."""
        await super().async_added_to_hass()
        self.async_on_remove(self.controller.async_add_alert_listener(self._alert))

    @callback
    def _alert(self, kind: str, message: str) -> None:
        self._trigger_event(kind, {"message": message})
        self.async_write_ha_state()
