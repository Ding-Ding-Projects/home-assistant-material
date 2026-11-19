"""Tests for setting up TTC transit and polling its feeds."""

from datetime import timedelta

from freezegun.api import FrozenDateTimeFactory
import pytest
from pytest_homeassistant.common import MockConfigEntry, async_fire_time_changed
from pytest_homeassistant.test_util.aiohttp import AiohttpClientMocker

from homeassistant.components.ttc.const import (
    ALERTS_INTERVAL,
    CONF_WATCH_ALERTS,
    CONF_WATCH_DEPARTURES,
    CONF_WATCH_LIFTS,
    DOMAIN,
    LIVE_ALERTS_URL,
    MAX_BACKOFF,
)
from homeassistant.config_entries import ConfigEntryState
from homeassistant.const import STATE_UNAVAILABLE
from homeassistant.core import HomeAssistant

from .conftest import NOW, PREDICTIONS_URL, ROUTE_LIST_URL, mock_feeds

LINE_1_STATUS = "sensor.ttc_line_1_yonge_university_status"
ALERTS_FRESH = "binary_sensor.ttc_network_service_alerts_are_fresh"


async def _poll(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory, delta: timedelta
) -> None:
    freezer.tick(delta)
    async_fire_time_changed(hass)
    await hass.async_block_till_done()


async def test_setup_and_unload(
    hass: HomeAssistant, init_integration: MockConfigEntry
) -> None:
    """Test the entry loads and unloads."""
    assert init_integration.state is ConfigEntryState.LOADED
    assert await hass.config_entries.async_unload(init_integration.entry_id)
    assert init_integration.state is ConfigEntryState.NOT_LOADED


@pytest.mark.usefixtures("init_integration")
async def test_alerts_requested_once_for_both_feeds(
    feeds: AiohttpClientMocker,
) -> None:
    """Test elevators reuse the alerts answer instead of asking twice."""
    urls = [str(call[1]) for call in feeds.mock_calls]
    assert urls.count(LIVE_ALERTS_URL) == 1


async def test_nothing_requested_when_nothing_watched(
    hass: HomeAssistant,
    freezer: FrozenDateTimeFactory,
    feeds: AiohttpClientMocker,
) -> None:
    """Test no request is made when nothing is being watched."""
    freezer.move_to(NOW)
    entry = MockConfigEntry(
        domain=DOMAIN,
        data={
            CONF_WATCH_ALERTS: False,
            CONF_WATCH_LIFTS: False,
            CONF_WATCH_DEPARTURES: False,
        },
    )
    entry.add_to_hass(hass)
    await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    await _poll(hass, freezer, timedelta(minutes=10))
    assert entry.state is ConfigEntryState.LOADED
    assert feeds.call_count == 0


async def test_setup_retry_when_unreachable(
    hass: HomeAssistant,
    freezer: FrozenDateTimeFactory,
    aioclient_mock: AiohttpClientMocker,
    mock_config_entry: MockConfigEntry,
) -> None:
    """Test setup is retried when the alerts feed cannot be reached."""
    freezer.move_to(NOW)
    mock_feeds(aioclient_mock)
    aioclient_mock.clear_requests()
    aioclient_mock.get(LIVE_ALERTS_URL, exc=TimeoutError())
    aioclient_mock.get(ROUTE_LIST_URL, exc=TimeoutError())
    mock_config_entry.add_to_hass(hass)
    await hass.config_entries.async_setup(mock_config_entry.entry_id)
    await hass.async_block_till_done()
    assert mock_config_entry.state is ConfigEntryState.SETUP_RETRY


@pytest.mark.parametrize(
    ("failure", "expected_error"),
    [
        pytest.param({"exc": TimeoutError()}, "unreachable", id="timeout"),
        pytest.param({"status": 500}, "unreachable", id="server_error"),
        pytest.param(
            {"status": 429, "headers": {"Retry-After": "600"}}, "refused", id="refused"
        ),
        pytest.param({"json": {"unexpected": True}}, "malformed", id="malformed"),
        pytest.param({"text": "not json"}, "malformed", id="not_json"),
    ],
)
async def test_failures_back_off_and_go_stale(
    hass: HomeAssistant,
    freezer: FrozenDateTimeFactory,
    aioclient_mock: AiohttpClientMocker,
    init_integration: MockConfigEntry,
    failure: dict,
    expected_error: str,
) -> None:
    """Test failures keep the last figures, back off, then go unavailable."""
    coordinator = init_integration.runtime_data.alerts
    assert coordinator is not None
    assert hass.states.get(LINE_1_STATUS).state == "reduced_service"

    aioclient_mock.clear_requests()
    aioclient_mock.get(LIVE_ALERTS_URL, **failure)
    aioclient_mock.get(PREDICTIONS_URL, exc=TimeoutError())
    await _poll(hass, freezer, ALERTS_INTERVAL)

    assert coordinator.last_error == expected_error
    assert coordinator.update_interval > ALERTS_INTERVAL
    assert coordinator.update_interval <= MAX_BACKOFF
    # Recent figures stay, marked with when they were read.
    state = hass.states.get(LINE_1_STATUS)
    assert state.state == "reduced_service"
    assert state.attributes["read_at"] == "2026-11-18T23:30:10+00:00"
    assert hass.states.get(ALERTS_FRESH).state == "on"

    for _ in range(4):
        await _poll(hass, freezer, MAX_BACKOFF)

    assert hass.states.get(LINE_1_STATUS).state == STATE_UNAVAILABLE
    assert hass.states.get(ALERTS_FRESH).state == "off"
    assert hass.states.get(ALERTS_FRESH).attributes["last_error"] == expected_error

    mock_feeds(aioclient_mock)
    await _poll(hass, freezer, MAX_BACKOFF)
    assert coordinator.update_interval == ALERTS_INTERVAL
    assert coordinator.failures == 0
    assert hass.states.get(LINE_1_STATUS).state == "reduced_service"
    assert hass.states.get(ALERTS_FRESH).state == "on"


async def test_refusal_respects_retry_after(
    hass: HomeAssistant,
    freezer: FrozenDateTimeFactory,
    aioclient_mock: AiohttpClientMocker,
    init_integration: MockConfigEntry,
) -> None:
    """Test a refusal waits at least as long as asked."""
    coordinator = init_integration.runtime_data.alerts
    assert coordinator is not None
    aioclient_mock.clear_requests()
    aioclient_mock.get(LIVE_ALERTS_URL, status=429, headers={"Retry-After": "600"})
    await _poll(hass, freezer, ALERTS_INTERVAL)
    assert coordinator.update_interval == timedelta(seconds=600)
