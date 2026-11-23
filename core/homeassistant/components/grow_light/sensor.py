"""Sensors for the grow light: status, next change, crop stage and watering."""

from datetime import datetime
from typing import Any, override

from homeassistant.components.sensor import (
    RestoreSensor,
    SensorDeviceClass,
    SensorEntity,
)
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from . import GrowLightConfigEntry
from .const import STATUSES
from .entity import GrowLightEntity
from .photos import photo_url
from .plants import STAGES


async def async_setup_entry(
    hass: HomeAssistant,
    entry: GrowLightConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Add the sensors; the stage sensor only when a crop was picked."""
    entities: list[SensorEntity] = [
        GrowLightStatusSensor(entry),
        GrowLightNextChangeSensor(entry),
        GrowLightNextWateringSensor(entry),
        GrowLightLastWateredSensor(entry),
    ]
    if entry.runtime_data.plant is not None:
        entities.append(GrowLightStageSensor(entry))
    async_add_entities(entities)


class GrowLightStatusSensor(GrowLightEntity, SensorEntity):
    """On, paused by an open door, outside the on hours, or schedule off."""

    _attr_device_class = SensorDeviceClass.ENUM
    _attr_options = STATUSES

    def __init__(self, entry: GrowLightConfigEntry) -> None:
        """Create the sensor."""
        super().__init__(entry, "status")

    @property
    @override
    def native_value(self) -> str:
        """Current status."""
        return self.controller.status

    @property
    @override
    def extra_state_attributes(self) -> dict[str, list[str]]:
        """Doors that are open right now."""
        return {"open_doors": self.controller.open_doors()}


class GrowLightNextChangeSensor(GrowLightEntity, SensorEntity):
    """When the on hours next start or end."""

    _attr_device_class = SensorDeviceClass.TIMESTAMP

    def __init__(self, entry: GrowLightConfigEntry) -> None:
        """Create the sensor."""
        super().__init__(entry, "next_change")

    @property
    @override
    def native_value(self) -> datetime | None:
        """Next start or end of the on hours."""
        return self.controller.next_change


class GrowLightStageSensor(GrowLightEntity, SensorEntity):
    """Growth stage of the crop, with its photo and today's light and watering."""

    _attr_device_class = SensorDeviceClass.ENUM
    _attr_options = STAGES
    _unrecorded_attributes = frozenset(
        {
            "stages",
            "note",
            "scientific_name",
            "photoperiod",
            "photo_credit",
            "water_note",
        }
    )

    def __init__(self, entry: GrowLightConfigEntry) -> None:
        """Create the sensor."""
        super().__init__(entry, "stage")
        if (plant := self.controller.plant) is not None:
            self._attr_entity_picture = photo_url(plant.id)

    @property
    @override
    def native_value(self) -> str | None:
        """Current stage."""
        if (stage_now := self.controller.stage_now()) is None:
            return None
        return stage_now.stage.key

    @property
    @override
    def extra_state_attributes(self) -> dict[str, Any] | None:
        """The crop, how far into the stage it is, and the stage's light and water."""
        plant = self.controller.plant
        if plant is None or (stage_now := self.controller.stage_now()) is None:
            return None
        stage = stage_now.stage
        return {
            "plant": plant.name,
            "scientific_name": plant.scientific,
            "photoperiod": plant.photoperiod,
            "note": plant.note,
            "day_in_stage": stage_now.day_in_stage,
            "stage_days": stage.days,
            "days_since_planting": stage_now.days_since_planting,
            "total_days": plant.total_days,
            "light_hours": stage.light_hours,
            "water_every_days": stage.water_every_days,
            "water_note": stage.water_note,
            "stages": [
                {
                    "stage": item.key,
                    "days": item.days,
                    "light_hours": item.light_hours,
                    "water_every_days": item.water_every_days,
                }
                for item in plant.stages
            ],
            "photo_credit": f"{plant.photo_author}, {plant.photo_license}",
        }


class GrowLightNextWateringSensor(GrowLightEntity, SensorEntity):
    """When the crop is next due for water; empty without a watering schedule."""

    _attr_device_class = SensorDeviceClass.TIMESTAMP

    def __init__(self, entry: GrowLightConfigEntry) -> None:
        """Create the sensor."""
        super().__init__(entry, "next_watering")

    @property
    @override
    def native_value(self) -> datetime | None:
        """Next watering."""
        return self.controller.next_watering

    @property
    @override
    def extra_state_attributes(self) -> dict[str, Any]:
        """Interval and whether a watering run is going now."""
        return {
            "water_every_days": self.controller.water_every_days(),
            "watering": self.controller.watering,
        }


class GrowLightLastWateredSensor(GrowLightEntity, RestoreSensor):
    """Last watering, by hand or by the watering switch; kept across restarts."""

    _attr_device_class = SensorDeviceClass.TIMESTAMP

    def __init__(self, entry: GrowLightConfigEntry) -> None:
        """Create the sensor."""
        super().__init__(entry, "last_watered")

    @override
    async def async_added_to_hass(self) -> None:
        """Give the controller the last watering from before a restart."""
        await super().async_added_to_hass()
        if (
            self.controller.last_watered is None
            and (data := await self.async_get_last_sensor_data()) is not None
            and isinstance(data.native_value, datetime)
        ):
            self.controller.async_restore_last_watered(data.native_value)

    @property
    @override
    def native_value(self) -> datetime | None:
        """Last watering."""
        return self.controller.last_watered
