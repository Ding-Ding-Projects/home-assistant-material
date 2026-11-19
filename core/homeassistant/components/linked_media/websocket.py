"""Websocket commands for the Linked tab of the media page."""

from typing import Any

import probatio

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from .address import parse_address
from .const import (
    DEFAULT_MAX_SIZE_MB,
    FETCH_EACH_TIME,
    FETCH_RULES,
    MAX_MAX_SIZE_MB,
    MIN_MAX_SIZE_MB,
)
from .data import async_get_manager
from .manager import LinkedFile, LinkedMediaManager

NAME = probatio.All(str, probatio.Strip, probatio.Length(min=1, max=100))
ADDRESS = probatio.All(str, probatio.Strip, probatio.Length(min=8, max=2048))
SIZE = probatio.All(
    probatio.Coerce(int), probatio.Range(min=MIN_MAX_SIZE_MB, max=MAX_MAX_SIZE_MB)
)


@callback
def async_register(hass: HomeAssistant) -> None:
    """Register the commands."""
    for command in (
        websocket_list,
        websocket_status,
        websocket_check,
        websocket_add,
        websocket_update,
        websocket_remove,
    ):
        websocket_api.async_register_command(hass, command)


def _manager(
    connection: websocket_api.ActiveConnection, msg: dict[str, Any], hass: HomeAssistant
) -> LinkedMediaManager | None:
    if (manager := async_get_manager(hass)) is None:
        connection.send_error(msg["id"], "not_loaded", "Linked media is not set up")
    return manager


def _file(
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    manager: LinkedMediaManager,
) -> LinkedFile | None:
    if (linked := manager.get(msg["file_id"])) is None:
        connection.send_error(
            msg["id"], websocket_api.ERR_NOT_FOUND, "This linked file does not exist"
        )
    return linked


@websocket_api.websocket_command({probatio.Required("type"): "linked_media/list"})
@callback
def websocket_list(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """List the linked files, never with their addresses for non-admins."""
    if (manager := _manager(connection, msg, hass)) is None:
        return
    admin = connection.user.is_admin
    connection.send_result(
        msg["id"],
        {
            "files": [
                manager.as_dict(linked, admin=admin)
                for linked in sorted(manager.files.values(), key=lambda f: f.name)
            ]
        },
    )


@websocket_api.websocket_command(
    {
        probatio.Required("type"): "linked_media/status",
        probatio.Required("file_id"): str,
    }
)
@callback
def websocket_status(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Say whether a file is in use now, when it was used and its last failure."""
    if (manager := _manager(connection, msg, hass)) is None:
        return
    if (linked := _file(connection, msg, manager)) is None:
        return
    connection.send_result(
        msg["id"], manager.as_dict(linked, admin=connection.user.is_admin)
    )


@websocket_api.websocket_command(
    {
        probatio.Required("type"): "linked_media/check",
        probatio.Exclusive("file_id", "target"): str,
        probatio.Exclusive("address", "target"): ADDRESS,
        probatio.Optional("home_network", default=False): bool,
        probatio.Optional("max_size_mb", default=DEFAULT_MAX_SIZE_MB): SIZE,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_check(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Fetch only the answer's headers and say what the address holds."""
    if (manager := _manager(connection, msg, hass)) is None:
        return
    if "file_id" in msg:
        if (linked := _file(connection, msg, manager)) is None:
            return
        result = await manager.async_check(linked)
        result["file"] = manager.as_dict(linked, admin=True)
    elif "address" in msg:
        result = await manager.async_check_address(
            msg["address"],
            home_network=msg["home_network"],
            max_size_mb=msg["max_size_mb"],
        )
    else:
        connection.send_error(
            msg["id"], websocket_api.ERR_INVALID_FORMAT, "Give a file or an address"
        )
        return
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command(
    {
        probatio.Required("type"): "linked_media/add",
        probatio.Required("name"): NAME,
        probatio.Required("address"): ADDRESS,
        probatio.Optional("fetch", default=FETCH_EACH_TIME): probatio.In(FETCH_RULES),
        probatio.Optional("max_size_mb", default=DEFAULT_MAX_SIZE_MB): SIZE,
        probatio.Optional("home_network", default=False): bool,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_add(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Check an address and add it when it holds a media file."""
    if (manager := _manager(connection, msg, hass)) is None:
        return
    if parse_address(msg["address"]) is None:
        connection.send_result(
            msg["id"],
            {
                "added": False,
                "check": {"reachable": False, "reason": "invalid_address"},
            },
        )
        return
    check = await manager.async_check_address(
        msg["address"],
        home_network=msg["home_network"],
        max_size_mb=msg["max_size_mb"],
    )
    if not check["reachable"]:
        connection.send_result(msg["id"], {"added": False, "check": check})
        return
    linked = await manager.async_add(
        msg["name"],
        msg["address"],
        check["content_type"],
        check["kind"],
        fetch=msg["fetch"],
        max_size_mb=msg["max_size_mb"],
        home_network=msg["home_network"],
    )
    connection.send_result(
        msg["id"],
        {"added": True, "check": check, "file": manager.as_dict(linked, admin=True)},
    )


@websocket_api.websocket_command(
    {
        probatio.Required("type"): "linked_media/update",
        probatio.Required("file_id"): str,
        probatio.Optional("name"): NAME,
        probatio.Optional("fetch"): probatio.In(FETCH_RULES),
        probatio.Optional("max_size_mb"): SIZE,
        probatio.Optional("home_network"): bool,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_update(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Change the name, fetch rule, size limit or home network switch."""
    if (manager := _manager(connection, msg, hass)) is None:
        return
    if (linked := _file(connection, msg, manager)) is None:
        return
    changes = {
        key: msg[key]
        for key in ("name", "fetch", "max_size_mb", "home_network")
        if key in msg
    }
    await manager.async_update(linked, changes)
    connection.send_result(msg["id"], manager.as_dict(linked, admin=True))


@websocket_api.websocket_command(
    {
        probatio.Required("type"): "linked_media/remove",
        probatio.Required("file_id"): str,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_remove(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Remove a file and every copy of it."""
    if (manager := _manager(connection, msg, hass)) is None:
        return
    if _file(connection, msg, manager) is None:
        return
    await manager.async_remove(msg["file_id"])
    connection.send_result(msg["id"])
