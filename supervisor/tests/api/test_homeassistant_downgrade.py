"""Test going back to an older Home Assistant version through the API."""

from collections.abc import Iterator
from contextlib import contextmanager
from unittest.mock import AsyncMock, MagicMock, PropertyMock, patch

from aiohttp.test_utils import TestClient
from awesomeversion import AwesomeVersion
import pytest

from supervisor.backups.manager import BackupManager
from supervisor.const import CoreState
from supervisor.coresys import CoreSys
from supervisor.docker.homeassistant import DockerHomeAssistant
from supervisor.docker.interface import DockerInterface
from supervisor.exceptions import BackupInvalidError
from supervisor.homeassistant import downgrade
from supervisor.homeassistant.api import HomeAssistantAPI
import supervisor.homeassistant.core as ha_core

INSTALLED = "2026.11.1.527"
OLDER = "2026.11.1.525"
NEWER = "2026.11.1.528"


pytestmark = pytest.mark.usefixtures("tmp_supervisor_data")


@pytest.fixture(autouse=True)
async def running_state(coresys: CoreSys) -> None:
    """Start the system fully and install the newer Core."""
    await coresys.core.set_state(CoreState.RUNNING)
    coresys.hardware.disk.get_disk_free_space = lambda x: 5000
    coresys.homeassistant.version = AwesomeVersion(INSTALLED)


def _backup(*, valid: bool = True, loads: bool = True, size: int = 1000) -> MagicMock:
    backup = MagicMock()
    backup.slug = "abc123"
    backup.date = "2026-11-19T21:54:00+00:00"
    backup.size_bytes = size
    backup.location = None
    backup.validate_backup = (
        AsyncMock()
        if valid
        else AsyncMock(side_effect=BackupInvalidError("Unreadable backup"))
    )
    backup.load = AsyncMock(return_value=loads)
    return backup


@contextmanager
def _install(
    coresys: CoreSys, backup_result: MagicMock | None, active_jobs: list | None = None
) -> Iterator[tuple[AsyncMock, MagicMock]]:
    """Mock the backup and the image install; yield both mocks."""
    installed = MagicMock()

    async def mock_update(*args, **kwargs):
        installed(*args, **kwargs)

    jobs = iter(active_jobs or [])
    do_backup = AsyncMock(return_value=backup_result)
    with (
        patch.object(BackupManager, "do_backup_partial", new=do_backup),
        patch.object(
            BackupManager,
            "active_job",
            new=PropertyMock(side_effect=lambda: next(jobs, None)),
        ),
        patch.object(ha_core, "WAIT_POLL_SECONDS", 0),
        patch.object(DockerInterface, "update", new=mock_update),
        patch.object(DockerInterface, "is_running", AsyncMock(return_value=True)),
        patch.object(
            DockerHomeAssistant,
            "version",
            new=PropertyMock(return_value=AwesomeVersion(INSTALLED)),
        ),
        patch.object(
            HomeAssistantAPI,
            "get_config",
            return_value={"components": ["http", "frontend", "websocket_api"]},
        ),
        patch.object(ha_core, "verify_frontend", AsyncMock(return_value=True)),
        patch.object(DockerInterface, "cleanup"),
    ):
        yield do_backup, installed


async def test_going_back_makes_backup_first(
    api_client: TestClient, coresys: CoreSys
) -> None:
    """Test going back without asking for a backup still makes and checks one."""
    backup = _backup()
    with _install(coresys, backup) as (do_backup, installed):
        resp = await api_client.post(
            "/core/update", json={"version": OLDER, "backup": False}
        )

    assert resp.status == 200
    do_backup.assert_awaited_once()
    assert do_backup.call_args.kwargs["homeassistant"] is True
    backup.validate_backup.assert_awaited_once()
    installed.assert_called_once()
    assert str(installed.call_args.args[1]) == OLDER

    status = await (await api_client.get("/core/downgrade_status")).json()
    state = status["data"]["downgrade"]
    assert state["to_version"] == OLDER
    assert state["stage"] == "installing"
    assert state["backup"] == {
        "slug": "abc123",
        "date": "2026-11-19T21:54:00+00:00",
        "size_bytes": 1000,
    }
    assert state["skipped_by_pass"] is False


@pytest.mark.parametrize(
    ("backup_result", "reason"),
    [
        pytest.param(None, "failed", id="backup-failed"),
        pytest.param(_backup(valid=False), "check_failed", id="check-raises"),
        pytest.param(_backup(loads=False), "check_failed", id="check-unreadable"),
        pytest.param(_backup(size=0), "check_failed", id="check-empty"),
    ],
)
async def test_going_back_refused_without_good_backup(
    api_client: TestClient,
    coresys: CoreSys,
    backup_result: MagicMock | None,
    reason: str,
) -> None:
    """Test a backup that did not finish or failed its check stops going back."""
    with _install(coresys, backup_result) as (_, installed):
        resp = await api_client.post("/core/update", json={"version": OLDER})

    assert resp.status == 400
    body = await resp.json()
    assert body["error_key"] == "homeassistant_downgrade_backup_error"
    assert body["extra_fields"]["reason"] == reason
    installed.assert_not_called()
    assert coresys.homeassistant.version == AwesomeVersion(INSTALLED)
    status = await (await api_client.get("/core/downgrade_status")).json()
    assert status["data"]["downgrade"]["stage"] == "failed"
    assert status["data"]["downgrade"]["reason"] == reason


async def test_going_back_waits_for_running_backup(
    api_client: TestClient, coresys: CoreSys
) -> None:
    """Test going back waits for a backup that is already running."""
    running = MagicMock()
    with _install(coresys, _backup(), [running, running, running]) as (
        do_backup,
        installed,
    ):
        resp = await api_client.post("/core/update", json={"version": OLDER})

    assert resp.status == 200
    do_backup.assert_awaited_once()
    installed.assert_called_once()


async def test_going_back_times_out_waiting(
    api_client: TestClient, coresys: CoreSys
) -> None:
    """Test going back gives up when the running backup never ends."""
    running = MagicMock()
    with (
        _install(coresys, _backup(), [running] * 50) as (do_backup, installed),
        patch.object(ha_core, "WAIT_FOR_RUNNING_BACKUP_SECONDS", -1),
    ):
        resp = await api_client.post("/core/update", json={"version": OLDER})

    assert resp.status == 400
    assert (await resp.json())["extra_fields"]["reason"] == "timed_out"
    do_backup.assert_not_awaited()
    installed.assert_not_called()


async def test_going_back_stopped_while_waiting(
    api_client: TestClient, coresys: CoreSys
) -> None:
    """Test a stop asked while waiting for a backup leaves Core unchanged."""
    running = MagicMock()
    core = coresys.homeassistant.core
    calls = 0

    def active_job() -> MagicMock:
        nonlocal calls
        calls += 1
        if calls == 2:
            core.request_downgrade_stop()
        return running

    with (
        _install(coresys, _backup()) as (do_backup, installed),
        patch.object(
            BackupManager, "active_job", new=PropertyMock(side_effect=active_job)
        ),
    ):
        resp = await api_client.post("/core/update", json={"version": OLDER})

    assert resp.status == 400
    assert (await resp.json())["extra_fields"]["reason"] == "stopped"
    do_backup.assert_not_awaited()
    installed.assert_not_called()


async def test_stop_refused_when_not_going_back(api_client: TestClient) -> None:
    """Test a stop is refused when nothing is going back."""
    resp = await api_client.post("/core/downgrade_stop")
    assert resp.status == 400


async def test_newer_version_unaffected(
    api_client: TestClient, coresys: CoreSys
) -> None:
    """Test an update to a newer version without a backup makes none."""
    with _install(coresys, _backup()) as (do_backup, installed):
        resp = await api_client.post(
            "/core/update", json={"version": NEWER, "backup": False}
        )

    assert resp.status == 200
    do_backup.assert_not_awaited()
    installed.assert_called_once()
    status = await (await api_client.get("/core/downgrade_status")).json()
    assert status["data"]["downgrade"] is None


async def _issue_pass(api_client: TestClient, version: str, holder: str) -> str:
    resp = await api_client.post(
        "/core/downgrade_pass",
        json={"version": version, "skip_backup_holder": holder},
    )
    assert resp.status == 200
    return (await resp.json())["data"]["skip_backup_pass"]


async def test_skip_pass_goes_back_without_backup_once(
    api_client: TestClient, coresys: CoreSys
) -> None:
    """Test a valid pass skips the backup, once."""
    token = await _issue_pass(api_client, OLDER, "user-a")
    with _install(coresys, _backup()) as (do_backup, installed):
        resp = await api_client.post(
            "/core/update",
            json={
                "version": OLDER,
                "skip_backup_pass": token,
                "skip_backup_holder": "user-a",
            },
        )
    assert resp.status == 200
    do_backup.assert_not_awaited()
    installed.assert_called_once()
    status = await (await api_client.get("/core/downgrade_status")).json()
    assert status["data"]["downgrade"]["skipped_by_pass"] is True
    assert status["data"]["downgrade"]["backup"] is None

    coresys.homeassistant.version = AwesomeVersion(INSTALLED)
    with _install(coresys, _backup()) as (do_backup, installed):
        resp = await api_client.post(
            "/core/update",
            json={
                "version": OLDER,
                "skip_backup_pass": token,
                "skip_backup_holder": "user-a",
            },
        )
    assert resp.status == 400
    assert (await resp.json())["error_key"] == "homeassistant_downgrade_skip_pass_error"
    do_backup.assert_not_awaited()
    installed.assert_not_called()


@pytest.mark.parametrize(
    ("issued_for", "used_for", "holder"),
    [
        pytest.param(OLDER, "2026.11.1.524", "user-a", id="wrong-version"),
        pytest.param(OLDER, OLDER, "user-b", id="wrong-user"),
        pytest.param(OLDER, NEWER, "user-a", id="not-going-back"),
    ],
)
async def test_skip_pass_refused(
    api_client: TestClient,
    coresys: CoreSys,
    issued_for: str,
    used_for: str,
    holder: str,
) -> None:
    """Test a pass for another version or user is refused before anything starts."""
    token = await _issue_pass(api_client, issued_for, "user-a")
    with _install(coresys, _backup()) as (do_backup, installed):
        resp = await api_client.post(
            "/core/update",
            json={
                "version": used_for,
                "skip_backup_pass": token,
                "skip_backup_holder": holder,
            },
        )

    assert resp.status == 400
    assert (await resp.json())["error_key"] == "homeassistant_downgrade_skip_pass_error"
    do_backup.assert_not_awaited()
    installed.assert_not_called()


async def test_skip_pass_expired(api_client: TestClient, coresys: CoreSys) -> None:
    """Test an expired pass is refused."""
    with patch.object(downgrade, "SKIP_PASS_LIFETIME_SECONDS", -1):
        token = await _issue_pass(api_client, OLDER, "user-a")
    with _install(coresys, _backup()) as (do_backup, installed):
        resp = await api_client.post(
            "/core/update",
            json={
                "version": OLDER,
                "skip_backup_pass": token,
                "skip_backup_holder": "user-a",
            },
        )

    assert resp.status == 400
    do_backup.assert_not_awaited()
    installed.assert_not_called()


async def test_skip_pass_not_issued_for_newer(api_client: TestClient) -> None:
    """Test a pass is only issued for an older version."""
    resp = await api_client.post(
        "/core/downgrade_pass",
        json={"version": NEWER, "skip_backup_holder": "user-a"},
    )
    assert resp.status == 400


async def test_restore_installs_older_without_backup(coresys: CoreSys) -> None:
    """Test a backup restore installs its own older version without a new backup."""
    with _install(coresys, _backup()) as (do_backup, installed):
        await coresys.homeassistant.core.update(
            AwesomeVersion(OLDER), restoring_backup=True
        )

    do_backup.assert_not_awaited()
    installed.assert_called_once()
