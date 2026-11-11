"""Tests of the websocket commands: the admin rule, host trust and safe changes."""

from typing import Any
from unittest.mock import patch

import pytest

from homeassistant.components.minecraft_manager import (
    operations,
    websocket,
    websocket_hosts,
)
from homeassistant.components.minecraft_manager.manager import DATA_MANAGER
from homeassistant.components.minecraft_manager.ssh import HostKeyInfo, SshError
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component

from pytest_homeassistant.typing import WebSocketGenerator

VALID: dict[str, Any] = {
    "name": "Family survival",
    "edition": "java",
    "flavour": "paper",
    "version": "1.21.4",
    "port": 25565,
    "memory_mb": 2048,
    "target": "ssh_docker",
}
HOST_INPUT: dict[str, Any] = {
    "name": "Garage",
    "address": "192.168.1.20",
    "port": 22,
    "user": "docker",
}
ALL_COMMANDS: dict[str, dict[str, Any]] = {
    "targets": {},
    "list": {},
    "create": {"server": VALID},
    "update": {"server_id": "x", "server": VALID},
    "delete": {"server_id": "x"},
    "set_eula": {"server_id": "x", "accepted": True},
    "status": {"server_id": "x"},
    "start": {"server_id": "x"},
    "stop": {"server_id": "x"},
    "restart": {"server_id": "x"},
    "logs": {"server_id": "x"},
    "remove_container": {"server_id": "x"},
    "delete_data": {"server_id": "x", "confirm_name": "x"},
    "hosts/list": {},
    "hosts/create": {"host": HOST_INPUT},
    "hosts/update": {"host_id": "x", "host": HOST_INPUT},
    "hosts/delete": {"host_id": "x"},
    "hosts/probe": {"host_id": "x"},
    "hosts/trust": {"host_id": "x", "fingerprint": "SHA256:x"},
    "hosts/test": {"host_id": "x"},
    "versions/list": {},
    "versions/refresh": {},
}
KEY_A = HostKeyInfo("SHA256:aaaa", "ssh-ed25519 AAAAaaaa", "ssh-ed25519")
KEY_B = HostKeyInfo("SHA256:bbbb", "ssh-rsa AAAAbbbb", "ssh-rsa")


def test_every_registered_command_is_in_the_admin_list(hass: HomeAssistant) -> None:
    """The list the admin test walks is the list of registered commands."""
    registered: list[str] = []
    with patch.object(
        websocket.websocket_api,
        "async_register_command",
        side_effect=lambda _hass, handler: registered.append(handler._ws_command),
    ):
        websocket.async_register_commands(hass)
    assert len(ALL_COMMANDS) == 22
    assert sorted(registered) == sorted(f"minecraft_manager/{n}" for n in ALL_COMMANDS)


@pytest.mark.parametrize("command", sorted(ALL_COMMANDS))
async def test_every_command_requires_admin(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    hass_read_only_access_token: str,
    command: str,
) -> None:
    """A person without administrator rights is refused by every command."""
    assert await async_setup_component(hass, "minecraft_manager", {})
    client = await hass_ws_client(hass, hass_read_only_access_token)
    await client.send_json(
        {"id": 1, "type": f"minecraft_manager/{command}", **ALL_COMMANDS[command]}
    )
    response = await client.receive_json()
    assert not response["success"]
    assert response["error"]["code"] == "unauthorized"
    assert hass.data[DATA_MANAGER].servers() == []
    assert hass.data[DATA_MANAGER].hosts.hosts() == []


async def _call(
    client: Any, message_id: int, command: str, **fields: Any
) -> dict[str, Any]:
    await client.send_json(
        {"id": message_id, "type": f"minecraft_manager/{command}", **fields}
    )
    response = await client.receive_json()
    assert response["success"], response
    return response["result"]


async def _make_host(client: Any, message_id: int, **change: Any) -> dict[str, Any]:
    result = await _call(
        client, message_id, "hosts/create", host={**HOST_INPUT, **change}
    )
    assert result["saved"], result
    return result["host"]


async def test_host_trust_flows(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """Probe and trust: new, mismatch, match, a changed key and an explicit replace."""
    assert await async_setup_component(hass, "minecraft_manager", {})
    client = await hass_ws_client(hass)
    host = await _make_host(client, 1)
    stored = hass.data[DATA_MANAGER].hosts
    with patch.object(websocket_hosts, "async_read_host_key") as read:
        read.return_value = KEY_A
        probed = await _call(client, 2, "hosts/probe", host_id=host["id"])
        assert probed["status"] == "new"
        assert probed["algorithm"] == "ssh-ed25519"
        assert probed["key_file_type"] == "ed25519"
        assert probed["trusted_fingerprint"] is None

        mismatch = await _call(
            client, 3, "hosts/trust", host_id=host["id"], fingerprint="SHA256:zzzz"
        )
        assert mismatch == {"ok": False, "code": "fingerprint_mismatch"}
        assert stored.get(host["id"])["host_key"] is None

        trusted = await _call(
            client, 4, "hosts/trust", host_id=host["id"], fingerprint=KEY_A.fingerprint
        )
        assert trusted["ok"]
        assert trusted["host"]["host_key_fingerprint"] == KEY_A.fingerprint

        matched = await _call(client, 5, "hosts/probe", host_id=host["id"])
        assert matched["status"] == "match"

        read.return_value = KEY_B
        changed = await _call(client, 6, "hosts/probe", host_id=host["id"])
        assert changed["status"] == "changed"
        assert changed["trusted_fingerprint"] == KEY_A.fingerprint
        assert changed["key_file_type"] == "rsa"

        refused = await _call(
            client, 7, "hosts/trust", host_id=host["id"], fingerprint=KEY_B.fingerprint
        )
        assert refused == {"ok": False, "code": "host_key_changed"}
        assert stored.get(host["id"])["host_key"]["fingerprint"] == KEY_A.fingerprint

        replaced = await _call(
            client,
            8,
            "hosts/trust",
            host_id=host["id"],
            fingerprint=KEY_B.fingerprint,
            replace=True,
        )
        assert replaced["host"]["host_key_fingerprint"] == KEY_B.fingerprint


async def test_probe_and_trust_report_a_failed_read(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """A host that cannot be reached gives its stable code, never text."""
    assert await async_setup_component(hass, "minecraft_manager", {})
    client = await hass_ws_client(hass)
    host = await _make_host(client, 1)
    with patch.object(
        websocket_hosts, "async_read_host_key", side_effect=SshError("timeout")
    ):
        probed = await _call(client, 2, "hosts/probe", host_id=host["id"])
        trusted = await _call(
            client, 3, "hosts/trust", host_id=host["id"], fingerprint="SHA256:x"
        )
    assert probed == {"ok": False, "code": "timeout"}
    assert trusted == {"ok": False, "code": "timeout"}


@pytest.mark.parametrize(
    "address", ["127.0.0.1", "169.254.169.254", "0.0.0.0", "localhost", "::1"]
)
async def test_hosts_cannot_target_this_machine(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator, address: str
) -> None:
    """Loopback, link-local and unspecified addresses are refused at creation."""
    assert await async_setup_component(hass, "minecraft_manager", {})
    client = await hass_ws_client(hass)
    result = await _call(
        client, 1, "hosts/create", host={**HOST_INPUT, "address": address}
    )
    assert result["saved"] is False
    assert {"field": "address", "code": "address_not_allowed"} in result["errors"]


@pytest.mark.parametrize("command", ["hosts/probe", "hosts/test"])
async def test_stored_loopback_host_is_not_contacted(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator, command: str
) -> None:
    """A host stored before the rule existed is still never contacted."""
    assert await async_setup_component(hass, "minecraft_manager", {})
    client = await hass_ws_client(hass)
    host = await _make_host(client, 1)
    hass.data[DATA_MANAGER].hosts.get(host["id"])["address"] = "127.0.0.1"
    with patch.object(websocket_hosts, "async_read_host_key") as read:
        result = await _call(client, 2, command, host_id=host["id"])
        trusted = await _call(
            client, 3, "hosts/trust", host_id=host["id"], fingerprint="SHA256:x"
        )
    assert result == {"ok": False, "code": "address_not_allowed"}
    assert trusted == {"ok": False, "code": "address_not_allowed"}
    read.assert_not_called()


async def test_host_create_reports_a_key_folder_without_permissions(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """When the key folder cannot be made private, no host is stored."""
    assert await async_setup_component(hass, "minecraft_manager", {})
    client = await hass_ws_client(hass)
    with patch(
        "homeassistant.components.minecraft_manager.hosts._is_owner_only",
        return_value=False,
    ):
        result = await _call(client, 1, "hosts/create", host=HOST_INPUT)
    assert result == {
        "saved": False,
        "errors": [{"field": "host", "code": "key_permissions"}],
    }
    assert hass.data[DATA_MANAGER].hosts.hosts() == []


async def test_delete_data_asks_for_the_name_and_a_used_host_stays(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """The world is only deleted after the name is typed, and a used host stays."""
    assert await async_setup_component(hass, "minecraft_manager", {})
    client = await hass_ws_client(hass)
    host = await _make_host(client, 1)
    created = await _call(client, 2, "create", server={**VALID, "host_id": host["id"]})
    server_id = created["server"]["id"]

    mismatch = await _call(
        client, 3, "delete_data", server_id=server_id, confirm_name="family survival"
    )
    assert mismatch == {"ok": False, "code": "confirmation_mismatch"}

    with patch.object(
        operations, "async_delete_data", return_value={"ok": True}
    ) as delete:
        done = await _call(
            client, 4, "delete_data", server_id=server_id, confirm_name=VALID["name"]
        )
    assert done == {"ok": True}
    delete.assert_awaited_once()

    in_use = await _call(client, 5, "hosts/delete", host_id=host["id"])
    assert in_use == {"ok": False, "code": "host_in_use"}
    with patch.object(operations, "async_container_state", return_value="absent"):
        assert await _call(client, 6, "delete", server_id=server_id) == {"ok": True}
    assert await _call(client, 7, "hosts/delete", host_id=host["id"]) == {"ok": True}


async def test_rename_and_host_change_wait_for_the_container_to_be_gone(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """A container is never orphaned by a new name or a new host."""
    assert await async_setup_component(hass, "minecraft_manager", {})
    client = await hass_ws_client(hass)
    host = await _make_host(client, 1)
    other = await _make_host(client, 2, name="Basement", address="192.168.1.21")
    created = await _call(client, 3, "create", server={**VALID, "host_id": host["id"]})
    server_id = created["server"]["id"]
    base = {**VALID, "host_id": host["id"]}

    with patch.object(operations, "async_container_state") as state:
        state.return_value = "present"
        renamed = await _call(
            client, 4, "update", server_id=server_id, server={**base, "name": "Other"}
        )
        moved = await _call(
            client,
            5,
            "update",
            server_id=server_id,
            server={**base, "host_id": other["id"]},
        )
        memory = await _call(
            client, 6, "update", server_id=server_id, server={**base, "memory_mb": 4096}
        )
        case_only = await _call(
            client,
            7,
            "update",
            server_id=server_id,
            server={**base, "name": "family SURVIVAL"},
        )
        state.return_value = {"ok": False, "code": "timeout"}
        unverified = await _call(
            client, 8, "update", server_id=server_id, server={**base, "name": "Other"}
        )
        state.return_value = "absent"
        allowed = await _call(
            client, 9, "update", server_id=server_id, server={**base, "name": "Other"}
        )

    assert renamed["saved"] is False
    assert renamed["errors"] == [{"field": "name", "code": "container_exists"}]
    assert moved["errors"] == [{"field": "host_id", "code": "container_exists"}]
    assert memory["saved"] is True
    assert case_only["saved"] is True
    assert unverified["errors"] == [{"field": "name", "code": "timeout"}]
    assert allowed["saved"] is True
    assert allowed["server"]["name"] == "Other"


async def test_delete_definition_refuses_a_live_container(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """The definition stays while its container exists; force skips an unreachable host."""
    assert await async_setup_component(hass, "minecraft_manager", {})
    client = await hass_ws_client(hass)
    host = await _make_host(client, 1)
    created = await _call(client, 2, "create", server={**VALID, "host_id": host["id"]})
    server_id = created["server"]["id"]

    with patch.object(operations, "async_container_state") as state:
        state.return_value = "present"
        present = await _call(client, 3, "delete", server_id=server_id)
        forced_present = await _call(
            client, 4, "delete", server_id=server_id, force=True
        )
        state.return_value = {"ok": False, "code": "connect_failed"}
        unverified = await _call(client, 5, "delete", server_id=server_id)
        forced = await _call(client, 6, "delete", server_id=server_id, force=True)

    assert present == {"ok": False, "code": "container_exists"}
    assert forced_present == {"ok": False, "code": "container_exists"}
    assert unverified == {"ok": False, "code": "connect_failed"}
    assert forced == {"ok": True}
    assert hass.data[DATA_MANAGER].servers() == []
