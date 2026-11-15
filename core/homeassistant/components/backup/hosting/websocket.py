"""Administrator-only backup hosting commands."""

from typing import Any

import probatio

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from . import DATA_HOSTING
from .client import HostingError

IDENTIFIER = probatio.All(str, probatio.Length(min=1, max=128), probatio.Match(r"^[A-Za-z0-9_.-]+$"))


async def _dispatch(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Return safe typed errors without logging requests or remote responses."""
    manager = hass.data[DATA_HOSTING]
    try:
        match msg["type"]:
            case "backup/hosting/status":
                result = await manager.async_status()
            case "backup/hosting/pair":
                result = await manager.async_pair(msg)
            case "backup/hosting/start":
                result = await manager.async_start(msg)
            case "backup/hosting/jobs":
                result = await manager.async_jobs(msg["bridge_id"])
            case "backup/hosting/cancel":
                result = await manager.async_cancel(msg["bridge_id"], msg["job_id"])
    except HostingError as err:
        connection.send_error(msg["id"], err.code, "The backup hosting operation could not be completed.")
        return
    connection.send_result(msg["id"], result)


@websocket_api.require_admin
@websocket_api.websocket_command({probatio.Required("type"): "backup/hosting/status"})
@websocket_api.async_response
async def status(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """List paired bridges and their actual runtime capabilities."""
    await _dispatch(hass, connection, msg)


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
            probatio.Required("type"): "backup/hosting/pair",
            probatio.Optional("bridge_id"): IDENTIFIER,
            probatio.Optional("url"): probatio.All(str, probatio.Length(max=2048)),
            probatio.Optional("fingerprint"): probatio.All(str, probatio.Length(max=95)),
    }
)
@websocket_api.async_response
async def pair(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Request explicit native approval or poll the transient pairing challenge."""
    await _dispatch(hass, connection, msg)


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "backup/hosting/start",
        probatio.Required("request_id"): IDENTIFIER,
        probatio.Required("backup_id"): IDENTIFIER,
        probatio.Required("agent_id"): IDENTIFIER,
        probatio.Required("bridge_id"): IDENTIFIER,
        probatio.Required("target"): probatio.In({"docker", "virtualbox", "vmware"}),
        probatio.Optional("options", default={}): {
            probatio.Optional("name"): probatio.All(str, probatio.Length(min=1, max=80)),
        },
        probatio.Optional("password"): probatio.All(str, probatio.Length(min=1, max=1024)),
    }
)
@websocket_api.async_response
async def start(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Transfer a selected backup to an independent instance on this computer."""
    await _dispatch(hass, connection, msg)


@websocket_api.require_admin
@websocket_api.websocket_command({probatio.Required("type"): "backup/hosting/jobs", probatio.Required("bridge_id"): IDENTIFIER})
@websocket_api.async_response
async def jobs(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Reconcile native jobs after a reconnect without replaying a restore."""
    await _dispatch(hass, connection, msg)


@websocket_api.require_admin
@websocket_api.websocket_command({probatio.Required("type"): "backup/hosting/cancel", probatio.Required("bridge_id"): IDENTIFIER, probatio.Required("job_id"): IDENTIFIER})
@websocket_api.async_response
async def cancel(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Cancel an owned native job without touching the source instance."""
    await _dispatch(hass, connection, msg)


@callback
def async_register_commands(hass: HomeAssistant) -> None:
    """Register the administrator-only transport contract."""
    for handler in (status, pair, start, jobs, cancel):
        websocket_api.async_register_command(hass, handler)
