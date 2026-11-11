"""Sign in to Home Assistant with a passkey, as an addition to the password."""

from homeassistant.auth import EVENT_USER_REMOVED
from homeassistant.core import Event, HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType

from .const import DOMAIN
from .store import DATA_STORE, PasskeyStore
from .views import async_register_views
from .websocket import async_register_commands

CONFIG_SCHEMA = cv.empty_config_schema(DOMAIN)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up Passkey."""
    store = PasskeyStore(hass)
    await store.async_load()
    hass.data[DATA_STORE] = store

    async def _async_user_removed(event: Event) -> None:
        await store.async_remove_user(event.data["user_id"])

    hass.bus.async_listen(EVENT_USER_REMOVED, _async_user_removed)
    async_register_views(hass)
    async_register_commands(hass)
    return True
