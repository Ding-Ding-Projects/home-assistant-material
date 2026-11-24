"""Local push coordinator for the Printer door integration."""

from collections.abc import Callable
from dataclasses import dataclass, field, replace
from datetime import date, datetime
import logging
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_HOST
from homeassistant.core import CALLBACK_TYPE, HomeAssistant, callback
from homeassistant.helpers.event import async_track_time_change
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator
from homeassistant.util import dt as dt_util

from .const import (
    BUS_EVENT_OPENED_WHILE_PRINTING,
    CONF_ACCESS_CODE,
    CONF_SERIAL,
    DOMAIN,
    EVENT_CLOSED,
    EVENT_OPENED,
    EVENT_OPENED_WHILE_PRINTING,
    STATUS_PRINTING,
)
from .door import read_doors, read_status
from .link import PrinterLink

_LOGGER = logging.getLogger(__name__)

type PrinterDoorConfigEntry = ConfigEntry[PrinterDoorCoordinator]


@dataclass(frozen=True)
class PrinterDoorData:
    """What is known about the printer right now."""

    doors: dict[str, bool] = field(default_factory=dict)
    supported: bool | None = None
    status: str | None = None
    progress: int | None = None
    open_count: int = 0
    open_count_day: date | None = None
    last_opened: datetime | None = None

    @property
    def door_open(self) -> bool | None:
        """True when any known door is open, None before the first reading."""
        if not self.doors:
            return None
        return any(self.doors.values())


class PrinterDoorCoordinator(DataUpdateCoordinator[PrinterDoorData]):
    """Pushes door and print state from the printer's local MQTT link."""

    config_entry: PrinterDoorConfigEntry

    def __init__(self, hass: HomeAssistant, entry: PrinterDoorConfigEntry) -> None:
        """Create the coordinator; call async_start to connect."""
        super().__init__(
            hass,
            _LOGGER,
            config_entry=entry,
            name=f"{DOMAIN}_{entry.data[CONF_SERIAL]}",
        )
        self.data = PrinterDoorData()
        self.last_update_success = False
        self._door_listeners: list[Callable[[str], None]] = []
        self._link = PrinterLink(
            entry.data[CONF_HOST],
            entry.data[CONF_SERIAL],
            entry.data[CONF_ACCESS_CODE],
            self._report_from_thread,
            self._state_from_thread,
            self._auth_failed_from_thread,
        )
        self._midnight_unsub: CALLBACK_TYPE | None = None

    async def async_start(self) -> None:
        """Connect, and refresh the daily counter at midnight."""
        self._midnight_unsub = async_track_time_change(
            self.hass, self._midnight, hour=0, minute=0, second=0
        )
        await self.hass.async_add_executor_job(self._link.start)

    async def async_stop(self) -> None:
        """Disconnect."""
        if self._midnight_unsub is not None:
            self._midnight_unsub()
            self._midnight_unsub = None
        await self.hass.async_add_executor_job(self._link.stop)

    @callback
    def async_add_door_listener(self, listener: Callable[[str], None]) -> CALLBACK_TYPE:
        """Call listener with the event type whenever a door event happens."""
        self._door_listeners.append(listener)

        @callback
        def remove() -> None:
            self._door_listeners.remove(listener)

        return remove

    def _report_from_thread(self, report: dict[str, Any]) -> None:
        self.hass.loop.call_soon_threadsafe(self._handle_report, report)

    def _state_from_thread(self, connected: bool) -> None:
        self.hass.loop.call_soon_threadsafe(self._handle_connection, connected)

    def _auth_failed_from_thread(self) -> None:
        self.hass.loop.call_soon_threadsafe(self._handle_auth_failed)

    @callback
    def _handle_connection(self, connected: bool) -> None:
        if connected == self.last_update_success:
            return
        self.last_update_success = connected
        self.async_update_listeners()

    @callback
    def _handle_auth_failed(self) -> None:
        self.config_entry.async_start_reauth(self.hass)
        self.hass.async_create_task(self.async_stop())

    @callback
    def _midnight(self, _now: datetime) -> None:
        self.async_update_listeners()

    @callback
    def _handle_report(self, report: dict[str, Any]) -> None:
        """Merge one, possibly partial, report into the state."""
        print_data = report.get("print")
        if not isinstance(print_data, dict):
            return
        data = self.data
        supported, doors = read_doors(print_data)
        changes: dict[str, Any] = {}
        if supported is not None:
            changes["supported"] = supported
        if (status := read_status(print_data.get("gcode_state"))) is not None:
            changes["status"] = status
        percent = print_data.get("mc_percent")
        if isinstance(percent, (int, float)) and not isinstance(percent, bool):
            changes["progress"] = max(0, min(100, int(percent)))

        changes["doors"] = {**data.doors, **doors}
        # The first reading of a door only records it; it is not an opening.
        opened = [d for d, v in doors.items() if v and data.doors.get(d) is False]
        closed = [d for d, v in doors.items() if not v and data.doors.get(d) is True]

        now = dt_util.now()
        today = now.date()
        count = data.open_count if data.open_count_day == today else 0
        if opened:
            count += len(opened)
            changes["last_opened"] = now
        changes["open_count"] = count
        changes["open_count_day"] = today

        new_data = replace(data, **changes)
        self.last_update_success = True
        self.async_set_updated_data(new_data)

        for door in opened:
            self._fire(EVENT_OPENED)
            if new_data.status == STATUS_PRINTING:
                self._fire(EVENT_OPENED_WHILE_PRINTING)
                self.hass.bus.async_fire(
                    BUS_EVENT_OPENED_WHILE_PRINTING,
                    {
                        "entry_id": self.config_entry.entry_id,
                        "name": self.config_entry.title,
                        "door": door,
                        "progress": new_data.progress,
                    },
                )
        for _door in closed:
            self._fire(EVENT_CLOSED)

    def _fire(self, event_type: str) -> None:
        for listener in list(self._door_listeners):
            listener(event_type)
