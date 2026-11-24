"""Cut power when a leak or an over-limit load is seen, and keep it cut."""

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime
import logging

from homeassistant.const import ATTR_ENTITY_ID, SERVICE_TURN_OFF, STATE_ON
from homeassistant.core import (
    CALLBACK_TYPE,
    Event,
    EventStateChangedData,
    HomeAssistant,
    callback,
)
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.event import async_call_later, async_track_state_change_event
from homeassistant.util import dt as dt_util

from .const import CAUSE_LEAK, CAUSE_NONE, CAUSE_POWER, DOMAIN, EVENT_TRIPPED

_LOGGER = logging.getLogger(__name__)

HA_DOMAIN = "homeassistant"
NOTIFY_DOMAIN = "notify"


@dataclass(frozen=True, slots=True)
class SafetyCutoffSettings:
    """What the helper was set up with."""

    name: str
    leaks: list[str]
    switches: list[str]
    power_sensor: str | None = None
    power_limit: float = 0
    power_seconds: float = 0
    cut_on_power: bool = True
    notify: list[str] = field(default_factory=list)


class SafetyCutoffController:
    """Latch a trip on a leak or sustained high power and cut the switches."""

    def __init__(
        self, hass: HomeAssistant, entry_id: str, settings: SafetyCutoffSettings
    ) -> None:
        """Store the settings; nothing runs until async_start."""
        self.hass = hass
        self.entry_id = entry_id
        self.settings = settings
        self.armed = True
        self.tripped = False
        self.cause = CAUSE_NONE
        self.since: datetime | None = None
        self._unsubs: list[CALLBACK_TYPE] = []
        self._power_timer: CALLBACK_TYPE | None = None
        self._listeners: list[Callable[[], None]] = []

    @callback
    def async_add_listener(self, listener: Callable[[], None]) -> CALLBACK_TYPE:
        """Call listener whenever the state changes."""
        self._listeners.append(listener)
        return lambda: self._listeners.remove(listener)

    @callback
    def _notify_listeners(self) -> None:
        for listener in list(self._listeners):
            listener()

    @callback
    def async_start(self) -> None:
        """Watch the sensors and switches, then apply the current state."""
        settings = self.settings
        self._unsubs.append(
            async_track_state_change_event(self.hass, settings.leaks, self._handle_leak)
        )
        self._unsubs.append(
            async_track_state_change_event(
                self.hass, settings.switches, self._handle_switch
            )
        )
        if settings.power_sensor:
            self._unsubs.append(
                async_track_state_change_event(
                    self.hass, [settings.power_sensor], self._handle_power
                )
            )
        self.async_evaluate()

    @callback
    def async_stop(self) -> None:
        """Stop watching and cancel the power timer."""
        for unsub in self._unsubs:
            unsub()
        self._unsubs.clear()
        self._cancel_power_timer()

    @callback
    def async_restore(self, tripped: bool, cause: str, since: datetime | None) -> None:
        """Latched state from before a restart."""
        self.tripped = tripped
        self.cause = cause if tripped else CAUSE_NONE
        self.since = since if tripped else None

    @callback
    def async_set_armed(self, armed: bool) -> None:
        """Arm or disarm; a disarmed helper only notifies."""
        self.armed = armed
        if armed and self.tripped:
            self._cut()
        self._notify_listeners()

    def wet_sensors(self) -> list[str]:
        """Leak sensors that currently report a leak."""
        return [
            leak
            for leak in self.settings.leaks
            if (state := self.hass.states.get(leak)) is not None
            and state.state == STATE_ON
        ]

    def _power_over_limit(self) -> bool:
        sensor = self.settings.power_sensor
        if sensor is None:
            return False
        state = self.hass.states.get(sensor)
        if state is None:
            return False
        try:
            return float(state.state) > self.settings.power_limit
        except ValueError:
            return False

    @callback
    def async_evaluate(self) -> None:
        """Apply the current sensor states, including after a restart."""
        if self.wet_sensors():
            self._trip(CAUSE_LEAK)
        elif self.tripped and self.armed:
            self._cut()
        if self._power_over_limit():
            self._start_power_timer()
        self._notify_listeners()

    @callback
    def _handle_leak(self, event: Event[EventStateChangedData]) -> None:
        new_state = event.data["new_state"]
        if new_state is not None and new_state.state == STATE_ON:
            self._trip(CAUSE_LEAK)
        self._notify_listeners()

    @callback
    def _handle_switch(self, event: Event[EventStateChangedData]) -> None:
        new_state = event.data["new_state"]
        if (
            self.tripped
            and self.armed
            and new_state is not None
            and new_state.state == STATE_ON
        ):
            self._cut([event.data["entity_id"]])

    @callback
    def _handle_power(self, event: Event[EventStateChangedData]) -> None:
        if self._power_over_limit():
            self._start_power_timer()
        else:
            self._cancel_power_timer()

    @callback
    def _start_power_timer(self) -> None:
        if self._power_timer is not None or self.tripped:
            return
        self._power_timer = async_call_later(
            self.hass, self.settings.power_seconds, self._power_timer_fired
        )

    @callback
    def _cancel_power_timer(self) -> None:
        if self._power_timer is not None:
            self._power_timer()
            self._power_timer = None

    @callback
    def _power_timer_fired(self, _now: datetime) -> None:
        self._power_timer = None
        if self._power_over_limit():
            self._trip(CAUSE_POWER)
            self._notify_listeners()

    @callback
    def _trip(self, cause: str) -> None:
        """Latch a trip; a leak seen during a power trip takes over the cause."""
        if self.tripped:
            if cause == CAUSE_LEAK and self.cause != CAUSE_LEAK:
                self.cause = CAUSE_LEAK
                self._send(
                    f"Leak detected on {self.settings.name} while it was tripped."
                )
            if self.armed:
                self._cut()
            return
        self.tripped = True
        self.cause = cause
        self.since = dt_util.utcnow()
        self._cancel_power_timer()
        cut = self.armed and (cause == CAUSE_LEAK or self.settings.cut_on_power)
        if cut:
            self._cut()
        self.hass.bus.async_fire(
            EVENT_TRIPPED,
            {
                "entry_id": self.entry_id,
                "name": self.settings.name,
                "cause": cause,
                "cut": cut,
                "entities": list(self.settings.switches) if cut else [],
            },
        )
        if cause == CAUSE_LEAK:
            reason = "a leak was detected"
        else:
            reason = (
                f"power stayed above {self.settings.power_limit:g} W "
                f"for {self.settings.power_seconds:g} s"
            )
        action = "Everything was switched off." if cut else "Nothing was switched off."
        self._send(f"{self.settings.name} tripped: {reason}. {action}")

    @callback
    def async_reset(self) -> None:
        """Clear the trip, refused while a leak sensor is still wet."""
        if wet := self.wet_sensors():
            raise HomeAssistantError(
                translation_domain=DOMAIN,
                translation_key="leak_still_wet",
                translation_placeholders={"sensors": ", ".join(wet)},
            )
        was = self.tripped
        self.tripped = False
        self.cause = CAUSE_NONE
        self.since = None
        if was:
            self._send(f"{self.settings.name} was reset.")
        if self._power_over_limit():
            self._start_power_timer()
        self._notify_listeners()

    @callback
    def _cut(self, entity_ids: list[str] | None = None) -> None:
        targets = entity_ids if entity_ids is not None else self.settings.switches
        if not targets:
            return
        self.hass.async_create_task(
            self.hass.services.async_call(
                HA_DOMAIN,
                SERVICE_TURN_OFF,
                {ATTR_ENTITY_ID: list(targets)},
                blocking=False,
            )
        )

    @callback
    def _send(self, message: str) -> None:
        for target in self.settings.notify:
            domain, _, service = target.partition(".")
            if domain != NOTIFY_DOMAIN or not service:
                continue
            self.hass.async_create_task(self._send_one(service, message))

    async def _send_one(self, service: str, message: str) -> None:
        try:
            await self.hass.services.async_call(
                NOTIFY_DOMAIN,
                service,
                {"title": "Safety cutoff", "message": message},
                blocking=True,
            )
        except HomeAssistantError:
            _LOGGER.warning("Could not send notification through notify.%s", service)
