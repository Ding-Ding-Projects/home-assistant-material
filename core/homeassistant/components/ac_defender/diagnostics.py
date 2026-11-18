"""Diagnostics for the defenders."""

from typing import Any

from homeassistant.components.diagnostics import async_redact_data
from homeassistant.core import HomeAssistant

from .const import (
    CONF_CLIMATE,
    CONF_DOOR_SENSOR,
    CONF_OUTDOOR,
    CONF_PRESENCE,
    CONF_ROOM_SENSOR,
)
from .types import DefenderConfigEntry

TO_REDACT = {
    CONF_CLIMATE,
    CONF_DOOR_SENSOR,
    CONF_OUTDOOR,
    CONF_PRESENCE,
    CONF_ROOM_SENSOR,
}


async def async_get_config_entry_diagnostics(
    hass: HomeAssistant, entry: DefenderConfigEntry
) -> dict[str, Any]:
    """Return diagnostics with the entity ids redacted."""
    return {
        "data": async_redact_data(dict(entry.data), TO_REDACT),
        "options": async_redact_data(dict(entry.options), TO_REDACT),
        "info": entry.runtime_data.info(),
    }
