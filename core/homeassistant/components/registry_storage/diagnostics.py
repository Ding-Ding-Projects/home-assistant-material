"""Diagnostics for the Container registry storage integration, with everything sensitive left out."""

from typing import Any

from homeassistant.components.diagnostics import async_redact_data
from homeassistant.core import HomeAssistant

from . import RegistryStorageConfigEntry
from .const import (
    CONF_ADDRESS,
    CONF_BACKUPS_REPOSITORY,
    CONF_CAMERA_REPOSITORIES,
    CONF_KEY_REF,
    CONF_REPOSITORY,
    CONF_TOKEN,
    CONF_USERNAME,
)

TO_REDACT = {
    CONF_TOKEN,
    CONF_USERNAME,
    CONF_KEY_REF,
    CONF_ADDRESS,
    CONF_REPOSITORY,
    CONF_CAMERA_REPOSITORIES,
    CONF_BACKUPS_REPOSITORY,
}


async def async_get_config_entry_diagnostics(
    hass: HomeAssistant, entry: RegistryStorageConfigEntry
) -> dict[str, Any]:
    """Return what is safe to share: settings with secrets and names removed, and counts."""
    store = entry.runtime_data.store
    return {
        "entry": {
            "data": async_redact_data(dict(entry.data), TO_REDACT),
            "options": async_redact_data(dict(entry.options), TO_REDACT),
        },
        "repositories": len(store.settings.repositories()),
        "cameras_with_own_repository": len(store.settings.camera_repositories),
        "rate_limit_remaining": entry.runtime_data.client.rate_limit_remaining,
    }
