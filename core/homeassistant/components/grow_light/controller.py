"""Drive a grow light plug from its on hours and door sensors."""

from collections.abc import Callable
from datetime import datetime
import logging

from homeassistant.const import (
    ATTR_ENTITY_ID,
    SERVICE_TURN_OFF,
    SERVICE_TURN_ON,
    STATE_OFF,
    STATE_ON,
)
from homeassistant.core import (
    CALLBACK_TYPE,
    Event,
    EventStateChangedData,
    HomeAssistant,
    callback,
)
from homeassistant.helpers.event import (
    async_track_point_in_time,
    async_track_state_change_event,
)
from homeassistant.util import dt as dt_util

from .const import STATUS_OFF_HOURS, STATUS_ON, STATUS_PAUSED, STATUS_SCHEDULE_OFF
from .schedule import OnHours

_LOGGER = logging.getLogger(__name__)

HA_DOMAIN = "homeassistant"


class GrowLightController:
    """Keep the plug on inside the on hours unless a door is open."""

    def __init__(
        self, hass: HomeAssistant, plug: str, on_hours: OnHours, doors: list[str]
    ) -> None:
        """Store the settings; nothing runs until async_start."""
        self.hass = hass
        self.plug = plug
        self.on_hours = on_hours
        self.doors = doors
        self.enabled = True
        self.status = STATUS_OFF_HOURS
        self.next_change: datetime | None = None
        self._unsubs: list[CALLBACK_TYPE] = []
        self._unsub_timer: CALLBACK_TYPE | None = None
        self._listeners: list[Callable[[], None]] = []

    @callback
    def async_add_listener(self, listener: Callable[[], None]) -> CALLBACK_TYPE:
        """Call listener whenever the status changes."""
        self._listeners.append(listener)
        return lambda: self._listeners.remove(listener)

    @callback
    def async_start(self) -> None:
        """Watch the doors and the plug, then apply the current state."""
        if self.doors:
            self._unsubs.append(
                async_track_state_change_event(self.hass, self.doors, self._handle_door)
            )
        self._unsubs.append(
            async_track_state_change_event(self.hass, [self.plug], self._handle_plug)
        )
        self.async_evaluate()

    @callback
    def async_stop(self) -> None:
        """Stop watching and cancel the timer."""
        for unsub in self._unsubs:
            unsub()
        self._unsubs.clear()
        self._cancel_timer()

    @callback
    def async_set_enabled(self, enabled: bool) -> None:
        """Turn the schedule on or off; turning it off switches the plug off."""
        self.enabled = enabled
        self.async_evaluate()

    def open_doors(self) -> list[str]:
        """Door sensors that currently report open."""
        return [
            door
            for door in self.doors
            if (state := self.hass.states.get(door)) is not None
            and state.state == STATE_ON
        ]

    @callback
    def async_evaluate(self) -> None:
        """Work out the wanted plug state, apply it and schedule the next check."""
        now = dt_util.now()
        in_hours = self.on_hours.is_on(now)
        if not self.enabled:
            status = STATUS_SCHEDULE_OFF
        elif not in_hours:
            status = STATUS_OFF_HOURS
        elif self.open_doors():
            status = STATUS_PAUSED
        else:
            status = STATUS_ON
        self.status = status
        self._apply(status == STATUS_ON)
        self._schedule(now)
        for listener in list(self._listeners):
            listener()

    def _apply(self, want_on: bool) -> None:
        state = self.hass.states.get(self.plug)
        if state is None or state.state not in (STATE_ON, STATE_OFF):
            return
        if (state.state == STATE_ON) == want_on:
            return
        self.hass.async_create_task(
            self.hass.services.async_call(
                HA_DOMAIN,
                SERVICE_TURN_ON if want_on else SERVICE_TURN_OFF,
                {ATTR_ENTITY_ID: self.plug},
                blocking=False,
            )
        )

    def _cancel_timer(self) -> None:
        if self._unsub_timer is not None:
            self._unsub_timer()
            self._unsub_timer = None

    def _schedule(self, now: datetime) -> None:
        self._cancel_timer()
        self.next_change = self.on_hours.next_change(now) if self.enabled else None
        if self.next_change is not None:
            self._unsub_timer = async_track_point_in_time(
                self.hass, self._handle_timer, self.next_change
            )

    @callback
    def _handle_timer(self, _now: datetime) -> None:
        self._unsub_timer = None
        self.async_evaluate()

    @callback
    def _handle_door(self, event: Event[EventStateChangedData]) -> None:
        old = event.data["old_state"]
        new = event.data["new_state"]
        if (old and old.state) == (new and new.state):
            return
        self.async_evaluate()

    @callback
    def _handle_plug(self, event: Event[EventStateChangedData]) -> None:
        old = event.data["old_state"]
        new = event.data["new_state"]
        # A plug that comes back online gets the current state; manual
        # switching while online is left alone until the next change.
        if new is None or new.state not in (STATE_ON, STATE_OFF):
            return
        if old is not None and old.state in (STATE_ON, STATE_OFF):
            return
        self.async_evaluate()
