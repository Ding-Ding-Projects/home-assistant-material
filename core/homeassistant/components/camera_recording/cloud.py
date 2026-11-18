"""Cloud drives that camera recordings can be sent to, through their own integrations.

The sign-in stays inside the drive integration. These classes only call the client
objects that integration keeps in its loaded config entry, the same way its backup
agent does, and never read, copy or store a token.
"""

from abc import ABC, abstractmethod
import asyncio
from collections.abc import AsyncIterator, Awaitable, Callable, Sequence
from dataclasses import dataclass
from pathlib import Path
import time
from typing import Any, override

from aiohttp import ClientError, ClientTimeout

from homeassistant.config_entries import ConfigEntry, ConfigEntryState
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryAuthFailed, ConfigEntryNotReady
from homeassistant.helpers.aiohttp_client import async_get_clientsession

DRIVE_ONEDRIVE = "onedrive"
DRIVE_GOOGLE = "google_drive"
DRIVES: tuple[str, ...] = (DRIVE_ONEDRIVE, DRIVE_GOOGLE)

CHUNK_SIZE = 1024 * 1024
UPLOAD_TIMEOUT = ClientTimeout(connect=30, total=6 * 3600)
GOOGLE_FOLDER_TYPE = "application/vnd.google-apps.folder"
GOOGLE_UPLOAD_RETRIES = 5
ONEDRIVE_CHUNK_UNIT = 320 * 1024

# Reason codes a failure is reported with. None of them carries text from the drive.
REASON_NOT_SET_UP = "not_set_up"
REASON_NOT_LOADED = "not_loaded"
REASON_NOT_SUPPORTED = "not_supported"
REASON_SIGN_IN = "sign_in"
REASON_REFUSED = "refused"
REASON_TIMED_OUT = "timed_out"
REASON_CHECK_FAILED = "check_failed"
REASON_DRIVE_ERROR = "drive_error"
REASON_FILE_GONE = "file_gone"
REASON_GAVE_UP = "gave_up"


class DriveError(Exception):
    """A drive could not be used. Only the reason code is ever shown or logged."""

    def __init__(self, reason: str) -> None:
        """Keep the reason code."""
        super().__init__(reason)
        self.reason = reason


@dataclass(slots=True, frozen=True)
class RemoteFile:
    """A file or folder on a drive."""

    id: str
    name: str
    size: int | None = None


type OpenStream = Callable[[], AsyncIterator[bytes]]


class Pacer:
    """Keeps an upload under a byte rate, so it never starves the rest of the instance."""

    def __init__(self, bytes_per_second: float) -> None:
        """Set the rate. Zero or less means no limit."""
        self.rate = bytes_per_second
        self._start = time.monotonic()
        self._sent = 0

    async def wait(self, size: int) -> None:
        """Wait until `size` more bytes fit under the rate."""
        self._sent += size
        if self.rate <= 0:
            return
        ahead = self._sent / self.rate - (time.monotonic() - self._start)
        if ahead > 0:
            await asyncio.sleep(ahead)


def file_reader(hass: HomeAssistant, path: Path, bytes_per_second: float) -> OpenStream:
    """A factory of paced chunk iterators over a finished file, read in the executor."""

    async def _chunks() -> AsyncIterator[bytes]:
        pacer = Pacer(bytes_per_second)
        handle = await hass.async_add_executor_job(path.open, "rb")
        try:
            while chunk := await hass.async_add_executor_job(handle.read, CHUNK_SIZE):
                await pacer.wait(len(chunk))
                yield chunk
        finally:
            await hass.async_add_executor_job(handle.close)

    return _chunks


class CloudDrive(ABC):
    """A cloud drive reached through its own Home Assistant integration."""

    domain: str

    def __init__(self, hass: HomeAssistant) -> None:
        """Keep the instance."""
        self.hass = hass
        self._folders: dict[tuple[str, tuple[str, ...]], str] = {}

    @property
    def set_up(self) -> bool:
        """Whether the drive integration has a config entry at all."""
        return bool(self.hass.config_entries.async_entries(self.domain))

    def entry(self) -> ConfigEntry | None:
        """The first loaded config entry of the drive integration."""
        for entry in self.hass.config_entries.async_entries(self.domain):
            if entry.state is ConfigEntryState.LOADED:
                return entry
        return None

    @property
    def loaded(self) -> bool:
        """Whether the drive integration is set up and running."""
        return self.entry() is not None

    @property
    def account_title(self) -> str | None:
        """The title of the drive's config entry, chosen by the drive integration."""
        if (entry := self.entry()) is None:
            return None
        return entry.title

    def _loaded_entry(self) -> ConfigEntry:
        if (entry := self.entry()) is not None:
            return entry
        raise DriveError(REASON_NOT_LOADED if self.set_up else REASON_NOT_SET_UP)

    async def folder_id(self, folder: Sequence[str]) -> str:
        """The id of a folder path below the drive's own folder, creating each part."""
        entry = self._loaded_entry()
        parts = tuple(folder)
        key = (entry.entry_id, parts)
        if key in self._folders:
            return self._folders[key]
        parent = await self._call(self._root_id, entry)
        done: tuple[str, ...] = ()
        for part in parts:
            done = (*done, part)
            cached = self._folders.get((entry.entry_id, done))
            if cached is None:
                cached = await self._call(self._child_folder, entry, parent, part)
                self._folders[(entry.entry_id, done)] = cached
            parent = cached
        return parent

    async def upload(
        self, open_stream: OpenStream, size: int, folder: Sequence[str], name: str
    ) -> RemoteFile:
        """Send a finished file to the folder path. Returns the file on the drive."""
        folder_id = await self.folder_id(folder)
        entry = self._loaded_entry()
        try:
            return await self._call(
                self._upload, entry, open_stream, size, folder_id, name
            )
        except DriveError:
            # A folder removed on the drive would otherwise fail every upload.
            self._folders.clear()
            raise

    async def list(self, folder: Sequence[str]) -> list[RemoteFile]:
        """The files and folders directly in a folder path."""
        folder_id = await self.folder_id(folder)
        return await self._call(self._list, self._loaded_entry(), folder_id)

    async def delete(self, file_id: str) -> None:
        """Delete a file. One that is already gone is not an error."""
        await self._call(self._delete, self._loaded_entry(), file_id)

    async def delete_older_than(
        self, sent: Sequence[tuple[str, float]], days: int, now: float
    ) -> tuple[list[str], str | None]:
        """Delete the sent files, given as (id, recorded time), older than `days`.

        Returns the ids that are gone, and the reason code of the failure that
        stopped it early, if any.
        """
        cutoff = now - days * 86400
        gone: list[str] = []
        for file_id, recorded in sent:
            if recorded >= cutoff:
                continue
            try:
                await self.delete(file_id)
            except DriveError as err:
                return gone, err.reason
            gone.append(file_id)
        return gone, None

    def free_space(self) -> int | None:
        """Free bytes on the drive, when the drive integration already knows them."""
        if (entry := self.entry()) is None:
            return None
        try:
            return self._free_space(entry)
        except AttributeError, TypeError, ValueError:
            return None

    async def _call[T](self, func: Callable[..., Awaitable[T]], *args: Any) -> T:
        try:
            return await func(*args)
        except DriveError:
            raise
        except ConfigEntryAuthFailed as err:
            raise DriveError(REASON_SIGN_IN) from err
        except ConfigEntryNotReady as err:
            raise DriveError(REASON_NOT_LOADED) from err
        except TimeoutError as err:
            raise DriveError(REASON_TIMED_OUT) from err
        except Exception as err:
            raise DriveError(self._reason(err)) from err

    @abstractmethod
    def _reason(self, err: Exception) -> str:
        """The reason code for an error raised by the drive's client."""

    @abstractmethod
    async def _root_id(self, entry: ConfigEntry) -> str:
        """The folder recordings go under, inside what the sign-in may write."""

    @abstractmethod
    async def _child_folder(self, entry: ConfigEntry, parent: str, name: str) -> str:
        """Find or create a folder inside another."""

    @abstractmethod
    async def _upload(
        self,
        entry: ConfigEntry,
        open_stream: OpenStream,
        size: int,
        folder_id: str,
        name: str,
    ) -> RemoteFile:
        """Upload a file into a folder, replacing one of the same name."""

    @abstractmethod
    async def _list(self, entry: ConfigEntry, folder_id: str) -> list[RemoteFile]:
        """List a folder."""

    @abstractmethod
    async def _delete(self, entry: ConfigEntry, file_id: str) -> None:
        """Delete a file."""

    @abstractmethod
    def _free_space(self, entry: ConfigEntry) -> int | None:
        """Free bytes, from the drive integration's own last update."""


class OneDriveDrive(CloudDrive):
    """OneDrive, through the OneDrive integration.

    That integration signs in with Files.ReadWrite.AppFolder, which allows ordinary
    files anywhere inside the app folder, so recordings go to a folder there.
    """

    domain = DRIVE_ONEDRIVE

    @override
    def _reason(self, err: Exception) -> str:
        from onedrive_personal_sdk.exceptions import (  # noqa: PLC0415
            AuthenticationError,
            HashMismatchError,
            OneDriveException,
        )

        if isinstance(err, AuthenticationError):
            return REASON_SIGN_IN
        if isinstance(err, HashMismatchError):
            return REASON_CHECK_FAILED
        if isinstance(err, (OneDriveException, ClientError)):
            return REASON_DRIVE_ERROR
        raise err

    @override
    async def _root_id(self, entry: ConfigEntry) -> str:
        approot = await entry.runtime_data.client.get_approot()
        return str(approot.id)

    @override
    async def _child_folder(self, entry: ConfigEntry, parent: str, name: str) -> str:
        folder = await entry.runtime_data.client.create_folder(
            parent_id=parent, name=name
        )
        return str(folder.id)

    @override
    async def _upload(
        self,
        entry: ConfigEntry,
        open_stream: OpenStream,
        size: int,
        folder_id: str,
        name: str,
    ) -> RemoteFile:
        from onedrive_personal_sdk.clients.large_file_upload import (  # noqa: PLC0415
            LargeFileUploadClient,
        )
        from onedrive_personal_sdk.const import ConflictBehavior  # noqa: PLC0415
        from onedrive_personal_sdk.models.upload import FileInfo  # noqa: PLC0415

        # The client resends a failed chunk from where the drive says it stopped.
        chunk = max(
            ONEDRIVE_CHUNK_UNIT,
            (size // 20) // ONEDRIVE_CHUNK_UNIT * ONEDRIVE_CHUNK_UNIT,
        )
        chunk = min(
            chunk, 60 * 1024 * 1024 // ONEDRIVE_CHUNK_UNIT * ONEDRIVE_CHUNK_UNIT
        )
        file = await LargeFileUploadClient.upload(
            entry.runtime_data.token_function,
            FileInfo(name, size, folder_id, open_stream()),
            upload_chunk_size=chunk,
            session=async_get_clientsession(self.hass),
            conflict_behavior=ConflictBehavior.REPLACE,
        )
        return RemoteFile(str(file.id), str(file.name), size)

    @override
    async def _list(self, entry: ConfigEntry, folder_id: str) -> list[RemoteFile]:
        items = await entry.runtime_data.client.list_drive_items(folder_id)
        return [RemoteFile(str(item.id), str(item.name), item.size) for item in items]

    @override
    async def _delete(self, entry: ConfigEntry, file_id: str) -> None:
        from onedrive_personal_sdk.exceptions import NotFoundError  # noqa: PLC0415

        try:
            await entry.runtime_data.client.delete_drive_item(file_id)
        except NotFoundError:
            return

    @override
    def _free_space(self, entry: ConfigEntry) -> int | None:
        drive = entry.runtime_data.coordinator.data
        if drive is None or drive.quota is None:
            return None
        return int(drive.quota.remaining)


class GoogleDriveDrive(CloudDrive):
    """Google Drive, through the Google Drive integration.

    That integration signs in with drive.file, which allows ordinary files the
    integration itself creates, so recordings go to folders it creates inside its
    own Home Assistant folder.
    """

    domain = DRIVE_GOOGLE

    def _api(self, entry: ConfigEntry) -> Any:
        # The integration's DriveClient keeps its API object private; the methods
        # used here are the same ones its backup code calls.
        api = getattr(entry.runtime_data.client, "_api", None)
        if api is None:
            raise DriveError(REASON_NOT_SUPPORTED)
        return api

    @override
    def _reason(self, err: Exception) -> str:
        from google_drive_api.exceptions import (  # noqa: PLC0415
            ApiForbiddenException,
            AuthException,
            GoogleDriveApiError,
        )

        if isinstance(err, AuthException):
            return REASON_SIGN_IN
        if isinstance(err, ApiForbiddenException):
            return REASON_REFUSED
        if isinstance(err, (GoogleDriveApiError, ClientError, KeyError)):
            return REASON_DRIVE_ERROR
        raise err

    @override
    async def _root_id(self, entry: ConfigEntry) -> str:
        return str(entry.runtime_data.backup_folder_id)

    @override
    async def _child_folder(self, entry: ConfigEntry, parent: str, name: str) -> str:
        api = self._api(entry)
        query = " and ".join(
            [
                f"name = '{_quote(name)}'",
                f"'{_quote(parent)}' in parents",
                f"mimeType = '{GOOGLE_FOLDER_TYPE}'",
                "trashed = false",
            ]
        )
        found = await api.list_files(params={"q": query, "fields": "files(id)"})
        for file in found.get("files", []):
            return str(file["id"])
        created = await api.create_file(
            params={"fields": "id"},
            json={"name": name, "mimeType": GOOGLE_FOLDER_TYPE, "parents": [parent]},
        )
        return str(created["id"])

    @override
    async def _upload(
        self,
        entry: ConfigEntry,
        open_stream: OpenStream,
        size: int,
        folder_id: str,
        name: str,
    ) -> RemoteFile:
        api = self._api(entry)

        async def _open() -> AsyncIterator[bytes]:
            return open_stream()

        # Retries inside one call continue the same upload session from where it stopped.
        response = await api.resumable_upload_file(
            {"name": name, "parents": [folder_id]},
            _open,
            size,
            max_retries=GOOGLE_UPLOAD_RETRIES,
            params={"fields": "id"},
            timeout=UPLOAD_TIMEOUT,
        )
        created = await response.json()
        return RemoteFile(str(created["id"]), name, size)

    @override
    async def _list(self, entry: ConfigEntry, folder_id: str) -> list[RemoteFile]:
        api = self._api(entry)
        query = f"'{_quote(folder_id)}' in parents and trashed = false"
        files: list[RemoteFile] = []
        async for file in api.list_all_files(
            params={"q": query, "fields": "nextPageToken,files(id,name,size)"}
        ):
            size = file.get("size")
            files.append(
                RemoteFile(
                    str(file["id"]),
                    str(file.get("name", "")),
                    int(size) if size is not None else None,
                )
            )
        return files

    @override
    async def _delete(self, entry: ConfigEntry, file_id: str) -> None:
        await self._api(entry).delete_file(file_id)

    @override
    def _free_space(self, entry: ConfigEntry) -> int | None:
        data = entry.runtime_data.data
        if data is None or data.storage_quota.limit is None:
            return None
        return max(0, int(data.storage_quota.limit) - int(data.storage_quota.usage))


def _quote(value: str) -> str:
    return value.replace("\\", "\\\\").replace("'", "\\'")


def create_drives(hass: HomeAssistant) -> dict[str, CloudDrive]:
    """One object per supported drive."""
    return {
        DRIVE_ONEDRIVE: OneDriveDrive(hass),
        DRIVE_GOOGLE: GoogleDriveDrive(hass),
    }
