"""Shared base for Grow light entities."""

from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity import Entity

from . import GrowLightConfigEntry
from .const import DOMAIN


class GrowLightEntity(Entity):
    """An entity that belongs to one grow light."""

    _attr_has_entity_name = True
    _attr_should_poll = False

    def __init__(self, entry: GrowLightConfigEntry, key: str) -> None:
        """Link the entity to its grow light."""
        self.controller = entry.runtime_data
        self._attr_unique_id = f"{entry.entry_id}_{key}"
        self._attr_translation_key = key
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)}, name=entry.title
        )

    async def async_added_to_hass(self) -> None:
        """Refresh whenever the grow light's status changes."""
        await super().async_added_to_hass()
        self.async_on_remove(
            self.controller.async_add_listener(self.async_write_ha_state)
        )
