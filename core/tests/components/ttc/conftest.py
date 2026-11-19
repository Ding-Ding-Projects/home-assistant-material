"""Fixtures for the TTC transit tests.

The feeds are answered from saved public responses, so no test reaches the network.
"""

from collections.abc import Generator
from typing import Any
from unittest.mock import patch

from freezegun.api import FrozenDateTimeFactory
import pytest
from pytest_homeassistant.common import MockConfigEntry, load_json_object_fixture
from pytest_homeassistant.test_util.aiohttp import AiohttpClientMocker

from homeassistant.components.ttc.const import (
    CONF_ROUTES,
    CONF_STATIONS,
    CONF_STOPS,
    CONF_WATCH_ALERTS,
    CONF_WATCH_DEPARTURES,
    CONF_WATCH_LIFTS,
    DOMAIN,
    LIVE_ALERTS_URL,
    NEXTBUS_URL,
)
from homeassistant.core import HomeAssistant

# Shortly after the saved predictions were read.
NOW = "2026-11-18 23:30:10+00:00"
ROUTES = ["1", "5", "103", "504"]
STATIONS = ["Caledonia", "Woodbine", "Spadina", "St George"]
STOPS = ["8126"]

PREDICTIONS_URL = f"{NEXTBUS_URL}?command=predictions"
ROUTE_LIST_URL = f"{NEXTBUS_URL}?command=routeList"
ROUTE_CONFIG_URL = f"{NEXTBUS_URL}?command=routeConfig"


def live_alerts() -> dict[str, Any]:
    """Return the saved live alerts answer."""
    return load_json_object_fixture("live_alerts.json", DOMAIN)


def predictions() -> dict[str, Any]:
    """Return the saved predictions answer."""
    return load_json_object_fixture("predictions.json", DOMAIN)


def mock_feeds(
    aioclient_mock: AiohttpClientMocker,
    alerts: dict[str, Any] | None = None,
    stop_predictions: dict[str, Any] | None = None,
) -> None:
    """Answer every feed from the saved responses."""
    aioclient_mock.clear_requests()
    aioclient_mock.get(LIVE_ALERTS_URL, json=alerts or live_alerts())
    aioclient_mock.get(PREDICTIONS_URL, json=stop_predictions or predictions())
    aioclient_mock.get(
        ROUTE_LIST_URL, json=load_json_object_fixture("route_list.json", DOMAIN)
    )
    aioclient_mock.get(
        ROUTE_CONFIG_URL,
        json=load_json_object_fixture("route_config_504.json", DOMAIN),
    )


@pytest.fixture
def mock_config_entry() -> MockConfigEntry:
    """Return an entry watching everything."""
    return MockConfigEntry(
        domain=DOMAIN,
        title="TTC transit",
        data={
            CONF_WATCH_ALERTS: True,
            CONF_WATCH_LIFTS: True,
            CONF_WATCH_DEPARTURES: True,
            CONF_ROUTES: ROUTES,
            CONF_STATIONS: STATIONS,
            CONF_STOPS: STOPS,
        },
    )


@pytest.fixture
def mock_setup_entry() -> Generator[None]:
    """Do not set up the entry while testing the flow."""
    with patch("homeassistant.components.ttc.async_setup_entry", return_value=None):
        yield


@pytest.fixture
def feeds(aioclient_mock: AiohttpClientMocker) -> AiohttpClientMocker:
    """Answer the feeds from the saved responses."""
    mock_feeds(aioclient_mock)
    return aioclient_mock


@pytest.fixture
async def init_integration(
    hass: HomeAssistant,
    freezer: FrozenDateTimeFactory,
    mock_config_entry: MockConfigEntry,
    feeds: AiohttpClientMocker,
) -> MockConfigEntry:
    """Set up the integration at a fixed moment."""
    freezer.move_to(NOW)
    mock_config_entry.add_to_hass(hass)
    await hass.config_entries.async_setup(mock_config_entry.entry_id)
    await hass.async_block_till_done()
    return mock_config_entry
