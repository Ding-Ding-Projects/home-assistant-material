"""Shared base for Printer door entities."""

from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import CONF_SERIAL, DOMAIN
from .coordinator import PrinterDoorConfigEntry, PrinterDoorCoordinator


class PrinterDoorEntity(CoordinatorEntity[PrinterDoorCoordinator]):
    """An entity that belongs to one printer."""

    _attr_has_entity_name = True

    def __init__(self, entry: PrinterDoorConfigEntry, key: str) -> None:
        """Link the entity to its printer."""
        super().__init__(entry.runtime_data)
        serial = entry.data[CONF_SERIAL]
        self._attr_unique_id = f"{serial}_{key}"
        self._attr_translation_key = key
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, serial)},
            name=entry.title,
            manufacturer="Bambu Lab",
            serial_number=serial,
        )
