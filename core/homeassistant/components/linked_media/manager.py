"""Keep the list of linked files and the short lived copies made while they are used."""

import asyncio
from collections.abc import Callable
from contextlib import suppress
from dataclasses import asdict, dataclass, field, fields
import logging
import mimetypes
from pathlib import Path
import re
import shutil
import time
from typing import Any

from homeassistant.core import CALLBACK_TYPE, HomeAssistant, callback
from homeassistant.helpers.event import async_call_later
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util
from homeassistant.util.ulid import ulid

from .address import address_has_secret, masked_address, parse_address
from .const import (
    CHECK_TIMEOUT,
    DEFAULT_MAX_SIZE_MB,
    EVENT_FAILED,
    EVENT_USED,
    FETCH_EACH_TIME,
    FETCH_KEEP,
    KEEP_SECONDS,
    READER_GRACE_SECONDS,
    STORAGE_KEY,
    STORAGE_VERSION,
    TOTAL_TIMEOUT,
    FailureReason,
)
from .fetch import FetchError, OpenedFile, async_open

_LOGGER = logging.getLogger(__name__)

USED_BY_ACTION = "action"
USED_BY_PLAYER = "player"
# A play request names its player a moment before the player fetches the file.
TARGET_MEMORY_SECONDS = 120
_SAFE_NAME = re.compile(r"[^A-Za-z0-9._-]+")


@dataclass(slots=True)
class LinkedFile:
    """One file that lives at a web address."""

    file_id: str
    name: str
    address: str
    content_type: str
    kind: str
    fetch: str = FETCH_EACH_TIME
    max_size_mb: int = DEFAULT_MAX_SIZE_MB
    home_network: bool = False
    live: bool = False
    created_at: str = ""
    last_used_at: str | None = None
    last_used_by: str | None = None
    last_failure_at: str | None = None
    last_failure_reason: str | None = None
    last_failure_status: int | None = None
    last_checked_at: str | None = None
    reachable: bool | None = None

    @property
    def max_bytes(self) -> int:
        """Return the size limit in bytes."""
        return self.max_size_mb * 1024 * 1024

    @property
    def host(self) -> str:
        """Return the host of the address."""
        url = parse_address(self.address)
        return url.host or "" if url else ""

    @property
    def extension(self) -> str:
        """Return a file name extension for the content type."""
        return mimetypes.guess_extension(self.content_type) or ""

    @classmethod
    def from_storage(cls, data: dict[str, Any]) -> LinkedFile:
        """Build a file from stored data, ignoring unknown keys."""
        names = {item.name for item in fields(cls)}
        return cls(**{key: value for key, value in data.items() if key in names})


def _refuse_live(linked: LinkedFile, opened: OpenedFile) -> None:
    """Refuse to store an endless stream on disk."""
    if opened.live:
        linked.live = True
        raise FetchError(FailureReason.LIVE_STREAM)


@dataclass(slots=True)
class Copy:
    """A temporary copy of a linked file on this system."""

    path: Path
    task: asyncio.Task[None] | None = None
    size: int = 0
    readers: int = 0
    fetched_at: str | None = None
    remove_later: CALLBACK_TYPE | None = None
    kept: bool = False


@dataclass(slots=True)
class Handout:
    """A file handed to an action as a local path."""

    file_id: str
    folder: Path
    path: Path
    size: int = 0
    remove_later: CALLBACK_TYPE | None = field(default=None)


class LinkedMediaManager:
    """Own the list of linked files and every copy made of them."""

    def __init__(
        self,
        hass: HomeAssistant,
        temp_root: Path,
        handout_root: Path,
        own_addresses: frozenset[str],
    ) -> None:
        """Set up the manager."""
        self.hass = hass
        self.temp_root = temp_root
        self.handout_root = handout_root
        self.own_addresses = own_addresses
        self.files: dict[str, LinkedFile] = {}
        self._store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self._copies: dict[str, Copy] = {}
        self._streams: dict[str, int] = {}
        self._stream_started: dict[str, str] = {}
        self._targets: dict[str, tuple[str, float]] = {}
        self._handouts: dict[str, Handout] = {}
        self._listeners: list[Callable[[], None]] = []

    async def async_load(self) -> None:
        """Load the list and remove any copy left from an earlier run."""
        if data := await self._store.async_load():
            for item in data.get("files", []):
                linked = LinkedFile.from_storage(item)
                self.files[linked.file_id] = linked
        await self.hass.async_add_executor_job(self._reset_folder)

    async def async_shutdown(self) -> None:
        """Stop every timer and remove every copy."""
        for copy in self._copies.values():
            if copy.remove_later:
                copy.remove_later()
            if copy.task and not copy.task.done():
                copy.task.cancel()
        for handout in self._handouts.values():
            if handout.remove_later:
                handout.remove_later()
        self._copies.clear()
        self._handouts.clear()
        await self._store.async_save(self._data())
        await self.hass.async_add_executor_job(shutil.rmtree, self.temp_root, True)
        await self.hass.async_add_executor_job(shutil.rmtree, self.handout_root, True)

    def _reset_folder(self) -> None:
        shutil.rmtree(self.temp_root, ignore_errors=True)
        (self.temp_root / "copies").mkdir(parents=True, exist_ok=True)
        shutil.rmtree(self.handout_root, ignore_errors=True)
        self.handout_root.mkdir(parents=True, exist_ok=True)

    def _data(self) -> dict[str, Any]:
        return {"files": [asdict(item) for item in self.files.values()]}

    @callback
    def _save(self) -> None:
        self._store.async_delay_save(self._data, 1)
        for listener in self._listeners:
            listener()

    @callback
    def async_add_listener(self, listener: Callable[[], None]) -> CALLBACK_TYPE:
        """Call a listener when a file or its status changes."""
        self._listeners.append(listener)
        return lambda: self._listeners.remove(listener)

    def get(self, file_id: str) -> LinkedFile | None:
        """Return one linked file."""
        return self.files.get(file_id)

    async def async_add(
        self,
        name: str,
        address: str,
        content_type: str,
        kind: str,
        *,
        fetch: str,
        max_size_mb: int,
        home_network: bool,
        live: bool = False,
    ) -> LinkedFile:
        """Add a file the owner checked."""
        now = dt_util.utcnow().isoformat()
        linked = LinkedFile(
            file_id=ulid(),
            name=name,
            address=address,
            content_type=content_type,
            kind=kind,
            fetch=fetch,
            max_size_mb=max_size_mb,
            home_network=home_network,
            live=live,
            created_at=now,
            last_checked_at=now,
            reachable=True,
        )
        self.files[linked.file_id] = linked
        self._save()
        return linked

    async def async_update(self, linked: LinkedFile, changes: dict[str, Any]) -> None:
        """Change a file's settings."""
        for key, value in changes.items():
            setattr(linked, key, value)
        if changes.get("fetch") == FETCH_EACH_TIME or "address" in changes:
            await self._async_drop_copy(linked.file_id)
        self._save()

    async def async_remove(self, file_id: str) -> None:
        """Remove a file and every copy of it."""
        self.files.pop(file_id, None)
        await self._async_drop_copy(file_id, force=True)
        for token, handout in list(self._handouts.items()):
            if handout.file_id == file_id:
                await self._async_drop_handout(token)
        self._targets.pop(file_id, None)
        self._save()

    @callback
    def async_note_target(self, file_id: str, entity_id: str | None) -> None:
        """Remember which player asked for a file."""
        if entity_id:
            self._targets[file_id] = (entity_id, time.monotonic())

    def _used_by(self, file_id: str) -> str:
        target = self._targets.get(file_id)
        if target and time.monotonic() - target[1] < TARGET_MEMORY_SECONDS:
            return target[0]
        return USED_BY_PLAYER

    @callback
    def _record_used(self, linked: LinkedFile, by: str) -> None:
        linked.last_used_at = dt_util.utcnow().isoformat()
        linked.last_used_by = by
        linked.reachable = True
        self.hass.bus.async_fire(
            EVENT_USED, {"file_id": linked.file_id, "name": linked.name, "by": by}
        )
        self._save()

    @callback
    def record_failure(self, linked: LinkedFile, err: FetchError) -> None:
        """Remember why a fetch failed and tell automations."""
        linked.last_failure_at = dt_util.utcnow().isoformat()
        linked.last_failure_reason = err.reason.value
        linked.last_failure_status = err.status
        linked.reachable = False
        _LOGGER.debug(
            "Linked file %s from %s could not be fetched: %s",
            linked.file_id,
            linked.host,
            err.reason,
        )
        self.hass.bus.async_fire(
            EVENT_FAILED,
            {
                "file_id": linked.file_id,
                "name": linked.name,
                "reason": err.reason.value,
                "status": err.status,
            },
        )
        self._save()

    async def async_open(
        self, linked: LinkedFile, total_timeout: float | None
    ) -> OpenedFile:
        """Open the web address of a file, recording a failure."""
        try:
            return await async_open(
                linked.address,
                home_network=linked.home_network,
                own_addresses=self.own_addresses,
                max_bytes=linked.max_bytes,
                total_timeout=total_timeout,
            )
        except FetchError as err:
            self.record_failure(linked, err)
            raise

    async def async_check_address(
        self, address: str, *, home_network: bool, max_size_mb: int
    ) -> dict[str, Any]:
        """Fetch only the answer's headers and say what the address holds."""
        try:
            opened = await async_open(
                address,
                home_network=home_network,
                own_addresses=self.own_addresses,
                max_bytes=max_size_mb * 1024 * 1024,
                total_timeout=CHECK_TIMEOUT,
            )
        except FetchError as err:
            return {
                "reachable": False,
                "reason": err.reason.value,
                "status": err.status,
            }
        await opened.close()
        return {
            "reachable": True,
            "kind": opened.kind,
            "content_type": opened.content_type,
            "size": opened.size,
            "elapsed_ms": round(opened.elapsed * 1000),
            "live": opened.live,
        }

    async def async_check(self, linked: LinkedFile) -> dict[str, Any]:
        """Check a file that is already on the list."""
        result = await self.async_check_address(
            linked.address,
            home_network=linked.home_network,
            max_size_mb=linked.max_size_mb,
        )
        linked.last_checked_at = dt_util.utcnow().isoformat()
        if result["reachable"]:
            linked.reachable = True
            linked.content_type = result["content_type"]
            linked.kind = result["kind"]
            linked.live = result["live"]
            self._save()
        else:
            self.record_failure(
                linked, FetchError(FailureReason(result["reason"]), result["status"])
            )
        return result

    @callback
    def stream_started(self, linked: LinkedFile) -> None:
        """Count a pass-through stream that holds no copy."""
        self._streams[linked.file_id] = self._streams.get(linked.file_id, 0) + 1
        self._stream_started[linked.file_id] = dt_util.utcnow().isoformat()
        self._record_used(linked, self._used_by(linked.file_id))

    @callback
    def stream_ended(self, file_id: str) -> None:
        """Forget a finished pass-through stream."""
        left = self._streams.get(file_id, 1) - 1
        if left <= 0:
            self._streams.pop(file_id, None)
            self._stream_started.pop(file_id, None)
        else:
            self._streams[file_id] = left
        for listener in self._listeners:
            listener()

    async def async_acquire_copy(self, linked: LinkedFile) -> Copy:
        """Return a complete copy on this system, fetching it once if needed."""
        copy = self._copies.get(linked.file_id)
        if copy is None:
            copy = Copy(
                path=self.temp_root / "copies" / f"{linked.file_id}{linked.extension}"
            )
            self._copies[linked.file_id] = copy
            copy.task = self.hass.async_create_task(
                self._async_download(linked, copy), f"linked media {linked.file_id}"
            )
        elif copy.readers == 0 and copy.kept:
            self._record_used(linked, self._used_by(linked.file_id))
        if copy.remove_later:
            copy.remove_later()
            copy.remove_later = None
        copy.kept = False
        copy.readers += 1
        try:
            if copy.task:
                await asyncio.shield(copy.task)
        except BaseException:
            self.release_copy(linked.file_id)
            raise
        return copy

    async def _async_download(self, linked: LinkedFile, copy: Copy) -> None:
        try:
            opened = await self.async_open(linked, TOTAL_TIMEOUT)
            try:
                _refuse_live(linked, opened)
                handle = await self.hass.async_add_executor_job(copy.path.open, "wb")
                try:
                    async for chunk in opened.iter_chunks():
                        await self.hass.async_add_executor_job(handle.write, chunk)
                        copy.size += len(chunk)
                finally:
                    await self.hass.async_add_executor_job(handle.close)
            except FetchError as err:
                self.record_failure(linked, err)
                raise
            finally:
                await opened.close()
        except BaseException:
            if self._copies.get(linked.file_id) is copy:
                self._copies.pop(linked.file_id)
            await self.hass.async_add_executor_job(copy.path.unlink, True)
            raise
        copy.fetched_at = dt_util.utcnow().isoformat()
        self._record_used(linked, self._used_by(linked.file_id))

    @callback
    def release_copy(self, file_id: str) -> None:
        """Let go of a copy and remove it once nobody needs it."""
        copy = self._copies.get(file_id)
        if copy is None:
            return
        copy.readers = max(0, copy.readers - 1)
        if copy.readers:
            return
        linked = self.files.get(file_id)
        keep = linked is not None and linked.fetch == FETCH_KEEP
        copy.kept = keep

        @callback
        def _remove(_now: Any) -> None:
            copy.remove_later = None
            if copy.readers == 0 and self._copies.get(file_id) is copy:
                self.hass.async_create_task(self._async_drop_copy(file_id))

        if copy.remove_later:
            copy.remove_later()
        copy.remove_later = async_call_later(
            self.hass, KEEP_SECONDS if keep else READER_GRACE_SECONDS, _remove
        )
        for listener in self._listeners:
            listener()

    async def _async_drop_copy(self, file_id: str, force: bool = False) -> None:
        copy = self._copies.get(file_id)
        if copy is None or (copy.readers and not force):
            return
        self._copies.pop(file_id)
        if copy.remove_later:
            copy.remove_later()
        if copy.task and not copy.task.done():
            copy.task.cancel()
            with suppress(BaseException):
                await copy.task
        await self.hass.async_add_executor_job(copy.path.unlink, True)
        for listener in self._listeners:
            listener()

    async def async_hand_out(self, linked: LinkedFile, seconds: int) -> Handout:
        """Fetch a file to a local path that is removed after some seconds."""
        token = ulid()
        folder = self.handout_root / token
        stem = _SAFE_NAME.sub("_", linked.name).strip("._") or "file"
        path = folder / f"{stem}{linked.extension}"
        await self.hass.async_add_executor_job(folder.mkdir)
        size = 0
        try:
            opened = await self.async_open(linked, TOTAL_TIMEOUT)
        except BaseException:
            await self.hass.async_add_executor_job(shutil.rmtree, folder, True)
            raise
        try:
            _refuse_live(linked, opened)
            handle = await self.hass.async_add_executor_job(path.open, "wb")
            try:
                async for chunk in opened.iter_chunks():
                    await self.hass.async_add_executor_job(handle.write, chunk)
                    size += len(chunk)
            finally:
                await self.hass.async_add_executor_job(handle.close)
        except FetchError as err:
            self.record_failure(linked, err)
            await self.hass.async_add_executor_job(shutil.rmtree, folder, True)
            raise
        except BaseException:
            await self.hass.async_add_executor_job(shutil.rmtree, folder, True)
            raise
        finally:
            await opened.close()
        handout = Handout(file_id=linked.file_id, folder=folder, path=path, size=size)
        self._handouts[token] = handout

        @callback
        def _remove(_now: Any) -> None:
            handout.remove_later = None
            self.hass.async_create_task(self._async_drop_handout(token))

        handout.remove_later = async_call_later(self.hass, seconds, _remove)
        self._record_used(linked, USED_BY_ACTION)
        return handout

    async def async_release_path(self, path: str) -> bool:
        """Remove a handed out file before its time is up."""
        for token, handout in self._handouts.items():
            if str(handout.path) == path:
                await self._async_drop_handout(token)
                return True
        return False

    async def _async_drop_handout(self, token: str) -> None:
        handout = self._handouts.pop(token, None)
        if handout is None:
            return
        if handout.remove_later:
            handout.remove_later()
        await self.hass.async_add_executor_job(shutil.rmtree, handout.folder, True)
        for listener in self._listeners:
            listener()

    def status(self, file_id: str) -> dict[str, Any]:
        """Return what is happening with a file right now."""
        copy = self._copies.get(file_id)
        copy_ready = copy is not None and (copy.task is None or copy.task.done())
        streams = self._streams.get(file_id, 0)
        readers = (copy.readers if copy else 0) + streams
        handouts = [h for h in self._handouts.values() if h.file_id == file_id]
        stored = (copy.size if copy_ready and copy else 0) + sum(
            h.size for h in handouts
        )
        target = self._targets.get(file_id)
        return {
            "in_use": readers > 0 or bool(handouts),
            "readers": readers,
            "fetched_at": (copy.fetched_at if copy else None)
            or self._stream_started.get(file_id),
            "playing_on": target[0]
            if target and readers and time.monotonic() - target[1] < 3600
            else None,
            "stored_bytes": stored,
            "kept_until_reuse": bool(copy and copy.kept),
            "files_handed_out": len(handouts),
        }

    def as_dict(self, linked: LinkedFile, *, admin: bool) -> dict[str, Any]:
        """Return a file as the interface may see it, never with its address."""
        result: dict[str, Any] = {
            "id": linked.file_id,
            "name": linked.name,
            "host": linked.host,
            "kind": linked.kind,
            "content_type": linked.content_type,
            "fetch": linked.fetch,
            "max_size_mb": linked.max_size_mb,
            "home_network": linked.home_network,
            "live": linked.live,
            "created_at": linked.created_at,
            "last_used_at": linked.last_used_at,
            "last_used_by": linked.last_used_by,
            "last_failure_at": linked.last_failure_at,
            "last_failure_reason": linked.last_failure_reason,
            "last_failure_status": linked.last_failure_status,
            "last_checked_at": linked.last_checked_at,
            "reachable": linked.reachable,
            "status": self.status(linked.file_id),
        }
        if admin and (url := parse_address(linked.address)):
            result["address"] = masked_address(url)
            result["address_hidden"] = address_has_secret(url)
        return result
