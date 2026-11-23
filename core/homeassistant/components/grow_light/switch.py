"""Switch that turns the grow light schedule on or off."""

from typing import Any

from homeassistant.components.switch import SwitchEntity
from homeassistant.const import STATE_OFF
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.helpers.restore_state import RestoreEntity

from . import GrowLightConfigEntry
from .entity import GrowLightEntity


async def async_setup_entry(
    hass: HomeAssistant,
    entry: GrowLightConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Add the schedule switch."""
    async_add_entities([GrowLightScheduleSwitch(entry)])


class GrowLightScheduleSwitch(GrowLightEntity, SwitchEntity, RestoreEntity):
    """When off, the plug is switched off and left alone."""

    def __init__(self, entry: GrowLightConfigEntry) -> None:
        """Create the switch."""
        super().__init__(entry, "schedule")

    async def async_added_to_hass(self) -> None:
        """Restore the last state, then start the controller."""
        await super().async_added_to_hass()
        if (last := await self.async_get_last_state()) is not None:
            self.controller.enabled = last.state != STATE_OFF
        self.controller.async_start()

    @property
    def is_on(self) -> bool:
        """Whether the schedule is running."""
        return self.controller.enabled

    async def async_turn_on(self, **kwargs: Any) -> None:
        """Run the schedule."""
        self.controller.async_set_enabled(True)

    async def async_turn_off(self, **kwargs: Any) -> None:
        """Stop the schedule and switch the plug off."""
        self.controller.async_set_enabled(False)
