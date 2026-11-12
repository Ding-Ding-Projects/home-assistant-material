"""WebSocket command of the dim sum surprise."""

from typing import Any

import probatio

from homeassistant.components import websocket_api
from homeassistant.components.http.auth import async_sign_path
from homeassistant.core import HomeAssistant, callback

from .const import DOMAIN, PICTURE_URL, SIGNED_PATH_LIFETIME
from .manager import DATA_MANAGER


@callback
def async_register_commands(hass: HomeAssistant) -> None:
    """Register the command."""
    websocket_api.async_register_command(hass, ws_random)


@websocket_api.websocket_command({probatio.Required("type"): f"{DOMAIN}/random"})
@websocket_api.async_response
async def ws_random(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Send one random dish with a short-lived picture path, or nothing."""
    dish = await hass.data[DATA_MANAGER].async_random()
    if dish is None:
        connection.send_result(msg["id"], None)
        return
    path = PICTURE_URL.format(picture_id=dish["id"])
    connection.send_result(
        msg["id"],
        {
            "id": dish["id"],
            "name_en": dish["name_en"],
            "name_yue": dish["name_yue"],
            "picture_url": async_sign_path(hass, path, SIGNED_PATH_LIFETIME),
            "content_type": dish["content_type"],
        },
    )
