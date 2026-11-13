"""Tests for automatic updates.

These protect the promises the updates page relies on: an update installs by
itself only when automatic updating applies to it, the three updates that
restart the system are never installed, a skipped version is left alone and a
failed install is not tried again for the same version.
"""

from unittest.mock import patch

import pytest
from pytest_homeassistant.typing import WebSocketGenerator

from homeassistant.components.auto_update import (
    DATA_MANAGER,
    DOMAIN,
    PROTECTED_ENTITY_IDS,
    effective_enabled,
)
from homeassistant.components.update import DOMAIN as UPDATE_DOMAIN
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.exceptions import HomeAssistantError
from homeassistant.setup import async_setup_component

INSTALL_AND_BACKUP = 1 | 8


def _set_update(
    hass: HomeAssistant,
    entity_id: str,
    state: str = "on",
    latest: str = "2.0",
    skipped: str | None = None,
) -> None:
    hass.states.async_set(
        entity_id,
        state,
        {
            "installed_version": "1.0",
            "latest_version": latest,
            "skipped_version": skipped,
            "in_progress": False,
            "supported_features": INSTALL_AND_BACKUP,
        },
    )


def _mock_install(hass: HomeAssistant) -> list[ServiceCall]:
    """Record install calls and apply the update like a real entity does."""
    calls: list[ServiceCall] = []

    async def install(call: ServiceCall) -> None:
        calls.append(call)
        _set_update(hass, call.data["entity_id"], state="off")

    hass.services.async_register(UPDATE_DOMAIN, "install", install)
    return calls


@pytest.mark.parametrize(
    ("all_enabled", "overrides", "allowed", "expected"),
    [
        (False, {}, True, False),
        (True, {}, True, True),
        (True, {"update.a": False}, True, False),
        (False, {"update.a": True}, True, True),
        (True, {"update.a": True}, False, False),
    ],
)
def test_effective_enabled(
    all_enabled: bool, overrides: dict[str, bool], allowed: bool, expected: bool
) -> None:
    """The entity's own choice wins and protected updates never apply."""
    assert effective_enabled(all_enabled, overrides, "update.a", allowed) is expected


async def test_installs_only_when_enabled(hass: HomeAssistant) -> None:
    """Nothing installs until automatic updating is switched on."""
    calls = _mock_install(hass)
    assert await async_setup_component(hass, DOMAIN, {})
    _set_update(hass, "update.one")
    await hass.async_block_till_done()
    assert not calls

    hass.data[DATA_MANAGER].async_set_all(True)
    await hass.async_block_till_done()
    assert [call.data["entity_id"] for call in calls] == ["update.one"]
    assert calls[0].data["backup"] is True


async def test_protected_updates_are_never_installed(hass: HomeAssistant) -> None:
    """The system updates keep their manual button."""
    calls = _mock_install(hass)
    assert await async_setup_component(hass, DOMAIN, {})
    hass.data[DATA_MANAGER].async_set_all(True)
    for entity_id in PROTECTED_ENTITY_IDS:
        _set_update(hass, entity_id)
    await hass.async_block_till_done()
    assert not calls


async def test_skipped_version_is_left_alone(hass: HomeAssistant) -> None:
    """A version the person skipped is not installed."""
    calls = _mock_install(hass)
    assert await async_setup_component(hass, DOMAIN, {})
    hass.data[DATA_MANAGER].async_set_all(True)
    _set_update(hass, "update.one", skipped="2.0")
    await hass.async_block_till_done()
    assert not calls


async def test_failure_is_not_retried_for_the_same_version(
    hass: HomeAssistant,
) -> None:
    """A failed install is remembered and reported, then left alone."""
    attempts: list[str] = []

    async def failing(call: ServiceCall) -> None:
        attempts.append(call.data["entity_id"])
        raise HomeAssistantError("disk full")

    hass.services.async_register(UPDATE_DOMAIN, "install", failing)
    assert await async_setup_component(hass, DOMAIN, {})
    manager = hass.data[DATA_MANAGER]
    manager.async_set_all(True)
    _set_update(hass, "update.one")
    await hass.async_block_till_done()
    _set_update(hass, "update.one")
    await hass.async_block_till_done()
    assert attempts == ["update.one"]
    assert manager.results["update.one"]["ok"] is False
    assert "disk full" in manager.results["update.one"]["error"]

    _set_update(hass, "update.one", latest="3.0")
    await hass.async_block_till_done()
    assert len(attempts) == 2


async def test_websocket_refuses_protected_entities(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """A protected update cannot be switched on one by one."""
    assert await async_setup_component(hass, DOMAIN, {})
    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "auto_update/set_entity",
            "entity_id": "update.home_assistant_core_update",
            "enabled": True,
        }
    )
    response = await client.receive_json()
    assert not response["success"]
    assert response["error"]["code"] == "not_allowed"


async def test_unconfirmed_install_is_reported_once(hass: HomeAssistant) -> None:
    """An install that returns but changes nothing counts as failed once."""
    attempts: list[str] = []

    async def silent(call: ServiceCall) -> None:
        attempts.append(call.data["entity_id"])

    hass.services.async_register(UPDATE_DOMAIN, "install", silent)
    assert await async_setup_component(hass, DOMAIN, {})
    manager = hass.data[DATA_MANAGER]
    manager.async_set_all(True)
    with patch("homeassistant.components.auto_update.CONFIRM_WAIT", 0.01):
        _set_update(hass, "update.one")
        await hass.async_block_till_done()
    assert attempts == ["update.one"]
    assert manager.results["update.one"]["ok"] is False
