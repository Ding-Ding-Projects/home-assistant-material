"""Switch that arms or disarms the cutoff."""

from typing import Any, override

from homeassistant.components.switch import SwitchEntity
from homeassistant.const import STATE_OFF
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.helpers.restore_state import RestoreEntity

from . import SafetyCutoffConfigEntry
from .entity import SafetyCutoffEntity


async def async_setup_entry(
    hass: HomeAssistant,
    entry: SafetyCutoffConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Add the Armed switch."""
    async_add_entities([SafetyCutoffArmed(entry)])


class SafetyCutoffArmed(SafetyCutoffEntity, SwitchEntity, RestoreEntity):
    """When off, a trip only sends a notification and cuts nothing."""

    def __init__(self, entry: SafetyCutoffConfigEntry) -> None:
        """Create the switch."""
        super().__init__(entry, "armed")

    @override
    async def async_added_to_hass(self) -> None:
        """Restore the last state; setup starts the controller afterwards."""
        await super().async_added_to_hass()
        if (last := await self.async_get_last_state()) is not None:
            self.controller.armed = last.state != STATE_OFF

    @property
    @override
    def is_on(self) -> bool:
        """Whether the cutoff will cut."""
        return self.controller.armed

    @override
    async def async_turn_on(self, **kwargs: Any) -> None:
        """Arm the cutoff."""
        self.controller.async_set_armed(True)

    @override
    async def async_turn_off(self, **kwargs: Any) -> None:
        """Disarm the cutoff."""
        self.controller.async_set_armed(False)
