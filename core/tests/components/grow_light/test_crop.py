"""Tests for crop-driven light hours and watering."""

from collections.abc import Generator
from datetime import datetime
from typing import Any
from unittest.mock import patch

from freezegun.api import FrozenDateTimeFactory
import pytest
from pytest_homeassistant.common import (
    MockConfigEntry,
    async_fire_time_changed,
    async_mock_service,
)

from homeassistant.components.grow_light.const import DOMAIN
from homeassistant.components.grow_light.plants import Plant, Stage
from homeassistant.const import STATE_OFF
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.util import dt as dt_util

PLUG = "switch.shelf_plug"
PUMP = "switch.shelf_pump"
STAGE = "sensor.shelf_growth_stage"
STATUS = "sensor.shelf_status"
NEXT_WATERING = "sensor.shelf_next_watering"
LAST_WATERED = "sensor.shelf_last_watered"
WATERED = "button.shelf_watered"

PLANT = Plant(
    id="test_crop",
    name="Test crop",
    scientific="Testus cropus",
    group="vegetable",
    photoperiod="day_neutral",
    note="",
    stages=(
        Stage("germination", 5, 0, 1, "Keep moist."),
        Stage("seedling", 10, 16, 2, "Let the top dry."),
    ),
    photo_author="Someone",
    photo_license="CC0",
)


def _local(day: int, hour: int, minute: int = 0, second: int = 0) -> datetime:
    return dt_util.as_utc(
        datetime(
            2026, 11, day, hour, minute, second, tzinfo=dt_util.get_default_time_zone()
        )
    )


@pytest.fixture(autouse=True)
def mock_plants() -> Generator[None]:
    """Use a small known crop instead of the catalogue."""
    with patch(
        "homeassistant.components.grow_light.async_get_plants",
        return_value={PLANT.id: PLANT},
    ):
        yield


async def _setup(hass: HomeAssistant, **options: Any) -> MockConfigEntry:
    hass.states.async_set(PLUG, STATE_OFF)
    hass.states.async_set(PUMP, STATE_OFF)
    entry = MockConfigEntry(
        domain=DOMAIN,
        title="Shelf",
        options={
            "name": "Shelf",
            "plug": PLUG,
            "start": "06:00:00",
            "hours": 14,
            "doors": [],
            "plant": PLANT.id,
            **options,
        },
    )
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


def _targets(calls: list[ServiceCall]) -> list[str]:
    return [call.data["entity_id"] for call in calls]


async def test_germination_keeps_light_off(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    """A stage with no light hours keeps the plug off."""
    freezer.move_to(_local(10, 10))
    calls_on = async_mock_service(hass, "homeassistant", "turn_on")
    await _setup(hass, planted_on="2026-11-08")

    assert calls_on == []
    assert hass.states.get(STATUS).state == "off_hours"
    stage = hass.states.get(STAGE)
    assert stage.state == "germination"
    assert stage.attributes["day_in_stage"] == 3
    assert stage.attributes["light_hours"] == 0
    assert stage.attributes["entity_picture"] == "/grow_light/photos/test_crop.jpg"


async def test_seedling_hours(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    """The seedling stage's 16 hours from 06:00 keep the light on at 21:00."""
    freezer.move_to(_local(10, 21))
    calls_on = async_mock_service(hass, "homeassistant", "turn_on")
    await _setup(hass, planted_on="2026-11-01")

    assert _targets(calls_on) == [PLUG]
    assert hass.states.get(STAGE).state == "seedling"
    assert hass.states.get(STATUS).state == "on"


async def test_next_stage_turns_light_on(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    """When germination ends, the next window start brings the seedling hours."""
    freezer.move_to(_local(10, 10))
    calls_on = async_mock_service(hass, "homeassistant", "turn_on")
    await _setup(hass, planted_on="2026-11-06")
    assert calls_on == []

    freezer.move_to(_local(11, 6, 0, 1))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()

    assert _targets(calls_on) == [PLUG]
    assert hass.states.get(STAGE).state == "seedling"


async def test_pump_waters_when_due(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    """A due watering runs the pump for the set minutes, then schedules the next."""
    freezer.move_to(_local(10, 10))
    calls_on = async_mock_service(hass, "homeassistant", "turn_on")
    calls_off = async_mock_service(hass, "homeassistant", "turn_off")
    await _setup(hass, planted_on="2026-11-01", water_switch=PUMP, water_minutes=2)

    assert PUMP in _targets(calls_on)
    assert PUMP not in _targets(calls_off)
    assert hass.states.get(NEXT_WATERING).attributes["watering"] is True

    freezer.move_to(_local(10, 10, 2, 1))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()

    assert PUMP in _targets(calls_off)
    assert dt_util.parse_datetime(hass.states.get(LAST_WATERED).state) == _local(10, 10)
    assert dt_util.parse_datetime(hass.states.get(NEXT_WATERING).state) == _local(12, 6)


async def test_watered_button(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    """Pressing Watered counts the next watering from today."""
    freezer.move_to(_local(10, 10))
    async_mock_service(hass, "homeassistant", "turn_on")
    await _setup(hass, planted_on="2026-11-01")
    assert dt_util.parse_datetime(hass.states.get(NEXT_WATERING).state) == _local(1, 6)

    await hass.services.async_call(
        "button", "press", {"entity_id": WATERED}, blocking=True
    )
    await hass.async_block_till_done()

    assert dt_util.parse_datetime(hass.states.get(NEXT_WATERING).state) == _local(12, 6)


async def test_own_watering_days_without_crop(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    """Without a crop the watering interval is the one set by hand."""
    freezer.move_to(_local(10, 10))
    async_mock_service(hass, "homeassistant", "turn_on")
    await _setup(hass, plant="custom", water_days=3)

    assert hass.states.get(STAGE) is None
    assert hass.states.get(NEXT_WATERING).attributes["water_every_days"] == 3
