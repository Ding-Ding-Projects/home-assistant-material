"""Diagnostics for linked media, with every address masked."""

from typing import Any

from homeassistant.core import HomeAssistant

from . import LinkedMediaConfigEntry


async def async_get_config_entry_diagnostics(
    hass: HomeAssistant, entry: LinkedMediaConfigEntry
) -> dict[str, Any]:
    """Return the list and what is in use, without any address."""
    manager = entry.runtime_data
    files = [manager.as_dict(linked, admin=False) for linked in manager.files.values()]
    return {
        "files": files,
        "own_address_count": len(manager.own_addresses),
    }
