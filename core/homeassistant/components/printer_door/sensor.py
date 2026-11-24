"""Print status, progress, last opened and door open count sensors."""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from typing import override

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorEntityDescription,
    SensorStateClass,
)
from homeassistant.const import PERCENTAGE
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.util import dt as dt_util

from .const import PRINT_STATUSES
from .coordinator import PrinterDoorConfigEntry, PrinterDoorData
from .entity import PrinterDoorEntity


@dataclass(frozen=True, kw_only=True)
class PrinterDoorSensorDescription(SensorEntityDescription):
    """Describe a printer door sensor."""

    value_fn: Callable[[PrinterDoorData], str | int | datetime | None]


SENSORS = (
    PrinterDoorSensorDescription(
        key="print_status",
        translation_key="print_status",
        device_class=SensorDeviceClass.ENUM,
        options=PRINT_STATUSES,
        value_fn=lambda data: data.status,
    ),
    PrinterDoorSensorDescription(
        key="print_progress",
        translation_key="print_progress",
        native_unit_of_measurement=PERCENTAGE,
        state_class=SensorStateClass.MEASUREMENT,
        value_fn=lambda data: data.progress,
    ),
    PrinterDoorSensorDescription(
        key="last_opened",
        translation_key="last_opened",
        device_class=SensorDeviceClass.TIMESTAMP,
        value_fn=lambda data: data.last_opened,
    ),
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: PrinterDoorConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Add the sensors."""
    entities: list[SensorEntity] = [
        PrinterDoorSensor(entry, description) for description in SENSORS
    ]
    entities.append(PrinterDoorOpenCountSensor(entry))
    async_add_entities(entities)


class PrinterDoorSensor(PrinterDoorEntity, SensorEntity):
    """A value read from the printer's state."""

    entity_description: PrinterDoorSensorDescription

    def __init__(
        self, entry: PrinterDoorConfigEntry, description: PrinterDoorSensorDescription
    ) -> None:
        """Create the sensor."""
        super().__init__(entry, description.key)
        self.entity_description = description

    @property
    @override
    def native_value(self) -> str | int | datetime | None:
        """The current value."""
        return self.entity_description.value_fn(self.coordinator.data)


class PrinterDoorOpenCountSensor(PrinterDoorEntity, SensorEntity):
    """How many times a door opened since local midnight."""

    def __init__(self, entry: PrinterDoorConfigEntry) -> None:
        """Create the sensor."""
        super().__init__(entry, "open_count_today")

    @property
    @override
    def native_value(self) -> int:
        """Openings today; a count from an earlier day no longer applies."""
        data = self.coordinator.data
        return data.open_count if data.open_count_day == dt_util.now().date() else 0
