"""Heat Defender: the sister of AC Defender, keeping the heat off so you do not feel hot."""

from homeassistant.components.ac_defender import (
    async_remove_defender,
    async_setup_defender,
    async_unload_defender,
)
from homeassistant.components.ac_defender.types import DefenderConfigEntry
from homeassistant.core import HomeAssistant


async def async_setup_entry(hass: HomeAssistant, entry: DefenderConfigEntry) -> None:
    """Set up Heat Defender from a config entry."""
    await async_setup_defender(hass, entry, "heat")


async def async_unload_entry(hass: HomeAssistant, entry: DefenderConfigEntry) -> None:
    """Unload Heat Defender."""
    await async_unload_defender(hass, entry)


async def async_remove_entry(hass: HomeAssistant, entry: DefenderConfigEntry) -> None:
    """Delete the saved state of a removed entry."""
    await async_remove_defender(hass, entry)
