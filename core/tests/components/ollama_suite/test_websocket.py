"""Tests for the WebSocket commands of the Ollama suite."""

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from pytest_homeassistant.common import MockConfigEntry

from homeassistant.config_entries import ConfigEntryState
from homeassistant.const import CONF_URL
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component

from tests.typing import WebSocketGenerator


async def _loaded_entry(hass: HomeAssistant, client: MagicMock) -> MockConfigEntry:
    entry = MockConfigEntry(
        domain="ollama",
        title="Ollama",
        data={CONF_URL: "http://user:pw@192.168.1.5:11434"},
    )
    entry.add_to_hass(hass)
    entry.mock_state(hass, ConfigEntryState.LOADED)
    entry.runtime_data = client
    assert await async_setup_component(hass, "ollama_suite", {})
    return entry


def _client() -> MagicMock:
    client = MagicMock()
    client._request_raw = AsyncMock(
        return_value=SimpleNamespace(json=lambda: {"version": "0.12.6"})
    )
    client.list = AsyncMock(
        return_value=SimpleNamespace(
            models=[
                SimpleNamespace(
                    model="llama3.2:3b",
                    digest="d",
                    size=1,
                    modified_at=None,
                    details=None,
                )
            ]
        )
    )
    client.ps = AsyncMock(return_value=SimpleNamespace(models=[]))
    client.show = AsyncMock(return_value=SimpleNamespace(modelinfo={}))
    client.delete = AsyncMock(return_value=SimpleNamespace(status="success"))
    client.generate = AsyncMock()
    return client


async def test_servers_masks_address(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """The address is shown without credentials and the version is read."""
    entry = await _loaded_entry(hass, _client())
    ws = await hass_ws_client(hass)
    await ws.send_json_auto_id({"type": "ollama_suite/servers"})
    result = (await ws.receive_json())["result"]["servers"][0]
    assert result["entry_id"] == entry.entry_id
    assert result["address"] == "http://192.168.1.5:11434"
    assert result["reachable"] is True
    assert result["version"] == "0.12.6"


async def test_servers_reports_unreachable(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """A server that does not answer is listed as unreachable."""
    client = _client()
    client.ps = AsyncMock(side_effect=ConnectionError())
    await _loaded_entry(hass, client)
    ws = await hass_ws_client(hass)
    await ws.send_json_auto_id({"type": "ollama_suite/servers"})
    result = (await ws.receive_json())["result"]["servers"][0]
    assert result["reachable"] is False
    assert result["error"] == "cannot_connect"


async def test_models_running_show(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """Models, running models and details are served."""
    entry = await _loaded_entry(hass, _client())
    ws = await hass_ws_client(hass)
    await ws.send_json_auto_id(
        {"type": "ollama_suite/models", "entry_id": entry.entry_id}
    )
    assert (await ws.receive_json())["result"]["models"][0]["name"] == "llama3.2:3b"
    await ws.send_json_auto_id(
        {"type": "ollama_suite/running", "entry_id": entry.entry_id}
    )
    assert (await ws.receive_json())["result"]["running"] == []
    await ws.send_json_auto_id(
        {"type": "ollama_suite/show", "entry_id": entry.entry_id, "model": "x"}
    )
    assert (await ws.receive_json())["result"]["name"] == "x"


async def test_unknown_server_and_errors(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """Unknown servers and server errors give plain codes."""
    client = _client()
    client.list = AsyncMock(side_effect=TimeoutError())
    entry = await _loaded_entry(hass, client)
    ws = await hass_ws_client(hass)
    await ws.send_json_auto_id({"type": "ollama_suite/models", "entry_id": "nope"})
    assert (await ws.receive_json())["error"]["code"] == "not_found"
    await ws.send_json_auto_id(
        {"type": "ollama_suite/models", "entry_id": entry.entry_id}
    )
    assert (await ws.receive_json())["error"]["code"] == "timeout"


async def test_admin_only(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    hass_admin_user: MagicMock,
) -> None:
    """A user who is not an administrator is refused."""
    await _loaded_entry(hass, _client())
    hass_admin_user.groups = []
    ws = await hass_ws_client(hass)
    await ws.send_json_auto_id({"type": "ollama_suite/servers"})
    assert (await ws.receive_json())["error"]["code"] == "unauthorized"


async def test_version_unknown_when_library_lacks_the_call(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """A missing or failing version call leaves the server reachable."""
    client = _client()
    client._request_raw = AsyncMock(side_effect=AttributeError())
    await _loaded_entry(hass, client)
    ws = await hass_ws_client(hass)
    await ws.send_json_auto_id({"type": "ollama_suite/servers"})
    result = (await ws.receive_json())["result"]["servers"][0]
    assert result["reachable"] is True
    assert result["version"] is None


async def test_entry_without_client_is_not_loaded(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """A loaded entry that holds no client answers not_loaded."""
    entry = await _loaded_entry(hass, _client())
    del entry.runtime_data
    ws = await hass_ws_client(hass)
    await ws.send_json_auto_id(
        {"type": "ollama_suite/models", "entry_id": entry.entry_id}
    )
    assert (await ws.receive_json())["error"]["code"] == "not_loaded"


def _stream(items: list[SimpleNamespace], hang: asyncio.Event | None = None):
    async def generate():
        for item in items:
            yield item
        if hang is not None:
            await hang.wait()

    return generate()


async def test_pull_streams_progress(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """A download sends progress events and then done."""
    client = _client()
    client.pull = AsyncMock(
        return_value=_stream(
            [
                SimpleNamespace(status="pulling manifest"),
                SimpleNamespace(
                    status="pulling abc", digest="d", total=10, completed=4
                ),
                SimpleNamespace(status="success"),
            ]
        )
    )
    entry = await _loaded_entry(hass, client)
    ws = await hass_ws_client(hass)
    await ws.send_json_auto_id(
        {
            "type": "ollama_suite/pull",
            "entry_id": entry.entry_id,
            "model": "llama3.2:3b",
        }
    )
    assert (await ws.receive_json())["success"] is True
    events = []
    while True:
        event = (await ws.receive_json())["event"]
        events.append(event)
        if event["state"] in ("done", "error"):
            break
    assert events[0]["status"] == "pulling manifest"
    assert events[1]["total"] == 10
    assert events[1]["completed"] == 4
    assert events[-1] == {"state": "done"}
    client.pull.assert_awaited_once_with("llama3.2:3b", stream=True)


async def test_pull_rejects_bad_name(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """A name that is not a library model never reaches the server."""
    client = _client()
    client.pull = AsyncMock()
    entry = await _loaded_entry(hass, client)
    ws = await hass_ws_client(hass)
    await ws.send_json_auto_id(
        {"type": "ollama_suite/pull", "entry_id": entry.entry_id, "model": "hf.co/a/b"}
    )
    assert (await ws.receive_json())["error"]["code"] == "bad_request"
    client.pull.assert_not_called()


async def test_pull_one_at_a_time_and_cancel(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """A second download is refused, and unsubscribing frees the server."""
    hang = asyncio.Event()
    client = _client()
    client.pull = AsyncMock(
        side_effect=lambda *args, **kwargs: _stream(
            [SimpleNamespace(status="pulling abc", total=10, completed=1)], hang
        )
    )
    entry = await _loaded_entry(hass, client)
    ws = await hass_ws_client(hass)
    await ws.send_json_auto_id(
        {"type": "ollama_suite/pull", "entry_id": entry.entry_id, "model": "a"}
    )
    first_id = (await ws.receive_json())["id"]
    await ws.receive_json()
    await ws.send_json_auto_id(
        {"type": "ollama_suite/pull", "entry_id": entry.entry_id, "model": "b"}
    )
    assert (await ws.receive_json())["error"]["code"] == "busy"
    await ws.send_json_auto_id({"type": "unsubscribe_events", "subscription": first_id})
    assert (await ws.receive_json())["success"] is True
    await hass.async_block_till_done()
    await ws.send_json_auto_id(
        {"type": "ollama_suite/pull", "entry_id": entry.entry_id, "model": "b"}
    )
    assert (await ws.receive_json())["success"] is True


async def test_pull_error_is_a_plain_code(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """A failing download ends with an error event and a plain code."""
    client = _client()
    client.pull = AsyncMock(side_effect=ConnectionError())
    entry = await _loaded_entry(hass, client)
    ws = await hass_ws_client(hass)
    await ws.send_json_auto_id(
        {"type": "ollama_suite/pull", "entry_id": entry.entry_id, "model": "a"}
    )
    assert (await ws.receive_json())["success"] is True
    event = (await ws.receive_json())["event"]
    assert event == {"state": "error", "code": "cannot_connect"}


async def test_delete_checks_the_list(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """Only a listed model is removed, and its size is reported."""
    client = _client()
    entry = await _loaded_entry(hass, client)
    ws = await hass_ws_client(hass)
    await ws.send_json_auto_id(
        {"type": "ollama_suite/delete", "entry_id": entry.entry_id, "model": "other"}
    )
    assert (await ws.receive_json())["error"]["code"] == "not_found"
    client.delete.assert_not_called()
    await ws.send_json_auto_id(
        {
            "type": "ollama_suite/delete",
            "entry_id": entry.entry_id,
            "model": "llama3.2:3b",
        }
    )
    assert (await ws.receive_json())["result"] == {
        "model": "llama3.2:3b",
        "freed": 1,
    }
    client.delete.assert_awaited_once_with("llama3.2:3b")


async def test_unload_needs_a_loaded_model(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """Unloading asks for a keep-alive of zero, for a loaded model only."""
    client = _client()
    client.ps = AsyncMock(
        return_value=SimpleNamespace(models=[SimpleNamespace(model="a:1", size=1)])
    )
    entry = await _loaded_entry(hass, client)
    ws = await hass_ws_client(hass)
    await ws.send_json_auto_id(
        {"type": "ollama_suite/unload", "entry_id": entry.entry_id, "model": "b:1"}
    )
    assert (await ws.receive_json())["error"]["code"] == "not_found"
    await ws.send_json_auto_id(
        {"type": "ollama_suite/unload", "entry_id": entry.entry_id, "model": "a:1"}
    )
    assert (await ws.receive_json())["success"] is True
    client.generate.assert_awaited_once_with(model="a:1", keep_alive=0)
