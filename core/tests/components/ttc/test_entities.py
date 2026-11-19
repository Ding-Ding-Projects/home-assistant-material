"""Tests for the TTC transit entities."""

import copy

from freezegun.api import FrozenDateTimeFactory
import pytest
from pytest_homeassistant.common import MockConfigEntry, async_fire_time_changed
from pytest_homeassistant.test_util.aiohttp import AiohttpClientMocker

from homeassistant.components.ttc.const import (
    ALERTS_INTERVAL,
    LIVE_ALERTS_URL,
    PREDICTIONS_INTERVAL,
)
from homeassistant.const import STATE_UNAVAILABLE, STATE_UNKNOWN
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr

from .conftest import PREDICTIONS_URL, live_alerts, mock_feeds

STOP = "sensor.ttc_spadina_ave_at_king_st_west"


@pytest.mark.parametrize(
    ("entity_id", "state"),
    [
        pytest.param(
            "sensor.ttc_line_1_yonge_university_status", "reduced_service", id="line_1"
        ),
        pytest.param("sensor.ttc_line_5_eglinton_status", "no_service", id="line_5"),
        pytest.param(
            "sensor.ttc_103_mount_pleasant_north_status", "detour", id="route_103"
        ),
        pytest.param("sensor.ttc_504_king_status", "regular", id="route_504"),
        pytest.param("binary_sensor.ttc_line_5_eglinton_problem", "on", id="problem"),
        pytest.param("binary_sensor.ttc_504_king_problem", "off", id="no_problem"),
        pytest.param("sensor.ttc_network_alerts", "8", id="alerts"),
        pytest.param("sensor.ttc_woodbine_station_elevators_out", "1", id="elevator"),
        pytest.param("sensor.ttc_spadina_station_escalators_out", "2", id="escalators"),
        pytest.param("sensor.ttc_st_george_station_elevators_out", "0", id="none_out"),
        pytest.param(
            "binary_sensor.ttc_woodbine_station_step_free", "off", id="not_step_free"
        ),
        pytest.param(
            "binary_sensor.ttc_caledonia_station_step_free", "on", id="step_free"
        ),
        pytest.param(f"{STOP}_next_departure", "2026-11-18T23:31:41+00:00", id="next"),
        pytest.param(
            f"{STOP}_second_departure", "2026-11-18T23:40:14+00:00", id="second"
        ),
        pytest.param(
            f"{STOP}_third_departure", "2026-11-18T23:44:42+00:00", id="third"
        ),
        pytest.param(f"{STOP}_minutes_to_next_departure", "1", id="minutes"),
        pytest.param(
            "binary_sensor.ttc_network_departures_are_fresh", "on", id="fresh"
        ),
    ],
)
@pytest.mark.usefixtures("init_integration")
async def test_entity_states(hass: HomeAssistant, entity_id: str, state: str) -> None:
    """Test each kind of entity reports the saved answers."""
    assert (current := hass.states.get(entity_id))
    assert current.state == state
    if state != STATE_UNAVAILABLE and "fresh" not in entity_id:
        assert current.attributes["read_at"] == "2026-11-18T23:30:10+00:00"


@pytest.mark.usefixtures("init_integration")
async def test_route_attributes_keep_agency_text(hass: HomeAssistant) -> None:
    """Test the agency's own words are passed on as written."""
    state = hass.states.get("sensor.ttc_line_5_eglinton_status")
    alert = state.attributes["alerts"][0]
    assert alert["text"].startswith("Line 5 Eglinton: No service between")
    assert alert["status"] == "no_service"
    assert state.attributes["attribution"].startswith("Contains information licensed")


@pytest.mark.usefixtures("init_integration")
async def test_departure_attributes(hass: HomeAssistant) -> None:
    """Test departures name the route, direction and that they are predictions."""
    attributes = hass.states.get(f"{STOP}_next_departure").attributes
    assert attributes["route"] == "510"
    assert attributes["direction"] == "South - 510 Spadina towards Queens Quay"
    assert attributes["predicted"] is True
    assert attributes["stop"] == "8126"


@pytest.mark.usefixtures("init_integration")
async def test_devices(hass: HomeAssistant, device_registry: dr.DeviceRegistry) -> None:
    """Test devices are grouped per route, stop, station and the network."""
    names = sorted(device.name for device in device_registry.devices)
    assert names == [
        "TTC 103 Mount Pleasant North",
        "TTC 504 King",
        "TTC Caledonia station",
        "TTC Line 1 Yonge-University",
        "TTC Line 5 Eglinton",
        "TTC Spadina Ave At King St West",
        "TTC Spadina station",
        "TTC St George station",
        "TTC Woodbine station",
        "TTC network",
    ]


async def test_departures_go_stale(
    hass: HomeAssistant,
    freezer: FrozenDateTimeFactory,
    aioclient_mock: AiohttpClientMocker,
    init_integration: MockConfigEntry,
) -> None:
    """Test departures become unavailable once their answer is too old."""
    aioclient_mock.clear_requests()
    aioclient_mock.get(LIVE_ALERTS_URL, json=live_alerts())
    aioclient_mock.get(PREDICTIONS_URL, exc=TimeoutError())
    freezer.tick(PREDICTIONS_INTERVAL)
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    assert hass.states.get(f"{STOP}_next_departure").state != STATE_UNAVAILABLE

    for _ in range(5):
        freezer.tick(PREDICTIONS_INTERVAL * 2)
        async_fire_time_changed(hass)
        await hass.async_block_till_done()
    assert hass.states.get(f"{STOP}_next_departure").state == STATE_UNAVAILABLE
    assert (
        hass.states.get("binary_sensor.ttc_network_departures_are_fresh").state == "off"
    )


async def test_new_alert_event_fires_once(
    hass: HomeAssistant,
    freezer: FrozenDateTimeFactory,
    aioclient_mock: AiohttpClientMocker,
    init_integration: MockConfigEntry,
) -> None:
    """Test the event entity fires once per new alert, not on every refresh."""
    entity_id = "event.ttc_network_new_alert"
    assert hass.states.get(entity_id).state == STATE_UNKNOWN

    answer = live_alerts()
    added = copy.deepcopy(answer["routes"][2])
    added["id"] = "99001"
    added["headerText"] = "504 King: Detour via Queen St"
    answer["routes"].append(added)
    mock_feeds(aioclient_mock, alerts=answer)

    freezer.tick(ALERTS_INTERVAL)
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    state = hass.states.get(entity_id)
    assert state.attributes["event_type"] == "route"
    assert state.attributes["id"] == "99001"
    fired_at = state.state

    freezer.tick(ALERTS_INTERVAL)
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    assert hass.states.get(entity_id).state == fired_at
