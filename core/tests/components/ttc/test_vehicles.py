"""Tests for vehicle positions, which are read only while someone is looking."""

from freezegun.api import FrozenDateTimeFactory
import pytest
from pytest_homeassistant.common import (
    MockConfigEntry,
    async_fire_time_changed,
    load_json_object_fixture,
)
from pytest_homeassistant.test_util.aiohttp import AiohttpClientMocker
from pytest_homeassistant.typing import WebSocketGenerator

from homeassistant.components.ttc.api import parse_live_alerts, parse_vehicles
from homeassistant.components.ttc.const import DOMAIN, VEHICLES_INTERVAL
from homeassistant.core import HomeAssistant

from .conftest import live_alerts
from .test_api import READ_AT


def _vehicle_calls(aioclient_mock: AiohttpClientMocker) -> int:
    return sum(
        1 for call in aioclient_mock.mock_calls if "vehicleLocations" in str(call[1])
    )


async def test_vehicles_only_while_subscribed(
    hass: HomeAssistant,
    freezer: FrozenDateTimeFactory,
    init_integration: MockConfigEntry,
    aioclient_mock: AiohttpClientMocker,
    hass_ws_client: WebSocketGenerator,
) -> None:
    """Test positions are read while subscribed, and never otherwise."""
    for _ in range(3):
        freezer.tick(VEHICLES_INTERVAL)
        async_fire_time_changed(hass)
        await hass.async_block_till_done()
    assert _vehicle_calls(aioclient_mock) == 0

    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "ttc/vehicles/subscribe"})
    assert (await client.receive_json())["success"]
    event = (await client.receive_json())["event"]
    assert event["routes"] == ["504", "510"]
    assert event["fresh"] is True
    assert len(event["vehicles"]) == 8
    assert event["stops"]["8126"]["title"] == "Spadina Ave At King St West"
    first = _vehicle_calls(aioclient_mock)
    assert first == 2

    freezer.tick(VEHICLES_INTERVAL)
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    assert _vehicle_calls(aioclient_mock) == first + 2
    assert "event" in await client.receive_json()

    await client.send_json_auto_id({"type": "unsubscribe_events", "subscription": 1})
    await client.receive_json()
    for _ in range(3):
        freezer.tick(VEHICLES_INTERVAL)
        async_fire_time_changed(hass)
        await hass.async_block_till_done()
    assert _vehicle_calls(aioclient_mock) == first + 2


@pytest.mark.usefixtures("init_integration")
async def test_vehicles_not_watched(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    mock_config_entry: MockConfigEntry,
) -> None:
    """Test the subscription is refused without next departures."""
    await hass.config_entries.async_unload(mock_config_entry.entry_id)
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "ttc/vehicles/subscribe"})
    assert not (await client.receive_json())["success"]


def test_parse_vehicles() -> None:
    """Test the saved positions are read, including the report age."""
    vehicles = parse_vehicles(
        load_json_object_fixture("vehicle_locations_504.json", DOMAIN), "504"
    )
    assert [vehicle.seconds_since_report for vehicle in vehicles] == [5, 6, 6, 7]
    assert vehicles[0].latitude == pytest.approx(43.6441393)


def test_elevator_destination() -> None:
    """Test the place an elevator outage cuts off is taken from the text."""
    data = parse_live_alerts(live_alerts(), READ_AT)
    woodbine = data.station_outages("Woodbine", "elevator")[0]
    assert woodbine.destination == "Line 2 westbound platform"
    assert data.station_outages("Caledonia", "escalator")[0].destination is None
