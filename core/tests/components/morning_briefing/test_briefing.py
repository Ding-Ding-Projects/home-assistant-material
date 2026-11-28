"""Tests for the briefing text, the daily timer and the entities."""

from datetime import datetime
from typing import Any

from freezegun.api import FrozenDateTimeFactory
from pytest_homeassistant.common import (
    MockConfigEntry,
    async_capture_events,
    async_fire_time_changed,
    async_mock_service,
)

from homeassistant.components.morning_briefing.const import DOMAIN, EVENT_SENT
from homeassistant.const import STATE_OFF, STATE_ON
from homeassistant.core import HomeAssistant, ServiceCall, SupportsResponse
from homeassistant.helpers import entity_registry as er
from homeassistant.util import dt as dt_util

SEND_BUTTON = "button.daily_send_now"
ENABLED = "switch.daily_enabled"
NEXT = "sensor.daily_next_briefing"
LAST = "sensor.daily_last_briefing"


def _local(day: int, hour: int, minute: int = 0) -> datetime:
    return dt_util.as_utc(
        datetime(2026, 11, day, hour, minute, tzinfo=dt_util.get_default_time_zone())
    )


async def _setup(hass: HomeAssistant, **options: Any) -> MockConfigEntry:
    entry = MockConfigEntry(
        domain=DOMAIN,
        title="Daily",
        options={
            "name": "Daily",
            "time": "07:30:00",
            "notify": ["notify.phone"],
            **options,
        },
    )
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


async def _press(hass: HomeAssistant) -> None:
    await hass.services.async_call(
        "button", "press", {"entity_id": SEND_BUTTON}, blocking=True
    )


def _register_forecast(hass: HomeAssistant, forecast: list[dict[str, Any]]) -> None:
    async def forecasts(call: ServiceCall) -> dict[str, Any]:
        return {"weather.home": {"forecast": forecast}}

    hass.services.async_register(
        "weather", "get_forecasts", forecasts, supports_response=SupportsResponse.ONLY
    )


def _add_grow_light(
    hass: HomeAssistant, title: str, states: dict[str, tuple[str, dict[str, Any]]]
) -> None:
    entry = MockConfigEntry(domain="grow_light", title=title)
    entry.add_to_hass(hass)
    registry = er.async_get(hass)
    for key, (state, attributes) in states.items():
        reg = registry.async_get_or_create(
            "sensor",
            "grow_light",
            f"{title}_{key}",
            config_entry=entry,
            translation_key=key,
            suggested_object_id=f"{title}_{key}".lower().replace(" ", "_"),
        )
        hass.states.async_set(reg.entity_id, state, attributes)


async def test_empty_briefing_is_all_quiet(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    """With nothing to say a short line is still sent."""
    freezer.move_to(_local(23, 7, 30))
    calls = async_mock_service(hass, "notify", "phone")
    await _setup(hass)

    await _press(hass)

    assert calls[0].data["message"] == "Good morning, it is 07:30.\nAll quiet."


async def test_weather_forecast(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    """Today's daily forecast is summarized with 24-hour-friendly numbers."""
    freezer.move_to(_local(23, 7, 30))
    calls = async_mock_service(hass, "notify", "phone")
    hass.states.async_set("weather.home", "cloudy", {"temperature": 8})
    _register_forecast(
        hass,
        [
            {"datetime": _local(22, 12).isoformat(), "condition": "snowy"},
            {
                "datetime": _local(23, 12).isoformat(),
                "condition": "partlycloudy",
                "temperature": 12,
                "templow": 4.5,
                "precipitation_probability": 30,
            },
        ],
    )
    await _setup(hass, weather="weather.home")

    await _press(hass)

    assert calls[0].data["message"].splitlines()[1] == (
        "Weather today: Partlycloudy, 4.5 to 12 °C, 30% chance of rain."
    )


async def test_weather_falls_back_to_current(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    """Without a forecast service the current condition and temperature are used."""
    freezer.move_to(_local(23, 7, 30))
    calls = async_mock_service(hass, "notify", "phone")
    hass.states.async_set("weather.home", "rainy", {"temperature": 6})
    await _setup(hass, weather="weather.home")

    await _press(hass)

    assert calls[0].data["message"].splitlines()[1] == "Weather now: Rainy, 6 °C now."


async def test_transit_and_extra(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    """Quiet transit sensors are skipped; extra entities are listed as lines."""
    freezer.move_to(_local(23, 7, 30))
    calls = async_mock_service(hass, "notify", "phone")
    hass.states.async_set("sensor.line_1", "Delays", {"friendly_name": "Line 1"})
    hass.states.async_set("sensor.line_2", "ok", {"friendly_name": "Line 2"})
    hass.states.async_set(
        "sensor.pool",
        "24",
        {"friendly_name": "Pool", "unit_of_measurement": "°C"},
    )
    await _setup(
        hass,
        transit=["sensor.line_1", "sensor.line_2"],
        extra=["sensor.pool", "sensor.missing"],
    )

    await _press(hass)

    assert calls[0].data["message"].splitlines()[1:] == [
        "Transit alerts:",
        "- Line 1: Delays",
        "Pool: 24 °C",
        "sensor.missing: unavailable.",
    ]


async def test_unavailable_sources(hass: HomeAssistant) -> None:
    """Mixed availability stays explicit and mobile targets get an entity action."""
    calls = async_mock_service(hass, "notify", "mobile_app_phone")
    hass.states.async_set("sensor.line", "ok")
    hass.states.async_set("sensor.bus", "unavailable", {"friendly_name": "Bus"})
    await _setup(
        hass, notify=["notify.mobile_app_phone"], transit=["sensor.line", "sensor.bus"]
    )

    await _press(hass)
    assert "No alerts from 1 checked source." in calls[0].data["message"]
    assert "Bus: unavailable." in calls[0].data["message"]
    assert calls[0].data["data"]["actions"] == [
        {"action": "URI", "title": "Bus", "uri": "entityId:sensor.bus"}
    ]
    hass.states.async_set("sensor.line", "unknown")
    await _press(hass)
    assert "Couldn’t check your selected sources." in calls[1].data["message"]
    assert "All quiet." not in calls[1].data["message"]
    hass.states.async_set("sensor.line", "ok")
    hass.states.async_set("sensor.bus", "ok")
    await _press(hass)
    assert "All quiet." in calls[2].data["message"]
    assert "data" not in calls[2].data


async def test_grow_lights(hass: HomeAssistant, freezer: FrozenDateTimeFactory) -> None:
    """Watering, stage changes, harvest and paused lights are reported."""
    freezer.move_to(_local(23, 7, 30))
    calls = async_mock_service(hass, "notify", "phone")
    _add_grow_light(
        hass,
        "Basil shelf",
        {
            "next_watering": (_local(23, 6).isoformat(), {}),
            "stage": (
                "flowering",
                {"plant": "Basil", "day_in_stage": 1, "days_since_planting": 40},
            ),
            "status": ("paused", {}),
        },
    )
    _add_grow_light(
        hass,
        "Pea tent",
        {
            "next_watering": (_local(25, 6).isoformat(), {}),
            "stage": ("harvest", {"plant": "Pea", "day_in_stage": 5}),
            "status": ("on", {}),
        },
    )
    await _setup(hass)

    await _press(hass)

    assert calls[0].data["message"].splitlines()[1:] == [
        "Water today: Basil (Basil shelf).",
        "New stage: Basil (Basil shelf) is now in flowering.",
        "Ready to harvest: Pea (Pea tent).",
        "Light paused (door open): Basil shelf.",
    ]


async def test_button_sends_and_fires_event(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    """Send now notifies every target, fires the event and updates the sensor."""
    freezer.move_to(_local(23, 9))
    phone = async_mock_service(hass, "notify", "phone")
    tablet = async_mock_service(hass, "notify", "tablet")
    events = async_capture_events(hass, EVENT_SENT)
    await _setup(hass, notify=["notify.phone", "notify.tablet"])

    await _press(hass)
    await hass.async_block_till_done()

    assert len(phone) == len(tablet) == 1
    assert events[0].data["message"] == phone[0].data["message"]
    state = hass.states.get(LAST)
    assert state.attributes["message"] == phone[0].data["message"]
    assert dt_util.parse_datetime(state.state) == _local(23, 9)


async def test_timer_sends_when_enabled_only(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    """The daily timer sends at the chosen time unless the switch is off."""
    freezer.move_to(_local(23, 7))
    calls = async_mock_service(hass, "notify", "phone")
    await _setup(hass)
    assert dt_util.parse_datetime(hass.states.get(NEXT).state) == _local(23, 7, 30)

    freezer.move_to(_local(23, 7, 30))
    async_fire_time_changed(hass, _local(23, 7, 30))
    await hass.async_block_till_done()
    assert len(calls) == 1
    assert dt_util.parse_datetime(hass.states.get(NEXT).state) == _local(24, 7, 30)

    await hass.services.async_call(
        "switch", "turn_off", {"entity_id": ENABLED}, blocking=True
    )
    assert hass.states.get(ENABLED).state == STATE_OFF
    assert hass.states.get(NEXT).state == "unknown"

    freezer.move_to(_local(24, 7, 30))
    async_fire_time_changed(hass, _local(24, 7, 30))
    await hass.async_block_till_done()
    assert len(calls) == 1

    await hass.services.async_call(
        "switch", "turn_on", {"entity_id": ENABLED}, blocking=True
    )
    assert hass.states.get(ENABLED).state == STATE_ON
