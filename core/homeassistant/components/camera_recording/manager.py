"""Runs the recorders of one destination, copies finished segments and applies the limits."""

import asyncio
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
import os
from pathlib import Path
import re
import shutil
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import CALLBACK_TYPE, HomeAssistant, callback
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util
from homeassistant.util.ulid import ulid

from .const import (
    CONF_BUFFER_HOURS,
    CONF_CAMERAS,
    CONF_KEEP_DAYS,
    CONF_MAX_GB,
    CONF_SEGMENT_MINUTES,
    DEFAULT_BUFFER_HOURS,
    DEFAULT_KEEP_DAYS,
    DEFAULT_MAX_GB,
    DEFAULT_SEGMENT_MINUTES,
    DOMAIN,
    LOGGER,
    RETENTION_INTERVAL_SECONDS,
    SEGMENT_GRACE_SECONDS,
    SEGMENT_SUFFIX,
    SEGMENT_TIME_FORMAT,
    STORAGE_VERSION,
    UPLOAD_INTERVAL_SECONDS,
)
from .destination import (
    Destination,
    DestinationError,
    LocalDestination,
    create_destination,
)
from .recorder import CameraRecorder, RecorderState

SEGMENT_NAME = re.compile(r"^\d{8}T\d{6}Z\.mp4$")
CACHE_FILES = 12


def camera_folder_name(entity_id: str) -> str:
    """A folder name for a camera: the object id, which is already safe for file names."""
    return entity_id.split(".", 1)[1]


def parse_start(name: str) -> datetime | None:
    """The start time of a segment from its file name."""
    if not SEGMENT_NAME.match(name):
        return None
    return datetime.strptime(
        name.removesuffix(SEGMENT_SUFFIX), SEGMENT_TIME_FORMAT
    ).replace(tzinfo=UTC)


def remote_path(entity_id: str, name: str) -> str:
    """Where a segment goes at a remote destination: camera, then day, then file."""
    start = parse_start(name)
    day = start.strftime("%Y-%m-%d") if start else "unknown"
    return f"{camera_folder_name(entity_id)}/{day}/{name}"


@dataclass(slots=True)
class Segment:
    """One finished recording file."""

    name: str
    start: float
    duration: float
    size: int
    local: bool
    remote: bool

    @property
    def end(self) -> float:
        """When the segment ends, as a UNIX time."""
        return self.start + self.duration

    def as_list(self) -> list[Any]:
        """Compact form for storage."""
        return [
            self.name,
            self.start,
            self.duration,
            self.size,
            self.local,
            self.remote,
        ]

    @classmethod
    def from_list(cls, row: list[Any]) -> Segment:
        """Read the compact form."""
        return cls(
            str(row[0]),
            float(row[1]),
            float(row[2]),
            int(row[3]),
            bool(row[4]),
            bool(row[5]),
        )


class RecordingManager:
    """Everything for one config entry: recorders, copying, limits and the segment index."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        """Set up from the entry. Nothing runs until async_start."""
        self.hass = hass
        self.entry = entry
        self.destination: Destination = create_destination(hass, entry.data)
        options = entry.options
        self.cameras: list[str] = list(options.get(CONF_CAMERAS, []))
        self.keep_days = int(options.get(CONF_KEEP_DAYS, DEFAULT_KEEP_DAYS))
        self.max_bytes = int(
            float(options.get(CONF_MAX_GB, DEFAULT_MAX_GB)) * 1_000_000_000
        )
        self.buffer_seconds = (
            float(options.get(CONF_BUFFER_HOURS, DEFAULT_BUFFER_HOURS)) * 3600
        )
        self.segment_seconds = (
            int(options.get(CONF_SEGMENT_MINUTES, DEFAULT_SEGMENT_MINUTES)) * 60
        )
        self.segments: dict[str, dict[str, Segment]] = {cam: {} for cam in self.cameras}
        self.paused: set[str] = set()
        self.recorders: dict[str, CameraRecorder] = {}
        self.last_copy: datetime | None = None
        self.last_error: str | None = None
        self.free_bytes: int | None = None
        self._store: Store[dict[str, Any]] = Store(
            hass, STORAGE_VERSION, f"{DOMAIN}.{entry.entry_id}"
        )
        self._listeners: list[Callable[[], None]] = []
        self._unsubs: list[CALLBACK_TYPE] = []
        self._copy_lock = asyncio.Lock()
        self._retention_lock = asyncio.Lock()

    @property
    def staging_root(self) -> Path:
        """Where ffmpeg writes. A local destination is written in place."""
        if isinstance(self.destination, LocalDestination):
            return self.destination.root
        return Path(self.hass.config.path(DOMAIN, self.entry.entry_id))

    @property
    def cache_root(self) -> Path:
        """Where segments fetched back for playback are kept for a short while."""
        return Path(self.hass.config.path(DOMAIN, self.entry.entry_id, ".playback"))

    def folder(self, entity_id: str) -> Path:
        """The folder ffmpeg writes a camera's segments to."""
        return self.staging_root / camera_folder_name(entity_id)

    @callback
    def async_add_listener(self, listener: Callable[[], None]) -> CALLBACK_TYPE:
        """Call listener whenever a state shown to the user changes."""
        self._listeners.append(listener)
        return lambda: self._listeners.remove(listener)

    @callback
    def _changed(self) -> None:
        for listener in list(self._listeners):
            listener()

    async def async_start(self) -> None:
        """Load the index, find segments already on disk, start recording and the timers."""
        stored = await self._store.async_load() or {}
        self.paused = set(stored.get("paused", [])) & set(self.cameras)
        for cam, rows in stored.get("cameras", {}).items():
            if cam in self.segments:
                self.segments[cam] = {row[0]: Segment.from_list(row) for row in rows}
        await self._async_scan()
        for cam in self.cameras:
            recorder = CameraRecorder(
                self.hass, cam, self.folder(cam), self.segment_seconds, self._changed
            )
            self.recorders[cam] = recorder
            if cam in self.paused:
                recorder.state = RecorderState.PAUSED
            else:
                recorder.start()
        self._unsubs.append(
            async_track_time_interval(
                self.hass,
                self._async_copy_tick,
                timedelta(seconds=UPLOAD_INTERVAL_SECONDS),
                name=f"{DOMAIN} copy",
                cancel_on_shutdown=True,
            )
        )
        self._unsubs.append(
            async_track_time_interval(
                self.hass,
                self._async_retention_tick,
                timedelta(seconds=RETENTION_INTERVAL_SECONDS),
                name=f"{DOMAIN} limits",
                cancel_on_shutdown=True,
            )
        )
        self._changed()

    async def async_stop(self) -> None:
        """Stop recording, finishing the open segments, and save the index."""
        for unsub in self._unsubs:
            unsub()
        self._unsubs.clear()
        await asyncio.gather(*(rec.stop() for rec in self.recorders.values()))
        await self._async_scan()
        await self._store.async_save(self._data())

    async def async_set_paused(self, entity_id: str, paused: bool) -> None:
        """Pause or resume one camera. Kept across restarts."""
        recorder = self.recorders[entity_id]
        if paused:
            self.paused.add(entity_id)
            await recorder.stop(paused=True)
        else:
            self.paused.discard(entity_id)
            recorder.start()
        self._save()
        self._changed()

    def _data(self) -> dict[str, Any]:
        return {
            "paused": sorted(self.paused),
            "cameras": {
                cam: [
                    seg.as_list()
                    for seg in sorted(segs.values(), key=lambda s: s.start)
                ]
                for cam, segs in self.segments.items()
            },
        }

    @callback
    def _save(self) -> None:
        self._store.async_delay_save(self._data, 5)

    async def _async_scan(self) -> None:
        """Add finished segments found in the camera folders to the index."""
        now = dt_util.utcnow().timestamp()

        def _scan() -> dict[str, list[tuple[str, float, int]]]:
            found: dict[str, list[tuple[str, float, int]]] = {}
            for cam in self.cameras:
                folder = self.folder(cam)
                files: list[tuple[str, float, int]] = []
                if folder.is_dir():
                    with os.scandir(folder) as entries:
                        for entry in entries:
                            if entry.is_file() and SEGMENT_NAME.match(entry.name):
                                stat = entry.stat()
                                files.append((entry.name, stat.st_mtime, stat.st_size))
                found[cam] = sorted(files)
            return found

        found = await self.hass.async_add_executor_job(_scan)
        changed = False
        for cam, files in found.items():
            recorder = self.recorders.get(cam)
            writing = recorder is not None and recorder.state == RecorderState.RECORDING
            known = self.segments[cam]
            for index, (name, mtime, size) in enumerate(files):
                start = parse_start(name)
                if start is None:
                    continue
                newest = index == len(files) - 1
                planned_end = (
                    start.timestamp() + self.segment_seconds + SEGMENT_GRACE_SECONDS
                )
                # ffmpeg is still writing the newest file while the camera records.
                if (
                    newest
                    and writing
                    and now < max(planned_end, mtime + SEGMENT_GRACE_SECONDS)
                ):
                    continue
                if size == 0:
                    continue
                segment = known.get(name)
                if segment is None:
                    known[name] = Segment(
                        name,
                        start.timestamp(),
                        max(1.0, mtime - start.timestamp()),
                        size,
                        local=True,
                        remote=self.destination.is_local,
                    )
                    changed = True
                elif not segment.local:
                    segment.local = True
                    changed = True
        if changed:
            self._save()
            self._changed()

    async def _async_copy_tick(self, _now: datetime | None = None) -> None:
        if self._copy_lock.locked():
            return
        async with self._copy_lock:
            await self.async_copy()

    async def async_copy(self) -> None:
        """Copy finished segments to the destination, then trim the local buffer."""
        await self._async_scan()
        if self.destination.is_local:
            return
        waiting = [
            (cam, seg)
            for cam, segs in self.segments.items()
            for seg in segs.values()
            if seg.local and not seg.remote
        ]
        cutoff = dt_util.utcnow().timestamp() - self.buffer_seconds
        trim = [
            (cam, seg)
            for cam, segs in self.segments.items()
            for seg in segs.values()
            if seg.local and seg.remote and seg.end < cutoff
        ]
        if waiting:
            try:
                async with self.destination.session() as session:
                    for cam, seg in sorted(waiting, key=lambda item: item[1].start):
                        await session.upload(
                            self.folder(cam) / seg.name, remote_path(cam, seg.name)
                        )
                        seg.remote = True
                        self.last_copy = dt_util.utcnow()
                        if seg.end < cutoff:
                            trim.append((cam, seg))
                    self.free_bytes = await session.free_space()
            except DestinationError as err:
                if self.last_error != str(err):
                    LOGGER.warning(
                        "Could not copy recordings to %s: %s",
                        self.destination.label,
                        err,
                    )
                self.last_error = str(err)
            else:
                self.last_error = None
        if trim:
            await self.hass.async_add_executor_job(
                _unlink_all, [self.folder(cam) / seg.name for cam, seg in trim]
            )
            for _cam, seg in trim:
                seg.local = False
        if waiting or trim:
            self._save()
            self._changed()

    async def _async_retention_tick(self, _now: datetime | None = None) -> None:
        if self._retention_lock.locked():
            return
        async with self._retention_lock:
            await self.async_apply_limits()

    async def async_apply_limits(self) -> None:
        """Remove the oldest recordings past the age limit, then past the space limit."""
        cutoff = dt_util.utcnow().timestamp() - self.keep_days * 86400
        everything = sorted(
            (
                (cam, seg)
                for cam, segs in self.segments.items()
                for seg in segs.values()
            ),
            key=lambda item: item[1].start,
        )
        doomed = [(cam, seg) for cam, seg in everything if seg.end < cutoff]
        if self.max_bytes:
            total = sum(seg.size for _cam, seg in everything)
            for cam, seg in everything:
                if total <= self.max_bytes:
                    break
                if (cam, seg) not in doomed:
                    doomed.append((cam, seg))
                total -= seg.size
        if not doomed:
            return
        remote = [
            (cam, seg)
            for cam, seg in doomed
            if seg.remote and not self.destination.is_local
        ]
        if remote:
            try:
                async with self.destination.session() as session:
                    for cam, seg in remote:
                        await session.delete(remote_path(cam, seg.name))
            except DestinationError as err:
                self.last_error = str(err)
                LOGGER.warning(
                    "Could not remove old recordings at %s: %s",
                    self.destination.label,
                    err,
                )
                return
        await self.hass.async_add_executor_job(
            _unlink_all, [self.folder(cam) / seg.name for cam, seg in doomed]
        )
        for cam, seg in doomed:
            self.segments[cam].pop(seg.name, None)
        self._save()
        self._changed()

    def segments_between(
        self, entity_id: str, start: float, end: float
    ) -> list[Segment]:
        """Finished segments of a camera that overlap a time window, oldest first."""
        return sorted(
            (
                seg
                for seg in self.segments.get(entity_id, {}).values()
                if seg.end > start and seg.start < end
            ),
            key=lambda seg: seg.start,
        )

    async def async_playable_path(self, entity_id: str, name: str) -> Path | None:
        """A local file for a segment, fetched back from the destination when needed."""
        segment = self.segments.get(entity_id, {}).get(name)
        if segment is None:
            return None
        local = self.folder(entity_id) / name
        if segment.local and await self.hass.async_add_executor_job(local.is_file):
            return local
        if not segment.remote:
            return None
        cache = self.cache_root / f"{camera_folder_name(entity_id)}-{name}"
        if await self.hass.async_add_executor_job(cache.is_file):
            return cache
        await self.hass.async_add_executor_job(_prepare_cache, self.cache_root)
        partial = cache.with_suffix(f".{ulid()}.part")
        async with self.destination.session() as session:
            await session.download(remote_path(entity_id, name), partial)
        await self.hass.async_add_executor_job(partial.replace, cache)
        return cache

    def status(self) -> dict[str, Any]:
        """Everything the status page shows for this destination."""
        cameras = []
        for cam in self.cameras:
            segs = self.segments.get(cam, {})
            recorder = self.recorders.get(cam)
            newest = max(segs.values(), key=lambda s: s.start, default=None)
            oldest = min(segs.values(), key=lambda s: s.start, default=None)
            cameras.append(
                {
                    "entity_id": cam,
                    "state": recorder.state if recorder else RecorderState.STOPPED,
                    "error": recorder.last_error if recorder else None,
                    "waiting": sum(
                        1 for s in segs.values() if s.local and not s.remote
                    ),
                    "segments": len(segs),
                    "bytes": sum(s.size for s in segs.values()),
                    "newest": newest.end if newest else None,
                    "oldest": oldest.start if oldest else None,
                }
            )
        return {
            "entry_id": self.entry.entry_id,
            "title": self.entry.title,
            "destination": self.destination.kind,
            "label": self.destination.label,
            "keep_days": self.keep_days,
            "max_bytes": self.max_bytes,
            "segment_seconds": self.segment_seconds,
            "used_bytes": sum(c["bytes"] for c in cameras),
            "free_bytes": self.free_bytes,
            "last_copy": self.last_copy.isoformat() if self.last_copy else None,
            "error": self.last_error,
            "cameras": cameras,
        }


def _unlink_all(paths: list[Path]) -> None:
    for path in paths:
        path.unlink(missing_ok=True)


def _prepare_cache(root: Path) -> None:
    """Make the playback cache folder and keep only the newest few files in it."""
    root.mkdir(parents=True, exist_ok=True)
    files = sorted(
        (p for p in root.iterdir() if p.is_file()), key=lambda p: p.stat().st_mtime
    )
    for old in files[: max(0, len(files) - CACHE_FILES)]:
        old.unlink(missing_ok=True)


def remove_entry_files(hass: HomeAssistant, entry_id: str) -> None:
    """Remove the staging and cache folders of a removed entry. Runs in the executor."""
    shutil.rmtree(hass.config.path(DOMAIN, entry_id), ignore_errors=True)
