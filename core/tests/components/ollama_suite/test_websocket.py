"""Tests for the WebSocket commands of the Ollama suite."""

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
    client._request_raw = AsyncMock(side_effect=ConnectionError())
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
