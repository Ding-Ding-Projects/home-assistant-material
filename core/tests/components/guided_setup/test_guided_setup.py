"""Tests for the Guided setup integration."""

from pathlib import Path

import probatio
import pytest

from homeassistant.components.guided_setup.catalog import (
    _scan_integration,
    describe_schema,
)
from homeassistant.components.guided_setup.const import FILES_DIRECTORY
from homeassistant.components.guided_setup.manager import GuidedSetupManager
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from homeassistant.util.yaml import load_yaml_dict

from tests.typing import WebSocketGenerator


def test_describe_schema_maps_each_option_on_its_own() -> None:
    """One validator that cannot be described only affects its own option."""
    schema = probatio.Schema(
        {
            probatio.Required("platform"): str,
            probatio.Required("host"): str,
            probatio.Optional("port", default=80): probatio.All(
                probatio.Coerce(int), probatio.Range(min=1, max=100)
            ),
            probatio.Optional("mode"): probatio.In(["a", "b"]),
            probatio.Optional("odd"): lambda value: value,
        }
    )
    fields = describe_schema(schema, "demo", "sensor").fields
    by_name = {field["name"]: field for field in fields}
    assert list(by_name) == ["host", "port", "mode", "odd"]
    assert by_name["host"]["required"] is True
    assert by_name["port"]["default"] == 80
    assert by_name["port"]["selector"]["number"]["max"] == 100
    assert [o["value"] for o in by_name["mode"]["selector"]["select"]["options"]] == [
        "a",
        "b",
    ]
    assert by_name["odd"]["free_form"] is True


def test_describe_schema_list_items_keyed_by_kind() -> None:
    """A list of items keyed by kind asks for the kind first."""
    schema = probatio.Schema(
        {
            probatio.Optional("demo"): probatio.All(
                probatio.EnsureList(),
                [
                    probatio.Schema(
                        {
                            probatio.Optional("sensor"): {
                                probatio.Required("command"): str
                            },
                            probatio.Optional("switch"): {
                                probatio.Required("command_on"): str
                            },
                        }
                    )
                ],
            )
        }
    )
    shape = describe_schema(schema, "demo", None)
    assert shape.as_list is True
    assert [kind["name"] for kind in shape.kinds] == ["sensor", "switch"]


def test_describe_schema_rejects_user_named_keys() -> None:
    """Options named by the user cannot be listed, so the caller falls back."""
    with pytest.raises(ValueError):
        describe_schema(probatio.Schema({probatio.Optional("demo"): {str: str}}), "demo", None)


def test_scan_finds_platform_and_domain_schema(tmp_path: Path) -> None:
    """The listing heuristic reads the source of the integration."""
    (tmp_path / "sensor.py").write_text("PLATFORM_SCHEMA = 1\n")
    (tmp_path / "switch.py").write_text("x = 1\n")
    (tmp_path / "__init__.py").write_text("CONFIG_SCHEMA = vol.Schema({})\n")
    assert _scan_integration(str(tmp_path), frozenset({"sensor", "switch"})) == (
        ["sensor"],
        True,
    )


def test_scan_ignores_schema_without_options(tmp_path: Path) -> None:
    """A domain schema that accepts nothing is not offered."""
    (tmp_path / "__init__.py").write_text(
        "CONFIG_SCHEMA = cv.empty_config_schema(DOMAIN)\n"
    )
    assert _scan_integration(str(tmp_path), frozenset()) == ([], False)


async def test_manager_writes_and_removes_files(hass: HomeAssistant) -> None:
    """Entries are rendered into one file per integration and removed with it."""
    manager = GuidedSetupManager(hass)
    await manager.async_load()
    path = Path(hass.config.path(FILES_DIRECTORY)) / "demo.yaml"

    first = await manager.async_add("demo", "sensor", {"host": "a"})
    second = await manager.async_add("demo", "sensor", {"host": "b"})
    content = load_yaml_dict(str(path))
    assert content == {
        "sensor": [
            {"platform": "demo", "host": "a"},
            {"platform": "demo", "host": "b"},
        ]
    }

    await manager.async_remove(first["id"])
    assert load_yaml_dict(str(path)) == {
        "sensor": [{"platform": "demo", "host": "b"}]
    }
    await manager.async_remove(second["id"])
    assert not path.exists()


async def test_domain_entry_conflicts(hass: HomeAssistant) -> None:
    """A domain-level integration accepts one configuration only."""
    manager = GuidedSetupManager(hass)
    await manager.async_load()
    entry = await manager.async_add("demo", None, {"a": 1})
    assert manager.conflicts("demo", None)
    assert not manager.conflicts("demo", None, ignore_id=entry["id"])
    assert not manager.conflicts("demo", "sensor")


async def test_catalog_requires_admin(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    hass_read_only_access_token: str,
) -> None:
    """Only administrators reach the commands."""
    assert await async_setup_component(hass, "guided_setup", {})
    client = await hass_ws_client(hass, hass_read_only_access_token)
    await client.send_json({"id": 1, "type": "guided_setup/catalog"})
    response = await client.receive_json()
    assert not response["success"]
    assert response["error"]["code"] == "unauthorized"
