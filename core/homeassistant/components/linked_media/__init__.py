"""Linked media: media files that live at a web address.

The owner adds a web address. When something plays or shows the file, this
system fetches it, hands it on and throws it away. Nothing is stored here
unless the owner chose to keep a copy for ten minutes.
"""

import hashlib
from pathlib import Path
import tempfile

from homeassistant.components import network
from homeassistant.config_entries import SOURCE_SYSTEM, ConfigEntry
from homeassistant.const import EVENT_HOMEASSISTANT_STOP
from homeassistant.core import Event, HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType

from . import websocket
from .const import DOMAIN, HANDOUT_FOLDER
from .data import DATA_MANAGER
from .manager import LinkedMediaManager
from .services import async_setup_services
from .views import LinkedFileView

CONFIG_SCHEMA = cv.empty_config_schema(DOMAIN)

type LinkedMediaConfigEntry = ConfigEntry[LinkedMediaManager]


def temp_root(hass: HomeAssistant) -> Path:
    """Return this instance's folder for short lived copies."""
    digest = hashlib.sha256(hass.config.config_dir.encode()).hexdigest()[:12]
    return Path(tempfile.gettempdir()) / f"home-assistant-linked-media-{digest}"


def handout_root(hass: HomeAssistant) -> Path:
    """Return the folder for files handed to actions.

    It sits hidden inside the local media folder, which Core allows other
    integrations to read, and which the media browser does not list.
    """
    media_dirs = hass.config.media_dirs
    if base := media_dirs.get("local") or next(iter(media_dirs.values()), None):
        return Path(base) / HANDOUT_FOLDER
    return temp_root(hass) / "files"


async def _async_own_addresses(hass: HomeAssistant) -> frozenset[str]:
    """Return the addresses of this system, which are never fetched from."""
    addresses: set[str] = set()
    for adapter in await network.async_get_adapters(hass):
        addresses.update(item["address"] for item in adapter["ipv4"])
        addresses.update(item["address"] for item in adapter["ipv6"])
    return frozenset(addresses)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up linked media and create its entry when there is none."""
    hass.http.register_view(LinkedFileView())
    websocket.async_register(hass)
    async_setup_services(hass)
    if not hass.config_entries.async_entries(DOMAIN):
        hass.async_create_task(
            hass.config_entries.flow.async_init(
                DOMAIN, context={"source": SOURCE_SYSTEM}, data={}
            ),
            eager_start=True,
        )
    return True


async def async_setup_entry(hass: HomeAssistant, entry: LinkedMediaConfigEntry) -> None:
    """Load the list of linked files."""
    manager = LinkedMediaManager(
        hass,
        temp_root(hass),
        handout_root(hass),
        await _async_own_addresses(hass),
    )
    await manager.async_load()
    entry.runtime_data = manager
    hass.data[DATA_MANAGER] = manager

    async def _async_stop(_event: Event) -> None:
        await manager.async_shutdown()

    entry.async_on_unload(
        hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STOP, _async_stop)
    )


async def async_unload_entry(
    hass: HomeAssistant, entry: LinkedMediaConfigEntry
) -> None:
    """Stop using linked files and remove every copy."""
    hass.data.pop(DATA_MANAGER, None)
    await entry.runtime_data.async_shutdown()
