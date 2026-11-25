"""Printer door: door state and print status of a Bambu Lab printer over its LAN."""

from homeassistant.const import Platform
from homeassistant.core import HomeAssistant

from .coordinator import PrinterDoorConfigEntry, PrinterDoorCoordinator
from .discovery import async_acquire, async_release

PLATFORMS = [Platform.BINARY_SENSOR, Platform.EVENT, Platform.SENSOR]


async def async_setup_entry(hass: HomeAssistant, entry: PrinterDoorConfigEntry) -> None:
    """Connect to the printer. Entities stay unavailable until it answers."""
    coordinator = PrinterDoorCoordinator(hass, entry)
    entry.runtime_data = coordinator
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    await coordinator.async_start()
    entry.async_on_unload(coordinator.async_stop)
    await async_acquire(hass, entry.entry_id)
    entry.async_on_unload(lambda: async_release(hass, entry.entry_id))


async def async_unload_entry(
    hass: HomeAssistant, entry: PrinterDoorConfigEntry
) -> None:
    """Unload a config entry."""
    await hass.config_entries.async_unload_platforms_or_raise(entry, PLATFORMS)
