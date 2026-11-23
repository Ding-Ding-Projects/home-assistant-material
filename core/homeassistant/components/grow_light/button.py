"""Button to record a watering done by hand."""

from typing import override

from homeassistant.components.button import ButtonEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from . import GrowLightConfigEntry
from .entity import GrowLightEntity


async def async_setup_entry(
    hass: HomeAssistant,
    entry: GrowLightConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Add the Watered button."""
    async_add_entities([GrowLightWateredButton(entry)])


class GrowLightWateredButton(GrowLightEntity, ButtonEntity):
    """Press after watering so the next watering is counted from now."""

    def __init__(self, entry: GrowLightConfigEntry) -> None:
        """Create the button."""
        super().__init__(entry, "watered")

    @override
    async def async_press(self) -> None:
        """Record the watering."""
        self.controller.async_mark_watered()
