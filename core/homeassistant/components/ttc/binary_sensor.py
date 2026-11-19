"""Binary sensors for the TTC transit integration."""

from typing import Any, override

from homeassistant.components.binary_sensor import (
    BinarySensorDeviceClass,
    BinarySensorEntity,
)
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .const import KIND_ELEVATOR, STATUS_REGULAR
from .coordinator import (
    TTCAlertsCoordinator,
    TTCConfigEntry,
    TTCFeedCoordinator,
    TTCLiftsCoordinator,
)
from .entity import TTCEntity, network_device, route_device, station_device

PARALLEL_UPDATES = 0


async def async_setup_entry(
    hass: HomeAssistant,
    entry: TTCConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Set up the TTC transit binary sensors."""
    data = entry.runtime_data
    entities: list[BinarySensorEntity] = [
        TTCFreshSensor(coordinator, entry) for coordinator in data.coordinators
    ]
    if (alerts := data.alerts) is not None:
        entities.extend(
            TTCRouteProblemSensor(alerts, entry, route) for route in data.routes
        )
    if (lifts := data.lifts) is not None:
        entities.extend(
            TTCStepFreeSensor(lifts, entry, station) for station in data.stations
        )
    async_add_entities(entities)


class TTCFreshSensor(TTCEntity[TTCFeedCoordinator[Any]], BinarySensorEntity):
    """Whether a feed's information is recent enough to rely on."""

    _attr_entity_category = EntityCategory.DIAGNOSTIC

    def __init__(
        self, coordinator: TTCFeedCoordinator[Any], entry: TTCConfigEntry
    ) -> None:
        """Initialize the sensor."""
        super().__init__(
            coordinator,
            network_device(entry),
            f"{coordinator.feed}_fresh",
            "network",
        )

    @property
    @override
    def available(self) -> bool:
        """Stay available, as this sensor reports the freshness itself."""
        return True

    @property
    @override
    def is_on(self) -> bool:
        """Return whether the information is fresh."""
        return self.coordinator.is_fresh

    @property
    @override
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return when the feed was read, and when it is asked next."""
        next_attempt = self.coordinator.next_attempt
        return {
            **self._read_attributes(),
            "last_error": self.coordinator.last_error,
            "failures": self.coordinator.failures,
            "next_attempt": next_attempt.isoformat() if next_attempt else None,
        }


class TTCRouteProblemSensor(TTCEntity[TTCAlertsCoordinator], BinarySensorEntity):
    """Whether a route has a delay, detour, closure or slow zone."""

    _attr_device_class = BinarySensorDeviceClass.PROBLEM

    def __init__(
        self, coordinator: TTCAlertsCoordinator, entry: TTCConfigEntry, route: str
    ) -> None:
        """Initialize the sensor."""
        super().__init__(
            coordinator, route_device(entry, route), "route_problem", f"route_{route}"
        )
        self.route = route

    @property
    @override
    def is_on(self) -> bool:
        """Return whether the route has a problem."""
        return self.coordinator.data.route_status(self.route) != STATUS_REGULAR

    @property
    @override
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return the status and when it was read."""
        return {
            **self._read_attributes(),
            "route": self.route,
            "status": self.coordinator.data.route_status(self.route),
        }


class TTCStepFreeSensor(TTCEntity[TTCLiftsCoordinator], BinarySensorEntity):
    """Whether no elevator is reported out at a station."""

    def __init__(
        self, coordinator: TTCLiftsCoordinator, entry: TTCConfigEntry, station: str
    ) -> None:
        """Initialize the sensor."""
        super().__init__(
            coordinator,
            station_device(entry, station),
            "step_free",
            f"station_{station}",
        )
        self.station = station

    @property
    @override
    def is_on(self) -> bool:
        """Return whether all elevators are working."""
        return not self.coordinator.data.station_outages(self.station, KIND_ELEVATOR)

    @property
    @override
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return the elevators out and when it was read."""
        return {
            **self._read_attributes(),
            "station": self.station,
            "elevators_out": [
                alert.as_dict()
                for alert in self.coordinator.data.station_outages(
                    self.station, KIND_ELEVATOR
                )
            ],
        }
