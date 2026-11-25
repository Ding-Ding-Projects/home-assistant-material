"""Test a restore queued while Home Assistant is still being installed."""

# pylint: disable=protected-access
from pathlib import Path
from unittest.mock import AsyncMock, patch

from aiohttp.test_utils import TestClient
import pytest

from supervisor.backups.pending_restore import (
    FILE_PENDING_RESTORE,
    FILE_PENDING_RESTORE_PASSWORD,
    PendingRestore,
    PendingRestoreState,
)
from supervisor.const import CoreState
from supervisor.coresys import CoreSys
from supervisor.exceptions import BackupError
from supervisor.homeassistant.const import LANDINGPAGE

SLUG = "7fed74c8"


@pytest.fixture(name="pending")
def fixture_pending(coresys: CoreSys, tmp_path: Path) -> PendingRestore:
    """Return the pending restore with its files in a temporary folder."""
    with patch.object(
        type(coresys.config),
        "path_supervisor",
        new_callable=lambda: property(lambda _self: tmp_path),
    ):
        yield coresys.backups.pending_restore


async def test_queue_stores_record_and_private_password(
    pending: PendingRestore, tmp_path: Path
) -> None:
    """The record is saved and the password sits in a file only the owner reads."""
    record = await pending.queue(SLUG, "Full backup", 1234, "K7QD-M2XR-9TBW")

    assert record["state"] == PendingRestoreState.QUEUED
    assert record["protected"] is True
    assert "K7QD" not in (tmp_path / FILE_PENDING_RESTORE).read_text()
    password_file = tmp_path / FILE_PENDING_RESTORE_PASSWORD
    assert password_file.read_text() == "K7QD-M2XR-9TBW"
    assert password_file.stat().st_mode & 0o777 == 0o600


async def test_second_queue_is_refused(pending: PendingRestore) -> None:
    """Only one restore can wait at a time."""
    await pending.queue(SLUG, "Full backup", 1, None)
    with pytest.raises(BackupError):
        await pending.queue("other", "Other", 1, None)


async def test_clear_removes_record_and_password(
    pending: PendingRestore, tmp_path: Path
) -> None:
    """Cancelling leaves nothing behind."""
    await pending.queue(SLUG, "Full backup", 1, "secret")
    await pending.clear()

    assert pending.record is None
    assert not (tmp_path / FILE_PENDING_RESTORE).exists()
    assert not (tmp_path / FILE_PENDING_RESTORE_PASSWORD).exists()


async def test_clear_refused_once_running(pending: PendingRestore) -> None:
    """A restore that has started can no longer be cancelled."""
    await pending.queue(SLUG, "Full backup", 1, None)
    pending._record["state"] = PendingRestoreState.RUNNING
    with pytest.raises(BackupError):
        await pending.clear()


@pytest.mark.parametrize(
    ("core_state", "version", "ready"),
    [
        pytest.param(CoreState.RUNNING, "2026.11.3", True, id="installed"),
        pytest.param(CoreState.RUNNING, LANDINGPAGE, False, id="still_installing"),
        pytest.param(CoreState.STARTUP, "2026.11.3", False, id="supervisor_not_ready"),
    ],
)
async def test_ready_waits_for_install_and_supervisor(
    coresys: CoreSys,
    pending: PendingRestore,
    core_state: CoreState,
    version: str,
    ready: bool,
) -> None:
    """The restore only starts when Core is installed and the Supervisor is up."""
    await pending.queue(SLUG, "Full backup", 1, None)
    await coresys.core.set_state(core_state)
    coresys.homeassistant.version = version
    assert pending.ready() is ready


async def test_start_runs_restore_and_marks_done(
    coresys: CoreSys, pending: PendingRestore, tmp_path: Path
) -> None:
    """A finished restore is kept as done and the password is deleted."""
    await pending.queue(SLUG, "Full backup", 1, "secret")
    await coresys.core.set_state(CoreState.RUNNING)
    coresys.homeassistant.version = "2026.11.3"

    with (
        patch.object(coresys.backups, "get", return_value=object()),
        patch.object(pending, "_restore", AsyncMock(return_value=True)),
    ):
        pending.start()
        await coresys.block_till_done(wait_background_tasks=True)

    assert pending.record["state"] == PendingRestoreState.DONE
    assert pending.record["finished_at"]
    assert not (tmp_path / FILE_PENDING_RESTORE_PASSWORD).exists()


async def test_failed_restore_keeps_error(
    coresys: CoreSys, pending: PendingRestore, tmp_path: Path
) -> None:
    """A failure is recorded so the page can offer to try again."""
    await pending.queue(SLUG, "Full backup", 1, "secret")
    await coresys.core.set_state(CoreState.RUNNING)
    coresys.homeassistant.version = "2026.11.3"

    with (
        patch.object(coresys.backups, "get", return_value=object()),
        patch.object(
            pending, "_restore", AsyncMock(side_effect=BackupError("No space left"))
        ),
    ):
        pending.start()
        await coresys.block_till_done(wait_background_tasks=True)

    assert pending.record["state"] == PendingRestoreState.FAILED
    assert pending.record["error"] == "No space left"
    assert not (tmp_path / FILE_PENDING_RESTORE_PASSWORD).exists()


async def test_missing_backup_fails(coresys: CoreSys, pending: PendingRestore) -> None:
    """If the uploaded file vanished the restore fails instead of hanging."""
    await pending.queue(SLUG, "Full backup", 1, None)
    await coresys.core.set_state(CoreState.RUNNING)
    coresys.homeassistant.version = "2026.11.3"

    pending.start()
    await coresys.block_till_done(wait_background_tasks=True)

    assert pending.record["state"] == PendingRestoreState.FAILED


async def test_running_record_is_queued_again_after_restart(
    coresys: CoreSys, pending: PendingRestore
) -> None:
    """A restore cut short by a Supervisor restart is queued again, not lost."""
    await pending.queue(SLUG, "Full backup", 1, None)
    pending._record["state"] = PendingRestoreState.RUNNING
    await pending._save()

    pending._record = None
    await pending.load()

    assert pending.record["state"] == PendingRestoreState.QUEUED
    assert coresys is not None


async def test_api_queue_info_and_cancel(
    api_client: TestClient, coresys: CoreSys, pending: PendingRestore
) -> None:
    """The three routes queue, report and cancel a restore."""
    await coresys.core.set_state(CoreState.STARTUP)

    async def queue(_backup: object, password: str | None) -> dict:
        return await pending.queue(SLUG, "B", 1, password)

    with (
        patch.object(coresys.backups, "get") as get_backup,
        patch.object(
            coresys.backups,
            "queue_restore_when_ready",
            AsyncMock(side_effect=queue),
        ),
    ):
        get_backup.return_value.slug = SLUG
        resp = await api_client.post(
            f"/backups/{SLUG}/restore/full/when_ready", json={"password": "pw"}
        )
    assert resp.status == 200
    assert (await resp.json())["data"]["state"] == "queued"
    assert "pw" not in await (await api_client.get("/backups/restore/pending")).text()

    resp = await api_client.delete("/backups/restore/pending")
    assert resp.status == 200
    resp = await api_client.get("/backups/restore/pending")
    assert (await resp.json())["data"]["pending_restore"] is None
