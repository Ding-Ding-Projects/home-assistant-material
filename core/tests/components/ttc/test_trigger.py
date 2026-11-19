"""Tests for the TTC transit triggers and conditions."""

import copy
from typing import Any

from freezegun.api import FrozenDateTimeFactory
import pytest
from pytest_homeassistant.common import MockConfigEntry, async_fire_time_changed
from pytest_homeassistant.test_util.aiohttp import AiohttpClientMocker

from homeassistant.components import automation
from homeassistant.components.ttc.const import (
    ALERTS_INTERVAL,
    DOMAIN,
    LIVE_ALERTS_URL,
    PREDICTIONS_INTERVAL,
)
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.setup import async_setup_component

from .conftest import PREDICTIONS_URL, live_alerts, mock_feeds, predictions


async def _setup_automation(
    hass: HomeAssistant, trigger: str, options: dict[str, Any]
) -> None:
    assert await async_setup_component(
        hass,
        automation.DOMAIN,
        {
            automation.DOMAIN: {
                "trigger": {"trigger": f"{DOMAIN}.{trigger}", "options": options},
                "action": {
                    "action": "test.automation",
                    "data": {"description": "{{ trigger.description }}"},
                },
            }
        },
    )


async def _poll(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory, interval: Any
) -> None:
    freezer.tick(interval)
    async_fire_time_changed(hass)
    await hass.async_block_till_done()


def _without_route(answer: dict[str, Any], route: str) -> dict[str, Any]:
    answer = copy.deepcopy(answer)
    answer["routes"] = [item for item in answer["routes"] if item["route"] != route]
    return answer


def _with_504_detour(answer: dict[str, Any]) -> dict[str, Any]:
    answer = copy.deepcopy(answer)
    added = copy.deepcopy(
        next(item for item in answer["routes"] if item["route"] == "103")
    )
    added.update({"id": "99002", "route": "504", "headerText": "504 King: Detour"})
    answer["routes"].append(added)
    return answer


@pytest.mark.usefixtures("init_integration")
async def test_route_delayed_fires_once(
    hass: HomeAssistant,
    freezer: FrozenDateTimeFactory,
    aioclient_mock: AiohttpClientMocker,
    service_calls: list[ServiceCall],
) -> None:
    """Test a route getting a problem fires once, however often it is read."""
    await _setup_automation(hass, "route_delayed", {"route": "504"})
    mock_feeds(aioclient_mock, alerts=_with_504_detour(live_alerts()))
    for _ in range(3):
        await _poll(hass, freezer, ALERTS_INTERVAL)
    assert [call.data["description"] for call in service_calls] == [
        "route 504 is now detour"
    ]


@pytest.mark.usefixtures("init_integration")
async def test_route_resumed(
    hass: HomeAssistant,
    freezer: FrozenDateTimeFactory,
    aioclient_mock: AiohttpClientMocker,
    service_calls: list[ServiceCall],
) -> None:
    """Test a route back to regular service fires once; others stay quiet."""
    await _setup_automation(hass, "route_resumed", {})
    mock_feeds(aioclient_mock, alerts=_without_route(live_alerts(), "5"))
    for _ in range(2):
        await _poll(hass, freezer, ALERTS_INTERVAL)
    assert [call.data["description"] for call in service_calls] == [
        "route 5 is now regular"
    ]


@pytest.mark.usefixtures("init_integration")
async def test_new_alert_with_kind_filter(
    hass: HomeAssistant,
    freezer: FrozenDateTimeFactory,
    aioclient_mock: AiohttpClientMocker,
    service_calls: list[ServiceCall],
) -> None:
    """Test a new alert fires once, and only for the chosen kind."""
    await _setup_automation(hass, "new_alert", {"kind": "route"})
    answer = _with_504_detour(live_alerts())
    elevator = copy.deepcopy(answer["accessibility"][1])
    elevator["id"] = "99003"
    answer["accessibility"].append(elevator)
    mock_feeds(aioclient_mock, alerts=answer)
    for _ in range(2):
        await _poll(hass, freezer, ALERTS_INTERVAL)
    assert [call.data["description"] for call in service_calls] == ["new route alert"]


@pytest.mark.parametrize(
    ("change", "expected"),
    [
        pytest.param("out", ["elevator out at St George"], id="out"),
        pytest.param("back", ["elevator back at Woodbine"], id="back"),
        pytest.param(
            "any",
            ["elevator out at St George", "elevator back at Woodbine"],
            id="any",
        ),
    ],
)
@pytest.mark.usefixtures("init_integration")
async def test_lift_changed(
    hass: HomeAssistant,
    freezer: FrozenDateTimeFactory,
    aioclient_mock: AiohttpClientMocker,
    service_calls: list[ServiceCall],
    change: str,
    expected: list[str],
) -> None:
    """Test an elevator going out or coming back fires once each."""
    await _setup_automation(
        hass, "lift_changed", {"kind": "elevator", "change": change}
    )
    answer = live_alerts()
    woodbine = answer["accessibility"][1]
    st_george = copy.deepcopy(woodbine)
    st_george.update(
        {"id": "99004", "headerText": "St George: Elevator 1 out of service."}
    )
    answer["accessibility"] = [
        item for item in answer["accessibility"] if item["id"] != woodbine["id"]
    ] + [st_george]
    mock_feeds(aioclient_mock, alerts=answer)
    for _ in range(2):
        await _poll(hass, freezer, ALERTS_INTERVAL)
    assert [call.data["description"] for call in service_calls] == expected


def _predictions_shifted(seconds: int) -> dict[str, Any]:
    """Return the saved predictions as they would read some seconds later."""
    answer = predictions()
    for block in answer["predictions"]:
        directions = block.get("direction") or []
        for direction in directions if isinstance(directions, list) else [directions]:
            items = direction["prediction"]
            for item in items if isinstance(items, list) else [items]:
                item["seconds"] = str(int(item["seconds"]) - seconds)
    return answer


@pytest.mark.usefixtures("init_integration")
async def test_departure_within_fires_once_per_departure(
    hass: HomeAssistant,
    freezer: FrozenDateTimeFactory,
    aioclient_mock: AiohttpClientMocker,
    service_calls: list[ServiceCall],
) -> None:
    """Test each departure fires once when it first drops within the limit."""
    await _setup_automation(
        hass, "departure_within", {"stop": "8126", "route": "510", "minutes": 11}
    )
    # Already within the limit when attached: these do not fire.
    mock_feeds(aioclient_mock, stop_predictions=_predictions_shifted(100))
    await _poll(hass, freezer, PREDICTIONS_INTERVAL)
    await _poll(hass, freezer, PREDICTIONS_INTERVAL)
    # 50962427 drops from 871 s to 640 s, within 11 minutes.
    mock_feeds(aioclient_mock, stop_predictions=_predictions_shifted(231))
    await _poll(hass, freezer, PREDICTIONS_INTERVAL)
    await _poll(hass, freezer, PREDICTIONS_INTERVAL)
    assert [call.data["description"] for call in service_calls] == [
        "route 510 departs stop 8126 in 10 minutes"
    ]


@pytest.mark.usefixtures("init_integration")
async def test_time_to_leave(
    hass: HomeAssistant,
    freezer: FrozenDateTimeFactory,
    aioclient_mock: AiohttpClientMocker,
    service_calls: list[ServiceCall],
) -> None:
    """Test time to leave fires once with the walking time taken off."""
    await _setup_automation(
        hass, "time_to_leave", {"stop": "8126", "route": "504", "walk_minutes": 30}
    )
    mock_feeds(aioclient_mock, stop_predictions=_predictions_shifted(100))
    await _poll(hass, freezer, PREDICTIONS_INTERVAL)
    await _poll(hass, freezer, PREDICTIONS_INTERVAL)
    assert [call.data["description"] for call in service_calls] == [
        "time to leave for route 504 at stop 8126"
    ]


@pytest.mark.parametrize(
    ("condition", "options", "expected"),
    [
        pytest.param("route_has_problem", {"route": "5"}, True, id="problem"),
        pytest.param("route_has_problem", {"route": "504"}, False, id="no_problem"),
        pytest.param(
            "station_is_step_free", {"station": "Caledonia"}, True, id="step_free"
        ),
        pytest.param(
            "station_is_step_free", {"station": "Woodbine"}, False, id="not_step_free"
        ),
    ],
)
@pytest.mark.usefixtures("init_integration")
async def test_conditions(
    hass: HomeAssistant,
    service_calls: list[ServiceCall],
    condition: str,
    options: dict[str, str],
    expected: bool,
) -> None:
    """Test the conditions read the current alerts."""
    assert await async_setup_component(
        hass,
        automation.DOMAIN,
        {
            automation.DOMAIN: {
                "trigger": {"trigger": "event", "event_type": "test_event"},
                "condition": {
                    "condition": f"{DOMAIN}.{condition}",
                    "options": options,
                },
                "action": {"action": "test.automation"},
            }
        },
    )
    hass.bus.async_fire("test_event")
    await hass.async_block_till_done()
    assert bool(service_calls) is expected


async def test_condition_fails_when_old(
    hass: HomeAssistant,
    freezer: FrozenDateTimeFactory,
    init_integration: MockConfigEntry,
    aioclient_mock: AiohttpClientMocker,
    service_calls: list[ServiceCall],
) -> None:
    """Test old information does not pass a condition."""
    assert await async_setup_component(
        hass,
        automation.DOMAIN,
        {
            automation.DOMAIN: {
                "trigger": {"trigger": "event", "event_type": "test_event"},
                "condition": {
                    "condition": f"{DOMAIN}.station_is_step_free",
                    "options": {"station": "Caledonia"},
                },
                "action": {"action": "test.automation"},
            }
        },
    )
    aioclient_mock.clear_requests()
    aioclient_mock.get(LIVE_ALERTS_URL, exc=TimeoutError())
    aioclient_mock.get(PREDICTIONS_URL, exc=TimeoutError())
    for _ in range(4):
        freezer.tick(ALERTS_INTERVAL * 15)
        async_fire_time_changed(hass)
        await hass.async_block_till_done()
    hass.bus.async_fire("test_event")
    await hass.async_block_till_done()
    assert not service_calls
