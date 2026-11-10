"""Create YAML-only integrations from the interface, with guidance."""

from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType

from .const import DOMAIN
from .manager import DATA_MANAGER, GuidedSetupManager
from .websocket import async_register_commands

CONFIG_SCHEMA = cv.empty_config_schema(DOMAIN)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up Guided setup."""
    manager = GuidedSetupManager(hass)
    await manager.async_load()
    hass.data[DATA_MANAGER] = manager
    async_register_commands(hass)
    return True
