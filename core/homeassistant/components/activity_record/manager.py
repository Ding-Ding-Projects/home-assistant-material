"""Take entries from the Activity page's own live stream and keep them for ever."""

from collections import deque
from datetime import datetime, timedelta
import logging
from pathlib import Path
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
from homeassistant.core import CALLBACK_TYPE, Event, HomeAssistant, callback
from homeassistant.helpers.event import async_call_later, async_track_time_interval
from homeassistant.util import dt as dt_util

from .const import BATCH_SIZE, MAX_QUEUE, REPO_DIR
from .record_core import (
    day_of,
    dropped_entry,
    entry_from_logbook,
    mask_entry,
    serialize,
)
from .repository import ActivityRepository

_LOGGER = logging.getLogger(__name__)


class ActivityRecorder:
    """Subscribe to the logbook's live events and append them to the record."""

    def __init__(self, hass: HomeAssistant, commit_interval: int) -> None:
        """Initialize."""
        self.hass = hass
        self.commit_interval = commit_interval
        self.repository = ActivityRepository(Path(hass.config.path(REPO_DIR)))
        self.last_error: str | None = None
        self.last_error_at: float | None = None
        self.dropped_total = 0
        self._queue: deque[dict[str, Any]] = deque()
        self._dropped = 0
        self._counter_lock = threading.Lock()
        self._draining = False
        self._drain_future: Any = None
        self._commit_timer: CALLBACK_TYPE | None = None
        self._tick_unsub: CALLBACK_TYPE | None = None
        self._subscriptions: list[CALLBACK_TYPE] = []
        self._event_types: frozenset[Any] | None = None
        self._processor: EventProcessor | None = None
        self._processor_hour: int | None = None
        self._secrets: list[str] = []
        self._secrets_stamp: int | None = None
        self._warned_events = False
        self._stopped = False

    async def async_start(self) -> None:
        """Begin recording."""
        self._resubscribe()
        self._tick_unsub = async_track_time_interval(
            self.hass, self._async_tick, timedelta(seconds=self.commit_interval)
        )
        self.hass.async_create_background_task(
            self._async_startup(), "activity_record startup"
        )

    async def _async_startup(self) -> None:
        try:
            await self.hass.async_add_executor_job(self.repository.startup)
        except Exception as err:  # noqa: BLE001
            self._note_error(err)

    @callback
    def async_refresh(self) -> None:
        """Pick up event types that integrations registered after the start."""
        self._resubscribe()

    @callback
    def _resubscribe(self) -> None:
        """Listen to the events the Activity page would show right now."""
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
        try:
            rows = self._processor.humanify([async_event_to_row(event)])
        except Exception:  # noqa: BLE001
            if not self._warned_events:
                self._warned_events = True
                _LOGGER.warning(
                    "An event could not be turned into an activity entry",
                    exc_info=True,
                )
            return
        context = event.context
        for data in rows:
            self._enqueue(
                entry_from_logbook(
                    data,
                    context_id=context.id,
                    parent_id=context.parent_id,
                    user_id=context.user_id,
                )
            )

    @callback
    def _enqueue(self, entry: dict[str, Any]) -> None:
        if len(self._queue) >= MAX_QUEUE:
            with self._counter_lock:
                self._dropped += 1
                self.dropped_total += 1
            return
        self._queue.append(entry)
        if not self._draining:
            self._draining = True
            self._drain_future = self.hass.async_add_executor_job(self._drain)

    @callback
    def _drain_done(self) -> None:
        self._drain_future = None
        self._draining = False
        if (self._queue or self._dropped) and self.last_error is None:
            self._draining = True
            self._drain_future = self.hass.async_add_executor_job(self._drain)
            return
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
        if not self.repository.uncommitted:
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

    def _load_secrets(self) -> list[str]:
        """Read exact values from secrets.yaml so they are never written."""
        path = Path(self.hass.config.path("secrets.yaml"))
        try:
            stamp = path.stat().st_mtime_ns
        except OSError:
            return []
        if stamp == self._secrets_stamp:
            return self._secrets
        try:
            import yaml  # noqa: PLC0415

            data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        except Exception:  # noqa: BLE001
            return self._secrets
        self._secrets_stamp = stamp
        if isinstance(data, dict):
            self._secrets = [
                str(v) for v in data.values() if isinstance(v, str | int | float)
            ]
        return self._secrets

    def _drain(self) -> None:
        """Write queued entries to the day files (runs in an executor)."""
        try:
            while True:
                batch: list[dict[str, Any]] = []
                while self._queue and len(batch) < BATCH_SIZE:
                    batch.append(self._queue.popleft())
                with self._counter_lock:
                    dropped, self._dropped = self._dropped, 0
                if not batch and not dropped:
                    break
                secrets = self._load_secrets()
                items = [
                    (day_of(masked), serialize(masked))
                    for masked in (mask_entry(entry, secrets) for entry in batch)
                ]
                if dropped:
                    note = dropped_entry(dropped, time.time())
                    items.append((day_of(note), serialize(note)))
                try:
                    self.repository.append(items)
                except Exception as err:  # noqa: BLE001
                    with self._counter_lock:
                        self._dropped += len(batch)
                        self.dropped_total += len(batch)
                        if dropped:
                            self._dropped += dropped
                    self._note_error(err)
                    break
                self._clear_error()
        except Exception as err:  # noqa: BLE001
            self._note_error(err)
        finally:
            self.hass.loop.call_soon_threadsafe(self._drain_done)

    async def async_stop(self) -> None:
        """Stop listening, write everything queued and commit it."""
        self._stopped = True
        self._unsubscribe()
        if self._tick_unsub is not None:
            self._tick_unsub()
            self._tick_unsub = None
        if self._commit_timer is not None:
            self._commit_timer()
            self._commit_timer = None
        if self._drain_future is not None:
            await self._drain_future
        await self.hass.async_add_executor_job(self._drain)
        try:
            await self.hass.async_add_executor_job(self.repository.commit)
        except Exception as err:  # noqa: BLE001
            self._note_error(err)

    async def async_status(self) -> dict[str, Any]:
        """Return the status of the record."""
        today = dt_util.utcnow().date().isoformat()
        data = await self.hass.async_add_executor_job(self.repository.status, today)
        data.update(
            {
                "recording": self._event_types is not None and not self._stopped,
                "queue_depth": len(self._queue),
                "dropped_total": self.dropped_total,
                "last_error": self.last_error,
                "last_error_at": self.last_error_at,
                "commit_interval": self.commit_interval,
            }
        )
        return data
