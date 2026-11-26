"""Keep what is watched: every live view and every snapshot of a recorded camera.

A camera that streams only through its service is watched through the home:
the bundled go2rtc program pulls the camera once through the one-time loopback
handshake address, the browser watches from go2rtc, and ffmpeg keeps the same
stream. So watching and keeping cost one live view from the camera service, and
two browsers watching still cost one. A camera with a stream address is kept
from that address while someone watches it, unless it is already recorded all
day, in which case the row points at that recording instead.
"""

import asyncio
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
import time
from typing import Any

from homeassistant.components.camera import DATA_COMPONENT as CAMERA_DATA
from homeassistant.components.ffmpeg import get_ffmpeg_manager
from homeassistant.core import CALLBACK_TYPE, HomeAssistant, callback
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.helpers.storage import Store
from homeassistant.util.hass_dict import HassKey

from .const import DOMAIN, LIVE_OFFER_TIMEOUT_SECONDS, LOGGER, SEGMENT_TIME_FORMAT
from .events import ClipReason, classify_error
from .live import (
    LiveSession,
    async_go2rtc_access,
    broker_for,
    clip_command,
    probe_duration,
    whep_source,
)
from .manager import RecordingManager
from .problem_log import mask_secrets
from .recorder import RecorderState

KIND_LIVE_VIEW = "live_view"
KIND_SNAPSHOT = "snapshot"
ORIGIN_PERSON = "person"
ORIGIN_DASHBOARD = "dashboard"
ORIGIN_AUTOMATION = "automation"
ORIGIN_OTHER = "other"
STATE_SAVED = "saved"
STATE_SAVING = "saving"
STATE_NONE = "none"
POINTS_AT_RECORDING = "recording"

ROUTE_HOME = "home"
ROUTE_CAMERA = "camera"

DEFAULT_LONGEST_MINUTES = 10
MIN_LONGEST_MINUTES = 1
MAX_LONGEST_MINUTES = 60
DEFAULT_SNAPSHOT_SECONDS = 60
MIN_SNAPSHOT_SECONDS = 10
MAX_SNAPSHOT_SECONDS = 600
# How long the shared live view stays open after the last viewer leaves.
LINGER_SECONDS = 20
# A part shorter than this is not worth keeping.
MIN_PART_SECONDS = 2.0
STOP_GRACE_SECONDS = 8
ANSWER_POLL_SECONDS = 0.2
STALL_SECONDS = 8
MAX_ROWS_PER_CAMERA = 2000
RETENTION_SECONDS = 600
STORAGE_VERSION = 1
WATCHED_FOLDER = "watched"
STREAM_PREFIX = "camera_recording_watch_"


def clamp_longest(value: Any) -> int:
    """The longest kept live view in minutes, inside the allowed range."""
    return max(MIN_LONGEST_MINUTES, min(MAX_LONGEST_MINUTES, int(value)))


def clamp_snapshot_seconds(value: Any) -> int:
    """The repeat limit for snapshots in seconds, inside the allowed range."""
    return max(MIN_SNAPSHOT_SECONDS, min(MAX_SNAPSHOT_SECONDS, int(value)))


def watched_file_name(timestamp: float, kind: str) -> str:
    """A file name for a kept live view or snapshot, by its time in UTC."""
    moment = datetime.fromtimestamp(timestamp, UTC)
    stamp = moment.strftime(SEGMENT_TIME_FORMAT)
    millis = f"{moment.microsecond // 1000:03d}"
    if kind == KIND_LIVE_VIEW:
        return f"{stamp}-{millis}-live.mp4"
    return f"{stamp}-{millis}-snapshot.jpg"


def is_watched_name(name: str) -> bool:
    """Whether a name is one this module writes, so nothing else can be served."""
    if "/" in name or "\\" in name or name.startswith("."):
        return False
    return name.endswith(("-live.mp4", "-snapshot.jpg")) and len(name) <= 40


@dataclass(slots=True)
class WatchSettings:
    """The three switches and two numbers of one camera."""

    auto_start: bool = True
    keep_live: bool = True
    keep_snapshots: bool = True
    longest_minutes: int = DEFAULT_LONGEST_MINUTES
    snapshot_seconds: int = DEFAULT_SNAPSHOT_SECONDS

    def as_dict(self) -> dict[str, Any]:
        """The stored and sent form."""
        return {
            "auto_start": self.auto_start,
            "keep_live": self.keep_live,
            "keep_snapshots": self.keep_snapshots,
            "longest_minutes": self.longest_minutes,
            "snapshot_seconds": self.snapshot_seconds,
        }

    @classmethod
    def from_dict(cls, data: Any) -> WatchSettings:
        """Read the stored form, with defaults for anything missing or wrong."""
        if not isinstance(data, dict):
            return cls()

        def flag(key: str) -> bool:
            value = data.get(key, True)
            return value if isinstance(value, bool) else True

        try:
            longest = clamp_longest(data.get("longest_minutes", 10))
        except TypeError, ValueError:
            longest = DEFAULT_LONGEST_MINUTES
        try:
            repeat = clamp_snapshot_seconds(data.get("snapshot_seconds", 60))
        except TypeError, ValueError:
            repeat = DEFAULT_SNAPSHOT_SECONDS
        return cls(
            flag("auto_start"),
            flag("keep_live"),
            flag("keep_snapshots"),
            longest,
            repeat,
        )


@dataclass(slots=True)
class WatchedRecord:
    """One live view or snapshot of one camera, and what was kept of it."""

    start: float
    kind: str
    state: str = STATE_SAVING
    origin: str | None = None
    reason: str | None = None
    name: str | None = None
    duration: float = 0
    size: int = 0
    points_at: str | None = None

    def as_list(self) -> list[Any]:
        """Compact stored form."""
        return [
            self.start,
            self.kind,
            self.state,
            self.origin,
            self.reason,
            self.name,
            self.duration,
            self.size,
            self.points_at,
        ]

    @classmethod
    def from_list(cls, row: list[Any]) -> WatchedRecord:
        """Read the stored form. A row still being kept at a stop was cut off."""
        record = cls(
            float(row[0]),
            str(row[1]),
            str(row[2]),
            row[3],
            row[4],
            row[5],
            float(row[6]),
            int(row[7]),
            row[8] if len(row) > 8 else None,
        )
        if record.state == STATE_SAVING:
            record.state = STATE_NONE
            record.reason = ClipReason.STREAM_ENDED.value
        return record

    def as_dict(self, entry_id: str, now: float) -> dict[str, Any]:
        """The form the frontend reads."""
        return {
            "start": self.start,
            "kind": self.kind,
            "state": self.state,
            "origin": self.origin,
            "reason": self.reason,
            "name": self.name,
            "duration": (
                max(0.0, round(now - self.start, 1))
                if self.state == STATE_SAVING
                else self.duration
            ),
            "size": self.size,
            "points_at": self.points_at,
            "entry_id": entry_id,
        }


class WatchRefused(Exception):
    """A live view cannot be opened now, with a code and, for a wait, its end."""

    def __init__(self, code: str, retry_at: float | None = None) -> None:
        """Keep the code and the end of the wait."""
        super().__init__(code)
        self.code = code
        self.retry_at = retry_at


@dataclass(slots=True)
class LiveWatch:
    """The one shared live view of one camera and who is watching it."""

    cam: str
    route: str
    viewers: set[str] = field(default_factory=set)
    stream: str | None = None
    session: LiveSession | None = None
    task: asyncio.Task[None] | None = None
    linger: asyncio.TimerHandle | None = None
    ready: asyncio.Future[None] | None = None
    stop: asyncio.Event = field(default_factory=asyncio.Event)
    # Set while nobody watches: the part being kept ends, the session lingers.
    idle: asyncio.Event = field(default_factory=asyncio.Event)
    watching: asyncio.Event = field(default_factory=asyncio.Event)
    keeping: WatchedRecord | None = None
    listeners: list[Callable[[], None]] = field(default_factory=list)
    ended: bool = False


async def _run_until(
    command: list[str], stop: asyncio.Event, limit: float | None
) -> bool:
    """Run ffmpeg until it ends, the stop is set or the limit passes. True when it ended by itself."""
    process = await asyncio.create_subprocess_exec(
        *command,
        stdin=asyncio.subprocess.DEVNULL,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
    )
    waiter = asyncio.ensure_future(process.wait())
    stopper = asyncio.ensure_future(stop.wait())
    try:
        done, _pending = await asyncio.wait(
            {waiter, stopper}, timeout=limit, return_when=asyncio.FIRST_COMPLETED
        )
    except asyncio.CancelledError:
        if process.returncode is None:
            process.kill()
            await process.wait()
        raise
    finally:
        stopper.cancel()
    if waiter in done:
        return True
    process.terminate()
    try:
        await asyncio.wait_for(asyncio.shield(waiter), STOP_GRACE_SECONDS)
    except TimeoutError:
        process.kill()
        await waiter
    return False


def hold_command(binary: str, source: str) -> list[str]:
    """An ffmpeg command that reads a stream and throws it away, so go2rtc keeps pulling it."""
    return [
        binary,
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-rtsp_transport",
        "tcp",
        "-timeout",
        str(STALL_SECONDS * 1_000_000),
        "-i",
        source,
        "-map",
        "0:v:0",
        "-c",
        "copy",
        "-f",
        "null",
        "-",
    ]


class WatchedKeeper:
    """Live views and snapshots kept for the cameras of one recording entry."""

    def __init__(self, hass: HomeAssistant, manager: RecordingManager) -> None:
        """Nothing runs until async_start."""
        self.hass = hass
        self.manager = manager
        self.settings: dict[str, WatchSettings] = {}
        self.rows: dict[str, list[WatchedRecord]] = {}
        self.watches: dict[str, LiveWatch] = {}
        self._store: Store[dict[str, Any]] = Store(
            hass, STORAGE_VERSION, f"{DOMAIN}.watched.{manager.entry.entry_id}"
        )
        self._unsubs: list[CALLBACK_TYPE] = []
        self._listeners: list[Callable[[], None]] = []
        self.snapshots: Any = None

    @property
    def entry_id(self) -> str:
        """The recording entry this keeper belongs to."""
        return self.manager.entry.entry_id

    def folder(self, cam: str) -> Path:
        """Where kept live views and snapshots of a camera are written."""
        return self.manager.folder(cam) / WATCHED_FOLDER

    def settings_for(self, cam: str) -> WatchSettings:
        """The settings of a camera, defaults when none were chosen."""
        return self.settings.get(cam) or WatchSettings()

    async def async_start(self) -> None:
        """Load what was kept and start the age limit."""
        stored = await self._store.async_load() or {}
        for cam, data in stored.get("settings", {}).items():
            if cam in self.manager.cameras:
                self.settings[cam] = WatchSettings.from_dict(data)
        for cam, rows in stored.get("rows", {}).items():
            if cam in self.manager.cameras:
                self.rows[cam] = [WatchedRecord.from_list(row) for row in rows]
        self._unsubs.append(
            async_track_time_interval(
                self.hass,
                self._async_retention_tick,
                _seconds(RETENTION_SECONDS),
                name=f"{DOMAIN} watched limits",
                cancel_on_shutdown=True,
            )
        )

    async def async_stop(self) -> None:
        """Close every live view, finishing what is being kept, and save."""
        for unsub in self._unsubs:
            unsub()
        self._unsubs.clear()
        for watch in list(self.watches.values()):
            self._end(watch)
        tasks = [w.task for w in self.watches.values() if w.task is not None]
        await asyncio.gather(*tasks, return_exceptions=True)
        await self._store.async_save(self._data())

    @callback
    def async_add_listener(self, listener: Callable[[], None]) -> CALLBACK_TYPE:
        """Call listener whenever a row or a live view changes."""
        self._listeners.append(listener)
        return lambda: self._listeners.remove(listener)

    @callback
    def _changed(self, watch: LiveWatch | None = None) -> None:
        for listener in list(self._listeners):
            listener()
        if watch is not None:
            for listener in list(watch.listeners):
                listener()

    def _data(self) -> dict[str, Any]:
        return {
            "settings": {cam: s.as_dict() for cam, s in self.settings.items()},
            "rows": {
                cam: [row.as_list() for row in rows[-MAX_ROWS_PER_CAMERA:]]
                for cam, rows in self.rows.items()
            },
        }

    @callback
    def _save(self) -> None:
        self._store.async_delay_save(self._data, 5)

    @callback
    def add_row(self, cam: str, record: WatchedRecord) -> None:
        """Add a row in time order and keep the list bounded."""
        rows = self.rows.setdefault(cam, [])
        rows.append(record)
        rows.sort(key=lambda row: row.start)
        del rows[:-MAX_ROWS_PER_CAMERA]
        self._save()
        self._changed()

    @callback
    def async_set_settings(self, cam: str, **changes: Any) -> WatchSettings:
        """Change some settings of one camera."""
        current = self.settings_for(cam)
        data = current.as_dict()
        data.update({key: value for key, value in changes.items() if value is not None})
        self.settings[cam] = WatchSettings.from_dict(data)
        self._save()
        self._changed()
        return self.settings[cam]

    def rows_between(self, cam: str, start: float, end: float) -> list[dict[str, Any]]:
        """Rows of a camera inside a time window, for the frontend."""
        now = time.time()
        return [
            row.as_dict(self.entry_id, now)
            for row in self.rows.get(cam, [])
            if start <= row.start < end
            or (row.start < start and row.start + row.duration > start)
        ]

    def kept_today(self, cam: str) -> dict[str, int]:
        """How many live views and snapshots were kept today, and their size."""
        midnight = (
            datetime.now()
            .astimezone()
            .replace(hour=0, minute=0, second=0, microsecond=0)
            .timestamp()
        )
        live = snapshots = size = 0
        for row in self.rows.get(cam, []):
            if row.start < midnight or row.state != STATE_SAVED:
                continue
            if row.kind == KIND_LIVE_VIEW:
                live += 1
            else:
                snapshots += 1
            size += row.size
        return {"live_views": live, "snapshots": snapshots, "size": size}

    def route(self, cam: str) -> str:
        """Whether live video of this camera goes through the home or straight to the camera."""
        return ROUTE_HOME if self.manager.provider_only(cam) else ROUTE_CAMERA

    def live_state(self, cam: str) -> dict[str, Any]:
        """What the picture of a camera shows about its live view."""
        watch = self.watches.get(cam)
        until = self.manager._limited_until.get(cam, 0)  # noqa: SLF001
        return {
            "route": self.route(cam),
            "viewers": len(watch.viewers) if watch else 0,
            "keeping_since": (
                watch.keeping.start
                if watch is not None
                and watch.keeping is not None
                and watch.keeping.state == STATE_SAVING
                else None
            ),
            "retry_at": until if until > time.time() else None,
        }

    def plain_recording(self, cam: str) -> bool:
        """Whether the camera is already being recorded all day right now."""
        recorder = self.manager.recorders.get(cam)
        return (
            recorder is not None
            and recorder.state == RecorderState.RECORDING
            and cam not in self.manager.paused
        )

    async def async_open(self, cam: str, viewer: str) -> LiveWatch:
        """A viewer starts watching. Opens the shared live view when it is the first."""
        watch = self.watches.get(cam)
        if watch is not None and not watch.ended:
            if watch.linger is not None:
                watch.linger.cancel()
                watch.linger = None
            watch.viewers.add(viewer)
            watch.idle.clear()
            watch.watching.set()
            if watch.ready is not None:
                await asyncio.shield(watch.ready)
            self._changed(watch)
            return watch
        now = time.time()
        if self.manager._limited(cam, now):  # noqa: SLF001
            raise WatchRefused(
                ClipReason.RATE_LIMITED.value,
                self.manager._limited_until.get(cam),  # noqa: SLF001
            )
        route = self.route(cam)
        if route == ROUTE_HOME and cam in self.manager.live_active:
            raise WatchRefused(ClipReason.CAMERA_BUSY.value)
        watch = LiveWatch(cam, route, {viewer})
        watch.watching.set()
        watch.ready = self.hass.loop.create_future()
        self.watches[cam] = watch
        watch.task = self.manager.entry.async_create_background_task(
            self.hass, self._async_run(watch), f"{DOMAIN} watched {cam}"
        )
        try:
            await asyncio.shield(watch.ready)
        except WatchRefused:
            if self.watches.get(cam) is watch:
                del self.watches[cam]
            raise
        self._changed(watch)
        return watch

    @callback
    def close(self, cam: str, viewer: str) -> None:
        """A viewer stops watching. The live view stays open a little longer."""
        watch = self.watches.get(cam)
        if watch is None or viewer not in watch.viewers:
            return
        watch.viewers.discard(viewer)
        if not watch.viewers:
            watch.watching.clear()
            watch.idle.set()
        if not watch.viewers and not watch.ended and watch.linger is None:
            watch.linger = self.hass.loop.call_later(LINGER_SECONDS, self._end, watch)
        self._changed(watch)

    @callback
    def _end(self, watch: LiveWatch) -> None:
        if watch.linger is not None:
            watch.linger.cancel()
            watch.linger = None
        watch.ended = True
        watch.idle.set()
        watch.stop.set()
        watch.watching.set()

    async def _async_run(self, watch: LiveWatch) -> None:
        """Open the camera once, keep it in parts while watched, then close it."""
        cam = watch.cam
        settings = self.settings_for(cam)
        access = None
        source: str | None = None
        broker = broker_for(self.hass)
        reason: ClipReason | None = None
        holder: asyncio.Task[bool] | None = None
        try:
            if watch.route == ROUTE_HOME:
                access = async_go2rtc_access(self.hass)
                session = broker.mint(cam)
                watch.session = session
                whep = whep_source(self.hass, session.token)
                if access is None or whep is None:
                    raise WatchRefused("no_go2rtc")  # noqa: TRY301
                watch.stream = f"{STREAM_PREFIX}{session.token[:12]}"
                await access.add(watch.stream, whep)
                source = f"{access.rtsp_base}/{watch.stream}"
                holder = asyncio.ensure_future(
                    _run_until(hold_command(self._binary(), source), watch.stop, None)
                )
                reason = await self._async_wait_for_answer(watch, holder)
                if reason is not None:
                    raise WatchRefused(  # noqa: TRY301
                        reason.value, self._retry_at(cam, reason)
                    )
            else:
                camera = self._camera(cam)
                source = await camera.stream_source() if camera else None
            _settle(watch.ready, None)
            self._changed(watch)
            if self.plain_recording(cam):
                await self._async_point_at_recording(watch)
            elif not settings.keep_live:
                await watch.stop.wait()
            elif source is None:
                LOGGER.warning(
                    "No live clip of %s can be kept: the camera gave no stream address",
                    cam,
                )
                self._row_not_kept(cam, ClipReason.UNSUPPORTED)
                await watch.stop.wait()
            else:
                await self._async_keep_parts(watch, source, settings, holder)
        except WatchRefused as err:
            _settle(watch.ready, err)
            if err.code == ClipReason.RATE_LIMITED.value:
                self._row_not_kept(cam, ClipReason.RATE_LIMITED)
        except asyncio.CancelledError:
            raise
        except Exception as err:  # noqa: BLE001
            LOGGER.warning(
                "A watched live view of %s ended: %s (%s)",
                cam,
                type(err).__name__,
                classify_error(err).value,
            )
            LOGGER.debug("Watched live view of %s: %s", cam, mask_secrets(str(err)))
            _settle(watch.ready, WatchRefused(classify_error(err).value))
        finally:
            watch.ended = True
            watch.stop.set()
            if holder is not None:
                await asyncio.gather(holder, return_exceptions=True)
            await self._async_close_route(watch, access)
            if self.watches.get(cam) is watch:
                del self.watches[cam]
            self._changed(watch)

    def _binary(self) -> str:
        return get_ffmpeg_manager(self.hass).binary

    def _camera(self, cam: str) -> Any:
        component = self.hass.data.get(CAMERA_DATA)
        return component.get_entity(cam) if component else None

    def _retry_at(self, cam: str, reason: ClipReason) -> float | None:
        if reason is not ClipReason.RATE_LIMITED:
            return None
        self.manager._note_limited(cam, time.time())  # noqa: SLF001
        return self.manager._limited_until.get(cam)  # noqa: SLF001

    async def _async_wait_for_answer(
        self, watch: LiveWatch, holder: asyncio.Task[bool]
    ) -> ClipReason | None:
        """Wait until the camera service answered the one offer, or say why it did not."""
        session = watch.session
        deadline = time.monotonic() + LIVE_OFFER_TIMEOUT_SECONDS + 5
        while time.monotonic() < deadline:
            if session is not None and session.failure is not None:
                return session.failure
            if session is not None and session.answered:
                return None
            if holder.done():
                return (session.failure if session else None) or ClipReason.FAILED
            await asyncio.sleep(ANSWER_POLL_SECONDS)
        return ClipReason.TIMED_OUT

    async def _async_point_at_recording(self, watch: LiveWatch) -> None:
        """A camera recorded all day: the row points at that recording."""
        while not watch.stop.is_set():
            await watch.watching.wait()
            if watch.stop.is_set():
                break
            record = WatchedRecord(
                time.time(),
                KIND_LIVE_VIEW,
                STATE_SAVING,
                ORIGIN_PERSON,
                points_at=POINTS_AT_RECORDING,
            )
            self.add_row(watch.cam, record)
            await watch.idle.wait()
            record.state = STATE_SAVED
            record.duration = round(time.time() - record.start, 1)
            self._save()
            self._changed(watch)

    async def _async_keep_parts(
        self,
        watch: LiveWatch,
        source: str,
        settings: WatchSettings,
        holder: asyncio.Task[bool] | None,
    ) -> None:
        """Keep the live view in parts of at most the longest length, until it closes."""
        folder = self.folder(watch.cam)
        await self.hass.async_add_executor_job(
            lambda: folder.mkdir(parents=True, exist_ok=True)
        )
        longest = settings.longest_minutes * 60
        while not watch.stop.is_set():
            if holder is not None and holder.done():
                break
            if not watch.watching.is_set():
                await watch.watching.wait()
                continue
            record = WatchedRecord(time.time(), KIND_LIVE_VIEW, origin=ORIGIN_PERSON)
            name = watched_file_name(record.start, KIND_LIVE_VIEW)
            part = folder / f".{name}.part"
            watch.keeping = record
            self.add_row(watch.cam, record)
            self._changed(watch)
            ended_alone = await _run_until(
                clip_command(self._binary(), source, part, longest),
                watch.idle,
                longest + LIVE_OFFER_TIMEOUT_SECONDS + 30,
            )
            await self._async_finish_part(watch.cam, record, part, folder / name)
            watch.keeping = None
            self._changed(watch)
            if ended_alone and record.duration < longest - 5:
                # The video stopped coming before the longest length: the view is over.
                break

    async def _async_finish_part(
        self, cam: str, record: WatchedRecord, part: Path, final: Path
    ) -> None:
        size = await self.hass.async_add_executor_job(_file_size, part)
        duration = (
            await self.hass.async_add_executor_job(probe_duration, part)
            if size
            else None
        )
        if size and (duration is None or duration >= MIN_PART_SECONDS):
            await self.hass.async_add_executor_job(part.replace, final)
            record.state = STATE_SAVED
            record.name = final.name
            record.size = size
            record.duration = round(duration or time.time() - record.start, 2)
        else:
            await self.hass.async_add_executor_job(_remove_file, part)
            record.state = STATE_NONE
            record.reason = (
                ClipReason.STREAM_ENDED.value if size else ClipReason.FAILED.value
            )
            record.duration = 0
        self._save()

    @callback
    def _row_not_kept(self, cam: str, reason: ClipReason) -> None:
        self.add_row(
            cam,
            WatchedRecord(
                time.time(),
                KIND_LIVE_VIEW,
                STATE_NONE,
                ORIGIN_PERSON,
                reason.value,
            ),
        )

    async def _async_close_route(self, watch: LiveWatch, access: Any) -> None:
        """Remove the temporary go2rtc stream and close the one camera session."""
        if access is not None and watch.stream is not None:
            try:
                await access.remove(watch.stream)
            except Exception as err:  # noqa: BLE001
                LOGGER.warning(
                    "Could not remove the watched stream of %s: %s (%s)",
                    watch.cam,
                    type(err).__name__,
                    classify_error(err).value,
                )
                LOGGER.debug(
                    "Watched stream removal for %s: %s",
                    watch.cam,
                    mask_secrets(str(err)),
                )
        session = watch.session
        if session is not None:
            camera = self._camera(watch.cam)
            if camera is not None and session.camera_session:
                camera.close_webrtc_session(session.camera_session)
            broker_for(self.hass).discard(session.token)

    async def _async_retention_tick(self, _now: datetime | None = None) -> None:
        await self.async_apply_limits()

    async def async_apply_limits(self) -> None:
        """Remove kept live views and snapshots older than the entry's age limit."""
        cutoff = time.time() - self.manager.keep_days * 86400
        doomed: list[Path] = []
        for cam, rows in self.rows.items():
            keep: list[WatchedRecord] = []
            for row in rows:
                if row.start + row.duration < cutoff and row.state != STATE_SAVING:
                    if row.name:
                        doomed.append(self.folder(cam) / row.name)
                    continue
                keep.append(row)
            rows[:] = keep
        if doomed:
            await self.hass.async_add_executor_job(_unlink_all, doomed)
            self._save()
            self._changed()

    def playable_path(self, cam: str, name: str) -> Path | None:
        """The file of a kept row, only for names this keeper wrote."""
        if not is_watched_name(name):
            return None
        if not any(row.name == name for row in self.rows.get(cam, [])):
            return None
        return self.folder(cam) / name


def _settle(future: asyncio.Future[None] | None, error: Exception | None) -> None:
    if future is None or future.done():
        return
    if error is None:
        future.set_result(None)
    else:
        future.set_exception(error)
        # A refusal nobody waits for any more is not an unhandled error.
        future.exception()


def _seconds(value: int) -> Any:
    from datetime import timedelta  # noqa: PLC0415

    return timedelta(seconds=value)


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


WATCHED_KEEPERS: HassKey[dict[str, WatchedKeeper]] = HassKey("camera_recording_watched")


def keepers(hass: HomeAssistant) -> dict[str, WatchedKeeper]:
    """Every running keeper, by entry id."""
    return hass.data.setdefault(WATCHED_KEEPERS, {})


def keeper_for_camera(hass: HomeAssistant, cam: str) -> WatchedKeeper | None:
    """The keeper of the first entry that records a camera."""
    for keeper in keepers(hass).values():
        if cam in keeper.manager.cameras:
            return keeper
    return None


async def async_start_watched(hass: HomeAssistant, manager: RecordingManager) -> None:
    """Start keeping live views and snapshots for one entry, and stop with it."""
    from .snapshots import async_attach_snapshots  # noqa: PLC0415

    keeper = WatchedKeeper(hass, manager)
    await keeper.async_start()
    keepers(hass)[manager.entry.entry_id] = keeper
    detach = async_attach_snapshots(hass, keeper)

    async def _stop() -> None:
        detach()
        keepers(hass).pop(manager.entry.entry_id, None)
        await keeper.async_stop()

    manager.entry.async_on_unload(_stop)
