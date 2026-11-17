"""Find and copy Home Assistant Operating System update bundles on removable drives.

Removable filesystems are mounted read-only through the regular disk mount
machinery under a Supervisor owned name for as long as a scan or copy needs
them. Bundle signatures are never checked here, Rauc does that on install.
"""

import asyncio
from collections.abc import AsyncIterator, Callable
from contextlib import AsyncExitStack, asynccontextmanager, suppress
from dataclasses import dataclass
from enum import StrEnum
import errno
import hashlib
import logging
import os
from pathlib import Path
import re
import shutil
import stat
from typing import Any, BinaryIO, Final

from awesomeversion import AwesomeVersion, AwesomeVersionException

from ..coresys import CoreSys, CoreSysAttributes
from ..exceptions import (
    DBusError,
    DBusNotConnectedError,
    DBusObjectError,
    HassOSOfflineUpdateNotFoundError,
    HassOSUpdateError,
    HassOSUpdateInProgressError,
    MountError,
)
from ..host.const import HostFeature
from ..mounts.const import ID_USAGE_FILESYSTEM, SUPPORTED_LOCAL_FILESYSTEMS, MountType
from ..mounts.mount import DiskMount
from ..mounts.validate import MountData
from .offline_pack import (
    MANIFEST_MAX_SIZE,
    MANIFEST_NAME,
    RE_PACK_FOLDER,
    PackManifest,
    PackManifestError,
    PackPartKind,
    parse_manifest,
    verify_pack,
)

_LOGGER: logging.Logger = logging.getLogger(__name__)

OFFLINE_UPDATE_MOUNT_PREFIX: Final = "offline-update-"

BUNDLE_MIN_SIZE: Final = 1024**2
BUNDLE_MAX_SIZE: Final = 2 * 1024**3
FREE_SPACE_MARGIN: Final = 256 * 1024**2
COPY_CHUNK_SIZE: Final = 4 * 1024**2

# The root of a drive and these folders directly below it are searched.
BUNDLE_FOLDERS: Final = frozenset({"updates", "haos", "home-assistant"})

# Same file names as the release assets: haos_<board>-<version>.raucb
RE_BUNDLE_NAME: Final = re.compile(
    r"^haos_(?P<board>[a-z0-9]+(?:-[a-z0-9]+)*)"
    r"-(?P<version>\d+\.\d+(?:\.\d+)*(?:\.?(?:dev|rc|b|a)\d+)?)\.raucb\Z"
)

# OS version 6 and later renamed intel-nuc to generic-x86-64
RENAMED_BOARD_FIRST_VERSION: Final = AwesomeVersion("6.0")


class OfflineUpdateVerdict(StrEnum):
    """Whether a bundle found on a drive can be installed."""

    OK = "ok"
    WRONG_BOARD = "wrong_board"
    NOT_NEWER = "not_newer"
    TOO_LARGE = "too_large"
    NO_SPACE = "no_space"
    UNSUPPORTED = "unsupported"
    INCOMPLETE = "incomplete"
    NO_OS_PART = "no_os_part"


VERDICT_REASONS: Final[dict[OfflineUpdateVerdict, str]] = {
    OfflineUpdateVerdict.OK: "the file can be installed",
    OfflineUpdateVerdict.WRONG_BOARD: "the file is built for a different board",
    OfflineUpdateVerdict.NOT_NEWER: (
        "the file is not newer than the installed or pending version"
    ),
    OfflineUpdateVerdict.TOO_LARGE: "the file is larger than 2 GiB",
    OfflineUpdateVerdict.NO_SPACE: (
        "there is not enough free space on the system to copy the file"
    ),
    OfflineUpdateVerdict.UNSUPPORTED: (
        "installing from a drive is not supported on this system"
    ),
    OfflineUpdateVerdict.INCOMPLETE: (
        "a file listed in the pack is missing or has the wrong size"
    ),
    OfflineUpdateVerdict.NO_OS_PART: (
        "the pack has no operating system part that can be installed without internet"
    ),
}


@dataclass(slots=True, frozen=True)
class OfflineUpdateCandidate:
    """An update bundle found on a removable drive."""

    drive_id: str
    vendor: str
    model: str
    label: str
    filesystem: str
    path: str
    size: int
    board: str
    version: str
    verdict: OfflineUpdateVerdict
    kind: str = "bundle"
    pack: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        """Return the candidate as plain data."""
        data: dict[str, Any] = {
            "drive_id": self.drive_id,
            "vendor": self.vendor,
            "model": self.model,
            "label": self.label,
            "filesystem": self.filesystem,
            "path": self.path,
            "filename": self.path.rsplit("/", 1)[-1],
            "size": self.size,
            "board": self.board,
            "version": self.version,
            "verdict": self.verdict.value,
            "kind": self.kind,
        }
        if self.pack is not None:
            data["pack"] = self.pack
            data["filename"] = self.path.rsplit("/", 2)[-2]
        return data


@dataclass(slots=True, frozen=True)
class FoundBundle:
    """A candidate together with where it can be read while its drive is mounted."""

    candidate: OfflineUpdateCandidate
    file_path: Path
    manifest: PackManifest | None = None


def update_board_name(board: str, version: AwesomeVersion) -> str:
    """Return the board name used in bundle file names of the given version."""
    if board == "intel-nuc" and version >= RENAMED_BOARD_FIRST_VERSION:
        return "generic-x86-64"
    return board


def evaluate_bundle(
    *,
    board: str,
    version: AwesomeVersion,
    size: int,
    installed_board: str | None,
    installed_version: AwesomeVersion | None,
    pending_version: AwesomeVersion | None,
    free_space: int,
) -> OfflineUpdateVerdict:
    """Decide whether a bundle may be installed on this system."""
    if installed_board is None or installed_version is None:
        return OfflineUpdateVerdict.UNSUPPORTED
    if board != update_board_name(installed_board, version):
        return OfflineUpdateVerdict.WRONG_BOARD
    if version <= installed_version or (
        pending_version is not None and version <= pending_version
    ):
        return OfflineUpdateVerdict.NOT_NEWER
    if size > BUNDLE_MAX_SIZE:
        return OfflineUpdateVerdict.TOO_LARGE
    if free_space < size + FREE_SPACE_MARGIN:
        return OfflineUpdateVerdict.NO_SPACE
    return OfflineUpdateVerdict.OK


def _scan_folder(folder: Path, prefix: str) -> list[tuple[str, int]]:
    """Return regular files with a bundle name in a folder as (path, size)."""
    found: list[tuple[str, int]] = []
    try:
        with os.scandir(folder) as entries:
            for entry in entries:
                if RE_BUNDLE_NAME.match(entry.name) is None:
                    continue
                try:
                    # Never follows links, so a link is not a regular file here
                    info = entry.stat(follow_symlinks=False)
                except OSError:
                    continue
                if not stat.S_ISREG(info.st_mode) or info.st_size < BUNDLE_MIN_SIZE:
                    continue
                found.append((f"{prefix}{entry.name}", info.st_size))
    except OSError as err:
        _LOGGER.debug("Can't scan %s for update files: %s", folder, err)
    return found


def _scan_filesystem(root: Path) -> list[tuple[str, int]]:
    """Look for bundles in the root folder and the known update folders."""
    found = _scan_folder(root, "")
    folders: list[str] = []
    try:
        with os.scandir(root) as entries:
            for entry in entries:
                if entry.name.lower() in BUNDLE_FOLDERS and entry.is_dir(
                    follow_symlinks=False
                ):
                    folders.append(entry.name)
    except OSError as err:
        _LOGGER.debug("Can't scan %s for update folders: %s", root, err)

    for name in sorted(folders):
        found.extend(_scan_folder(root / name, f"{name}/"))
    return sorted(found)


def _read_pack(folder: Path) -> tuple[PackManifest, bool] | None:
    """Read the manifest of a pack folder and report whether every part is there."""
    manifest_path = folder / MANIFEST_NAME
    try:
        info = manifest_path.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_size > MANIFEST_MAX_SIZE:
            return None
        manifest = parse_manifest(manifest_path.read_bytes())
    except (OSError, PackManifestError) as err:
        _LOGGER.debug("Ignoring pack folder %s: %s", folder, err)
        return None

    complete = True
    for part in manifest.parts:
        if not part.available or part.file is None:
            continue
        try:
            info = (folder / part.file).lstat()
        except OSError:
            complete = False
            continue
        if not stat.S_ISREG(info.st_mode) or info.st_size != part.size:
            complete = False
    return manifest, complete


def _scan_packs(root: Path) -> list[tuple[str, PackManifest, bool]]:
    """Look for offline packs as (manifest path, manifest, complete)."""
    parents = [("", root)]
    try:
        with os.scandir(root) as entries:
            parents.extend(
                (f"{entry.name}/", Path(entry.path))
                for entry in sorted(entries, key=lambda item: item.name)
                if entry.name.lower() in BUNDLE_FOLDERS
                and entry.is_dir(follow_symlinks=False)
            )
    except OSError as err:
        _LOGGER.debug("Can't scan %s for packs: %s", root, err)

    found: list[tuple[str, PackManifest, bool]] = []
    for prefix, parent in parents:
        try:
            with os.scandir(parent) as entries:
                folders = sorted(
                    entry.name
                    for entry in entries
                    if RE_PACK_FOLDER.match(entry.name)
                    and entry.is_dir(follow_symlinks=False)
                )
        except OSError as err:
            _LOGGER.debug("Can't scan %s for packs: %s", parent, err)
            continue
        for name in folders:
            if (result := _read_pack(parent / name)) is not None:
                found.append((f"{prefix}{name}/{MANIFEST_NAME}", *result))
    return found


def _free_space(path: Path) -> int:
    """Return free bytes on the filesystem holding path."""
    return shutil.disk_usage(path).free


def _open_source(path: Path, expected_size: int) -> BinaryIO:
    """Open a bundle for reading, refusing links and anything that changed."""
    flags = (
        os.O_RDONLY
        | getattr(os, "O_NOFOLLOW", 0)
        | getattr(os, "O_CLOEXEC", 0)
        | getattr(os, "O_BINARY", 0)
    )
    try:
        descriptor = os.open(path, flags)
    except OSError as err:
        if err.errno in (errno.ENOENT, errno.ELOOP, errno.ENOTDIR):
            raise HassOSOfflineUpdateNotFoundError from err
        raise

    try:
        info = os.fstat(descriptor)
        if not stat.S_ISREG(info.st_mode) or info.st_size != expected_size:
            raise HassOSOfflineUpdateNotFoundError
        return os.fdopen(descriptor, "rb", buffering=0)
    except BaseException:
        os.close(descriptor)
        raise


def _create_target(path: Path) -> BinaryIO:
    """Create the local copy, failing if the name already exists."""
    flags = (
        os.O_WRONLY
        | os.O_CREAT
        | os.O_EXCL
        | getattr(os, "O_CLOEXEC", 0)
        | getattr(os, "O_BINARY", 0)
    )
    return os.fdopen(os.open(path, flags, 0o600), "wb", buffering=0)


def _copy_chunk(source: BinaryIO, target: BinaryIO, digest: Any) -> int:
    """Copy one chunk, returning the number of bytes copied."""
    data = source.read(COPY_CHUNK_SIZE)
    if not data:
        return 0
    digest.update(data)
    target.write(data)
    return len(data)


def _sync_target(target: BinaryIO) -> None:
    """Make sure the copy reached the disk before Rauc reads it."""
    target.flush()
    os.fsync(target.fileno())


def _remove_folder(path: Path) -> None:
    """Remove an empty mount folder, leaving it alone while it is a mount point."""
    with suppress(OSError):
        path.rmdir()


class OfflineUpdates(CoreSysAttributes):
    """Discover update bundles on removable drives and copy them locally."""

    def __init__(self, coresys: CoreSys) -> None:
        """Initialize object."""
        self.coresys = coresys
        self._lock = asyncio.Lock()

    @property
    def busy(self) -> bool:
        """Return true while a drive is mounted for a scan or a copy."""
        return self._lock.locked()

    def _new_mount(self, name: str, uuid: str | None = None) -> DiskMount:
        """Create a read-only mount that is owned by this feature.

        It is never added to the mount manager, so it is never persisted.
        """
        data = MountData(
            name=name, type=MountType.DISK.value, usage=None, read_only=True
        )
        if uuid is not None:
            data["uuid"] = uuid
        return DiskMount(self.coresys, data)

    @staticmethod
    def _mount_name(uuid: str) -> str:
        digest = hashlib.sha256(uuid.encode()).hexdigest()[:12]
        return f"{OFFLINE_UPDATE_MOUNT_PREFIX}{digest}"

    async def _release(self, mount: DiskMount) -> None:
        """Take a temporary mount down and remove its folder."""
        try:
            await mount.unmount()
        except MountError as err:
            # Folder stays, the next scan removes the leftover
            _LOGGER.warning("Could not release temporary mount %s: %s", mount.name, err)
            return
        await self.sys_run_in_executor(_remove_folder, mount.local_where)

    @asynccontextmanager
    async def _mounted(self, uuid: str) -> AsyncIterator[Path]:
        """Mount a filesystem read-only for the duration of the context."""
        mount = self._new_mount(self._mount_name(uuid), uuid)
        try:
            await mount.mount()
            yield mount.local_where
        finally:
            await self._release(mount)

    def _stale_mount_names(self) -> list[str]:
        try:
            return [
                path.name
                for path in self.sys_config.path_mounts.iterdir()
                if path.name.startswith(OFFLINE_UPDATE_MOUNT_PREFIX)
            ]
        except OSError:
            return []

    async def _remove_stale_mounts(self) -> None:
        """Remove mounts a previous run left behind, e.g. after a restart."""
        for name in await self.sys_run_in_executor(self._stale_mount_names):
            _LOGGER.info("Removing leftover temporary mount %s", name)
            await self._release(self._new_mount(name))

    def _removable_filesystems(self) -> list[tuple[Any, Any]]:
        """Return (drive, block device) pairs for filesystems on removable drives."""
        udisks = self.sys_dbus.udisks2
        if HostFeature.MOUNT not in self.sys_host.features or not udisks.is_connected:
            return []

        try:
            data_disk = self.sys_os.datadisk.disk_used_id
        except DBusError, DBusNotConnectedError:
            # Mounting still refuses the data partition itself
            data_disk = None

        found = []
        for block in udisks.block_devices:
            try:
                if (
                    block.filesystem is None
                    or block.id_usage != ID_USAGE_FILESYSTEM
                    or block.id_type not in SUPPORTED_LOCAL_FILESYSTEMS
                    or not block.id_uuid
                    or block.hint_system
                ):
                    continue
                drive = udisks.get_drive(block.drive)
                if not drive.removable or drive.id == data_disk:
                    continue
            except (DBusObjectError, DBusError, DBusNotConnectedError) as err:
                _LOGGER.debug("Skipping block device: %s", err)
                continue
            found.append((drive, block))

        return sorted(found, key=lambda pair: (pair[0].id, pair[1].id_uuid))

    @asynccontextmanager
    async def session(self, *, wait: bool) -> AsyncIterator[list[FoundBundle]]:
        """Mount every removable filesystem and list the bundles on them.

        The drives stay mounted until the context exits, so a listed bundle
        can be copied. Mounts are always released, also on failure.
        """
        if not wait and self._lock.locked():
            raise HassOSUpdateInProgressError(None, _LOGGER.debug)

        async with self._lock:
            await self._remove_stale_mounts()
            async with AsyncExitStack() as stack:
                yield await self._scan(stack)

    async def _scan(self, stack: AsyncExitStack) -> list[FoundBundle]:
        """Mount each removable filesystem into the stack and scan it."""
        filesystems = self._removable_filesystems()
        if not filesystems:
            return []

        free_space = await self.sys_run_in_executor(
            _free_space, self.sys_config.path_tmp
        )
        os_manager = self.sys_os
        bundles: list[FoundBundle] = []

        for drive, block in filesystems:
            try:
                root = await stack.enter_async_context(self._mounted(block.id_uuid))
            except MountError as err:
                _LOGGER.debug(
                    "Not scanning %s on drive %s: %s", block.device, drive.id, err
                )
                continue

            for relative, size in await self.sys_run_in_executor(
                _scan_filesystem, root
            ):
                match = RE_BUNDLE_NAME.match(relative.rsplit("/", 1)[-1])
                if match is None:
                    continue
                try:
                    version = AwesomeVersion(match["version"])
                    verdict = evaluate_bundle(
                        board=match["board"],
                        version=version,
                        size=size,
                        installed_board=os_manager.board,
                        installed_version=os_manager.version,
                        pending_version=os_manager.version_pending,
                        free_space=free_space,
                    )
                except AwesomeVersionException, TypeError:
                    _LOGGER.debug("Ignoring %s, version can't be compared", relative)
                    continue

                bundles.append(
                    FoundBundle(
                        OfflineUpdateCandidate(
                            drive_id=drive.id,
                            vendor=drive.vendor,
                            model=drive.model,
                            label=block.id_label,
                            filesystem=block.id_type,
                            path=relative,
                            size=size,
                            board=match["board"],
                            version=match["version"],
                            verdict=verdict,
                        ),
                        root / relative,
                    )
                )

            for relative, manifest, complete in await self.sys_run_in_executor(
                _scan_packs, root
            ):
                bundles.append(
                    self._pack_entry(
                        drive, block, root, relative, manifest, complete, free_space
                    )
                )

        return bundles

    def _pack_entry(
        self,
        drive: Any,
        block: Any,
        root: Path,
        relative: str,
        manifest: PackManifest,
        complete: bool,
        free_space: int,
    ) -> FoundBundle:
        """Describe a pack found on a drive, with the verdict for this system."""
        os_manager = self.sys_os
        os_part = manifest.part(PackPartKind.OS)
        size = sum(part.size for part in manifest.parts if part.available)

        if os_part is None or not os_part.available or os_part.version is None:
            verdict = OfflineUpdateVerdict.NO_OS_PART
        elif not complete:
            verdict = OfflineUpdateVerdict.INCOMPLETE
        else:
            try:
                verdict = evaluate_bundle(
                    board=manifest.board,
                    version=AwesomeVersion(os_part.version),
                    size=os_part.size,
                    installed_board=os_manager.board,
                    installed_version=os_manager.version,
                    pending_version=os_manager.version_pending,
                    free_space=free_space,
                )
            except AwesomeVersionException, TypeError:
                verdict = OfflineUpdateVerdict.UNSUPPORTED

        return FoundBundle(
            OfflineUpdateCandidate(
                drive_id=drive.id,
                vendor=drive.vendor,
                model=drive.model,
                label=block.id_label,
                filesystem=block.id_type,
                path=relative,
                size=size,
                board=manifest.board,
                version=os_part.version if os_part and os_part.version else "",
                verdict=verdict,
                kind="pack",
                pack=manifest.summary(),
            ),
            root / relative,
            manifest,
        )

    async def discover(self) -> list[OfflineUpdateCandidate]:
        """List update bundles on removable drives."""
        async with self.session(wait=False) as bundles:
            candidates = [bundle.candidate for bundle in bundles]

        _LOGGER.debug("Found %s update file(s) on removable drives", len(candidates))
        return candidates

    async def copy_bundle(
        self,
        bundle: FoundBundle,
        target: Path,
        on_progress: Callable[[float], None],
    ) -> str:
        """Copy a bundle to a local path and return its SHA-256.

        The partial copy is left for the caller to remove.
        """
        return await self.copy_file(
            bundle.file_path, bundle.candidate.size, target, on_progress
        )

    async def verify_pack_parts(
        self, bundle: FoundBundle, on_progress: Callable[[float], None]
    ) -> None:
        """Verify size and SHA-256 of every part of a mounted pack.

        Raises PackVerifyError for the first part that does not match.
        """
        manifest = bundle.manifest
        if manifest is None:
            raise HassOSOfflineUpdateNotFoundError
        total = sum(part.size for part in manifest.parts if part.available)

        def report(done: int) -> None:
            on_progress(min(done / total, 1.0))

        await self.sys_run_in_executor(
            verify_pack, bundle.file_path.parent, manifest, report
        )

    async def copy_file(
        self,
        file_path: Path,
        size: int,
        target: Path,
        on_progress: Callable[[float], None],
    ) -> str:
        """Copy a file of a known size to a local path and return its SHA-256.

        The partial copy is left for the caller to remove.
        """
        source = await self.sys_run_in_executor(_open_source, file_path, size)
        try:
            destination = await self.sys_run_in_executor(_create_target, target)
        except OSError as err:
            await self.sys_run_in_executor(source.close)
            self.sys_resolution.check_oserror(err)
            raise HassOSUpdateError(
                f"Can't create local copy of update file: {err!s}", _LOGGER.error
            ) from err
        except BaseException:
            await self.sys_run_in_executor(source.close)
            raise

        digest = hashlib.sha256()
        copied = 0
        try:
            while written := await self.sys_run_in_executor(
                _copy_chunk, source, destination, digest
            ):
                copied += written
                on_progress(min(copied / size, 1.0))
                if copied > size:
                    break
            await self.sys_run_in_executor(_sync_target, destination)
        except OSError as err:
            self.sys_resolution.check_oserror(err)
            raise HassOSUpdateError(
                f"Can't copy update file: {err!s}", _LOGGER.error
            ) from err
        finally:
            await self.sys_run_in_executor(source.close)
            await self.sys_run_in_executor(destination.close)

        if copied != size:
            raise HassOSUpdateError(
                "The update file changed while it was copied", _LOGGER.error
            )

        return digest.hexdigest()
