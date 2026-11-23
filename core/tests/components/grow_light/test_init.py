"""Tests for how the Grow light helper drives the plug."""

from datetime import datetime

from freezegun.api import FrozenDateTimeFactory

from homeassistant.components.grow_light.const import DOMAIN
from homeassistant.const import STATE_OFF, STATE_ON
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.util import dt as dt_util

from tests.common import MockConfigEntry, async_fire_time_changed, async_mock_service

PLUG = "switch.basil_plug"
DOOR = "binary_sensor.tent_door"
STATUS = "sensor.basil_shelf_status"
SCHEDULE = "switch.basil_shelf_schedule"


def _local(hour: int, minute: int = 0, second: int = 0) -> datetime:
    return dt_util.as_utc(
        datetime(
            2026, 11, 10, hour, minute, second, tzinfo=dt_util.get_default_time_zone()
        )
    )


async def _setup(hass: HomeAssistant, plug: str) -> MockConfigEntry:
    hass.states.async_set(PLUG, plug)
    hass.states.async_set(DOOR, STATE_OFF)
    entry = MockConfigEntry(
        domain=DOMAIN,
        title="Basil shelf",
        options={
            "name": "Basil shelf",
            "plug": PLUG,
            "start": "06:00:00",
            "hours": 14,
            "doors": [DOOR],
        },
    )
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


def _targets(calls: list[ServiceCall]) -> list[str]:
    return [call.data["entity_id"] for call in calls]


async def test_turns_on_inside_hours(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    """Inside the on hours the plug is turned on at start-up."""
    freezer.move_to(_local(10))
    calls_on = async_mock_service(hass, "homeassistant", "turn_on")

    await _setup(hass, STATE_OFF)

    assert _targets(calls_on) == [PLUG]
    assert hass.states.get(STATUS).state == "on"


async def test_door_pauses_and_resumes(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    """An open door turns the plug off; closing it turns the plug back on."""
    freezer.move_to(_local(10))
    calls_off = async_mock_service(hass, "homeassistant", "turn_off")
    calls_on = async_mock_service(hass, "homeassistant", "turn_on")
    await _setup(hass, STATE_ON)

    hass.states.async_set(DOOR, STATE_ON)
    await hass.async_block_till_done()
    assert _targets(calls_off) == [PLUG]
    assert hass.states.get(STATUS).state == "paused"
    assert hass.states.get(STATUS).attributes["open_doors"] == [DOOR]

    hass.states.async_set(PLUG, STATE_OFF)
    hass.states.async_set(DOOR, STATE_OFF)
    await hass.async_block_till_done()
    assert _targets(calls_on) == [PLUG]
    assert hass.states.get(STATUS).state == "on"


async def test_door_closed_outside_hours_stays_off(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    """Closing the door outside the on hours does not turn the plug on."""
    freezer.move_to(_local(22))
    calls_on = async_mock_service(hass, "homeassistant", "turn_on")
    await _setup(hass, STATE_OFF)

    hass.states.async_set(DOOR, STATE_ON)
    await hass.async_block_till_done()
    hass.states.async_set(DOOR, STATE_OFF)
    await hass.async_block_till_done()

    assert calls_on == []
    assert hass.states.get(STATUS).state == "off_hours"


async def test_window_end_turns_off(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    """At the end of the on hours the plug is turned off."""
    freezer.move_to(_local(19, 30))
    calls_off = async_mock_service(hass, "homeassistant", "turn_off")
    await _setup(hass, STATE_ON)
    assert calls_off == []

    freezer.move_to(_local(20, 0, 1))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()

    assert _targets(calls_off) == [PLUG]
    assert hass.states.get(STATUS).state == "off_hours"


async def test_schedule_switch_off(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    """Turning the schedule off switches the plug off and ignores the door."""
    freezer.move_to(_local(10))
    calls_off = async_mock_service(hass, "homeassistant", "turn_off")
    calls_on = async_mock_service(hass, "homeassistant", "turn_on")
    await _setup(hass, STATE_ON)

    await hass.services.async_call(
        "switch", "turn_off", {"entity_id": SCHEDULE}, blocking=True
    )
    await hass.async_block_till_done()
    assert _targets(calls_off) == [PLUG]
    assert hass.states.get(STATUS).state == "schedule_off"

    hass.states.async_set(PLUG, STATE_OFF)
    hass.states.async_set(DOOR, STATE_ON)
    hass.states.async_set(DOOR, STATE_OFF)
    await hass.async_block_till_done()
    assert calls_on == []
