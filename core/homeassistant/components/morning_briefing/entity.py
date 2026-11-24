"""Shared base for Morning briefing entities."""

from typing import override

from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity import Entity

from . import MorningBriefingConfigEntry
from .const import DOMAIN


class MorningBriefingEntity(Entity):
    """An entity that belongs to one morning briefing."""

    _attr_has_entity_name = True
    _attr_should_poll = False

    def __init__(self, entry: MorningBriefingConfigEntry, key: str) -> None:
        """Link the entity to its briefing."""
        self.briefing = entry.runtime_data
        self._attr_unique_id = f"{entry.entry_id}_{key}"
        self._attr_translation_key = key
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)}, name=entry.title
        )

    @override
    async def async_added_to_hass(self) -> None:
        """Refresh whenever the briefing changes."""
        await super().async_added_to_hass()
        self.async_on_remove(
            self.briefing.async_add_listener(self.async_write_ha_state)
        )
