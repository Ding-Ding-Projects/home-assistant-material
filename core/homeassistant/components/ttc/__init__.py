"""The TTC transit integration."""

from datetime import datetime

from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.helpers.typing import ConfigType

from .api import TTCClient, TTCError
from .const import DOMAIN, LOGGER, STATIC_INTERVAL, SUBWAY_LINES
from .coordinator import TTCConfigEntry, build_runtime_data
from .services import async_setup_services
from .websocket import async_setup_websocket

PLATFORMS = [Platform.BINARY_SENSOR, Platform.EVENT, Platform.SENSOR]

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up the TTC transit actions and page data."""
    async_setup_services(hass)
    async_setup_websocket(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: TTCConfigEntry) -> None:
    """Set up TTC transit from a config entry."""
    client = TTCClient(async_get_clientsession(hass))
    data = build_runtime_data(hass, entry, client)

    async def async_refresh_titles(_now: datetime | None = None) -> None:
        """Refresh the route names once a day, keeping the old ones on failure."""
        if all(route in SUBWAY_LINES for route in data.routes):
            return
        try:
            data.route_titles = await client.async_get_routes()
        except TTCError as err:
            LOGGER.debug("Route names could not be refreshed: %s", err)

    await async_refresh_titles()
    entry.async_on_unload(
        async_track_time_interval(hass, async_refresh_titles, STATIC_INTERVAL)
    )

    for coordinator in data.coordinators:
        await coordinator.async_config_entry_first_refresh()

    entry.runtime_data = data
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)


async def async_unload_entry(hass: HomeAssistant, entry: TTCConfigEntry) -> None:
    """Unload a TTC transit config entry."""
    await hass.config_entries.async_unload_platforms_or_raise(entry, PLATFORMS)
