"""Manage Ollama servers and models from the interface."""

from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType

from .const import DOMAIN
from .websocket import async_register_commands

CONFIG_SCHEMA = cv.empty_config_schema(DOMAIN)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up the Ollama suite."""
    async_register_commands(hass)
    return True
