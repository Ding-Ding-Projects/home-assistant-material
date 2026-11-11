"""Set Google up once so every Google integration reuses it."""

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType

from .const import DOMAIN
from .websocket import ws_enable_apis, ws_status

CONFIG_SCHEMA = cv.empty_config_schema(DOMAIN)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up Google setup."""
    websocket_api.async_register_command(hass, ws_status)
    websocket_api.async_register_command(hass, ws_enable_apis)
    return True
