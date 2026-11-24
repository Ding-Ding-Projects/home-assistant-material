"""Button that sends the briefing now."""

from typing import override

from homeassistant.components.button import ButtonEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from . import MorningBriefingConfigEntry
from .entity import MorningBriefingEntity


async def async_setup_entry(
    hass: HomeAssistant,
    entry: MorningBriefingConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Add the Send now button."""
    async_add_entities([MorningBriefingSendButton(entry)])


class MorningBriefingSendButton(MorningBriefingEntity, ButtonEntity):
    """Send the briefing right away, whatever the schedule says."""

    def __init__(self, entry: MorningBriefingConfigEntry) -> None:
        """Create the button."""
        super().__init__(entry, "send_now")

    @override
    async def async_press(self) -> None:
        """Send the briefing."""
        await self.briefing.async_send()
