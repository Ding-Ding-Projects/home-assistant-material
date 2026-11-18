"""AC Defender: holds the chosen temperature against schedules, phones and wall touches."""

from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryNotReady
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.storage import Store
from homeassistant.helpers.typing import ConfigType

from .const import CONF_CLIMATE, DOMAIN, PLATFORMS, STORAGE_VERSION
from .coordinator import DefenderCoordinator
from .siblings import async_attach_sibling, async_detach_sibling, async_update_band
from .types import DefenderConfigEntry
from .websocket_api import async_register_websocket

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Register the websocket commands."""
    async_register_websocket(hass)
    return True


async def async_setup_defender(
    hass: HomeAssistant, entry: DefenderConfigEntry, run_mode: str
) -> None:
    """Set up a defender of either direction; the Heat Defender calls this too."""
    climate_id = entry.data[CONF_CLIMATE]
    if hass.states.get(climate_id) is None:
        raise ConfigEntryNotReady(
            translation_domain=DOMAIN,
            translation_key="climate_not_found",
            translation_placeholders={"entity_id": climate_id},
        )
    coordinator = DefenderCoordinator(hass, entry, run_mode)
    entry.runtime_data = coordinator
    async_attach_sibling(hass, coordinator)
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(_options_updated))
    await coordinator.async_start()


async def async_unload_defender(
    hass: HomeAssistant, entry: DefenderConfigEntry
) -> None:
    """Unload a defender."""
    await hass.config_entries.async_unload_platforms_or_raise(entry, PLATFORMS)
    await entry.runtime_data.async_save()
    entry.runtime_data.async_stop()
    async_detach_sibling(hass, entry.runtime_data)


async def _options_updated(hass: HomeAssistant, entry: DefenderConfigEntry) -> None:
    """Apply changed options without reloading the entry."""
    coordinator = entry.runtime_data
    coordinator.reload_options()
    async_update_band(hass, coordinator.climate_id)
    await coordinator.async_evaluate()


async def async_setup_entry(hass: HomeAssistant, entry: DefenderConfigEntry) -> None:
    """Set up AC Defender from a config entry."""
    await async_setup_defender(hass, entry, "cool")


async def async_unload_entry(hass: HomeAssistant, entry: DefenderConfigEntry) -> None:
    """Unload AC Defender."""
    await async_unload_defender(hass, entry)


async def async_remove_defender(
    hass: HomeAssistant, entry: DefenderConfigEntry
) -> None:
    """Delete the saved state of a removed defender."""
    await Store(
        hass, STORAGE_VERSION, f"{entry.domain}.{entry.entry_id}"
    ).async_remove()


async def async_remove_entry(hass: HomeAssistant, entry: DefenderConfigEntry) -> None:
    """Delete the saved state of a removed entry."""
    await async_remove_defender(hass, entry)
