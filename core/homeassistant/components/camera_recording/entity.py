"""Base entity for camera recording."""

from typing import override

from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo
from homeassistant.helpers.entity import Entity

from .const import DOMAIN
from .manager import RecordingManager


class RecordingEntity(Entity):
    """An entity of one recording destination, updated when the manager changes."""

    _attr_has_entity_name = True
    _attr_should_poll = False

    def __init__(
        self, manager: RecordingManager, key: str, camera: str | None = None
    ) -> None:
        """Name the entity after its destination and, when given, its camera."""
        self.manager = manager
        self.camera = camera
        entry_id = manager.entry.entry_id
        self._attr_unique_id = f"{entry_id}_{key}" + (f"_{camera}" if camera else "")
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry_id)},
            name="Camera recording",
            manufacturer="Home Assistant",
            model=manager.destination.label,
            entry_type=DeviceEntryType.SERVICE,
        )

    def _camera_name(self) -> str:
        if self.camera is None:
            return ""
        state = self.hass.states.get(self.camera) if self.hass else None
        return state.name if state else self.camera

    @override
    async def async_added_to_hass(self) -> None:
        """Follow the manager."""
        self.async_on_remove(self.manager.async_add_listener(self.async_write_ha_state))
