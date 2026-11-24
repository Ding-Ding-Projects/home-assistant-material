"""Sensor that shows what tripped the cutoff."""

from typing import override

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from . import SafetyCutoffConfigEntry
from .const import CAUSES
from .entity import SafetyCutoffEntity


async def async_setup_entry(
    hass: HomeAssistant,
    entry: SafetyCutoffConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Add the Cause sensor."""
    async_add_entities([SafetyCutoffCause(entry)])


class SafetyCutoffCause(SafetyCutoffEntity, SensorEntity):
    """The reason for the current trip, or none."""

    _attr_device_class = SensorDeviceClass.ENUM
    _attr_options = CAUSES

    def __init__(self, entry: SafetyCutoffConfigEntry) -> None:
        """Create the sensor."""
        super().__init__(entry, "cause")

    @property
    @override
    def native_value(self) -> str:
        """Leak, power or none."""
        return self.controller.cause
