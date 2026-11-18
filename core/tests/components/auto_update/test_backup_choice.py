"""Tests for the choice of which updates get a backup first."""

from unittest.mock import patch

import pytest
from pytest_homeassistant.typing import WebSocketGenerator

from homeassistant.components.auto_update import (
    DATA_MANAGER,
    DOMAIN,
    SYSTEM_PARTS,
    AutoUpdateManager,
)
from homeassistant.components.auto_update.backup_choice import (
    CHOICE_ALL,
    CHOICE_CUSTOM,
    CHOICE_NONE,
    CHOICE_SYSTEM,
    KINDS,
    SYSTEM_KINDS,
    choice_for,
    classify_kind,
    app_slug,
    preset_apps_later,
    prune_apps,
    settings_from_store,
    preset_kinds,
    wants_backup,
)
from homeassistant.components.update import DOMAIN as UPDATE_DOMAIN
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import entity_registry as er
from homeassistant.setup import async_setup_component

INSTALL = 1
INSTALL_AND_BACKUP = 1 | 8
APP = "update.some_app_update"
FIRMWARE = "update.lamp_firmware"
CORE = SYSTEM_PARTS["core"]
SUPERVISOR = SYSTEM_PARTS["supervisor"]


@pytest.mark.parametrize("kind", KINDS)
@pytest.mark.parametrize(
    ("choice", "system_kinds_only"),
    [(CHOICE_SYSTEM, True), (CHOICE_ALL, False), (CHOICE_NONE, False)],
)
@pytest.mark.parametrize("supports", [True, False])
def test_wants_backup_for_every_kind_and_choice(
    kind: str, choice: str, system_kinds_only: bool, supports: bool
) -> None:
    """A backup is requested only for the chosen kinds that support one."""
    if choice == CHOICE_ALL:
        chosen = True
    elif choice == CHOICE_NONE:
        chosen = False
    else:
        chosen = kind in SYSTEM_KINDS
    assert wants_backup(kind, preset_kinds(choice), supports) is (chosen and supports)


@pytest.mark.parametrize("choice", [CHOICE_SYSTEM, CHOICE_ALL, CHOICE_NONE])
def test_preset_round_trip(choice: str) -> None:
    """Each preset is recognised again from its per-kind values."""
    assert choice_for(preset_kinds(choice), [], preset_apps_later(choice)) == choice


def test_changed_kind_reads_as_custom() -> None:
    """A value that no preset has reads as custom."""
    kinds = {**preset_kinds(CHOICE_SYSTEM), "app": True}
    assert choice_for(kinds) == CHOICE_CUSTOM


@pytest.mark.parametrize(
    ("data", "choice"),
    [
        ({}, CHOICE_ALL),
        ({"backup": True}, CHOICE_ALL),
        ({"backup": False}, CHOICE_NONE),
        ({"backup_kinds": preset_kinds(CHOICE_SYSTEM), "backup": True}, CHOICE_SYSTEM),
        ({"backup_kinds": {"core": "yes"}, "backup": False}, CHOICE_NONE),
    ],
)
def test_store_migration(data: dict, choice: str) -> None:
    """The old single boolean becomes every update or no update."""
    settings = settings_from_store(data)
    assert choice_for(settings["kinds"], settings["apps"], settings["later"]) == choice


@pytest.mark.parametrize(
    ("entity_id", "platform", "unique_id", "device_class", "custom", "kind"),
    [
        (CORE, None, None, None, False, "core"),
        (SUPERVISOR, None, None, None, False, "supervisor"),
        ("update.x", "hassio", "home_assistant_os_update", None, False, "os"),
        ("update.x", "hassio", "home_assistant_host_update", None, False, "os"),
        ("update.x", "hassio", "core_mosquitto_version_latest", None, False, "app"),
        ("update.x", "hacs", "1", None, False, "integration"),
        ("update.x", "custom_thing", "1", None, True, "integration"),
        ("update.x", "esphome", "1", "firmware", False, "device"),
        ("update.x", "custom_thing", "1", "firmware", True, "device"),
        ("update.x", "zha", "1", None, False, "device"),
    ],
)
def test_classify_kind(
    entity_id: str,
    platform: str | None,
    unique_id: str | None,
    device_class: str | None,
    custom: bool,
    kind: str,
) -> None:
    """Update entities fall into the six kinds."""
    assert (
        classify_kind(
            entity_id, SYSTEM_PARTS, platform, unique_id, device_class, custom
        )
        == kind
    )


def _set_update(hass: HomeAssistant, entity_id: str, features: int, **extra) -> None:
    hass.states.async_set(
        entity_id,
        "on",
        {
            "installed_version": "1.0",
            "latest_version": "2.0",
            "skipped_version": None,
            "in_progress": False,
            "supported_features": features,
            **extra,
        },
    )


async def _mock_install(hass: HomeAssistant) -> list[ServiceCall]:
    assert await async_setup_component(hass, UPDATE_DOMAIN, {})
    calls: list[ServiceCall] = []

    async def install(call: ServiceCall) -> None:
        calls.append(call)
        hass.states.async_set(
            call.data["entity_id"],
            "off",
            {
                "installed_version": "2.0",
                "latest_version": "2.0",
                "supported_features": 9,
            },
        )

    hass.services.async_register(UPDATE_DOMAIN, "install", install)
    return calls


@pytest.mark.parametrize(
    ("choice", "app_backup", "firmware_backup"),
    [
        (CHOICE_SYSTEM, False, False),
        (CHOICE_ALL, True, True),
        (CHOICE_NONE, False, False),
    ],
)
async def test_automatic_updates_follow_the_kind(
    hass: HomeAssistant, choice: str, app_backup: bool, firmware_backup: bool
) -> None:
    """Automatic updates of other things request a backup only when their kind says so."""
    calls = await _mock_install(hass)
    assert await async_setup_component(hass, DOMAIN, {})
    manager = hass.data[DATA_MANAGER]
    manager.async_set_backup_choice(choice)
    registry = er.async_get(hass)
    registry.async_get_or_create(
        UPDATE_DOMAIN, "hassio", "addon_1", suggested_object_id="some_app_update"
    )
    registry.async_get_or_create(
        UPDATE_DOMAIN, "esphome", "lamp", suggested_object_id="lamp_firmware"
    )
    _set_update(hass, APP, INSTALL_AND_BACKUP)
    _set_update(hass, FIRMWARE, INSTALL_AND_BACKUP, device_class="firmware")
    manager.async_set_all(True)
    await hass.async_block_till_done()
    by_entity = {call.data["entity_id"]: call.data for call in calls}
    assert by_entity[APP].get("backup", False) is app_backup
    assert by_entity[FIRMWARE].get("backup", False) is firmware_backup


@pytest.mark.parametrize(
    ("choice", "core_backup"),
    [(CHOICE_SYSTEM, True), (CHOICE_ALL, True), (CHOICE_NONE, False)],
)
async def test_system_updates_follow_the_kind(
    hass: HomeAssistant, choice: str, core_backup: bool
) -> None:
    """The automatic system update asks for a backup unless its kind is off."""
    calls = await _mock_install(hass)
    assert await async_setup_component(hass, DOMAIN, {})
    manager = hass.data[DATA_MANAGER]
    manager.async_set_backup_choice(choice)
    _set_update(hass, CORE, INSTALL_AND_BACKUP)
    state = hass.states.get(CORE)
    assert manager.wants_backup(state) is core_backup
    with patch.object(manager, "_async_applied", return_value=True):
        assert await manager._async_install(state)
    assert calls[-1].data.get("backup", False) is core_backup


async def test_websocket_choice_and_kind(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """The choice is set over the socket and reported with its kinds."""
    assert await async_setup_component(hass, DOMAIN, {})
    client = await hass_ws_client(hass)

    await client.send_json_auto_id(
        {"type": "auto_update/set_backup_choice", "choice": "system"}
    )
    assert (await client.receive_json())["success"]
    await client.send_json_auto_id({"type": "auto_update/info"})
    info = (await client.receive_json())["result"]
    assert info["backup_choice"] == CHOICE_SYSTEM
    assert info["backup_kinds"] == preset_kinds(CHOICE_SYSTEM)
    assert info["backup"] is True

    await client.send_json_auto_id(
        {"type": "auto_update/set_backup_kind", "kind": "app", "enabled": True}
    )
    assert (await client.receive_json())["success"]
    await client.send_json_auto_id({"type": "auto_update/info"})
    assert (await client.receive_json())["result"]["backup_choice"] == CHOICE_CUSTOM

    await client.send_json_auto_id({"type": "auto_update/set_backup", "enabled": False})
    assert (await client.receive_json())["success"]
    await client.send_json_auto_id({"type": "auto_update/info"})
    info = (await client.receive_json())["result"]
    assert info["backup_choice"] == CHOICE_NONE
    assert info["backup"] is False

    await client.send_json_auto_id(
        {"type": "auto_update/set_backup_kind", "kind": "nope", "enabled": True}
    )
    assert not (await client.receive_json())["success"]


@pytest.mark.parametrize(
    ("stored", "choice"),
    [
        ({"backup": False}, CHOICE_NONE),
        ({"backup": True}, CHOICE_ALL),
        ({}, CHOICE_ALL),
    ],
)
async def test_old_boolean_is_migrated_on_load(
    hass: HomeAssistant, stored: dict, choice: str
) -> None:
    """Settings stored with the single boolean keep their meaning."""
    manager = AutoUpdateManager(hass)
    with patch.object(manager._store, "async_load", return_value=stored):
        await manager.async_load()
    assert (
        choice_for(manager.backup_kinds, manager.backup_apps, manager.backup_apps_later)
        == choice
    )


@pytest.mark.parametrize(
    ("choice", "apps", "later", "chosen_app", "other_app", "new_app"),
    [
        (CHOICE_SYSTEM, [], False, False, False, False),
        (CHOICE_ALL, [], True, True, True, True),
        (CHOICE_NONE, [], False, False, False, False),
        (CHOICE_CUSTOM, ["a"], False, True, False, False),
        (CHOICE_CUSTOM, ["a"], True, True, False, True),
        (CHOICE_CUSTOM, [], True, False, False, True),
    ],
)
def test_wants_backup_for_chosen_apps(
    choice: str,
    apps: list[str],
    later: bool,
    chosen_app: bool,
    other_app: bool,
    new_app: bool,
) -> None:
    """A chosen app gets its own backup, a new app follows the later choice."""
    kinds = {**preset_kinds(choice if choice != CHOICE_CUSTOM else CHOICE_SYSTEM)}
    seen = ["a", "b"]

    def wants(slug: str, supports: bool = True) -> bool:
        return wants_backup("app", kinds, supports, slug, apps, seen, later)

    assert wants("a") is chosen_app
    assert wants("b") is other_app
    assert wants("c") is new_app
    assert wants("a", supports=False) is False


@pytest.mark.parametrize(
    ("kinds_choice", "apps", "later", "expected"),
    [
        (CHOICE_SYSTEM, [], False, CHOICE_SYSTEM),
        (CHOICE_NONE, [], False, CHOICE_NONE),
        (CHOICE_ALL, [], True, CHOICE_ALL),
        (CHOICE_ALL, [], False, CHOICE_CUSTOM),
        (CHOICE_SYSTEM, ["a"], False, CHOICE_CUSTOM),
        (CHOICE_NONE, [], True, CHOICE_CUSTOM),
    ],
)
def test_apps_decide_the_label(
    kinds_choice: str, apps: list[str], later: bool, expected: str
) -> None:
    """Choosing one app, or apps installed later, reads as custom."""
    assert choice_for(preset_kinds(kinds_choice), apps, later) == expected


def test_app_slug_and_removed_apps() -> None:
    """The identifier comes from the unique id and removed apps are dropped."""
    assert app_slug("core_mosquitto_version_latest") == "core_mosquitto"
    assert app_slug("home_assistant_core_version_latest") == "home_assistant_core"
    assert app_slug("something_else") is None
    assert prune_apps(["a", "gone", "a", "b"], ["b", "a"]) == ["a", "b"]


async def test_websocket_apps_and_automatic_app_update(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """Chosen apps are stored by identifier and only they get a backup."""
    calls = await _mock_install(hass)
    assert await async_setup_component(hass, DOMAIN, {})
    registry = er.async_get(hass)
    for slug in ("core_a", "core_b"):
        registry.async_get_or_create(
            UPDATE_DOMAIN,
            "hassio",
            f"{slug}_version_latest",
            suggested_object_id=f"{slug}_update",
        )
    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "auto_update/set_backup_apps",
            "apps": ["core_a", "core_gone"],
            "installed": ["core_a", "core_b"],
            "later": False,
        }
    )
    assert (await client.receive_json())["success"]
    await client.send_json_auto_id({"type": "auto_update/info"})
    info = (await client.receive_json())["result"]
    assert info["backup_apps"] == ["core_a"]
    assert info["backup_apps_later"] is False
    assert info["backup_choice"] == CHOICE_CUSTOM

    _set_update(hass, "update.core_a_update", INSTALL_AND_BACKUP)
    _set_update(hass, "update.core_b_update", INSTALL_AND_BACKUP)
    hass.data[DATA_MANAGER].async_set_all(True)
    await hass.async_block_till_done()
    by_entity = {call.data["entity_id"]: call.data for call in calls}
    assert by_entity["update.core_a_update"]["backup"] is True
    assert "backup" not in by_entity["update.core_b_update"]


def test_migration_keeps_the_old_behaviour_for_apps() -> None:
    """The old boolean keeps apps and apps installed later as they behaved."""
    on = settings_from_store({"backup": True})
    off = settings_from_store({"backup": False})
    assert (on["kinds"]["app"], on["later"]) == (True, True)
    assert (off["kinds"]["app"], off["later"]) == (False, False)
