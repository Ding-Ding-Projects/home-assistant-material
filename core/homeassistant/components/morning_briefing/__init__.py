"""Morning briefing: one daily notification that summarizes the home."""

from datetime import time

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_NAME, Platform
from homeassistant.core import HomeAssistant

from .briefing import Briefing
from .compose import BriefingSources
from .const import (
    CONF_EXTRA,
    CONF_NOTIFY,
    CONF_TIME,
    CONF_TRANSIT,
    CONF_WEATHER,
    DEFAULT_TIME,
)

PLATFORMS = [Platform.BUTTON, Platform.SENSOR, Platform.SWITCH]

type MorningBriefingConfigEntry = ConfigEntry[Briefing]


async def async_setup_entry(
    hass: HomeAssistant, entry: MorningBriefingConfigEntry
) -> None:
    """Set up a morning briefing from a config entry."""
    options = entry.options
    briefing = Briefing(
        hass,
        options.get(CONF_NAME, entry.title),
        time.fromisoformat(options.get(CONF_TIME, DEFAULT_TIME)),
        list(options.get(CONF_NOTIFY, [])),
        BriefingSources(
            weather=options.get(CONF_WEATHER),
            transit=list(options.get(CONF_TRANSIT, [])),
            extra=list(options.get(CONF_EXTRA, [])),
        ),
    )
    entry.runtime_data = briefing
    # Entities restore the switch and last briefing before the timer starts.
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    briefing.async_start()
    entry.async_on_unload(briefing.async_stop)


async def async_unload_entry(
    hass: HomeAssistant, entry: MorningBriefingConfigEntry
) -> None:
    """Unload a config entry."""
    await hass.config_entries.async_unload_platforms_or_raise(entry, PLATFORMS)
