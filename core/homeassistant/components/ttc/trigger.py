"""Automation triggers for TTC transit.

Each trigger compares one answer from the agency with the previous one, so it
fires once for each thing that happened: one delay, one outage, one alert or
one departure. Repeated answers that say the same thing do not fire again.
"""

from datetime import timedelta
from typing import Any, cast, override

import probatio

from homeassistant.const import CONF_OPTIONS
from homeassistant.core import CALLBACK_TYPE, HomeAssistant, async_noop, callback
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.trigger import (
    Trigger,
    TriggerActionRunner,
    TriggerConfig,
    TriggerNotTriggeredReporter,
)
from homeassistant.helpers.typing import ConfigType

from .api import LiveAlerts, Prediction, StopPredictions, normalize_station
from .const import (
    ALERT_KINDS,
    FEED_ALERTS,
    FEED_DEPARTURES,
    FEED_LIFTS,
    KIND_ELEVATOR,
    KIND_ESCALATOR,
    STATUS_REGULAR,
)
from .coordinator import SIGNAL_FEED_UPDATED, TTCFeedCoordinator, async_get_entry

CONF_ROUTE = "route"
CONF_STOP = "stop"
CONF_STATION = "station"
CONF_MINUTES = "minutes"
CONF_WALK_MINUTES = "walk_minutes"
CONF_KIND = "kind"
CONF_CHANGE = "change"

ANY = "any"
CHANGE_OUT = "out"
CHANGE_BACK = "back"
LIFT_KINDS = [KIND_ELEVATOR, KIND_ESCALATOR]

_ROUTE_SCHEMA = probatio.Schema(
    {
        probatio.Required(CONF_OPTIONS, default=dict): {
            probatio.Optional(CONF_ROUTE): cv.string,
        }
    }
)
_DEPARTURE_SCHEMA = probatio.Schema(
    {
        probatio.Required(CONF_OPTIONS): {
            probatio.Required(CONF_STOP): cv.string,
            probatio.Optional(CONF_ROUTE): cv.string,
            probatio.Required(CONF_MINUTES): probatio.All(
                probatio.Coerce(int), probatio.Range(min=0, max=90)
            ),
        }
    }
)
_LEAVE_SCHEMA = probatio.Schema(
    {
        probatio.Required(CONF_OPTIONS): {
            probatio.Required(CONF_STOP): cv.string,
            probatio.Optional(CONF_ROUTE): cv.string,
            probatio.Required(CONF_WALK_MINUTES): probatio.All(
                probatio.Coerce(int), probatio.Range(min=0, max=90)
            ),
        }
    }
)
_LIFT_SCHEMA = probatio.Schema(
    {
        probatio.Required(CONF_OPTIONS, default=dict): {
            probatio.Optional(CONF_STATION): cv.string,
            probatio.Optional(CONF_KIND, default=ANY): probatio.In([ANY, *LIFT_KINDS]),
            probatio.Optional(CONF_CHANGE, default=CHANGE_OUT): probatio.In(
                [ANY, CHANGE_OUT, CHANGE_BACK]
            ),
        }
    }
)
_ALERT_SCHEMA = probatio.Schema(
    {
        probatio.Required(CONF_OPTIONS, default=dict): {
            probatio.Optional(CONF_KIND, default=ANY): probatio.In([ANY, *ALERT_KINDS]),
        }
    }
)


class _TTCFeedTrigger(Trigger):
    """Base for triggers that compare consecutive answers of a feed."""

    _schema: probatio.Schema
    _feeds: tuple[str, ...]

    @classmethod
    @override
    async def async_validate_config(
        cls, hass: HomeAssistant, config: ConfigType
    ) -> ConfigType:
        """Validate config."""
        return cast(ConfigType, cls._schema(config))

    def __init__(self, hass: HomeAssistant, config: TriggerConfig) -> None:
        """Initialize the trigger."""
        super().__init__(hass, config)
        self._options: dict[str, Any] = dict(config.options or {})
        self._baseline_set = False

    def _set_baseline(self, data: Any) -> None:
        """Remember the current answer without firing."""
        raise NotImplementedError

    def _compare(self, data: Any, run_action: TriggerActionRunner) -> None:
        """Fire for what changed since the previous answer."""
        raise NotImplementedError

    @override
    async def async_attach_runner(
        self,
        run_action: TriggerActionRunner,
        did_not_trigger: TriggerNotTriggeredReporter | None = None,
    ) -> CALLBACK_TYPE:
        """Attach the trigger to an action runner."""
        listeners: dict[int, CALLBACK_TYPE] = {}

        @callback
        def async_keep_polling(coordinator: TTCFeedCoordinator[Any]) -> None:
            # A coordinator only polls while something listens to it.
            if id(coordinator) not in listeners:
                listeners[id(coordinator)] = coordinator.async_add_listener(async_noop)

        if (entry := async_get_entry(self._hass)) is not None:
            for coordinator in entry.runtime_data.coordinators:
                if coordinator.feed not in self._feeds:
                    continue
                async_keep_polling(coordinator)
                if (
                    not self._baseline_set
                    and coordinator.data is not None
                    and coordinator.is_fresh
                ):
                    self._set_baseline(coordinator.data)
                    self._baseline_set = True

        @callback
        def async_feed_updated(coordinator: TTCFeedCoordinator[Any]) -> None:
            if coordinator.feed not in self._feeds:
                return
            async_keep_polling(coordinator)
            if not coordinator.last_update_success or coordinator.data is None:
                return
            if not self._baseline_set:
                self._set_baseline(coordinator.data)
                self._baseline_set = True
                return
            self._compare(coordinator.data, run_action)

        remove_dispatcher = async_dispatcher_connect(
            self._hass, SIGNAL_FEED_UPDATED, async_feed_updated
        )

        @callback
        def async_remove() -> None:
            remove_dispatcher()
            for remove in listeners.values():
                remove()
            listeners.clear()

        return async_remove


class _RouteStatusTrigger(_TTCFeedTrigger):
    """Base for triggers on a route's status."""

    _schema = _ROUTE_SCHEMA
    _feeds = (FEED_ALERTS, FEED_LIFTS)

    def __init__(self, hass: HomeAssistant, config: TriggerConfig) -> None:
        """Initialize the trigger."""
        super().__init__(hass, config)
        self._route: str | None = self._options.get(CONF_ROUTE)
        self._statuses: dict[str, str] = {}

    def _routes(self) -> list[str]:
        if self._route is not None:
            return [self._route]
        entry = async_get_entry(self._hass)
        return list(entry.runtime_data.routes) if entry else []

    @override
    def _set_baseline(self, data: LiveAlerts) -> None:
        self._statuses = {route: data.route_status(route) for route in self._routes()}

    def _fires(self, previous: str, current: str) -> bool:
        raise NotImplementedError

    @override
    def _compare(self, data: LiveAlerts, run_action: TriggerActionRunner) -> None:
        for route in self._routes():
            current = data.route_status(route)
            previous = self._statuses.get(route)
            self._statuses[route] = current
            if previous is None or not self._fires(previous, current):
                continue
            alerts = data.route_alerts(route)
            run_action(
                {
                    "route": route,
                    "status": current,
                    "previous_status": previous,
                    "alerts": [alert.as_dict() for alert in alerts],
                },
                f"route {route} is now {current}",
            )


class RouteDelayedTrigger(_RouteStatusTrigger):
    """Fires when a route in regular service gets a problem."""

    @override
    def _fires(self, previous: str, current: str) -> bool:
        return previous == STATUS_REGULAR and current != STATUS_REGULAR


class RouteResumedTrigger(_RouteStatusTrigger):
    """Fires when a route with a problem is back to regular service."""

    @override
    def _fires(self, previous: str, current: str) -> bool:
        return previous != STATUS_REGULAR and current == STATUS_REGULAR


class _DepartureTrigger(_TTCFeedTrigger):
    """Base for triggers on a departure from a stop."""

    _feeds = (FEED_DEPARTURES,)
    _limit_key: str

    def __init__(self, hass: HomeAssistant, config: TriggerConfig) -> None:
        """Initialize the trigger."""
        super().__init__(hass, config)
        self._stop: str = self._options[CONF_STOP]
        self._route: str | None = self._options.get(CONF_ROUTE)
        self._limit = timedelta(minutes=self._options[self._limit_key])
        self._fired: set[str] = set()

    def _within(self, data: dict[str, StopPredictions]) -> list[Prediction]:
        if (stop := data.get(self._stop)) is None:
            return []
        return [
            item
            for item in stop.for_route(self._route)
            if timedelta(seconds=item.seconds) <= self._limit
        ]

    @staticmethod
    def _key(item: Prediction) -> str:
        return item.trip or f"{item.route}_{item.vehicle}_{item.time.isoformat()}"

    @override
    def _set_baseline(self, data: dict[str, StopPredictions]) -> None:
        self._fired = {self._key(item) for item in self._within(data)}

    @override
    def _compare(
        self, data: dict[str, StopPredictions], run_action: TriggerActionRunner
    ) -> None:
        within = self._within(data)
        for item in within:
            if (key := self._key(item)) in self._fired:
                continue
            self._fired.add(key)
            run_action(self._payload(item), self._describe(item))
        # Forget departures that have left, so the set stays small.
        self._fired &= {
            self._key(item) for stop in data.values() for item in stop.predictions
        }

    def _payload(self, item: Prediction) -> dict[str, Any]:
        return {"stop": self._stop, **item.as_dict(), "minutes": item.seconds // 60}

    def _describe(self, item: Prediction) -> str:
        raise NotImplementedError


class DepartureWithinTrigger(_DepartureTrigger):
    """Fires once for each departure when it is first predicted within N minutes."""

    _schema = _DEPARTURE_SCHEMA
    _limit_key = CONF_MINUTES

    @override
    def _describe(self, item: Prediction) -> str:
        return f"route {item.route} departs stop {self._stop} in {item.seconds // 60} minutes"


class TimeToLeaveTrigger(_DepartureTrigger):
    """Fires once for each departure when it is time to walk to the stop."""

    _schema = _LEAVE_SCHEMA
    _limit_key = CONF_WALK_MINUTES

    @override
    def _payload(self, item: Prediction) -> dict[str, Any]:
        return {
            **super()._payload(item),
            "walk_minutes": self._options[CONF_WALK_MINUTES],
            "leave_by": (item.time - self._limit).isoformat(),
        }

    @override
    def _describe(self, item: Prediction) -> str:
        return f"time to leave for route {item.route} at stop {self._stop}"


class LiftChangedTrigger(_TTCFeedTrigger):
    """Fires when an elevator or escalator goes out of service or comes back."""

    _schema = _LIFT_SCHEMA
    _feeds = (FEED_ALERTS, FEED_LIFTS)

    def __init__(self, hass: HomeAssistant, config: TriggerConfig) -> None:
        """Initialize the trigger."""
        super().__init__(hass, config)
        station = self._options.get(CONF_STATION)
        self._station = normalize_station(station) if station else None
        kind = self._options[CONF_KIND]
        self._kinds = LIFT_KINDS if kind == ANY else [kind]
        self._change: str = self._options[CONF_CHANGE]
        self._outages: dict[str, dict[str, Any]] = {}

    def _current(self, data: LiveAlerts) -> dict[str, dict[str, Any]]:
        return {
            alert.alert_id: alert.as_dict()
            for alert in data.current
            if alert.kind in self._kinds
            and alert.station is not None
            and (
                self._station is None
                or normalize_station(alert.station) == self._station
            )
        }

    @override
    def _set_baseline(self, data: LiveAlerts) -> None:
        self._outages = self._current(data)

    @override
    def _compare(self, data: LiveAlerts, run_action: TriggerActionRunner) -> None:
        current = self._current(data)
        if self._change in (ANY, CHANGE_OUT):
            for alert_id, outage in current.items():
                if alert_id not in self._outages:
                    run_action(
                        {"change": CHANGE_OUT, **outage},
                        f"{outage['kind']} out at {outage['station']}",
                    )
        if self._change in (ANY, CHANGE_BACK):
            for alert_id, outage in self._outages.items():
                if alert_id not in current:
                    run_action(
                        {"change": CHANGE_BACK, **outage},
                        f"{outage['kind']} back at {outage['station']}",
                    )
        self._outages = current


class NewAlertTrigger(_TTCFeedTrigger):
    """Fires once for each alert that was not there before."""

    _schema = _ALERT_SCHEMA
    _feeds = (FEED_ALERTS, FEED_LIFTS)

    def __init__(self, hass: HomeAssistant, config: TriggerConfig) -> None:
        """Initialize the trigger."""
        super().__init__(hass, config)
        kind = self._options[CONF_KIND]
        self._kinds = ALERT_KINDS if kind == ANY else [kind]
        self._seen: set[str] = set()

    @override
    def _set_baseline(self, data: LiveAlerts) -> None:
        self._seen = {alert.alert_id for alert in data.current}

    @override
    def _compare(self, data: LiveAlerts, run_action: TriggerActionRunner) -> None:
        current = data.current
        for alert in current:
            if alert.alert_id in self._seen or alert.kind not in self._kinds:
                continue
            run_action(alert.as_dict(), f"new {alert.kind} alert")
        self._seen = {alert.alert_id for alert in current}


TRIGGERS: dict[str, type[Trigger]] = {
    "route_delayed": RouteDelayedTrigger,
    "route_resumed": RouteResumedTrigger,
    "departure_within": DepartureWithinTrigger,
    "time_to_leave": TimeToLeaveTrigger,
    "lift_changed": LiftChangedTrigger,
    "new_alert": NewAlertTrigger,
}


async def async_get_triggers(hass: HomeAssistant) -> dict[str, type[Trigger]]:
    """Return the TTC transit triggers."""
    return TRIGGERS
