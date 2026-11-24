"""Shared base for Safety cutoff entities."""

from typing import override

from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity import Entity

from . import SafetyCutoffConfigEntry
from .const import DOMAIN


class SafetyCutoffEntity(Entity):
    """An entity that belongs to one safety cutoff."""

    _attr_has_entity_name = True
    _attr_should_poll = False

    def __init__(self, entry: SafetyCutoffConfigEntry, key: str) -> None:
        """Link the entity to its safety cutoff."""
        self.controller = entry.runtime_data
        self._attr_unique_id = f"{entry.entry_id}_{key}"
        self._attr_translation_key = key
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)}, name=entry.title
        )

    @override
    async def async_added_to_hass(self) -> None:
        """Refresh whenever the cutoff state changes."""
        await super().async_added_to_hass()
        self.async_on_remove(
            self.controller.async_add_listener(self.async_write_ha_state)
        )
