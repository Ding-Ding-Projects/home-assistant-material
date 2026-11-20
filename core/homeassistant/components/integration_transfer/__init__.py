"""Export and import the list of installed integrations, and one integration's settings.

The list names what is installed and the kinds of entity each integration
makes; it carries no sign-in and no setting. One integration's settings can be
exported without sign-ins, or with them in a file locked by the owner's
password, and imported into the existing entry of the same integration with an
Undo. Importing a list or a settings file never creates an entry.
"""

from homeassistant.config_entries import (
    SIGNAL_CONFIG_ENTRY_CHANGED,
    ConfigEntry,
    ConfigEntryChange,
)
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.typing import ConfigType

from .const import DATA_UNDO, DOMAIN
from .undo import SettingsUndo
from .websocket import async_register

CONFIG_SCHEMA = cv.empty_config_schema(DOMAIN)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up the commands and the store that makes Undo possible."""
    undo = SettingsUndo(hass)
    await undo.async_load()
    hass.data[DATA_UNDO] = undo

    @callback
    def _entry_changed(change: ConfigEntryChange, entry: ConfigEntry) -> None:
        if change is ConfigEntryChange.REMOVED:
            hass.async_create_task(
                undo.async_forget(entry.entry_id), eager_start=True
            )

    async_dispatcher_connect(hass, SIGNAL_CONFIG_ENTRY_CHANGED, _entry_changed)
    async_register(hass)
    return True
