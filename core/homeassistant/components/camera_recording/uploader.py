"""Sends finished recordings to cloud drives, one file at a time per drive.

Uploads are off until the owner turns one on. The queue is stored, so it survives a
restart. A file is never sent while it is still being written, and the recording at
its usual destination is never touched: the queue keeps its own hard link to each
waiting file and removes only that link, after the drive confirms the upload.
"""

import asyncio
from collections.abc import Callable, Mapping
from contextlib import suppress
from dataclasses import dataclass
import logging
import os
from pathlib import Path
import time
from typing import TYPE_CHECKING, Any

from homeassistant.const import EVENT_HOMEASSISTANT_STOP
from homeassistant.core import CALLBACK_TYPE, Event, HomeAssistant, callback
from homeassistant.helpers.storage import Store
from homeassistant.util.hass_dict import HassKey
from homeassistant.util.ulid import ulid_now

from .backoff import wait_for_attempt
from .cloud import (
    REASON_FILE_GONE,
    REASON_GAVE_UP,
    REASON_NOT_LOADED,
    REASON_NOT_SET_UP,
    REASON_SIGN_IN,
    CloudDrive,
    DriveError,
    create_drives,
    file_reader,
)
from .const import DOMAIN

if TYPE_CHECKING:
    from .manager import RecordingManager

_LOGGER = logging.getLogger(__name__)

DATA_UPLOADER: HassKey[CloudUploader] = HassKey(f"{DOMAIN}.cloud_uploader")
STORAGE_KEY = f"{DOMAIN}.cloud"
STORAGE_VERSION = 1
SAVE_DELAY = 5

SEND_EVENTS = "events"
SEND_EVERYTHING = "everything"
SEND_CHOICES = (SEND_EVENTS, SEND_EVERYTHING)
DEFAULT_SEND = SEND_EVENTS
DEFAULT_KEEP_DAYS = 30
MIN_KEEP_DAYS = 1
MAX_KEEP_DAYS = 365

ROOT_FOLDER = "Camera recordings"
QUEUE_FOLDER = ".cloud_queue"
# About 16 Mbit/s for each drive, so recording and the rest of the instance keep going.
BYTES_PER_SECOND = 2_000_000
SETTLE_SECONDS = 10
IDLE_SECONDS = 60
RETENTION_EVERY = 3600
# Recordings made before a drive was turned on are not sent; this far back is the limit
# for anything indexed late, such as an event clip saved after a restart.
BACKFILL_SECONDS = 2 * 86400
MAX_ATTEMPTS = 8
RETRY_SCHEDULE = (60.0, 300.0, 900.0, 1800.0, 3600.0, 3 * 3600.0, 6 * 3600.0)
WAIT_SECONDS = 600.0
MAX_SENT_KEPT_FOREVER = 200_000
# These wait for the owner, so they do not count towards giving up.
WAITING_REASONS = frozenset({REASON_NOT_SET_UP, REASON_NOT_LOADED, REASON_SIGN_IN})


@dataclass(slots=True)
class DriveSettings:
    """What the owner chose for one drive."""

    enabled: bool = False
    send: str = DEFAULT_SEND
    keep_days: int | None = DEFAULT_KEEP_DAYS
    enabled_at: float | None = None

    def as_dict(self) -> dict[str, Any]:
        """Form for storage and the status."""
        return {
            "enabled": self.enabled,
            "send": self.send,
            "keep_days": self.keep_days,
            "enabled_at": self.enabled_at,
        }

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> DriveSettings:
        """Read the stored form, falling back to the defaults."""
        send = data.get("send", DEFAULT_SEND)
        keep = data.get("keep_days", DEFAULT_KEEP_DAYS)
        return cls(
            enabled=bool(data.get("enabled", False)),
            send=send if send in SEND_CHOICES else DEFAULT_SEND,
            keep_days=None
            if keep is None
            else max(MIN_KEEP_DAYS, min(MAX_KEEP_DAYS, int(keep))),
            enabled_at=data.get("enabled_at"),
        )


def wanted(send: str, kind: str) -> bool:
    """Whether a recording of this kind is sent with this choice."""
    return send == SEND_EVERYTHING or kind.startswith("event_")


def item_key(entry_id: str, entity_id: str, name: str) -> str:
    """The identity of one recording file across managers."""
    return f"{entry_id}/{entity_id}/{name}"


class DriveState:
    """The queue, the sent files and the counters of one drive."""

    def __init__(self, settings: DriveSettings) -> None:
        """Start empty."""
        self.settings = settings
        self.queue: list[dict[str, Any]] = []
        self.sent: list[list[Any]] = []
        self.seen: dict[str, float] = {}
        self.sent_files = 0
        self.sent_bytes = 0
        self.given_up = 0
        self.last_sent: dict[str, Any] | None = None
        self.last_problem: dict[str, Any] | None = None
        self.logged_reason: str | None = None
        self.wake = asyncio.Event()
        self.task: asyncio.Task[None] | None = None

    def as_dict(self) -> dict[str, Any]:
        """Form for storage."""
        return {
            "settings": self.settings.as_dict(),
            "queue": self.queue,
            "sent": self.sent,
            "seen": self.seen,
            "sent_files": self.sent_files,
            "sent_bytes": self.sent_bytes,
            "given_up": self.given_up,
            "last_sent": self.last_sent,
            "last_problem": self.last_problem,
        }

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> DriveState:
        """Read the stored form."""
        state = cls(DriveSettings.from_dict(data.get("settings", {})))
        state.queue = [dict(item) for item in data.get("queue", [])]
        state.sent = [list(row) for row in data.get("sent", [])]
        state.seen = {str(k): float(v) for k, v in data.get("seen", {}).items()}
        state.sent_files = int(data.get("sent_files", 0))
        state.sent_bytes = int(data.get("sent_bytes", 0))
        state.given_up = int(data.get("given_up", 0))
        state.last_sent = data.get("last_sent")
        state.last_problem = data.get("last_problem")
        return state


class CloudUploader:
    """The queue of recordings to send to each cloud drive."""

    def __init__(
        self,
        hass: HomeAssistant,
        drives: Mapping[str, CloudDrive] | None = None,
        *,
        bytes_per_second: float = BYTES_PER_SECOND,
        settle_seconds: float = SETTLE_SECONDS,
    ) -> None:
        """Set up, empty. Call async_load before use."""
        self.hass = hass
        self.drives: dict[str, CloudDrive] = dict(drives or create_drives(hass))
        self.bytes_per_second = bytes_per_second
        self.settle_seconds = settle_seconds
        self.states: dict[str, DriveState] = {
            domain: DriveState(DriveSettings()) for domain in self.drives
        }
        self.managers: dict[str, RecordingManager] = {}
        self._store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self._scanning: set[str] = set()
        self._listeners: list[Callable[[], None]] = []
        self._stopping = False
        self._last_retention: dict[str, float] = {}
        self.load_task: asyncio.Task[None] | None = None

    @property
    def queue_root(self) -> Path:
        """Where the queue keeps its own links to waiting files."""
        return Path(self.hass.config.path(DOMAIN, QUEUE_FOLDER))

    async def async_load(self) -> None:
        """Read the stored queue and settings, then start the drives that are on."""
        stored = await self._store.async_load() or {}
        for domain, data in stored.get("drives", {}).items():
            if domain in self.drives:
                self.states[domain] = DriveState.from_dict(data)
        await self.hass.async_add_executor_job(self._remove_stray_links)
        self.hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STOP, self._on_stop)
        for domain, state in self.states.items():
            if state.settings.enabled:
                self._start_worker(domain)

    def _remove_stray_links(self) -> None:
        root = self.queue_root
        if not root.is_dir():
            return
        kept = {
            item.get("staged")
            for state in self.states.values()
            for item in state.queue
            if item.get("staged")
        }
        for entry in root.iterdir():
            if str(entry) not in kept:
                entry.unlink(missing_ok=True)

    @callback
    def _on_stop(self, _event: Event) -> None:
        self.hass.async_create_task(self.async_stop())

    async def async_stop(self) -> None:
        """Stop the workers and save."""
        self._stopping = True
        tasks = [state.task for state in self.states.values() if state.task]
        for task in tasks:
            task.cancel()
        for task in tasks:
            with suppress(asyncio.CancelledError):
                await task
        for state in self.states.values():
            state.task = None
        await self._store.async_save(self._data())

    def _data(self) -> dict[str, Any]:
        return {
            "drives": {domain: state.as_dict() for domain, state in self.states.items()}
        }

    def _save(self) -> None:
        self._store.async_delay_save(self._data, SAVE_DELAY)

    @callback
    def async_add_listener(self, listener: Callable[[], None]) -> CALLBACK_TYPE:
        """Call listener whenever the status changes."""
        self._listeners.append(listener)
        return lambda: self._listeners.remove(listener)

    @callback
    def _changed(self) -> None:
        self._save()
        for listener in list(self._listeners):
            listener()

    @callback
    def async_attach(self, manager: RecordingManager) -> CALLBACK_TYPE:
        """Watch a recording manager's index for newly finished files."""
        entry_id = manager.entry.entry_id
        self.managers[entry_id] = manager

        @callback
        def _manager_changed() -> None:
            self._schedule_scan(entry_id)

        unsub = manager.async_add_listener(_manager_changed)
        self._schedule_scan(entry_id)

        @callback
        def _detach() -> None:
            unsub()
            if self.managers.get(entry_id) is manager:
                del self.managers[entry_id]

        return _detach

    @callback
    def _schedule_scan(self, entry_id: str) -> None:
        if entry_id in self._scanning or self._stopping:
            return
        if not any(state.settings.enabled for state in self.states.values()):
            return
        self._scanning.add(entry_id)
        self.hass.async_create_background_task(
            self._async_scan_entry(entry_id), f"{DOMAIN} cloud scan", eager_start=False
        )

    async def _async_scan_entry(self, entry_id: str) -> None:
        try:
            if (manager := self.managers.get(entry_id)) is not None:
                await self.async_scan(manager)
        finally:
            self._scanning.discard(entry_id)

    async def async_scan(self, manager: RecordingManager) -> int:
        """Queue every finished, indexed file the enabled drives want. Returns how many."""
        entry_id = manager.entry.entry_id
        now = time.time()
        added: list[tuple[str, dict[str, Any], Path]] = []
        for domain, state in self.states.items():
            settings = state.settings
            if not settings.enabled or settings.enabled_at is None:
                continue
            since = max(settings.enabled_at, now - BACKFILL_SECONDS)
            for entity_id, segments in manager.segments.items():
                for segment in segments.values():
                    if segment.start < since or not wanted(settings.send, segment.kind):
                        continue
                    key = item_key(entry_id, entity_id, segment.name)
                    if key in state.seen:
                        continue
                    state.seen[key] = segment.start
                    item = {
                        "id": ulid_now(),
                        "entry_id": entry_id,
                        "entity_id": entity_id,
                        "name": segment.name,
                        "kind": segment.kind,
                        "size": segment.size,
                        "start": segment.start,
                        "staged": None,
                        "attempts": 0,
                        "next_try": 0.0,
                        "added": now,
                    }
                    added.append(
                        (domain, item, manager.folder(entity_id) / segment.name)
                    )
            self._prune_seen(state, now)
        if not added:
            return 0
        root = self.queue_root
        staged = await self.hass.async_add_executor_job(
            _link_all, root, [(item["id"], source) for _, item, source in added]
        )
        for domain, item, _source in added:
            item["staged"] = staged.get(item["id"])
            self.states[domain].queue.append(item)
            self.states[domain].wake.set()
        self._changed()
        return len(added)

    @staticmethod
    def _prune_seen(state: DriveState, now: float) -> None:
        cutoff = now - BACKFILL_SECONDS - 86400
        stale = [key for key, start in state.seen.items() if start < cutoff]
        for key in stale:
            del state.seen[key]

    def _start_worker(self, domain: str) -> None:
        state = self.states[domain]
        if state.task is not None and not state.task.done():
            return
        state.task = self.hass.async_create_background_task(
            self._async_worker(domain), f"{DOMAIN} cloud upload {domain}"
        )

    async def _stop_worker(self, domain: str) -> None:
        state = self.states[domain]
        if (task := state.task) is None:
            return
        state.task = None
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task

    async def _async_worker(self, domain: str) -> None:
        state = self.states[domain]
        while True:
            state.wake.clear()
            await self.async_apply_retention(domain)
            sent_one = await self.async_send_next(domain)
            if sent_one:
                await asyncio.sleep(0)
                continue
            due = [item["next_try"] for item in state.queue]
            wait = IDLE_SECONDS
            if due:
                wait = max(1.0, min(IDLE_SECONDS, min(due) - time.time()))
            try:
                async with asyncio.timeout(wait):
                    await state.wake.wait()
            except TimeoutError:
                pass

    async def async_send_next(self, domain: str) -> bool:
        """Send the oldest due file. Returns whether one was sent or settled."""
        state = self.states[domain]
        now = time.time()
        due = [item for item in state.queue if item["next_try"] <= now]
        if not due or not state.settings.enabled:
            return False
        item = min(due, key=lambda row: (row["start"], row["added"]))
        return await self._async_send(domain, item)

    async def _async_send(self, domain: str, item: dict[str, Any]) -> bool:
        state = self.states[domain]
        drive = self.drives[domain]
        path = await self._local_file(item)
        if path is None:
            self._drop(state, item, REASON_FILE_GONE)
            return True
        ready = await self.hass.async_add_executor_job(
            _settled, path, self.settle_seconds
        )
        if ready is None:
            self._drop(state, item, REASON_FILE_GONE)
            return True
        if not ready:
            item["next_try"] = time.time() + max(1.0, self.settle_seconds)
            return False
        size = await self.hass.async_add_executor_job(_size, path)
        folder = (ROOT_FOLDER, _camera_folder(item["entity_id"]), _day(item["start"]))
        try:
            remote = await drive.upload(
                file_reader(self.hass, path, self.bytes_per_second),
                size,
                folder,
                item["name"],
            )
        except DriveError as err:
            self._failed(domain, item, err.reason)
            return False
        except Exception:  # noqa: BLE001
            # The drive's client raised something unexpected; the reason code is all
            # that is logged, never its text.
            self._failed(domain, item, "unexpected")
            return False
        state.queue.remove(item)
        await self._unlink_staged(item)
        state.sent.append(
            [remote.id, item["start"], size, item["entity_id"], item["name"]]
        )
        if state.settings.keep_days is None and len(state.sent) > MAX_SENT_KEPT_FOREVER:
            del state.sent[: len(state.sent) - MAX_SENT_KEPT_FOREVER]
        state.sent_files += 1
        state.sent_bytes += size
        state.last_sent = {
            "entity_id": item["entity_id"],
            "name": item["name"],
            "kind": item["kind"],
            "at": time.time(),
        }
        state.logged_reason = None
        self._changed()
        return True

    async def _local_file(self, item: dict[str, Any]) -> Path | None:
        if (staged := item.get("staged")) and await self.hass.async_add_executor_job(
            os.path.isfile, staged
        ):
            return Path(staged)
        manager = self.managers.get(item["entry_id"])
        if manager is None:
            return None
        try:
            return await manager.async_playable_path(item["entity_id"], item["name"])
        except Exception:  # noqa: BLE001
            return None

    def _failed(self, domain: str, item: dict[str, Any], reason: str) -> None:
        state = self.states[domain]
        if reason in WAITING_REASONS:
            item["next_try"] = time.time() + WAIT_SECONDS
            self._problem(domain, reason)
            return
        item["attempts"] += 1
        if item["attempts"] >= MAX_ATTEMPTS:
            self._problem(domain, reason)
            self._drop(state, item, REASON_GAVE_UP)
            return
        item["next_try"] = time.time() + wait_for_attempt(
            item["attempts"] - 1, RETRY_SCHEDULE
        )
        self._problem(domain, reason)

    def _problem(self, domain: str, reason: str) -> None:
        state = self.states[domain]
        state.last_problem = {"reason": reason, "at": time.time()}
        if state.logged_reason != reason:
            state.logged_reason = reason
            _LOGGER.warning(
                "Sending camera recordings to %s failed (reason: %s)", domain, reason
            )
        self._changed()

    def _drop(self, state: DriveState, item: dict[str, Any], reason: str) -> None:
        if item in state.queue:
            state.queue.remove(item)
        if reason == REASON_GAVE_UP:
            state.given_up += 1
        domain = next(d for d, s in self.states.items() if s is state)
        if reason != REASON_GAVE_UP:
            self._problem(domain, reason)
        if staged := item.get("staged"):
            self.hass.async_add_executor_job(_unlink, Path(staged))
        self._changed()

    async def _unlink_staged(self, item: dict[str, Any]) -> None:
        if staged := item.get("staged"):
            await self.hass.async_add_executor_job(_unlink, Path(staged))

    async def async_apply_retention(self, domain: str, force: bool = False) -> int:
        """Delete files on the drive older than its keep-for time. Returns how many."""
        state = self.states[domain]
        keep = state.settings.keep_days
        now = time.time()
        if keep is None or not state.sent:
            return 0
        if not force and now - self._last_retention.get(domain, 0) < RETENTION_EVERY:
            return 0
        drive = self.drives[domain]
        if not drive.loaded:
            return 0
        self._last_retention[domain] = now
        gone, reason = await drive.delete_older_than(
            [(str(row[0]), float(row[1])) for row in state.sent], keep, now
        )
        if gone:
            removed = set(gone)
            state.sent = [row for row in state.sent if str(row[0]) not in removed]
            self._changed()
        if reason is not None:
            self._problem(domain, reason)
        return len(gone)

    async def async_set(
        self,
        domain: str,
        *,
        enabled: bool | None = None,
        send: str | None = None,
    ) -> None:
        """Change one drive's settings. Turning a drive off empties its queue."""
        state = self.states[domain]
        settings = state.settings
        if send is not None:
            settings.send = send
        if enabled is not None and enabled != settings.enabled:
            settings.enabled = enabled
            if enabled:
                settings.enabled_at = time.time()
                state.seen.clear()
                self._start_worker(domain)
                for entry_id in list(self.managers):
                    self._schedule_scan(entry_id)
            else:
                settings.enabled_at = None
                await self._stop_worker(domain)
                for item in list(state.queue):
                    await self._unlink_staged(item)
                state.queue.clear()
        self._changed()

    async def async_set_keep_days(self, domain: str, keep_days: int | None) -> None:
        """Choose how long files stay on the drive. None keeps them for ever."""
        self.states[domain].settings.keep_days = keep_days
        self._changed()
        if self.states[domain].settings.enabled:
            await self.async_apply_retention(domain, force=True)

    def status(self) -> dict[str, Any]:
        """Everything the page shows about each drive. No account details."""
        drives = []
        for domain, state in self.states.items():
            drive = self.drives[domain]
            drives.append(
                {
                    "domain": domain,
                    "set_up": drive.set_up,
                    "loaded": drive.loaded,
                    **state.settings.as_dict(),
                    "folder": [ROOT_FOLDER, "camera", "day"],
                    "waiting_files": len(state.queue),
                    "waiting_bytes": sum(int(i["size"]) for i in state.queue),
                    "sent_files": state.sent_files,
                    "sent_bytes": state.sent_bytes,
                    "given_up": state.given_up,
                    "last_sent": state.last_sent,
                    "last_problem": state.last_problem,
                    "free_bytes": drive.free_space(),
                }
            )
        return {"drives": drives}


def _camera_folder(entity_id: str) -> str:
    return entity_id.split(".", 1)[-1]


def _day(start: float) -> str:
    return time.strftime("%Y-%m-%d", time.gmtime(start))


def _link_all(root: Path, sources: list[tuple[str, Path]]) -> dict[str, str]:
    """Hard-link each waiting file into the queue folder. Runs in the executor."""
    linked: dict[str, str] = {}
    root.mkdir(parents=True, exist_ok=True)
    for item_id, source in sources:
        target = root / f"{item_id}{source.suffix}"
        try:
            os.link(source, target)
        except OSError:
            # Another disk, or a file that is only at the destination now: it is
            # fetched back when its turn comes instead.
            continue
        linked[item_id] = str(target)
    return linked


def _settled(path: Path, settle_seconds: float) -> bool | None:
    """Whether a file has stopped changing. None when it is gone."""
    try:
        stat = path.stat()
    except OSError:
        return None
    if stat.st_size == 0:
        return False
    return time.time() - stat.st_mtime >= settle_seconds


def _size(path: Path) -> int:
    return path.stat().st_size


def _unlink(path: Path) -> None:
    path.unlink(missing_ok=True)


async def async_get_uploader(hass: HomeAssistant) -> CloudUploader:
    """The one uploader of this instance, loaded on first use."""
    if (uploader := hass.data.get(DATA_UPLOADER)) is None:
        uploader = CloudUploader(hass)
        hass.data[DATA_UPLOADER] = uploader
        uploader.load_task = hass.async_create_task(uploader.async_load())
    if uploader.load_task is not None:
        await asyncio.shield(uploader.load_task)
    return uploader
