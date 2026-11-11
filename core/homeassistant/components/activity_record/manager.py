"""Take entries from the Activity page's own live stream and keep them for ever."""

from collections import deque
from collections.abc import Mapping
from datetime import datetime, timedelta
import logging
from pathlib import Path
import re
import threading
import time
from typing import Any

from homeassistant.components.automation_repos.repos import mask_text
from homeassistant.components.logbook.const import DOMAIN as LOGBOOK_DOMAIN
from homeassistant.components.logbook.helpers import (
    async_determine_event_types,
    async_subscribe_events,
)
from homeassistant.components.logbook.models import LogbookConfig, async_event_to_row
from homeassistant.components.logbook.processor import EventProcessor
from homeassistant.const import EVENT_CALL_SERVICE
from homeassistant.core import (
    CALLBACK_TYPE,
    CoreState,
    Event,
    HomeAssistant,
    callback,
)
from homeassistant.helpers.event import async_call_later, async_track_time_interval
from homeassistant.util import dt as dt_util

from .const import (
    BATCH_SIZE,
    EARLY_RECHECK,
    FLUSH_DELAY,
    MAX_QUEUE,
    REPO_DIR,
    RETRY_BACKOFF,
    SSH_DIR,
)
from .record_core import (
    day_of,
    dropped_entry,
    entry_from_logbook,
    iso_utc,
    mask_entry,
    prepare_secrets,
    serialize,
    unwritable_entry,
)
from .repository import ActivityRepository, PartialWriteError, RepositoryError

_LOGGER = logging.getLogger(__name__)


class ActivityRecorder:
    """Subscribe to the logbook's live events and append them to the record."""

    def __init__(self, hass: HomeAssistant, commit_interval: int) -> None:
        """Initialize."""
        self.hass = hass
        self.commit_interval = commit_interval
        self.repository = ActivityRepository(
            Path(hass.config.path(REPO_DIR)), Path(hass.config.path(SSH_DIR))
        )
        self.last_error: str | None = None
        self.last_error_at: float | None = None
        self.dropped_total = 0
        self.lock_held = False
        self._queue: deque[dict[str, Any]] = deque()
        self._queue_lock = threading.Lock()
        self._inflight = 0
        self._drop: dict[str, Any] | None = None
        self._state_dirty = False
        self._failures = 0
        self._ready = False
        self._draining = False
        self._drain_future: Any = None
        self._flush_timer: CALLBACK_TYPE | None = None
        self._retry_timer: CALLBACK_TYPE | None = None
        self._commit_timer: CALLBACK_TYPE | None = None
        self._tick_unsub: CALLBACK_TYPE | None = None
        self._early_unsub: CALLBACK_TYPE | None = None
        self._subscriptions: list[CALLBACK_TYPE] = []
        self._event_types: frozenset[Any] | None = None
        self._processor: EventProcessor | None = None
        self._processor_hour: int | None = None
        self._secrets: re.Pattern[str] | None = None
        self._secrets_stamp: int | None = None
        self._warned_events = False
        self._stopped = False
        self._push_task: Any = None

    async def async_start(self) -> None:
        """Begin recording."""
        self._resubscribe()
        self._tick_unsub = async_track_time_interval(
            self.hass, self._async_tick, timedelta(seconds=self.commit_interval)
        )
        if self.hass.state is not CoreState.running:
            self._early_unsub = async_track_time_interval(
                self.hass, self._async_early_tick, timedelta(seconds=EARLY_RECHECK)
            )
        self.hass.async_create_background_task(
            self._async_startup(), "activity_record startup"
        )

    async def _async_startup(self) -> None:
        try:
            await self.hass.async_add_executor_job(self.repository.startup)
        except Exception as err:  # noqa: BLE001
            self._note_error(err)
        if self.repository.locked_out:
            self.lock_held = True
            self._unsubscribe()
            with self._queue_lock:
                self._queue.clear()
            return
        self.dropped_total += self.repository.dropped_total
        self._ready = True
        self._schedule_flush()

    @callback
    def async_refresh(self) -> None:
        """Pick up event types that integrations registered after the start."""
        if self._early_unsub is not None:
            self._early_unsub()
            self._early_unsub = None
        self._resubscribe()

    async def _async_early_tick(self, _: datetime) -> None:
        self._resubscribe()

    @callback
    def _resubscribe(self) -> None:
        """Listen to the events the Activity page would show right now."""
        if self.lock_held or self._stopped:
            return
        logbook_config: LogbookConfig | None = self.hass.data.get(LOGBOOK_DOMAIN)
        if logbook_config is None:
            return
        event_types = frozenset(async_determine_event_types(self.hass, None, None))
        hour = int(time.time() // 3600)
        if event_types == self._event_types and self._subscriptions:
            if hour != self._processor_hour:
                self._new_processor(event_types)
            return
        self._unsubscribe()
        self._event_types = event_types
        self._new_processor(event_types)
        async_subscribe_events(
            self.hass,
            self._subscriptions,
            self._async_on_event,
            {*event_types, EVENT_CALL_SERVICE},
            logbook_config.entity_filter,
            None,
            None,
        )

    def _new_processor(self, event_types: frozenset[Any]) -> None:
        """Start a processor; names are looked up fresh and users carried over."""
        previous = self._processor
        processor = EventProcessor(
            self.hass,
            event_types,
            timestamp=True,
            include_entity_name=True,
            for_live_stream=True,
        )
        processor.switch_to_live()
        if previous is not None:
            processor.logbook_run.context_user_ids = (
                previous.logbook_run.context_user_ids
            )
        self._processor = processor
        self._processor_hour = int(time.time() // 3600)

    @callback
    def _unsubscribe(self) -> None:
        for unsubscribe in self._subscriptions:
            unsubscribe()
        self._subscriptions.clear()

    @callback
    def _async_on_event(self, event: Event) -> None:
        if self._processor is None:
            return
        context = event.context
        try:
            rows = self._processor.humanify([async_event_to_row(event)])
        except Exception as err:  # noqa: BLE001
            if not self._warned_events:
                self._warned_events = True
                _LOGGER.warning(
                    "An event could not be turned into an activity entry",
                    exc_info=True,
                )
            self._enqueue(
                unwritable_entry(
                    {"entity_id": (event.data or {}).get("entity_id")},
                    f"the event could not be described ({type(err).__name__})",
                    time.time(),
                )
            )
            return
        for data in rows:
            try:
                entry = entry_from_logbook(
                    data,
                    context_id=context.id,
                    parent_id=context.parent_id,
                    user_id=context.user_id,
                )
            except Exception as err:  # noqa: BLE001
                entry = unwritable_entry(
                    data if isinstance(data, Mapping) else {},
                    f"the entry could not be built ({type(err).__name__})",
                    time.time(),
                )
            self._enqueue(entry)

    @callback
    def _enqueue(self, entry: dict[str, Any]) -> None:
        with self._queue_lock:
            full = len(self._queue) + self._inflight >= MAX_QUEUE
            if not full:
                self._queue.append(entry)
        if full:
            self._note_drop()
        self._schedule_flush()

    def _note_drop(self) -> None:
        """Count a dropped entry; the first of a run is written down at once.

        The opening line takes a slot that is reserved beyond the queue bound.
        """
        now = time.time()
        self.dropped_total += 1
        self._state_dirty = True
        if self._drop is not None:
            self._drop["last"] = now
            self._drop["count"] += 1
            return
        self._drop = {"first": now, "last": now, "count": 1}
        with self._queue_lock:
            self._queue.append(dropped_entry(1, now, now, started=True))

    @callback
    def _schedule_flush(self) -> None:
        if (
            not self._ready
            or self._stopped
            or self._draining
            or self._retry_timer is not None
        ):
            return
        if len(self._queue) >= BATCH_SIZE:
            self._start_drain()
            return
        if self._queue or self._state_dirty:
            if self._flush_timer is None:
                self._flush_timer = async_call_later(
                    self.hass, FLUSH_DELAY, self._flush_due
                )

    @callback
    def _flush_due(self, _: datetime) -> None:
        self._flush_timer = None
        self._start_drain()

    @callback
    def _start_drain(self) -> None:
        if self._flush_timer is not None:
            self._flush_timer()
            self._flush_timer = None
        if self._draining or not self._ready or self._stopped:
            return
        self._draining = True
        self._drain_future = self.hass.async_add_executor_job(self._drain, False)

    @callback
    def _retry_due(self, _: datetime) -> None:
        self._retry_timer = None
        self._start_drain()

    @callback
    def _drain_done(self, failed: bool) -> None:
        self._drain_future = None
        self._draining = False
        if self._stopped:
            return
        if failed:
            delay = RETRY_BACKOFF[min(self._failures, len(RETRY_BACKOFF)) - 1]
            self._retry_timer = async_call_later(self.hass, delay, self._retry_due)
            return
        with self._queue_lock:
            empty = not self._queue
        if empty and self._drop is not None:
            drop, self._drop = self._drop, None
            with self._queue_lock:
                self._queue.append(
                    dropped_entry(drop["count"], drop["first"], drop["last"])
                )
        self._schedule_flush()
        self._schedule_commit()

    @callback
    def _schedule_commit(self) -> None:
        if self._commit_timer is None and not self._stopped:
            self._commit_timer = async_call_later(
                self.hass, self.commit_interval, self._async_commit_timer
            )

    async def _async_commit_timer(self, _: datetime) -> None:
        self._commit_timer = None
        await self._async_commit()

    async def _async_commit(self) -> None:
        if not self.repository.uncommitted or self.lock_held:
            return
        try:
            await self.hass.async_add_executor_job(self.repository.commit)
        except Exception as err:  # noqa: BLE001
            self._note_error(err)
        else:
            self._clear_error()

    async def _async_tick(self, _: datetime) -> None:
        self._resubscribe()
        if self._commit_timer is None:
            await self._async_commit()

    def _note_error(self, err: Exception) -> None:
        message = mask_text(str(err))[:300]
        if message != self.last_error:
            _LOGGER.warning("The activity record had a problem: %s", message)
        self.last_error = message
        self.last_error_at = time.time()

    def _clear_error(self) -> None:
        self.last_error = None
        self.last_error_at = None

    def _load_secrets(self) -> re.Pattern[str] | None:
        """Read exact values from secrets.yaml so they are never written."""
        path = Path(self.hass.config.path("secrets.yaml"))
        try:
            stamp = path.stat().st_mtime_ns
        except OSError:
            return None
        if stamp == self._secrets_stamp:
            return self._secrets
        try:
            import yaml  # noqa: PLC0415

            data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        except Exception:  # noqa: BLE001
            return self._secrets
        self._secrets_stamp = stamp
        if isinstance(data, dict):
            self._secrets = prepare_secrets(
                str(v) for v in data.values() if isinstance(v, str | int | float)
            )
        return self._secrets

    def _prepare(
        self, batch: list[dict[str, Any]]
    ) -> list[tuple[str, bytes]]:
        """Mask and serialise a batch; an entry that fails becomes a placeholder."""
        pattern = self._load_secrets()
        now = time.time()
        today = iso_utc(now)[:10]
        items: list[tuple[str, bytes]] = []
        for entry in batch:
            try:
                masked = mask_entry(entry, pattern)
                try:
                    day = day_of(masked)
                except ValueError:
                    masked = {
                        **masked,
                        "when": iso_utc(now),
                        "when_raw": str(masked.get("when"))[:100],
                    }
                    day = today
                items.append((day, serialize(masked)))
            except Exception as err:  # noqa: BLE001
                placeholder = unwritable_entry(
                    entry if isinstance(entry, Mapping) else {},
                    f"{type(err).__name__}: {err}",
                    now,
                )
                items.append((today, serialize(placeholder)))
        return items

    def _drain(self, everything: bool) -> None:
        """Write queued entries to the chunks (runs in an executor).

        A batch that cannot be written goes back to the front of the queue in
        its original order; only what did not reach the disk is put back.
        """
        failed = False
        try:
            while True:
                with self._queue_lock:
                    batch = [
                        self._queue.popleft()
                        for _ in range(min(BATCH_SIZE, len(self._queue)))
                    ]
                    self._inflight = len(batch)
                if not batch:
                    break
                written = 0
                try:
                    written = self.repository.append(self._prepare(batch))
                except Exception as err:  # noqa: BLE001
                    written = getattr(err, "written", 0)
                    failed = True
                    self._failures += 1
                    self._note_error(err)
                finally:
                    with self._queue_lock:
                        self._queue.extendleft(reversed(batch[written:]))
                        self._inflight = 0
                if failed:
                    break
                self._failures = 0
                self._clear_error()
                if not everything and len(self._queue) < BATCH_SIZE:
                    break
            if self._state_dirty:
                self._state_dirty = False
                try:
                    self.repository.save_state(self.dropped_total)
                except Exception as err:  # noqa: BLE001
                    self._state_dirty = True
                    self._note_error(err)
        except Exception as err:  # noqa: BLE001
            failed = True
            self._failures += 1
            self._note_error(err)
        finally:
            self.hass.loop.call_soon_threadsafe(self._drain_done, failed)

    async def async_stop(self) -> None:
        """Stop listening, write everything queued and commit it."""
        self._stopped = True
        self._unsubscribe()
        for unsubscribe in (self._tick_unsub, self._early_unsub):
            if unsubscribe is not None:
                unsubscribe()
        self._tick_unsub = self._early_unsub = None
        for timer in (self._commit_timer, self._flush_timer, self._retry_timer):
            if timer is not None:
                timer()
        self._commit_timer = self._flush_timer = self._retry_timer = None
        if self.lock_held:
            return
        future = self._drain_future
        if future is not None:
            await future
        if self._drop is not None:
            drop, self._drop = self._drop, None
            self._queue.append(
                dropped_entry(drop["count"], drop["first"], drop["last"])
            )
        self._state_dirty = True
        await self.hass.async_add_executor_job(self._drain, True)
        try:
            await self.hass.async_add_executor_job(self.repository.commit)
        except Exception as err:  # noqa: BLE001
            self._note_error(err)
        await self.hass.async_add_executor_job(self.repository.stop)

    async def async_start_push(self) -> None:
        """Start sending the record to its remote as a background task."""
        if self._push_task is not None and not self._push_task.done():
            raise RepositoryError("A push to the Git remote is still running.")
        await self.hass.async_add_executor_job(self.repository.push_precheck)
        self._push_task = self.hass.async_create_background_task(
            self._async_push(), "activity_record push"
        )

    async def _async_push(self) -> None:
        try:
            await self.hass.async_add_executor_job(self.repository.push)
        except Exception as err:  # noqa: BLE001
            _LOGGER.warning(
                "The activity record could not be sent: %s", mask_text(str(err))[:300]
            )

    async def async_status(self) -> dict[str, Any]:
        """Return the status of the record."""
        today = dt_util.utcnow().date().isoformat()
        data = await self.hass.async_add_executor_job(self.repository.status, today)
        push_running = self._push_task is not None and not self._push_task.done()
        if push_running and not (data.get("push") or {}).get("running"):
            data["push"] = {"running": True, "step": 0, "steps": 0, "error": None}
        data.update(
            {
                "recording": self._event_types is not None
                and not self._stopped
                and not self.lock_held,
                "lock_held": self.lock_held,
                "queue_depth": len(self._queue) + self._inflight,
                "dropped_total": self.dropped_total,
                "last_error": self.last_error,
                "last_error_at": self.last_error_at,
                "commit_interval": self.commit_interval,
                "retrying": self._retry_timer is not None,
            }
        )
        return data
