"""Sensors for the TTC transit integration."""

from datetime import datetime
from typing import Any, override

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity
from homeassistant.const import UnitOfTime
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.util import dt as dt_util

from .api import Prediction
from .const import (
    KIND_ELEVATOR,
    KIND_ESCALATOR,
    KIND_GENERAL,
    KIND_ROUTE,
    ROUTE_STATUSES,
)
from .coordinator import (
    TTCAlertsCoordinator,
    TTCConfigEntry,
    TTCLiftsCoordinator,
    TTCPredictionsCoordinator,
)
from .entity import TTCEntity, network_device, route_device, station_device, stop_device

PARALLEL_UPDATES = 0


async def async_setup_entry(
    hass: HomeAssistant,
    entry: TTCConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Set up the TTC transit sensors."""
    data = entry.runtime_data
    entities: list[SensorEntity] = []
    if (alerts := data.alerts) is not None:
        entities.append(TTCAlertCountSensor(alerts, entry))
        entities.extend(
            TTCRouteStatusSensor(alerts, entry, route) for route in data.routes
        )
    if (lifts := data.lifts) is not None:
        for station in data.stations:
            entities.append(TTCOutageSensor(lifts, entry, station, KIND_ELEVATOR))
            entities.append(TTCOutageSensor(lifts, entry, station, KIND_ESCALATOR))
    if (predictions := data.predictions) is not None:
        for stop in data.stops:
            entities.extend(
                TTCDepartureSensor(predictions, entry, stop, index)
                for index in range(3)
            )
            entities.append(TTCMinutesSensor(predictions, entry, stop))
    async_add_entities(entities)


class TTCAlertCountSensor(TTCEntity[TTCAlertsCoordinator], SensorEntity):
    """The number of alerts in effect across the network."""

    def __init__(
        self, coordinator: TTCAlertsCoordinator, entry: TTCConfigEntry
    ) -> None:
        """Initialize the sensor."""
        super().__init__(coordinator, network_device(entry), "alerts", "network")

    @property
    @override
    def native_value(self) -> int:
        """Return the number of alerts in effect."""
        return len(self.coordinator.data.current)

    @property
    @override
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return the counts by kind and when they were read."""
        current = self.coordinator.data.current
        return {
            **self._read_attributes(),
            "feed_updated": _iso(self.coordinator.data.feed_updated),
            **{
                f"{kind}_alerts": sum(1 for alert in current if alert.kind == kind)
                for kind in (KIND_ROUTE, KIND_ELEVATOR, KIND_ESCALATOR, KIND_GENERAL)
            },
        }


class TTCRouteStatusSensor(TTCEntity[TTCAlertsCoordinator], SensorEntity):
    """The service status of one route."""

    _attr_device_class = SensorDeviceClass.ENUM
    _attr_options = ROUTE_STATUSES
    # The full alert text can exceed the recorder's 16 KiB attribute limit and is
    # only needed live (the panel reads it over the websocket API).
    _unrecorded_attributes = frozenset({"alerts"})

    def __init__(
        self, coordinator: TTCAlertsCoordinator, entry: TTCConfigEntry, route: str
    ) -> None:
        """Initialize the sensor."""
        super().__init__(
            coordinator, route_device(entry, route), "route_status", f"route_{route}"
        )
        self.route = route

    @property
    @override
    def native_value(self) -> str:
        """Return the route's status."""
        return self.coordinator.data.route_status(self.route)

    @property
    @override
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return the agency's own alert text and when it was read."""
        alerts = self.coordinator.data.route_alerts(self.route)
        return {
            **self._read_attributes(),
            "route": self.route,
            "alerts": [alert.as_dict() for alert in alerts],
        }


class TTCOutageSensor(TTCEntity[TTCLiftsCoordinator], SensorEntity):
    """The number of elevators or escalators out at a station."""

    # Keep the bulky outage text out of the recorder; it is only needed live.
    _unrecorded_attributes = frozenset({"outages"})

    def __init__(
        self,
        coordinator: TTCLiftsCoordinator,
        entry: TTCConfigEntry,
        station: str,
        kind: str,
    ) -> None:
        """Initialize the sensor."""
        super().__init__(
            coordinator,
            station_device(entry, station),
            f"{kind}s_out",
            f"station_{station}",
        )
        self.station = station
        self.kind = kind

    @property
    @override
    def native_value(self) -> int:
        """Return the number out of service."""
        return len(self.coordinator.data.station_outages(self.station, self.kind))

    @property
    @override
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return the outages with the agency's text."""
        return {
            **self._read_attributes(),
            "station": self.station,
            "outages": [
                alert.as_dict()
                for alert in self.coordinator.data.station_outages(
                    self.station, self.kind
                )
            ],
        }


class _TTCStopSensor(TTCEntity[TTCPredictionsCoordinator], SensorEntity):
    """Base for sensors of one stop."""

    def __init__(
        self,
        coordinator: TTCPredictionsCoordinator,
        entry: TTCConfigEntry,
        stop: str,
        key: str,
    ) -> None:
        """Initialize the sensor."""
        stop_data = (coordinator.data or {}).get(stop)
        super().__init__(
            coordinator,
            stop_device(entry, stop, stop_data.stop_title if stop_data else None),
            key,
            f"stop_{stop}",
        )
        self.stop = stop

    @property
    @override
    def available(self) -> bool:
        """Return whether this stop's predictions are recent enough to show."""
        return self.coordinator.stop_is_fresh(self.stop)

    def _upcoming(self) -> list[Prediction]:
        now = dt_util.utcnow()
        return [
            item
            for item in self.coordinator.data[self.stop].predictions
            if item.time >= now
        ]

    def _stop_attributes(self, item: Prediction | None) -> dict[str, Any]:
        stop_data = self.coordinator.data[self.stop]
        return {
            "read_at": stop_data.read_at.isoformat(),
            "stop": self.stop,
            "stop_title": stop_data.stop_title,
            "predicted": True,
            "route": item.route if item else None,
            "route_title": item.route_title if item else None,
            "direction": item.direction if item else None,
            "vehicle": item.vehicle if item else None,
        }


class TTCDepartureSensor(_TTCStopSensor):
    """The predicted time of the next, second or third departure at a stop."""

    _attr_device_class = SensorDeviceClass.TIMESTAMP

    def __init__(
        self,
        coordinator: TTCPredictionsCoordinator,
        entry: TTCConfigEntry,
        stop: str,
        index: int,
    ) -> None:
        """Initialize the sensor."""
        super().__init__(
            coordinator,
            entry,
            stop,
            ("next_departure", "second_departure", "third_departure")[index],
        )
        self.index = index

    def _item(self) -> Prediction | None:
        upcoming = self._upcoming()
        return upcoming[self.index] if len(upcoming) > self.index else None

    @property
    @override
    def native_value(self) -> datetime | None:
        """Return the predicted time."""
        return item.time if (item := self._item()) else None

    @property
    @override
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return the route, direction and when it was read."""
        return self._stop_attributes(self._item())


class TTCMinutesSensor(_TTCStopSensor):
    """The minutes until the next predicted departure at a stop."""

    _attr_native_unit_of_measurement = UnitOfTime.MINUTES
    _attr_device_class = SensorDeviceClass.DURATION
    _attr_suggested_display_precision = 0

    def __init__(
        self,
        coordinator: TTCPredictionsCoordinator,
        entry: TTCConfigEntry,
        stop: str,
    ) -> None:
        """Initialize the sensor."""
        super().__init__(coordinator, entry, stop, "minutes_to_next")

    @property
    @override
    def native_value(self) -> int | None:
        """Return the whole minutes until the next departure."""
        upcoming = self._upcoming()
        if not upcoming:
            return None
        return int((upcoming[0].time - dt_util.utcnow()).total_seconds() // 60)

    @property
    @override
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return the route, direction and when it was read."""
        upcoming = self._upcoming()
        return self._stop_attributes(upcoming[0] if upcoming else None)


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None
