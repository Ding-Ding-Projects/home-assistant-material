"""Tests for destinations and the connection test."""

import os
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

from homeassistant.components.camera_recording.const import (
    CONF_DESTINATION,
    CONF_PATH,
    DEST_LOCAL,
)
from homeassistant.components.camera_recording.destination import (
    FolderError,
    LocalDestination,
    _remote_join,
    _ScpSession,
    create_destination,
)
from homeassistant.core import HomeAssistant


async def test_local_test_passes(hass: HomeAssistant, tmp_path: Path) -> None:
    """Every step passes for a writable folder, and the test file is gone afterwards."""
    folder = tmp_path / "new" / "rec"
    destination = create_destination(
        hass, {CONF_DESTINATION: DEST_LOCAL, CONF_PATH: str(folder)}
    )
    result = await destination.async_test()
    assert result.ok
    assert [step.key for step in result.steps] == [
        "open_folder",
        "write_test",
        "free_space",
    ]
    assert result.free_bytes
    assert list(folder.iterdir()) == []


@pytest.mark.skipif(os.geteuid() == 0, reason="root can write anywhere")
async def test_local_test_fails_read_only(hass: HomeAssistant, tmp_path: Path) -> None:
    """A folder that cannot be written fails at open_folder with the reason."""
    tmp_path.chmod(0o500)
    destination = LocalDestination(hass, {CONF_PATH: str(tmp_path)})
    result = await destination.async_test()
    tmp_path.chmod(0o700)
    assert not result.ok
    assert result.failed is not None
    assert result.failed.key == "open_folder"


async def test_local_relative_path_fails(hass: HomeAssistant) -> None:
    """A relative path fails at open_folder."""
    result = await LocalDestination(hass, {CONF_PATH: "rec"}).async_test()
    assert result.failed is not None
    assert result.failed.key == "open_folder"


async def test_local_session_stays_inside(hass: HomeAssistant, tmp_path: Path) -> None:
    """Paths that leave the folder are refused."""
    async with LocalDestination(hass, {CONF_PATH: str(tmp_path)}).session() as session:
        with pytest.raises(FolderError):
            await session.delete("../outside.mp4")


def test_remote_join() -> None:
    """Remote paths are joined under the folder and may not climb out."""
    assert (
        _remote_join("/srv/cameras", "front/2026-11-15/a.mp4")
        == "/srv/cameras/front/2026-11-15/a.mp4"
    )
    with pytest.raises(FolderError):
        _remote_join("/srv/cameras", "../etc/passwd")
    with pytest.raises(FolderError):
        _remote_join("/srv/cameras", "/etc/passwd")


async def test_scp_free_space_and_errors() -> None:
    """SCP reads free space from df and reports command failures."""
    conn = MagicMock()
    conn.run = AsyncMock(
        return_value=MagicMock(
            exit_status=0,
            stdout="Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/sda1 1000 10 900 2% /srv\n",
            stderr="",
        )
    )
    session = _ScpSession(conn, "/srv/cameras")
    assert await session.free_space() == 900 * 1024
    conn.run.return_value = MagicMock(
        exit_status=1, stdout="", stderr="rm: Permission denied"
    )
    with pytest.raises(FolderError, match="Permission denied"):
        await session.delete("front/a.mp4")
