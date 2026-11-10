"""Tests for the Guided setup integration."""

from pathlib import Path

import probatio
import pytest

from homeassistant.components.guided_setup.catalog import (
    _scan_integration,
    serialize_schema,
)
from homeassistant.components.guided_setup.const import FILES_DIRECTORY
from homeassistant.components.guided_setup.manager import GuidedSetupManager
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from homeassistant.util.yaml import load_yaml_dict

from tests.typing import WebSocketGenerator


def test_serialize_schema_skips_platform_and_flags_free_form() -> None:
    """Platform key is hidden and unsupported values become YAML boxes."""
    schema = probatio.Schema(
        {
            probatio.Required("platform"): str,
            probatio.Required("host"): str,
            probatio.Optional("port", default=80): int,
        }
    )
    fields = serialize_schema(schema, "demo")
    assert [field["name"] for field in fields] == ["host", "port"]
    assert fields[0]["required"] is True
    assert fields[1]["default"] == 80


def test_serialize_schema_rejects_unusable_schema() -> None:
    """A schema without describable options raises so the caller can fall back."""
    with pytest.raises(ValueError):
        serialize_schema(probatio.Schema(str), "demo")


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
