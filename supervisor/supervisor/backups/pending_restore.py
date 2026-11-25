"""Restore of a backup that waits for Home Assistant to be installed."""

from __future__ import annotations

from enum import StrEnum
import logging
import os
from pathlib import Path
from typing import Any

from ..const import CoreState
from ..coresys import CoreSys, CoreSysAttributes
from ..exceptions import BackupError, JsonFileError
from ..homeassistant.const import LANDINGPAGE
from ..utils.dt import utcnow
from ..utils.json import read_json_file, write_json_file
from .backup import Backup

_LOGGER: logging.Logger = logging.getLogger(__name__)

FILE_PENDING_RESTORE = "pending_restore.json"
FILE_PENDING_RESTORE_PASSWORD = "pending_restore.password"


class PendingRestoreState(StrEnum):
    """State of a pending restore."""

    QUEUED = "queued"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"


class PendingRestore(CoreSysAttributes):
    """Keep one full restore on disk and start it once Core is installed.

    The record lives in the Supervisor data folder so it survives a restart.
    The encryption password is kept in its own file (mode 600) and deleted as
    soon as the restore has used it.
    """

    def __init__(self, coresys: CoreSys) -> None:
        """Initialize."""
        self.coresys = coresys
        self._record: dict[str, Any] | None = None

    @property
    def _path(self) -> Path:
        return self.sys_config.path_supervisor / FILE_PENDING_RESTORE

    @property
    def _password_path(self) -> Path:
        return self.sys_config.path_supervisor / FILE_PENDING_RESTORE_PASSWORD

    @property
    def record(self) -> dict[str, Any] | None:
        """Return a copy of the record, without any password."""
        return dict(self._record) if self._record else None

    @property
    def active(self) -> bool:
        """Return True while the restore is queued or running."""
        return self._record is not None and self._record["state"] in (
            PendingRestoreState.QUEUED,
            PendingRestoreState.RUNNING,
        )

    async def load(self) -> None:
        """Read the record from disk."""
        if not await self.sys_run_in_executor(self._path.is_file):
            return
        try:
            record = await self.sys_run_in_executor(read_json_file, self._path)
        except JsonFileError:
            _LOGGER.warning("Ignoring unreadable pending restore record")
            return
        if not isinstance(record, dict) or "slug" not in record:
            return
        # A restore that was running when the Supervisor stopped did not finish
        if record.get("state") == PendingRestoreState.RUNNING:
            record["state"] = PendingRestoreState.QUEUED
            record["job_id"] = None
        self._record = record

    def _remove_record_file(self) -> None:
        self._path.unlink(missing_ok=True)

    async def _save(self) -> None:
        if self._record is None:
            await self.sys_run_in_executor(self._remove_record_file)
            return
        await self.sys_run_in_executor(write_json_file, self._path, self._record)

    def _write_password(self, password: str) -> None:
        fd = os.open(self._password_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(password)
        self._password_path.chmod(0o600)

    def _read_password(self) -> str | None:
        try:
            return self._password_path.read_text(encoding="utf-8")
        except OSError:
            return None

    def _delete_password(self) -> None:
        self._password_path.unlink(missing_ok=True)

    async def queue(
        self, slug: str, name: str, size_bytes: int, password: str | None
    ) -> dict[str, Any]:
        """Store a new record; the caller has already validated the backup."""
        if self.active:
            raise BackupError("A restore is already queued", _LOGGER.warning)
        self._record = {
            "slug": slug,
            "name": name,
            "size_bytes": size_bytes,
            "protected": password is not None,
            "state": PendingRestoreState.QUEUED,
            "queued_at": utcnow().isoformat(),
            "started_at": None,
            "finished_at": None,
            "job_id": None,
            "error": None,
        }
        if password is not None:
            await self.sys_run_in_executor(self._write_password, password)
        await self._save()
        return dict(self._record)

    async def clear(self) -> None:
        """Drop the record and any stored password."""
        if self._record and self._record["state"] == PendingRestoreState.RUNNING:
            raise BackupError("The restore has already started", _LOGGER.warning)
        self._record = None
        await self.sys_run_in_executor(self._delete_password)
        await self._save()

    def ready(self) -> bool:
        """Return True when the queued restore can start."""
        return (
            self._record is not None
            and self._record["state"] == PendingRestoreState.QUEUED
            and self.sys_core.state == CoreState.RUNNING
            and self.sys_homeassistant.version is not None
            and self.sys_homeassistant.version != LANDINGPAGE
        )

    def start(self) -> None:
        """Start the queued restore in the background when it is ready."""
        if not self.ready():
            return
        assert self._record is not None
        self._record["state"] = PendingRestoreState.RUNNING
        self.sys_create_background_task(self._run())

    async def _run(self) -> None:
        record = self._record
        assert record is not None
        record["started_at"] = utcnow().isoformat()
        await self._save()

        backup = self.sys_backups.get(record["slug"])
        password = await self.sys_run_in_executor(self._read_password)
        try:
            if backup is None:
                raise BackupError("The uploaded backup is gone", _LOGGER.error)
            success = await self._restore(record, backup, password)
            if not success:
                raise BackupError("The restore did not finish", _LOGGER.error)
        except BackupError as err:
            record["state"] = PendingRestoreState.FAILED
            record["error"] = str(err)
        except Exception as err:  # pylint: disable=broad-except
            _LOGGER.exception("Pending restore failed")
            record["state"] = PendingRestoreState.FAILED
            record["error"] = str(err) or type(err).__name__
        else:
            record["state"] = PendingRestoreState.DONE
        finally:
            record["finished_at"] = utcnow().isoformat()
            await self.sys_run_in_executor(self._delete_password)
            await self._save()

    async def _restore(
        self, record: dict[str, Any], backup: Backup, password: str | None
    ) -> bool:
        """Run the full restore as a job so its progress is in the jobs API."""
        # Imported here: the API helper imports the job machinery
        from ..api.utils import (  # pylint: disable=import-outside-toplevel
            background_task,
        )

        task, job_id = await background_task(
            self, self.sys_backups.do_restore_full, backup, password=password
        )
        record["job_id"] = job_id
        await self._save()
        return await task
