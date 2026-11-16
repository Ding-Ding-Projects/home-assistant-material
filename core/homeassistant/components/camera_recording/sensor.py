"""Space used by recordings and how many segments wait to be copied."""

from typing import override

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorStateClass,
)
from homeassistant.const import EntityCategory, UnitOfInformation
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from . import CameraRecordingConfigEntry
from .entity import RecordingEntity
from .manager import RecordingManager


async def async_setup_entry(
    hass: HomeAssistant,
    entry: CameraRecordingConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Space used and waiting segments for the destination."""
    manager = entry.runtime_data
    async_add_entities([UsedSpaceSensor(manager), WaitingSensor(manager)])


class UsedSpaceSensor(RecordingEntity, SensorEntity):
    """Bytes of every kept recording."""

    _attr_device_class = SensorDeviceClass.DATA_SIZE
    _attr_native_unit_of_measurement = UnitOfInformation.BYTES
    _attr_suggested_unit_of_measurement = UnitOfInformation.GIGABYTES
    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_translation_key = "used_space"

    def __init__(self, manager: RecordingManager) -> None:
        """Set up for the destination."""
        super().__init__(manager, "used_space")

    @property
    @override
    def native_value(self) -> int:
        """Bytes used."""
        return sum(
            seg.size for segs in self.manager.segments.values() for seg in segs.values()
        )


class WaitingSensor(RecordingEntity, SensorEntity):
    """Segments recorded here and not yet copied to the destination."""

    _attr_entity_category = EntityCategory.DIAGNOSTIC
    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_translation_key = "waiting"

    def __init__(self, manager: RecordingManager) -> None:
        """Set up for the destination."""
        super().__init__(manager, "waiting")

    @property
    @override
    def native_value(self) -> int:
        """Segments waiting."""
        return sum(
            1
            for segs in self.manager.segments.values()
            for seg in segs.values()
            if seg.local and not seg.remote
        )
