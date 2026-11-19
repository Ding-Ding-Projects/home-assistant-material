"""The websocket commands the container registry page sends, checked from the server side.

The frontend's test/data/registry_storage.test.ts holds the same table and checks that
the page sends exactly these commands with exactly these keys. A rename or a changed
payload on either side fails one of the two tests.
"""

from pathlib import Path
from typing import Any

import pytest
from pytest_homeassistant.common import MockConfigEntry
from pytest_homeassistant.typing import WebSocketGenerator

from homeassistant.components import registry_storage
from homeassistant.components.camera_recording.registry_api import REGISTRY_COMMANDS
from homeassistant.core import HomeAssistant
from tests.components.registry_storage.conftest import (  # noqa: F401
    client,
    fast_kdf,
    make_store,
    registry,
    sleeps,
    vault_key,
)

from .test_registry_place import place, store  # noqa: F401

# Command, then the keys the page sends with it (besides id and type).
CONTRACT: dict[str, list[str]] = {
    "camera_recording/registry/status": [],
    "camera_recording/registry/test": [],
    "camera_recording/registry/set": [
        "enabled",
        "keep_days",
        "public_understood",
        "send",
    ],
    "camera_recording/registry/camera_repository": ["entity_id", "repository"],
    "camera_recording/registry/refresh": [],
    "camera_recording/registry/where": ["end_time", "entity_id", "start_time"],
    "camera_recording/registry/play": ["entity_id", "name"],
    "camera_recording/registry/get_back": ["entity_id", "name"],
    "camera_recording/registry/get_back_status": ["job_id"],
    "camera_recording/registry/get_back_cancel": ["job_id"],
}

SAMPLES: dict[str, Any] = {
    "enabled": True,
    "keep_days": 30,
    "public_understood": True,
    "send": "events",
    "entity_id": "camera.front_door",
    "repository": None,
    "start_time": "2026-11-18T00:00:00.000Z",
    "end_time": "2026-11-19T00:00:00.000Z",
    "name": "20261118T093600Z-event.mp4",
    "job_id": "01JCONTRACT",
}

# What the page reads from camera_recording/registry/status.
STATUS_KEYS = {
    "entry_id",
    "registry",
    "address",
    "username",
    "set_up",
    "loaded",
    "default_repository",
    "backups_repository",
    "public",
    "used_bytes",
    "upload",
    "cameras",
}
UPLOAD_KEYS = {
    "enabled",
    "send",
    "keep_days",
    "waiting_files",
    "waiting_bytes",
    "last_sent",
    "last_problem",
}
CAMERA_KEYS = {"repository", "own_repository"}


def _schema_keys(handler: Any) -> set[str]:
    schema = handler._ws_schema  # noqa: SLF001
    if schema is False:
        return set()
    return {str(key) for key in schema.schema} - {"id", "type"}


def test_registered_commands_match_the_page() -> None:
    """The server registers exactly the commands the page knows."""
    names = sorted(handler._ws_command for handler in REGISTRY_COMMANDS)  # noqa: SLF001
    assert names == sorted(CONTRACT)


@pytest.mark.parametrize("command", sorted(CONTRACT))
def test_each_command_accepts_what_the_page_sends(command: str) -> None:
    """Each command's schema accepts the page's keys, and nothing the page leaves out is required."""
    handler = next(
        h
        for h in REGISTRY_COMMANDS
        if h._ws_command == command  # noqa: SLF001
    )
    keys = CONTRACT[command]
    schema = handler._ws_schema  # noqa: SLF001
    if schema is False:
        assert keys == []
        return
    assert set(keys) <= _schema_keys(handler)
    schema({"id": 1, "type": command, **{key: SAMPLES[key] for key in keys}})


def test_no_command_carries_a_password() -> None:
    """Passwords are set and changed only in the integration's own flows."""
    for handler in REGISTRY_COMMANDS:
        assert not any("password" in key for key in _schema_keys(handler))
    source = Path(registry_storage.__file__).parent
    for path in source.glob("*.py"):
        assert "websocket_command" not in path.read_text(encoding="utf-8"), path


@pytest.mark.usefixtures("place", "no_ffmpeg")
async def test_status_has_what_the_page_reads(
    hass: HomeAssistant,
    local_entry: MockConfigEntry,
    hass_ws_client: WebSocketGenerator,
) -> None:
    """The status answer carries every field the page turns into a place."""
    from .test_init import setup_entry  # noqa: PLC0415

    await setup_entry(hass, local_entry)
    ws = await hass_ws_client(hass)
    await ws.send_json_auto_id({"type": "camera_recording/registry/status"})
    status = (await ws.receive_json())["result"]
    assert set(status) >= STATUS_KEYS
    assert set(status["upload"]) >= UPLOAD_KEYS
    assert all(set(camera) >= CAMERA_KEYS for camera in status["cameras"].values())
    assert status["set_up"] is True
    assert status["entry_id"]
