"""Test installing OS updates from removable drives through the API."""

import asyncio
from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager
from pathlib import Path
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, PropertyMock, patch

from aiohttp.test_utils import TestClient
from awesomeversion import AwesomeVersion
import pytest

from supervisor.const import CoreState
from supervisor.coresys import CoreSys
from supervisor.host.const import HostFeature
from supervisor.host.manager import HostManager
from supervisor.os import offline_update
from supervisor.os.manager import OSManager
from supervisor.os.offline_update import (
    OfflineUpdateCandidate,
    OfflineUpdates,
    OfflineUpdateVerdict,
)
from supervisor.resolution.const import ContextType, IssueType

# pylint: disable=protected-access

DRIVE_ID = "Generic-Flash-Disk-61BCDDB6"
BUNDLE_NAME = "haos_generic-x86-64-17.0.raucb"
BUNDLE_CONTENT = b"A" * (1024**2 + 4096)

CANDIDATE = OfflineUpdateCandidate(
    drive_id=DRIVE_ID,
    vendor="Generic",
    model="Flash Disk",
    label="UPDATES",
    filesystem="vfat",
    path=f"updates/{BUNDLE_NAME}",
    size=len(BUNDLE_CONTENT),
    board="generic-x86-64",
    version="17.0",
    verdict=OfflineUpdateVerdict.OK,
)


@pytest.mark.parametrize("supported", [True, False])
async def test_api_os_info_offline_update(
    api_client_with_prefix: tuple[TestClient, str], supported: bool
) -> None:
    """Test OS info reports whether updates can be installed from a drive."""
    api_client, prefix = api_client_with_prefix

    with patch.object(
        OSManager, "offline_update_supported", new=PropertyMock(return_value=supported)
    ):
        resp = await api_client.get(f"{prefix}/os/info")

    assert (await resp.json())["data"]["offline_update"] is supported


async def test_api_os_info_offline_update_without_os(
    api_client_with_prefix: tuple[TestClient, str],
) -> None:
    """Test installing from a drive is not offered without Home Assistant OS."""
    api_client, prefix = api_client_with_prefix

    resp = await api_client.get(f"{prefix}/os/info")

    assert (await resp.json())["data"]["offline_update"] is False


async def test_api_os_offline_update_candidates(
    api_client_with_prefix: tuple[TestClient, str],
) -> None:
    """Test listing the update files on removable drives."""
    api_client, prefix = api_client_with_prefix

    with (
        patch.object(
            OSManager, "offline_update_supported", new=PropertyMock(return_value=True)
        ),
        patch.object(OfflineUpdates, "discover", AsyncMock(return_value=[CANDIDATE])),
    ):
        resp = await api_client.get(f"{prefix}/os/offline_update/candidates")

    assert resp.status == 200
    assert (await resp.json())["data"] == {
        "candidates": [
            {
                "drive_id": DRIVE_ID,
                "vendor": "Generic",
                "model": "Flash Disk",
                "label": "UPDATES",
                "filesystem": "vfat",
                "path": f"updates/{BUNDLE_NAME}",
                "filename": BUNDLE_NAME,
                "size": len(BUNDLE_CONTENT),
                "board": "generic-x86-64",
                "version": "17.0",
                "verdict": "ok",
                "kind": "bundle",
            }
        ]
    }


async def test_api_os_offline_update_candidates_unsupported(
    api_client_with_prefix: tuple[TestClient, str],
) -> None:
    """Test nothing is listed, and no drive touched, without Home Assistant OS."""
    api_client, prefix = api_client_with_prefix

    with patch.object(OfflineUpdates, "discover", AsyncMock()) as discover:
        resp = await api_client.get(f"{prefix}/os/offline_update/candidates")

    assert resp.status == 200
    assert (await resp.json())["data"] == {"candidates": []}
    discover.assert_not_awaited()


@pytest.mark.parametrize(
    "body",
    [
        pytest.param({}, id="empty"),
        pytest.param({"drive_id": DRIVE_ID}, id="no-path"),
        pytest.param({"path": BUNDLE_NAME}, id="no-drive"),
        pytest.param({"drive_id": DRIVE_ID, "path": ""}, id="empty-path"),
        pytest.param({"drive_id": "", "path": BUNDLE_NAME}, id="empty-drive"),
        pytest.param({"drive_id": DRIVE_ID, "path": 1}, id="path-not-text"),
        pytest.param({"drive_id": DRIVE_ID, "path": "a\x00b"}, id="control-character"),
        pytest.param(
            {"drive_id": DRIVE_ID, "path": BUNDLE_NAME, "force": True}, id="force"
        ),
        pytest.param(
            {"drive_id": DRIVE_ID, "path": BUNDLE_NAME, "version": "1.0"}, id="version"
        ),
    ],
)
async def test_api_os_offline_update_invalid_body(
    api_client_with_prefix: tuple[TestClient, str],
    coresys: CoreSys,
    body: dict[str, Any],
) -> None:
    """Test only a drive and a path are accepted, there are no extra options."""
    api_client, prefix = api_client_with_prefix

    with patch.object(OSManager, "update_from_file", AsyncMock()) as update:
        resp = await api_client.post(f"{prefix}/os/offline_update", json=body)

    assert resp.status == 400
    update.assert_not_called()


async def test_api_os_offline_update_without_os(
    api_client_with_prefix: tuple[TestClient, str],
    coresys: CoreSys,
) -> None:
    """Test installing from a drive requires Home Assistant OS."""
    api_client, prefix = api_client_with_prefix
    await coresys.core.set_state(CoreState.RUNNING)

    resp = await api_client.post(
        f"{prefix}/os/offline_update",
        json={"drive_id": DRIVE_ID, "path": f"updates/{BUNDLE_NAME}"},
    )

    assert resp.status == 400
    assert "no Home Assistant OS available" in (await resp.json())["message"]


@pytest.fixture(name="stick")
def fixture_stick(tmp_path: Path) -> Path:
    """Return the folder a removable drive is mounted at, holding a bundle."""
    stick = tmp_path / "stick"
    (stick / "updates").mkdir(parents=True)
    (stick / "updates" / BUNDLE_NAME).write_bytes(BUNDLE_CONTENT)
    return stick


@pytest.fixture(name="drive")
async def fixture_drive(
    coresys: CoreSys, stick: Path, os_available: None
) -> AsyncIterator[None]:
    """Make a removable drive with a bundle on it available."""
    await coresys.core.set_state(CoreState.RUNNING)
    coresys.os._board = "generic-x86-64"

    @asynccontextmanager
    async def fake_mounted(self: OfflineUpdates, uuid: str) -> AsyncIterator[Path]:
        yield stick

    block = SimpleNamespace(
        id_uuid="ABCD-1234",
        id_label="UPDATES",
        id_type="vfat",
        device=Path("/dev/sda1"),
    )
    removable = SimpleNamespace(
        id=DRIVE_ID, vendor="Generic", model="Flash Disk", removable=True
    )
    with (
        patch.object(
            HostManager,
            "features",
            new=PropertyMock(return_value=[HostFeature.MOUNT, HostFeature.DISK]),
        ),
        patch.object(OfflineUpdates, "_mounted", fake_mounted),
        patch.object(OfflineUpdates, "_remove_stale_mounts", AsyncMock()),
        patch.object(
            OfflineUpdates, "_removable_filesystems", return_value=[(removable, block)]
        ),
        patch.object(offline_update, "_free_space", return_value=10 * 1024**3),
    ):
        yield


@pytest.fixture(name="rauc")
def fixture_rauc(coresys: CoreSys) -> Iterator[SimpleNamespace]:
    """Replace Rauc, returning the install mock."""
    rauc = SimpleNamespace(install=AsyncMock())

    @asynccontextmanager
    async def signal_completed() -> AsyncIterator[SimpleNamespace]:
        yield SimpleNamespace(wait_for_signal=AsyncMock(return_value=[0]))

    with (
        patch.object(coresys.dbus.rauc, "signal_completed", signal_completed),
        patch.object(coresys.dbus.rauc, "install", rauc.install),
        patch.object(coresys.dbus.rauc, "update", AsyncMock()),
    ):
        yield rauc


@pytest.mark.usefixtures("drive", "tmp_supervisor_data", "path_extern")
async def test_api_os_offline_update_candidates_from_drive(
    api_client_with_prefix: tuple[TestClient, str],
    coresys: CoreSys,
) -> None:
    """Test a file on a drive is listed with the data the interface needs."""
    api_client, prefix = api_client_with_prefix

    with patch.object(
        OSManager, "offline_update_supported", new=PropertyMock(return_value=True)
    ):
        resp = await api_client.get(f"{prefix}/os/offline_update/candidates")

    assert resp.status == 200
    [candidate] = (await resp.json())["data"]["candidates"]
    assert candidate["drive_id"] == DRIVE_ID
    assert candidate["path"] == f"updates/{BUNDLE_NAME}"
    assert candidate["version"] == "17.0"
    assert candidate["verdict"] == "ok"


@pytest.mark.usefixtures("drive", "tmp_supervisor_data", "path_extern")
async def test_api_os_offline_update_starts_background_job(
    api_client_with_prefix: tuple[TestClient, str],
    coresys: CoreSys,
    rauc: SimpleNamespace,
) -> None:
    """Test the install runs as a job the interface can follow."""
    api_client, prefix = api_client_with_prefix
    copying = asyncio.Event()
    finish = asyncio.Event()
    installed = asyncio.Event()

    async def copy_bundle(
        self: OfflineUpdates, bundle: Any, target: Path, on_progress: Any
    ) -> str:
        await coresys.run_in_executor(target.write_bytes, BUNDLE_CONTENT)
        copying.set()
        await finish.wait()
        return "sha"

    async def install(source: Path) -> None:
        installed.set()

    rauc.install.side_effect = install

    with patch.object(OfflineUpdates, "copy_bundle", copy_bundle):
        resp = await api_client.post(
            f"{prefix}/os/offline_update",
            json={"drive_id": DRIVE_ID, "path": f"updates/{BUNDLE_NAME}"},
        )
        assert resp.status == 200
        job_id = (await resp.json())["data"]["job_id"]

        await asyncio.wait_for(copying.wait(), 5)
        job = coresys.jobs.get_job(job_id)
        assert (job.name, job.reference, job.stage) == (
            "os_manager_update_from_file",
            DRIVE_ID,
            "copying",
        )

        finish.set()
        await asyncio.wait_for(installed.wait(), 5)

    rauc.install.assert_awaited_once()


@pytest.mark.usefixtures("drive", "tmp_supervisor_data", "path_extern")
async def test_api_os_offline_update_installs_and_requires_reboot(
    api_client_with_prefix: tuple[TestClient, str],
    coresys: CoreSys,
    rauc: SimpleNamespace,
) -> None:
    """Test a finished install waits for a reboot instead of rebooting."""
    api_client, prefix = api_client_with_prefix

    with patch.object(coresys.host.control, "reboot") as reboot:
        resp = await api_client.post(
            f"{prefix}/os/offline_update",
            json={"drive_id": DRIVE_ID, "path": f"updates/{BUNDLE_NAME}"},
        )
        assert resp.status == 200
        await asyncio.wait_for(_wait_for_pending(coresys), 5)

    reboot.assert_not_called()
    assert coresys.os.version_pending == AwesomeVersion("17.0")
    assert (IssueType.REBOOT_REQUIRED, ContextType.SYSTEM) in {
        (issue.type, issue.context) for issue in coresys.resolution.issues
    }


async def _wait_for_pending(coresys: CoreSys) -> None:
    """Wait until the installed update is waiting for a reboot."""
    while coresys.os.version_pending is None:
        await asyncio.sleep(0.01)


@pytest.mark.parametrize(
    ("drive_id", "path"),
    [
        pytest.param(DRIVE_ID, BUNDLE_NAME, id="wrong-folder"),
        pytest.param(DRIVE_ID, f"../{BUNDLE_NAME}", id="outside"),
        pytest.param("Another-Drive", f"updates/{BUNDLE_NAME}", id="other-drive"),
    ],
)
@pytest.mark.usefixtures("drive", "tmp_supervisor_data", "path_extern")
async def test_api_os_offline_update_refuses_unlisted_file(
    api_client_with_prefix: tuple[TestClient, str],
    rauc: SimpleNamespace,
    drive_id: str,
    path: str,
) -> None:
    """Test a file the scan did not list is refused with a clear error."""
    api_client, prefix = api_client_with_prefix

    resp = await api_client.post(
        f"{prefix}/os/offline_update", json={"drive_id": drive_id, "path": path}
    )

    assert resp.status == 404
    result = await resp.json()
    assert result["error_key"] == "hassos_offline_update_not_found_error"
    rauc.install.assert_not_awaited()


@pytest.mark.usefixtures("drive", "tmp_supervisor_data", "path_extern")
async def test_api_os_offline_update_refuses_downgrade(
    api_client_with_prefix: tuple[TestClient, str],
    coresys: CoreSys,
    rauc: SimpleNamespace,
) -> None:
    """Test a file that is not newer is refused and cannot be forced."""
    api_client, prefix = api_client_with_prefix
    coresys.os._version_pending = AwesomeVersion("17.0")

    resp = await api_client.post(
        f"{prefix}/os/offline_update",
        json={"drive_id": DRIVE_ID, "path": f"updates/{BUNDLE_NAME}"},
    )

    assert resp.status == 400
    result = await resp.json()
    assert result["error_key"] == "hassos_offline_update_not_allowed_error"
    assert "not newer" in result["message"]
    rauc.install.assert_not_awaited()
