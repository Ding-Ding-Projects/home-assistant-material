"""Self-check of stored backups.

The self-check reads every stored copy of a backup end to end and reports what
can be verified without restoring it. It never restores anything and never
exposes or logs the backup encryption key.
"""

import asyncio
from collections.abc import Iterable
from dataclasses import dataclass, field
import hashlib
import json
from pathlib import PurePath, PurePosixPath
import tarfile
from typing import IO, TYPE_CHECKING, Any, cast
import zlib

from securetar import (
    InvalidPasswordError,
    SecureTarArchive,
    SecureTarError,
    SecureTarReadError,
)

from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import issue_registry as ir
from homeassistant.util import dt as dt_util
from homeassistant.util.async_iterator import AsyncIteratorReader
from homeassistant.util.json import json_loads_object

from .agent import LocalBackupAgent
from .const import BUF_SIZE, DOMAIN, LOGGER
from .models import AgentBackup, BackupError, BackupNotFound, Folder
from .util import UnsupportedSecureTarVersion, _sanitize_backup_name

if TYPE_CHECKING:
    from .manager import BackupManager, ManagerBackup

STATUS_PASSED = "passed"
STATUS_FAILED = "failed"
STATUS_NOT_APPLICABLE = "not_applicable"
STATUS_COULD_NOT_CHECK = "could_not_check"

CHECK_ARCHIVE_COMPLETE = "archive_complete"
CHECK_METADATA_MATCHES = "metadata_matches"
CHECK_KEY_UNLOCKS = "key_unlocks"
CHECK_PARTS_PRESENT = "parts_present"
CHECK_DATABASE_PRESENT = "database_present"
CHECK_COPIES_MATCH = "copies_match"

CHECK_IDS = (
    CHECK_ARCHIVE_COMPLETE,
    CHECK_METADATA_MATCHES,
    CHECK_KEY_UNLOCKS,
    CHECK_PARTS_PRESENT,
    CHECK_DATABASE_PRESENT,
    CHECK_COPIES_MATCH,
)

ISSUE_ID = "backup_self_check_failed"

_INNER_SUFFIXES = ("tar", "tgz", "tar.gz")
_HA_SETTINGS_PATHS = ("data/configuration.yaml",)
_HA_SETTINGS_PREFIX = "data/.storage/"
_HA_DATABASE_PATH = "data/home-assistant_v2.db"


@dataclass(kw_only=True, slots=True)
class CheckResult:
    """The result of a single check."""

    check: str
    status: str
    reason: str | None = None
    detail: list[str] | None = None

    def to_dict(self) -> dict[str, Any]:
        """Return a JSON serializable dict."""
        result: dict[str, Any] = {"check": self.check, "status": self.status}
        if self.reason is not None:
            result["reason"] = self.reason
        if self.detail:
            result["detail"] = self.detail
        return result


@dataclass(kw_only=True, slots=True)
class SelfCheckResult:
    """The result of a self-check of one backup."""

    checked_at: str
    checks: list[CheckResult]

    @property
    def status(self) -> str:
        """Return the overall status."""
        statuses = {check.status for check in self.checks}
        if STATUS_FAILED in statuses:
            return STATUS_FAILED
        if STATUS_COULD_NOT_CHECK in statuses or STATUS_PASSED not in statuses:
            return STATUS_COULD_NOT_CHECK
        return STATUS_PASSED

    def to_dict(self) -> dict[str, Any]:
        """Return a JSON serializable dict."""
        return {
            "status": self.status,
            "checked_at": self.checked_at,
            "checks": [check.to_dict() for check in self.checks],
        }


def could_not_check_result(reason: str) -> dict[str, Any]:
    """Return a stored result for a self-check that could not run at all."""
    return SelfCheckResult(
        checked_at=dt_util.utcnow().isoformat(),
        checks=[
            CheckResult(check=check_id, status=STATUS_COULD_NOT_CHECK, reason=reason)
            for check_id in CHECK_IDS
        ],
    ).to_dict()


class _DigestReader:
    """Read only wrapper which counts and hashes the bytes passing through."""

    def __init__(self, source: IO[bytes]) -> None:
        """Initialize the reader."""
        self._source = source
        self.size = 0
        self._digest = hashlib.sha256()

    def read(self, size: int = -1) -> bytes:
        """Read from the source."""
        data = self._source.read(size)
        if data:
            self.size += len(data)
            self._digest.update(data)
        return data

    def drain(self) -> None:
        """Read what is left, so size and digest cover the whole copy."""
        while self.read(BUF_SIZE):
            pass

    @property
    def sha256(self) -> str:
        """Return the digest of everything read so far."""
        return self._digest.hexdigest()


@dataclass(kw_only=True, slots=True)
class _Scan:
    """What reading one copy found."""

    size: int = 0
    sha256: str = ""
    # Set when the copy could not be read for a reason other than its content
    source_error: str | None = None
    # Set when the archive content is unreadable or truncated
    archive_error: str | None = None
    archive_error_detail: list[str] = field(default_factory=list)
    # Only filled when the copy was analysed
    analysed: bool = False
    metadata: dict[str, Any] | None = None
    metadata_error: str | None = None
    outer_names: list[str] = field(default_factory=list)
    inner_archives_read: int = 0
    key_error: str | None = None
    has_ha_settings: bool = False
    has_database: bool = False
    inner_scanned: set[str] = field(default_factory=set)


def _read_to_end(file: IO[bytes] | None) -> None:
    """Read a file object to its end."""
    if file is None:
        return
    while file.read(BUF_SIZE):
        pass


def _scan_inner(file: IO[bytes], name: str, scan: _Scan) -> None:
    """Read an inner archive to its end, collecting what the self-check needs."""
    with tarfile.open(fileobj=file, mode="r|*", bufsize=BUF_SIZE) as inner:  # type: ignore[call-overload]
        for member in inner:
            member_path = PurePosixPath(member.name).as_posix()
            if name == "homeassistant":
                if member_path in _HA_SETTINGS_PATHS or member_path.startswith(
                    _HA_SETTINGS_PREFIX
                ):
                    scan.has_ha_settings = True
                if member_path == _HA_DATABASE_PATH:
                    scan.has_database = True
            if member.isfile():
                _read_to_end(inner.extractfile(member))
    # Anything left over (padding, gzip trailer)
    _read_to_end(file)
    scan.inner_scanned.add(name)


def _walk_outer(
    outer: tarfile.TarFile,
    secure: SecureTarArchive | None,
    scan: _Scan,
    *,
    protected: bool,
    key_available: bool,
) -> None:
    """Walk through the outer archive, reading every member."""
    for member in outer:
        member_path = PurePath(member.name)
        scan.outer_names.append(member_path.name)
        if not member.isfile():
            continue
        if member_path == PurePath("backup.json"):
            file = outer.extractfile(member)
            if file is None:
                scan.metadata_error = "backup_json_invalid"
                continue
            try:
                scan.metadata = json_loads_object(file.read())
            except ValueError, TypeError:
                scan.metadata_error = "backup_json_invalid"
            continue
        prefix, _, suffix = member_path.name.partition(".")
        if suffix not in _INNER_SUFFIXES:
            _read_to_end(outer.extractfile(member))
            continue
        if not protected:
            file = outer.extractfile(member)
            if file is None:
                continue
            try:
                _scan_inner(file, prefix, scan)
            except (
                tarfile.TarError,
                EOFError,
                zlib.error,
            ) as err:
                scan.archive_error = "inner_archive_unreadable"
                scan.archive_error_detail.append(prefix)
                LOGGER.debug("Self-check could not read %s: %s", prefix, err)
            scan.inner_archives_read += 1
            continue
        if not key_available or secure is None:
            # Skip the encrypted data, the next member is found by the outer tar
            _read_to_end(outer.extractfile(member))
            continue
        try:
            with secure.extract_tar(member) as decrypted:
                if decrypted.plaintext_size is None:
                    raise UnsupportedSecureTarVersion  # noqa: TRY301
                _scan_inner(cast(IO[bytes], decrypted), prefix, scan)
        except InvalidPasswordError, SecureTarReadError:
            scan.key_error = "wrong_key"
        except UnsupportedSecureTarVersion:
            scan.key_error = "unsupported_secure_tar_version"
        except SecureTarError:
            scan.key_error = "wrong_key"
        except (tarfile.TarError, EOFError, zlib.error) as err:
            scan.archive_error = "inner_archive_unreadable"
            scan.archive_error_detail.append(prefix)
            LOGGER.debug("Self-check could not read %s: %s", prefix, err)
        else:
            scan.inner_archives_read += 1


def scan_copy(
    source: IO[bytes],
    *,
    analyse: bool,
    protected: bool,
    password: str | None,
) -> _Scan:
    """Read a copy of a backup from start to end.

    Runs in the executor. With analyse the content is verified as well, without
    it the copy is only read to get its size and digest.
    """
    scan = _Scan()
    reader = _DigestReader(source)
    try:
        if analyse:
            scan.analysed = True
            key_available = bool(protected and password is not None)
            try:
                if protected and key_available:
                    with SecureTarArchive(
                        fileobj=cast(IO[bytes], reader),
                        mode="r",
                        bufsize=BUF_SIZE,
                        streaming=True,
                        password=password,
                    ) as secure:
                        _walk_outer(
                            secure.tar,
                            secure,
                            scan,
                            protected=True,
                            key_available=True,
                        )
                else:
                    with tarfile.open(  # type: ignore[call-overload]
                        fileobj=reader, mode="r|", bufsize=BUF_SIZE
                    ) as outer:
                        _walk_outer(
                            outer,
                            None,
                            scan,
                            protected=protected,
                            key_available=False,
                        )
            except (tarfile.TarError, EOFError, zlib.error) as err:
                scan.archive_error = "archive_unreadable"
                LOGGER.debug("Self-check could not read the archive: %s", err)
            except UnsupportedSecureTarVersion:
                scan.key_error = "unsupported_secure_tar_version"
            except SecureTarError:
                scan.key_error = "wrong_key"
        reader.drain()
    except BackupError as err:
        scan.source_error = err.error_code
    except OSError as err:
        scan.source_error = "read_error"
        LOGGER.debug("Self-check could not read a copy: %s", err)
    scan.size = reader.size
    scan.sha256 = reader.sha256
    return scan


def _expected_parts(backup: AgentBackup) -> list[str]:
    """Return the outer archive names a backup says it has."""
    parts = []
    if backup.homeassistant_included:
        parts.append("homeassistant")
    parts.extend(addon.slug for addon in backup.addons)
    parts.extend(folder.value for folder in backup.folders)
    return parts


def _check_archive_complete(
    scan: _Scan | None, reported_size: int | None
) -> CheckResult:
    """Check that the archive is complete and readable end to end."""
    check = CHECK_ARCHIVE_COMPLETE
    if scan is None or scan.source_error:
        return CheckResult(
            check=check,
            status=STATUS_COULD_NOT_CHECK,
            reason=scan.source_error if scan else "no_readable_copy",
        )
    if scan.archive_error:
        return CheckResult(
            check=check,
            status=STATUS_FAILED,
            reason=scan.archive_error,
            detail=scan.archive_error_detail or None,
        )
    if reported_size is not None and scan.size != reported_size:
        return CheckResult(check=check, status=STATUS_FAILED, reason="size_mismatch")
    return CheckResult(check=check, status=STATUS_PASSED)


def _check_metadata(scan: _Scan | None, backup: AgentBackup) -> CheckResult:
    """Check that backup.json agrees with the record of the manager."""
    check = CHECK_METADATA_MATCHES
    if scan is None or scan.source_error or not scan.analysed:
        return CheckResult(
            check=check, status=STATUS_COULD_NOT_CHECK, reason="no_readable_copy"
        )
    if scan.archive_error == "archive_unreadable":
        return CheckResult(
            check=check, status=STATUS_COULD_NOT_CHECK, reason="archive_unreadable"
        )
    if scan.metadata_error or scan.metadata is None:
        return CheckResult(
            check=check,
            status=STATUS_FAILED,
            reason=scan.metadata_error or "backup_json_missing",
        )
    data = scan.metadata
    mismatches: list[str] = []
    try:
        if data.get("slug") != backup.backup_id:
            mismatches.append("backup_id")
        if _sanitize_backup_name(cast(str, data["name"])) != backup.name:
            mismatches.append("name")
        if bool(data.get("protected", False)) != backup.protected:
            mismatches.append("protected")
        addons = {
            cast(dict[str, Any], addon)["slug"]
            for addon in cast(list[Any], data.get("addons", []))
        }
        if addons != {addon.slug for addon in backup.addons}:
            mismatches.append("addons")
        folders = {
            Folder(folder)
            for folder in cast(list[str], data.get("folders", []))
            if folder != "homeassistant"
        }
        if folders != set(backup.folders):
            mismatches.append("folders")
        homeassistant = cast(dict[str, Any] | None, data.get("homeassistant"))
        homeassistant_included = bool(homeassistant and "version" in homeassistant)
        if homeassistant_included != backup.homeassistant_included:
            mismatches.append("homeassistant")
    except KeyError, TypeError, ValueError, AttributeError:
        return CheckResult(
            check=check, status=STATUS_FAILED, reason="backup_json_invalid"
        )
    if mismatches:
        return CheckResult(
            check=check,
            status=STATUS_FAILED,
            reason="metadata_mismatch",
            detail=mismatches,
        )
    return CheckResult(check=check, status=STATUS_PASSED)


def _check_key(
    scan: _Scan | None, backup: AgentBackup, password: str | None
) -> CheckResult:
    """Check that a protected backup unlocks with the configured key."""
    check = CHECK_KEY_UNLOCKS
    if not backup.protected:
        return CheckResult(check=check, status=STATUS_NOT_APPLICABLE)
    if password is None:
        return CheckResult(
            check=check, status=STATUS_COULD_NOT_CHECK, reason="no_key_configured"
        )
    if scan is None or scan.source_error or not scan.analysed:
        return CheckResult(
            check=check, status=STATUS_COULD_NOT_CHECK, reason="no_readable_copy"
        )
    if scan.key_error == "unsupported_secure_tar_version":
        return CheckResult(
            check=check, status=STATUS_COULD_NOT_CHECK, reason=scan.key_error
        )
    if scan.key_error:
        return CheckResult(check=check, status=STATUS_FAILED, reason=scan.key_error)
    if scan.inner_archives_read == 0:
        return CheckResult(
            check=check, status=STATUS_COULD_NOT_CHECK, reason="no_encrypted_archive"
        )
    return CheckResult(check=check, status=STATUS_PASSED)


def _check_parts(scan: _Scan | None, backup: AgentBackup) -> CheckResult:
    """Check that every part the backup lists is inside the archive."""
    check = CHECK_PARTS_PRESENT
    if scan is None or scan.source_error or not scan.analysed:
        return CheckResult(
            check=check, status=STATUS_COULD_NOT_CHECK, reason="no_readable_copy"
        )
    if scan.archive_error == "archive_unreadable":
        return CheckResult(
            check=check, status=STATUS_COULD_NOT_CHECK, reason="archive_unreadable"
        )
    present = set()
    for name in scan.outer_names:
        prefix, _, suffix = name.partition(".")
        if suffix in _INNER_SUFFIXES:
            present.add(prefix)
    missing = [part for part in _expected_parts(backup) if part not in present]
    if (
        not missing
        and backup.homeassistant_included
        and "homeassistant" in scan.inner_scanned
        and not scan.has_ha_settings
    ):
        missing.append("homeassistant_settings")
    if missing:
        return CheckResult(
            check=check, status=STATUS_FAILED, reason="missing_parts", detail=missing
        )
    return CheckResult(check=check, status=STATUS_PASSED)


def _check_database(scan: _Scan | None, backup: AgentBackup) -> CheckResult:
    """Check that the database is inside a backup which says it includes it."""
    check = CHECK_DATABASE_PRESENT
    if not backup.homeassistant_included or not backup.database_included:
        return CheckResult(check=check, status=STATUS_NOT_APPLICABLE)
    if (
        scan is None
        or scan.source_error
        or not scan.analysed
        or "homeassistant" not in scan.inner_scanned
    ):
        return CheckResult(
            check=check,
            status=STATUS_COULD_NOT_CHECK,
            reason="homeassistant_archive_not_read",
        )
    if scan.has_database:
        return CheckResult(check=check, status=STATUS_PASSED)
    # An external database server leaves no database file in the archive
    return CheckResult(
        check=check, status=STATUS_COULD_NOT_CHECK, reason="no_database_file"
    )


def _check_copies(
    copies: dict[str, tuple[bool, int, _Scan]],
) -> CheckResult:
    """Check that every copy has the size it reports and the copies agree."""
    check = CHECK_COPIES_MATCH
    if len(copies) < 2:
        return CheckResult(check=check, status=STATUS_NOT_APPLICABLE)
    unreadable = sorted(
        agent_id for agent_id, (_, _, scan) in copies.items() if scan.source_error
    )
    readable = {
        agent_id: value
        for agent_id, value in copies.items()
        if not value[2].source_error
    }
    mismatching: list[str] = [
        agent_id
        for agent_id, (_, reported, scan) in readable.items()
        if scan.size != reported
    ]
    # Copies with the same protection hold the same bytes
    by_protection: dict[bool, dict[str, str]] = {}
    for agent_id, (protected, _, scan) in readable.items():
        by_protection.setdefault(protected, {})[agent_id] = scan.sha256
    for digests in by_protection.values():
        if len(set(digests.values())) > 1:
            mismatching.extend(digests)
    if mismatching:
        return CheckResult(
            check=check,
            status=STATUS_FAILED,
            reason="copy_mismatch",
            detail=sorted(set(mismatching)),
        )
    if unreadable or len(readable) < 2:
        return CheckResult(
            check=check,
            status=STATUS_COULD_NOT_CHECK,
            reason="copy_not_readable",
            detail=unreadable or None,
        )
    return CheckResult(check=check, status=STATUS_PASSED)


def _agent_order(manager: BackupManager, agent_ids: Iterable[str]) -> list[str]:
    """Order agents so a local copy, the cheapest to read, comes first."""
    return sorted(
        agent_ids,
        key=lambda agent_id: (agent_id not in manager.local_backup_agents, agent_id),
    )


async def _async_scan_copy(
    manager: BackupManager,
    agent_id: str,
    backup_id: str,
    *,
    analyse: bool,
    protected: bool,
    password: str | None,
) -> _Scan:
    """Open one copy and scan it."""
    hass = manager.hass
    reader: IO[bytes] | None = None
    try:
        if agent_id in manager.local_backup_agents:
            local_agent: LocalBackupAgent = manager.local_backup_agents[agent_id]
            path = local_agent.get_backup_path(backup_id)
            reader = await hass.async_add_executor_job(open, path.as_posix(), "rb")
        else:
            stream = await manager.backup_agents[agent_id].async_download_backup(
                backup_id
            )
            reader = cast(IO[bytes], AsyncIteratorReader(hass.loop, stream))
        return await hass.async_add_executor_job(
            lambda: scan_copy(
                cast(IO[bytes], reader),
                analyse=analyse,
                protected=protected,
                password=password,
            )
        )
    except BackupNotFound:
        return _Scan(source_error=BackupNotFound.error_code)
    except (BackupError, OSError, HomeAssistantError) as err:
        return _Scan(
            source_error=err.error_code
            if isinstance(err, BackupError)
            else "read_error"
        )
    finally:
        if reader is not None:
            if isinstance(reader, AsyncIteratorReader):
                await reader.aclose()
            else:
                await hass.async_add_executor_job(reader.close)


async def async_self_check(
    manager: BackupManager, backup_id: str
) -> SelfCheckResult | None:
    """Run the self-check on every copy of a backup.

    Returns None if no agent has the backup.
    """
    backup, _ = await manager.async_get_backup(backup_id)
    if backup is None:
        return None
    password = manager.config.data.create_backup.password

    order = _agent_order(manager, backup.agents)
    scans: dict[str, _Scan] = {}
    primary_id: str | None = None
    for agent_id in order:
        status = backup.agents[agent_id]
        analyse = primary_id is None
        scan = await _async_scan_copy(
            manager,
            agent_id,
            backup_id,
            analyse=analyse,
            protected=status.protected,
            password=password,
        )
        scans[agent_id] = scan
        if analyse and not scan.source_error:
            primary_id = agent_id

    primary = scans[primary_id] if primary_id else None
    primary_status = backup.agents[primary_id] if primary_id else None
    # The record the content is compared with is that of the copy that was read
    record = _agent_backup_record(backup, primary_status)

    copies = {
        agent_id: (
            backup.agents[agent_id].protected,
            backup.agents[agent_id].size,
            scan,
        )
        for agent_id, scan in scans.items()
    }
    key_scan = primary
    checks = [
        _check_archive_complete(
            primary or next(iter(scans.values()), None),
            primary_status.size if primary_status else None,
        ),
        _check_metadata(primary, record),
        _check_key(key_scan, record, password),
        _check_parts(primary, record),
        _check_database(primary, record),
        _check_copies(copies),
    ]
    return SelfCheckResult(checked_at=dt_util.utcnow().isoformat(), checks=checks)


def _agent_backup_record(backup: ManagerBackup, status: Any) -> AgentBackup:
    """Return the record of a copy as an AgentBackup."""
    return AgentBackup(
        addons=backup.addons,
        backup_id=backup.backup_id,
        database_included=backup.database_included,
        date=backup.date,
        extra_metadata=backup.extra_metadata,
        folders=backup.folders,
        homeassistant_included=backup.homeassistant_included,
        homeassistant_version=backup.homeassistant_version,
        name=backup.name,
        protected=status.protected if status else False,
        size=status.size if status else 0,
    )


def update_issue(
    hass: HomeAssistant, backup_name: str, result: SelfCheckResult
) -> None:
    """Raise or clear the repairs issue for a failed self-check."""
    failed = [check.check for check in result.checks if check.status == STATUS_FAILED]
    if not failed:
        ir.async_delete_issue(hass, DOMAIN, ISSUE_ID)
        return
    ir.async_create_issue(
        hass,
        DOMAIN,
        ISSUE_ID,
        is_fixable=False,
        is_persistent=True,
        learn_more_url="homeassistant://config/backup",
        severity=ir.IssueSeverity.WARNING,
        translation_key="backup_self_check_failed",
        translation_placeholders={
            "backup_name": str(backup_name),
            "failed_checks": ", ".join(failed),
        },
    )


class SelfCheckRunner:
    """Run self-checks as their own cancellable tasks."""

    def __init__(self, manager: BackupManager) -> None:
        """Initialize the runner."""
        self._manager = manager
        self._tasks: dict[str, asyncio.Task[None]] = {}

    def schedule(self, backup_id: str) -> None:
        """Run the self-check of a backup in the background."""
        if not isinstance(backup_id, str):
            return
        if (task := self._tasks.get(backup_id)) and not task.done():
            return
        task = self._manager.hass.async_create_background_task(
            self._run(backup_id), name=f"backup_self_check_{backup_id}"
        )
        self._tasks[backup_id] = task
        task.add_done_callback(lambda _: self._tasks.pop(backup_id, None))

    async def async_wait(self) -> None:
        """Wait for the running self-checks to finish."""
        if self._tasks:
            await asyncio.gather(*self._tasks.values(), return_exceptions=True)

    def cancel_all(self) -> None:
        """Cancel every running self-check."""
        for task in list(self._tasks.values()):
            task.cancel()

    async def _run(self, backup_id: str) -> None:
        """Run the self-check and store the result."""
        manager = self._manager
        try:
            result = await async_self_check(manager, backup_id)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            LOGGER.exception("Unexpected error in the self-check of %s", backup_id)
            manager.known_backups.set_self_check(
                backup_id, could_not_check_result("unexpected_error")
            )
            return
        if result is None:
            return
        manager.known_backups.set_self_check(backup_id, result.to_dict())
        backup, _ = await manager.async_get_backup(backup_id)
        update_issue(manager.hass, backup.name if backup else backup_id, result)


def decode_stored(data: Any) -> dict[str, Any] | None:
    """Return a stored self-check result if it has the expected shape."""
    if not isinstance(data, dict):
        return None
    try:
        json.dumps(data)
    except TypeError, ValueError:
        return None
    return data
