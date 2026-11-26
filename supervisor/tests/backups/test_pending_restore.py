"""Test a restore queued while Home Assistant is still being installed."""

# pylint: disable=protected-access
from pathlib import Path
from unittest.mock import AsyncMock, Mock, PropertyMock, patch

from aiohttp.test_utils import TestClient
from awesomeversion import AwesomeVersion
import pytest

from supervisor.backups.const import BackupType
from supervisor.backups.pending_restore import (
    FILE_PENDING_RESTORE,
    FILE_PENDING_RESTORE_PASSWORD,
    PendingRestore,
    PendingRestoreState,
)
from supervisor.const import CoreState, CpuArch
from supervisor.coresys import CoreSys
from supervisor.docker.homeassistant import DockerHomeAssistant
from supervisor.docker.interface import DockerInterface
from supervisor.exceptions import (
    BackupError,
    BackupInvalidError,
    BackupSupervisorUpdateInProgressError,
)
from supervisor.homeassistant.const import LANDINGPAGE
from supervisor.homeassistant.core import HomeAssistantCore
from supervisor.updater import Updater

from tests.common import AsyncIterator

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


async def test_running_record_fails_after_restart_and_is_not_rerun(
    pending: PendingRestore, tmp_path: Path
) -> None:
    """A restore cut short by a restart is never run again by itself."""
    await pending.queue(SLUG, "Full backup", 1, "secret")
    pending._record["state"] = PendingRestoreState.RUNNING
    await pending._save()

    pending._record = None
    await pending.load()

    assert pending.record["state"] == PendingRestoreState.FAILED
    assert "interrupted" in pending.record["error"]
    assert not pending.ready()
    assert not (tmp_path / FILE_PENDING_RESTORE_PASSWORD).exists()


async def test_stale_password_files_are_removed(
    pending: PendingRestore, tmp_path: Path
) -> None:
    """A key never stays on disk without a protected record to use it."""
    password_file = tmp_path / FILE_PENDING_RESTORE_PASSWORD
    password_file.write_text("left over")
    await pending.load()
    assert not password_file.exists()

    password_file.write_text("left over")
    await pending.queue(SLUG, "Full backup", 1, None)
    assert not password_file.exists()
    assert pending.record["protected"] is False


async def test_unprotected_run_ignores_a_stray_password(
    coresys: CoreSys, pending: PendingRestore, tmp_path: Path
) -> None:
    """The password file is only read for a protected backup."""
    await pending.queue(SLUG, "Full backup", 1, None)
    (tmp_path / FILE_PENDING_RESTORE_PASSWORD).write_text("stray")
    await coresys.core.set_state(CoreState.RUNNING)
    coresys.homeassistant.version = "2026.11.3"

    restore = AsyncMock(return_value=True)
    with (
        patch.object(coresys.backups, "get", return_value=object()),
        patch.object(pending, "_restore", restore),
    ):
        pending.start()
        await coresys.block_till_done(wait_background_tasks=True)

    assert restore.await_args.args[2] is None


async def test_both_triggers_run_the_restore_once(
    coresys: CoreSys, pending: PendingRestore
) -> None:
    """The install hook and the start hook together start one restore."""
    await pending.queue(SLUG, "Full backup", 1, None)
    await coresys.core.set_state(CoreState.RUNNING)
    coresys.homeassistant.version = "2026.11.3"

    restore = AsyncMock(return_value=True)
    with (
        patch.object(coresys.backups, "get", return_value=object()),
        patch.object(pending, "_restore", restore),
    ):
        pending.start()
        pending.start()
        await coresys.block_till_done(wait_background_tasks=True)

    restore.assert_awaited_once()


async def test_failed_job_reports_its_own_error(
    coresys: CoreSys, pending: PendingRestore
) -> None:
    """When the restore returns False, the page shows what the job logged."""
    await pending.queue(SLUG, "Full backup", 1, None)
    await coresys.core.set_state(CoreState.RUNNING)
    coresys.homeassistant.version = "2026.11.3"
    pending._record["job_id"] = "abc"

    job = Mock(errors=[Mock(message="App core_ssh failed to restore")])
    with (
        patch.object(coresys.backups, "get", return_value=object()),
        patch.object(pending, "_restore", AsyncMock(return_value=False)),
        patch.object(coresys.jobs, "get_job", return_value=job),
    ):
        pending.start()
        await coresys.block_till_done(wait_background_tasks=True)

    assert pending.record["error"] == "App core_ssh failed to restore"


async def test_supervisor_update_keeps_the_restore_queued(
    coresys: CoreSys, pending: PendingRestore, tmp_path: Path
) -> None:
    """An update of the Supervisor in the way is not a failure: the key stays."""
    await pending.queue(SLUG, "Full backup", 1, "secret")
    await coresys.core.set_state(CoreState.RUNNING)
    coresys.homeassistant.version = "2026.11.3"

    with (
        patch.object(coresys.backups, "get", return_value=object()),
        patch.object(
            pending,
            "_restore",
            AsyncMock(
                side_effect=BackupSupervisorUpdateInProgressError(
                    backup_version="2027.1.0", supervisor_version="2026.11.0"
                )
            ),
        ),
    ):
        pending.start()
        await coresys.block_till_done(wait_background_tasks=True)

    assert pending.record["state"] == PendingRestoreState.QUEUED
    assert (tmp_path / FILE_PENDING_RESTORE_PASSWORD).read_text() == "secret"


async def test_install_restores_without_starting_an_empty_core(
    coresys: CoreSys, pending: PendingRestore
) -> None:
    """With a restore queued, install starts it instead of an empty Core."""
    await pending.queue(SLUG, "Full backup", 1, None)
    await coresys.core.set_state(CoreState.RUNNING)
    coresys.docker.images.pull.side_effect = [AsyncIterator([{}])]

    with (
        patch.object(HomeAssistantCore, "start") as start_core,
        patch.object(PendingRestore, "start") as start_restore,
        patch.object(DockerHomeAssistant, "cleanup"),
        patch.object(
            Updater,
            "image_homeassistant",
            new=PropertyMock(return_value="homeassistant"),
        ),
        patch.object(
            Updater, "version_homeassistant", new=PropertyMock(return_value="2026.11.3")
        ),
        patch.object(
            DockerInterface, "arch", new=PropertyMock(return_value=CpuArch.AMD64)
        ),
    ):
        await coresys.homeassistant.core.install()

    start_core.assert_not_called()
    start_restore.assert_called_once()


async def test_install_without_a_queued_restore_starts_core(
    coresys: CoreSys,
) -> None:
    """With nothing queued, install starts Core as before."""
    coresys.docker.images.pull.side_effect = [AsyncIterator([{}])]

    with (
        patch.object(HomeAssistantCore, "start") as start_core,
        patch.object(PendingRestore, "start") as start_restore,
        patch.object(DockerHomeAssistant, "cleanup"),
        patch.object(
            Updater,
            "image_homeassistant",
            new=PropertyMock(return_value="homeassistant"),
        ),
        patch.object(
            Updater, "version_homeassistant", new=PropertyMock(return_value="2026.11.3")
        ),
        patch.object(
            DockerInterface, "arch", new=PropertyMock(return_value=CpuArch.AMD64)
        ),
    ):
        await coresys.homeassistant.core.install()

    start_core.assert_awaited_once()
    start_restore.assert_not_called()


async def test_queue_refused_once_core_is_installed(
    coresys: CoreSys, pending: PendingRestore
) -> None:
    """Only the first start can queue a restore."""
    coresys.homeassistant.version = "2026.11.3"
    backup = Mock(sys_type=BackupType.FULL)
    with pytest.raises(BackupError):
        await coresys.backups.queue_restore_when_ready(backup, None)
    assert pending.record is None


async def test_queue_refused_for_a_partial_backup(
    coresys: CoreSys, pending: PendingRestore
) -> None:
    """A partial backup cannot replace a whole system."""
    coresys.homeassistant.version = LANDINGPAGE
    backup = Mock(sys_type=BackupType.PARTIAL, slug=SLUG)
    with pytest.raises(BackupInvalidError):
        await coresys.backups.queue_restore_when_ready(backup, None)
    assert pending.record is None


async def test_wrong_key_leaves_no_record(
    coresys: CoreSys, pending: PendingRestore
) -> None:
    """A key that does not open the backup queues nothing."""
    coresys.homeassistant.version = LANDINGPAGE
    backup = Mock(sys_type=BackupType.FULL, slug=SLUG)
    with (
        patch.object(
            coresys.backups,
            "_validate_backup_location",
            AsyncMock(side_effect=BackupInvalidError("Invalid password")),
        ),
        pytest.raises(BackupInvalidError),
    ):
        await coresys.backups.queue_restore_when_ready(backup, "wrong")
    assert pending.record is None


async def test_queue_refused_for_a_newer_supervisor_backup(
    coresys: CoreSys, pending: PendingRestore
) -> None:
    """A backup from a newer Supervisor than any available is refused up front."""
    coresys.homeassistant.version = LANDINGPAGE
    backup = Mock(
        sys_type=BackupType.FULL,
        slug=SLUG,
        supervisor_version=AwesomeVersion("99999.1.0"),
    )
    with (
        patch.object(coresys.backups, "_validate_backup_location", AsyncMock()),
        pytest.raises(BackupInvalidError),
    ):
        await coresys.backups.queue_restore_when_ready(backup, None)
    assert pending.record is None


async def test_queue_refused_without_room(
    coresys: CoreSys, pending: PendingRestore
) -> None:
    """A backup that cannot be unpacked on the free space is refused."""
    coresys.homeassistant.version = LANDINGPAGE
    backup = Mock(
        sys_type=BackupType.FULL,
        slug=SLUG,
        name="B",
        size_bytes=50 * 2**30,
        supervisor_version=AwesomeVersion("2026.1.0"),
    )
    with (
        patch.object(coresys.backups, "_validate_backup_location", AsyncMock()),
        patch.object(coresys.host.info, "free_space", AsyncMock(return_value=10.0)),
        pytest.raises(BackupError),
    ):
        await coresys.backups.queue_restore_when_ready(backup, None)
    assert pending.record is None


async def test_import_refuses_a_slug_that_walks_out(
    coresys: CoreSys, tmp_path: Path
) -> None:
    """The slug names the stored file, so a path in it is refused."""
    tar_file = tmp_path / "upload.tar"
    tar_file.write_bytes(b"")
    with patch("supervisor.backups.manager.Backup") as backup_class:
        backup_class.return_value.load = AsyncMock(return_value=True)
        backup_class.return_value.slug = "../x"
        assert await coresys.backups.import_backup(tar_file) is None
    assert tar_file.exists()


async def test_api_delete_refused_while_running(
    api_client: TestClient, coresys: CoreSys, pending: PendingRestore
) -> None:
    """A restore that has started cannot be cancelled through the API."""
    await pending.queue(SLUG, "Full backup", 1, None)
    pending._record["state"] = PendingRestoreState.RUNNING
    resp = await api_client.delete("/backups/restore/pending")
    assert resp.status == 400
    assert pending.record["state"] == PendingRestoreState.RUNNING


async def test_api_delete_can_remove_the_uploaded_backup(
    api_client: TestClient, coresys: CoreSys, pending: PendingRestore
) -> None:
    """Setting up without the backup drops the record and the upload."""
    await pending.queue(SLUG, "Full backup", 1, None)
    with (
        patch.object(coresys.backups, "get") as get_backup,
        patch.object(coresys.backups, "remove", AsyncMock()) as remove,
    ):
        resp = await api_client.delete(
            "/backups/restore/pending", json={"remove_backup": True}
        )
    assert resp.status == 200
    remove.assert_awaited_once_with(get_backup.return_value)
    assert pending.record is None


async def test_api_discard_an_unqueued_upload(
    api_client: TestClient, coresys: CoreSys, pending: PendingRestore
) -> None:
    """An abandoned upload can be removed at first start, not a queued one."""
    coresys.homeassistant.version = LANDINGPAGE
    with (
        patch.object(coresys.backups, "get") as get_backup,
        patch.object(coresys.backups, "remove", AsyncMock()) as remove,
    ):
        resp = await api_client.delete("/backups/restore/pending", json={"slug": SLUG})
        assert resp.status == 200
        remove.assert_awaited_once_with(get_backup.return_value)

        await pending.queue(SLUG, "Full backup", 1, None)
        remove.reset_mock()
        resp = await api_client.delete("/backups/restore/pending", json={"slug": SLUG})
        assert resp.status == 400
        remove.assert_not_awaited()


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


async def test_api_check_password_reports_a_wrong_key(
    api_client: TestClient, coresys: CoreSys
) -> None:
    """A key that does not open the backup is a client error, nothing is queued."""
    with (
        patch.object(coresys.backups, "get"),
        patch.object(
            coresys.backups,
            "check_password",
            AsyncMock(side_effect=BackupInvalidError("Invalid password")),
        ),
    ):
        resp = await api_client.post(
            f"/backups/{SLUG}/check_password", json={"password": "wrong"}
        )
    assert resp.status == 400
    assert coresys.backups.pending_restore.record is None


async def test_retry_requeues_a_failed_restore_with_a_new_key(
    coresys: CoreSys, pending: PendingRestore, tmp_path: Path
) -> None:
    """Try again runs the same backup again, with the key asked for anew."""
    await pending.queue(SLUG, "Full backup", 1, "old")
    pending._record["state"] = PendingRestoreState.FAILED
    pending._record["error"] = "No space left"
    await coresys.core.set_state(CoreState.RUNNING)
    coresys.homeassistant.version = "2026.11.3"

    with (
        patch.object(coresys.backups, "get", return_value=object()),
        patch.object(coresys.backups, "_validate_backup_location", AsyncMock()),
        patch.object(pending, "_restore", AsyncMock(return_value=True)),
    ):
        record = await coresys.backups.retry_pending_restore("new")
        assert record["state"] == PendingRestoreState.QUEUED
        assert record["error"] is None
        await coresys.block_till_done(wait_background_tasks=True)

    assert pending.record["state"] == PendingRestoreState.DONE
    assert not (tmp_path / FILE_PENDING_RESTORE_PASSWORD).exists()


async def test_retry_refused_unless_the_restore_failed(
    coresys: CoreSys, pending: PendingRestore
) -> None:
    """Only a failed restore can be tried again."""
    with pytest.raises(BackupError):
        await coresys.backups.retry_pending_restore(None)
    await pending.queue(SLUG, "Full backup", 1, None)
    with pytest.raises(BackupError):
        await coresys.backups.retry_pending_restore(None)


async def test_retry_with_a_wrong_key_changes_nothing(
    coresys: CoreSys, pending: PendingRestore
) -> None:
    """A key that does not open the backup leaves the failed record as it was."""
    await pending.queue(SLUG, "Full backup", 1, "old")
    pending._record["state"] = PendingRestoreState.FAILED
    with (
        patch.object(coresys.backups, "get", return_value=object()),
        patch.object(
            coresys.backups,
            "_validate_backup_location",
            AsyncMock(side_effect=BackupInvalidError("Invalid password")),
        ),
        pytest.raises(BackupInvalidError),
    ):
        await coresys.backups.retry_pending_restore("wrong")
    assert pending.record["state"] == PendingRestoreState.FAILED
