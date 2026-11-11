"""Home Assistant module to handle restoring backups."""

from collections.abc import Iterable
from dataclasses import dataclass
import json
import logging
import os
from pathlib import Path
import re
import shutil
import sys
import tarfile
from tempfile import TemporaryDirectory
from typing import IO, TYPE_CHECKING

import securetar

from .const import __base_version__ as HA_BASE_VERSION

_RELEASE_RE = re.compile(r"^\s*v?(\d+)\.(\d+)(?:\.|$|[a-z])")


def _year_month(version: str) -> tuple[int, int] | None:
    """Return (year, month) of a release string, or None when unparseable."""
    if (match := _RELEASE_RE.match(version)) is None:
        return None
    return int(match.group(1)), int(match.group(2))


def backup_is_newer_than_core(backup_version: str) -> bool:
    """Return True if a backup was made by a core release this build cannot restore.

    Rule: compare only year and month with the core release this build is based on.
    The build number (fourth part) and beta or dev suffixes are ignored, so a backup
    from any patch release of the same year.month is accepted, including one newer
    than the base patch; a backup from a later year.month is refused. Patch releases
    do not change the storage formats a restore depends on. This is an assumption
    about upstream release practice, not something checked per release.
    A version that cannot be parsed is not refused.
    """
    backup_release = _year_month(backup_version)
    core_release = _year_month(HA_BASE_VERSION)
    if backup_release is None or core_release is None:
        return False
    return backup_release > core_release


RESTORE_BACKUP_FILE = ".HA_RESTORE"
RESTORE_BACKUP_RESULT_FILE = ".HA_RESTORE_RESULT"
KEEP_BACKUPS = ("backups",)
KEEP_DATABASE = (
    "home-assistant_v2.db",
    "home-assistant_v2.db-wal",
)


_LOGGER = logging.getLogger(__name__)


@dataclass
class RestoreBackupFileContent:
    """Definition for restore backup file content."""

    backup_file_path: Path
    password: str | None
    remove_after_restore: bool
    restore_database: bool
    restore_homeassistant: bool


def restore_backup_file_content(config_dir: Path) -> RestoreBackupFileContent | None:
    """Return the contents of the restore backup file."""
    instruction_path = config_dir.joinpath(RESTORE_BACKUP_FILE)
    try:
        instruction_content = json.loads(instruction_path.read_text(encoding="utf-8"))
        return RestoreBackupFileContent(
            backup_file_path=Path(instruction_content["path"]),
            password=instruction_content["password"],
            remove_after_restore=instruction_content["remove_after_restore"],
            restore_database=instruction_content["restore_database"],
            restore_homeassistant=instruction_content["restore_homeassistant"],
        )
    except FileNotFoundError:
        return None
    except (KeyError, json.JSONDecodeError) as err:
        _write_restore_result_file(config_dir, False, err)
        return None
    finally:
        # Always remove the backup instruction file to prevent a boot loop
        instruction_path.unlink(missing_ok=True)


def _clear_configuration_directory(config_dir: Path, keep: Iterable[str]) -> None:
    """Delete all files and directories in the config dir.

    Entries in the keep list are preserved.
    """
    keep_paths = [config_dir.joinpath(path) for path in keep]
    entries_to_remove = sorted(
        entry for entry in config_dir.iterdir() if entry not in keep_paths
    )

    for entry in entries_to_remove:
        entrypath = config_dir.joinpath(entry)

        if entrypath.is_file():
            entrypath.unlink()
        elif entrypath.is_dir():
            shutil.rmtree(entrypath)


def _extract_member(
    tar: tarfile.TarFile, members: dict[str, tarfile.TarInfo], name: str
) -> IO[bytes]:
    """Return a stream reading a member of the outer backup tar."""
    if (member := members.get(name)) is None or not member.isfile():
        raise ValueError(f"Backup does not contain {name}")
    fileobj = tar.extractfile(member)
    if TYPE_CHECKING:
        assert fileobj is not None
    return fileobj


def _extract_backup(
    config_dir: Path,
    restore_content: RestoreBackupFileContent,
) -> None:
    """Extract the backup file to the config directory."""
    with (
        TemporaryDirectory() as tempdir,
        securetar.SecureTarArchive(
            restore_content.backup_file_path,
            mode="r",
        ) as ostf,
    ):
        # Member names may or may not have a leading "./"
        members = {
            os.path.normpath(member.name): member for member in ostf.tar.getmembers()
        }
        backup_meta = json.load(_extract_member(ostf.tar, members, "backup.json"))

        backup_meta_version = str(backup_meta["homeassistant"]["version"])
        if backup_is_newer_than_core(backup_meta_version):
            raise ValueError(
                f"You need at least Home Assistant version"
                f" {backup_meta_version} to restore this backup"
            )

        with securetar.SecureTarFile(
            fileobj=_extract_member(
                ostf.tar,
                members,
                f"homeassistant.tar{'.gz' if backup_meta['compressed'] else ''}",
            ),
            gzip=backup_meta["compressed"],
            password=restore_content.password,
        ) as istf:
            istf.extractall(
                path=Path(tempdir, "homeassistant"),
                filter="tar",
            )
            if restore_content.restore_homeassistant:
                keep = list(KEEP_BACKUPS)
                if not restore_content.restore_database:
                    keep.extend(KEEP_DATABASE)
                _clear_configuration_directory(config_dir, keep)
                shutil.copytree(
                    Path(tempdir, "homeassistant", "data"),
                    config_dir,
                    dirs_exist_ok=True,
                    ignore=shutil.ignore_patterns(*(keep)),
                    ignore_dangling_symlinks=True,
                )
            elif restore_content.restore_database:
                for entry in KEEP_DATABASE:
                    entrypath = config_dir / entry

                    if entrypath.is_file():
                        entrypath.unlink()
                    elif entrypath.is_dir():
                        shutil.rmtree(entrypath)

                for entry in KEEP_DATABASE:
                    shutil.copy(
                        Path(tempdir, "homeassistant", "data", entry),
                        config_dir,
                    )


def _write_restore_result_file(
    config_dir: Path, success: bool, error: Exception | None
) -> None:
    """Write the restore result file."""
    result_path = config_dir.joinpath(RESTORE_BACKUP_RESULT_FILE)
    result_path.write_text(
        json.dumps(
            {
                "success": success,
                "error": str(error) if error else None,
                "error_type": str(type(error).__name__) if error else None,
            }
        ),
        encoding="utf-8",
    )


def restore_backup(config_dir_path: str) -> bool:
    """Restore the backup file if any.

    Returns True if a restore backup file was found and restored, False otherwise.
    """
    config_dir = Path(config_dir_path)
    if not (restore_content := restore_backup_file_content(config_dir)):
        return False

    logging.basicConfig(stream=sys.stdout, level=logging.INFO)
    backup_file_path = restore_content.backup_file_path
    _LOGGER.info("Restoring %s", backup_file_path)
    try:
        _extract_backup(
            config_dir=config_dir,
            restore_content=restore_content,
        )
    except FileNotFoundError as err:
        file_not_found = ValueError(f"Backup file {backup_file_path} does not exist")
        _write_restore_result_file(config_dir, False, file_not_found)
        raise file_not_found from err
    except Exception as err:
        _write_restore_result_file(config_dir, False, err)
        raise
    else:
        _write_restore_result_file(config_dir, True, None)
    if restore_content.remove_after_restore:
        backup_file_path.unlink(missing_ok=True)
    _LOGGER.info("Restore complete, restarting")
    return True
