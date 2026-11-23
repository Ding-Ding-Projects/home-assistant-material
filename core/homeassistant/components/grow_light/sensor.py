"""Sensors that show what the grow light is doing and when it next changes."""

from datetime import datetime

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from . import GrowLightConfigEntry
from .const import STATUSES
from .entity import GrowLightEntity


async def async_setup_entry(
    hass: HomeAssistant,
    entry: GrowLightConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Add the status and next change sensors."""
    async_add_entities([GrowLightStatusSensor(entry), GrowLightNextChangeSensor(entry)])


class GrowLightStatusSensor(GrowLightEntity, SensorEntity):
    """On, paused by an open door, outside the on hours, or schedule off."""

    _attr_device_class = SensorDeviceClass.ENUM
    _attr_options = STATUSES

    def __init__(self, entry: GrowLightConfigEntry) -> None:
        """Create the sensor."""
        super().__init__(entry, "status")

    @property
    def native_value(self) -> str:
        """Current status."""
        return self.controller.status

    @property
    def extra_state_attributes(self) -> dict[str, list[str]]:
        """Doors that are open right now."""
        return {"open_doors": self.controller.open_doors()}


class GrowLightNextChangeSensor(GrowLightEntity, SensorEntity):
    """When the on hours next start or end."""

    _attr_device_class = SensorDeviceClass.TIMESTAMP

    def __init__(self, entry: GrowLightConfigEntry) -> None:
        """Create the sensor."""
        super().__init__(entry, "next_change")

    @property
    def native_value(self) -> datetime | None:
        """Next start or end of the on hours."""
        return self.controller.next_change
