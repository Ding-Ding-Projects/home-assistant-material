"""WebSocket API of the Ollama suite integration.

Every command is for administrators. The suite reads the servers that were
set up through the Ollama integration and uses the client that integration
already holds, so no address is stored here and nothing else is contacted.
Prompts and answers are never read or logged.
"""

import asyncio
import logging
import time
from typing import Any

import probatio

from homeassistant.components import websocket_api
from homeassistant.config_entries import ConfigEntry, ConfigEntryState
from homeassistant.const import CONF_URL
from homeassistant.core import HomeAssistant, callback

from .const import (
    DOMAIN,
    MAX_NAME_LENGTH,
    MAX_VERSION_BYTES,
    OLLAMA_DOMAIN,
    PULL_EVENT_INTERVAL,
    PULL_IDLE_TIMEOUT,
    REQUEST_TIMEOUT,
)
from .data import (
    PullTracker,
    listed_size,
    map_error,
    mask_address,
    shape_models,
    shape_progress,
    shape_running,
    shape_show,
    valid_listed_name,
    valid_pull_name,
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
    websocket_api.async_register_command(hass, ws_pull)
    websocket_api.async_register_command(hass, ws_delete)
    websocket_api.async_register_command(hass, ws_unload)


def _server_entries(hass: HomeAssistant) -> list[ConfigEntry]:
    return hass.config_entries.async_entries(OLLAMA_DOMAIN)


def _address(entry: ConfigEntry) -> str:
    settings = {**entry.data, **entry.options}
    return mask_address(settings.get(CONF_URL))


async def _async_version(client: Any) -> str | None:
    """Ask the server for its version, or None if that cannot be read.

    The library has no public call for this, so a change in the library or an
    oversized answer only means the version is unknown.
    """
    request = getattr(client, "_request_raw", None)
    if request is None:
        return None
    try:
        async with asyncio.timeout(REQUEST_TIMEOUT):
            response = await request("GET", "/api/version")
        if len(response.content) > MAX_VERSION_BYTES:
            return None
        version = response.json().get("version")
    except Exception:  # noqa: BLE001
        return None
    return version[:64] if isinstance(version, str) else None


def _runtime_client(entry: ConfigEntry) -> Any | None:
    """Return the client a loaded entry holds, or None."""
    return getattr(entry, "runtime_data", None)


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
    client = _runtime_client(entry)
    if entry.state is not ConfigEntryState.LOADED or client is None:
        return view
    try:
        async with asyncio.timeout(REQUEST_TIMEOUT):
            await client.ps()
    except Exception as err:  # noqa: BLE001
        view["error"] = map_error(err)
        return view
    view["reachable"] = True
    view["version"] = await _async_version(client)
    return view


def _entry_and_client(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> tuple[ConfigEntry, Any] | None:
    """Return the requested server and its client, or answer with an error."""
    entry = hass.config_entries.async_get_entry(msg["entry_id"])
    if entry is None or entry.domain != OLLAMA_DOMAIN:
        connection.send_error(msg["id"], "not_found", "No such Ollama server")
        return None
    client = _runtime_client(entry)
    if entry.state is not ConfigEntryState.LOADED or client is None:
        connection.send_error(msg["id"], "not_loaded", "The server is not set up")
        return None
    return entry, client


def _client_for(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> Any | None:
    """Return the client of the requested server, or answer with an error."""
    found = _entry_and_client(hass, connection, msg)
    return None if found is None else found[1]


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


def _tracker(hass: HomeAssistant) -> PullTracker:
    return hass.data.setdefault(DOMAIN, {}).setdefault("pulls", PullTracker())


_MODEL = {
    probatio.Required("model"): probatio.All(
        str, probatio.Length(min=1, max=MAX_NAME_LENGTH)
    )
}


async def _async_pull(
    connection: websocket_api.ActiveConnection,
    msg_id: int,
    client: Any,
    model: str,
) -> None:
    """Download a model and send progress events until it ends."""
    last_sent = 0.0
    last_status = None

    def send(event: dict[str, Any]) -> None:
        connection.send_message(websocket_api.event_message(msg_id, event))

    try:
        stream = await asyncio.wait_for(
            client.pull(model, stream=True), PULL_IDLE_TIMEOUT
        )
        iterator = aiter(stream)
        try:
            while True:
                try:
                    item = await asyncio.wait_for(anext(iterator), PULL_IDLE_TIMEOUT)
                except StopAsyncIteration:
                    break
                event = shape_progress(item)
                now = time.monotonic()
                if (
                    event["status"] != last_status
                    or now - last_sent >= PULL_EVENT_INTERVAL
                ):
                    last_sent, last_status = now, event["status"]
                    send({"state": "progress", **event})
        finally:
            close = getattr(iterator, "aclose", None)
            if close is not None:
                await close()
    except asyncio.CancelledError:
        raise
    except Exception as err:  # noqa: BLE001
        send({"state": "error", "code": map_error(err)})
    else:
        send({"state": "done"})


@websocket_api.websocket_command(
    {probatio.Required("type"): f"{DOMAIN}/pull", **_ENTRY, **_MODEL}
)
@websocket_api.require_admin
@callback
def ws_pull(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Download a model to one server. Unsubscribing cancels the download."""
    if not valid_pull_name(msg["model"]):
        connection.send_error(msg["id"], "bad_request", "Not a valid model name")
        return
    if (found := _entry_and_client(hass, connection, msg)) is None:
        return
    entry, client = found
    tracker = _tracker(hass)
    if not tracker.start(entry.entry_id):
        connection.send_error(
            msg["id"], "busy", "A download is already running on this server"
        )
        return
    msg_id = msg["id"]

    async def run() -> None:
        try:
            await _async_pull(connection, msg_id, client, msg["model"])
        finally:
            tracker.finish(entry.entry_id)
            connection.subscriptions.pop(msg_id, None)

    task = hass.async_create_background_task(run(), f"{DOMAIN} pull {entry.entry_id}")
    connection.subscriptions[msg_id] = task.cancel
    connection.send_result(msg_id)


@websocket_api.websocket_command(
    {probatio.Required("type"): f"{DOMAIN}/delete", **_ENTRY, **_MODEL}
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_delete(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Remove a model that the server lists."""
    if not valid_listed_name(msg["model"]):
        connection.send_error(msg["id"], "bad_request", "Not a valid model name")
        return
    if (client := _client_for(hass, connection, msg)) is None:
        return
    try:
        async with asyncio.timeout(REQUEST_TIMEOUT):
            listed, size = listed_size(await client.list(), msg["model"])
        if not listed:
            connection.send_error(
                msg["id"], "not_found", "The server has no such model"
            )
            return
        async with asyncio.timeout(REQUEST_TIMEOUT):
            await client.delete(msg["model"])
    except Exception as err:  # noqa: BLE001
        connection.send_error(msg["id"], map_error(err), "The server did not answer")
        return
    connection.send_result(msg["id"], {"model": msg["model"], "freed": size})


@websocket_api.websocket_command(
    {probatio.Required("type"): f"{DOMAIN}/unload", **_ENTRY, **_MODEL}
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_unload(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Unload a model from memory by asking the server to keep it for no time."""
    if not valid_listed_name(msg["model"]):
        connection.send_error(msg["id"], "bad_request", "Not a valid model name")
        return
    if (client := _client_for(hass, connection, msg)) is None:
        return
    try:
        async with asyncio.timeout(REQUEST_TIMEOUT):
            listed, _ = listed_size(await client.ps(), msg["model"])
        if not listed:
            connection.send_error(msg["id"], "not_found", "The model is not loaded")
            return
        async with asyncio.timeout(REQUEST_TIMEOUT):
            await client.generate(model=msg["model"], keep_alive=0)
    except Exception as err:  # noqa: BLE001
        connection.send_error(msg["id"], map_error(err), "The server did not answer")
        return
    connection.send_result(msg["id"], {"model": msg["model"]})
