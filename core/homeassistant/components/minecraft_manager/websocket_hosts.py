"""WebSocket commands for SSH hosts and version discovery.

Every command requires an administrator. No command ever returns a private key.
"""

from typing import Any

import probatio

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from . import operations
from .const import DOMAIN
from .host_validation import validate_host
from .hosts import public_view
from .manager import DATA_MANAGER, MinecraftManager
from .ssh import SshError, async_read_host_key
from .versions import VersionError


@callback
def async_register_host_commands(hass: HomeAssistant) -> None:
    """Register the host and version commands."""
    for command in (
        ws_hosts_list,
        ws_hosts_create,
        ws_hosts_update,
        ws_hosts_delete,
        ws_hosts_probe,
        ws_hosts_trust,
        ws_hosts_test,
        ws_versions_list,
        ws_versions_refresh,
    ):
        websocket_api.async_register_command(hass, command)


def _manager(hass: HomeAssistant) -> MinecraftManager:
    return hass.data[DATA_MANAGER]


def _check_host(
    manager: MinecraftManager, raw: Any, ignore_id: str | None = None
) -> tuple[dict[str, Any], list[dict[str, str]]]:
    cleaned, errors = validate_host(raw)
    if not errors:
        errors = manager.hosts.conflicts(cleaned, ignore_id)
    return cleaned, errors


def _known_host(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> tuple[MinecraftManager, Any] | None:
    manager = _manager(hass)
    host = manager.hosts.get(msg["host_id"])
    if host is None:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "Unknown host")
        return None
    return manager, host


@websocket_api.websocket_command({probatio.Required("type"): f"{DOMAIN}/hosts/list"})
@websocket_api.require_admin
@callback
def ws_hosts_list(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """List the hosts with their public key and trusted fingerprint."""
    connection.send_result(
        msg["id"], {"hosts": [public_view(h) for h in _manager(hass).hosts.hosts()]}
    )


@websocket_api.websocket_command(
    {probatio.Required("type"): f"{DOMAIN}/hosts/create", probatio.Required("host"): dict}
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_hosts_create(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Store a host and generate this instance's key pair for it."""
    manager = _manager(hass)
    if manager.hosts.is_full():
        connection.send_result(
            msg["id"], {"saved": False, "errors": [{"field": "host", "code": "limit"}]}
        )
        return
    cleaned, errors = _check_host(manager, msg["host"])
    if errors:
        connection.send_result(msg["id"], {"saved": False, "errors": errors})
        return
    host = await manager.hosts.async_create(cleaned)
    connection.send_result(
        msg["id"], {"saved": True, "errors": [], "host": public_view(host)}
    )


@websocket_api.websocket_command(
    {
        probatio.Required("type"): f"{DOMAIN}/hosts/update",
        probatio.Required("host_id"): str,
        probatio.Required("host"): dict,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_hosts_update(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Change a host. A new address or port drops the trusted host key."""
    if (found := _known_host(hass, connection, msg)) is None:
        return
    manager, host = found
    cleaned, errors = _check_host(manager, msg["host"], host["id"])
    if errors:
        connection.send_result(msg["id"], {"saved": False, "errors": errors})
        return
    updated = await manager.hosts.async_update(host["id"], cleaned)
    connection.send_result(
        msg["id"], {"saved": True, "errors": [], "host": public_view(updated)}
    )


@websocket_api.websocket_command(
    {probatio.Required("type"): f"{DOMAIN}/hosts/delete", probatio.Required("host_id"): str}
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_hosts_delete(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Remove a host and its private key, unless a server still uses it."""
    if (found := _known_host(hass, connection, msg)) is None:
        return
    manager, host = found
    if any(server.get("host_id") == host["id"] for server in manager.servers()):
        connection.send_result(msg["id"], operations.failure("host_in_use"))
        return
    await manager.hosts.async_remove(host["id"])
    connection.send_result(msg["id"], {"ok": True})


@websocket_api.websocket_command(
    {probatio.Required("type"): f"{DOMAIN}/hosts/probe", probatio.Required("host_id"): str}
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_hosts_probe(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Read the host key the machine presents and compare it with the stored one."""
    if (found := _known_host(hass, connection, msg)) is None:
        return
    _, host = found
    try:
        info = await async_read_host_key(host["address"], host["port"])
    except SshError as err:
        connection.send_result(msg["id"], operations.failure(err.code))
        return
    trusted = host.get("host_key")
    if trusted is None:
        status = "new"
    elif trusted["fingerprint"] == info.fingerprint:
        status = "match"
    else:
        status = "changed"
    connection.send_result(
        msg["id"],
        {
            "ok": True,
            "fingerprint": info.fingerprint,
            "status": status,
            "trusted_fingerprint": trusted["fingerprint"] if trusted else None,
        },
    )


@websocket_api.websocket_command(
    {
        probatio.Required("type"): f"{DOMAIN}/hosts/trust",
        probatio.Required("host_id"): str,
        probatio.Required("fingerprint"): str,
        probatio.Optional("replace", default=False): bool,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_hosts_trust(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Store the host key whose fingerprint the person confirmed.

    The key is read again and must still match the confirmed fingerprint. A
    different key that is already trusted is only replaced on request.
    """
    if (found := _known_host(hass, connection, msg)) is None:
        return
    manager, host = found
    try:
        info = await async_read_host_key(host["address"], host["port"])
    except SshError as err:
        connection.send_result(msg["id"], operations.failure(err.code))
        return
    if info.fingerprint != msg["fingerprint"]:
        connection.send_result(msg["id"], operations.failure("fingerprint_mismatch"))
        return
    trusted = host.get("host_key")
    if trusted and trusted["fingerprint"] != info.fingerprint and not msg["replace"]:
        connection.send_result(msg["id"], operations.failure("host_key_changed"))
        return
    updated = await manager.hosts.async_set_host_key(
        host["id"], info.fingerprint, info.key_line
    )
    connection.send_result(msg["id"], {"ok": True, "host": public_view(updated)})


@websocket_api.websocket_command(
    {probatio.Required("type"): f"{DOMAIN}/hosts/test", probatio.Required("host_id"): str}
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_hosts_test(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Sign in and report the Docker version and whether Docker can be used."""
    if (found := _known_host(hass, connection, msg)) is None:
        return
    manager, host = found
    connection.send_result(msg["id"], await operations.async_test_host(manager, host["id"]))


@websocket_api.websocket_command({probatio.Required("type"): f"{DOMAIN}/versions/list"})
@websocket_api.require_admin
@callback
def ws_versions_list(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Return the cached version lists. Nothing is fetched."""
    connection.send_result(msg["id"], _manager(hass).versions.cached())


@websocket_api.websocket_command(
    {probatio.Required("type"): f"{DOMAIN}/versions/refresh"}
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_versions_refresh(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Fetch the version lists now, because the person asked."""
    try:
        data = await _manager(hass).versions.async_refresh()
    except VersionError as err:
        connection.send_result(msg["id"], operations.failure(err.code))
        return
    connection.send_result(msg["id"], {"ok": True, **data})
