"""Test finding and installing offline update packs on removable drives."""

import hashlib
import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any

from awesomeversion import AwesomeVersion
import pytest

from supervisor.coresys import CoreSys
from supervisor.exceptions import (
    HassOSOfflineUpdateNotAllowedError,
    HassOSOfflineUpdateNotFoundError,
    HassOSOfflineUpdateRejectedError,
)
from supervisor.os.offline_update import OfflineUpdateVerdict

# The fixtures below are shared with the bundle tests
from .test_offline_update import (  # noqa: F401 pylint: disable=unused-import
    BUNDLE_NAME,
    _write_bundle,
    fixture_mount_events,
    fixture_offline_os,
    fixture_rauc,
    fixture_stick,
)

# pylint: disable=protected-access,redefined-outer-name

DRIVE = "Generic-Flash-Disk-61BCDDB6"
PACK_FOLDER = "ham-offline-pack-123"
PACK_MANIFEST_PATH = f"updates/{PACK_FOLDER}/manifest.json"
PACK_OS_NAME = "haos_generic-x86-64-13.0.raucb"
PACK_OS_CONTENT = b"B" * 4096
SUPERVISOR_CONTENT = b"S" * 10


def _write_pack(
    stick: Path, *, os_content: bytes = PACK_OS_CONTENT
) -> Path:
    """Write a pack on the stick, listing the original OS content, and return it."""
    folder = stick / "updates" / PACK_FOLDER
    folder.mkdir(parents=True)
    (folder / PACK_OS_NAME).write_bytes(os_content)
    (folder / "supervisor.tar").write_bytes(SUPERVISOR_CONTENT)
    manifest = {
        "format": 1,
        "build": "123",
        "board": "generic-x86-64",
        "parts": [
            {
                "kind": "supervisor",
                "available": True,
                "file": "supervisor.tar",
                "size": len(SUPERVISOR_CONTENT),
                "sha256": hashlib.sha256(SUPERVISOR_CONTENT).hexdigest(),
                "version": "2026.1.0",
            },
            {"kind": "core", "available": False, "version": "2026.1.0"},
            {
                "kind": "os",
                "available": True,
                "file": PACK_OS_NAME,
                "size": len(PACK_OS_CONTENT),
                "sha256": hashlib.sha256(PACK_OS_CONTENT).hexdigest(),
                "version": "13.0",
                "board": "generic-x86-64",
                "signature": "rauc-embedded",
            },
        ],
    }
    (folder / "manifest.json").write_text(json.dumps(manifest))
    return folder


@pytest.mark.usefixtures("offline_os", "mount_events")
async def test_discover_lists_pack(coresys: CoreSys, stick: Path) -> None:
    """Test a pack is listed with its manifest summary."""
    _write_pack(stick)

    candidates = await coresys.os._offline_updates.discover()

    assert len(candidates) == 1
    data = candidates[0].to_dict()
    assert data["kind"] == "pack"
    assert data["path"] == PACK_MANIFEST_PATH
    assert data["filename"] == PACK_FOLDER
    assert data["verdict"] == "ok"
    assert data["version"] == "13.0"
    assert [part["kind"] for part in data["pack"]["parts"]] == [
        "supervisor",
        "core",
        "os",
    ]


@pytest.mark.usefixtures("offline_os", "mount_events")
async def test_discover_pack_with_missing_file_is_incomplete(
    coresys: CoreSys, stick: Path
) -> None:
    """Test a pack whose listed file is gone is listed but not installable."""
    (_write_pack(stick) / PACK_OS_NAME).unlink()

    candidates = await coresys.os._offline_updates.discover()

    assert [c.verdict for c in candidates] == [OfflineUpdateVerdict.INCOMPLETE]


@pytest.mark.usefixtures("offline_os", "mount_events")
async def test_discover_ignores_invalid_pack(coresys: CoreSys, stick: Path) -> None:
    """Test a folder with a broken manifest is not listed."""
    (_write_pack(stick) / "manifest.json").write_text("{")

    assert await coresys.os._offline_updates.discover() == []


@pytest.mark.usefixtures("offline_os", "tmp_supervisor_data", "path_extern")
async def test_update_from_pack_success(
    coresys: CoreSys,
    stick: Path,
    mount_events: list[str],
    rauc: SimpleNamespace,
) -> None:
    """Test a pack installs the OS part and reports what needs the network."""
    _write_pack(stick)
    installed: dict[str, Any] = {}

    async def install(source: Path) -> None:
        installed["content"] = await coresys.run_in_executor(
            (coresys.config.path_tmp / source.name).read_bytes
        )
        installed["events"] = list(mount_events)

    rauc.install.side_effect = install

    result = await coresys.os.update_from_pack(DRIVE, PACK_MANIFEST_PATH)

    assert installed["content"] == PACK_OS_CONTENT
    assert installed["events"] == ["mount ABCD-1234", "release ABCD-1234"]
    assert [(part["kind"], part["status"]) for part in result["parts"]] == [
        ("supervisor", "needs_network"),
        ("core", "skipped"),
        ("os", "installed"),
    ]
    assert coresys.os.version_pending == AwesomeVersion("13.0")
    assert not list(coresys.config.path_tmp.iterdir())


@pytest.mark.parametrize(
    ("part_file", "content", "reason"),
    [
        pytest.param(PACK_OS_NAME, b"C" * 4096, "checksum", id="altered-os-part"),
        pytest.param(PACK_OS_NAME, b"B" * 4000, "size", id="resized-os-part"),
        pytest.param("supervisor.tar", b"X" * 10, "checksum", id="altered-other-part"),
    ],
)
@pytest.mark.usefixtures("offline_os", "tmp_supervisor_data", "path_extern")
async def test_update_from_pack_refuses_bad_part(
    coresys: CoreSys,
    stick: Path,
    mount_events: list[str],
    rauc: SimpleNamespace,
    part_file: str,
    content: bytes,
    reason: str,
) -> None:
    """Test one part that does not match refuses the whole pack untouched."""
    (_write_pack(stick) / part_file).write_bytes(content)

    # A resized part is already unlisted by the scan, the others fail the check
    with pytest.raises(
        (HassOSOfflineUpdateNotAllowedError, HassOSOfflineUpdateNotFoundError)
    ):
        await coresys.os.update_from_pack(DRIVE, PACK_MANIFEST_PATH)

    rauc.install.assert_not_awaited()
    assert coresys.os.version_pending is None
    assert not list(coresys.config.path_tmp.iterdir())


@pytest.mark.parametrize(
    ("part_file", "content"),
    [
        pytest.param(PACK_OS_NAME, b"C" * 4096, id="os-part"),
        pytest.param("supervisor.tar", b"X" * 10, id="other-part"),
    ],
)
@pytest.mark.usefixtures("offline_os", "tmp_supervisor_data", "path_extern")
@pytest.mark.usefixtures("mount_events")
async def test_update_from_pack_names_the_failed_part(
    coresys: CoreSys,
    stick: Path,
    rauc: SimpleNamespace,
    part_file: str,
    content: bytes,
) -> None:
    """Test the refusal says which file failed the checksum."""
    (_write_pack(stick) / part_file).write_bytes(content)

    with pytest.raises(HassOSOfflineUpdateNotAllowedError, match=part_file):
        await coresys.os.update_from_pack(DRIVE, PACK_MANIFEST_PATH)

    rauc.install.assert_not_awaited()


@pytest.mark.usefixtures("offline_os", "tmp_supervisor_data", "path_extern")
@pytest.mark.usefixtures("mount_events")
async def test_update_from_pack_rauc_rejects(
    coresys: CoreSys, stick: Path, rauc: SimpleNamespace
) -> None:
    """Test a bundle Rauc refuses to verify fails the install."""
    _write_pack(stick)
    rauc.completed = [1]

    with (
        pytest.raises(HassOSOfflineUpdateRejectedError),
        pytest.MonkeyPatch.context() as patcher,
    ):
        patcher.setattr(
            type(coresys.dbus.rauc),
            "last_error",
            property(lambda self: "Failed to verify signature"),
        )
        await coresys.os.update_from_pack(DRIVE, PACK_MANIFEST_PATH)

    assert coresys.os.version_pending is None


@pytest.mark.usefixtures("offline_os", "tmp_supervisor_data", "path_extern")
@pytest.mark.usefixtures("mount_events")
async def test_pack_and_bundle_routes_do_not_mix(
    coresys: CoreSys, stick: Path, rauc: SimpleNamespace
) -> None:
    """Test the pack route does not accept a bundle, and the reverse."""
    _write_bundle(stick / BUNDLE_NAME)
    _write_pack(stick)

    with pytest.raises(HassOSOfflineUpdateNotFoundError):
        await coresys.os.update_from_pack(DRIVE, BUNDLE_NAME)
    with pytest.raises(HassOSOfflineUpdateNotFoundError):
        await coresys.os.update_from_file(DRIVE, PACK_MANIFEST_PATH)

    rauc.install.assert_not_awaited()


@pytest.mark.usefixtures("offline_os", "tmp_supervisor_data", "path_extern")
@pytest.mark.usefixtures("mount_events")
async def test_update_from_pack_refuses_not_newer(
    coresys: CoreSys, stick: Path, rauc: SimpleNamespace
) -> None:
    """Test a pack that is not newer than the installed OS is refused."""
    _write_pack(stick)
    coresys.os._version = AwesomeVersion("13.0")

    with pytest.raises(HassOSOfflineUpdateNotAllowedError, match="not newer"):
        await coresys.os.update_from_pack(DRIVE, PACK_MANIFEST_PATH)

    rauc.install.assert_not_awaited()
