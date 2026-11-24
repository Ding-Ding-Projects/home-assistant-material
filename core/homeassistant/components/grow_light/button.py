"""Button to record a watering done by hand."""

from typing import override

from homeassistant.components.button import ButtonEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.util import dt as dt_util

from . import GrowLightConfigEntry
from .const import CONF_PLANTED_ON
from .entity import GrowLightEntity


async def async_setup_entry(
    hass: HomeAssistant,
    entry: GrowLightConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Add the Watered button, and Sown again when a crop is picked."""
    entities: list[ButtonEntity] = [GrowLightWateredButton(entry)]
    if entry.runtime_data.plant is not None:
        entities.append(GrowLightSownButton(hass, entry))
    async_add_entities(entities)


class GrowLightWateredButton(GrowLightEntity, ButtonEntity):
    """Press after watering so the next watering is counted from now."""

    def __init__(self, entry: GrowLightConfigEntry) -> None:
        """Create the button."""
        super().__init__(entry, "watered")

    @override
    async def async_press(self) -> None:
        """Record the watering."""
        self.controller.async_mark_watered()


class GrowLightSownButton(GrowLightEntity, ButtonEntity):
    """Press after sowing again so the crop's stages start over from today."""

    def __init__(self, hass: HomeAssistant, entry: GrowLightConfigEntry) -> None:
        """Create the button."""
        super().__init__(entry, "sown")
        self._entry = entry

    @override
    async def async_press(self) -> None:
        """Set the sowing date to today and reload the grow light."""
        entry = self._entry
        self.hass.config_entries.async_update_entry(
            entry,
            options={
                **entry.options,
                CONF_PLANTED_ON: dt_util.now().date().isoformat(),
            },
        )
        self.hass.config_entries.async_schedule_reload(entry.entry_id)
