"""Self-check of stored backups.

The self-check reads the local copy of a backup end to end and reports what
can be verified without restoring it. Remote copies get a light check by
default (the copy exists, can be opened and has the expected size); a full
download is opt-in. It never restores anything and never exposes or logs the
backup encryption key.
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

from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import issue_registry as ir
from homeassistant.helpers.storage import Store
from homeassistant.helpers.typing import UNDEFINED, UndefinedType
from homeassistant.util import dt as dt_util
from homeassistant.util.async_iterator import AsyncIteratorReader
from homeassistant.util.json import json_loads_object

from .agent import LocalBackupAgent
from .const import BUF_SIZE, DOMAIN, LOGGER
from .models import AgentBackup, BackupError, BackupNotFound, Folder
from .util import UnsupportedSecureTarVersion, _sanitize_backup_name

if TYPE_CHECKING:
    from .manager import BackupManager, ManagerBackup

REMOTE_MODE_OFF = "off"
REMOTE_MODE_LIGHT = "light"
REMOTE_MODE_FULL = "full"
REMOTE_MODES = (REMOTE_MODE_OFF, REMOTE_MODE_LIGHT, REMOTE_MODE_FULL)

DEFAULT_MAX_FULL_DOWNLOAD_BYTES = 1024**3
LIGHT_CHECK_TIMEOUT = 60
SETTINGS_STORAGE_KEY = "backup.self_check"
SETTINGS_STORAGE_VERSION = 1

KIND_LOCAL = "local"
KIND_NETWORK = "network"
KIND_REMOTE = "remote"
SUPERVISOR_DOMAIN = "hassio"
SUPERVISOR_LOCAL_LOCATION = ".local"
SUPERVISOR_LOCAL_AGENT_ID = f"{SUPERVISOR_DOMAIN}.local"
SUPERVISOR_CLOUD_LOCATION = ".cloud_backup"

METHOD_FULL = "full"
METHOD_LIGHT = "light"
METHOD_NONE = "none"

COPY_VERIFIED_IN_FULL = "verified_in_full"
COPY_PRESENT_SIZE_MATCHES = "present_size_matches"
COPY_PRESENT_SIZE_DIFFERS = "present_size_differs"
COPY_CONTENT_DIFFERS = "content_differs"
COPY_DAMAGED = "damaged"
COPY_MISSING = "missing"
COPY_COULD_NOT_CHECK = "could_not_check"
COPY_NOT_CHECKED = "not_checked"

_COPY_PROBLEMS = frozenset(
    {COPY_PRESENT_SIZE_DIFFERS, COPY_CONTENT_DIFFERS, COPY_DAMAGED, COPY_MISSING}
)
_COPY_UNCERTAIN = frozenset({COPY_COULD_NOT_CHECK, COPY_NOT_CHECKED})
_COPY_PROBLEM_TEXT = {
    COPY_PRESENT_SIZE_DIFFERS: "the copy has a different size than expected",
    COPY_CONTENT_DIFFERS: "the copy differs from the other copies",
    COPY_DAMAGED: "the copy is damaged or incomplete",
    COPY_MISSING: "the copy is missing",
}

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
class SelfCheckSettings:
    """Settings of the self-check of remote copies."""

    remote_mode: str = REMOTE_MODE_LIGHT
    max_full_download_bytes: int | None = DEFAULT_MAX_FULL_DOWNLOAD_BYTES

    def to_dict(self) -> dict[str, Any]:
        """Return a JSON serializable dict."""
        return {
            "remote_mode": self.remote_mode,
            "max_full_download_bytes": self.max_full_download_bytes,
        }

    @classmethod
    def from_dict(cls, data: Any) -> SelfCheckSettings:
        """Return settings from stored data, falling back to the defaults."""
        settings = cls()
        if not isinstance(data, dict):
            return settings
        if data.get("remote_mode") in REMOTE_MODES:
            settings.remote_mode = data["remote_mode"]
        if "max_full_download_bytes" in data:
            limit = data["max_full_download_bytes"]
            if limit is None or (
                isinstance(limit, int) and not isinstance(limit, bool) and limit > 0
            ):
                settings.max_full_download_bytes = limit
        return settings


@dataclass(kw_only=True, slots=True)
class CopyResult:
    """The result of checking the copy of a backup at one location."""

    agent_id: str
    method: str
    status: str
    reason: str | None = None
    size_reported: int | None = None
    size_expected: int | None = None
    size_read: int | None = None
    opened: bool | None = None
    downgraded: str | None = None

    def to_dict(self) -> dict[str, Any]:
        """Return a JSON serializable dict without unset fields."""
        return {
            key: value
            for key, value in (
                ("agent_id", self.agent_id),
                ("method", self.method),
                ("status", self.status),
                ("reason", self.reason),
                ("size_reported", self.size_reported),
                ("size_expected", self.size_expected),
                ("size_read", self.size_read),
                ("opened", self.opened),
                ("downgraded", self.downgraded),
            )
            if value is not None
        }


@dataclass(kw_only=True, slots=True)
class SelfCheckResult:
    """The result of a self-check of one backup."""

    checked_at: str
    checks: list[CheckResult]
    copies: list[CopyResult] = field(default_factory=list)
    settings: SelfCheckSettings | None = None

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
        result: dict[str, Any] = {
            "status": self.status,
            "checked_at": self.checked_at,
            "checks": [check.to_dict() for check in self.checks],
            "copies": [copy.to_dict() for copy in self.copies],
        }
        if self.settings is not None:
            result["settings"] = self.settings.to_dict()
        return result


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
    except HomeAssistantError, OSError:
        scan.source_error = "read_error"
        LOGGER.debug("Self-check could not read a copy", exc_info=True)
    except Exception:  # noqa: BLE001
        # A provider stream that breaks half way, for example on throttling
        scan.source_error = "read_error"
        LOGGER.debug("Self-check lost the stream of a copy", exc_info=True)
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


def _check_copies(copies: list[CopyResult]) -> CheckResult:
    """Check that every copy is the expected one and the copies agree."""
    check = CHECK_COPIES_MATCH
    if len(copies) < 2:
        return CheckResult(check=check, status=STATUS_NOT_APPLICABLE)
    problems = sorted(copy.agent_id for copy in copies if copy.status in _COPY_PROBLEMS)
    if problems:
        return CheckResult(
            check=check,
            status=STATUS_FAILED,
            reason="copy_mismatch",
            detail=problems,
        )
    not_checked = sorted(
        copy.agent_id for copy in copies if copy.status == COPY_NOT_CHECKED
    )
    unreadable = sorted(
        copy.agent_id for copy in copies if copy.status == COPY_COULD_NOT_CHECK
    )
    if not_checked and not unreadable:
        return CheckResult(
            check=check,
            status=STATUS_COULD_NOT_CHECK,
            reason="remote_checks_off",
            detail=not_checked,
        )
    if unreadable or not_checked:
        return CheckResult(
            check=check,
            status=STATUS_COULD_NOT_CHECK,
            reason="copy_not_readable",
            detail=sorted(unreadable + not_checked),
        )
    return CheckResult(check=check, status=STATUS_PASSED)


def _judge_full(agent_id: str, scan: _Scan, reported_size: int) -> CopyResult:
    """Judge a copy which was downloaded and read to its end."""
    result = CopyResult(
        agent_id=agent_id,
        method=METHOD_FULL,
        status=COPY_VERIFIED_IN_FULL,
        size_reported=reported_size,
        size_read=scan.size,
    )
    if scan.source_error == BackupNotFound.error_code:
        result.status = COPY_MISSING
        result.reason = scan.source_error
        result.size_read = None
    elif scan.source_error:
        result.status = COPY_COULD_NOT_CHECK
        result.reason = scan.source_error
        result.size_read = None
    elif scan.archive_error:
        result.status = COPY_DAMAGED
        result.reason = scan.archive_error
    elif scan.size != reported_size:
        result.status = COPY_PRESENT_SIZE_DIFFERS
        result.reason = "size_mismatch"
    return result


def _mark_digest_differences(
    results: dict[str, CopyResult],
    scans: dict[str, _Scan],
    protection: dict[str, bool],
) -> None:
    """Mark fully read copies with the same protection but different bytes."""
    by_protection: dict[bool, dict[str, str]] = {}
    for agent_id, result in results.items():
        if result.status == COPY_VERIFIED_IN_FULL and agent_id in scans:
            by_protection.setdefault(protection[agent_id], {})[agent_id] = scans[
                agent_id
            ].sha256
    for digests in by_protection.values():
        if len(set(digests.values())) > 1:
            for agent_id in digests:
                results[agent_id].status = COPY_CONTENT_DIFFERS
                results[agent_id].reason = "digest_differs_from_other_copy"


async def _async_open_first_chunk(
    manager: BackupManager, agent_id: str, backup_id: str
) -> bool:
    """Open a remote copy and read its first chunk, then stop.

    Returns False if the stream was empty.
    """
    stream = await manager.backup_agents[agent_id].async_download_backup(backup_id)
    try:
        async for chunk in stream:
            return bool(chunk)
        return False
    finally:
        if (aclose := getattr(stream, "aclose", None)) is not None:
            try:
                await aclose()
            except Exception:  # noqa: BLE001
                LOGGER.debug("Self-check could not close a stream", exc_info=True)


def _error_reason(err: BaseException) -> str:
    """Return a short reason code for an error while checking a copy."""
    if isinstance(err, BackupError):
        return err.error_code
    if isinstance(err, TimeoutError):
        return "timeout"
    return "read_error"


async def _async_light_check(
    manager: BackupManager,
    agent_id: str,
    backup_id: str,
    reported_size: int,
    expected_size: int | None,
    *,
    downgraded: str | None = None,
) -> CopyResult:
    """Check a remote copy without downloading it.

    The copy is opened and its first chunk is read. Its size, as the location
    reports it, is compared with the size of the reference copy.
    """
    result = CopyResult(
        agent_id=agent_id,
        method=METHOD_LIGHT,
        status=COPY_COULD_NOT_CHECK,
        size_reported=reported_size,
        size_expected=expected_size,
        downgraded=downgraded,
    )
    if expected_size is not None and reported_size != expected_size:
        result.status = COPY_PRESENT_SIZE_DIFFERS
        result.reason = "size_mismatch"
        return result
    try:
        async with asyncio.timeout(LIGHT_CHECK_TIMEOUT):
            opened = await _async_open_first_chunk(manager, agent_id, backup_id)
    except BackupNotFound:
        result.status = COPY_MISSING
        result.reason = BackupNotFound.error_code
        return result
    except (BackupError, OSError, HomeAssistantError) as err:
        result.reason = _error_reason(err)
        return result
    except Exception:  # noqa: BLE001
        LOGGER.debug("Self-check could not open a copy", exc_info=True)
        result.reason = "read_error"
        return result
    result.opened = opened
    if not opened:
        result.reason = "empty_copy"
    elif expected_size is None:
        result.reason = "no_reference_size"
    else:
        result.status = COPY_PRESENT_SIZE_MATCHES
    return result


def _remote_reference_size(backup: ManagerBackup, remote_ids: list[str]) -> int | None:
    """Return the size at least two remote copies agree on."""
    sizes: dict[int, int] = {}
    for agent_id in remote_ids:
        size = backup.agents[agent_id].size
        sizes[size] = sizes.get(size, 0) + 1
    if not sizes:
        return None
    size, count = max(sizes.items(), key=lambda item: item[1])
    return size if count >= 2 else None


def _agent_kind(manager: BackupManager, agent_id: str) -> str:
    """Return where the copy of an agent lives.

    Core's own local agent and the Supervisor's local storage are on this
    machine. A Supervisor network mount is on the home network. Everything
    else is a remote location.
    """
    if agent_id in manager.local_backup_agents:
        return KIND_LOCAL
    agent = manager.backup_agents.get(agent_id)
    if getattr(agent, "domain", None) != SUPERVISOR_DOMAIN:
        return KIND_REMOTE
    location = getattr(agent, "location", KIND_REMOTE)
    # hassio/backup.py: the Supervisor's local storage is created as
    # SupervisorBackupAgent(hass, "local", LOCATION_LOCAL_STORAGE), where
    # LOCATION_LOCAL_STORAGE is ".local", and so has the agent id "hassio.local".
    if (
        location is None
        or location == SUPERVISOR_LOCAL_LOCATION
        or agent_id == SUPERVISOR_LOCAL_AGENT_ID
    ):
        return KIND_LOCAL
    # LOCATION_CLOUD_BACKUP, ".cloud_backup"
    if location == SUPERVISOR_CLOUD_LOCATION:
        return KIND_REMOTE
    # Network mounts are created with the mount name as name and location
    return KIND_NETWORK


def _agent_order(manager: BackupManager, agent_ids: Iterable[str]) -> list[str]:
    """Order agents so the cheapest copy to read comes first."""
    rank = {KIND_LOCAL: 0, KIND_NETWORK: 1, KIND_REMOTE: 2}
    return sorted(
        agent_ids,
        key=lambda agent_id: (rank[_agent_kind(manager, agent_id)], agent_id),
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
    except Exception:  # noqa: BLE001
        LOGGER.debug("Self-check could not open a copy", exc_info=True)
        return _Scan(source_error="read_error")
    finally:
        if reader is not None:
            if isinstance(reader, AsyncIteratorReader):
                await reader.aclose()
            else:
                await hass.async_add_executor_job(reader.close)


def _copy_method(
    settings: SelfCheckSettings, *, kind: str, size: int
) -> tuple[str, str | None]:
    """Return how a copy is checked, and why a full check was downgraded."""
    if kind == KIND_LOCAL:
        return METHOD_FULL, None
    if kind == KIND_NETWORK and settings.remote_mode == REMOTE_MODE_LIGHT:
        # A mount on the home network is cheap to read, so Light reads it too
        settings = SelfCheckSettings(
            remote_mode=REMOTE_MODE_FULL,
            max_full_download_bytes=settings.max_full_download_bytes,
        )
    if settings.remote_mode == REMOTE_MODE_FULL:
        if (
            settings.max_full_download_bytes is not None
            and size > settings.max_full_download_bytes
        ):
            return METHOD_LIGHT, "over_size_limit"
        return METHOD_FULL, None
    if settings.remote_mode == REMOTE_MODE_LIGHT:
        return METHOD_LIGHT, None
    return METHOD_NONE, None


async def async_self_check(
    manager: BackupManager,
    backup_id: str,
    *,
    settings: SelfCheckSettings | None = None,
) -> SelfCheckResult | None:
    """Run the self-check on every copy of a backup.

    The local copy is always read in full. Remote copies are checked as the
    settings say. Returns None if no agent has the backup.
    """
    settings = settings or SelfCheckSettings()
    backup, agent_errors = await manager.async_get_backup(backup_id)
    if backup is None:
        return None
    password = manager.config.data.create_backup.password

    order = _agent_order(manager, backup.agents)
    kinds = {agent_id: _agent_kind(manager, agent_id) for agent_id in order}
    remote_ids = [agent_id for agent_id in order if kinds[agent_id] != KIND_LOCAL]
    protection = {agent_id: backup.agents[agent_id].protected for agent_id in order}
    remote_reference = _remote_reference_size(backup, remote_ids)
    scans: dict[str, _Scan] = {}
    results: dict[str, CopyResult] = {}
    primary_id: str | None = None
    reference_size: int | None = None
    for agent_id in order:
        status = backup.agents[agent_id]
        is_local = kinds[agent_id] == KIND_LOCAL
        method, downgraded = _copy_method(
            settings, kind=kinds[agent_id], size=status.size
        )
        if method == METHOD_NONE:
            results[agent_id] = CopyResult(
                agent_id=agent_id,
                method=METHOD_NONE,
                status=COPY_NOT_CHECKED,
                reason="remote_checks_off",
                size_reported=status.size,
            )
            continue
        if method == METHOD_LIGHT:
            expected = (
                reference_size if reference_size is not None else remote_reference
            )
            results[agent_id] = await _async_light_check(
                manager,
                agent_id,
                backup_id,
                status.size,
                expected,
                downgraded=downgraded,
            )
            continue
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
        if not scan.source_error:
            if analyse:
                primary_id = agent_id
            if is_local and reference_size is None:
                reference_size = scan.size
        results[agent_id] = _judge_full(agent_id, scan, status.size)
    _mark_digest_differences(results, scans, protection)

    for agent_id, err in agent_errors.items():
        if agent_id not in results:
            results[agent_id] = CopyResult(
                agent_id=agent_id,
                method=METHOD_NONE,
                status=COPY_COULD_NOT_CHECK,
                reason=_error_reason(err),
            )

    primary = scans[primary_id] if primary_id else None
    primary_status = backup.agents[primary_id] if primary_id else None
    # The record the content is compared with is that of the copy that was read
    record = _agent_backup_record(backup, primary_status)

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
        _check_copies(list(results.values())),
    ]
    if not scans and any(copy.method == METHOD_LIGHT for copy in results.values()):
        for check in checks:
            if check.reason == "no_readable_copy":
                check.reason = "remote_copy_not_downloaded"
    return SelfCheckResult(
        checked_at=dt_util.utcnow().isoformat(),
        checks=checks,
        copies=list(results.values()),
        settings=settings,
    )


async def async_check_location(
    manager: BackupManager,
    backup_id: str,
    agent_id: str,
    *,
    full_download: bool,
    settings: SelfCheckSettings | None = None,
) -> CopyResult | None:
    """Check the copy of one backup at one location.

    A full download is done only when asked for. Returns None if no location
    has the backup at all.
    """
    settings = settings or SelfCheckSettings()
    backup, agent_errors = await manager.async_get_backup(backup_id)
    if backup is None and agent_id not in agent_errors:
        return None
    if backup is None or agent_id not in backup.agents:
        if agent_id in agent_errors:
            return CopyResult(
                agent_id=agent_id,
                method=METHOD_NONE,
                status=COPY_COULD_NOT_CHECK,
                reason=_error_reason(agent_errors[agent_id]),
            )
        return CopyResult(
            agent_id=agent_id,
            method=METHOD_NONE,
            status=COPY_MISSING,
            reason=BackupNotFound.error_code,
        )
    status = backup.agents[agent_id]
    password = manager.config.data.create_backup.password
    is_local = _agent_kind(manager, agent_id) == KIND_LOCAL
    local_other = next(
        (
            other
            for other in _agent_order(manager, backup.agents)
            if _agent_kind(manager, other) == KIND_LOCAL and other != agent_id
        ),
        None,
    )

    if not is_local and not full_download:
        expected = backup.agents[local_other].size if local_other else None
        if expected is None:
            remote_ids = [
                other
                for other in backup.agents
                if _agent_kind(manager, other) != KIND_LOCAL and other != agent_id
            ]
            expected = _remote_reference_size(backup, [agent_id, *remote_ids])
        return await _async_light_check(
            manager, agent_id, backup_id, status.size, expected
        )

    reference: _Scan | None = None
    local_other_protected = False
    if local_other is not None:
        local_other_protected = backup.agents[local_other].protected
        reference = await _async_scan_copy(
            manager,
            local_other,
            backup_id,
            analyse=False,
            protected=local_other_protected,
            password=password,
        )
    scan = await _async_scan_copy(
        manager,
        agent_id,
        backup_id,
        analyse=reference is None or reference.source_error is not None,
        protected=status.protected,
        password=password,
    )
    result = _judge_full(agent_id, scan, status.size)
    if (
        result.status == COPY_VERIFIED_IN_FULL
        and reference is not None
        and not reference.source_error
        and local_other_protected == status.protected
        and reference.sha256 != scan.sha256
    ):
        result.status = COPY_CONTENT_DIFFERS
        result.reason = "digest_differs_from_other_copy"
    return result


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


def _issue_details(result: SelfCheckResult) -> str:
    """Describe which locations have a problem."""
    lines = [
        f"{copy.agent_id} ({_COPY_PROBLEM_TEXT[copy.status]})"
        for copy in result.copies
        if copy.status in _COPY_PROBLEMS
    ]
    if lines:
        return "Locations with a problem: " + ", ".join(lines) + "."
    return "The problem was found in the content of the archive that was read."


def update_issue(
    hass: HomeAssistant, backup_name: str, result: SelfCheckResult
) -> None:
    """Raise or clear the repairs issue for a failed self-check.

    Only a real mismatch or a missing copy raises the issue. A check that could
    not be done never does.
    """
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
            "details": _issue_details(result),
        },
    )


async def _async_wait_until_idle(manager: BackupManager) -> None:
    """Wait until no backup, upload or restore is running."""
    from .manager import BackupManagerState  # noqa: PLC0415

    if manager.state is BackupManagerState.IDLE:
        return
    idle = asyncio.Event()

    @callback
    def _on_event(_: Any) -> None:
        if manager.state is BackupManagerState.IDLE:
            idle.set()

    unsubscribe = manager.async_subscribe_events(_on_event)
    try:
        if manager.state is BackupManagerState.IDLE:
            return
        await idle.wait()
    finally:
        unsubscribe()


class SelfCheckRunner:
    """Run self-checks as their own cancellable tasks, one at a time."""

    def __init__(self, manager: BackupManager) -> None:
        """Initialize the runner."""
        self._manager = manager
        self._tasks: dict[str, asyncio.Task[None]] = {}
        self._lock = asyncio.Lock()
        self._store: Store[dict[str, Any]] | None = None
        self._settings: SelfCheckSettings | None = None

    @property
    def running(self) -> bool:
        """Return if a self-check is running."""
        return self._lock.locked()

    async def async_get_settings(self) -> SelfCheckSettings:
        """Return the settings of the self-check."""
        if self._settings is None:
            self._store = Store(
                self._manager.hass, SETTINGS_STORAGE_VERSION, SETTINGS_STORAGE_KEY
            )
            self._settings = SelfCheckSettings.from_dict(await self._store.async_load())
        return self._settings

    async def async_update_settings(
        self,
        *,
        remote_mode: str | None = None,
        max_full_download_bytes: int | UndefinedType | None = UNDEFINED,
    ) -> SelfCheckSettings:
        """Change and store the settings of the self-check."""
        settings = await self.async_get_settings()
        if remote_mode is not None:
            settings.remote_mode = remote_mode
        if max_full_download_bytes is not UNDEFINED:
            settings.max_full_download_bytes = max_full_download_bytes
        assert self._store is not None
        await self._store.async_save(settings.to_dict())
        return settings

    async def async_run_exclusive(self, coro_factory: Any) -> Any:
        """Run a self-check once no other one runs and nothing else is going on."""
        async with self._lock:
            await _async_wait_until_idle(self._manager)
            return await coro_factory()

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
            settings = await self.async_get_settings()
            result = await self.async_run_exclusive(
                lambda: async_self_check(manager, backup_id, settings=settings)
            )
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
