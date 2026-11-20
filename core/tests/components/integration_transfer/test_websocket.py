"""Tests for the integration export and import commands."""

import json
from typing import Any
from unittest.mock import AsyncMock

import pytest
from pytest_homeassistant.common import MockConfigEntry, MockModule, mock_integration
from pytest_homeassistant.typing import WebSocketGenerator

from homeassistant.components.integration_transfer.const import (
    LIST_KIND,
    MAX_FILE_BYTES,
    SETTINGS_KIND,
)
from homeassistant.components.registry_storage import crypto
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr, entity_registry as er
from homeassistant.setup import async_setup_component

DOMAIN = "integration_transfer"
TEST_DOMAIN = "test"
PASSWORD = "obsidian marmalade tundra gazebo nutmeg"
SECRET_VALUES = ("pw-value", "token-value", "user-value")

DATA = {
    "host": "broker.local",
    "password": "pw-value",
    "username": "user-value",
    "broker": {"port": 1883, "token": "token-value"},
}
OPTIONS = {"discovery": True, "keep_alive": 60}


@pytest.fixture(autouse=True)
def fast_lock(monkeypatch: pytest.MonkeyPatch) -> None:
    """Make the key derivation fast for tests."""
    monkeypatch.setattr(crypto, "KDF_MEMORY_KIB", crypto.KDF_MIN_MEMORY_KIB)
    monkeypatch.setattr(crypto, "KDF_ITERATIONS", crypto.KDF_MIN_ITERATIONS)
    monkeypatch.setattr(crypto, "KDF_LANES", 1)


async def _setup(
    hass: HomeAssistant, setup_entry: AsyncMock | None = None
) -> MockConfigEntry:
    """Set up the commands and one loaded entry of the test integration."""
    mock_integration(
        hass,
        MockModule(
            TEST_DOMAIN,
            async_setup_entry=setup_entry or AsyncMock(return_value=True),
            async_unload_entry=AsyncMock(return_value=True),
        ),
    )
    entry = MockConfigEntry(
        domain=TEST_DOMAIN,
        title="Kitchen hub",
        unique_id="unique-1",
        data=DATA,
        options=OPTIONS,
    )
    entry.add_to_hass(hass)
    assert await async_setup_component(hass, DOMAIN, {})
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


def _no_secrets(value: Any) -> None:
    text = json.dumps(value)
    for secret in SECRET_VALUES:
        assert secret not in text


async def test_list_holds_no_secrets(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """The list names integrations and kinds of entity, never settings or ids."""
    entry = await _setup(hass)
    device = dr.async_get(hass).async_get_or_create(
        config_entry_id=entry.entry_id, identifiers={(TEST_DOMAIN, "device-1")}
    )
    er.async_get(hass).async_get_or_create(
        "light", TEST_DOMAIN, "light-1", config_entry=entry, device_id=device.id
    )
    er.async_get(hass).async_get_or_create(
        "sensor", TEST_DOMAIN, "sensor-1", config_entry=entry
    )
    client = await hass_ws_client(hass)

    await client.send_json_auto_id({"type": "integration_transfer/list"})
    msg = await client.receive_json()

    assert msg["success"]
    result = msg["result"]
    assert result["kind"] == LIST_KIND
    assert result["format"] == 1
    assert result["names_included"] is False
    row = next(r for r in result["integrations"] if r["domain"] == TEST_DOMAIN)
    assert row["entries"] == 1
    assert row["source"] == "built_in"
    assert row["entity_kinds"] == ["light", "sensor"]
    assert row["entity_counts"] == {"light": 1, "sensor": 1}
    assert row["devices"] == 1
    assert "titles" not in row
    text = json.dumps(result)
    _no_secrets(result)
    for private in ("broker.local", "unique-1", "light-1", "sensor-1", "Kitchen hub"):
        assert private not in text
    assert entry.entry_id not in text


async def test_list_titles_and_no_counts(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """Names the owner gave are added only when asked; counts can be left out."""
    await _setup(hass)
    client = await hass_ws_client(hass)

    await client.send_json_auto_id(
        {"type": "integration_transfer/list", "titles": True, "counts": False}
    )
    msg = await client.receive_json()

    row = next(r for r in msg["result"]["integrations"] if r["domain"] == TEST_DOMAIN)
    assert row["titles"] == ["Kitchen hub"]
    assert "entity_counts" not in row
    assert "devices" not in row


@pytest.mark.parametrize(
    "command",
    [
        {"type": "integration_transfer/list"},
        {"type": "integration_transfer/compare", "domains": ["test"]},
        {"type": "integration_transfer/settings/export", "entry_id": "x"},
        {"type": "integration_transfer/settings/undo", "entry_id": "x"},
    ],
)
async def test_admin_only(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    hass_read_only_access_token: str,
    command: dict[str, Any],
) -> None:
    """Every command is refused for a user who is not an admin."""
    await _setup(hass)
    client = await hass_ws_client(hass, hass_read_only_access_token)

    await client.send_json_auto_id(command)
    msg = await client.receive_json()

    assert not msg["success"]
    assert msg["error"]["code"] == "unauthorized"


async def test_compare(hass: HomeAssistant, hass_ws_client: WebSocketGenerator) -> None:
    """Known, installed, unknown and unsafe names are reported without lookups of unsafe ones."""
    await _setup(hass)
    client = await hass_ws_client(hass)

    await client.send_json_auto_id(
        {
            "type": "integration_transfer/compare",
            "domains": ["test", "not_a_real_domain_xyz", "../etc"],
        }
    )
    msg = await client.receive_json()

    domains = msg["result"]["domains"]
    assert domains["test"]["known"] is True
    assert domains["test"]["entries"] == 1
    assert domains["not_a_real_domain_xyz"]["known"] is False
    assert domains["../etc"]["known"] is False


async def test_export_without_signins(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """The plain export leaves every sign-in out and lists only their names."""
    entry = await _setup(hass)
    client = await hass_ws_client(hass)

    await client.send_json_auto_id(
        {"type": "integration_transfer/settings/export", "entry_id": entry.entry_id}
    )
    msg = await client.receive_json()

    result = msg["result"]
    assert result["kind"] == SETTINGS_KIND
    assert result["signins_included"] is False
    assert result["left_out"] == ["broker.token", "password", "username"]
    assert result["data"] == {"host": "broker.local", "broker": {"port": 1883}}
    assert result["options"] == OPTIONS
    _no_secrets(result)


async def _export_locked(
    hass: HomeAssistant, client: Any, entry: MockConfigEntry, **extra: Any
) -> dict[str, Any]:
    await client.send_json_auto_id(
        {
            "type": "integration_transfer/settings/export_locked",
            "entry_id": entry.entry_id,
            "password": PASSWORD,
            "password_confirm": PASSWORD,
            "confirmed": True,
        }
        | extra
    )
    return await client.receive_json()


@pytest.mark.parametrize(
    ("extra", "code"),
    [
        ({"confirmed": False}, "confirmation_required"),
        ({"password": "short", "password_confirm": "short"}, "password_too_weak"),
        ({"password_confirm": PASSWORD + "x"}, "password_mismatch"),
    ],
)
async def test_export_locked_refusals(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    extra: dict[str, Any],
    code: str,
) -> None:
    """The locked export needs the confirmation and a strong password typed twice."""
    entry = await _setup(hass)
    client = await hass_ws_client(hass)

    msg = await _export_locked(hass, client, entry, **extra)

    assert not msg["success"]
    assert msg["error"]["code"] == code
    assert PASSWORD not in json.dumps(msg)


async def test_locked_round_trip(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """A locked file carries the sign-ins only encrypted, and opens with the password."""
    entry = await _setup(hass)
    client = await hass_ws_client(hass)

    msg = await _export_locked(hass, client, entry)
    locked = msg["result"]
    assert locked["locked"] is True
    assert locked["domain"] == TEST_DOMAIN
    _no_secrets(locked)
    assert PASSWORD not in json.dumps(locked)
    assert "options" not in locked
    assert "data" not in locked

    hass.config_entries.async_update_entry(
        entry, data={**DATA, "password": "changed-here"}
    )
    await client.send_json_auto_id(
        {
            "type": "integration_transfer/settings/preview",
            "entry_id": entry.entry_id,
            "content": json.dumps(locked),
            "password": PASSWORD,
        }
    )
    preview = await client.receive_json()
    assert preview["success"]
    assert {
        "part": "setting",
        "name": "password",
        "signin": True,
        "change": "changed",
    } in preview["result"]["changes"]
    assert "changed-here" not in json.dumps(preview)
    _no_secrets(preview)

    await client.send_json_auto_id(
        {
            "type": "integration_transfer/settings/preview",
            "entry_id": entry.entry_id,
            "content": json.dumps(locked),
            "password": "a different long password 99",
        }
    )
    wrong = await client.receive_json()
    assert wrong["error"]["code"] == "wrong_password"

    await client.send_json_auto_id(
        {
            "type": "integration_transfer/settings/preview",
            "entry_id": entry.entry_id,
            "content": json.dumps(locked),
        }
    )
    missing = await client.receive_json()
    assert missing["error"]["code"] == "password_required"


def _plain_file(**changes: Any) -> str:
    return json.dumps(
        {
            "kind": SETTINGS_KIND,
            "format": 1,
            "domain": TEST_DOMAIN,
            "entry_version": 1,
            "entry_minor_version": 1,
            "signins_included": False,
            "options": {"discovery": False, "keep_alive": 30},
            "data": {"host": "broker.local", "broker": {"port": 1883}},
        }
        | changes
    )


async def test_preview_names_changes_and_keeps_signins(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """The preview shows old and new for settings and only names for sign-ins."""
    entry = await _setup(hass)
    client = await hass_ws_client(hass)

    await client.send_json_auto_id(
        {
            "type": "integration_transfer/settings/preview",
            "entry_id": entry.entry_id,
            "content": _plain_file(),
        }
    )
    msg = await client.receive_json()

    changes = msg["result"]["changes"]
    assert {
        "part": "option",
        "name": "discovery",
        "signin": False,
        "change": "changed",
        "old": True,
        "new": False,
    } in changes
    assert {
        "part": "option",
        "name": "keep_alive",
        "signin": False,
        "change": "changed",
        "old": 60,
        "new": 30,
    } in changes
    kept = {c["name"] for c in changes if c["change"] == "kept"}
    assert kept == {"password", "username", "broker.token"}
    _no_secrets(msg)
    assert entry.options == OPTIONS


@pytest.mark.parametrize(
    ("content", "code"),
    [
        ("not json", "not_json"),
        (json.dumps({"kind": "something-else", "format": 1}), "wrong_kind"),
        (_plain_file(format=2), "wrong_kind"),
        (_plain_file(domain="other"), "wrong_domain"),
        (_plain_file(entry_version=2), "wrong_version"),
        (_plain_file(options=["not", "a", "mapping"]), "wrong_shape"),
        (_plain_file(locked=True), "password_required"),
    ],
)
async def test_preview_refusals(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    content: str,
    code: str,
) -> None:
    """A file of another kind, integration, version or shape is refused whole."""
    entry = await _setup(hass)
    client = await hass_ws_client(hass)

    await client.send_json_auto_id(
        {
            "type": "integration_transfer/settings/preview",
            "entry_id": entry.entry_id,
            "content": content,
        }
    )
    msg = await client.receive_json()

    assert not msg["success"]
    assert msg["error"]["code"] == code


async def test_oversize_file_refused(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """A file over the size limit is refused before it is read."""
    entry = await _setup(hass)
    client = await hass_ws_client(hass)

    await client.send_json_auto_id(
        {
            "type": "integration_transfer/settings/preview",
            "entry_id": entry.entry_id,
            "content": "x" * (MAX_FILE_BYTES + 1),
        }
    )
    msg = await client.receive_json()

    assert not msg["success"]
    assert msg["error"]["code"] == "invalid_format"


async def test_apply_and_undo(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """Applying needs the confirmation, keeps sign-ins here and can be undone."""
    entry = await _setup(hass)
    client = await hass_ws_client(hass)
    command = {
        "type": "integration_transfer/settings/apply",
        "entry_id": entry.entry_id,
        "content": _plain_file(),
    }

    await client.send_json_auto_id(command)
    refused = await client.receive_json()
    assert refused["error"]["code"] == "confirmation_required"
    assert entry.options == OPTIONS

    await client.send_json_auto_id(command | {"confirmed": True})
    applied = await client.receive_json()
    assert applied["success"]
    assert applied["result"]["changed"] == 2
    assert applied["result"]["undo"]["available"] is True
    assert entry.options == {"discovery": False, "keep_alive": 30}
    assert entry.data == DATA
    assert entry.state is ConfigEntryState.LOADED
    _no_secrets(applied)

    await client.send_json_auto_id(
        {"type": "integration_transfer/settings/undo", "entry_id": entry.entry_id}
    )
    undone = await client.receive_json()
    assert undone["success"]
    assert undone["result"]["undo"]["available"] is False
    assert entry.options == OPTIONS
    assert entry.data == DATA


async def test_apply_rolls_back_when_reload_fails(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """When the integration refuses the new settings, nothing is changed."""
    setup_entry = AsyncMock(side_effect=[True, False, True])
    entry = await _setup(hass, setup_entry)
    client = await hass_ws_client(hass)

    await client.send_json_auto_id(
        {
            "type": "integration_transfer/settings/apply",
            "entry_id": entry.entry_id,
            "content": _plain_file(),
            "confirmed": True,
        }
    )
    msg = await client.receive_json()

    assert not msg["success"]
    assert msg["error"]["code"] == "reload_failed"
    assert entry.options == OPTIONS
    assert entry.data == DATA
    assert entry.state is ConfigEntryState.LOADED

    await client.send_json_auto_id(
        {"type": "integration_transfer/settings/undo_info", "entry_id": entry.entry_id}
    )
    info = await client.receive_json()
    assert info["result"]["available"] is False


async def test_undo_without_import(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """Undo is refused when nothing was imported."""
    entry = await _setup(hass)
    client = await hass_ws_client(hass)

    await client.send_json_auto_id(
        {"type": "integration_transfer/settings/undo", "entry_id": entry.entry_id}
    )
    msg = await client.receive_json()

    assert msg["error"]["code"] == "nothing_to_undo"
