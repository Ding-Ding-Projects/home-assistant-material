"""OS support on supervisor."""

import asyncio
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import datetime
from functools import partial
import logging
import os
from pathlib import Path, PurePath
import re
from uuid import uuid4

import aiohttp
from awesomeversion import AwesomeVersion, AwesomeVersionException
from cpe import CPE

from ..coresys import CoreSys
from ..dbus.agent.boards.const import BOARD_NAME_SUPERVISED
from ..dbus.rauc import RaucState, SlotStatusDataType
from ..exceptions import (
    DBusError,
    DBusNotConnectedError,
    HassOSError,
    HassOSJobError,
    HassOSOfflineUpdateNotAllowedError,
    HassOSOfflineUpdateNotFoundError,
    HassOSOfflineUpdateRejectedError,
    HassOSSlotNotFound,
    HassOSSlotUpdateError,
    HassOSUpdateAlreadyInstalledError,
    HassOSUpdateError,
    HassOSUpdateInProgressError,
    HassOSUpdatePendingRebootError,
    HostError,
)
from ..host.const import HostFeature
from ..jobs.const import JobConcurrency, JobCondition
from ..jobs.decorator import Job
from ..jobs.job_group import JobGroup
from ..resolution.const import (
    ENV_CONTAINER_HOST,
    ContextType,
    IssueType,
    SuggestionType,
)
from .data_disk import DataDisk
from .offline_pack import INSTALL_ORDER, PackPartKind, PackVerifyError
from .offline_update import (
    VERDICT_REASONS,
    OfflineUpdateCandidate,
    OfflineUpdates,
    OfflineUpdateVerdict,
)
from .ssh_keys import ENV_SSH_PORT, ContainerAuthorizedKeys, key_fingerprint

_LOGGER: logging.Logger = logging.getLogger(__name__)

# Messages Rauc reports when it refuses a bundle before writing any slot
RE_RAUC_BUNDLE_REJECTED = re.compile(
    r"verif|signature|certificate|checksum|digest|invalid bundle"
    r"|(?:load|open) bundle|bundle (?:format|payload)",
    re.IGNORECASE,
)

# SSH service on Home Assistant OS consuming /root/.ssh/authorized_keys
DROPBEAR_SERVICE = "dropbear.service"

# OS Agent releases before this return the os.Remove error when clearing an
# already absent authorized_keys file (inverted error check)
CLEAR_SSH_AUTH_KEYS_FIXED_VERSION = AwesomeVersion("1.10.0")
CLEAR_SSH_AUTH_KEYS_MISSING_FILE_ERROR = (
    "remove /root/.ssh/authorized_keys: no such file or directory"
)


@dataclass(slots=True, frozen=True)
class SlotStatus:
    """Status of a slot."""

    class_: str
    type_: str
    state: str
    device: PurePath
    bundle_compatible: str | None = None
    sha256: str | None = None
    size: int | None = None
    installed_count: int | None = None
    bundle_version: AwesomeVersion | None = None
    installed_timestamp: datetime | None = None
    status: str | None = None
    activated_count: int | None = None
    activated_timestamp: datetime | None = None
    boot_status: RaucState | None = None
    bootname: str | None = None
    parent: str | None = None

    @classmethod
    def from_dict(cls, data: SlotStatusDataType) -> SlotStatus:
        """Create SlotStatus from dictionary."""
        return cls(
            class_=data["class"],
            type_=data["type"],
            state=data["state"],
            device=PurePath(data["device"]),
            bundle_compatible=data.get("bundle.compatible"),
            sha256=data.get("sha256"),
            size=data.get("size"),
            installed_count=data.get("installed.count"),
            bundle_version=AwesomeVersion(data["bundle.version"])
            if "bundle.version" in data
            else None,
            installed_timestamp=datetime.fromisoformat(data["installed.timestamp"])
            if "installed.timestamp" in data
            else None,
            status=data.get("status"),
            activated_count=data.get("activated.count"),
            activated_timestamp=datetime.fromisoformat(data["activated.timestamp"])
            if "activated.timestamp" in data
            else None,
            boot_status=RaucState(data["boot-status"])
            if "boot-status" in data
            else None,
            bootname=data.get("bootname"),
            parent=data.get("parent"),
        )


class OSManager(JobGroup):
    """OS interface inside supervisor."""

    def __init__(self, coresys: CoreSys):
        """Initialize HassOS handler."""
        super().__init__(coresys, "os_manager")
        self._datadisk: DataDisk = DataDisk(coresys)
        self._available: bool = False
        self._version: AwesomeVersion | None = None
        self._version_pending: AwesomeVersion | None = None
        self._board: str | None = None
        self._os_name: str | None = None
        self._slots: dict[str, SlotStatus] | None = None
        self._update_lock = asyncio.Lock()
        self._offline_updates = OfflineUpdates(coresys)
        self._container_ssh_keys = ContainerAuthorizedKeys(
            coresys.config.path_supervisor / "ssh" / "authorized_keys"
        )

    @property
    def container_host(self) -> bool:
        """Return true in the full hosting mode, where no OS runs under the Supervisor."""
        return os.environ.get(ENV_CONTAINER_HOST) == "1"

    @property
    def container_ssh_port(self) -> int | None:
        """Return the port of the SSH server of the outer container, if it has one."""
        value = os.environ.get(ENV_SSH_PORT, "")
        return int(value) if value.isdigit() and 0 < int(value) < 65536 else None

    @property
    def container_ssh_keys(self) -> ContainerAuthorizedKeys:
        """Return the authorized keys file of a container host."""
        return self._container_ssh_keys

    @property
    def available(self) -> bool:
        """Return True, if HassOS on host."""
        return self._available

    @property
    def version(self) -> AwesomeVersion | None:
        """Return version of HassOS."""
        return self._version

    @property
    def latest_version(self) -> AwesomeVersion | None:
        """Return version of HassOS."""
        return self.sys_updater.version_hassos

    @property
    def latest_version_unrestricted(self) -> AwesomeVersion | None:
        """Return current latest version of HassOS for board ignoring upgrade restrictions."""
        return self.sys_updater.version_hassos_unrestricted

    @property
    def version_pending(self) -> AwesomeVersion | None:
        """Return version of an installed update that awaits a reboot to activate."""
        return self._version_pending

    @property
    def need_update(self) -> bool:
        """Return true if a HassOS update is available."""
        try:
            return (
                self.version is not None
                and self.latest_version is not None
                and self.version < self.latest_version
                and (
                    self.version_pending is None
                    or self.latest_version != self.version_pending
                )
            )
        except AwesomeVersionException, TypeError:
            return False

    @property
    def board(self) -> str | None:
        """Return board name."""
        return self._board

    @property
    def os_name(self) -> str | None:
        """Return OS name."""
        return self._os_name

    @property
    def datadisk(self) -> DataDisk:
        """Return Operating-System datadisk."""
        return self._datadisk

    @property
    def slots(self) -> list[SlotStatus]:
        """Return status of slots."""
        if not self._slots:
            return []
        return list(self._slots.values())

    def get_slot_name(self, boot_name: str) -> str:
        """Get slot name from boot name."""
        if not self._slots:
            raise HassOSSlotNotFound

        for name, status in self._slots.items():
            if status.bootname == boot_name:
                return name
        raise HassOSSlotNotFound

    def _get_download_url(self, version: AwesomeVersion) -> str:
        raw_url = self.sys_updater.ota_url
        if raw_url is None:
            raise HassOSUpdateError("Don't have an URL for OTA updates!", _LOGGER.error)

        update_board = self.board
        update_os_name = self.os_name

        # OS version 6 and later renamed intel-nuc to generic-x86-64...
        if update_board == "intel-nuc" and version >= 6.0:
            update_board = "generic-x86-64"

        # The OS name used to be hassos before renaming to haos...
        if version < 6.0:
            update_os_name = "hassos"
        else:
            update_os_name = "haos"

        return raw_url.format(
            version=str(version), board=update_board, os_name=update_os_name
        )

    async def _download_raucb(self, url: str, raucb: Path) -> None:
        """Download rauc bundle (OTA) from URL."""
        _LOGGER.info("Fetch OTA update from %s", url)
        try:
            timeout = aiohttp.ClientTimeout(total=60 * 60, connect=180)
            async with self.sys_websession.get(url, timeout=timeout) as request:
                if request.status != 200:
                    raise HassOSUpdateError(
                        f"Error raised from OTA Webserver: {request.status}",
                        _LOGGER.error,
                    )

                # Download RAUCB file
                ota_file = await self.sys_run_in_executor(raucb.open, "wb")
                try:
                    while True:
                        chunk = await request.content.read(1_048_576)
                        if not chunk:
                            break
                        await self.sys_run_in_executor(ota_file.write, chunk)
                finally:
                    await self.sys_run_in_executor(ota_file.close)

            _LOGGER.info("Completed download of OTA update file %s", raucb)

        except (aiohttp.ClientError, TimeoutError) as err:
            # Nudge a fresh connectivity check; the probe is authoritative,
            # this error path only hints that something may be wrong.
            self.sys_supervisor.request_connectivity_check()
            raise HassOSUpdateError(
                f"Can't fetch OTA update from {url}: {err!s}", _LOGGER.error
            ) from err

        except OSError as err:
            self.sys_resolution.check_oserror(err)
            raise HassOSUpdateError(
                f"Can't write OTA file: {err!s}", _LOGGER.error
            ) from err

    @Job(name="os_manager_reload", conditions=[JobCondition.HAOS], internal=True)
    async def reload(self) -> None:
        """Update cache of slot statuses."""
        self._slots = {
            slot[0]: SlotStatus.from_dict(slot[1])
            for slot in await self.sys_dbus.rauc.get_slot_status()
        }

    async def load(self) -> None:
        """Load HassOS data."""
        try:
            if not self.sys_host.info.cpe:
                raise NotImplementedError

            cpe = CPE(self.sys_host.info.cpe)
            os_name = cpe.get_product()[0]
            if os_name not in ("hassos", "haos"):
                self._board = BOARD_NAME_SUPERVISED.lower()
                raise NotImplementedError
        except NotImplementedError:
            _LOGGER.info("No Home Assistant Operating System found")
            return

        # Store meta data
        self._available = True
        self.sys_host.supported_features.cache_clear()
        self._version = AwesomeVersion(cpe.get_version()[0])
        self._board = cpe.get_target_hardware()[0]
        self._os_name = cpe.get_product()[0]

        await self.reload()

        await self.datadisk.load()

        _LOGGER.info(
            "Detect Home Assistant Operating System %s / BootSlot %s",
            self.version,
            self.sys_dbus.rauc.boot_slot,
        )

    async def _detect_pending_update(self) -> None:
        """Detect an installed update that still requires a reboot to activate.

        A successful rauc install makes the target slot the primary boot slot
        while the old version keeps running until reboot. Supervisor may
        restart in that window, so recover the pending state from rauc.

        Must run after the booted slot was marked good: rauc's GRUB backend
        only treats a slot as primary once it has no boot attempts pending,
        so until the boot attempt counter of the booted slot is reset,
        GetPrimary reports the previous slot as primary on every boot.
        """
        try:
            primary = await self.sys_dbus.rauc.get_primary()
        except DBusError, DBusNotConnectedError:
            _LOGGER.warning("Can't get primary boot slot from rauc")
            return

        if (
            not self._slots
            or (status := self._slots.get(primary)) is None
            or not status.bundle_version
            or not status.bootname
        ):
            return

        # Nothing pending if the primary slot is the booted one or holds
        # the same version as the running system
        if (
            status.bootname == self.sys_dbus.rauc.boot_slot
            or status.bundle_version == self.version
        ):
            return

        self._version_pending = status.bundle_version
        _LOGGER.info(
            "Home Assistant Operating System %s is installed and pending a reboot to activate",
            status.bundle_version,
        )
        self.sys_resolution.create_issue(
            IssueType.REBOOT_REQUIRED,
            ContextType.SYSTEM,
            suggestions=[SuggestionType.EXECUTE_REBOOT],
        )

    @Job(
        name="os_manager_config_sync",
        conditions=[JobCondition.HAOS],
        on_condition=HassOSJobError,
    )
    async def config_sync(self) -> None:
        """Trigger a host config reload from usb."""
        _LOGGER.info(
            "Synchronizing configuration from USB with Home Assistant Operating System."
        )
        # hassos-config.service was renamed to haos-config.service in HAOS 18.0.
        # The unit's Alias= is not reported by systemd's ListUnits, which
        # ServiceManager.exists() relies on, so call the correct unit here.
        if self.version is not None and self.version >= AwesomeVersion("18.0.rc1"):
            service = "haos-config.service"
        else:
            service = "hassos-config.service"
        await self.sys_host.services.restart(service)

    @Job(
        name="os_manager_update",
        conditions=[
            JobCondition.HAOS,
            JobCondition.HEALTHY,
            JobCondition.INTERNET_SYSTEM,
            JobCondition.RUNNING,
            JobCondition.SUPERVISOR_UPDATED,
        ],
        on_condition=HassOSJobError,
        concurrency=JobConcurrency.REJECT,
    )
    async def update(self, version: AwesomeVersion | None = None) -> None:
        """Update HassOS system."""
        version = version or self.latest_version

        # Check installed version
        if not version:
            raise HassOSUpdateError(
                "No version information available, cannot update", _LOGGER.error
            )
        if version == self.version:
            raise HassOSUpdateAlreadyInstalledError(
                _LOGGER.warning, version=str(version)
            )
        if self.version_pending is not None and version == self.version_pending:
            raise HassOSUpdatePendingRebootError(_LOGGER.warning, version=str(version))

        # Fetch files from internet
        ota_url = self._get_download_url(version)
        int_ota = Path(self.sys_config.path_tmp, f"hassos-{version!s}.raucb")
        ext_ota = Path(self.sys_config.path_extern_tmp, int_ota.name)

        async with self._exclusive_update():
            try:
                await self._download_raucb(ota_url, int_ota)
                await self._install_bundle(ext_ota, version)
            finally:
                # Also removes a partial bundle left behind by a failed download
                await self.sys_run_in_executor(partial(int_ota.unlink, missing_ok=True))

    @asynccontextmanager
    async def _exclusive_update(self) -> AsyncIterator[None]:
        """Allow only one OS update, from the internet or from a drive, at a time."""
        if self._update_lock.locked():
            raise HassOSUpdateInProgressError(None, _LOGGER.warning)

        async with self._update_lock:
            yield

    async def _install_bundle(
        self,
        ext_ota: Path,
        version: AwesomeVersion,
        *,
        reject_unverified: bool = False,
    ) -> None:
        """Install a bundle through Rauc, which verifies its signature itself.

        The bundle must be on a path the host can read. Marks the update as
        pending a reboot on success.
        """
        try:
            async with self.sys_dbus.rauc.signal_completed() as signal:
                # Start listening for signals before triggering install
                # This prevents a race condition with install complete signal

                await self.sys_dbus.rauc.install(ext_ota)
                completed = await signal.wait_for_signal()

        except DBusError as err:
            raise HassOSUpdateError("Rauc communication error", _LOGGER.error) from err

        # Update success
        if 0 in completed:
            _LOGGER.info(
                "Install of Home Assistant Operating System %s success; reboot required",
                version,
            )
            self._version_pending = version
            self.sys_resolution.create_issue(
                IssueType.REBOOT_REQUIRED,
                ContextType.SYSTEM,
                suggestions=[SuggestionType.EXECUTE_REBOOT],
            )
            return

        # Update failed
        await self.sys_dbus.rauc.update()
        last_error = self.sys_dbus.rauc.last_error
        _LOGGER.error(
            "Home Assistant Operating System update failed with: %s", last_error
        )
        # The failed install overwrote the target slot, so a previously
        # installed update pending activation is gone as well
        self._version_pending = None
        if reject_unverified and RE_RAUC_BUNDLE_REJECTED.search(last_error or ""):
            raise HassOSOfflineUpdateRejectedError(None, _LOGGER.error)
        raise HassOSUpdateError

    @property
    def offline_update_supported(self) -> bool:
        """Return true if updates can be installed from a removable drive."""
        return (
            self.available
            and HostFeature.MOUNT in self.sys_host.features
            and self.sys_dbus.udisks2.is_connected
        )

    async def offline_update_candidates(self) -> list[OfflineUpdateCandidate]:
        """List OS update bundles on removable drives."""
        if not self.offline_update_supported:
            return []
        return await self._offline_updates.discover()

    @Job(
        name="os_manager_update_from_file",
        conditions=[
            JobCondition.HAOS,
            JobCondition.HEALTHY,
            JobCondition.MOUNT_AVAILABLE,
            JobCondition.RUNNING,
            JobCondition.SUPERVISOR_UPDATED,
        ],
        on_condition=HassOSJobError,
        concurrency=JobConcurrency.REJECT,
    )
    async def update_from_file(
        self,
        drive_id: str,
        path: str,
        *,
        validation_complete: asyncio.Event | None = None,
    ) -> None:
        """Update HassOS from a bundle on a removable drive.

        Needs no internet. The bundle is copied to local storage and the drive
        is released before Rauc verifies and installs the copy.
        """
        job = self.sys_jobs.current
        job.reference = drive_id

        bundle_name = f"hassos-offline-{uuid4().hex}.raucb"
        local_bundle = Path(self.sys_config.path_tmp, bundle_name)
        ext_bundle = Path(self.sys_config.path_extern_tmp, bundle_name)
        reported_percent = 0

        def report_copy_progress(fraction: float) -> None:
            """Report the copy as the first half of the job, once per percent."""
            nonlocal reported_percent
            if (percent := int(fraction * 50)) > reported_percent:
                reported_percent = percent
                job.update(progress=percent)

        async with self._exclusive_update():
            try:
                async with self._offline_updates.session(wait=True) as bundles:
                    found = [
                        bundle
                        for bundle in bundles
                        if bundle.candidate.drive_id == drive_id
                        and bundle.candidate.path == path
                        and bundle.candidate.kind == "bundle"
                    ]
                    if not found:
                        raise HassOSOfflineUpdateNotFoundError(None, _LOGGER.warning)
                    if len(found) > 1:
                        raise HassOSOfflineUpdateNotAllowedError(
                            _LOGGER.warning,
                            reason="the same file exists on more than one "
                            "partition of the drive",
                        )

                    candidate = found[0].candidate
                    if candidate.verdict != OfflineUpdateVerdict.OK:
                        raise HassOSOfflineUpdateNotAllowedError(
                            _LOGGER.warning,
                            reason=VERDICT_REASONS[candidate.verdict],
                        )
                    version = AwesomeVersion(candidate.version)

                    # If being run in the background, notify caller that validation has completed
                    if validation_complete:
                        validation_complete.set()

                    _LOGGER.info(
                        "Copying update file %s from drive %s",
                        candidate.path,
                        candidate.drive_id,
                    )
                    job.update(progress=0, stage="copying")
                    sha256 = await self._offline_updates.copy_bundle(
                        found[0], local_bundle, report_copy_progress
                    )

                # The drive is released here, it may be removed from now on
                _LOGGER.info(
                    "Installing Home Assistant Operating System %s from drive "
                    "(file %s, SHA-256 %s)",
                    version,
                    candidate.path,
                    sha256,
                )
                job.update(progress=50, stage="installing", extra={"sha256": sha256})
                await self._install_bundle(ext_bundle, version, reject_unverified=True)
                job.update(progress=100)
            finally:
                await self.sys_run_in_executor(
                    partial(local_bundle.unlink, missing_ok=True)
                )

    @Job(
        name="os_manager_update_from_pack",
        conditions=[
            JobCondition.HAOS,
            JobCondition.HEALTHY,
            JobCondition.MOUNT_AVAILABLE,
            JobCondition.RUNNING,
            JobCondition.SUPERVISOR_UPDATED,
        ],
        on_condition=HassOSJobError,
        concurrency=JobConcurrency.REJECT,
    )
    async def update_from_pack(
        self,
        drive_id: str,
        path: str,
        *,
        validation_complete: asyncio.Event | None = None,
    ) -> dict[str, list[dict[str, str]]]:
        """Install an offline update pack from a removable drive.

        Every part is verified against the manifest before anything is touched,
        and the whole pack is refused when one part does not match. Parts are
        handled in the order Supervisor, Core, operating system. Only the
        operating system has an install path that reads a file; the others are
        reported as needing the network instead of being installed.
        """
        job = self.sys_jobs.current
        job.reference = drive_id

        bundle_name = f"hassos-offline-{uuid4().hex}.raucb"
        local_bundle = Path(self.sys_config.path_tmp, bundle_name)
        ext_bundle = Path(self.sys_config.path_extern_tmp, bundle_name)

        def stage_progress(start: int, end: int) -> Callable[[float], None]:
            reported = start

            def report(fraction: float) -> None:
                nonlocal reported
                if (percent := start + int(fraction * (end - start))) > reported:
                    reported = percent
                    job.update(progress=percent)

            return report

        async with self._exclusive_update():
            try:
                async with self._offline_updates.session(wait=True) as bundles:
                    found = [
                        bundle
                        for bundle in bundles
                        if bundle.candidate.drive_id == drive_id
                        and bundle.candidate.path == path
                        and bundle.candidate.kind == "pack"
                    ]
                    if not found:
                        raise HassOSOfflineUpdateNotFoundError(None, _LOGGER.warning)
                    if len(found) > 1:
                        raise HassOSOfflineUpdateNotAllowedError(
                            _LOGGER.warning,
                            reason="the same pack exists on more than one "
                            "partition of the drive",
                        )

                    candidate = found[0].candidate
                    manifest = found[0].manifest
                    os_part = manifest.part(PackPartKind.OS) if manifest else None
                    if candidate.verdict != OfflineUpdateVerdict.OK or os_part is None:
                        raise HassOSOfflineUpdateNotAllowedError(
                            _LOGGER.warning,
                            reason=VERDICT_REASONS[candidate.verdict],
                        )
                    version = AwesomeVersion(candidate.version)

                    if validation_complete:
                        validation_complete.set()

                    job.update(progress=0, stage="verifying")
                    try:
                        await self._offline_updates.verify_pack_parts(
                            found[0], stage_progress(0, 40)
                        )
                    except PackVerifyError as err:
                        raise HassOSOfflineUpdateNotAllowedError(
                            _LOGGER.error, reason=str(err)
                        ) from err

                    job.update(progress=40, stage="copying")
                    sha256 = await self._offline_updates.copy_file(
                        found[0].file_path.parent / str(os_part.file),
                        os_part.size,
                        local_bundle,
                        stage_progress(40, 70),
                    )
                    if sha256 != os_part.sha256:
                        raise HassOSOfflineUpdateNotAllowedError(
                            _LOGGER.error,
                            reason="the operating system part changed while it "
                            "was copied",
                        )

                results = []
                for kind in INSTALL_ORDER:
                    part = manifest.part(kind) if manifest else None
                    if kind is not PackPartKind.OS:
                        status = "needs_network" if part and part.available else "skipped"
                        results.append(
                            {
                                "kind": kind.value,
                                "status": status,
                                "reason": "no update path reads this part from a file"
                                if status == "needs_network"
                                else "not in this pack",
                            }
                        )
                        continue

                    _LOGGER.info(
                        "Installing Home Assistant Operating System %s from pack "
                        "(SHA-256 %s)",
                        version,
                        sha256,
                    )
                    job.update(progress=70, stage="installing", extra={"sha256": sha256})
                    await self._install_bundle(
                        ext_bundle, version, reject_unverified=True
                    )
                    results.append({"kind": kind.value, "status": "installed"})
                job.update(progress=100)
            finally:
                await self.sys_run_in_executor(
                    partial(local_bundle.unlink, missing_ok=True)
                )

        return {"parts": results}

    @Job(
        name="os_manager_update_raspberrypi_firmware",
        conditions=[JobCondition.HAOS],
        on_condition=HassOSJobError,
        concurrency=JobConcurrency.REJECT,
    )
    async def update_raspberrypi_firmware(self) -> None:
        """Update Raspberry Pi firmware (and VL805 where present).

        Always raises a REBOOT_REQUIRED issue on success — the running
        bootloader is the old one until reboot, regardless of whether the
        update was flashed live (BCM2712) or staged for next boot (BCM2711).
        """
        if not self.sys_dbus.agent.board.has_rpi_firmware:
            raise HassOSJobError(
                "Raspberry Pi firmware is not available on this board",
                _LOGGER.error,
            )

        rpi = self.sys_dbus.agent.board.rpi_firmware
        if rpi.update_blocked:
            raise HassOSJobError(
                "Raspberry Pi firmware update is unavailable on this boot device",
                _LOGGER.warning,
            )

        try:
            await rpi.update_firmware()
        except DBusError as err:
            raise HassOSJobError(
                f"Raspberry Pi firmware update failed: {err}. "
                "Check the Host logs for details.",
                _LOGGER.error,
            ) from err

        _LOGGER.info("Raspberry Pi firmware update completed; reboot required")
        self.sys_resolution.create_issue(
            IssueType.REBOOT_REQUIRED,
            ContextType.SYSTEM,
            suggestions=[SuggestionType.EXECUTE_REBOOT],
        )

    @Job(name="os_manager_mark_healthy", conditions=[JobCondition.HAOS], internal=True)
    async def mark_healthy(self) -> None:
        """Set booted partition as good for rauc."""
        try:
            # Marking the booted slot good resets its boot attempt counter,
            # which the pending update detection below relies on: rauc's GRUB
            # backend only treats a slot as primary once it has no boot
            # attempts pending.
            response = await self.sys_dbus.rauc.mark(RaucState.GOOD, "booted")
        except DBusError:
            _LOGGER.exception("Can't mark booted partition as healthy!")
            return
        _LOGGER.info("Rauc: slot %s - %s", self.sys_dbus.rauc.boot_slot, response[1])

        await self.reload()
        await self._detect_pending_update()

        try:
            # Marking the booted slot as active makes it the primary boot
            # slot again, which would cancel an installed update that still
            # awaits a reboot to activate.
            if not self.version_pending:
                response = await self.sys_dbus.rauc.mark(RaucState.ACTIVE, "booted")
                await self.reload()
                _LOGGER.info(
                    "Rauc: slot %s - %s", self.sys_dbus.rauc.boot_slot, response[1]
                )
        except DBusError:
            _LOGGER.exception("Can't mark booted partition as active!")

    @Job(
        name="os_manager_set_boot_slot",
        conditions=[JobCondition.HAOS],
        on_condition=HassOSJobError,
        internal=True,
    )
    async def set_boot_slot(self, boot_name: str) -> None:
        """Set active boot slot."""
        try:
            response = await self.sys_dbus.rauc.mark(
                RaucState.ACTIVE, self.get_slot_name(boot_name)
            )
        except DBusError as err:
            raise HassOSSlotUpdateError(
                f"Can't mark {boot_name} as active!", _LOGGER.error
            ) from err

        _LOGGER.info("Rauc: %s - %s", self.sys_dbus.rauc.boot_slot, response[1])

        _LOGGER.info("Rebooting into new boot slot now")
        await self.sys_host.control.reboot()

    @Job(
        name="os_manager_add_ssh_authorized_key",
        conditions=[JobCondition.HAOS],
        on_condition=HassOSJobError,
        concurrency=JobConcurrency.GROUP_QUEUE,
        internal=True,
    )
    async def add_ssh_authorized_key(self, key: str) -> None:
        """Add an SSH authorized key for root on the host and start dropbear.

        OS Agent validates the key since 1.10.0; older releases append it to
        the authorized_keys file as submitted.
        """
        _LOGGER.info("Adding SSH authorized key on host")
        try:
            await self.sys_dbus.agent.system.add_ssh_auth_key(key)
        except DBusError as err:
            raise HassOSError(
                f"Can't add SSH authorized key: {err!s}", _LOGGER.error
            ) from err

        # dropbear on Home Assistant OS is gated by
        # ConditionFileNotEmpty=/root/.ssh/authorized_keys, which systemd only
        # evaluates when the unit starts. A running dropbear re-reads the file
        # on every authentication attempt and starting an active unit is a
        # no-op, so only the stopped service needs this.
        try:
            await self.sys_host.services.start(DROPBEAR_SERVICE)
        except (HostError, DBusError) as err:
            raise HassOSError(
                f"SSH authorized key written, but can't start dropbear: {err!s}",
                _LOGGER.error,
            ) from err

    @Job(
        name="os_manager_clear_ssh_authorized_keys",
        conditions=[JobCondition.HAOS],
        on_condition=HassOSJobError,
        concurrency=JobConcurrency.GROUP_QUEUE,
        internal=True,
    )
    async def clear_ssh_authorized_keys(self) -> None:
        """Remove all SSH authorized keys of root on the host and stop dropbear."""
        _LOGGER.info("Clearing SSH authorized keys on host")
        try:
            await self.sys_dbus.agent.system.clear_ssh_auth_keys()
        except DBusError as err:
            # On affected OS Agent releases the missing-file error is the
            # empty state clearing aims for, so treat it as success there.
            if (
                self.sys_dbus.agent.version >= CLEAR_SSH_AUTH_KEYS_FIXED_VERSION
                or CLEAR_SSH_AUTH_KEYS_MISSING_FILE_ERROR not in str(err)
            ):
                raise HassOSError(
                    f"Can't clear SSH authorized keys: {err!s}", _LOGGER.error
                ) from err

        # Mirror the USB config import (haos-config), which stops dropbear
        # when the imported authorized_keys file is removed. Clearing all
        # keys is a revocation, so also terminate established sessions,
        # which survive until the service stops. Stopping an inactive unit
        # is a no-op.
        try:
            await self.sys_host.services.stop(DROPBEAR_SERVICE)
        except (HostError, DBusError) as err:
            raise HassOSError(
                f"SSH authorized keys cleared, but can't stop dropbear: {err!s}",
                _LOGGER.error,
            ) from err

    @Job(
        name="os_manager_remove_ssh_authorized_key",
        conditions=[JobCondition.HAOS],
        on_condition=HassOSJobError,
        concurrency=JobConcurrency.GROUP_QUEUE,
        internal=True,
    )
    async def remove_ssh_authorized_key(self, fingerprint: str) -> bool:
        """Remove the SSH authorized key with that fingerprint on the host.

        OS Agent can only append and clear, so the list is read, filtered,
        cleared and written back as one job. Return False when no key matches.
        """
        _LOGGER.info("Removing SSH authorized key %s on host", fingerprint)
        try:
            keys = await self.sys_dbus.agent.system.list_ssh_auth_keys()
        except DBusError as err:
            raise HassOSError(
                f"Can't list SSH authorized keys: {err!s}", _LOGGER.error
            ) from err

        remaining = [key for key in keys if key_fingerprint(key) != fingerprint]
        if len(remaining) == len(keys):
            return False

        try:
            await self.sys_dbus.agent.system.clear_ssh_auth_keys()
            for key in remaining:
                await self.sys_dbus.agent.system.add_ssh_auth_key(key)
        except DBusError as err:
            await self._restore_ssh_authorized_keys(keys)
            raise HassOSError(
                f"Can't remove SSH authorized key: {err!s}", _LOGGER.error
            ) from err

        # Established sessions survive until the service stops, so end them
        # and start it again when keys remain.
        try:
            await self.sys_host.services.stop(DROPBEAR_SERVICE)
            if remaining:
                await self.sys_host.services.start(DROPBEAR_SERVICE)
        except (HostError, DBusError) as err:
            raise HassOSError(
                f"SSH authorized key removed, but can't restart dropbear: {err!s}",
                _LOGGER.error,
            ) from err
        return True

    async def _restore_ssh_authorized_keys(self, keys: list[str]) -> None:
        """Write the original keys back after a failed removal."""
        try:
            await self.sys_dbus.agent.system.clear_ssh_auth_keys()
        except DBusError as err:
            _LOGGER.critical("Can't restore SSH authorized keys: %s", err)
            return

        # Try every key, so that one the OS Agent refuses does not lose the rest.
        for key in keys:
            try:
                await self.sys_dbus.agent.system.add_ssh_auth_key(key)
            except DBusError as err:
                _LOGGER.critical(
                    "Can't restore SSH authorized key %s: %s",
                    key_fingerprint(key) or "(unreadable)",
                    err,
                )
