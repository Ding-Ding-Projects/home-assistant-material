"""Button that clears a trip once the leak is gone."""

from typing import override

from homeassistant.components.button import ButtonEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from . import SafetyCutoffConfigEntry
from .entity import SafetyCutoffEntity


async def async_setup_entry(
    hass: HomeAssistant,
    entry: SafetyCutoffConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Add the Reset button."""
    async_add_entities([SafetyCutoffResetButton(entry)])


class SafetyCutoffResetButton(SafetyCutoffEntity, ButtonEntity):
    """Press to clear the trip; refused while a leak sensor is still wet."""

    def __init__(self, entry: SafetyCutoffConfigEntry) -> None:
        """Create the button."""
        super().__init__(entry, "reset")

    @override
    async def async_press(self) -> None:
        """Clear the trip."""
        self.controller.async_reset()
