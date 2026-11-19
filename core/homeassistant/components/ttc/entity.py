"""Base entities for the TTC transit integration."""

from typing import Any, override

from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .api import route_name
from .const import ATTRIBUTION, DOMAIN
from .coordinator import TTCConfigEntry, TTCFeedCoordinator

MANUFACTURER = "Toronto Transit Commission"
PAGE_URL = "homeassistant://config/ttc"


def network_device(entry: TTCConfigEntry) -> DeviceInfo:
    """Return the device for the whole network."""
    return DeviceInfo(
        identifiers={(DOMAIN, f"{entry.entry_id}_network")},
        name="TTC network",
        manufacturer=MANUFACTURER,
        entry_type=DeviceEntryType.SERVICE,
        configuration_url=PAGE_URL,
    )


def route_device(entry: TTCConfigEntry, route: str) -> DeviceInfo:
    """Return the device for one route."""
    return DeviceInfo(
        identifiers={(DOMAIN, f"{entry.entry_id}_route_{route}")},
        name=f"TTC {route_name(route, entry.runtime_data.route_titles)}",
        manufacturer=MANUFACTURER,
        model="Route",
        entry_type=DeviceEntryType.SERVICE,
        configuration_url=PAGE_URL,
    )


def stop_device(entry: TTCConfigEntry, stop: str, title: str | None) -> DeviceInfo:
    """Return the device for one stop."""
    return DeviceInfo(
        identifiers={(DOMAIN, f"{entry.entry_id}_stop_{stop}")},
        name=f"TTC stop {stop}" if not title else f"TTC {title}",
        manufacturer=MANUFACTURER,
        model=f"Stop {stop}",
        entry_type=DeviceEntryType.SERVICE,
        configuration_url=PAGE_URL,
    )


def station_device(entry: TTCConfigEntry, station: str) -> DeviceInfo:
    """Return the device for one station."""
    return DeviceInfo(
        identifiers={(DOMAIN, f"{entry.entry_id}_station_{station}")},
        name=f"TTC {station} station",
        manufacturer=MANUFACTURER,
        model="Station",
        entry_type=DeviceEntryType.SERVICE,
        configuration_url=PAGE_URL,
    )


class TTCEntity[_CoordinatorT: TTCFeedCoordinator[Any]](
    CoordinatorEntity[_CoordinatorT]
):
    """An entity fed by one TTC feed. It is unavailable when the feed is old."""

    _attr_has_entity_name = True
    _attr_attribution = ATTRIBUTION

    def __init__(
        self,
        coordinator: _CoordinatorT,
        device_info: DeviceInfo,
        key: str,
        suffix: str,
    ) -> None:
        """Initialize the entity."""
        super().__init__(coordinator)
        self._attr_device_info = device_info
        self._attr_translation_key = key
        self._attr_unique_id = f"{coordinator.config_entry.entry_id}_{suffix}_{key}"

    @property
    @override
    def available(self) -> bool:
        """Return whether the information is recent enough to show."""
        return self.coordinator.data is not None and self.coordinator.is_fresh

    def _read_attributes(self) -> dict[str, Any]:
        """Return when the shown information was read."""
        read_at = self.coordinator.last_read
        return {"read_at": read_at.isoformat() if read_at else None}
