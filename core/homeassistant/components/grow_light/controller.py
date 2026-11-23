"""Drive a grow light plug, and optionally a watering switch, from a schedule."""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
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
from .plants import Plant, StageNow
from .schedule import OnHours

_LOGGER = logging.getLogger(__name__)

HA_DOMAIN = "homeassistant"
DAY = timedelta(days=1)


@dataclass(frozen=True, slots=True)
class GrowLightSettings:
    """What the helper was set up with."""

    plug: str
    start: time
    hours: float
    doors: list[str]
    plant: Plant | None = None
    planted_on: date | None = None
    water_days: int = 0
    water_switch: str | None = None
    water_minutes: float = 0


class GrowLightController:
    """Keep the plug on inside the on hours unless a door is open, and water."""

    def __init__(self, hass: HomeAssistant, settings: GrowLightSettings) -> None:
        """Store the settings; nothing runs until async_start."""
        self.hass = hass
        self.settings = settings
        self.plug = settings.plug
        self.doors = settings.doors
        self.enabled = True
        self.status = STATUS_OFF_HOURS
        self.next_change: datetime | None = None
        self.last_watered: datetime | None = None
        self.next_watering: datetime | None = None
        self.watering = False
        self._started = False
        self._unsubs: list[CALLBACK_TYPE] = []
        self._unsub_timer: CALLBACK_TYPE | None = None
        self._unsub_water_timer: CALLBACK_TYPE | None = None
        self._unsub_water_stop: CALLBACK_TYPE | None = None
        self._listeners: list[Callable[[], None]] = []

    @property
    def plant(self) -> Plant | None:
        """The crop being grown, if one was picked."""
        return self.settings.plant

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
        self._started = True
        self.async_evaluate()

    @callback
    def async_stop(self) -> None:
        """Stop watching, cancel the timers and end a watering run."""
        for unsub in self._unsubs:
            unsub()
        self._unsubs.clear()
        self._cancel_timer()
        self._cancel_water_timer()
        if self._unsub_water_stop is not None:
            self._unsub_water_stop()
            self._unsub_water_stop = None
            self._switch(self.settings.water_switch, False)
        self._started = False

    @callback
    def async_set_enabled(self, enabled: bool) -> None:
        """Turn the schedule on or off; turning it off switches the plug off."""
        self.enabled = enabled
        self.async_evaluate()

    @callback
    def async_restore_last_watered(self, when: datetime) -> None:
        """Last watering time from before a restart."""
        self.last_watered = when
        if self._started:
            self.async_evaluate()

    @callback
    def async_mark_watered(self) -> None:
        """Record a watering done by hand."""
        self.last_watered = dt_util.now()
        self.async_evaluate()

    def open_doors(self) -> list[str]:
        """Door sensors that currently report open."""
        return [
            door
            for door in self.doors
            if (state := self.hass.states.get(door)) is not None
            and state.state == STATE_ON
        ]

    def stage_now(self, now: datetime | None = None) -> StageNow | None:
        """Where the crop is today, if a crop was picked."""
        settings = self.settings
        if settings.plant is None or settings.planted_on is None:
            return None
        day = (now or dt_util.now()).date()
        return settings.plant.stage_on(settings.planted_on, day)

    def on_hours(self, now: datetime) -> OnHours:
        """Today's on hours; with a crop they follow the stage of the day the window started."""
        settings = self.settings
        if settings.plant is None or settings.planted_on is None:
            return OnHours(settings.start, settings.hours)
        window_day = OnHours(settings.start, 1).window_start(now).date()
        stage = settings.plant.stage_on(settings.planted_on, window_day).stage
        return OnHours(settings.start, stage.light_hours)

    def water_every_days(self, now: datetime | None = None) -> int:
        """Watering interval now, 0 when there is no watering schedule."""
        if (stage_now := self.stage_now(now)) is not None:
            return stage_now.stage.water_every_days
        return self.settings.water_days

    @callback
    def async_evaluate(self) -> None:
        """Work out the wanted states, apply them and schedule the next check."""
        now = dt_util.now()
        on_hours = self.on_hours(now)
        if not self.enabled:
            status = STATUS_SCHEDULE_OFF
        elif not on_hours.is_on(now):
            status = STATUS_OFF_HOURS
        elif self.open_doors():
            status = STATUS_PAUSED
        else:
            status = STATUS_ON
        self.status = status
        self._apply(status == STATUS_ON)
        self._schedule(now, on_hours)
        self._schedule_watering(now)
        for listener in list(self._listeners):
            listener()

    def _switch(self, entity_id: str | None, want_on: bool) -> None:
        if entity_id is None:
            return
        self.hass.async_create_task(
            self.hass.services.async_call(
                HA_DOMAIN,
                SERVICE_TURN_ON if want_on else SERVICE_TURN_OFF,
                {ATTR_ENTITY_ID: entity_id},
                blocking=False,
            )
        )

    def _apply(self, want_on: bool) -> None:
        state = self.hass.states.get(self.plug)
        if state is None or state.state not in (STATE_ON, STATE_OFF):
            return
        if (state.state == STATE_ON) == want_on:
            return
        self._switch(self.plug, want_on)

    def _cancel_timer(self) -> None:
        if self._unsub_timer is not None:
            self._unsub_timer()
            self._unsub_timer = None

    def _cancel_water_timer(self) -> None:
        if self._unsub_water_timer is not None:
            self._unsub_water_timer()
            self._unsub_water_timer = None

    def _schedule(self, now: datetime, on_hours: OnHours) -> None:
        self._cancel_timer()
        self.next_change = on_hours.next_change(now) if self.enabled else None
        wake = self.next_change
        if self.enabled and self.settings.plant is not None:
            # The stage, and with it the hours, can change at the next window start.
            next_window = OnHours(self.settings.start, 1).window_start(now) + DAY
            wake = next_window if wake is None else min(wake, next_window)
        if wake is not None:
            self._unsub_timer = async_track_point_in_time(
                self.hass, self._handle_timer, wake
            )

    def _schedule_watering(self, now: datetime) -> None:
        self._cancel_water_timer()
        interval = self.water_every_days(now)
        if not interval:
            self.next_watering = None
            return
        if self.last_watered is not None:
            first_day = dt_util.as_local(self.last_watered).date() + timedelta(
                days=interval
            )
        else:
            first_day = self.settings.planted_on or now.date()
        self.next_watering = dt_util.as_local(
            datetime.combine(first_day, self.settings.start, tzinfo=now.tzinfo)
        )
        if (
            not self.enabled
            or self.settings.water_switch is None
            or self._unsub_water_stop is not None
        ):
            return
        if self.next_watering <= now:
            self._start_watering(now)
            return
        self._unsub_water_timer = async_track_point_in_time(
            self.hass, self._handle_water_timer, self.next_watering
        )

    def _start_watering(self, now: datetime) -> None:
        self.last_watered = now
        self.watering = True
        self._switch(self.settings.water_switch, True)
        self._unsub_water_stop = async_track_point_in_time(
            self.hass,
            self._handle_water_stop,
            now + timedelta(minutes=self.settings.water_minutes),
        )
        self._schedule_watering(now)

    @callback
    def _handle_timer(self, _now: datetime) -> None:
        self._unsub_timer = None
        self.async_evaluate()

    @callback
    def _handle_water_timer(self, _now: datetime) -> None:
        self._unsub_water_timer = None
        self.async_evaluate()

    @callback
    def _handle_water_stop(self, _now: datetime) -> None:
        self._unsub_water_stop = None
        self.watering = False
        self._switch(self.settings.water_switch, False)
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
