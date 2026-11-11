"""WebSocket API of the Minecraft server manager integration."""

from typing import Any

import probatio

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from . import operations
from .commands import slug
from .const import DOMAIN, LOG_LINES_DEFAULT, LOG_LINES_MAX, TARGET_SSH_DOCKER
from .manager import DATA_MANAGER, MinecraftManager
from .targets import async_detect_targets
from .validation import validate_server
from .websocket_hosts import async_register_host_commands


@callback
def async_register_commands(hass: HomeAssistant) -> None:
    """Register the commands."""
    websocket_api.async_register_command(hass, ws_targets)
    websocket_api.async_register_command(hass, ws_list)
    websocket_api.async_register_command(hass, ws_create)
    websocket_api.async_register_command(hass, ws_update)
    websocket_api.async_register_command(hass, ws_delete)
    websocket_api.async_register_command(hass, ws_set_eula)
    websocket_api.async_register_command(hass, ws_status)
    websocket_api.async_register_command(hass, ws_start)
    websocket_api.async_register_command(hass, ws_stop)
    websocket_api.async_register_command(hass, ws_restart)
    websocket_api.async_register_command(hass, ws_logs)
    websocket_api.async_register_command(hass, ws_remove_container)
    websocket_api.async_register_command(hass, ws_delete_data)
    async_register_host_commands(hass)


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
    host_id = cleaned.get("host_id")
    if not errors and host_id and manager.hosts.get(host_id) is None:
        errors = [{"field": "host_id", "code": "unknown_host"}]
    return cleaned, errors


async def _identity_errors(
    manager: MinecraftManager, old: Any, new: dict[str, Any]
) -> list[dict[str, str]]:
    """Refuse a change that would leave a container behind.

    The container is found by the server's name on its host, so a new name, a
    new host or a new target is only allowed once the container is verified
    absent from the old place.
    """
    if old.get("target") != TARGET_SSH_DOCKER or not old.get("host_id"):
        return []
    fields = []
    if slug(old["name"]) != slug(new["name"]):
        fields.append("name")
    if old.get("host_id") != new.get("host_id") or old["target"] != new["target"]:
        fields.append("host_id")
    if not fields:
        return []
    state = await operations.async_container_state(manager, old)
    if state == "absent":
        return []
    code = state["code"] if isinstance(state, dict) else "container_exists"
    return [{"field": field, "code": code} for field in fields]


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
    async with manager.lock(msg["server_id"]):
        old = manager.get(msg["server_id"])
        if old is None:
            connection.send_error(
                msg["id"], websocket_api.ERR_NOT_FOUND, "Unknown server"
            )
            return
        cleaned, errors = _check(manager, msg["server"], msg["server_id"])
        if not errors:
            errors = await _identity_errors(manager, old, cleaned)
        if errors:
            connection.send_result(msg["id"], {"saved": False, "errors": errors})
            return
        server = await manager.async_update(msg["server_id"], cleaned)
    connection.send_result(msg["id"], {"saved": True, "errors": [], "server": server})


@websocket_api.websocket_command(
    {
        probatio.Required("type"): f"{DOMAIN}/delete",
        probatio.Required("server_id"): str,
        probatio.Optional("force", default=False): bool,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_delete(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Remove a stored definition, unless its container still exists.

    A container that is present is never left running unmanaged. When the host
    cannot be reached to check, ``force`` removes the definition anyway.
    """
    manager: MinecraftManager = hass.data[DATA_MANAGER]
    server = manager.get(msg["server_id"])
    if server is None:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "Unknown server")
        return
    async with manager.lock(msg["server_id"]):
        state = await operations.async_container_state(manager, server)
        if state != "absent" and not (isinstance(state, dict) and msg["force"]):
            connection.send_result(
                msg["id"],
                operations.failure(
                    state["code"] if isinstance(state, dict) else "container_exists"
                ),
            )
            return
        await manager.async_remove(msg["server_id"])
    connection.send_result(msg["id"], {"ok": True})


def _known_server(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> tuple[MinecraftManager, Any] | None:
    manager: MinecraftManager = hass.data[DATA_MANAGER]
    server = manager.get(msg["server_id"])
    if server is None:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "Unknown server")
        return None
    return manager, server


@websocket_api.websocket_command(
    {
        probatio.Required("type"): f"{DOMAIN}/set_eula",
        probatio.Required("server_id"): str,
        probatio.Required("accepted"): bool,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_set_eula(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Record that the person accepted, or no longer accepts, the Minecraft EULA."""
    if (found := _known_server(hass, connection, msg)) is None:
        return
    manager, server = found
    updated = await manager.async_set_eula(server["id"], msg["accepted"])
    connection.send_result(msg["id"], {"server": updated})


def _server_command(name: str, handler: Any) -> Any:
    """Build a websocket command that runs one operation on one server."""

    @websocket_api.websocket_command(
        {
            probatio.Required("type"): f"{DOMAIN}/{name}",
            probatio.Required("server_id"): str,
        }
    )
    @websocket_api.require_admin
    @websocket_api.async_response
    async def command(
        hass: HomeAssistant,
        connection: websocket_api.ActiveConnection,
        msg: dict[str, Any],
    ) -> None:
        if (found := _known_server(hass, connection, msg)) is None:
            return
        manager, server = found
        connection.send_result(msg["id"], await handler(manager, server))

    command.__name__ = f"ws_{name}"
    return command


ws_status = _server_command("status", operations.async_status)
ws_start = _server_command("start", operations.async_start)
ws_stop = _server_command("stop", operations.async_stop)
ws_restart = _server_command("restart", operations.async_restart)
ws_remove_container = _server_command(
    "remove_container", operations.async_remove_container
)


@websocket_api.websocket_command(
    {
        probatio.Required("type"): f"{DOMAIN}/logs",
        probatio.Required("server_id"): str,
        probatio.Optional("lines", default=LOG_LINES_DEFAULT): probatio.All(
            int, probatio.Range(min=1, max=LOG_LINES_MAX)
        ),
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_logs(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Return the last lines of a server log."""
    if (found := _known_server(hass, connection, msg)) is None:
        return
    manager, server = found
    connection.send_result(
        msg["id"], await operations.async_logs(manager, server, msg["lines"])
    )


@websocket_api.websocket_command(
    {
        probatio.Required("type"): f"{DOMAIN}/delete_data",
        probatio.Required("server_id"): str,
        probatio.Required("confirm_name"): str,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_delete_data(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Delete the world data of a server, only when its name is typed back."""
    if (found := _known_server(hass, connection, msg)) is None:
        return
    manager, server = found
    if msg["confirm_name"] != server["name"]:
        connection.send_result(msg["id"], operations.failure("confirmation_mismatch"))
        return
    connection.send_result(msg["id"], await operations.async_delete_data(manager, server))
