"""Keep track of quick actions while they run.

A quick action is an unsaved sequence that runs once. The runner starts it as
a script, remembers it in memory so it can be listed and stopped, and forgets
it a few minutes after it ends. Nothing is written to disk, so a quick action
never survives a restart: every run still going when Home Assistant stops is
stopped and marked as such.
"""

import asyncio
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from datetime import datetime, timedelta
import logging
from typing import Any
from uuid import uuid4

from homeassistant.const import EVENT_HOMEASSISTANT_STOP
from homeassistant.core import CALLBACK_TYPE, Context, Event, HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.event import async_call_later
from homeassistant.helpers.script import Script
from homeassistant.util import dt as dt_util
from homeassistant.util.hass_dict import HassKey

DOMAIN = "quick_action"

# At most this many runs are kept, running or recently ended together.
MAX_RUNS = 20
# How long an ended run stays in the list.
KEEP_ENDED = timedelta(minutes=10)
MAX_LABEL_LENGTH = 100
# How long a stop request waits for the run to wind down.
STOP_WAIT = 10

STATE_RUNNING = "running"
STATE_FINISHED = "finished"
STATE_FAILED = "failed"
STATE_STOPPED = "stopped"

_LOGGER = logging.getLogger(__name__)

DATA_RUNNER: HassKey["QuickActionRunner"] = HassKey(DOMAIN)


class TooManyRunsError(HomeAssistantError):
    """Raised when the run limit is reached by runs that are still going."""


class ShuttingDownError(HomeAssistantError):
    """Raised when a run is started while Home Assistant is stopping."""


@dataclass
class QuickActionRun:
    """One quick action, running or recently ended."""

    run_id: str
    label: str
    entity_id: str | None
    user_id: str | None
    started: datetime
    total_steps: int
    script: Script
    state: str = STATE_RUNNING
    ended: datetime | None = None
    error: str | None = None
    stop_requested: bool = False
    task: asyncio.Task[None] | None = None
    unsub_forget: CALLBACK_TYPE | None = field(default=None, repr=False)

    def as_dict(self) -> dict[str, Any]:
        """Return the run as it is sent to a browser."""
        running = self.state == STATE_RUNNING
        return {
            "id": self.run_id,
            "label": self.label,
            "entity_id": self.entity_id,
            "user_id": self.user_id,
            "started": self.started.isoformat(),
            "ended": self.ended.isoformat() if self.ended else None,
            "state": self.state,
            "total_steps": self.total_steps,
            # The script reports a description of the action it is on, not a
            # position, so the step is sent as text and only while running.
            "current_step": self.script.last_action if running else None,
            "error": self.error,
        }


class QuickActionRunner:
    """Start, list and stop quick actions; memory only."""

    def __init__(self, hass: HomeAssistant) -> None:
        """Start with no runs."""
        self._hass = hass
        self._runs: dict[str, QuickActionRun] = {}
        self._listeners: list[Callable[[], None]] = []
        self._stopping = False
        hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STOP, self._async_shutdown)

    @callback
    def async_add_listener(self, listener: Callable[[], None]) -> CALLBACK_TYPE:
        """Call the listener whenever the list changes."""
        self._listeners.append(listener)

        @callback
        def _remove() -> None:
            self._listeners.remove(listener)

        return _remove

    @callback
    def _notify(self) -> None:
        for listener in list(self._listeners):
            listener()

    @callback
    def async_runs(self) -> list[dict[str, Any]]:
        """Return the runs, newest first."""
        self._forget_old()
        return [
            run.as_dict()
            for run in sorted(
                self._runs.values(), key=lambda run: run.started, reverse=True
            )
        ]

    @callback
    def _forget_old(self) -> None:
        """Drop ended runs older than the keep time."""
        cutoff = dt_util.utcnow() - KEEP_ENDED
        for run_id, run in list(self._runs.items()):
            if run.ended is not None and run.ended <= cutoff:
                self._drop(run_id)

    @callback
    def _drop(self, run_id: str) -> None:
        run = self._runs.pop(run_id, None)
        if run is not None and run.unsub_forget is not None:
            run.unsub_forget()
            run.unsub_forget = None

    @callback
    def _make_room(self) -> None:
        """Forget ended runs, oldest first, until a new run fits."""
        self._forget_old()
        ended = sorted(
            (run for run in self._runs.values() if run.ended is not None),
            key=lambda run: run.ended or run.started,
        )
        while len(self._runs) >= MAX_RUNS and ended:
            self._drop(ended.pop(0).run_id)

    @callback
    def async_start(
        self,
        sequence: Sequence[dict[str, Any]],
        context: Context,
        label: str = "",
        entity_id: str | None = None,
    ) -> str:
        """Start a validated sequence and return its id without waiting for it."""
        if self._stopping or self._hass.is_stopping:
            raise ShuttingDownError("Home Assistant is stopping")
        self._make_room()
        if len(self._runs) >= MAX_RUNS:
            raise TooManyRunsError(
                f"{MAX_RUNS} quick actions are already running; stop one first"
            )
        run_id = uuid4().hex
        script = Script(
            self._hass,
            sequence,
            f"quick action {label}".strip(),
            DOMAIN,
            change_listener=self._notify,
            logger=_LOGGER,
        )
        run = QuickActionRun(
            run_id=run_id,
            label=label,
            entity_id=entity_id,
            user_id=context.user_id,
            started=dt_util.utcnow(),
            total_steps=len(sequence),
            script=script,
        )
        self._runs[run_id] = run
        run.task = self._hass.async_create_background_task(
            self._async_drive(run, context), f"quick_action {run_id}"
        )
        self._notify()
        return run_id

    async def _async_drive(self, run: QuickActionRun, context: Context) -> None:
        """Run the sequence once and record how it ended."""
        try:
            await run.script.async_run(context=context)
        except asyncio.CancelledError:
            self._end(run, STATE_STOPPED)
            raise
        except Exception as err:  # noqa: BLE001
            if run.stop_requested:
                self._end(run, STATE_STOPPED)
            else:
                self._end(run, STATE_FAILED, str(err) or type(err).__name__)
        else:
            self._end(run, STATE_STOPPED if run.stop_requested else STATE_FINISHED)
        finally:
            if not run.script.is_running:
                try:
                    await run.script.async_unload()
                except Exception:  # noqa: BLE001
                    _LOGGER.debug("Could not unload quick action %s", run.run_id)

    @callback
    def _end(self, run: QuickActionRun, state: str, error: str | None = None) -> None:
        if run.ended is not None:
            return
        run.state = state
        run.error = error
        run.ended = dt_util.utcnow()
        if run.run_id in self._runs:

            @callback
            def _forget(_now: datetime) -> None:
                run.unsub_forget = None
                self._drop(run.run_id)
                self._notify()

            run.unsub_forget = async_call_later(
                self._hass, KEEP_ENDED.total_seconds(), _forget
            )
        self._notify()

    async def async_stop(self, run_id: str) -> bool:
        """Stop one run; return False when no such run is known.

        Stopping a run that already ended does nothing and succeeds.
        """
        run = self._runs.get(run_id)
        if run is None:
            return False
        if run.ended is not None:
            return True
        run.stop_requested = True
        await run.script.async_stop()
        if run.task is not None and not run.task.done():
            await asyncio.wait({run.task}, timeout=STOP_WAIT)
        if run.ended is None:
            # The script reported that it stopped; record it even if the
            # task has not finished winding down yet.
            self._end(run, STATE_STOPPED)
        return True

    async def _async_shutdown(self, _event: Event) -> None:
        """Stop every running quick action; none of them survives a restart."""
        self._stopping = True
        running = [run.run_id for run in self._runs.values() if run.ended is None]
        if running:
            await asyncio.gather(*(self.async_stop(run_id) for run_id in running))
        for run in self._runs.values():
            if run.unsub_forget is not None:
                run.unsub_forget()
                run.unsub_forget = None
