"""WebSocket API of the Ollama suite integration.

Every command is for administrators. The suite reads the servers that were
set up through the Ollama integration and uses the client that integration
already holds, so no address is stored here and nothing else is contacted.
Prompts and answers are never read or logged.
"""

import asyncio
import logging
from typing import Any

import probatio

from homeassistant.components import websocket_api
from homeassistant.config_entries import ConfigEntry, ConfigEntryState
from homeassistant.const import CONF_URL
from homeassistant.core import HomeAssistant, callback

from .const import DOMAIN, MAX_NAME_LENGTH, OLLAMA_DOMAIN, REQUEST_TIMEOUT
from .data import (
    map_error,
    mask_address,
    shape_models,
    shape_running,
    shape_show,
)

_LOGGER = logging.getLogger(__name__)

_ENTRY = {probatio.Required("entry_id"): str}


@callback
def async_register_commands(hass: HomeAssistant) -> None:
    """Register the commands."""
    websocket_api.async_register_command(hass, ws_servers)
    websocket_api.async_register_command(hass, ws_models)
    websocket_api.async_register_command(hass, ws_running)
    websocket_api.async_register_command(hass, ws_show)


def _server_entries(hass: HomeAssistant) -> list[ConfigEntry]:
    return hass.config_entries.async_entries(OLLAMA_DOMAIN)


def _address(entry: ConfigEntry) -> str:
    settings = {**entry.data, **entry.options}
    return mask_address(settings.get(CONF_URL))


async def _async_version(client: Any) -> str | None:
    """Ask the server for its version."""
    async with asyncio.timeout(REQUEST_TIMEOUT):
        response = await client._request_raw("GET", "/api/version")  # noqa: SLF001
    version = response.json().get("version")
    return version[:64] if isinstance(version, str) else None


async def _async_server_view(entry: ConfigEntry) -> dict[str, Any]:
    view: dict[str, Any] = {
        "entry_id": entry.entry_id,
        "title": entry.title,
        "address": _address(entry),
        "state": entry.state.value,
        "disabled": entry.disabled_by is not None,
        "reachable": False,
        "version": None,
        "error": None,
    }
    if entry.state is not ConfigEntryState.LOADED:
        return view
    try:
        view["version"] = await _async_version(entry.runtime_data)
        view["reachable"] = True
    except Exception as err:  # noqa: BLE001
        view["error"] = map_error(err)
    return view


def _client_for(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> Any | None:
    """Return the client of the requested server, or answer with an error."""
    entry = hass.config_entries.async_get_entry(msg["entry_id"])
    if entry is None or entry.domain != OLLAMA_DOMAIN:
        connection.send_error(msg["id"], "not_found", "No such Ollama server")
        return None
    if entry.state is not ConfigEntryState.LOADED:
        connection.send_error(msg["id"], "not_loaded", "The server is not set up")
        return None
    return entry.runtime_data


@websocket_api.websocket_command({probatio.Required("type"): f"{DOMAIN}/servers"})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_servers(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """List the configured Ollama servers and whether each answers."""
    servers = await asyncio.gather(
        *(_async_server_view(entry) for entry in _server_entries(hass))
    )
    connection.send_result(msg["id"], {"servers": list(servers)})


@websocket_api.websocket_command(
    {probatio.Required("type"): f"{DOMAIN}/models", **_ENTRY}
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_models(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """List the models stored on one server."""
    if (client := _client_for(hass, connection, msg)) is None:
        return
    try:
        async with asyncio.timeout(REQUEST_TIMEOUT):
            response = await client.list()
    except Exception as err:  # noqa: BLE001
        connection.send_error(msg["id"], map_error(err), "The server did not answer")
        return
    connection.send_result(msg["id"], shape_models(response))


@websocket_api.websocket_command(
    {probatio.Required("type"): f"{DOMAIN}/running", **_ENTRY}
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_running(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """List the models loaded in memory on one server."""
    if (client := _client_for(hass, connection, msg)) is None:
        return
    try:
        async with asyncio.timeout(REQUEST_TIMEOUT):
            response = await client.ps()
    except Exception as err:  # noqa: BLE001
        connection.send_error(msg["id"], map_error(err), "The server did not answer")
        return
    connection.send_result(msg["id"], shape_running(response))


@websocket_api.websocket_command(
    {
        probatio.Required("type"): f"{DOMAIN}/show",
        probatio.Required("model"): probatio.All(
            str, probatio.Length(min=1, max=MAX_NAME_LENGTH)
        ),
        **_ENTRY,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_show(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Return the details of one model."""
    if (client := _client_for(hass, connection, msg)) is None:
        return
    try:
        async with asyncio.timeout(REQUEST_TIMEOUT):
            response = await client.show(msg["model"])
    except Exception as err:  # noqa: BLE001
        connection.send_error(msg["id"], map_error(err), "The server did not answer")
        return
    connection.send_result(msg["id"], shape_show(response, msg["model"]))
