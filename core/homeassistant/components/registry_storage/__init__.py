"""Container registry storage: a locked place for recordings and backups.

Everything is encrypted at home with a password before it is sent to a container image
registry, so the registry can be a free public one.
"""

import asyncio
from dataclasses import dataclass
from typing import Final

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryAuthFailed, ConfigEntryNotReady
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.typing import ConfigType

from .client import RegistryClient
from .const import (
    CONF_ADDRESS,
    CONF_BACKUPS_REPOSITORY,
    CONF_CAMERA_REPOSITORIES,
    CONF_KEY_REF,
    CONF_REPOSITORY,
    CONF_TOKEN,
    CONF_USERNAME,
    DATA_BACKUP_AGENT_LISTENERS,
    DOMAIN,
)
from .errors import Reason, RegistryError
from .store import KeyStore, RegistryStore, StorageSettings

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

# Seconds one setup attempt may spend checking the registry before it is
# retried later.
SETUP_CHECK_TIMEOUT: Final = 30.0


@dataclass
class RegistryStorageData:
    """What a loaded entry holds."""

    store: RegistryStore
    client: RegistryClient


type RegistryStorageConfigEntry = ConfigEntry[RegistryStorageData]


def settings_from_entry(entry: ConfigEntry) -> StorageSettings:
    """Read which repository holds what from an entry."""
    return StorageSettings(
        default_repository=entry.data[CONF_REPOSITORY],
        camera_repositories=dict(entry.options.get(CONF_CAMERA_REPOSITORIES, {})),
        backups_repository=entry.options.get(CONF_BACKUPS_REPOSITORY) or None,
    )


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up the integration; it has no YAML."""
    return True


async def async_setup_entry(
    hass: HomeAssistant, entry: RegistryStorageConfigEntry
) -> None:
    """Open the saved key, check the registry and publish the store."""
    key_store = KeyStore(hass, entry.data[CONF_KEY_REF])
    loaded = await key_store.async_load()
    if loaded is None:
        raise ConfigEntryAuthFailed(
            translation_domain=DOMAIN, translation_key="key_missing"
        )
    vault_key, header = loaded
    client = RegistryClient(
        async_get_clientsession(hass),
        entry.data[CONF_ADDRESS],
        entry.data[CONF_USERNAME],
        entry.data[CONF_TOKEN],
    )
    settings = settings_from_entry(entry)
    try:
        # Without a bound, a silent registry keeps one setup attempt (and the
        # entry's "Initialising" state) for several minutes of request
        # timeouts, which also holds back the next scheduled retry.
        async with asyncio.timeout(SETUP_CHECK_TIMEOUT):
            await client.async_check_credentials(settings.default_repository)
    except TimeoutError as err:
        raise ConfigEntryNotReady(
            translation_domain=DOMAIN,
            translation_key="registry_not_ready",
            translation_placeholders={"reason": str(Reason.TIMEOUT)},
        ) from err
    except RegistryError as err:
        if err.reason == Reason.AUTH_FAILED:
            raise ConfigEntryAuthFailed(
                translation_domain=DOMAIN, translation_key="sign_in_failed"
            ) from err
        raise ConfigEntryNotReady(
            translation_domain=DOMAIN,
            translation_key="registry_not_ready",
            translation_placeholders={"reason": str(err.reason)},
        ) from err
    entry.runtime_data = RegistryStorageData(
        RegistryStore(hass, client, vault_key, header, settings, key_store), client
    )
    entry.async_on_unload(entry.add_update_listener(_async_reload))

    def async_notify_backup_listeners() -> None:
        for listener in hass.data.get(DATA_BACKUP_AGENT_LISTENERS, []):
            listener()

    entry.async_on_unload(entry.async_on_state_change(async_notify_backup_listeners))


async def _async_reload(hass: HomeAssistant, entry: RegistryStorageConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(
    hass: HomeAssistant, entry: RegistryStorageConfigEntry
) -> None:
    """Unload the entry; the store holds nothing that needs closing."""


async def async_remove_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Forget the saved key when the place is removed. Stored objects stay in the registry."""
    await KeyStore(hass, entry.data[CONF_KEY_REF]).async_remove()


def async_get_store(
    hass: HomeAssistant, entry_id: str | None = None
) -> RegistryStore | None:
    """Return the loaded store of an entry, or of the first loaded entry."""
    for entry in hass.config_entries.async_loaded_entries(DOMAIN):
        if entry_id is None or entry.entry_id == entry_id:
            return entry.runtime_data.store
    return None
