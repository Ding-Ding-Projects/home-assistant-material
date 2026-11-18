"""Record cameras around the clock to a disk, a folder, a Windows share or an SSH server."""

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.start import async_at_started
from homeassistant.helpers.typing import ConfigType

from .const import DOMAIN
from .live import LiveOfferView
from .manager import RecordingManager, remove_entry_files
from .views import SegmentView
from .websocket import async_register_websocket

PLATFORMS = [Platform.BINARY_SENSOR, Platform.SENSOR, Platform.SWITCH]
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

type CameraRecordingConfigEntry = ConfigEntry[RecordingManager]


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Register the playback view and the WebSocket commands once."""
    hass.http.register_view(SegmentView())
    hass.http.register_view(LiveOfferView())
    async_register_websocket(hass)
    return True


async def async_setup_entry(
    hass: HomeAssistant, entry: CameraRecordingConfigEntry
) -> None:
    """Start recording once Home Assistant has started, so the cameras exist."""
    manager = RecordingManager(hass, entry)
    entry.runtime_data = manager
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    async def _start(_hass: HomeAssistant) -> None:
        await manager.async_start()

    entry.async_on_unload(async_at_started(hass, _start))
    entry.async_on_unload(entry.add_update_listener(_async_reload))


async def _async_reload(hass: HomeAssistant, entry: CameraRecordingConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(
    hass: HomeAssistant, entry: CameraRecordingConfigEntry
) -> None:
    """Stop recording, finishing the open segments."""
    await hass.config_entries.async_unload_platforms_or_raise(entry, PLATFORMS)
    await entry.runtime_data.async_stop()


async def async_remove_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Remove the local staging folder. Recordings at the destination are kept."""
    await hass.async_add_executor_job(remove_entry_files, hass, entry.entry_id)
