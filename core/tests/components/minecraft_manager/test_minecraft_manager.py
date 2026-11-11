"""Tests for the Minecraft server manager integration."""

from typing import Any
from unittest.mock import patch

import pytest

from homeassistant.components.minecraft_manager import targets
from homeassistant.components.minecraft_manager.validation import validate_server
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component

from tests.typing import WebSocketGenerator

VALID: dict[str, Any] = {
    "name": "Family survival",
    "edition": "java",
    "flavour": "paper",
    "version": "1.21.4",
    "port": 25565,
    "memory_mb": 2048,
    "target": "ssh_docker",
}


def test_valid_definition() -> None:
    """A complete definition has no errors."""
    cleaned, errors = validate_server(VALID)
    assert errors == []
    assert cleaned == VALID


@pytest.mark.parametrize(
    ("change", "field", "code"),
    [
        pytest.param({"name": ""}, "name", "required", id="empty-name"),
        pytest.param({"name": "-bad"}, "name", "invalid_characters", id="bad-name"),
        pytest.param({"name": "x" * 49}, "name", "too_long", id="long-name"),
        pytest.param({"edition": "pocket"}, "edition", "invalid_choice", id="edition"),
        pytest.param({"flavour": "bedrock"}, "flavour", "invalid_choice", id="flavour"),
        pytest.param({"version": "1.21; rm -rf"}, "version", "invalid_version", id="version"),
        pytest.param({"port": 80}, "port", "out_of_range", id="low-port"),
        pytest.param({"port": True}, "port", "out_of_range", id="bool-port"),
        pytest.param({"memory_mb": 64}, "memory_mb", "out_of_range", id="memory"),
        pytest.param({"target": "cloud"}, "target", "invalid_choice", id="target"),
        pytest.param({"extra": 1}, "extra", "unknown_field", id="unknown"),
    ],
)
def test_invalid_definition(change: dict[str, Any], field: str, code: str) -> None:
    """Each rule reports its own field and code."""
    _, errors = validate_server({**VALID, **change})
    assert {"field": field, "code": code} in errors


def test_detect_blocking_order_and_ssh() -> None:
    """The targets keep their order and SSH is always possible."""
    with patch.object(targets.shutil, "which", return_value=None):
        result = targets.detect_blocking(False)
    assert [t.id for t in result] == [
        "ssh_docker",
        "supervisor",
        "docker_socket",
        "local_process",
        "ssh_process",
    ]
    by_id = {t.id: t for t in result}
    assert by_id["ssh_docker"].available
    assert by_id["ssh_process"].available
    assert not by_id["supervisor"].available
    assert by_id["local_process"].reason == "java_missing"


async def test_requires_admin(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    hass_read_only_access_token: str,
) -> None:
    """Only administrators reach the commands."""
    assert await async_setup_component(hass, "minecraft_manager", {})
    client = await hass_ws_client(hass, hass_read_only_access_token)
    await client.send_json({"id": 1, "type": "minecraft_manager/list"})
    response = await client.receive_json()
    assert not response["success"]
    assert response["error"]["code"] == "unauthorized"


async def test_create_update_delete(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """A definition can be created, changed and removed, with conflicts refused."""
    assert await async_setup_component(hass, "minecraft_manager", {})
    client = await hass_ws_client(hass)

    await client.send_json(
        {"id": 1, "type": "minecraft_manager/create", "server": VALID}
    )
    created = (await client.receive_json())["result"]
    assert created["saved"]
    server_id = created["server"]["id"]
    assert created["server"]["state"] == "defined"

    await client.send_json(
        {"id": 2, "type": "minecraft_manager/create", "server": VALID}
    )
    duplicate = (await client.receive_json())["result"]
    assert not duplicate["saved"]
    assert {"field": "name", "code": "duplicate_name"} in duplicate["errors"]
    assert {"field": "port", "code": "port_in_use"} in duplicate["errors"]

    await client.send_json(
        {
            "id": 3,
            "type": "minecraft_manager/update",
            "server_id": server_id,
            "server": {**VALID, "memory_mb": 4096},
        }
    )
    assert (await client.receive_json())["result"]["server"]["memory_mb"] == 4096

    await client.send_json({"id": 4, "type": "minecraft_manager/list"})
    assert len((await client.receive_json())["result"]["servers"]) == 1

    await client.send_json(
        {"id": 5, "type": "minecraft_manager/delete", "server_id": server_id}
    )
    assert (await client.receive_json())["success"]
    await client.send_json(
        {"id": 6, "type": "minecraft_manager/delete", "server_id": server_id}
    )
    assert (await client.receive_json())["error"]["code"] == "not_found"


async def test_targets_command(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """The targets command reports every target."""
    assert await async_setup_component(hass, "minecraft_manager", {})
    client = await hass_ws_client(hass)
    await client.send_json({"id": 1, "type": "minecraft_manager/targets"})
    result = (await client.receive_json())["result"]["targets"]
    assert len(result) == 5
