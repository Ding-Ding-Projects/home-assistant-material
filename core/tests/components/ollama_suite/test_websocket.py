"""Tests for the WebSocket commands of the Ollama suite."""

import asyncio
from collections.abc import AsyncIterator
from types import MappingProxyType, SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from pytest_homeassistant.common import MockConfigEntry

from homeassistant.config_entries import ConfigEntryState, ConfigSubentry
from homeassistant.const import CONF_URL
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component

from pytest_homeassistant.typing import WebSocketGenerator


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
        return_value=SimpleNamespace(
            content=b'{"version": "0.12.6"}', json=lambda: {"version": "0.12.6"}
        )
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


async def test_pull_that_ends_without_success_is_incomplete(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """A stream that stops early is an error, never done."""
    client = _client()
    client.pull = AsyncMock(
        return_value=_stream([SimpleNamespace(status="pulling abc", total=9)])
    )
    entry = await _loaded_entry(hass, client)
    ws = await hass_ws_client(hass)
    await ws.send_json_auto_id(
        {"type": "ollama_suite/pull", "entry_id": entry.entry_id, "model": "a"}
    )
    assert (await ws.receive_json())["success"] is True
    assert (await ws.receive_json())["event"]["state"] == "progress"
    assert (await ws.receive_json())["event"] == {
        "state": "error",
        "code": "incomplete",
    }


async def test_start_right_after_cancel_is_not_busy(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """A new download waits for the cancelled one to let go of the server."""
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
    await ws.send_json_auto_id({"type": "unsubscribe_events", "subscription": first_id})
    await ws.send_json_auto_id(
        {"type": "ollama_suite/pull", "entry_id": entry.entry_id, "model": "b"}
    )
    replies = [await ws.receive_json(), await ws.receive_json()]
    assert all(reply["success"] for reply in replies)


async def test_verifying_gets_the_longer_timeout(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """A pause while the server checks its files does not stop the download."""

    async def slow() -> AsyncIterator[SimpleNamespace]:
        yield SimpleNamespace(status="verifying sha256 digest")
        await asyncio.sleep(0.3)
        yield SimpleNamespace(status="success")

    client = _client()
    client.pull = AsyncMock(return_value=slow())
    entry = await _loaded_entry(hass, client)
    ws = await hass_ws_client(hass)
    with (
        patch("homeassistant.components.ollama_suite.websocket.PULL_IDLE_TIMEOUT", 0.1),
        patch("homeassistant.components.ollama_suite.websocket.PULL_VERIFY_TIMEOUT", 5),
    ):
        await ws.send_json_auto_id(
            {"type": "ollama_suite/pull", "entry_id": entry.entry_id, "model": "a"}
        )
        assert (await ws.receive_json())["success"] is True
        events = []
        while True:
            event = (await ws.receive_json())["event"]
            events.append(event)
            if event["state"] in ("done", "error"):
                break
    assert events[-1] == {"state": "done"}


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


def _chat_stream(
    texts: list[str],
    hang: asyncio.Event | None = None,
    final: SimpleNamespace | None = None,
):
    async def generate():
        for text in texts:
            yield SimpleNamespace(message=SimpleNamespace(content=text), done=False)
        if hang is not None:
            await hang.wait()
        if final is not None:
            yield final

    return generate()


def _chat_final(**extra: int) -> SimpleNamespace:
    return SimpleNamespace(message=SimpleNamespace(content=""), done=True, **extra)


async def _collect(ws) -> list[dict]:
    events = []
    while True:
        event = (await ws.receive_json())["event"]
        events.append(event)
        if event["state"] in ("done", "error"):
            return events


async def test_chat_streams_reply_after_the_result(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """The result comes first, then the text, then done with a real speed."""
    client = _client()
    client.chat = AsyncMock(
        return_value=_chat_stream(
            ["Hel", "lo"],
            final=_chat_final(eval_count=20, eval_duration=2_000_000_000),
        )
    )
    entry = await _loaded_entry(hass, client)
    ws = await hass_ws_client(hass)
    await ws.send_json_auto_id(
        {
            "type": "ollama_suite/chat",
            "entry_id": entry.entry_id,
            "model": "llama3.2:3b",
            "prompt": "hi",
        }
    )
    first = await ws.receive_json()
    assert first["type"] == "result"
    assert first["success"] is True
    events = await _collect(ws)
    assert "".join(e["text"] for e in events if e["state"] == "text") == "Hello"
    assert events[-1] == {
        "state": "done",
        "truncated": False,
        "tokens": 20,
        "tokens_per_second": 10.0,
    }
    client.chat.assert_awaited_once_with(
        model="llama3.2:3b",
        messages=[{"role": "user", "content": "hi"}],
        stream=True,
    )


async def test_chat_speed_unknown_without_counts(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """No speed is shown when the server gave no counts."""
    client = _client()
    client.chat = AsyncMock(return_value=_chat_stream(["a"], final=_chat_final()))
    entry = await _loaded_entry(hass, client)
    ws = await hass_ws_client(hass)
    await ws.send_json_auto_id(
        {
            "type": "ollama_suite/chat",
            "entry_id": entry.entry_id,
            "model": "m",
            "prompt": "hi",
        }
    )
    assert (await ws.receive_json())["success"] is True
    assert (await _collect(ws))[-1]["tokens_per_second"] is None


async def test_chat_cancel_releases_the_slot(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """A second chat is busy, and unsubscribing frees the connection."""
    hang = asyncio.Event()
    client = _client()
    client.chat = AsyncMock(
        side_effect=lambda *args, **kwargs: _chat_stream(["a"], hang)
    )
    entry = await _loaded_entry(hass, client)
    ws = await hass_ws_client(hass)
    request = {
        "type": "ollama_suite/chat",
        "entry_id": entry.entry_id,
        "model": "m",
        "prompt": "hi",
    }
    await ws.send_json_auto_id(request)
    first_id = (await ws.receive_json())["id"]
    await ws.receive_json()
    await ws.send_json_auto_id(request)
    assert (await ws.receive_json())["error"]["code"] == "busy"
    await ws.send_json_auto_id({"type": "unsubscribe_events", "subscription": first_id})
    assert (await ws.receive_json())["success"] is True
    await hass.async_block_till_done()
    await ws.send_json_auto_id(request)
    assert (await ws.receive_json())["success"] is True


async def test_chat_refuses_oversize_and_blank_prompts(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """A prompt that is too long or blank never reaches the server."""
    client = _client()
    client.chat = AsyncMock()
    entry = await _loaded_entry(hass, client)
    ws = await hass_ws_client(hass)
    for prompt in ("x" * 4001, "   "):
        await ws.send_json_auto_id(
            {
                "type": "ollama_suite/chat",
                "entry_id": entry.entry_id,
                "model": "m",
                "prompt": prompt,
            }
        )
        assert (await ws.receive_json())["success"] is False
    client.chat.assert_not_called()


async def test_chat_reply_is_bounded(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """A reply longer than the limit is cut and marked as cut."""
    client = _client()
    client.chat = AsyncMock(return_value=_chat_stream(["abcdef", "ghij"]))
    entry = await _loaded_entry(hass, client)
    ws = await hass_ws_client(hass)
    with patch("homeassistant.components.ollama_suite.websocket.CHAT_MAX_REPLY", 8):
        await ws.send_json_auto_id(
            {
                "type": "ollama_suite/chat",
                "entry_id": entry.entry_id,
                "model": "m",
                "prompt": "hi",
            }
        )
        assert (await ws.receive_json())["success"] is True
        events = await _collect(ws)
    assert "".join(e["text"] for e in events if e["state"] == "text") == "abcdefgh"
    assert events[-1]["state"] == "done"
    assert events[-1]["truncated"] is True


async def test_chat_error_and_incomplete_are_plain_codes(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """A failing or cut-short reply ends with an error code."""
    client = _client()
    client.chat = AsyncMock(side_effect=ConnectionError())
    entry = await _loaded_entry(hass, client)
    ws = await hass_ws_client(hass)
    request = {
        "type": "ollama_suite/chat",
        "entry_id": entry.entry_id,
        "model": "m",
        "prompt": "hi",
    }
    await ws.send_json_auto_id(request)
    assert (await ws.receive_json())["success"] is True
    assert (await _collect(ws))[-1] == {"state": "error", "code": "cannot_connect"}
    client.chat = AsyncMock(return_value=_chat_stream(["a"]))
    await ws.send_json_auto_id(request)
    assert (await ws.receive_json())["success"] is True
    assert (await _collect(ws))[-1] == {"state": "error", "code": "incomplete"}


async def test_chat_and_used_by_are_admin_only(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    hass_admin_user: MagicMock,
) -> None:
    """A user who is not an administrator is refused."""
    client = _client()
    client.chat = AsyncMock()
    entry = await _loaded_entry(hass, client)
    hass_admin_user.groups = []
    ws = await hass_ws_client(hass)
    await ws.send_json_auto_id(
        {
            "type": "ollama_suite/chat",
            "entry_id": entry.entry_id,
            "model": "m",
            "prompt": "hi",
        }
    )
    assert (await ws.receive_json())["error"]["code"] == "unauthorized"
    await ws.send_json_auto_id(
        {"type": "ollama_suite/used_by", "entry_id": entry.entry_id, "model": "m"}
    )
    assert (await ws.receive_json())["error"]["code"] == "unauthorized"
    client.chat.assert_not_called()


async def test_used_by_lists_matching_subentries(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """Only the agents and tasks set to the model are listed."""
    entry = await _loaded_entry(hass, _client())
    for title, model, kind in (
        ("Assist", "a:1", "conversation"),
        ("Tasks", "a:1", "ai_task_data"),
        ("Other", "b:1", "conversation"),
    ):
        hass.config_entries.async_add_subentry(
            entry,
            ConfigSubentry(
                data=MappingProxyType({"model": model}),
                subentry_type=kind,
                title=title,
                unique_id=None,
            ),
        )
    ws = await hass_ws_client(hass)
    await ws.send_json_auto_id(
        {"type": "ollama_suite/used_by", "entry_id": entry.entry_id, "model": "a:1"}
    )
    users = (await ws.receive_json())["result"]["users"]
    assert sorted((u["title"], u["type"]) for u in users) == [
        ("Assist", "conversation"),
        ("Tasks", "ai_task_data"),
    ]
    await ws.send_json_auto_id(
        {"type": "ollama_suite/used_by", "entry_id": "nope", "model": "a:1"}
    )
    assert (await ws.receive_json())["error"]["code"] == "not_found"
