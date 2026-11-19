"""Record logged problems in a local Git repository.

Problems are written as Markdown files to a Git
repository inside the configuration folder. The owner may add a remote named
origin themselves; only then are commits pushed. Separately, the owner may
turn on sending a redacted copy to a private GitHub repository (send_manager).
"""

import logging

from homeassistant.components import websocket_api
from homeassistant.const import EVENT_HOMEASSISTANT_STOP
from homeassistant.core import Event, HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType

from .const import DOMAIN
from .manager import ProblemLog
from .send_manager import ProblemLogSender
from .send_websocket import DATA_SENDER, async_register as async_register_send
from .websocket import ws_list

CONFIG_SCHEMA = cv.empty_config_schema(DOMAIN)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up the problem log."""
    log = ProblemLog(hass)
    hass.data[DOMAIN] = log
    logging.root.addHandler(log.handler)
    sender = ProblemLogSender(hass, log)
    await sender.async_load()
    hass.data[DATA_SENDER] = sender

    async def _async_stop(_: Event) -> None:
        logging.root.removeHandler(log.handler)
        sender.async_stop()
        log.async_stop()
        await log.async_flush()

    hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STOP, _async_stop)
    websocket_api.async_register_command(hass, ws_list)
    async_register_send(hass)
    return True
