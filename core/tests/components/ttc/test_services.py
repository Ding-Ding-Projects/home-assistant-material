"""Tests for the TTC transit actions, page data and diagnostics."""

import pytest
from pytest_homeassistant.common import MockConfigEntry
from pytest_homeassistant.test_util.aiohttp import AiohttpClientMocker
from pytest_homeassistant.typing import WebSocketGenerator

from homeassistant.components.ttc.const import DOMAIN
from homeassistant.components.ttc.diagnostics import async_get_config_entry_diagnostics
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError
from homeassistant.setup import async_setup_component

from .conftest import PREDICTIONS_URL


@pytest.mark.usefixtures("init_integration")
async def test_get_departures(hass: HomeAssistant) -> None:
    """Test departures for any stop are returned as predictions."""
    response = await hass.services.async_call(
        DOMAIN,
        "get_departures",
        {"stop": "8126", "route": "504", "limit": 2},
        blocking=True,
        return_response=True,
    )
    assert response["stop_title"] == "Spadina Ave At King St West"
    assert response["predicted"] is True
    assert [item["trip"] for item in response["departures"]] == [
        "50960224",
        "50960225",
    ]


@pytest.mark.usefixtures("init_integration")
async def test_get_departures_unknown_stop(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker
) -> None:
    """Test an unknown stop is reported."""
    aioclient_mock.clear_requests()
    aioclient_mock.get(PREDICTIONS_URL, json={"Error": {"content": "bad stop"}})
    with pytest.raises(ServiceValidationError):
        await hass.services.async_call(
            DOMAIN,
            "get_departures",
            {"stop": "99999"},
            blocking=True,
            return_response=True,
        )


@pytest.mark.usefixtures("init_integration")
async def test_get_departures_unreachable(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker
) -> None:
    """Test an unreachable service is reported."""
    aioclient_mock.clear_requests()
    aioclient_mock.get(PREDICTIONS_URL, exc=TimeoutError())
    with pytest.raises(HomeAssistantError):
        await hass.services.async_call(
            DOMAIN,
            "get_departures",
            {"stop": "8126"},
            blocking=True,
            return_response=True,
        )


async def test_actions_need_the_entry(hass: HomeAssistant) -> None:
    """Test the actions report when the integration is not loaded."""
    assert await async_setup_component(hass, DOMAIN, {})
    with pytest.raises(ServiceValidationError):
        await hass.services.async_call(DOMAIN, "refresh", {}, blocking=True)


async def test_refresh(
    hass: HomeAssistant,
    init_integration: MockConfigEntry,
    aioclient_mock: AiohttpClientMocker,
) -> None:
    """Test refresh asks the feeds again."""
    before = aioclient_mock.call_count
    await hass.services.async_call(DOMAIN, "refresh", {}, blocking=True)
    await hass.async_block_till_done()
    assert aioclient_mock.call_count > before


@pytest.mark.usefixtures("init_integration")
async def test_overview(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """Test the page data has every part with when it was read."""
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "ttc/overview"})
    result = (await client.receive_json())["result"]
    assert result["feeds"]["alerts"]["fresh"] is True
    assert result["feeds"]["departures"]["read_at"] == "2026-11-18T23:30:10+00:00"
    assert [route["status"] for route in result["routes"]] == [
        "reduced_service",
        "no_service",
        "detour",
        "regular",
    ]
    assert result["routes"][2]["name"] == "103 Mount Pleasant North"
    woodbine = next(
        item for item in result["stations"] if item["station"] == "Woodbine"
    )
    assert woodbine["step_free"] is False
    assert len(result["stops"][0]["departures"]) == 13
    assert len(result["alerts"]) == 8


async def test_diagnostics(
    hass: HomeAssistant, init_integration: MockConfigEntry
) -> None:
    """Test diagnostics hold only the chosen public numbers and counts."""
    diagnostics = await async_get_config_entry_diagnostics(hass, init_integration)
    assert diagnostics["settings"]["stops"] == ["8126"]
    assert diagnostics["alerts_in_effect"] == 8
    assert diagnostics["stations"][1] == {
        "station": "Woodbine",
        "elevators_out": 1,
        "escalators_out": 0,
    }
    assert diagnostics["stops"][0]["departures"] == 13
