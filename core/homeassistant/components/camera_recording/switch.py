"""Pause or resume recording of each camera."""

from typing import Any, override

from homeassistant.components.switch import SwitchEntity
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
    """One switch per camera."""
    manager = entry.runtime_data
    async_add_entities(RecordSwitch(manager, cam) for cam in manager.cameras)


class RecordSwitch(RecordingEntity, SwitchEntity):
    """On records the camera; off pauses it, and stays off across restarts."""

    _attr_icon = "mdi:record-rec"

    def __init__(self, manager: RecordingManager, camera: str) -> None:
        """Set up for one camera."""
        super().__init__(manager, "record", camera)

    @property
    @override
    def name(self) -> str:
        """Record, followed by the camera's name."""
        return f"Record {self._camera_name()}"

    @property
    @override
    def is_on(self) -> bool:
        """Whether recording is wanted for this camera."""
        return self.camera not in self.manager.paused

    @property
    @override
    def available(self) -> bool:
        """Available once the recorders exist."""
        return self.camera in self.manager.recorders

    @override
    async def async_turn_on(self, **kwargs: Any) -> None:
        """Resume recording."""
        await self.manager.async_set_paused(self.camera or "", False)

    @override
    async def async_turn_off(self, **kwargs: Any) -> None:
        """Pause recording."""
        await self.manager.async_set_paused(self.camera or "", True)
