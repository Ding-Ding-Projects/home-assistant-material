"""Test installing OS updates from removable drives."""

import asyncio
from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager
import errno
import hashlib
import logging
from pathlib import Path
import sys
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, PropertyMock, patch

from awesomeversion import AwesomeVersion
import pytest

from supervisor.const import CoreState
from supervisor.coresys import CoreSys
from supervisor.exceptions import (
    HassOSJobError,
    HassOSOfflineUpdateNotAllowedError,
    HassOSOfflineUpdateNotFoundError,
    HassOSOfflineUpdateRejectedError,
    HassOSUpdateError,
    HassOSUpdateInProgressError,
    JobException,
    MountActivationError,
)
from supervisor.host.const import HostFeature
from supervisor.host.manager import HostManager
from supervisor.mounts.mount import DiskMount
from supervisor.os import offline_update
from supervisor.os.data_disk import DataDisk
from supervisor.os.offline_update import (
    BUNDLE_MIN_SIZE,
    RE_BUNDLE_NAME,
    OfflineUpdates,
    OfflineUpdateVerdict,
    evaluate_bundle,
)
from supervisor.resolution.const import ContextType, IssueType

# pylint: disable=protected-access

MIB = 1024**2
BUNDLE_NAME = "haos_generic-x86-64-13.0.raucb"
BUNDLE_CONTENT = b"A" * (BUNDLE_MIN_SIZE + 4096)

DRIVE_PATH = "/org/freedesktop/UDisks2/drives/Generic_Flash_Disk_61BCDDB6"


def _drive(**overrides: Any) -> SimpleNamespace:
    fields = {
        "id": "Generic-Flash-Disk-61BCDDB6",
        "vendor": "Generic",
        "model": "Flash Disk",
        "removable": True,
    }
    return SimpleNamespace(**(fields | overrides))


def _block(**overrides: Any) -> SimpleNamespace:
    fields = {
        "drive": DRIVE_PATH,
        "filesystem": object(),
        "id_usage": "filesystem",
        "id_type": "vfat",
        "id_uuid": "ABCD-1234",
        "id_label": "UPDATES",
        "hint_system": False,
        "device": Path("/dev/sda1"),
    }
    return SimpleNamespace(**(fields | overrides))


@pytest.mark.parametrize(
    ("name", "board", "version"),
    [
        ("haos_generic-x86-64-14.2.raucb", "generic-x86-64", "14.2"),
        ("haos_odroid-n2-17.0.dev20260101.raucb", "odroid-n2", "17.0.dev20260101"),
        ("haos_rpi4-64-16.0.rc1.raucb", "rpi4-64", "16.0.rc1"),
        ("haos_yellow-14.2.1.raucb", "yellow", "14.2.1"),
    ],
)
def test_bundle_name_accepted(name: str, board: str, version: str) -> None:
    """Test the file names of release assets are accepted."""
    match = RE_BUNDLE_NAME.match(name)
    assert match
    assert (match["board"], match["version"]) == (board, version)


@pytest.mark.parametrize(
    "name",
    [
        "HAOS_generic-x86-64-14.2.raucb",
        "hassos_generic-x86-64-14.2.raucb",
        "haos_generic-x86-64-14.2.raucb.exe",
        "haos_generic-x86-64-14.2.raucb\n",
        "haos_generic-x86-64-14.raucb",
        "haos_-14.2.raucb",
        "haos_generic x86-14.2.raucb",
        "../haos_generic-x86-64-14.2.raucb",
        "updates/haos_generic-x86-64-14.2.raucb",
        "haos_generic-x86-64-latest.raucb",
        "update.raucb",
    ],
)
def test_bundle_name_rejected(name: str) -> None:
    """Test every other file name is rejected."""
    assert RE_BUNDLE_NAME.match(name) is None


def _evaluate(**overrides: Any) -> OfflineUpdateVerdict:
    arguments = {
        "board": "generic-x86-64",
        "version": AwesomeVersion("13.0"),
        "size": 100 * MIB,
        "installed_board": "generic-x86-64",
        "installed_version": AwesomeVersion("12.0"),
        "pending_version": None,
        "free_space": 10 * 1024**3,
    }
    return evaluate_bundle(**(arguments | overrides))


@pytest.mark.parametrize(
    ("overrides", "verdict"),
    [
        pytest.param({}, OfflineUpdateVerdict.OK, id="ok"),
        pytest.param(
            {"board": "odroid-n2"}, OfflineUpdateVerdict.WRONG_BOARD, id="wrong-board"
        ),
        pytest.param(
            {"installed_board": "intel-nuc"},
            OfflineUpdateVerdict.OK,
            id="renamed-board",
        ),
        pytest.param(
            {"installed_board": "intel-nuc", "board": "intel-nuc"},
            OfflineUpdateVerdict.WRONG_BOARD,
            id="old-board-name",
        ),
        pytest.param(
            {"version": AwesomeVersion("12.0")},
            OfflineUpdateVerdict.NOT_NEWER,
            id="same-version",
        ),
        pytest.param(
            {"version": AwesomeVersion("11.5")},
            OfflineUpdateVerdict.NOT_NEWER,
            id="older-version",
        ),
        pytest.param(
            {"pending_version": AwesomeVersion("13.0")},
            OfflineUpdateVerdict.NOT_NEWER,
            id="pending-version",
        ),
        pytest.param(
            {"pending_version": AwesomeVersion("13.1")},
            OfflineUpdateVerdict.NOT_NEWER,
            id="older-than-pending",
        ),
        pytest.param(
            {"size": 2 * 1024**3 + 1},
            OfflineUpdateVerdict.TOO_LARGE,
            id="too-large",
        ),
        pytest.param(
            {"free_space": 100 * MIB + 255 * MIB},
            OfflineUpdateVerdict.NO_SPACE,
            id="no-space",
        ),
        pytest.param(
            {"free_space": 100 * MIB + 256 * MIB},
            OfflineUpdateVerdict.OK,
            id="enough-space",
        ),
        pytest.param(
            {"installed_version": None},
            OfflineUpdateVerdict.UNSUPPORTED,
            id="unknown-version",
        ),
        pytest.param(
            {"installed_board": None},
            OfflineUpdateVerdict.UNSUPPORTED,
            id="unknown-board",
        ),
    ],
)
def test_evaluate_bundle(overrides: dict[str, Any], verdict: OfflineUpdateVerdict):
    """Test the verdict for a bundle."""
    assert _evaluate(**overrides) == verdict


@pytest.fixture(name="stick")
def fixture_stick(tmp_path: Path) -> Path:
    """Return the folder a removable drive is mounted at."""
    stick = tmp_path / "stick"
    stick.mkdir()
    return stick


def _write_bundle(path: Path, content: bytes = BUNDLE_CONTENT) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    return path


@pytest.fixture(name="mount_events")
def fixture_mount_events(stick: Path) -> Iterator[list[str]]:
    """Replace the mounting of drives, returning the order of mounts and releases."""
    events: list[str] = []

    @asynccontextmanager
    async def fake_mounted(self: OfflineUpdates, uuid: str) -> AsyncIterator[Path]:
        events.append(f"mount {uuid}")
        try:
            yield stick
        finally:
            events.append(f"release {uuid}")

    with (
        patch.object(OfflineUpdates, "_mounted", fake_mounted),
        patch.object(OfflineUpdates, "_remove_stale_mounts", AsyncMock()),
        patch.object(
            OfflineUpdates,
            "_removable_filesystems",
            return_value=[(_drive(), _block())],
        ),
        patch.object(offline_update, "_free_space", return_value=10 * 1024**3),
    ):
        yield events


@pytest.fixture(name="offline_os")
async def fixture_offline_os(coresys: CoreSys) -> AsyncIterator[None]:
    """Make the system look like a Home Assistant OS installation."""
    await coresys.core.set_state(CoreState.RUNNING)
    coresys.os._available = True
    coresys.os._board = "generic-x86-64"
    coresys.os._os_name = "haos"
    coresys.os._version = AwesomeVersion("12.0")
    with patch.object(
        HostManager,
        "features",
        new=PropertyMock(return_value=[HostFeature.MOUNT, HostFeature.DISK]),
    ):
        yield


@pytest.mark.usefixtures("offline_os", "mount_events")
async def test_discover_lists_candidates(coresys: CoreSys, stick: Path) -> None:
    """Test bundles in the root and the known folders are listed."""
    _write_bundle(stick / BUNDLE_NAME)
    _write_bundle(stick / "updates" / "haos_generic-x86-64-14.0.raucb")
    _write_bundle(stick / "HAOS" / "haos_generic-x86-64-14.1.raucb")
    _write_bundle(stick / "home-assistant" / "haos_odroid-n2-14.2.raucb")
    _write_bundle(stick / "other" / "haos_generic-x86-64-14.3.raucb")
    _write_bundle(stick / "updates" / "deeper" / "haos_generic-x86-64-14.4.raucb")
    _write_bundle(stick / "haos_generic-x86-64-14.5.raucb.part")
    _write_bundle(stick / "Haos_generic-x86-64-14.6.raucb")

    candidates = await coresys.os._offline_updates.discover()

    assert {c.path: c.verdict for c in candidates} == {
        BUNDLE_NAME: OfflineUpdateVerdict.OK,
        "HAOS/haos_generic-x86-64-14.1.raucb": OfflineUpdateVerdict.OK,
        "home-assistant/haos_odroid-n2-14.2.raucb": OfflineUpdateVerdict.WRONG_BOARD,
        "updates/haos_generic-x86-64-14.0.raucb": OfflineUpdateVerdict.OK,
    }


@pytest.mark.usefixtures("offline_os", "mount_events")
async def test_discover_describes_candidate(coresys: CoreSys, stick: Path) -> None:
    """Test everything the interface needs to show a candidate is reported."""
    _write_bundle(stick / "updates" / "haos_generic-x86-64-13.0.raucb")

    candidates = await coresys.os._offline_updates.discover()

    assert [candidate.to_dict() for candidate in candidates] == [
        {
            "drive_id": "Generic-Flash-Disk-61BCDDB6",
            "vendor": "Generic",
            "model": "Flash Disk",
            "label": "UPDATES",
            "filesystem": "vfat",
            "path": "updates/haos_generic-x86-64-13.0.raucb",
            "filename": "haos_generic-x86-64-13.0.raucb",
            "size": len(BUNDLE_CONTENT),
            "board": "generic-x86-64",
            "version": "13.0",
            "verdict": "ok",
            "kind": "bundle",
        }
    ]


@pytest.mark.usefixtures("offline_os", "mount_events")
async def test_discover_ignores_unusable_files(coresys: CoreSys, stick: Path) -> None:
    """Test files that are too small or not regular files are not listed."""
    _write_bundle(stick / "haos_generic-x86-64-13.1.raucb", b"A" * (MIB - 1))
    (stick / "haos_generic-x86-64-13.2.raucb").mkdir()

    assert not await coresys.os._offline_updates.discover()


@pytest.mark.skipif(sys.platform == "win32", reason="Creating links needs privileges")
@pytest.mark.usefixtures("offline_os", "mount_events")
async def test_discover_ignores_links(
    coresys: CoreSys, stick: Path, tmp_path: Path
) -> None:
    """Test links to bundles and links to folders are not followed."""
    outside = _write_bundle(tmp_path / "elsewhere" / BUNDLE_NAME)
    (stick / "haos_generic-x86-64-13.1.raucb").symlink_to(outside)
    (stick / "updates").symlink_to(outside.parent, target_is_directory=True)

    assert not await coresys.os._offline_updates.discover()


@pytest.mark.parametrize(
    ("size_limit", "free_space", "verdict"),
    [
        pytest.param(
            len(BUNDLE_CONTENT) - 1,
            10 * 1024**3,
            OfflineUpdateVerdict.TOO_LARGE,
            id="too-large",
        ),
        pytest.param(
            10 * MIB, len(BUNDLE_CONTENT), OfflineUpdateVerdict.NO_SPACE, id="no-space"
        ),
    ],
)
@pytest.mark.usefixtures("offline_os", "mount_events")
async def test_discover_verdict_limits(
    coresys: CoreSys,
    stick: Path,
    size_limit: int,
    free_space: int,
    verdict: OfflineUpdateVerdict,
) -> None:
    """Test files that are too large or do not fit are listed with the reason."""
    _write_bundle(stick / BUNDLE_NAME)

    with (
        patch.object(offline_update, "BUNDLE_MAX_SIZE", size_limit),
        patch.object(offline_update, "_free_space", return_value=free_space),
    ):
        candidates = await coresys.os._offline_updates.discover()

    assert [candidate.verdict for candidate in candidates] == [verdict]


@pytest.mark.usefixtures("offline_os", "mount_events")
async def test_discover_not_newer_than_pending(coresys: CoreSys, stick: Path) -> None:
    """Test a bundle equal to the version waiting for a reboot is not newer."""
    _write_bundle(stick / BUNDLE_NAME)
    coresys.os._version_pending = AwesomeVersion("13.0")

    candidates = await coresys.os._offline_updates.discover()

    assert [candidate.verdict for candidate in candidates] == [
        OfflineUpdateVerdict.NOT_NEWER
    ]


@pytest.mark.usefixtures("offline_os")
async def test_discover_releases_every_mount(
    coresys: CoreSys, stick: Path, mount_events: list[str]
) -> None:
    """Test all drives are released again once the scan is done."""
    _write_bundle(stick / BUNDLE_NAME)
    drives = [
        (_drive(id="first"), _block(id_uuid="AAAA-0001")),
        (_drive(id="second"), _block(id_uuid="BBBB-0002")),
    ]

    with patch.object(OfflineUpdates, "_removable_filesystems", return_value=drives):
        await coresys.os._offline_updates.discover()

    assert mount_events == [
        "mount AAAA-0001",
        "mount BBBB-0002",
        "release BBBB-0002",
        "release AAAA-0001",
    ]


@pytest.mark.usefixtures("offline_os")
async def test_discover_skips_drive_that_cannot_be_mounted(
    coresys: CoreSys, stick: Path
) -> None:
    """Test a drive that fails to mount does not hide the other drives."""
    _write_bundle(stick / BUNDLE_NAME)
    drives = [
        (_drive(id="broken"), _block(id_uuid="AAAA-0001")),
        (_drive(id="working"), _block(id_uuid="BBBB-0002")),
    ]

    @asynccontextmanager
    async def fake_mounted(self: OfflineUpdates, uuid: str) -> AsyncIterator[Path]:
        if uuid == "AAAA-0001":
            raise MountActivationError(name="offline-update-test")
        yield stick

    with (
        patch.object(OfflineUpdates, "_mounted", fake_mounted),
        patch.object(OfflineUpdates, "_remove_stale_mounts", AsyncMock()),
        patch.object(OfflineUpdates, "_removable_filesystems", return_value=drives),
        patch.object(offline_update, "_free_space", return_value=10 * 1024**3),
    ):
        candidates = await coresys.os._offline_updates.discover()

    assert [candidate.drive_id for candidate in candidates] == ["working"]


@pytest.mark.parametrize(
    "block_overrides",
    [
        pytest.param({"filesystem": None}, id="no-filesystem"),
        pytest.param({"id_usage": "crypto"}, id="not-a-filesystem"),
        pytest.param({"id_type": "iso9660"}, id="unsupported-filesystem"),
        pytest.param({"id_uuid": ""}, id="no-uuid"),
        pytest.param({"hint_system": True}, id="system-device"),
    ],
)
async def test_removable_filesystems_skips_blocks(
    coresys: CoreSys, block_overrides: dict[str, Any]
) -> None:
    """Test block devices that cannot hold an update are never mounted."""
    coresys.os._available = True
    with (
        patch.object(
            HostManager, "features", new=PropertyMock(return_value=[HostFeature.MOUNT])
        ),
        patch.object(
            type(coresys.dbus.udisks2),
            "is_connected",
            new=PropertyMock(return_value=True),
        ),
        patch.object(
            type(coresys.dbus.udisks2),
            "block_devices",
            new=PropertyMock(return_value=[_block(**block_overrides)]),
        ),
        patch.object(coresys.dbus.udisks2, "get_drive", return_value=_drive()),
    ):
        assert not coresys.os._offline_updates._removable_filesystems()


@pytest.mark.parametrize(
    "drive_overrides",
    [
        pytest.param({"removable": False}, id="not-removable"),
        pytest.param({"id": "BJTD4R-0x97cde291"}, id="data-disk"),
    ],
)
async def test_removable_filesystems_skips_drives(
    coresys: CoreSys, drive_overrides: dict[str, Any]
) -> None:
    """Test only removable drives other than the data disk are used."""
    with (
        patch.object(
            HostManager, "features", new=PropertyMock(return_value=[HostFeature.MOUNT])
        ),
        patch.object(
            type(coresys.dbus.udisks2),
            "is_connected",
            new=PropertyMock(return_value=True),
        ),
        patch.object(
            type(coresys.dbus.udisks2),
            "block_devices",
            new=PropertyMock(return_value=[_block()]),
        ),
        patch.object(
            coresys.dbus.udisks2, "get_drive", return_value=_drive(**drive_overrides)
        ),
        patch.object(
            DataDisk, "disk_used_id", new=PropertyMock(return_value="BJTD4R-0x97cde291")
        ),
    ):
        assert not coresys.os._offline_updates._removable_filesystems()


async def test_removable_filesystems_uses_removable_drive(coresys: CoreSys) -> None:
    """Test a filesystem on a removable drive is used."""
    block = _block()
    drive = _drive()
    with (
        patch.object(
            HostManager, "features", new=PropertyMock(return_value=[HostFeature.MOUNT])
        ),
        patch.object(
            type(coresys.dbus.udisks2),
            "is_connected",
            new=PropertyMock(return_value=True),
        ),
        patch.object(
            type(coresys.dbus.udisks2),
            "block_devices",
            new=PropertyMock(return_value=[block]),
        ),
        patch.object(coresys.dbus.udisks2, "get_drive", return_value=drive),
        patch.object(
            DataDisk, "disk_used_id", new=PropertyMock(return_value="BJTD4R-0x97cde291")
        ),
    ):
        assert coresys.os._offline_updates._removable_filesystems() == [(drive, block)]


async def test_removable_filesystems_need_mount_support(coresys: CoreSys) -> None:
    """Test nothing is listed when the host cannot mount drives."""
    with (
        patch.object(HostManager, "features", new=PropertyMock(return_value=[])),
        patch.object(
            type(coresys.dbus.udisks2),
            "is_connected",
            new=PropertyMock(return_value=True),
        ),
        patch.object(
            type(coresys.dbus.udisks2),
            "block_devices",
            new=PropertyMock(return_value=[_block()]),
        ),
    ):
        assert not coresys.os._offline_updates._removable_filesystems()


@pytest.mark.usefixtures("tmp_supervisor_data", "path_extern")
async def test_mount_released_when_mount_fails(coresys: CoreSys) -> None:
    """Test the temporary mount is taken down when mounting fails."""
    offline = coresys.os._offline_updates
    folder = coresys.config.path_mounts / offline._mount_name("ABCD-1234")
    folder.mkdir()

    with (
        patch.object(
            DiskMount, "mount", AsyncMock(side_effect=MountActivationError(name="x"))
        ),
        patch.object(DiskMount, "unmount", AsyncMock()) as unmount,
        pytest.raises(MountActivationError),
    ):
        async with offline._mounted("ABCD-1234"):
            pytest.fail("Not mounted")

    unmount.assert_awaited_once()
    assert not folder.exists()


@pytest.mark.usefixtures("tmp_supervisor_data", "path_extern")
async def test_mount_released_when_use_fails(coresys: CoreSys) -> None:
    """Test the temporary mount is taken down when the work on it fails."""
    offline = coresys.os._offline_updates
    folder = coresys.config.path_mounts / offline._mount_name("ABCD-1234")
    folder.mkdir()

    with (
        patch.object(DiskMount, "mount", AsyncMock()) as mount,
        patch.object(DiskMount, "unmount", AsyncMock()) as unmount,
        pytest.raises(RuntimeError),
    ):
        async with offline._mounted("ABCD-1234"):
            raise RuntimeError

    mount.assert_awaited_once()
    unmount.assert_awaited_once()
    assert not folder.exists()


@pytest.mark.usefixtures("tmp_supervisor_data", "path_extern")
async def test_mount_is_read_only_and_not_persisted(coresys: CoreSys) -> None:
    """Test the temporary mount is read-only and unknown to the mount manager."""
    offline = coresys.os._offline_updates
    mounts: list[DiskMount] = []

    async def record(self: DiskMount) -> None:
        mounts.append(self)

    with (
        patch.object(DiskMount, "mount", record),
        patch.object(DiskMount, "unmount", AsyncMock()),
    ):
        async with offline._mounted("ABCD-1234"):
            assert not coresys.mounts.mounts

    assert [(mount.read_only, mount.uuid, mount.usage) for mount in mounts] == [
        (True, "ABCD-1234", None)
    ]
    assert mounts[0].name.startswith("offline-update-")


@pytest.mark.usefixtures("tmp_supervisor_data", "path_extern")
async def test_stale_mounts_removed(coresys: CoreSys) -> None:
    """Test mounts a crashed run left behind are removed, and nothing else."""
    offline = coresys.os._offline_updates
    stale = coresys.config.path_mounts / "offline-update-0123456789ab"
    other = coresys.config.path_mounts / "backups"
    stale.mkdir()
    other.mkdir()

    with patch.object(DiskMount, "unmount", AsyncMock()) as unmount:
        await offline._remove_stale_mounts()

    unmount.assert_awaited_once()
    assert not stale.exists()
    assert other.exists()


@pytest.fixture(name="rauc")
def fixture_rauc(coresys: CoreSys) -> Iterator[SimpleNamespace]:
    """Replace Rauc, returning the install mock and the result it reports."""
    rauc = SimpleNamespace(completed=[0], install=AsyncMock())

    @asynccontextmanager
    async def signal_completed() -> AsyncIterator[SimpleNamespace]:
        yield SimpleNamespace(wait_for_signal=AsyncMock(return_value=rauc.completed))

    with (
        patch.object(coresys.dbus.rauc, "signal_completed", signal_completed),
        patch.object(coresys.dbus.rauc, "install", rauc.install),
        patch.object(coresys.dbus.rauc, "update", AsyncMock()),
    ):
        yield rauc


def _reboot_issue_present(coresys: CoreSys) -> bool:
    return (IssueType.REBOOT_REQUIRED, ContextType.SYSTEM) in {
        (issue.type, issue.context) for issue in coresys.resolution.issues
    }


@pytest.mark.usefixtures("offline_os", "tmp_supervisor_data", "path_extern")
async def test_update_from_file_success(
    coresys: CoreSys,
    stick: Path,
    mount_events: list[str],
    rauc: SimpleNamespace,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Test installing hands a local copy to Rauc after releasing the drive."""
    caplog.set_level(logging.INFO)
    _write_bundle(stick / BUNDLE_NAME)
    installed: dict[str, Any] = {}

    async def install(source: Path) -> None:
        installed["source"] = source
        installed["content"] = await coresys.run_in_executor(
            (coresys.config.path_tmp / source.name).read_bytes
        )
        installed["events"] = list(mount_events)

    rauc.install.side_effect = install

    await coresys.os.update_from_file("Generic-Flash-Disk-61BCDDB6", BUNDLE_NAME)

    assert installed["source"].parent == coresys.config.path_extern_tmp
    assert installed["content"] == BUNDLE_CONTENT
    assert installed["events"] == ["mount ABCD-1234", "release ABCD-1234"]
    assert hashlib.sha256(BUNDLE_CONTENT).hexdigest() in caplog.text
    assert coresys.os.version_pending == AwesomeVersion("13.0")
    assert _reboot_issue_present(coresys)
    assert not list(coresys.config.path_tmp.iterdir())
    assert (stick / BUNDLE_NAME).read_bytes() == BUNDLE_CONTENT


@pytest.mark.usefixtures("offline_os", "tmp_supervisor_data", "path_extern")
@pytest.mark.usefixtures("mount_events")
async def test_update_from_file_needs_no_internet(
    coresys: CoreSys, stick: Path, rauc: SimpleNamespace
) -> None:
    """Test the install does not wait for an internet connection."""
    _write_bundle(stick / BUNDLE_NAME)
    coresys.supervisor._connectivity = False

    await coresys.os.update_from_file("Generic-Flash-Disk-61BCDDB6", BUNDLE_NAME)

    rauc.install.assert_awaited_once()


@pytest.mark.usefixtures("offline_os", "tmp_supervisor_data", "path_extern")
async def test_update_from_file_rauc_rejects_bundle(
    coresys: CoreSys,
    stick: Path,
    mount_events: list[str],
    rauc: SimpleNamespace,
) -> None:
    """Test a bundle Rauc does not accept is reported and cleaned up."""
    _write_bundle(stick / BUNDLE_NAME)
    rauc.completed = [1]
    coresys.dbus.rauc._last_error = "Verifying bundle failed: signature invalid"

    with pytest.raises(
        HassOSOfflineUpdateRejectedError,
        match="not signed for this system or is damaged",
    ):
        await coresys.os.update_from_file("Generic-Flash-Disk-61BCDDB6", BUNDLE_NAME)

    assert mount_events == ["mount ABCD-1234", "release ABCD-1234"]
    assert coresys.os.version_pending is None
    assert not _reboot_issue_present(coresys)
    assert not list(coresys.config.path_tmp.iterdir())


@pytest.mark.usefixtures("offline_os", "tmp_supervisor_data", "path_extern")
@pytest.mark.usefixtures("mount_events")
async def test_update_from_file_other_rauc_failure(
    coresys: CoreSys, stick: Path, rauc: SimpleNamespace
) -> None:
    """Test a failure that is not about the bundle is not blamed on the bundle."""
    _write_bundle(stick / BUNDLE_NAME)
    rauc.completed = [1]
    coresys.dbus.rauc._last_error = "Failed to write slot rootfs.1"

    with pytest.raises(HassOSUpdateError) as exc_info:
        await coresys.os.update_from_file("Generic-Flash-Disk-61BCDDB6", BUNDLE_NAME)

    assert not isinstance(exc_info.value, HassOSOfflineUpdateRejectedError)
    assert not list(coresys.config.path_tmp.iterdir())


@pytest.mark.usefixtures("offline_os", "tmp_supervisor_data", "path_extern")
async def test_update_from_file_copy_failure_cleans_up(
    coresys: CoreSys,
    stick: Path,
    mount_events: list[str],
    rauc: SimpleNamespace,
) -> None:
    """Test a failed copy removes the partial copy and releases the drive."""
    _write_bundle(stick / BUNDLE_NAME)

    with (
        patch.object(
            offline_update, "_copy_chunk", side_effect=OSError(errno.EIO, "I/O error")
        ),
        pytest.raises(HassOSUpdateError, match="Can't copy update file"),
    ):
        await coresys.os.update_from_file("Generic-Flash-Disk-61BCDDB6", BUNDLE_NAME)

    rauc.install.assert_not_awaited()
    assert mount_events == ["mount ABCD-1234", "release ABCD-1234"]
    assert not list(coresys.config.path_tmp.iterdir())


@pytest.mark.usefixtures("offline_os", "tmp_supervisor_data", "path_extern")
async def test_update_from_file_cancelled_cleans_up(
    coresys: CoreSys,
    stick: Path,
    mount_events: list[str],
    rauc: SimpleNamespace,
) -> None:
    """Test cancelling during the copy removes the partial copy."""
    _write_bundle(stick / BUNDLE_NAME)
    copying = asyncio.Event()

    async def copy_bundle(self: OfflineUpdates, bundle: Any, target: Path, _: Any):
        await coresys.run_in_executor(target.write_bytes, b"partial")
        copying.set()
        await asyncio.sleep(3600)

    with patch.object(OfflineUpdates, "copy_bundle", copy_bundle):
        task = asyncio.create_task(
            coresys.os.update_from_file("Generic-Flash-Disk-61BCDDB6", BUNDLE_NAME)
        )
        await copying.wait()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

    rauc.install.assert_not_awaited()
    assert mount_events == ["mount ABCD-1234", "release ABCD-1234"]
    assert not list(coresys.config.path_tmp.iterdir())


@pytest.mark.parametrize(
    ("drive_id", "path"),
    [
        pytest.param("Generic-Flash-Disk-61BCDDB6", "../" + BUNDLE_NAME, id="outside"),
        pytest.param("Generic-Flash-Disk-61BCDDB6", "/etc/passwd", id="absolute"),
        pytest.param(
            "Generic-Flash-Disk-61BCDDB6", "other/" + BUNDLE_NAME, id="not-listed"
        ),
        pytest.param("Another-Drive", BUNDLE_NAME, id="other-drive"),
    ],
)
@pytest.mark.usefixtures("offline_os", "tmp_supervisor_data", "path_extern")
async def test_update_from_file_refuses_unlisted_file(
    coresys: CoreSys,
    stick: Path,
    mount_events: list[str],
    rauc: SimpleNamespace,
    drive_id: str,
    path: str,
) -> None:
    """Test a file the scan did not list is refused, whatever it points to."""
    _write_bundle(stick / BUNDLE_NAME)
    _write_bundle(stick / "other" / BUNDLE_NAME)

    with pytest.raises(HassOSOfflineUpdateNotFoundError):
        await coresys.os.update_from_file(drive_id, path)

    rauc.install.assert_not_awaited()
    assert mount_events == ["mount ABCD-1234", "release ABCD-1234"]


@pytest.mark.parametrize(
    ("name", "reason"),
    [
        pytest.param("haos_odroid-n2-13.0.raucb", "different board", id="wrong-board"),
        pytest.param(
            "haos_generic-x86-64-12.0.raucb", "not newer", id="installed-version"
        ),
        pytest.param("haos_generic-x86-64-11.0.raucb", "not newer", id="downgrade"),
    ],
)
@pytest.mark.usefixtures("offline_os", "tmp_supervisor_data", "path_extern")
async def test_update_from_file_refuses_unusable_file(
    coresys: CoreSys,
    stick: Path,
    mount_events: list[str],
    rauc: SimpleNamespace,
    name: str,
    reason: str,
) -> None:
    """Test files for another board, or not newer, are refused with no way around."""
    _write_bundle(stick / name)

    with pytest.raises(HassOSOfflineUpdateNotAllowedError, match=reason):
        await coresys.os.update_from_file("Generic-Flash-Disk-61BCDDB6", name)

    rauc.install.assert_not_awaited()
    assert not list(coresys.config.path_tmp.iterdir())


@pytest.mark.usefixtures("offline_os", "tmp_supervisor_data", "path_extern")
@pytest.mark.usefixtures("mount_events")
async def test_update_from_file_refuses_pending_version(
    coresys: CoreSys, stick: Path, rauc: SimpleNamespace
) -> None:
    """Test the version that waits for a reboot is not installed again."""
    _write_bundle(stick / BUNDLE_NAME)
    coresys.os._version_pending = AwesomeVersion("13.0")

    with pytest.raises(HassOSOfflineUpdateNotAllowedError, match="not newer"):
        await coresys.os.update_from_file("Generic-Flash-Disk-61BCDDB6", BUNDLE_NAME)

    rauc.install.assert_not_awaited()


@pytest.mark.usefixtures("offline_os", "tmp_supervisor_data", "path_extern")
@pytest.mark.usefixtures("mount_events")
async def test_update_from_file_refuses_ambiguous_file(
    coresys: CoreSys, stick: Path, rauc: SimpleNamespace
) -> None:
    """Test the same file on two partitions of a drive is not guessed at."""
    _write_bundle(stick / BUNDLE_NAME)
    drives = [(_drive(), _block(id_uuid="AAAA-0001")), (_drive(), _block())]

    with (
        patch.object(OfflineUpdates, "_removable_filesystems", return_value=drives),
        pytest.raises(HassOSOfflineUpdateNotAllowedError, match="more than one"),
    ):
        await coresys.os.update_from_file("Generic-Flash-Disk-61BCDDB6", BUNDLE_NAME)

    rauc.install.assert_not_awaited()


@pytest.mark.usefixtures("offline_os", "tmp_supervisor_data", "path_extern")
@pytest.mark.usefixtures("mount_events", "supervisor_internet")
async def test_update_from_file_excludes_other_updates(
    coresys: CoreSys, stick: Path, rauc: SimpleNamespace
) -> None:
    """Test no second update, offline or online, starts during an install."""
    _write_bundle(stick / BUNDLE_NAME)
    copying = asyncio.Event()
    finish = asyncio.Event()

    async def copy_bundle(self: OfflineUpdates, bundle: Any, target: Path, _: Any):
        await coresys.run_in_executor(target.write_bytes, BUNDLE_CONTENT)
        copying.set()
        await finish.wait()
        return "sha"

    with (
        patch.object(OfflineUpdates, "copy_bundle", copy_bundle),
        patch.object(
            coresys.os, "_get_download_url", return_value="https://example.invalid/a"
        ),
        patch.object(coresys.os, "_download_raucb", AsyncMock()) as download,
    ):
        first = asyncio.create_task(
            coresys.os.update_from_file("Generic-Flash-Disk-61BCDDB6", BUNDLE_NAME)
        )
        await copying.wait()

        with pytest.raises(JobException):
            await coresys.os.update_from_file(
                "Generic-Flash-Disk-61BCDDB6", BUNDLE_NAME
            )
        with pytest.raises(HassOSUpdateInProgressError):
            await coresys.os.update(AwesomeVersion("14.0"))
        download.assert_not_awaited()

        finish.set()
        await first

    rauc.install.assert_awaited_once()


@pytest.mark.usefixtures(
    "offline_os", "tmp_supervisor_data", "path_extern", "supervisor_internet"
)
async def test_update_excludes_update_from_file(
    coresys: CoreSys, rauc: SimpleNamespace
) -> None:
    """Test no install from a drive starts during an update from the internet."""
    downloading = asyncio.Event()
    finish = asyncio.Event()

    async def download(url: str, raucb: Path) -> None:
        downloading.set()
        await finish.wait()
        raucb.touch()

    with (
        patch.object(
            coresys.os, "_get_download_url", return_value="https://example.invalid/a"
        ),
        patch.object(coresys.os, "_download_raucb", download),
    ):
        first = asyncio.create_task(coresys.os.update(AwesomeVersion("13.0")))
        await downloading.wait()

        with pytest.raises(HassOSUpdateInProgressError):
            await coresys.os.update_from_file(
                "Generic-Flash-Disk-61BCDDB6", BUNDLE_NAME
            )

        finish.set()
        await first


@pytest.mark.usefixtures("offline_os", "tmp_supervisor_data", "path_extern")
async def test_update_from_file_needs_healthy_running_system(
    coresys: CoreSys, mount_events: list[str]
) -> None:
    """Test the install is refused like an update from the internet is."""
    await coresys.core.set_state(CoreState.STARTUP)

    with pytest.raises(HassOSJobError):
        await coresys.os.update_from_file("Generic-Flash-Disk-61BCDDB6", BUNDLE_NAME)

    assert not mount_events


@pytest.mark.usefixtures("offline_os", "mount_events")
async def test_discover_busy_while_drives_are_in_use(coresys: CoreSys) -> None:
    """Test listing fails fast while a drive is held for a copy."""
    offline = coresys.os._offline_updates

    with patch.object(OfflineUpdates, "_remove_stale_mounts", AsyncMock()):
        async with offline.session(wait=False):
            with pytest.raises(HassOSUpdateInProgressError):
                await offline.discover()


async def test_offline_update_supported(coresys: CoreSys) -> None:
    """Test installing from a drive needs the OS, mounting and UDisks2."""
    assert coresys.os.offline_update_supported is False

    coresys.os._available = True
    with (
        patch.object(
            HostManager, "features", new=PropertyMock(return_value=[HostFeature.MOUNT])
        ),
        patch.object(
            type(coresys.dbus.udisks2),
            "is_connected",
            new=PropertyMock(return_value=True),
        ),
    ):
        assert coresys.os.offline_update_supported is True

    with (
        patch.object(HostManager, "features", new=PropertyMock(return_value=[])),
        patch.object(
            type(coresys.dbus.udisks2),
            "is_connected",
            new=PropertyMock(return_value=True),
        ),
    ):
        assert coresys.os.offline_update_supported is False


async def test_offline_update_candidates_unsupported(coresys: CoreSys) -> None:
    """Test nothing is scanned when the OS is not available."""
    with patch.object(OfflineUpdates, "discover", AsyncMock()) as discover:
        assert await coresys.os.offline_update_candidates() == []

    discover.assert_not_awaited()
