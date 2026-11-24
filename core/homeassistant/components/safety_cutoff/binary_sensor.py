"""Binary sensor that shows whether the cutoff has tripped."""

from collections.abc import Mapping
from datetime import datetime
from typing import Any, override

from homeassistant.components.binary_sensor import (
    BinarySensorDeviceClass,
    BinarySensorEntity,
)
from homeassistant.const import STATE_ON
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.helpers.restore_state import RestoreEntity
from homeassistant.util import dt as dt_util

from . import SafetyCutoffConfigEntry
from .const import ATTR_CAUSE, ATTR_SINCE, CAUSE_LEAK, CAUSE_NONE, CAUSES
from .entity import SafetyCutoffEntity


async def async_setup_entry(
    hass: HomeAssistant,
    entry: SafetyCutoffConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Add the Tripped sensor."""
    async_add_entities([SafetyCutoffTripped(entry)])


class SafetyCutoffTripped(SafetyCutoffEntity, BinarySensorEntity, RestoreEntity):
    """On while the cutoff is latched."""

    _attr_device_class = BinarySensorDeviceClass.PROBLEM

    def __init__(self, entry: SafetyCutoffConfigEntry) -> None:
        """Create the sensor."""
        super().__init__(entry, "tripped")

    @override
    async def async_added_to_hass(self) -> None:
        """Restore the latch; setup starts the controller afterwards."""
        await super().async_added_to_hass()
        if (last := await self.async_get_last_state()) is None:
            return
        cause = last.attributes.get(ATTR_CAUSE)
        since: datetime | None = None
        if isinstance(raw := last.attributes.get(ATTR_SINCE), str):
            since = dt_util.parse_datetime(raw)
        self.controller.async_restore(
            last.state == STATE_ON,
            cause if cause in CAUSES and cause != CAUSE_NONE else CAUSE_LEAK,
            since,
        )

    @property
    @override
    def is_on(self) -> bool:
        """Whether the cutoff is latched."""
        return self.controller.tripped

    @property
    @override
    def extra_state_attributes(self) -> Mapping[str, Any]:
        """Why and since when it tripped."""
        since = self.controller.since
        return {
            ATTR_CAUSE: self.controller.cause,
            ATTR_SINCE: since.isoformat() if since else None,
        }
