"""Tests for alerts, soil moisture, energy and sowing reminders."""

from freezegun.api import FrozenDateTimeFactory
from pytest_homeassistant.common import (
    async_capture_events,
    async_fire_time_changed,
    async_mock_service,
)

from homeassistant.components.grow_light.const import CONF_PLANTED_ON
from homeassistant.const import STATE_ON
from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util

from .test_crop import NEXT_WATERING, PLUG, PUMP, _local, _setup, _targets, mock_plants  # noqa: F401

ALERTS = "event.shelf_alerts"
ENERGY = "sensor.shelf_light_energy"
COST = "sensor.shelf_light_cost"
NEXT_SOWING = "sensor.shelf_next_sowing"
SOWN = "button.shelf_sown_again"
MOISTURE = "sensor.shelf_soil"
PHONE = "notify.mobile_app_phone"


async def test_stage_change_alerts(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    """A new stage fires the event, the event entity and the phone, once."""
    freezer.move_to(_local(10, 10))
    async_mock_service(hass, "homeassistant", "turn_on")
    phone = async_mock_service(hass, "notify", "mobile_app_phone")
    events = async_capture_events(hass, "grow_light_alert")
    await _setup(hass, planted_on="2026-11-06", notify=[PHONE])
    kinds_before = [event.data["kind"] for event in events]

    freezer.move_to(_local(11, 6, 0, 1))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()

    kinds = [event.data["kind"] for event in events][len(kinds_before) :]
    assert kinds.count("stage_changed") == 1
    assert "stage_changed" not in kinds_before
    assert phone[-1].data["title"] == "Shelf"
    assert any("Test crop moved to seedling" in call.data["message"] for call in phone)
    alert = hass.states.get(ALERTS)
    assert alert.attributes["event_type"] == "stage_changed"


async def test_water_due_reminder_once(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    """Without a pump, a due watering sends one reminder, not one per check."""
    freezer.move_to(_local(10, 10))
    async_mock_service(hass, "homeassistant", "turn_on")
    events = async_capture_events(hass, "grow_light_alert")
    await _setup(hass, planted_on="2026-11-01")

    hass.states.async_set(PLUG, STATE_ON)
    await hass.async_block_till_done()
    freezer.move_to(_local(10, 11))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()

    assert [event.data["kind"] for event in events] == ["water_due"]
    assert events[0].data["message"] == "Test crop needs water."


async def test_wet_soil_skips_then_dry_soil_waters(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    """Wet soil postpones the pump a day; soil going dry runs it at once."""
    freezer.move_to(_local(10, 10))
    hass.states.async_set(MOISTURE, "55")
    calls_on = async_mock_service(hass, "homeassistant", "turn_on")
    async_mock_service(hass, "homeassistant", "turn_off")
    await _setup(
        hass,
        planted_on="2026-11-01",
        water_switch=PUMP,
        moisture=MOISTURE,
        dry_below=30,
    )

    assert PUMP not in _targets(calls_on)
    next_watering = hass.states.get(NEXT_WATERING)
    assert dt_util.parse_datetime(next_watering.state) == _local(11, 6)
    assert next_watering.attributes["soil_moisture"] == 55
    assert next_watering.attributes["dry_below"] == 30

    hass.states.async_set(MOISTURE, "22")
    await hass.async_block_till_done()

    assert PUMP in _targets(calls_on)


async def test_dry_soil_reminder_without_pump(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    """Without a pump, soil going dry sends a reminder."""
    freezer.move_to(_local(10, 10))
    hass.states.async_set(MOISTURE, "55")
    async_mock_service(hass, "homeassistant", "turn_on")
    events = async_capture_events(hass, "grow_light_alert")
    await _setup(hass, planted_on="2026-11-01", moisture=MOISTURE, dry_below=30)
    assert events == []

    hass.states.async_set(MOISTURE, "20")
    await hass.async_block_till_done()

    assert [event.data["kind"] for event in events] == ["soil_dry"]


async def test_energy_and_cost(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    """A 100 W light on for two hours uses 0.2 kWh, 0.1 at 0.5 a kWh."""
    freezer.move_to(_local(10, 10))
    async_mock_service(hass, "homeassistant", "turn_on")
    await _setup(hass, planted_on="2026-11-01", watts=100, price=0.5)

    hass.states.async_set(PLUG, STATE_ON)
    await hass.async_block_till_done()
    freezer.move_to(_local(10, 12))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()

    assert float(hass.states.get(ENERGY).state) == 0.2
    assert float(hass.states.get(COST).state) == 0.1


async def test_no_energy_without_power(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    """Without watts or a power sensor there is no energy or cost sensor."""
    freezer.move_to(_local(10, 10))
    async_mock_service(hass, "homeassistant", "turn_on")
    await _setup(hass, planted_on="2026-11-01", price=0.5)

    assert hass.states.get(ENERGY) is None
    assert hass.states.get(COST) is None


async def test_sowing_reminder(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    """Every 7 days from sowing a reminder to sow the next batch is sent."""
    freezer.move_to(_local(10, 10))
    async_mock_service(hass, "homeassistant", "turn_on")
    events = async_capture_events(hass, "grow_light_alert")
    await _setup(hass, planted_on="2026-11-01", resow_days=7)
    assert dt_util.parse_datetime(hass.states.get(NEXT_SOWING).state) == _local(15, 6)

    freezer.move_to(_local(15, 6, 0, 1))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()

    assert "sow_next" in [event.data["kind"] for event in events]
    assert dt_util.parse_datetime(hass.states.get(NEXT_SOWING).state) == _local(22, 6)


async def test_sown_again_button(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    """Sown again starts the crop over from today."""
    freezer.move_to(_local(10, 10))
    async_mock_service(hass, "homeassistant", "turn_on")
    entry = await _setup(hass, planted_on="2026-11-01")

    await hass.services.async_call(
        "button", "press", {"entity_id": SOWN}, blocking=True
    )
    await hass.async_block_till_done()

    assert entry.options[CONF_PLANTED_ON] == "2026-11-10"
    assert hass.states.get("sensor.shelf_growth_stage").state == "germination"
