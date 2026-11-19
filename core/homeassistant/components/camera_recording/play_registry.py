"""Plays older recordings straight from the locked container registry.

A recording is fetched in parts, each part is unlocked here, and the bytes go to the
player as they arrive, so playing starts before the whole file is there and any part can
be opened alone for a seek. Nothing unlocked is written to disk: a few parts are kept in
memory, shared by everyone watching the same recording, and thrown away when the last
viewer leaves, after a short idle time, and when the instance stops.
"""

import asyncio
from collections.abc import AsyncIterator
from contextlib import suppress
from dataclasses import dataclass, field
from http import HTTPStatus
import logging
import time
from typing import Any

from aiohttp import web

from homeassistant.auth.permissions.const import POLICY_READ
from homeassistant.components.http import KEY_HASS, KEY_HASS_USER, HomeAssistantView
from homeassistant.components.registry_storage import async_get_store
from homeassistant.components.registry_storage.crypto import PART_SIZE
from homeassistant.components.registry_storage.errors import (
    Reason,
    RegistryStorageError,
)
from homeassistant.const import EVENT_HOMEASSISTANT_STOP
from homeassistant.core import Event, HomeAssistant
from homeassistant.helpers.event import async_track_time_interval

from .registry_place import clear_stray_files, get_place

_LOGGER = logging.getLogger(__name__)

# Parts kept in memory for one recording, so about this many MiB.
MAX_PARTS = 6
# A recording nobody has asked for in this long is dropped even if a reader is open.
IDLE_SECONDS = 60.0
# After the last viewer leaves, a quick seek-and-reopen still finds its parts for this long.
CLOSE_GRACE_SECONDS = 10.0
SWEEP_SECONDS = 5.0
LIMITED_WAIT_SECONDS = 60.0
MAX_LIMITED_WAIT_SECONDS = 900.0
SIGNED_PATH_SECONDS = 300

RESPONSE_CONTENT_TYPES = {".mp4": "video/mp4", ".jpg": "image/jpeg"}


class RangeNotSatisfiable(Exception):
    """The asked range lies outside the file."""


def parse_range(header: str | None, size: int) -> tuple[int, int, bool]:
    """The (start, end, partial) of a request. `end` is exclusive.

    A missing or unusable header means the whole file. Only the first range of a list
    is served. Raises RangeNotSatisfiable when the range starts past the end.
    """
    if size <= 0:
        return 0, 0, False
    if not header or not header.startswith("bytes="):
        return 0, size, False
    first = header[6:].split(",", 1)[0].strip()
    left, sep, right = first.partition("-")
    if not sep:
        return 0, size, False
    try:
        if left == "":
            length = int(right)
            if length <= 0:
                raise RangeNotSatisfiable
            return max(0, size - length), size, True
        start = int(left)
        end = int(right) + 1 if right else size
    except ValueError:
        return 0, size, False
    if start >= size or start < 0:
        raise RangeNotSatisfiable
    if end <= start:
        return 0, size, False
    return start, min(end, size), True


def parts_for(start: int, end: int) -> range:
    """The indexes of the parts that hold bytes start up to end."""
    if end <= start:
        return range(0)
    return range(start // PART_SIZE, (end - 1) // PART_SIZE + 1)


@dataclass(slots=True)
class _Session:
    object_id: str
    size: int
    readers: int = 0
    last_used: float = 0.0
    closed_at: float | None = None
    parts: dict[int, bytes] = field(default_factory=dict)
    pending: dict[int, asyncio.Future[bytes]] = field(default_factory=dict)
    downloads: int = 0


class RegistryPlayer:
    """The shared parts of the recordings being watched, and the rate-limit wait."""

    def __init__(self, hass: HomeAssistant) -> None:
        """Start with nothing open."""
        self.hass = hass
        self.sessions: dict[str, _Session] = {}
        self.limited_until = 0.0
        self._limited_for = 0.0
        self._unsub_sweep: Any = None
        self._unsub_stop: Any = None

    def start(self) -> None:
        """Clear what a stop left behind and begin sweeping idle recordings."""
        self.hass.async_add_executor_job(clear_stray_files, self.hass)
        self._unsub_sweep = async_track_time_interval(
            self.hass,
            lambda _now: self.sweep(time.monotonic()),
            _interval(SWEEP_SECONDS),
        )
        self._unsub_stop = self.hass.bus.async_listen_once(
            EVENT_HOMEASSISTANT_STOP, self._on_stop
        )

    async def _on_stop(self, _event: Event) -> None:
        self.close_all()

    def close_all(self) -> None:
        """Throw away every unlocked part."""
        for session in self.sessions.values():
            session.parts.clear()
            for future in session.pending.values():
                future.cancel()
        self.sessions.clear()
        if self._unsub_sweep is not None:
            self._unsub_sweep()
            self._unsub_sweep = None

    def sweep(self, now: float) -> None:
        """Drop recordings that are idle, or that nobody has open any more."""
        for object_id, session in list(self.sessions.items()):
            idle = now - session.last_used > IDLE_SECONDS
            left = (
                session.readers == 0
                and session.closed_at is not None
                and now - session.closed_at > CLOSE_GRACE_SECONDS
            )
            if idle or left:
                session.parts.clear()
                for future in session.pending.values():
                    future.cancel()
                del self.sessions[object_id]

    def waiting(self) -> dict[str, Any] | None:
        """Whether the registry asked us to slow down, and for how long."""
        left = self.limited_until - time.monotonic()
        if left <= 0:
            return None
        return {"reason": "rate_limited", "retry_after": round(left)}

    def note_limited(self) -> None:
        """Wait longer each time the registry says it is busy, and reset on success."""
        self._limited_for = min(
            MAX_LIMITED_WAIT_SECONDS,
            LIMITED_WAIT_SECONDS if self._limited_for == 0 else self._limited_for * 2,
        )
        self.limited_until = time.monotonic() + self._limited_for

    def note_ok(self) -> None:
        """A fetch worked."""
        self._limited_for = 0.0

    def open_session(self, object_id: str, size: int) -> _Session:
        """The shared session of a recording."""
        session = self.sessions.get(object_id)
        if session is None:
            session = self.sessions[object_id] = _Session(object_id, size)
        session.readers += 1
        session.closed_at = None
        session.last_used = time.monotonic()
        return session

    def release(self, session: _Session) -> None:
        """A viewer is done."""
        session.readers = max(0, session.readers - 1)
        if session.readers == 0:
            session.closed_at = time.monotonic()

    async def part(self, session: _Session, index: int) -> bytes:
        """One unlocked part, fetched once however many viewers ask for it."""
        session.last_used = time.monotonic()
        if (data := session.parts.get(index)) is not None:
            return data
        if (future := session.pending.get(index)) is not None:
            return await asyncio.shield(future)
        future = asyncio.get_running_loop().create_future()
        session.pending[index] = future
        try:
            data = await self._fetch(session, index)
        except BaseException as err:
            session.pending.pop(index, None)
            if not future.done():
                if isinstance(err, Exception):
                    future.set_exception(err)
                else:
                    future.cancel()
            with suppress(BaseException):
                future.exception()
            raise
        session.pending.pop(index, None)
        session.parts[index] = data
        session.downloads += 1
        while len(session.parts) > MAX_PARTS:
            farthest = max(session.parts, key=lambda key: abs(key - index))
            del session.parts[farthest]
        future.set_result(data)
        return data

    async def _fetch(self, session: _Session, index: int) -> bytes:
        store = async_get_store(self.hass)
        if store is None:
            raise RegistryStorageError(Reason.NOT_READY)
        start = index * PART_SIZE
        try:
            data = await store.async_get_range(
                session.object_id, start, min(session.size, start + PART_SIZE)
            )
        except RegistryStorageError as err:
            if err.reason is Reason.RATE_LIMITED:
                self.note_limited()
            raise
        self.note_ok()
        return data

    async def read(
        self, session: _Session, start: int, end: int
    ) -> AsyncIterator[bytes]:
        """The bytes from start up to end, part by part, fetching the next part ahead."""
        indexes = parts_for(start, end)
        ahead: asyncio.Task[bytes] | None = None
        try:
            for position, index in enumerate(indexes):
                data = await self.part(session, index)
                ahead = None
                if position + 1 < len(indexes):
                    ahead = asyncio.ensure_future(
                        self.part(session, indexes[position + 1])
                    )
                base = index * PART_SIZE
                yield data[max(start, base) - base : min(end, base + len(data)) - base]
        finally:
            if ahead is not None:
                ahead.cancel()
                with suppress(BaseException):
                    await ahead


def _interval(seconds: float) -> Any:
    from datetime import timedelta  # noqa: PLC0415

    return timedelta(seconds=seconds)


def error_status(err: RegistryStorageError) -> HTTPStatus:
    """The status a registry or lock failure is answered with."""
    if err.reason is Reason.RATE_LIMITED:
        return HTTPStatus.TOO_MANY_REQUESTS
    if err.reason in (Reason.TIMEOUT, Reason.UNAVAILABLE):
        return HTTPStatus.GATEWAY_TIMEOUT
    if err.reason is Reason.NOT_READY:
        return HTTPStatus.SERVICE_UNAVAILABLE
    return HTTPStatus.BAD_GATEWAY


class RegistryRecordingView(HomeAssistantView):
    """An older recording from the registry. Use the signed path from the play command."""

    url = "/api/camera_recording/registry/{entity_id}/{name}"
    name = "api:camera_recording:registry"
    requires_auth = True

    async def get(
        self, request: web.Request, entity_id: str, name: str
    ) -> web.StreamResponse:
        """Answer range requests by fetching and unlocking only the parts needed."""
        hass = request.app[KEY_HASS]
        if not request[KEY_HASS_USER].permissions.check_entity(entity_id, POLICY_READ):
            return web.Response(status=HTTPStatus.FORBIDDEN)
        place = get_place(hass)
        row = place.index.find(entity_id, name)
        if row is None:
            return web.Response(status=HTTPStatus.NOT_FOUND)
        player = place.player
        if (wait := player.waiting()) is not None:
            return web.json_response(
                wait,
                status=HTTPStatus.TOO_MANY_REQUESTS,
                headers={"Retry-After": str(wait["retry_after"])},
            )
        size = int(row["size"])
        try:
            start, end, partial = parse_range(request.headers.get("Range"), size)
        except RangeNotSatisfiable:
            return web.Response(
                status=HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE,
                headers={"Content-Range": f"bytes */{size}"},
            )
        session = player.open_session(str(row["id"]), size)
        try:
            first = None
            if end > start:
                try:
                    first = await player.part(session, start // PART_SIZE)
                except RegistryStorageError as err:
                    headers = {}
                    if (wait := player.waiting()) is not None:
                        headers["Retry-After"] = str(wait["retry_after"])
                    return web.json_response(
                        {"reason": str(err.reason)},
                        status=error_status(err),
                        headers=headers,
                    )
            suffix = ".jpg" if name.endswith(".jpg") else ".mp4"
            headers = {
                "Content-Type": RESPONSE_CONTENT_TYPES[suffix],
                "Accept-Ranges": "bytes",
                "Content-Length": str(end - start),
                "Cache-Control": "private, no-store",
            }
            if partial:
                headers["Content-Range"] = f"bytes {start}-{end - 1}/{size}"
            response = web.StreamResponse(
                status=HTTPStatus.PARTIAL_CONTENT if partial else HTTPStatus.OK,
                headers=headers,
            )
            await response.prepare(request)
            del first
            try:
                async for chunk in player.read(session, start, end):
                    await response.write(chunk)
            except RegistryStorageError, ConnectionResetError:
                return response
            await response.write_eof()
            return response
        finally:
            player.release(session)


@dataclass(slots=True)
class GetBackJob:
    """Downloading and unlocking recordings back to this system."""

    id: str
    entity_id: str
    names: list[str]
    total_bytes: int
    done_bytes: int = 0
    done_files: int = 0
    state: str = "running"
    reason: str | None = None
    started: float = field(default_factory=time.time)
    task: asyncio.Task[None] | None = None

    def as_dict(self) -> dict[str, Any]:
        """What the page shows."""
        return {
            "id": self.id,
            "entity_id": self.entity_id,
            "files": len(self.names),
            "done_files": self.done_files,
            "total_bytes": self.total_bytes,
            "done_bytes": self.done_bytes,
            "state": self.state,
            "reason": self.reason,
            "started": self.started,
        }
