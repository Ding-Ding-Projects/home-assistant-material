"""Switch that turns the daily briefing on or off."""

from typing import Any, override

from homeassistant.components.switch import SwitchEntity
from homeassistant.const import STATE_OFF
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.helpers.restore_state import RestoreEntity

from . import MorningBriefingConfigEntry
from .entity import MorningBriefingEntity


async def async_setup_entry(
    hass: HomeAssistant,
    entry: MorningBriefingConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Add the enabled switch."""
    async_add_entities([MorningBriefingEnabledSwitch(entry)])


class MorningBriefingEnabledSwitch(MorningBriefingEntity, SwitchEntity, RestoreEntity):
    """When off, the daily briefing is skipped; Send now still works."""

    def __init__(self, entry: MorningBriefingConfigEntry) -> None:
        """Create the switch."""
        super().__init__(entry, "enabled")

    @override
    async def async_added_to_hass(self) -> None:
        """Restore the last state."""
        await super().async_added_to_hass()
        if (last := await self.async_get_last_state()) is not None:
            self.briefing.enabled = last.state != STATE_OFF

    @property
    @override
    def is_on(self) -> bool:
        """Whether the daily briefing is on."""
        return self.briefing.enabled

    @override
    async def async_turn_on(self, **kwargs: Any) -> None:
        """Turn the daily briefing on."""
        self.briefing.async_set_enabled(True)

    @override
    async def async_turn_off(self, **kwargs: Any) -> None:
        """Turn the daily briefing off."""
        self.briefing.async_set_enabled(False)
