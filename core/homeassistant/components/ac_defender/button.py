"""Buttons: stop everything and defend again."""

from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .entity import ActionButton
from .types import DefenderConfigEntry


async def async_setup_entry(
    hass: HomeAssistant,
    entry: DefenderConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Set up the buttons."""
    coordinator = entry.runtime_data
    async_add_entities(
        [
            ActionButton(coordinator, "stop_everything"),
            ActionButton(coordinator, "defend_again"),
        ]
    )
