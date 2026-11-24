"""Drive a grow light plug, and optionally a watering switch, from a schedule."""

from collections.abc import Callable
from dataclasses import dataclass, field
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
    State,
    callback,
)
from homeassistant.helpers.event import (
    async_track_point_in_time,
    async_track_state_change_event,
)
from homeassistant.util import dt as dt_util

from .const import (
    ALERT_READY_TO_HARVEST,
    ALERT_SOIL_DRY,
    ALERT_SOW_NEXT,
    ALERT_STAGE_CHANGED,
    ALERT_WATER_DUE,
    ALERT_WATERED,
    EVENT_ALERT,
    STATUS_OFF_HOURS,
    STATUS_ON,
    STATUS_PAUSED,
    STATUS_SCHEDULE_OFF,
)
from .plants import Plant, StageNow
from .schedule import OnHours

_LOGGER = logging.getLogger(__name__)

HA_DOMAIN = "homeassistant"
NOTIFY_DOMAIN = "notify"
DAY = timedelta(days=1)
# A dry reading soon after watering is the water still soaking in.
SOIL_DRY_GAP = timedelta(hours=6)

STAGE_NAMES = {
    "germination": "germination",
    "seedling": "seedling",
    "vegetative": "leafy growth",
    "flowering": "flowering",
    "fruiting": "fruiting",
    "harvest": "harvest",
}


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
    name: str = "Grow light"
    notify: list[str] = field(default_factory=list)
    moisture: str | None = None
    dry_below: float = 30.0
    watts: float = 0.0
    power: str | None = None
    price: float = 0.0
    resow_days: int = 0


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
        self.next_sowing: datetime | None = None
        self.watering = False
        self.energy_kwh = 0.0
        self._power_w = 0.0
        self._power_since: datetime | None = None
        self._postponed_to: datetime | None = None
        self._alerted_due: datetime | None = None
        self._stage_key: str | None = None
        self._started = False
        self._unsubs: list[CALLBACK_TYPE] = []
        self._unsub_timer: CALLBACK_TYPE | None = None
        self._unsub_water_timer: CALLBACK_TYPE | None = None
        self._unsub_water_stop: CALLBACK_TYPE | None = None
        self._unsub_sow_timer: CALLBACK_TYPE | None = None
        self._listeners: list[Callable[[], None]] = []
        self._alert_listeners: list[Callable[[str, str], None]] = []

    @property
    def plant(self) -> Plant | None:
        """The crop being grown, if one was picked."""
        return self.settings.plant

    @property
    def tracks_energy(self) -> bool:
        """Whether the light's power is known, from a sensor or its rating."""
        return self.settings.power is not None or self.settings.watts > 0

    @callback
    def async_add_listener(self, listener: Callable[[], None]) -> CALLBACK_TYPE:
        """Call listener whenever the status changes."""
        self._listeners.append(listener)
        return lambda: self._listeners.remove(listener)

    @callback
    def async_add_alert_listener(
        self, listener: Callable[[str, str], None]
    ) -> CALLBACK_TYPE:
        """Call listener with the kind and message of every alert."""
        self._alert_listeners.append(listener)
        return lambda: self._alert_listeners.remove(listener)

    @callback
    def async_start(self) -> None:
        """Watch the doors, plug and sensors, then apply the current state."""
        if self.doors:
            self._unsubs.append(
                async_track_state_change_event(self.hass, self.doors, self._handle_door)
            )
        self._unsubs.append(
            async_track_state_change_event(self.hass, [self.plug], self._handle_plug)
        )
        if self.settings.power is not None:
            self._unsubs.append(
                async_track_state_change_event(
                    self.hass, [self.settings.power], self._handle_power
                )
            )
        if self.settings.moisture is not None:
            self._unsubs.append(
                async_track_state_change_event(
                    self.hass, [self.settings.moisture], self._handle_moisture
                )
            )
        if (stage_now := self.stage_now()) is not None:
            # Only changes after startup are news.
            self._stage_key = stage_now.stage.key
        self._started = True
        self._update_power(dt_util.utcnow())
        self.async_evaluate()

    @callback
    def async_stop(self) -> None:
        """Stop watching, cancel the timers and end a watering run."""
        for unsub in self._unsubs:
            unsub()
        self._unsubs.clear()
        self._update_power(dt_util.utcnow())
        self._cancel_timer()
        self._cancel_water_timer()
        if self._unsub_sow_timer is not None:
            self._unsub_sow_timer()
            self._unsub_sow_timer = None
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
    def async_restore_energy(self, kwh: float) -> None:
        """Energy counted before a restart."""
        self.energy_kwh += kwh

    @callback
    def async_mark_watered(self) -> None:
        """Record a watering done by hand."""
        self.last_watered = dt_util.now()
        self._postponed_to = None
        self.async_evaluate()

    def energy_now(self) -> float:
        """Energy used by the light so far, in kWh."""
        if self._power_since is None:
            return self.energy_kwh
        hours = (dt_util.utcnow() - self._power_since).total_seconds() / 3600
        return self.energy_kwh + self._power_w * hours / 1000

    def cost_now(self) -> float:
        """Cost of the energy so far at the set price."""
        return self.energy_now() * self.settings.price

    def soil_moisture(self) -> float | None:
        """The soil moisture reading, if a sensor is set and reports a number."""
        if self.settings.moisture is None:
            return None
        state = self.hass.states.get(self.settings.moisture)
        try:
            return float(state.state) if state is not None else None
        except ValueError:
            return None

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
        self._check_stage(now)
        self._schedule(now, on_hours)
        self._schedule_watering(now)
        self._schedule_sowing(now)
        for listener in list(self._listeners):
            listener()

    def _crop_name(self) -> str:
        if self.plant is not None:
            return self.plant.name
        return self.settings.name

    def _alert(self, kind: str, message: str) -> None:
        """Send an alert to the event entity, the event bus and the notify targets."""
        self.hass.bus.async_fire(
            EVENT_ALERT,
            {"name": self.settings.name, "kind": kind, "message": message},
        )
        for listener in list(self._alert_listeners):
            listener(kind, message)
        for target in self.settings.notify:
            domain, _, service = target.partition(".")
            if domain != NOTIFY_DOMAIN or not service:
                continue
            if not self.hass.services.has_service(NOTIFY_DOMAIN, service):
                _LOGGER.warning(
                    "%s: notify target %s not found", self.settings.name, target
                )
                continue
            self.hass.async_create_task(
                self.hass.services.async_call(
                    NOTIFY_DOMAIN,
                    service,
                    {"title": self.settings.name, "message": message},
                    blocking=False,
                )
            )

    def _check_stage(self, now: datetime) -> None:
        if (stage_now := self.stage_now(now)) is None:
            return
        key = stage_now.stage.key
        if self._stage_key is None or key == self._stage_key:
            self._stage_key = key
            return
        self._stage_key = key
        if key == "harvest":
            self._alert(
                ALERT_READY_TO_HARVEST,
                f"{self._crop_name()} is ready to harvest.",
            )
        else:
            self._alert(
                ALERT_STAGE_CHANGED,
                f"{self._crop_name()} moved to {STAGE_NAMES.get(key, key)}: "
                f"{stage_now.stage.light_hours:g} hours of light a day, "
                f"water every {stage_now.stage.water_every_days} days.",
            )

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

    def _update_power(self, now: datetime) -> None:
        """Add the energy since the last change, then take the current power."""
        if not self.tracks_energy:
            return
        if self._power_since is not None:
            hours = (now - self._power_since).total_seconds() / 3600
            self.energy_kwh += self._power_w * max(hours, 0) / 1000
        self._power_since = now
        plug = self.hass.states.get(self.plug)
        if plug is None or plug.state != STATE_ON:
            self._power_w = 0.0
            return
        if self.settings.power is not None:
            power = self.hass.states.get(self.settings.power)
            try:
                self._power_w = float(power.state) if power is not None else 0.0
            except ValueError:
                self._power_w = 0.0
            return
        self._power_w = self.settings.watts

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
        due = dt_util.as_local(
            datetime.combine(first_day, self.settings.start, tzinfo=now.tzinfo)
        )
        if self._postponed_to is not None and self._postponed_to > due:
            due = self._postponed_to
        self.next_watering = due
        if not self.enabled or self._unsub_water_stop is not None:
            return
        if due <= now:
            self._water_due(now, due)
            return
        self._unsub_water_timer = async_track_point_in_time(
            self.hass, self._handle_water_timer, due
        )

    def _water_due(self, now: datetime, due: datetime) -> None:
        """Watering time has come: skip if the soil is wet, else water or remind."""
        moisture = self.soil_moisture()
        if moisture is not None and moisture >= self.settings.dry_below:
            # Still wet: look again at the same time tomorrow.
            self._postponed_to = due + DAY
            while self._postponed_to <= now:
                self._postponed_to += DAY
            self.next_watering = self._postponed_to
            self._unsub_water_timer = async_track_point_in_time(
                self.hass, self._handle_water_timer, self._postponed_to
            )
            return
        if self.settings.water_switch is not None:
            self._start_watering(now)
            return
        if self._alerted_due != due:
            self._alerted_due = due
            self._alert(ALERT_WATER_DUE, f"{self._crop_name()} needs water.")

    def _start_watering(self, now: datetime) -> None:
        self.last_watered = now
        self._postponed_to = None
        self.watering = True
        self._switch(self.settings.water_switch, True)
        self._unsub_water_stop = async_track_point_in_time(
            self.hass,
            self._handle_water_stop,
            now + timedelta(minutes=self.settings.water_minutes),
        )
        self._alert(
            ALERT_WATERED,
            f"{self._crop_name()} is being watered for "
            f"{self.settings.water_minutes:g} minutes.",
        )
        self._schedule_watering(now)

    def _schedule_sowing(self, now: datetime) -> None:
        if self._unsub_sow_timer is not None:
            self._unsub_sow_timer()
            self._unsub_sow_timer = None
        days = self.settings.resow_days
        planted_on = self.settings.planted_on
        if not days or planted_on is None:
            self.next_sowing = None
            return
        day = planted_on + timedelta(days=days)
        sowing = dt_util.as_local(
            datetime.combine(day, self.settings.start, tzinfo=now.tzinfo)
        )
        while sowing <= now:
            sowing = dt_util.as_local(
                datetime.combine(
                    sowing.date() + timedelta(days=days),
                    self.settings.start,
                    tzinfo=now.tzinfo,
                )
            )
        self.next_sowing = sowing
        if self.enabled:
            self._unsub_sow_timer = async_track_point_in_time(
                self.hass, self._handle_sow_timer, sowing
            )

    @callback
    def _handle_timer(self, _now: datetime) -> None:
        self._unsub_timer = None
        self.async_evaluate()

    @callback
    def _handle_water_timer(self, _now: datetime) -> None:
        self._unsub_water_timer = None
        self.async_evaluate()

    @callback
    def _handle_sow_timer(self, _now: datetime) -> None:
        self._unsub_sow_timer = None
        self._alert(
            ALERT_SOW_NEXT,
            f"Time to sow the next batch of {self._crop_name()}.",
        )
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
    def _handle_power(self, _event: Event[EventStateChangedData]) -> None:
        self._update_power(dt_util.utcnow())
        for listener in list(self._listeners):
            listener()

    @callback
    def _handle_moisture(self, event: Event[EventStateChangedData]) -> None:
        new = event.data["new_state"]
        old = event.data["old_state"]

        def reading(state: State | None) -> float | None:
            if state is None:
                return None
            try:
                return float(state.state)
            except ValueError:
                return None

        value = reading(new)
        before = reading(old)
        dry_below = self.settings.dry_below
        for listener in list(self._listeners):
            listener()
        if value is None or value >= dry_below:
            return
        if before is not None and before < dry_below:
            return
        now = dt_util.now()
        if self.last_watered is not None and now - self.last_watered < SOIL_DRY_GAP:
            return
        if not self.enabled or self._unsub_water_stop is not None:
            return
        if self.settings.water_switch is not None:
            self._cancel_water_timer()
            self._start_watering(now)
            for listener in list(self._listeners):
                listener()
            return
        self._alert(
            ALERT_SOIL_DRY,
            f"The soil of {self._crop_name()} is dry ({value:g}%). Water it now.",
        )

    @callback
    def _handle_plug(self, event: Event[EventStateChangedData]) -> None:
        old = event.data["old_state"]
        new = event.data["new_state"]
        self._update_power(dt_util.utcnow())
        # A plug that comes back online gets the current state; manual
        # switching while online is left alone until the next change.
        if new is None or new.state not in (STATE_ON, STATE_OFF):
            return
        if old is not None and old.state in (STATE_ON, STATE_OFF):
            for listener in list(self._listeners):
                listener()
            return
        self.async_evaluate()
