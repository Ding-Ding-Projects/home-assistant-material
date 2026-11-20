"""A shared display record of an "Update everything" run.

The browser that starts the run keeps driving it: it installs one update at a
time and decides the order. This record only lets other browsers show the same
progress. It never starts, orders or cancels an install, it lives in memory
only, so it is simply absent after Core starts, and it removes itself when it
has not changed for a while.
"""

from collections.abc import Callable
from datetime import datetime, timedelta
from typing import Any

import probatio

from homeassistant.components import websocket_api
from homeassistant.core import CALLBACK_TYPE, HomeAssistant, callback
from homeassistant.helpers.event import async_call_later
from homeassistant.util import dt as dt_util
from homeassistant.util.hass_dict import HassKey

RUN_EXPIRE_AFTER = timedelta(hours=2)
MAX_RUN_STEPS = 50
RUN_STATES = ("running", "done", "failed", "cancelled")

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
        """Return the record, or None when there is none or it has expired."""
        if self._record is not None and self._expired(dt_util.utcnow()):
            self._drop()
        if self._record is None:
            return None
        return {**self._record, "entity_ids": list(self._record["entity_ids"])}

    @callback
    def async_set(
        self,
        entity_ids: list[str],
        position: int,
        state: str,
        current: str | None = None,
    ) -> None:
        """Store the run as the driving browser last reported it."""
        now = dt_util.utcnow()
        started = now
        if (
            self._record is not None
            and not self._expired(now)
            and self._record["entity_ids"] == entity_ids
        ):
            started = datetime.fromisoformat(self._record["started"])
        self._record = {
            "entity_ids": list(entity_ids),
            "position": position,
            "total": len(entity_ids),
            "state": state,
            "current": current,
            "started": started.isoformat(),
            "updated": now.isoformat(),
        }
        self._schedule_expiry()
        self._notify()

    @callback
    def async_clear(self) -> None:
        """Remove the record."""
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

    def _expired(self, now: datetime) -> bool:
        if self._record is None:
            return False
        updated = datetime.fromisoformat(self._record["updated"])
        return now - updated >= RUN_EXPIRE_AFTER

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

        @callback
        def _expire(_now: datetime) -> None:
            self._unsub_expire = None
            if self._record is not None:
                self._drop()

        self._unsub_expire = async_call_later(
            self._hass, RUN_EXPIRE_AFTER, _expire
        )

    @callback
    def _notify(self) -> None:
        for listener in list(self._listeners):
            listener()


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
    hass.data[DATA_RUN_RECORD].async_set(
        entity_ids, msg["position"], msg["state"], current
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
