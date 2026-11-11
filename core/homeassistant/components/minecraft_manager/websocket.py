"""WebSocket API of the Minecraft server manager integration."""

from typing import Any

import probatio

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from .const import DOMAIN
from .manager import DATA_MANAGER, MinecraftManager
from .targets import async_detect_targets
from .validation import validate_server


@callback
def async_register_commands(hass: HomeAssistant) -> None:
    """Register the commands."""
    websocket_api.async_register_command(hass, ws_targets)
    websocket_api.async_register_command(hass, ws_list)
    websocket_api.async_register_command(hass, ws_create)
    websocket_api.async_register_command(hass, ws_update)
    websocket_api.async_register_command(hass, ws_delete)


@websocket_api.websocket_command({probatio.Required("type"): f"{DOMAIN}/targets"})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_targets(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Report which hosting targets are possible on this installation."""
    targets = await async_detect_targets(hass)
    connection.send_result(msg["id"], {"targets": [t.as_dict() for t in targets]})


@websocket_api.websocket_command({probatio.Required("type"): f"{DOMAIN}/list"})
@websocket_api.require_admin
@callback
def ws_list(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """List the stored server definitions."""
    manager: MinecraftManager = hass.data[DATA_MANAGER]
    connection.send_result(msg["id"], {"servers": manager.servers()})


def _check(
    manager: MinecraftManager, raw: Any, ignore_id: str | None = None
) -> tuple[dict[str, Any], list[dict[str, str]]]:
    cleaned, errors = validate_server(raw)
    if not errors:
        errors = manager.conflicts(cleaned, ignore_id)
    return cleaned, errors


@websocket_api.websocket_command(
    {probatio.Required("type"): f"{DOMAIN}/create", probatio.Required("server"): dict}
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_create(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Validate and store a new definition. No process is started."""
    manager: MinecraftManager = hass.data[DATA_MANAGER]
    if manager.is_full():
        connection.send_result(
            msg["id"], {"saved": False, "errors": [{"field": "server", "code": "limit"}]}
        )
        return
    cleaned, errors = _check(manager, msg["server"])
    if errors:
        connection.send_result(msg["id"], {"saved": False, "errors": errors})
        return
    server = await manager.async_add(cleaned)
    connection.send_result(msg["id"], {"saved": True, "errors": [], "server": server})


@websocket_api.websocket_command(
    {
        probatio.Required("type"): f"{DOMAIN}/update",
        probatio.Required("server_id"): str,
        probatio.Required("server"): dict,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_update(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Validate and replace the settings of a stored definition."""
    manager: MinecraftManager = hass.data[DATA_MANAGER]
    if manager.get(msg["server_id"]) is None:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "Unknown server")
        return
    cleaned, errors = _check(manager, msg["server"], msg["server_id"])
    if errors:
        connection.send_result(msg["id"], {"saved": False, "errors": errors})
        return
    server = await manager.async_update(msg["server_id"], cleaned)
    connection.send_result(msg["id"], {"saved": True, "errors": [], "server": server})


@websocket_api.websocket_command(
    {probatio.Required("type"): f"{DOMAIN}/delete", probatio.Required("server_id"): str}
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_delete(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Remove a stored definition."""
    manager: MinecraftManager = hass.data[DATA_MANAGER]
    if manager.get(msg["server_id"]) is None:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "Unknown server")
        return
    await manager.async_remove(msg["server_id"])
    connection.send_result(msg["id"])
