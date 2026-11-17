"""Tests for the editor drafts commands."""

from pathlib import Path

import pytest
from pytest_homeassistant.common import MockUser
from pytest_homeassistant.typing import WebSocketGenerator

from homeassistant.components.editor_drafts import DATA_REPOSITORY, DOMAIN
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component

CONFIG = {"alias": "Night", "triggers": [], "actions": []}


@pytest.fixture(autouse=True)
async def setup_drafts(hass: HomeAssistant, tmp_path: Path) -> None:
    """Set the integration up with its repository in a temporary config folder."""
    hass.config.config_dir = str(tmp_path)
    assert await async_setup_component(hass, DOMAIN, {})
    await hass.async_block_till_done()


async def test_save_get_history_discard(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """The commands cover a draft's life."""
    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "editor_drafts/save",
            "kind": "automation",
            "item_id": "night",
            "config": CONFIG,
            "base_hash": "abc",
        }
    )
    response = await client.receive_json()
    assert response["success"]
    assert response["result"]["saved"] is True

    await client.send_json_auto_id(
        {"type": "editor_drafts/get", "kind": "automation", "item_id": "night"}
    )
    got = (await client.receive_json())["result"]
    assert got["config"] == CONFIG
    assert got["base_hash"] == "abc"

    await client.send_json_auto_id({"type": "editor_drafts/list"})
    assert [row["item_id"] for row in (await client.receive_json())["result"]] == [
        "night"
    ]

    await client.send_json_auto_id(
        {"type": "editor_drafts/history", "kind": "automation", "item_id": "night"}
    )
    history = (await client.receive_json())["result"]
    assert len(history) == 1

    await client.send_json_auto_id(
        {
            "type": "editor_drafts/restore_version",
            "kind": "automation",
            "item_id": "night",
            "sha": history[0]["sha"],
        }
    )
    assert (await client.receive_json())["result"]["config"] == CONFIG

    await client.send_json_auto_id(
        {"type": "editor_drafts/discard", "kind": "automation", "item_id": "night"}
    )
    assert (await client.receive_json())["result"] is True
    await client.send_json_auto_id(
        {"type": "editor_drafts/get", "kind": "automation", "item_id": "night"}
    )
    assert (await client.receive_json())["result"] is None


async def test_unsafe_id_is_an_error(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """A path-like id is refused with a clear code."""
    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "editor_drafts/save",
            "kind": "automation",
            "item_id": "../x",
            "config": CONFIG,
        }
    )
    response = await client.receive_json()
    assert not response["success"]
    assert response["error"]["code"] == "invalid_format"


@pytest.mark.parametrize(
    "command",
    [
        {
            "type": "editor_drafts/save",
            "kind": "automation",
            "item_id": "a",
            "config": CONFIG,
        },
        {"type": "editor_drafts/get", "kind": "script", "item_id": "a"},
        {"type": "editor_drafts/list"},
        {"type": "editor_drafts/history", "kind": "scene", "item_id": "a"},
        {
            "type": "editor_drafts/restore_version",
            "kind": "scene",
            "item_id": "a",
            "sha": "abcdef1",
        },
        {"type": "editor_drafts/discard", "kind": "scene", "item_id": "a"},
    ],
)
async def test_commands_require_admin(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    hass_admin_user: MockUser,
    command: dict,
) -> None:
    """Every command is for administrators only."""
    hass_admin_user.groups = []
    client = await hass_ws_client(hass)
    await client.send_json_auto_id(command)
    assert (await client.receive_json())["error"]["code"] == "unauthorized"


async def test_live_configuration_files_are_never_written(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """A draft stays in its own folder; the loaded files are untouched."""
    config_dir = Path(hass.config.config_dir)
    for name in ("automations.yaml", "scripts.yaml", "scenes.yaml"):
        (config_dir / name).write_text("[]\n")
    client = await hass_ws_client(hass)
    for kind in ("automation", "script", "scene"):
        await client.send_json_auto_id(
            {
                "type": "editor_drafts/save",
                "kind": kind,
                "item_id": "x",
                "config": CONFIG,
            }
        )
        assert (await client.receive_json())["success"]
    for name in ("automations.yaml", "scripts.yaml", "scenes.yaml"):
        assert (config_dir / name).read_text() == "[]\n"
    repository = hass.data[DATA_REPOSITORY]
    assert repository.root == config_dir / ".cache" / DOMAIN
    assert not (config_dir / "automation").exists()
