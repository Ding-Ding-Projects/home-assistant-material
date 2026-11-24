"""Sensors for the morning briefing: next and last briefing."""

from datetime import datetime
from typing import override

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity
from homeassistant.const import STATE_UNAVAILABLE, STATE_UNKNOWN
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.helpers.restore_state import RestoreEntity
from homeassistant.util import dt as dt_util

from . import MorningBriefingConfigEntry
from .entity import MorningBriefingEntity


async def async_setup_entry(
    hass: HomeAssistant,
    entry: MorningBriefingConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Add the sensors."""
    async_add_entities(
        [MorningBriefingNextSensor(entry), MorningBriefingLastSensor(entry)]
    )


class MorningBriefingNextSensor(MorningBriefingEntity, SensorEntity):
    """When the next briefing goes out."""

    _attr_device_class = SensorDeviceClass.TIMESTAMP

    def __init__(self, entry: MorningBriefingConfigEntry) -> None:
        """Create the sensor."""
        super().__init__(entry, "next_briefing")

    @property
    @override
    def native_value(self) -> datetime | None:
        """Next briefing."""
        return self.briefing.next_briefing


class MorningBriefingLastSensor(MorningBriefingEntity, SensorEntity, RestoreEntity):
    """When the last briefing went out; the text is an attribute."""

    _attr_device_class = SensorDeviceClass.TIMESTAMP
    _unrecorded_attributes = frozenset({"message"})

    def __init__(self, entry: MorningBriefingConfigEntry) -> None:
        """Create the sensor."""
        super().__init__(entry, "last_briefing")

    @override
    async def async_added_to_hass(self) -> None:
        """Give the briefing the last message from before a restart."""
        await super().async_added_to_hass()
        if (
            (last := await self.async_get_last_state()) is not None
            and last.state not in (STATE_UNKNOWN, STATE_UNAVAILABLE)
            and (sent := dt_util.parse_datetime(last.state)) is not None
        ):
            self.briefing.async_restore_last(sent, last.attributes.get("message"))

    @property
    @override
    def native_value(self) -> datetime | None:
        """Last briefing."""
        return self.briefing.last_sent

    @property
    @override
    def extra_state_attributes(self) -> dict[str, str | None]:
        """The text that was sent."""
        return {"message": self.briefing.last_message}
