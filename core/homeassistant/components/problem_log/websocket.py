"""WebSocket API of the problem log."""

from typing import Any

import probatio

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant

from .const import DOMAIN


@websocket_api.require_admin
@websocket_api.websocket_command({probatio.Required("type"): "problem_log/list"})
@websocket_api.async_response
async def ws_list(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """List the recorded problems."""
    log = hass.data[DOMAIN]
    result = await hass.async_add_executor_job(log.list_problems)
    connection.send_result(msg["id"], result)
