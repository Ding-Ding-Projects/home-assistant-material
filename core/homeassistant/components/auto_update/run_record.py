"""A shared display record of an "Update everything" run.

The browser that starts the run keeps driving it: it installs one update at a
time and decides the order. This record only lets other browsers show the same
progress. It never starts, orders or cancels an install, it lives in memory
only, so it is simply absent after Core starts, and it removes itself when the
driving browser has not reported for a while.

The driving browser reports on every change and, while the run is going, at a
short interval as well. The server stamps each report itself as `last_seen`,
so other browsers can tell a run that is still being driven from one whose
browser was closed.
"""

from collections.abc import Callable
from datetime import datetime, timedelta
from typing import Any

import probatio

from homeassistant.components import websocket_api
from homeassistant.components.update.const import ATTR_IN_PROGRESS
from homeassistant.core import CALLBACK_TYPE, HomeAssistant, callback
from homeassistant.helpers.event import async_call_later
from homeassistant.util import dt as dt_util
from homeassistant.util.hass_dict import HassKey

RUN_EXPIRE_AFTER = timedelta(hours=2)
# A running or failed run whose browser has not reported for this long, and
# none of whose updates is still installing, is removed. The driving browser
# reports every 30 seconds while the run goes (once a minute when its tab is in
# the background), and other browsers call it silent after 5 minutes; this is
# three times that, so a browser that only reloads or wakes up never loses
# its run, and a closed one frees the record within a quarter of an hour.
DRIVER_SILENT_EXPIRE_AFTER = timedelta(minutes=15)
# How often a silent record is looked at again while an update in it installs.
SILENT_RECHECK = timedelta(minutes=1)
# States in which the run still waits for its driving browser.
DRIVEN_STATES = ("running", "failed")
MAX_RUN_STEPS = 50
RUN_STATES = ("running", "done", "failed", "cancelled")
# A reported start older than this, or later than now, is ignored.
MAX_REPORTED_START_AGE = timedelta(days=1)
# Allowance for a browser clock that runs slightly ahead of the server.
START_CLOCK_SKEW = timedelta(minutes=1)

DATA_RUN_RECORD: HassKey["UpdateRunRecord"] = HassKey("auto_update_run_record")


class UpdateRunRecord:
    """Hold the progress of the current run for display."""

    def __init__(self, hass: HomeAssistant) -> None:
        """Start without a record."""
        self._hass = hass
        self._record: dict[str, Any] | None = None
        self._listeners: list[Callable[[], None]] = []
        self._unsub_expire: CALLBACK_TYPE | None = None

    @callback
    def async_get(self) -> dict[str, Any] | None:
        """Return the record, or None when there is none or it has expired.

        `seen_ago` is how many whole seconds ago the driving browser last
        reported, measured on the server clock when the record is read.
        """
        now = dt_util.utcnow()
        if self._record is not None and self._expired(now):
            self._drop()
        if self._record is None:
            return None
        last_seen = datetime.fromisoformat(self._record["last_seen"])
        return {
            **self._record,
            "entity_ids": list(self._record["entity_ids"]),
            "seen_ago": max(0, int((now - last_seen).total_seconds())),
        }

    @callback
    def async_set(
        self,
        entity_ids: list[str],
        position: int,
        state: str,
        current: str | None = None,
        reported_started: datetime | None = None,
    ) -> None:
        """Store the run as the driving browser last reported it.

        The driving browser's own start time wins when it is plausible, so a
        Core restart in the middle of a run, which empties this record, does not
        move the start to the next report. `updated` moves only when the
        reported run changed; `last_seen` moves with every report.
        """
        now = dt_util.utcnow()
        previous = (
            self._record
            if self._record is not None and not self._expired(now)
            else None
        )
        started = now
        if reported_started is not None and _plausible_start(reported_started, now):
            started = min(reported_started, now)
        elif previous is not None and previous["entity_ids"] == entity_ids:
            started = datetime.fromisoformat(previous["started"])
        started = dt_util.as_utc(started)
        record: dict[str, Any] = {
            "entity_ids": list(entity_ids),
            "position": position,
            "total": len(entity_ids),
            "state": state,
            "current": current,
            "started": started.isoformat(),
        }
        unchanged = previous is not None and all(
            previous[key] == value for key, value in record.items()
        )
        record["updated"] = previous["updated"] if unchanged else now.isoformat()
        record["last_seen"] = now.isoformat()
        self._record = record
        self._schedule_expiry()
        self._notify()

    @callback
    def async_clear(self) -> None:
        """Remove the record. Installs that are running are not touched."""
        if self._record is None:
            return
        self._drop()

    @callback
    def async_add_listener(self, listener: Callable[[], None]) -> CALLBACK_TYPE:
        """Call the listener whenever the record changes."""
        self._listeners.append(listener)

        @callback
        def _remove() -> None:
            if listener in self._listeners:
                self._listeners.remove(listener)

        return _remove

    def _installing(self) -> bool:
        """Return whether an update of the run is still installing."""
        if self._record is None:
            return False
        for entity_id in self._record["entity_ids"]:
            state = self._hass.states.get(entity_id)
            if state is not None and state.attributes.get(ATTR_IN_PROGRESS):
                return True
        return False

    def _expired(self, now: datetime) -> bool:
        if self._record is None:
            return False
        silent_for = now - datetime.fromisoformat(self._record["last_seen"])
        if silent_for >= RUN_EXPIRE_AFTER:
            return True
        return (
            self._record["state"] in DRIVEN_STATES
            and silent_for >= DRIVER_SILENT_EXPIRE_AFTER
            and not self._installing()
        )

    def _next_check(self, now: datetime) -> timedelta:
        """Return how long until the record may have expired."""
        record = self._record
        if record is None:
            return RUN_EXPIRE_AFTER
        last_seen = datetime.fromisoformat(record["last_seen"])
        deadline = last_seen + RUN_EXPIRE_AFTER
        if record["state"] in DRIVEN_STATES:
            silent_deadline = last_seen + DRIVER_SILENT_EXPIRE_AFTER
            if silent_deadline <= now:
                # Silent, but an update still installs: look again later.
                silent_deadline = now + SILENT_RECHECK
            deadline = min(deadline, silent_deadline)
        return max(deadline - now, timedelta(0))

    @callback
    def _drop(self) -> None:
        self._record = None
        if self._unsub_expire is not None:
            self._unsub_expire()
            self._unsub_expire = None
        self._notify()

    @callback
    def _schedule_expiry(self) -> None:
        if self._unsub_expire is not None:
            self._unsub_expire()
            self._unsub_expire = None
        if self._record is None:
            return

        @callback
        def _expire(_now: datetime) -> None:
            self._unsub_expire = None
            if self._record is None:
                return
            if self._expired(dt_util.utcnow()):
                self._drop()
            else:
                self._schedule_expiry()

        self._unsub_expire = async_call_later(
            self._hass, self._next_check(dt_util.utcnow()), _expire
        )


    @callback
    def _notify(self) -> None:
        for listener in list(self._listeners):
            listener()


def _plausible_start(started: datetime, now: datetime) -> bool:
    """Return whether a reported start time can be the start of a current run."""
    if started.tzinfo is None:
        return False
    return now - MAX_REPORTED_START_AGE <= started <= now + START_CLOCK_SKEW


@callback
def async_setup_run_record(hass: HomeAssistant) -> None:
    """Create the record and register its websocket commands."""
    hass.data[DATA_RUN_RECORD] = UpdateRunRecord(hass)
    websocket_api.async_register_command(hass, websocket_run_get)
    websocket_api.async_register_command(hass, websocket_run_set)
    websocket_api.async_register_command(hass, websocket_run_clear)
    websocket_api.async_register_command(hass, websocket_run_subscribe)


@websocket_api.require_admin
@websocket_api.websocket_command({probatio.Required("type"): "auto_update/run/get"})
@callback
def websocket_run_get(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Send the current run, or None."""
    connection.send_result(msg["id"], hass.data[DATA_RUN_RECORD].async_get())


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "auto_update/run/set",
        probatio.Required("entity_ids"): probatio.All(
            [str], probatio.Length(min=1, max=MAX_RUN_STEPS)
        ),
        probatio.Required("position"): probatio.All(int, probatio.Range(min=1)),
        probatio.Required("state"): probatio.In(list(RUN_STATES)),
        probatio.Optional("current"): probatio.Any(str, None),
        probatio.Optional("started"): probatio.All(str, probatio.Length(max=64)),
    }
)
@callback
def websocket_run_set(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Store the run the driving browser reports; it installs nothing."""
    entity_ids: list[str] = msg["entity_ids"]
    if len(set(entity_ids)) != len(entity_ids):
        connection.send_error(msg["id"], "invalid_format", "Duplicate entity id")
        return
    for entity_id in entity_ids:
        if not entity_id.startswith("update.") or hass.states.get(entity_id) is None:
            connection.send_error(
                msg["id"], "invalid_format", f"Not a known update entity: {entity_id}"
            )
            return
    if msg["position"] > len(entity_ids):
        connection.send_error(
            msg["id"], "invalid_format", "The position is past the last update"
        )
        return
    current = msg.get("current")
    if current is not None and current not in entity_ids:
        connection.send_error(
            msg["id"], "invalid_format", "The current update is not part of the run"
        )
        return
    reported_started: datetime | None = None
    if (raw_started := msg.get("started")) is not None:
        reported_started = dt_util.parse_datetime(raw_started)
        if reported_started is None:
            connection.send_error(
                msg["id"], "invalid_format", "The start time is not a timestamp"
            )
            return
    hass.data[DATA_RUN_RECORD].async_set(
        entity_ids, msg["position"], msg["state"], current, reported_started
    )
    connection.send_result(msg["id"])


@websocket_api.require_admin
@websocket_api.websocket_command({probatio.Required("type"): "auto_update/run/clear"})
@callback
def websocket_run_clear(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Remove the run record."""
    hass.data[DATA_RUN_RECORD].async_clear()
    connection.send_result(msg["id"])


@websocket_api.require_admin
@websocket_api.websocket_command(
    {probatio.Required("type"): "auto_update/run/subscribe"}
)
@callback
def websocket_run_subscribe(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Send the run now and again whenever it changes or expires."""
    record = hass.data[DATA_RUN_RECORD]

    @callback
    def _send() -> None:
        connection.send_message(
            websocket_api.event_message(msg["id"], {"run": record.async_get()})
        )

    connection.subscriptions[msg["id"]] = record.async_add_listener(_send)
    connection.send_result(msg["id"])
    _send()
