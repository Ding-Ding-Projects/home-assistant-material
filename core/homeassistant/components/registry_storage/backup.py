"""Backup location in a container registry.

Backups are locked at home by the store (even when the backup is already encrypted), so
the registry only ever holds sealed bytes. The details the Backups page needs live in
the sealed object header, which is part of the encrypted index, never in a tag.
"""

from collections.abc import AsyncIterator, Callable, Coroutine
from functools import wraps
import logging
from typing import Any, Concatenate, Final, override

from homeassistant.components.backup import (
    DOMAIN as BACKUP_DOMAIN,
    AgentBackup,
    BackupAgent,
    BackupAgentError,
    BackupNotFound,
    OnProgressCallback,
    suggested_filename,
)
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.json import json_dumps
from homeassistant.util.json import json_loads_object

from . import RegistryStorageConfigEntry
from .const import DATA_BACKUP_AGENT_LISTENERS, DOMAIN
from .errors import Reason, RegistryStorageError
from .store import RegistryStore, StoredObject

_LOGGER = logging.getLogger(__name__)

KIND_BACKUP: Final = "backup"
KIND_BACKUP_DETAILS: Final = "backup_details"
_INLINE_DETAILS_LIMIT: Final = 1300

_BUSY = {Reason.RATE_LIMITED, Reason.UNAVAILABLE, Reason.TIMEOUT}
_REFUSED = {Reason.AUTH_FAILED, Reason.DENIED}
_DAMAGED = {Reason.TAMPERED, Reason.TRUNCATED, Reason.WRONG_PASSWORD}


async def async_get_backup_agents(hass: HomeAssistant) -> list[BackupAgent]:
    """Return a backup agent for every loaded container registry place."""
    entries: list[RegistryStorageConfigEntry] = (
        hass.config_entries.async_loaded_entries(DOMAIN)
    )
    return [RegistryBackupAgent(hass, entry) for entry in entries]


@callback
def async_register_backup_agents_listener(
    hass: HomeAssistant,
    *,
    listener: Callable[[], None],
    **kwargs: Any,
) -> Callable[[], None]:
    """Register a listener to be called when agents are added or removed."""
    hass.data.setdefault(DATA_BACKUP_AGENT_LISTENERS, []).append(listener)

    @callback
    def remove_listener() -> None:
        hass.data[DATA_BACKUP_AGENT_LISTENERS].remove(listener)
        if not hass.data[DATA_BACKUP_AGENT_LISTENERS]:
            del hass.data[DATA_BACKUP_AGENT_LISTENERS]

    return remove_listener


def _translation_key(reason: Reason) -> str:
    if reason in _BUSY:
        return "backup_registry_busy"
    if reason in _REFUSED:
        return "backup_registry_refused"
    if reason in _DAMAGED:
        return "backup_damaged"
    return "backup_failed"


def _agent_error(err: RegistryStorageError) -> BackupAgentError:
    return BackupAgentError(
        translation_domain=DOMAIN,
        translation_key=_translation_key(err.reason),
        translation_placeholders={"reason": str(err.reason)},
    )


def handle_backup_errors[_R, **P](
    func: Callable[Concatenate[RegistryBackupAgent, P], Coroutine[Any, Any, _R]],
) -> Callable[Concatenate[RegistryBackupAgent, P], Coroutine[Any, Any, _R]]:
    """Turn registry and lock errors into backup errors that carry the reason code."""

    @wraps(func)
    async def wrapper(
        self: RegistryBackupAgent, *args: P.args, **kwargs: P.kwargs
    ) -> _R:
        try:
            return await func(self, *args, **kwargs)
        except RegistryStorageError as err:
            if err.reason == Reason.AUTH_FAILED:
                self._entry.async_start_reauth(self._hass)
            _LOGGER.debug("Registry error in %s: %s", func.__name__, err.reason)
            raise _agent_error(err) from err

    return wrapper


def _not_found(backup_id: str) -> BackupNotFound:
    return BackupNotFound(
        translation_domain=BACKUP_DOMAIN,
        translation_key="backup_not_found",
        translation_placeholders={"backup_id": backup_id},
    )


class RegistryBackupAgent(BackupAgent):
    """Backup agent that keeps locked backups in a container registry."""

    domain = DOMAIN

    def __init__(self, hass: HomeAssistant, entry: RegistryStorageConfigEntry) -> None:
        """Set up the agent for one place."""
        super().__init__()
        self._entry = entry
        self._hass = hass
        self.name = entry.title
        self.unique_id = entry.entry_id
        self._details: dict[str, AgentBackup] = {}

    @property
    def _store(self) -> RegistryStore:
        return self._entry.runtime_data.store

    async def _async_objects(self) -> dict[str, tuple[StoredObject, AgentBackup]]:
        """Return the stored backups by backup id, with their details."""
        store = self._store
        found: dict[str, tuple[StoredObject, AgentBackup]] = {}
        for item in await store.async_list(
            store.repository_for(kind=KIND_BACKUP), kind=KIND_BACKUP
        ):
            backup = await self._async_details(item)
            if backup is not None:
                found[backup.backup_id] = (item, backup)
        return found

    async def _async_details(self, item: StoredObject) -> AgentBackup | None:
        if (cached := self._details.get(item.id)) is not None:
            return cached
        try:
            if "b" in item.meta:
                data = item.meta["b"]
            else:
                stored = await self._store.async_get_object(item.meta["m"])
                raw = await self._store.async_get_range(stored.id, 0, stored.plain_size)
                data = json_loads_object(raw)
            backup = AgentBackup.from_dict(data)
        except KeyError, TypeError, ValueError:
            _LOGGER.warning("A stored backup has unreadable details and is skipped")
            return None
        self._details[item.id] = backup
        return backup

    async def _async_find(self, backup_id: str) -> tuple[StoredObject, AgentBackup]:
        if (found := (await self._async_objects()).get(backup_id)) is None:
            raise _not_found(backup_id)
        return found

    @handle_backup_errors
    @override
    async def async_download_backup(
        self, backup_id: str, **kwargs: Any
    ) -> AsyncIterator[bytes]:
        """Download a backup, unlocked part by part."""
        item, _ = await self._async_find(backup_id)
        return self._stream(item)

    async def _stream(self, item: StoredObject) -> AsyncIterator[bytes]:
        try:
            async for chunk in self._store.async_stream(item.id):
                yield chunk
        except RegistryStorageError as err:
            raise _agent_error(err) from err

    @handle_backup_errors
    @override
    async def async_upload_backup(
        self,
        *,
        open_stream: Callable[[], Coroutine[Any, Any, AsyncIterator[bytes]]],
        backup: AgentBackup,
        on_progress: OnProgressCallback,
        **kwargs: Any,
    ) -> None:
        """Lock a backup and upload it, then check that it came back."""
        store = self._store
        details = json_dumps(backup.as_dict())
        meta: dict[str, Any] = {"i": backup.backup_id}
        details_id: str | None = None
        if len(details) <= _INLINE_DETAILS_LIMIT:
            meta["b"] = json_loads_object(details)
        else:
            stored_details = await store.async_put_bytes(
                details.encode(),
                kind=KIND_BACKUP_DETAILS,
                name=f"{backup.backup_id}.json",
                repository=store.repository_for(kind=KIND_BACKUP),
                meta={"i": backup.backup_id},
            )
            details_id = meta["m"] = stored_details.id
        try:
            await store.async_put_stream(
                await open_stream(),
                backup.size,
                kind=KIND_BACKUP,
                name=suggested_filename(backup),
                meta=meta,
                progress=lambda done, _total: on_progress(bytes_uploaded=done),
            )
        except BaseException:
            if details_id is not None:
                await self._async_forget(details_id)
            raise
        _LOGGER.debug("Stored backup %s in the container registry", backup.backup_id)

    async def _async_forget(self, object_id: str) -> None:
        try:
            await self._store.async_delete(object_id)
        except RegistryStorageError:
            _LOGGER.debug("Could not remove a leftover details object")

    @handle_backup_errors
    @override
    async def async_delete_backup(self, backup_id: str, **kwargs: Any) -> None:
        """Delete a backup. The registry may keep the sealed bytes if it refuses deletes."""
        item, _ = await self._async_find(backup_id)
        await self._store.async_delete(item.id)
        if (details_id := item.meta.get("m")) is not None:
            await self._async_forget(details_id)
        self._details.pop(item.id, None)

    @handle_backup_errors
    @override
    async def async_list_backups(self, **kwargs: Any) -> list[AgentBackup]:
        """List the backups from the encrypted index."""
        return [backup for _, backup in (await self._async_objects()).values()]

    @handle_backup_errors
    @override
    async def async_get_backup(self, backup_id: str, **kwargs: Any) -> AgentBackup:
        """Return one backup's details."""
        return (await self._async_find(backup_id))[1]
