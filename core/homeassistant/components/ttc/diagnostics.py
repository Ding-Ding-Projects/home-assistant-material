"""Diagnostics for the TTC transit integration.

Only public numbers chosen in the setup are included: routes, stations and stops.
"""

from typing import Any

from homeassistant.core import HomeAssistant

from .coordinator import TTCConfigEntry, entry_settings
from .websocket import overview


async def async_get_config_entry_diagnostics(
    hass: HomeAssistant, entry: TTCConfigEntry
) -> dict[str, Any]:
    """Return diagnostics for a config entry."""
    page = overview(hass, entry)
    return {
        "settings": entry_settings(entry),
        "feeds": page["feeds"],
        "route_titles_known": len(entry.runtime_data.route_titles),
        "routes": [
            {"route": item["route"], "status": item["status"]}
            for item in page["routes"]
        ],
        "stations": [
            {
                "station": item["station"],
                "elevators_out": len(item["elevators"]),
                "escalators_out": len(item["escalators"]),
            }
            for item in page["stations"]
        ],
        "stops": [
            {
                "stop": item["stop"],
                "read_at": item["read_at"],
                "departures": len(item["departures"]),
            }
            for item in page["stops"]
        ],
        "alerts_in_effect": len(page["alerts"]),
    }
