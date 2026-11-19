"""Delete proof marks for backups.

A delete proof backup cannot be deleted by anything the backup manager does
until the mark is turned off: deleting by hand, deleting several, automatic
retention by count or by age, or the cleanup of old backups after an update.

The marks are kept by backup ID in ``backups/delete_proof.json`` inside the
configuration folder. That folder is kept when Home Assistant restores a
backup, so a restore does not bring back old marks or lose new ones. When the
Supervisor manages the installation it holds the marks itself and is the
authority; the local file is then a copy used when the Supervisor cannot be
reached.
"""

from dataclasses import asdict, dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any, TypedDict

import orjson

from homeassistant.core import HomeAssistant
from homeassistant.helpers.json import save_json
from homeassistant.util import dt as dt_util

from .const import LOGGER
from .models import BackupManagerError

if TYPE_CHECKING:
    from .manager import BackupReaderWriter

DELETE_PROOF_FILE = "delete_proof.json"
DELETE_PROOF_VERSION = 1


class BackupDeleteProof(BackupManagerError):
    """Raised when a delete proof backup is asked to be deleted."""

    error_code = "backup_delete_proof"


class DeleteProofConfirmationRequired(BackupManagerError):
    """Raised when turning delete proof off is asked without confirmation."""

    error_code = "confirmation_required"


class DeleteProofRecordsUnreadable(BackupManagerError):
    """Raised when the marks cannot be read, so no backup can be deleted."""

    error_code = "delete_proof_records_unreadable"


class StoredDeleteProofMark(TypedDict):
    """A stored delete proof mark."""

    marked_at: str
    marked_by: str
    marked_by_name: str | None


@dataclass(frozen=True, kw_only=True, slots=True)
class DeleteProofMark:
    """A delete proof mark on one backup."""

    marked_at: str
    marked_by: str
    marked_by_name: str | None

    def to_dict(self) -> StoredDeleteProofMark:
        """Return the stored form."""
        return StoredDeleteProofMark(**asdict(self))  # type: ignore[typeddict-item]

    @classmethod
    def from_dict(cls, data: Any) -> DeleteProofMark | None:
        """Return a mark from stored data, or None if it is not one."""
        if (
            not isinstance(data, dict)
            or not isinstance(data.get("marked_at"), str)
            or not isinstance(data.get("marked_by"), str)
        ):
            return None
        name = data.get("marked_by_name")
        return cls(
            marked_at=data["marked_at"],
            marked_by=data["marked_by"],
            marked_by_name=name if isinstance(name, str) else None,
        )


def parse_delete_proof_marks(data: Any) -> dict[str, DeleteProofMark]:
    """Return the marks in stored or Supervisor data.

    Raises TypeError or ValueError when the data is not a mapping of backup IDs
    to marks.
    """
    if not isinstance(data, dict):
        raise TypeError("Delete proof data is not a mapping")
    marks: dict[str, DeleteProofMark] = {}
    for backup_id, value in data.items():
        if (mark := DeleteProofMark.from_dict(value)) is None:
            raise ValueError(f"Delete proof mark for {backup_id} is not valid")
        marks[str(backup_id)] = mark
    return marks


class DeleteProofMarks:
    """Hold the delete proof marks of all backups."""

    def __init__(self, hass: HomeAssistant) -> None:
        """Initialize."""
        self._hass = hass
        self._path = Path(hass.config.path("backups", DELETE_PROOF_FILE))
        self._marks: dict[str, DeleteProofMark] = {}
        self._reader_writer: BackupReaderWriter | None = None
        self.readable = True

    @property
    def path(self) -> Path:
        """Return the path of the local file."""
        return self._path

    def _read_file(self) -> dict[str, DeleteProofMark] | None:
        """Read the local file; None when it does not exist."""
        try:
            raw = self._path.read_bytes()
        except FileNotFoundError:
            return None
        data = orjson.loads(raw)
        if not isinstance(data, dict) or data.get("version") != DELETE_PROOF_VERSION:
            raise ValueError("Unknown delete proof file version")
        return parse_delete_proof_marks(data.get("marks"))

    def _write_file(self) -> None:
        """Write the local file atomically."""
        self._path.parent.mkdir(parents=True, exist_ok=True)
        save_json(
            str(self._path),
            {
                "version": DELETE_PROOF_VERSION,
                "marks": {
                    backup_id: mark.to_dict() for backup_id, mark in self._marks.items()
                },
            },
            atomic_writes=True,
        )

    async def async_load(self, reader_writer: BackupReaderWriter) -> None:
        """Load the marks, preferring the Supervisor when it holds them."""
        self._reader_writer = reader_writer
        local: dict[str, DeleteProofMark] | None = None
        local_failed = False
        try:
            local = await self._hass.async_add_executor_job(self._read_file)
        except (OSError, TypeError, ValueError) as err:
            LOGGER.error(
                "Cannot read the delete proof marks in %s: %s. No backup will be "
                "deleted until the file is readable again",
                self._path,
                err,
            )
            local_failed = True

        remote = await reader_writer.async_load_delete_proof()
        if remote is not None:
            self._marks = remote
            self.readable = True
            await self._hass.async_add_executor_job(self._write_file)
            return

        if local_failed:
            self.readable = False
            return
        self._marks = local or {}
        self.readable = True

    def is_marked(self, backup_id: str) -> bool:
        """Return True if deleting the backup must be refused.

        When the marks cannot be read every backup is treated as marked.
        """
        return not self.readable or backup_id in self._marks

    def get(self, backup_id: str) -> DeleteProofMark | None:
        """Return the mark of a backup."""
        return self._marks.get(backup_id)

    def all(self) -> dict[str, DeleteProofMark]:
        """Return all marks."""
        return dict(self._marks)

    def check_delete(self, backup_id: str) -> None:
        """Raise if deleting the backup must be refused."""
        if not self.readable:
            raise DeleteProofRecordsUnreadable(
                "The delete proof marks cannot be read, so no backup can be deleted"
            )
        if backup_id in self._marks:
            raise BackupDeleteProof(
                f"Backup {backup_id} is delete proof. Turn off delete proof first"
            )

    def _check_writable(self) -> None:
        """Refuse changes that would overwrite marks that cannot be read."""
        if not self.readable:
            raise DeleteProofRecordsUnreadable(
                "The delete proof marks cannot be read, so they cannot be changed"
            )

    async def async_set(
        self, backup_id: str, *, marked_by: str, marked_by_name: str | None
    ) -> DeleteProofMark:
        """Mark a backup delete proof; an existing mark is kept unchanged."""
        self._check_writable()
        if (existing := self._marks.get(backup_id)) is not None:
            return existing
        mark = DeleteProofMark(
            marked_at=dt_util.utcnow().isoformat(),
            marked_by=marked_by,
            marked_by_name=marked_by_name,
        )
        if self._reader_writer is not None:
            await self._reader_writer.async_save_delete_proof(
                backup_id, mark, confirmed=False
            )
        self._marks[backup_id] = mark
        await self._hass.async_add_executor_job(self._write_file)
        return mark

    async def async_clear(self, backup_id: str, *, confirmed: bool) -> None:
        """Turn delete proof off for a backup; this needs confirmation."""
        self._check_writable()
        if backup_id not in self._marks:
            return
        if not confirmed:
            raise DeleteProofConfirmationRequired(
                "Turning off delete proof needs confirmation"
            )
        if self._reader_writer is not None:
            await self._reader_writer.async_save_delete_proof(
                backup_id, None, confirmed=True
            )
        del self._marks[backup_id]
        await self._hass.async_add_executor_job(self._write_file)
