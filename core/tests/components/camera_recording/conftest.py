"""Fixtures for camera recording tests."""

from collections.abc import AsyncIterator, Generator
from contextlib import asynccontextmanager
from pathlib import Path
import shutil
from unittest.mock import patch

import pytest
from pytest_homeassistant.common import MockConfigEntry

from homeassistant.components.camera_recording.const import (
    CONF_BUFFER_HOURS,
    CONF_CAMERAS,
    CONF_DESTINATION,
    CONF_KEEP_DAYS,
    CONF_MAX_GB,
    CONF_PATH,
    CONF_SEGMENT_MINUTES,
    DEST_LOCAL,
    DEST_SFTP,
    DOMAIN,
)
from homeassistant.components.camera_recording.destination import (
    Destination,
    DestinationError,
    Session,
)
from homeassistant.const import CONF_HOST, CONF_PASSWORD, CONF_PORT, CONF_USERNAME
from homeassistant.core import HomeAssistant

CAMERA = "camera.front_door"


class MemorySession(Session):
    """A remote destination kept in a dict."""

    def __init__(self, store: dict[str, bytes], fail: bool) -> None:
        """Keep the shared store."""
        self.store = store
        self.fail = fail

    async def upload(self, local: Path, remote: str) -> None:
        """Copy into the dict."""
        if self.fail:
            raise DestinationError("The share is offline")
        self.store[remote] = local.read_bytes()

    async def download(self, remote: str, local: Path) -> None:
        """Copy out of the dict."""
        local.write_bytes(self.store[remote])

    async def delete(self, remote: str) -> None:
        """Remove from the dict."""
        self.store.pop(remote, None)

    async def free_space(self) -> int | None:
        """A fixed amount."""
        return 1_000_000


class MemoryDestination(Destination):
    """A remote destination for tests."""

    kind = DEST_SFTP
    store: dict[str, bytes] = {}
    fail = False

    @property
    def label(self) -> str:
        """A fixed label."""
        return "memory"

    @asynccontextmanager
    async def session(self) -> AsyncIterator[Session]:
        """Open the dict."""
        yield MemorySession(MemoryDestination.store, MemoryDestination.fail)


@pytest.fixture(autouse=True)
def remove_staging(hass: HomeAssistant) -> Generator[None]:
    """Remove the staging folder the manager makes in the test configuration."""
    yield
    shutil.rmtree(hass.config.path(DOMAIN), ignore_errors=True)


@pytest.fixture
def remote_store() -> Generator[dict[str, bytes]]:
    """Use the in-memory destination for every entry."""
    MemoryDestination.store = {}
    MemoryDestination.fail = False
    with patch(
        "homeassistant.components.camera_recording.manager.create_destination",
        side_effect=lambda hass, data: MemoryDestination(hass, data),
    ):
        yield MemoryDestination.store


@pytest.fixture
def no_ffmpeg() -> Generator[None]:
    """Recorders do not start ffmpeg in tests."""
    with (
        patch(
            "homeassistant.components.camera_recording.recorder.CameraRecorder.start"
        ),
        patch("homeassistant.components.camera_recording.recorder.CameraRecorder.stop"),
    ):
        yield


OPTIONS = {
    CONF_CAMERAS: [CAMERA],
    CONF_KEEP_DAYS: 14,
    CONF_MAX_GB: 0,
    CONF_BUFFER_HOURS: 1,
    CONF_SEGMENT_MINUTES: 5,
}


@pytest.fixture
def remote_entry() -> MockConfigEntry:
    """An entry recording to an SSH server."""
    return MockConfigEntry(
        domain=DOMAIN,
        title="memory",
        data={
            CONF_DESTINATION: DEST_SFTP,
            CONF_HOST: "server",
            CONF_PORT: 22,
            CONF_USERNAME: "cams",
            CONF_PASSWORD: "secret",
            CONF_PATH: "/srv/cameras",
        },
        options=OPTIONS,
    )


@pytest.fixture
def local_entry(tmp_path: Path) -> MockConfigEntry:
    """An entry recording to a folder."""
    return MockConfigEntry(
        domain=DOMAIN,
        title=str(tmp_path / "rec"),
        data={CONF_DESTINATION: DEST_LOCAL, CONF_PATH: str(tmp_path / "rec")},
        options=OPTIONS,
    )


def write_segment(folder: Path, name: str, size: int = 100) -> Path:
    """Write a fake finished segment."""
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / name
    path.write_bytes(b"x" * size)
    return path
