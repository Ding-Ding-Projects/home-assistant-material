"""Whether each camera is being recorded right now."""

from typing import Any, override

from homeassistant.components.binary_sensor import (
    BinarySensorDeviceClass,
    BinarySensorEntity,
)
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from . import CameraRecordingConfigEntry
from .entity import RecordingEntity
from .manager import RecordingManager
from .recorder import RecorderState


async def async_setup_entry(
    hass: HomeAssistant,
    entry: CameraRecordingConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """One Recording sensor per camera."""
    manager = entry.runtime_data
    async_add_entities(RecordingSensor(manager, cam) for cam in manager.cameras)


class RecordingSensor(RecordingEntity, BinarySensorEntity):
    """On while ffmpeg is writing the camera's segments."""

    _attr_device_class = BinarySensorDeviceClass.RUNNING

    def __init__(self, manager: RecordingManager, camera: str) -> None:
        """Set up for one camera."""
        super().__init__(manager, "recording", camera)

    @property
    @override
    def name(self) -> str:
        """Recording, followed by the camera's name."""
        return f"{self._camera_name()} recording"

    @property
    @override
    def is_on(self) -> bool:
        """Whether the camera is recording."""
        recorder = self.manager.recorders.get(self.camera or "")
        return recorder is not None and recorder.state == RecorderState.RECORDING

    @property
    @override
    def extra_state_attributes(self) -> dict[str, Any]:
        """The recorder state and its last problem."""
        recorder = self.manager.recorders.get(self.camera or "")
        return {
            "state": recorder.state if recorder else RecorderState.STOPPED,
            "problem": recorder.last_error if recorder else None,
        }
