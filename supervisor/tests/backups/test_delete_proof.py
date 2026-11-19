"""Test delete proof backups."""

# pylint: disable=protected-access
from pathlib import Path
from shutil import copy

from aiohttp.test_utils import TestClient
import pytest

from supervisor.backups.backup import Backup
from supervisor.backups.const import BackupType
from supervisor.const import CoreState
from supervisor.coresys import CoreSys
from supervisor.exceptions import (
    BackupDeleteProofConfirmationError,
    BackupDeleteProofError,
)
from supervisor.misc.tasks import Tasks
from supervisor.resolution.const import ContextType, SuggestionType
from supervisor.resolution.data import Suggestion
from supervisor.resolution.fixups.system_clear_full_backup import (
    FixupSystemClearFullBackup,
)

from tests.common import get_fixture_path

SLUG = "7fed74c8"


@pytest.fixture(name="backups_file")
def fixture_backups_file(coresys: CoreSys, tmp_path: Path) -> Path:
    """Write the backups configuration to a temporary file."""
    path = tmp_path / "backups.json"
    coresys.backups._file = path
    return path


@pytest.mark.usefixtures("tmp_supervisor_data", "backups_file")
async def test_remove_refused_while_delete_proof(coresys: CoreSys) -> None:
    """A delete proof backup is refused at the manager; others still go."""
    location = Path(
        copy(get_fixture_path("backup_example.tar"), coresys.config.path_backup)
    )
    await coresys.backups.reload()
    assert (backup := coresys.backups.get(SLUG))

    await coresys.backups.set_delete_proof(
        SLUG, marked_by="user1", marked_by_name="Owner"
    )
    with pytest.raises(BackupDeleteProofError):
        await coresys.backups.remove(backup)
    assert location.exists()
    assert coresys.backups.get(SLUG)

    await coresys.backups.clear_delete_proof(SLUG, confirmed=True)
    await coresys.backups.remove(backup)
    assert not location.exists()
    assert not coresys.backups.get(SLUG)


@pytest.mark.usefixtures("backups_file")
async def test_clear_needs_confirmation(coresys: CoreSys) -> None:
    """Turning delete proof off without confirmation changes nothing."""
    await coresys.backups.set_delete_proof(SLUG, marked_by="user1", marked_by_name=None)
    with pytest.raises(BackupDeleteProofConfirmationError):
        await coresys.backups.clear_delete_proof(SLUG, confirmed=False)
    assert coresys.backups.is_delete_proof(SLUG)


async def test_mark_survives_reload(coresys: CoreSys, backups_file: Path) -> None:
    """The mark is written to the Supervisor's own data and read back."""
    mark = await coresys.backups.set_delete_proof(
        SLUG, marked_by="user1", marked_by_name="Owner"
    )
    assert backups_file.exists()

    coresys.backups._data = {}
    await coresys.backups.read_data()
    assert coresys.backups.is_delete_proof(SLUG)
    assert coresys.backups.delete_proof[SLUG] == mark
    assert mark["marked_by"] == "user1"
    assert mark["marked_by_name"] == "Owner"
    assert mark["marked_at"]


@pytest.mark.usefixtures("backups_file")
async def test_set_keeps_first_mark(coresys: CoreSys) -> None:
    """Marking twice keeps the original time and person."""
    first = await coresys.backups.set_delete_proof(
        SLUG, marked_by="a", marked_by_name=None
    )
    second = await coresys.backups.set_delete_proof(
        SLUG, marked_by="b", marked_by_name=None
    )
    assert second == first


@pytest.mark.usefixtures("backups_file")
async def test_clear_full_backup_fixup_keeps_delete_proof(
    coresys: CoreSys, backups: list[Backup]
) -> None:
    """Freeing space never clears a delete proof backup and does not count it."""
    full = sorted(
        (x for x in backups if x.sys_type == BackupType.FULL), key=lambda x: x.date
    )
    assert len(full) == 3
    oldest = full[0]
    await coresys.backups.set_delete_proof(
        oldest.slug, marked_by="u", marked_by_name=None
    )

    coresys.resolution.add_suggestion(
        Suggestion(SuggestionType.CLEAR_FULL_BACKUP, ContextType.SYSTEM)
    )
    await FixupSystemClearFullBackup(coresys)()

    assert oldest in coresys.backups.list_backups
    # The two unmarked full backups are within the minimum and are kept too
    assert (
        len([x for x in coresys.backups.list_backups if x.sys_type == BackupType.FULL])
        == 3
    )


@pytest.mark.usefixtures("path_extern", "tmp_supervisor_data", "backups_file")
async def test_core_backup_cleanup_keeps_delete_proof(coresys: CoreSys) -> None:
    """The cleanup of old Home Assistant backups skips a delete proof one."""
    await coresys.core.set_state(CoreState.RUNNING)
    coresys.hardware.disk.get_disk_free_space = lambda x: 5000
    copy(get_fixture_path("backup_example.tar"), coresys.config.path_core_backup)
    await coresys.backups.reload()
    assert (old_backup := coresys.backups.get(SLUG))
    await coresys.backups.set_delete_proof(SLUG, marked_by="u", marked_by_name=None)

    await Tasks(coresys)._core_backup_cleanup()

    assert coresys.backups.get(SLUG)
    assert old_backup.tarfile.exists()


@pytest.mark.usefixtures("tmp_supervisor_data", "backups_file")
async def test_api_delete_proof(api_client: TestClient, coresys: CoreSys) -> None:
    """The API marks, refuses removal, needs confirmation to unmark, then removes."""
    location = Path(
        copy(get_fixture_path("backup_example.tar"), coresys.config.path_backup)
    )
    await coresys.backups.reload()

    resp = await api_client.post(
        "/backups/delete_proof",
        json={
            "backup_id": SLUG,
            "delete_proof": True,
            "marked_by": "user1",
            "marked_by_name": "Owner",
        },
    )
    assert resp.status == 200
    body = await resp.json()
    assert body["data"]["delete_proof"]["marked_by"] == "user1"

    resp = await api_client.get("/backups/delete_proof")
    assert SLUG in (await resp.json())["data"]["delete_proof"]

    resp = await api_client.delete(f"/backups/{SLUG}")
    assert resp.status == 403
    body = await resp.json()
    assert body["error_key"] == "backup_delete_proof_error"
    assert location.exists()

    resp = await api_client.post(
        "/backups/delete_proof", json={"backup_id": SLUG, "delete_proof": False}
    )
    assert resp.status == 400
    assert (await resp.json())["error_key"] == "backup_delete_proof_confirmation_error"
    assert coresys.backups.is_delete_proof(SLUG)

    resp = await api_client.post(
        "/backups/delete_proof",
        json={"backup_id": SLUG, "delete_proof": False, "confirmed": True},
    )
    assert resp.status == 200
    assert not coresys.backups.is_delete_proof(SLUG)

    resp = await api_client.delete(f"/backups/{SLUG}")
    assert resp.status == 200
    assert not location.exists()


@pytest.mark.parametrize("api_client", ["local_ssh"], indirect=True)
@pytest.mark.usefixtures("backups_file", "install_app_ssh")
async def test_api_delete_proof_only_home_assistant(
    api_client: TestClient, coresys: CoreSys
) -> None:
    """An app with backup access cannot change the mark."""
    await coresys.backups.set_delete_proof(SLUG, marked_by="u", marked_by_name=None)
    resp = await api_client.post(
        "/backups/delete_proof",
        json={"backup_id": SLUG, "delete_proof": False, "confirmed": True},
    )
    assert resp.status == 403
    assert coresys.backups.is_delete_proof(SLUG)
