"""A dim sum dish that sometimes drops by when the interface starts.

The catalogue and pictures come only from the public catalogue repository.
They are cached in the storage folder, the cache works offline, and fetching
never delays startup.
"""

from datetime import datetime, timedelta

from homeassistant.const import EVENT_HOMEASSISTANT_STOP
from homeassistant.core import Event, HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.helpers.start import async_at_started
from homeassistant.helpers.typing import ConfigType

from .const import DOMAIN
from .manager import DATA_MANAGER, DimSumManager
from .views import DimSumPictureView
from .websocket import async_register_commands

RETRY_INTERVAL = timedelta(hours=1)
CONFIG_SCHEMA = cv.empty_config_schema(DOMAIN)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up the dim sum surprise."""
    manager = DimSumManager(hass)
    await manager.async_load()
    hass.data[DATA_MANAGER] = manager
    async_register_commands(hass)
    hass.http.register_view(DimSumPictureView)

    async def _warm(_: HomeAssistant) -> None:
        hass.async_create_background_task(
            manager.async_warm(), f"{DOMAIN} warm cache", eager_start=False
        )

    async def _retry(_: datetime) -> None:
        await manager.async_refresh()

    async_at_started(hass, _warm)
    stop_retry = async_track_time_interval(hass, _retry, RETRY_INTERVAL)

    def _stop(_: Event) -> None:
        stop_retry()

    hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STOP, _stop)
    return True
