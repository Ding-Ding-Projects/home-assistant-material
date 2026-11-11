"""Create and manage Minecraft servers from the interface.

This first step only stores server definitions and reports which hosting
targets are possible. Starting servers comes in a later step.
"""

from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType

from .const import DOMAIN
from .manager import DATA_MANAGER, MinecraftManager
from .websocket import async_register_commands

CONFIG_SCHEMA = cv.empty_config_schema(DOMAIN)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up the Minecraft server manager."""
    manager = MinecraftManager(hass)
    await manager.async_load()
    hass.data[DATA_MANAGER] = manager
    async_register_commands(hass)
    return True
