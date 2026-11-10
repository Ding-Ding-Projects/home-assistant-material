"""Analytics integration that does nothing.

This build never collects, stores or sends usage data, diagnostics or reports.
The integration remains only so that other integrations that import its data
classes keep working, and so that a stored analytics preference from an older
installation does not break start-up. It registers no services, no websocket
commands, no HTTP views and no schedules, and it never opens a network
connection.
"""

from homeassistant.core import HomeAssistant
from homeassistant.helpers.typing import ConfigType

from .analytics import (
    AnalyticsInput,
    AnalyticsModifications,
    DeviceAnalyticsModifications,
    EntityAnalyticsModifications,
)

__all__ = [
    "AnalyticsInput",
    "AnalyticsModifications",
    "DeviceAnalyticsModifications",
    "EntityAnalyticsModifications",
]

DOMAIN = "analytics"


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up the analytics integration. Nothing is sent anywhere."""
    # An installation set up by an earlier build holds a configuration entry
    # for analytics. There is nothing left for it to set up.
    for entry in hass.config_entries.async_entries(DOMAIN):
        hass.async_create_task(hass.config_entries.async_remove(entry.entry_id))
    return True
