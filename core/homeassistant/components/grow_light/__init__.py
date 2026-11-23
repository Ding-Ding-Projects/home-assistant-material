"""Grow light: keep a plug on for set hours each day, paused while a door is open."""

from datetime import time

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant

from .const import CONF_DOORS, CONF_HOURS, CONF_PLUG, CONF_START
from .controller import GrowLightController
from .schedule import OnHours

PLATFORMS = [Platform.SENSOR, Platform.SWITCH]

type GrowLightConfigEntry = ConfigEntry[GrowLightController]


async def async_setup_entry(hass: HomeAssistant, entry: GrowLightConfigEntry) -> bool:
    """Set up a grow light from a config entry."""
    options = entry.options
    controller = GrowLightController(
        hass,
        options[CONF_PLUG],
        OnHours(time.fromisoformat(options[CONF_START]), float(options[CONF_HOURS])),
        list(options.get(CONF_DOORS, [])),
    )
    entry.runtime_data = controller
    # The schedule switch restores its state and starts the controller.
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(controller.async_stop)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: GrowLightConfigEntry) -> bool:
    """Unload a config entry."""
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
