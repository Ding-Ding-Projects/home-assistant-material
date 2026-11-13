"""Tests for the wall tablet commands.

These protect the promises the tablets page relies on: a command reaches only
the tablet it names (or every tablet when none is named), a path can never
point outside the interface, and the list of tablets is bounded.
"""

import probatio
import pytest
from pytest_homeassistant.common import async_capture_events
from pytest_homeassistant.typing import WebSocketGenerator

from homeassistant.components.wall_tablet import (
    DOMAIN,
    EVENT_COMMAND,
    MAX_TABLETS,
    TabletRegistry,
    clean_path,
)
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component


@pytest.mark.parametrize("path", ["/lovelace/kitchen", "/config?x=1", "/"])
def test_clean_path_accepts_interface_paths(path: str) -> None:
    """Paths inside the interface are kept."""
    assert clean_path(path) == path


@pytest.mark.parametrize(
    "path", ["https://example.com", "//example.com", "lovelace", "/a\\b", "/a\nb", ""]
)
def test_clean_path_rejects_other_addresses(path: str) -> None:
    """Anything that could leave the interface is refused."""
    with pytest.raises(probatio.Invalid):
        clean_path(path)


def test_registry_orders_and_marks_online() -> None:
    """Recent tablets come first and old ones are marked offline."""
    registry = TabletRegistry()
    registry.announce("old", "Old", "off", now=1000)
    registry.announce("new", "New", "on", now=2000)
    tablets = registry.as_list(now=2010)
    assert [tablet["tablet_id"] for tablet in tablets] == ["new", "old"]
    assert [tablet["online"] for tablet in tablets] == [True, False]


def test_registry_is_bounded() -> None:
    """A full list refuses a new tablet unless the oldest is long silent."""
    registry = TabletRegistry()
    for index in range(MAX_TABLETS):
        assert registry.announce(f"t{index}", "T", "on", now=1000 + index)
    assert not registry.announce("extra", "Extra", "on", now=2000)
    assert registry.announce("extra", "Extra", "on", now=1000 + 3 * 24 * 3600)
    assert len(registry.as_list()) == MAX_TABLETS


async def test_service_fires_command_for_the_named_tablet(
    hass: HomeAssistant,
) -> None:
    """A service call becomes one event naming the tablet."""
    assert await async_setup_component(hass, DOMAIN, {})
    events = async_capture_events(hass, EVENT_COMMAND)
    await hass.services.async_call(
        DOMAIN, "navigate", {"tablet_id": "hall", "path": "/lovelace/home"}, blocking=True
    )
    await hass.async_block_till_done()
    assert [event.data for event in events] == [
        {"command": "navigate", "tablet_id": "hall", "path": "/lovelace/home"}
    ]


async def test_tablet_receives_only_its_commands(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """A subscribed tablet gets commands for it and for everyone, not others."""
    assert await async_setup_component(hass, DOMAIN, {})
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "wall_tablet/subscribe", "tablet_id": "hall"})
    assert (await client.receive_json())["success"]

    for target in ("kitchen", "hall", None):
        data = {"tablet_id": target} if target else {}
        await hass.services.async_call(DOMAIN, "wake", data, blocking=True)
    await hass.async_block_till_done()

    first = await client.receive_json()
    second = await client.receive_json()
    assert first["event"] == {"command": "wake"}
    assert second["event"] == {"command": "wake"}


async def test_announce_and_list(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """An announced tablet shows in the administrator's list."""
    assert await async_setup_component(hass, DOMAIN, {})
    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "wall_tablet/announce",
            "tablet_id": "hall",
            "name": "Hall",
            "screen": "on",
        }
    )
    assert (await client.receive_json())["success"]
    await client.send_json_auto_id({"type": "wall_tablet/list"})
    result = (await client.receive_json())["result"]
    assert [(item["tablet_id"], item["name"], item["online"]) for item in result] == [
        ("hall", "Hall", True)
    ]
