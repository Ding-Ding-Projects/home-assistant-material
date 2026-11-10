"""Record logged problems in a local Git repository.

Nothing is sent anywhere. Problems are written as Markdown files to a Git
repository inside the configuration folder. The owner may add a remote named
origin themselves; only then are commits pushed.
"""

import logging

from homeassistant.components import websocket_api
from homeassistant.const import EVENT_HOMEASSISTANT_STOP
from homeassistant.core import Event, HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType

from .const import DOMAIN
from .manager import ProblemLog
from .websocket import ws_list

CONFIG_SCHEMA = cv.empty_config_schema(DOMAIN)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up the problem log."""
    log = ProblemLog(hass)
    hass.data[DOMAIN] = log
    logging.root.addHandler(log.handler)

    async def _async_stop(_: Event) -> None:
        logging.root.removeHandler(log.handler)
        log.async_stop()
        await log.async_flush()

    hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STOP, _async_stop)
    websocket_api.async_register_command(hass, ws_list)
    return True
