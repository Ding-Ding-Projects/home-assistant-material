"""Runs the recorders of one destination, copies finished segments and applies the limits."""

import asyncio
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from functools import partial
import os
from pathlib import Path
import re
import shutil
from typing import Any

from homeassistant.components.camera import DATA_COMPONENT as CAMERA_DATA
from homeassistant.components.ffmpeg import get_ffmpeg_manager
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import CALLBACK_TYPE, Event, HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.event import (
    EventStateChangedData,
    async_track_state_change_event,
    async_track_time_interval,
)
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util
from homeassistant.util.ulid import ulid

from .backoff import wait_for_attempt
from .const import (
    BUFFER_FOLDER,
    BUFFER_SEGMENT_SECONDS,
    CONF_BUFFER_HOURS,
    CONF_CAMERAS,
    CONF_DEFAULT_MODE,
    CONF_KEEP_DAYS,
    CONF_MAX_GB,
    CONF_SEGMENT_MINUTES,
    DEFAULT_BUFFER_HOURS,
    DEFAULT_CLIP_SECONDS,
    DEFAULT_CLIPS_PER_HOUR,
    DEFAULT_KEEP_DAYS,
    DEFAULT_MAX_GB,
    DEFAULT_MODE,
    DEFAULT_POST_SECONDS,
    DEFAULT_PRE_SECONDS,
    DEFAULT_SEGMENT_MINUTES,
    DOMAIN,
    EVENT_CLIP_INTERVAL_SECONDS,
    EVENT_CLIP_SECONDS,
    EVENT_IMAGE_SECONDS,
    EVENT_NAME_MARK,
    LIGHT_TICK_SECONDS,
    LOGGER,
    MAX_CLIP_SECONDS,
    MAX_CLIP_SECONDS_LIVE,
    MAX_CLIPS_PER_HOUR,
    MAX_REMEMBERED_EVENTS,
    MIN_CLIP_SECONDS,
    MIN_CLIPS_PER_HOUR,
    MODE_ALL_DAY,
    MODE_LIGHT,
    MODE_OFF,
    MODES,
    ORIGIN_HOME,
    ORIGIN_SERVICE,
    RATE_LIMIT_WAIT_SECONDS,
    RETENTION_INTERVAL_SECONDS,
    SEGMENT_GRACE_SECONDS,
    SEGMENT_SUFFIX,
    SEGMENT_TIME_FORMAT,
    SOURCE_INTEGRATION,
    STORAGE_VERSION,
    UPLOAD_INTERVAL_SECONDS,
)
from .destination import (
    Destination,
    DestinationError,
    LocalDestination,
    create_destination,
)
from .event_media import EventMedia, EventMediaKind, async_event_media_for
from .events import (
    GIVE_UP_SECONDS,
    MATCH_SECONDS,
    MAX_RECORDS_PER_CAMERA,
    ClipReason,
    ClipState,
    EventRecord,
    classify_error,
)
from .light import (
    LightPlanner,
    clamp_post,
    clamp_pre,
    resolve_sources,
    source_options,
    state_is_active,
    state_is_known,
)
from .live import (
    async_go2rtc_access,
    async_record_clip,
    broker_for,
    probe_duration,
    whep_source,
)
from .recorder import CameraRecorder, RecorderState

SEGMENT_NAME = re.compile(r"^\d{8}T\d{6}Z(?:-event)?\.(?:mp4|jpg)$")
STAMP_LENGTH = 16
CACHE_FILES = 12
BUFFER_FINISHED_SECONDS = 15
PLANNER_MEMORY_SECONDS = 3600
MAX_ATTEMPTS = 5
RETRY_REASONS = (
    ClipReason.NO_MEDIA,
    ClipReason.TIMED_OUT,
    ClipReason.RATE_LIMITED,
)


class ModeError(Exception):
    """A recording amount cannot be set, with a short code for the reason."""

    def __init__(self, code: str, message: str) -> None:
        """Keep the code and a plain message."""
        super().__init__(message)
        self.code = code


@dataclass(slots=True)
class CameraMode:
    """How much of one camera to keep."""

    mode: str = DEFAULT_MODE
    pre: int = DEFAULT_PRE_SECONDS
    post: int = DEFAULT_POST_SECONDS
    sources: list[str] | None = None
    live: bool | None = None  # None: on when the bundled go2rtc is set up
    clip_seconds: int = DEFAULT_CLIP_SECONDS
    clips_per_hour: int = DEFAULT_CLIPS_PER_HOUR

    def as_dict(self) -> dict[str, Any]:
        """Form kept in storage."""
        return {
            "mode": self.mode,
            "pre": self.pre,
            "post": self.post,
            "sources": self.sources,
            "live": self.live,
            "clip_seconds": self.clip_seconds,
            "clips_per_hour": self.clips_per_hour,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> CameraMode:
        """Read the stored form, falling back to all day for anything unknown."""
        mode = data.get("mode")
        sources = data.get("sources")
        return cls(
            mode if mode in (MODE_ALL_DAY, MODE_LIGHT) else MODE_ALL_DAY,
            clamp_pre(data.get("pre", DEFAULT_PRE_SECONDS)),
            clamp_post(data.get("post", DEFAULT_POST_SECONDS)),
            list(sources) if isinstance(sources, list) else None,
            data.get("live") if isinstance(data.get("live"), bool) else None,
            clamp_clip_seconds(data.get("clip_seconds", DEFAULT_CLIP_SECONDS)),
            clamp_clips_per_hour(data.get("clips_per_hour", DEFAULT_CLIPS_PER_HOUR)),
        )


def clamp_clip_seconds(value: Any) -> int:
    """A live clip length inside the allowed range."""
    return max(MIN_CLIP_SECONDS, min(MAX_CLIP_SECONDS_LIVE, int(value)))


def clamp_clips_per_hour(value: Any) -> int:
    """A live clip budget inside the allowed range."""
    return max(MIN_CLIPS_PER_HOUR, min(MAX_CLIPS_PER_HOUR, int(value)))


def event_file_name(timestamp: float, kind: EventMediaKind) -> str:
    """The file name of an event clip or picture, by the event time in UTC."""
    stamp = datetime.fromtimestamp(timestamp, UTC).strftime(SEGMENT_TIME_FORMAT)
    suffix = SEGMENT_SUFFIX if kind is EventMediaKind.CLIP else ".jpg"
    return f"{stamp}{EVENT_NAME_MARK}{suffix}"


def camera_folder_name(entity_id: str) -> str:
    """A folder name for a camera: the object id, which is already safe for file names."""
    return entity_id.split(".", 1)[1]


def parse_start(name: str) -> datetime | None:
    """The start time of a segment from its file name."""
    if not SEGMENT_NAME.match(name):
        return None
    return datetime.strptime(name[:STAMP_LENGTH], SEGMENT_TIME_FORMAT).replace(
        tzinfo=UTC
    )


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

    @property
    def kind(self) -> str:
        """Whether this is a recording, or a clip or picture of an event."""
        if EVENT_NAME_MARK not in self.name:
            return "recording"
        return "event_clip" if self.name.endswith(SEGMENT_SUFFIX) else "event_image"

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
        self.default_mode = str(options.get(CONF_DEFAULT_MODE, DEFAULT_MODE))
        self.modes: dict[str, CameraMode] = {}
        self.mode_history: dict[str, list[list[Any]]] = {}
        self.event_log: dict[str, list[float]] = {}
        self.event_seen: dict[str, dict[str, float]] = {}
        self.planners: dict[str, LightPlanner] = {}
        self.ledger: dict[str, list[EventRecord]] = {cam: [] for cam in self.cameras}
        self.failures: dict[str, dict[str, int]] = {}
        self.last_problem: dict[str, tuple[float, ClipReason]] = {}
        self._list_problem: dict[str, ClipReason] = {}
        self._limited_until: dict[str, float] = {}
        self._limited_attempt: dict[str, int] = {}
        self.live_starts: dict[str, list[float]] = {}
        self.live_active: dict[str, EventRecord] = {}
        self._live_tasks: set[asyncio.Task[None]] = set()
        self._known: set[str] = set()
        self._source_unsubs: dict[str, list[CALLBACK_TYPE]] = {}
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

    def buffer_folder(self, entity_id: str) -> Path:
        """Where ffmpeg writes a Light camera's rolling buffer."""
        return self.staging_root / BUFFER_FOLDER / camera_folder_name(entity_id)

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
        self._load_modes(stored)
        self.live_starts = {
            cam: [float(ts) for ts in rows]
            for cam, rows in stored.get("live_starts", {}).items()
            if cam in self.cameras
        }
        for cam, rows in stored.get("ledger", {}).items():
            if cam in self.ledger:
                self.ledger[cam] = [EventRecord.from_list(row) for row in rows]
        self._unsubs.append(
            self.hass.bus.async_listen("nest_event", self._provider_event)
        )
        await self._async_scan()
        for cam in self.cameras:
            recorder = CameraRecorder(
                self.hass, cam, self.folder(cam), self.segment_seconds, self._changed
            )
            self.recorders[cam] = recorder
            self._apply_mode(cam)
            if cam in self.paused:
                recorder.state = RecorderState.PAUSED
            else:
                recorder.start()
            self._note_mode(cam)
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
                self._async_light_tick,
                timedelta(seconds=LIGHT_TICK_SECONDS),
                name=f"{DOMAIN} light",
                cancel_on_shutdown=True,
            )
        )
        self._unsubs.append(
            async_track_time_interval(
                self.hass,
                self._async_event_clip_tick,
                timedelta(seconds=EVENT_CLIP_INTERVAL_SECONDS),
                name=f"{DOMAIN} event clips",
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
        for cam in list(self._source_unsubs):
            self._unwatch_sources(cam)
        for task in list(self._live_tasks):
            task.cancel()
        await asyncio.gather(*self._live_tasks, return_exceptions=True)
        await asyncio.gather(*(rec.stop() for rec in self.recorders.values()))
        await self._async_scan()
        await self._store.async_save(self._data())

    async def async_set_paused(self, entity_id: str, paused: bool) -> None:
        """Pause or resume one camera. Kept across restarts. Pausing is the Off amount."""
        recorder = self.recorders[entity_id]
        if paused:
            self.paused.add(entity_id)
            await recorder.stop(paused=True)
        else:
            self.paused.discard(entity_id)
            self._apply_mode(entity_id)
            recorder.start()
        self._note_mode(entity_id)
        self._save()
        self._changed()

    def _load_modes(self, stored: dict[str, Any]) -> None:
        """Read the amounts. Settings stored before amounts existed mean All day."""
        self._known = set(stored.get("known", self.cameras)) & set(self.cameras)
        self.mode_history = {
            cam: [list(row) for row in rows]
            for cam, rows in stored.get("history", {}).items()
            if cam in self.cameras
        }
        self.event_log = {
            cam: [float(ts) for ts in rows]
            for cam, rows in stored.get("events", {}).items()
            if cam in self.cameras
        }
        self.event_seen = {
            cam: {str(name): float(ts) for name, ts in rows.items()}
            for cam, rows in stored.get("event_seen", {}).items()
            if cam in self.cameras
        }
        for cam in self.cameras:
            row = stored.get("modes", {}).get(cam)
            if row is not None:
                self.modes[cam] = CameraMode.from_dict(row)
            elif cam in self._known:
                self.modes[cam] = CameraMode()
            else:
                self.modes[cam] = CameraMode(
                    self.default_mode
                    if self.default_mode in (MODE_ALL_DAY, MODE_LIGHT)
                    else MODE_ALL_DAY
                )
                if self.default_mode == MODE_OFF:
                    self.paused.add(cam)
            self._known.add(cam)

    def provider_only(self, entity_id: str) -> bool:
        """Whether the camera has no stream of its own, so continuous recording is not possible."""
        recorder = self.recorders.get(entity_id)
        return recorder is not None and recorder.no_source

    def light_possible(self, entity_id: str) -> tuple[bool, str | None]:
        """Whether Light can work for a camera, and why not when it cannot."""
        mode = self.modes.get(entity_id) or CameraMode()
        if resolve_sources(self.hass, entity_id, mode.sources):
            return True, None
        return False, "no_event_source"

    def effective_mode(self, entity_id: str) -> tuple[str, str | None]:
        """What the camera really does now, with the reason when it differs from the choice."""
        if entity_id in self.paused:
            return MODE_OFF, None
        chosen = self.modes[entity_id].mode
        if self.provider_only(entity_id):
            if async_event_media_for(self.hass, entity_id) is not None:
                return MODE_LIGHT, "provider_only"
            return chosen, "no_stream"
        if chosen == MODE_LIGHT and not self.light_possible(entity_id)[0]:
            return MODE_ALL_DAY, "no_event_source"
        return chosen, None

    @callback
    def _apply_mode(self, entity_id: str) -> None:
        """Point the recorder at the right folder and file length, and watch the event sources."""
        recorder = self.recorders[entity_id]
        mode = self.modes[entity_id]
        if mode.mode == MODE_LIGHT and self.light_possible(entity_id)[0]:
            recorder.configure(self.buffer_folder(entity_id), BUFFER_SEGMENT_SECONDS)
            self.planners[entity_id] = LightPlanner(mode.pre, mode.post)
            self._watch_sources(entity_id)
        else:
            recorder.configure(self.folder(entity_id), self.segment_seconds)
            self.planners.pop(entity_id, None)
            self._unwatch_sources(entity_id)

    @callback
    def _note_mode(self, entity_id: str) -> None:
        """Remember when the amount changed, so the timeline can explain gaps."""
        now = dt_util.utcnow().timestamp()
        effective = self.effective_mode(entity_id)[0]
        rows = self.mode_history.setdefault(entity_id, [])
        if not rows or rows[-1][1] != effective:
            rows.append([now, effective])
            del rows[:-200]
            self._save()

    async def async_set_mode(
        self,
        entity_id: str,
        mode: str,
        pre: int | None = None,
        post: int | None = None,
        sources: list[str] | None | bool = False,
    ) -> None:
        """Change how much of a camera is kept. Nothing already recorded is removed."""
        if mode not in MODES:
            raise ModeError("invalid_mode", "That amount does not exist")
        recorder = self.recorders[entity_id]
        if mode == MODE_OFF:
            await self.async_set_paused(entity_id, True)
            return
        current = self.modes[entity_id]
        new = CameraMode(
            mode,
            clamp_pre(current.pre if pre is None else pre),
            clamp_post(current.post if post is None else post),
            current.sources if sources is False else sources,  # type: ignore[arg-type]
        )
        if mode == MODE_LIGHT and not resolve_sources(
            self.hass, entity_id, new.sources
        ):
            raise ModeError(
                "no_event_source",
                "This camera has nothing that can tell when something is seen",
            )
        if recorder.running:
            await recorder.stop()
        self.modes[entity_id] = new
        self.paused.discard(entity_id)
        self._apply_mode(entity_id)
        if mode == MODE_ALL_DAY:
            await self.hass.async_add_executor_job(
                _remove_tree, self.buffer_folder(entity_id)
            )
        recorder.start()
        self._note_mode(entity_id)
        self._save()
        self._changed()

    @callback
    def _watch_sources(self, entity_id: str) -> None:
        self._unwatch_sources(entity_id)
        mode = self.modes[entity_id]
        sources = resolve_sources(self.hass, entity_id, mode.sources)
        entities = [src for src in sources if src != SOURCE_INTEGRATION]
        unsubs: list[CALLBACK_TYPE] = []
        if entities:
            unsubs.append(
                async_track_state_change_event(
                    self.hass,
                    entities,
                    partial(self._source_changed, entity_id),
                )
            )
        if SOURCE_INTEGRATION in sources:
            registry_entry = er.async_get(self.hass).async_get(entity_id)
            if registry_entry is not None and registry_entry.device_id:
                device_id = registry_entry.device_id
                unsubs.append(
                    self.hass.bus.async_listen(
                        "nest_event",
                        partial(self._integration_event, entity_id, device_id),
                    )
                )
        self._source_unsubs[entity_id] = unsubs

    @callback
    def _unwatch_sources(self, entity_id: str) -> None:
        for unsub in self._source_unsubs.pop(entity_id, []):
            unsub()

    @callback
    def _source_changed(
        self, entity_id: str, event: Event[EventStateChangedData]
    ) -> None:
        planner = self.planners.get(entity_id)
        if planner is None:
            return
        source = event.data["entity_id"]
        new = event.data["new_state"]
        old = event.data["old_state"]
        now = dt_util.utcnow().timestamp()
        if source.startswith("event."):
            if state_is_known(new) and old is not None and old.state != new.state:
                self._count_clip(entity_id, planner.moment(now, now))
            return
        if state_is_active(new) and not state_is_active(old):
            self._count_clip(entity_id, planner.start(source, now, now))
        elif state_is_active(old) and not state_is_active(new):
            planner.stop(source, now)

    @callback
    def _integration_event(self, entity_id: str, device_id: str, event: Event) -> None:
        planner = self.planners.get(entity_id)
        if planner is None or event.data.get("device_id") != device_id:
            return
        now = dt_util.utcnow().timestamp()
        at = now
        parsed = dt_util.parse_datetime(str(event.data.get("timestamp", "")))
        if parsed is not None:
            at = min(parsed.timestamp(), now)
        self._count_clip(entity_id, planner.moment(at, now))

    @callback
    def _count_clip(self, entity_id: str, new_clip: bool) -> None:
        if not new_clip:
            return
        log = self.event_log.setdefault(entity_id, [])
        log.append(dt_util.utcnow().timestamp())
        del log[:-MAX_REMEMBERED_EVENTS]
        self._save()
        self._changed()

    async def _async_light_tick(self, _now: datetime | None = None) -> None:
        """Keep the buffer files someone saw something in, and drop the rest."""
        now = dt_util.utcnow().timestamp()
        for cam, planner in list(self.planners.items()):
            if cam in self.paused or cam not in self.recorders:
                continue
            await self._async_claim(cam, planner, now)
            planner.forget_before(now - PLANNER_MEMORY_SECONDS)
        for cam in self.cameras:
            self._note_mode(cam)

    async def _async_claim(self, cam: str, planner: LightPlanner, now: float) -> None:
        """Move buffer files that overlap a stretch to keep, delete the old ones nobody claimed."""
        buffer = self.buffer_folder(cam)
        keep_age = planner.pre + 2 * BUFFER_SEGMENT_SECONDS + 2 * LIGHT_TICK_SECONDS

        def _list() -> list[tuple[str, float, int]]:
            if not buffer.is_dir():
                return []
            found: list[tuple[str, float, int]] = []
            with os.scandir(buffer) as entries:
                for entry in entries:
                    if entry.is_file() and SEGMENT_NAME.match(entry.name):
                        stat = entry.stat()
                        found.append((entry.name, stat.st_mtime, stat.st_size))
            return sorted(found)

        files = await self.hass.async_add_executor_job(_list)
        keep: list[tuple[str, float, float, int]] = []
        drop: list[Path] = []
        for index, (name, mtime, size) in enumerate(files):
            start = parse_start(name)
            if start is None:
                continue
            if index == len(files) - 1 and now - mtime < BUFFER_FINISHED_SECONDS:
                continue
            first = start.timestamp()
            last = max(first + 1, mtime)
            if size and planner.claims(first, last, now):
                keep.append((name, first, last - first, size))
            elif now - last > keep_age or size == 0:
                drop.append(buffer / name)
        if not keep and not drop:
            return
        folder = self.folder(cam)

        def _move() -> None:
            folder.mkdir(parents=True, exist_ok=True)
            for name, _first, _duration, _size in keep:
                os.replace(buffer / name, folder / name)
            _unlink_all(drop)

        await self.hass.async_add_executor_job(_move)
        for name, first, duration, size in keep:
            self.segments[cam][name] = Segment(
                name,
                first,
                duration,
                size,
                local=True,
                remote=self.destination.is_local,
            )
        if keep:
            self._save()
            self._changed()

    @callback
    def _camera_for_device(self, device_id: str | None) -> str | None:
        """The recorded provider-only camera that belongs to a device."""
        if device_id is None:
            return None
        registry = er.async_get(self.hass)
        for cam in self.cameras:
            entry = registry.async_get(cam)
            if entry is not None and entry.device_id == device_id:
                return cam
        return None

    def find_record(self, cam: str, timestamp: float) -> EventRecord | None:
        """The record of the event at a time, when two reports are one event."""
        best: EventRecord | None = None
        for record in self.ledger.get(cam, []):
            gap = abs(record.start - timestamp)
            if gap <= MATCH_SECONDS and (
                best is None or gap < abs(best.start - timestamp)
            ):
                best = record
        return best

    @callback
    def _open_record(self, cam: str, timestamp: float) -> EventRecord:
        """The record for an event, made when it is first heard of."""
        record = self.find_record(cam, timestamp)
        if record is not None:
            return record
        record = EventRecord(timestamp)
        records = self.ledger.setdefault(cam, [])
        records.append(record)
        records.sort(key=lambda item: item.start)
        del records[:-MAX_RECORDS_PER_CAMERA]
        return record

    @callback
    def _give_up(self, cam: str, record: EventRecord, reason: ClipReason) -> None:
        """Record why an event has no clip. Says so once in the log and counts it."""
        if record.state is ClipState.NONE:
            return
        record.state = ClipState.NONE
        record.reason = reason
        counts = self.failures.setdefault(cam, {})
        counts[reason.value] = counts.get(reason.value, 0) + 1
        self.last_problem[cam] = (dt_util.utcnow().timestamp(), reason)
        if reason is not ClipReason.RECORDING_OFF:
            LOGGER.warning("No clip kept for an event of %s: %s", cam, reason.value)
        self._save()
        self._changed()

    @callback
    def _provider_event(self, event: Event) -> None:
        """An event the camera's integration reported: start keeping a clip for it."""
        cam = self._camera_for_device(event.data.get("device_id"))
        if cam is None or not self.provider_only(cam):
            return
        now = dt_util.utcnow().timestamp()
        at = now
        parsed = dt_util.parse_datetime(str(event.data.get("timestamp", "")))
        if parsed is not None:
            at = min(parsed.timestamp(), now)
        record = self._open_record(cam, at)
        if cam in self.paused:
            self._give_up(cam, record, ClipReason.RECORDING_OFF)
            return
        self._save()
        self._changed()
        self._start_live(cam, record)

    def _limited(self, cam: str, now: float) -> bool:
        """Whether the service asked for a wait that is not over yet."""
        recorder = self.recorders.get(cam)
        if recorder is not None and recorder.state == RecorderState.LIMITED:
            return True
        return self._limited_until.get(cam, 0) > now

    @callback
    def _note_limited(self, cam: str, now: float) -> None:
        attempt = self._limited_attempt.get(cam, 0)
        self._limited_until[cam] = now + wait_for_attempt(
            attempt, RATE_LIMIT_WAIT_SECONDS
        )
        self._limited_attempt[cam] = attempt + 1

    async def _async_event_clip_tick(self, _now: datetime | None = None) -> None:
        """Keep the clips and pictures a provider-only camera's integration holds."""
        now = dt_util.utcnow().timestamp()
        for cam in self.cameras:
            if not self.provider_only(cam):
                continue
            if cam in self.paused:
                for record in self.ledger.get(cam, []):
                    if record.state is ClipState.SAVING:
                        self._give_up(cam, record, ClipReason.RECORDING_OFF)
                continue
            if self._limited(cam, now):
                continue
            support = async_event_media_for(self.hass, cam)
            if support is None:
                continue
            try:
                events = await support.adapter.async_list()
            except Exception as err:  # noqa: BLE001
                self._list_failed(cam, classify_error(err), type(err).__name__)
                if classify_error(err) is ClipReason.RATE_LIMITED:
                    self._note_limited(cam, now)
                events = []
            else:
                self._list_problem.pop(cam, None)
            await self._async_keep_events(cam, support.adapter, events, now)

    @callback
    def _list_failed(self, cam: str, reason: ClipReason, error_name: str) -> None:
        """Say once in the log that the integration's event list could not be read."""
        if self._list_problem.get(cam) is reason:
            return
        self._list_problem[cam] = reason
        self.last_problem[cam] = (dt_util.utcnow().timestamp(), reason)
        LOGGER.warning(
            "Could not read the events of %s from its integration: %s (%s)",
            cam,
            reason.value,
            error_name,
        )
        self._changed()

    async def _async_keep_events(
        self, cam: str, adapter: Any, events: list[EventMedia], now: float
    ) -> None:
        cutoff = now - self.keep_days * 86400
        seen = self.event_seen.setdefault(cam, {})
        folder = self.folder(cam)
        changed = False
        for event in sorted(events, key=lambda item: item.timestamp):
            if event.timestamp < cutoff:
                continue
            record = self._open_record(cam, event.timestamp)
            if record.state is ClipState.SAVED or self.live_active.get(cam) is record:
                continue
            if record.state is ClipState.NONE and (
                record.reason not in RETRY_REASONS or record.attempts >= MAX_ATTEMPTS
            ):
                continue
            record.state = ClipState.SAVING
            record.reason = None
            record.attempts += 1
            try:
                fetched = await adapter.async_fetch(event.token)
            except Exception as err:  # noqa: BLE001
                reason = classify_error(err)
                if reason is ClipReason.RATE_LIMITED:
                    self._note_limited(cam, now)
                self._give_up(cam, record, reason)
                changed = True
                if reason is ClipReason.RATE_LIMITED:
                    break
                continue
            if fetched is None:
                if now - record.start > GIVE_UP_SECONDS:
                    self._give_up(cam, record, ClipReason.NO_MEDIA)
                    changed = True
                continue
            content, kind = fetched
            name = event_file_name(event.timestamp, kind)
            try:
                await self.hass.async_add_executor_job(
                    _write_file, folder, name, content
                )
            except OSError as err:
                self._give_up(cam, record, classify_error(err))
                changed = True
                continue
            self._limited_attempt.pop(cam, None)
            seen[name] = event.timestamp
            duration = float(
                EVENT_CLIP_SECONDS
                if kind is EventMediaKind.CLIP
                else EVENT_IMAGE_SECONDS
            )
            self.segments[cam][name] = Segment(
                name,
                event.timestamp,
                duration,
                len(content),
                local=True,
                remote=self.destination.is_local,
            )
            record.state = ClipState.SAVED
            record.reason = None
            record.origin = ORIGIN_SERVICE
            record.name = name
            record.kind = kind.value
            record.duration = duration
            record.size = len(content)
            self.event_log.setdefault(cam, []).append(event.timestamp)
            changed = True
        for record in self.ledger.get(cam, []):
            if (
                record.state is ClipState.SAVING
                and now - record.start > GIVE_UP_SECONDS
            ):
                self._give_up(cam, record, ClipReason.NO_MEDIA)
                changed = True
        for name in [n for n, ts in seen.items() if ts < cutoff]:
            del seen[name]
        self.ledger[cam] = [r for r in self.ledger.get(cam, []) if r.start >= cutoff]
        if changed:
            del self.event_log.setdefault(cam, [])[:-MAX_REMEMBERED_EVENTS]
            self._save()
            self._changed()

    def live_state(self, cam: str) -> tuple[bool, str | None]:
        """Whether live clips are on for a camera, and why not when they are off."""
        mode = self.modes.get(cam) or CameraMode()
        if not self.provider_only(cam):
            return False, "not_needed"
        if async_go2rtc_access(self.hass) is None:
            return False, "no_go2rtc"
        if mode.live is False:
            return False, "switched_off"
        return True, None

    def live_budget_left(self, cam: str, now: float) -> int:
        """How many more live clips the camera may start in this hour."""
        mode = self.modes.get(cam) or CameraMode()
        recent = [ts for ts in self.live_starts.get(cam, []) if ts > now - 3600]
        self.live_starts[cam] = recent
        return max(0, mode.clips_per_hour - len(recent))

    @callback
    def _start_live(self, cam: str, record: EventRecord) -> None:
        """Record the camera's live video for an event, if allowed right now."""
        now = dt_util.utcnow().timestamp()
        if (
            not self.live_state(cam)[0]
            or cam in self.live_active
            or self._limited(cam, now)
            or self.live_budget_left(cam, now) <= 0
            or record.state is not ClipState.SAVING
        ):
            return
        self.live_active[cam] = record
        self.live_starts.setdefault(cam, []).append(now)
        task = self.entry.async_create_background_task(
            self.hass, self._async_live_clip(cam, record), f"{DOMAIN} live {cam}"
        )
        self._live_tasks.add(task)
        task.add_done_callback(self._live_tasks.discard)

    async def _async_live_clip(self, cam: str, record: EventRecord) -> None:
        """One live clip: one provider session, one temporary go2rtc stream, one file."""
        mode = self.modes.get(cam) or CameraMode()
        broker = broker_for(self.hass)
        session = broker.mint(cam)
        access = async_go2rtc_access(self.hass)
        source = whep_source(self.hass, session.token)
        stream = f"camera_recording_{session.token[:12]}"
        name = event_file_name(record.start, EventMediaKind.CLIP)
        folder = self.folder(cam)
        part = folder / f".{name}.part"
        reason: ClipReason | None = None
        try:
            if access is None or source is None:
                reason = ClipReason.UNSUPPORTED
            else:
                await self.hass.async_add_executor_job(
                    lambda: folder.mkdir(parents=True, exist_ok=True)
                )
                await access.add(stream, source)
                ok = await async_record_clip(
                    get_ffmpeg_manager(self.hass).binary,
                    f"{access.rtsp_base}/{stream}",
                    part,
                    mode.clip_seconds,
                )
                size = (
                    await self.hass.async_add_executor_job(_file_size, part)
                    if ok
                    else 0
                )
                if size:
                    duration = await self.hass.async_add_executor_job(
                        probe_duration, part
                    )
                    await self.hass.async_add_executor_job(part.replace, folder / name)
                    self._live_saved(cam, record, name, size, duration, mode)
                else:
                    reason = session.failure or (
                        ClipReason.TIMED_OUT if session.answered else ClipReason.FAILED
                    )
        except asyncio.CancelledError:
            raise
        except Exception as err:  # noqa: BLE001
            reason = classify_error(err)
        finally:
            if access is not None:
                try:
                    await access.remove(stream)
                except Exception:  # noqa: BLE001
                    LOGGER.debug("Could not remove the temporary stream of %s", cam)
            component = self.hass.data.get(CAMERA_DATA)
            camera = component.get_entity(cam) if component else None
            if camera is not None and session.camera_session:
                camera.close_webrtc_session(session.camera_session)
            broker.discard(session.token)
            await self.hass.async_add_executor_job(_remove_file, part)
            self.live_active.pop(cam, None)
        if reason is not None:
            if reason is ClipReason.RATE_LIMITED:
                self._note_limited(cam, dt_util.utcnow().timestamp())
            self._give_up(cam, record, reason)

    @callback
    def _live_saved(
        self,
        cam: str,
        record: EventRecord,
        name: str,
        size: int,
        duration: float | None,
        mode: CameraMode,
    ) -> None:
        seconds = duration or float(mode.clip_seconds)
        self.segments[cam][name] = Segment(
            name,
            record.start,
            seconds,
            size,
            local=True,
            remote=self.destination.is_local,
        )
        self.event_seen.setdefault(cam, {})[name] = record.start
        record.state = ClipState.SAVED
        record.reason = None
        record.origin = ORIGIN_HOME
        record.name = name
        record.kind = EventMediaKind.CLIP.value
        record.duration = seconds
        record.size = size
        self._limited_attempt.pop(cam, None)
        self.event_log.setdefault(cam, []).append(record.start)
        del self.event_log[cam][:-MAX_REMEMBERED_EVENTS]
        self._save()
        self._changed()

    async def async_set_live_options(
        self,
        entity_id: str,
        *,
        change_live: bool = False,
        live: bool | None = None,
        clip_seconds: int | None = None,
        clips_per_hour: int | None = None,
    ) -> None:
        """Change the live clip switch, length and hourly budget of one camera."""
        mode = self.modes[entity_id]
        if change_live:
            mode.live = live
        if clip_seconds is not None:
            mode.clip_seconds = clamp_clip_seconds(clip_seconds)
        if clips_per_hour is not None:
            mode.clips_per_hour = clamp_clips_per_hour(clips_per_hour)
        self._save()
        self._changed()

    def events_between(
        self, entity_id: str, start: float, end: float
    ) -> list[dict[str, Any]]:
        """What became of each event of a camera in a time window, oldest first."""
        now = dt_util.utcnow().timestamp()
        entry_id = self.entry.entry_id
        return [
            record.as_dict(entry_id, now)
            for record in self.ledger.get(entity_id, [])
            if start <= record.start <= end
        ]

    def _data(self) -> dict[str, Any]:
        return {
            "paused": sorted(self.paused),
            "known": sorted(self._known),
            "modes": {cam: mode.as_dict() for cam, mode in self.modes.items()},
            "history": self.mode_history,
            "events": self.event_log,
            "event_seen": self.event_seen,
            "live_starts": self.live_starts,
            "ledger": {
                cam: [record.as_list() for record in records]
                for cam, records in self.ledger.items()
            },
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
                is_event = EVENT_NAME_MARK in name
                newest = index == len(files) - 1 and not is_event
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
                        (
                            float(
                                EVENT_CLIP_SECONDS
                                if name.endswith(SEGMENT_SUFFIX)
                                else EVENT_IMAGE_SECONDS
                            )
                            if is_event
                            else max(1.0, mtime - start.timestamp())
                        ),
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
        aged = {(cam, seg.name) for cam, seg in doomed}
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
            if (cam, seg.name) in aged:
                continue
            for record in self.ledger.get(cam, []):
                if record.name == seg.name and record.state is ClipState.SAVED:
                    record.state = ClipState.NONE
                    record.reason = ClipReason.REMOVED
                    record.name = None
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

    def camera_summary(self, entity_id: str) -> dict[str, Any] | None:
        """The part of a camera's status any user who can see the camera may read."""
        found = next(
            (row for row in self.status()["cameras"] if row["entity_id"] == entity_id),
            None,
        )
        if found is None:
            return None
        keys = (
            "mode",
            "effective_mode",
            "mode_reason",
            "state",
            "provider_only",
            "all_day_available",
            "all_day_reason",
            "kept_today",
            "bytes_today",
            "saving",
            "last_clip",
            "last_problem",
            "event_clips",
            "live_enabled",
            "live_reason",
            "clip_seconds",
            "clips_per_hour",
        )
        return {key: found[key] for key in keys} | {"entry_id": self.entry.entry_id}

    def status(self) -> dict[str, Any]:
        """Everything the status page shows for this destination."""
        cameras = []
        for cam in self.cameras:
            segs = self.segments.get(cam, {})
            recorder = self.recorders.get(cam)
            newest = max(segs.values(), key=lambda s: s.start, default=None)
            oldest = min(segs.values(), key=lambda s: s.start, default=None)
            midnight = (
                dt_util.now()
                .replace(hour=0, minute=0, second=0, microsecond=0)
                .timestamp()
            )
            mode = self.modes.get(cam) or CameraMode()
            effective, reason = (
                self.effective_mode(cam) if cam in self.modes else (MODE_ALL_DAY, None)
            )
            light_ok, light_reason = self.light_possible(cam)
            planner = self.planners.get(cam)
            capped = planner.cap_hit_at if planner else None
            cameras.append(
                {
                    "mode": mode.mode,
                    "effective_mode": effective,
                    "mode_reason": reason,
                    "pre": mode.pre,
                    "post": mode.post,
                    "max_clip": MAX_CLIP_SECONDS,
                    "sources": resolve_sources(self.hass, cam, mode.sources),
                    "sources_chosen": mode.sources,
                    "source_options": [
                        {"source": opt.source, "kind": opt.kind}
                        for opt in source_options(self.hass, cam)
                    ],
                    "light_possible": light_ok or self.provider_only(cam),
                    "light_reason": None if self.provider_only(cam) else light_reason,
                    "provider_only": self.provider_only(cam),
                    "continuous_possible": not self.provider_only(cam),
                    "cap_hit": capped
                    if capped and capped > dt_util.utcnow().timestamp() - 86400
                    else None,
                    "events_today": sum(
                        1 for ts in self.event_log.get(cam, []) if ts >= midnight
                    ),
                    "bytes_today": sum(
                        s.size for s in segs.values() if s.start >= midnight
                    ),
                    "event_clips": sum(
                        1 for s in segs.values() if s.kind != "recording"
                    ),
                    "all_day_available": not self.provider_only(cam),
                    "all_day_reason": "provider_only"
                    if self.provider_only(cam)
                    else None,
                    "kept_today": sum(
                        1
                        for r in self.ledger.get(cam, [])
                        if r.state is ClipState.SAVED and r.start >= midnight
                    ),
                    "saving": sum(
                        1
                        for r in self.ledger.get(cam, [])
                        if r.state is ClipState.SAVING
                    ),
                    "last_clip": max(
                        (
                            r.start
                            for r in self.ledger.get(cam, [])
                            if r.state is ClipState.SAVED
                        ),
                        default=None,
                    ),
                    "last_problem": (
                        {
                            "at": self.last_problem[cam][0],
                            "reason": self.last_problem[cam][1].value,
                        }
                        if cam in self.last_problem
                        else None
                    ),
                    "failures": dict(self.failures.get(cam, {})),
                    "live_enabled": self.live_state(cam)[0],
                    "live_reason": self.live_state(cam)[1],
                    "live_choice": mode.live,
                    "clip_seconds": mode.clip_seconds,
                    "clips_per_hour": mode.clips_per_hour,
                    "live_left": self.live_budget_left(
                        cam, dt_util.utcnow().timestamp()
                    ),
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
            "default_mode": self.default_mode,
            "max_bytes": self.max_bytes,
            "segment_seconds": self.segment_seconds,
            "used_bytes": sum(c["bytes"] for c in cameras),
            "free_bytes": self.free_bytes,
            "last_copy": self.last_copy.isoformat() if self.last_copy else None,
            "error": self.last_error,
            "cameras": cameras,
        }


def _file_size(path: Path) -> int:
    try:
        return path.stat().st_size
    except OSError:
        return 0


def _remove_file(path: Path) -> None:
    path.unlink(missing_ok=True)


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


def _remove_tree(path: Path) -> None:
    shutil.rmtree(path, ignore_errors=True)


def _write_file(folder: Path, name: str, content: bytes) -> None:
    """Write a file whole or not at all, so a half-written one is never indexed."""
    folder.mkdir(parents=True, exist_ok=True)
    partial = folder / f".{name}.part"
    partial.write_bytes(content)
    partial.replace(folder / name)
