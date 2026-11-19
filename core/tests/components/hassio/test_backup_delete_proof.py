"""Tests for delete proof marks held by the Supervisor."""

from unittest.mock import AsyncMock, Mock, patch

from aiohasupervisor.exceptions import SupervisorBadRequestError, SupervisorError
import pytest

from homeassistant.components.backup import BackupManagerError, DeleteProofMark
from homeassistant.components.hassio.backup import SupervisorBackupReaderWriter
from homeassistant.core import HomeAssistant

MARK = DeleteProofMark(
    marked_at="2026-11-18T21:58:00+00:00", marked_by="user-id", marked_by_name="Owner"
)


def _reader_writer(hass: HomeAssistant, inner: Mock) -> SupervisorBackupReaderWriter:
    """Return a reader writer whose Supervisor client is mocked."""
    client = Mock()
    client._client = inner
    with patch(
        "homeassistant.components.hassio.backup.get_supervisor_client",
        return_value=client,
    ):
        return SupervisorBackupReaderWriter(hass)


async def test_load_from_supervisor(hass: HomeAssistant) -> None:
    """The marks the Supervisor holds are returned."""
    inner = Mock(
        get=AsyncMock(
            return_value=Mock(
                data={
                    "delete_proof": {
                        "abc123": {
                            "marked_at": MARK.marked_at,
                            "marked_by": MARK.marked_by,
                            "marked_by_name": MARK.marked_by_name,
                        }
                    }
                }
            )
        )
    )
    marks = await _reader_writer(hass, inner).async_load_delete_proof()
    assert marks == {"abc123": MARK}
    inner.get.assert_awaited_once_with("backups/delete_proof")


@pytest.mark.parametrize(
    "get",
    [
        AsyncMock(side_effect=SupervisorError("down")),
        AsyncMock(return_value=Mock(data={"delete_proof": {"x": "not a mark"}})),
    ],
)
async def test_load_falls_back(hass: HomeAssistant, get: AsyncMock) -> None:
    """An unreachable Supervisor or bad data means the local copy is used."""
    assert await _reader_writer(hass, Mock(get=get)).async_load_delete_proof() is None


async def test_save_sends_change(hass: HomeAssistant) -> None:
    """Turning on and off is sent to the Supervisor, with the confirmation."""
    inner = Mock(post=AsyncMock())
    reader_writer = _reader_writer(hass, inner)

    await reader_writer.async_save_delete_proof("abc123", MARK, confirmed=False)
    inner.post.assert_awaited_with(
        "backups/delete_proof",
        json={
            "backup_id": "abc123",
            "delete_proof": True,
            "confirmed": False,
            "marked_by": "user-id",
            "marked_by_name": "Owner",
        },
    )

    await reader_writer.async_save_delete_proof("abc123", None, confirmed=True)
    inner.post.assert_awaited_with(
        "backups/delete_proof",
        json={"backup_id": "abc123", "delete_proof": False, "confirmed": True},
    )


async def test_save_refused(hass: HomeAssistant) -> None:
    """A change the Supervisor refuses is reported, not assumed stored."""
    inner = Mock(post=AsyncMock(side_effect=SupervisorBadRequestError("no")))
    with pytest.raises(BackupManagerError):
        await _reader_writer(hass, inner).async_save_delete_proof(
            "abc123", None, confirmed=False
        )
