"""End to end against a real local registry (the registry:2 image).

Runs only when REGISTRY_TEST_URL names one on a private container network. Nothing here
ever contacts a public registry.
"""

from collections.abc import AsyncGenerator, Generator
import os
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import urlsplit
import uuid

import aiohttp
import pytest
from pytest_homeassistant.common import MockConfigEntry
from pytest_socket import socket_allow_hosts

from homeassistant.components.camera_recording.play_registry import RegistryPlayer
from homeassistant.components.camera_recording.registry_place import (
    RegistryDrive,
    annotate_segments,
    get_place,
)
from homeassistant.components.registry_storage.client import RegistryClient
from homeassistant.components.registry_storage.crypto import (
    PART_SIZE,
    new_vault_key,
    wrap_vault_key,
)
from homeassistant.components.registry_storage.store import (
    RegistryStore,
    StorageSettings,
)
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant

URL = os.environ.get("REGISTRY_TEST_URL")
CAMERA = "camera.front_door"
CLIP = "20261118T093600Z-event.mp4"
FOLDER = ("Camera recordings", "front_door", "2026-11-18")

pytestmark = [
    pytest.mark.skipif(not URL, reason="REGISTRY_TEST_URL is not set"),
    pytest.mark.usefixtures("allow_registry_socket"),
]


@pytest.fixture
def allow_registry_socket(socket_enabled: None) -> Generator[None]:
    """Allow connections to the local test registry, and only to it."""
    assert URL
    socket_allow_hosts(["127.0.0.1", urlsplit(URL).hostname or ""])
    yield
    socket_allow_hosts(["127.0.0.1"])


@pytest.fixture
async def real_store(hass: HomeAssistant) -> AsyncGenerator[RegistryStore]:
    """A store on the local registry with a repository nobody used before."""
    assert URL
    async with aiohttp.ClientSession() as session:
        client = RegistryClient(session, URL, None, None)
        key = new_vault_key()
        header = wrap_vault_key(key, "a few unrelated words 42")
        repository = f"test/{uuid.uuid4().hex[:12]}"
        yield RegistryStore(hass, client, key, header, StorageSettings(repository))


def _plaintext_left(roots: list[Path], marker: bytes) -> list[Path]:
    return [
        path
        for root in roots
        for path in root.rglob("*")
        if path.is_file() and marker in path.read_bytes()
    ]


async def test_upload_trim_list_play_and_leave_nothing_behind(
    hass: HomeAssistant, real_store: RegistryStore, tmp_path: Path
) -> None:
    """Upload a clip, trim the local copy, see it in the registry, seek, leave no plaintext."""
    entry = MockConfigEntry(
        domain="registry_storage", title="Registry", state=ConfigEntryState.LOADED
    )
    entry.add_to_hass(hass)
    entry.runtime_data = SimpleNamespace(store=real_store, client=real_store.client)
    marker = b"PLAINTEXT-MARKER-" + os.urandom(8).hex().encode()
    data = marker + os.urandom(3 * PART_SIZE + 12345)
    recording = tmp_path / "recordings" / CLIP
    recording.parent.mkdir()
    recording.write_bytes(data)

    drive = RegistryDrive(hass)
    place = get_place(hass)
    await place.async_load()

    async def _chunks():
        yield data

    _chunks.path = recording  # type: ignore[attr-defined]
    remote = await drive.upload(_chunks, len(data), FOLDER, CLIP)

    recording.unlink()
    rows = annotate_segments(hass, CAMERA, [], 0, 10**12)
    assert [(row["name"], row["here"], row["in_registry"]) for row in rows] == [
        (CLIP, False, True)
    ]

    player = RegistryPlayer(hass)
    session = player.open_session(remote.id, len(data))
    first = b"".join([c async for c in player.read(session, 0, PART_SIZE)])
    assert first == data[:PART_SIZE]
    last = b"".join(
        [c async for c in player.read(session, len(data) - 1000, len(data))]
    )
    assert last == data[-1000:]
    assert session.downloads == 2
    player.release(session)
    player.close_all()
    assert player.sessions == {}

    drive_path = Path(hass.config.path())
    assert _plaintext_left([tmp_path, drive_path], marker) == []
    await place.async_stop()
