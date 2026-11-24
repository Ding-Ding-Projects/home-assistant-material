"""The Door binary sensor."""

from typing import Any, override

from homeassistant.components.binary_sensor import (
    BinarySensorDeviceClass,
    BinarySensorEntity,
)
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .coordinator import PrinterDoorConfigEntry
from .entity import PrinterDoorEntity


async def async_setup_entry(
    hass: HomeAssistant,
    entry: PrinterDoorConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Add the door sensor."""
    async_add_entities([PrinterDoorSensor(entry)])


class PrinterDoorSensor(PrinterDoorEntity, BinarySensorEntity):
    """On when any door or cover the printer reports is open."""

    _attr_device_class = BinarySensorDeviceClass.DOOR

    def __init__(self, entry: PrinterDoorConfigEntry) -> None:
        """Create the sensor."""
        super().__init__(entry, "door")

    @property
    @override
    def is_on(self) -> bool | None:
        """Whether a door is open."""
        return self.coordinator.data.door_open

    @property
    @override
    def extra_state_attributes(self) -> dict[str, Any]:
        """Each door the printer reports, and whether it detects doors at all."""
        data = self.coordinator.data
        return {**data.doors, "door_detection": data.supported}
