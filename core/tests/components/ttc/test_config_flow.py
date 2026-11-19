"""Tests for the TTC transit config flow."""

import pytest
from pytest_homeassistant.common import MockConfigEntry
from pytest_homeassistant.test_util.aiohttp import AiohttpClientMocker

from homeassistant.components.ttc.const import (
    CONF_ROUTES,
    CONF_STATIONS,
    CONF_STOPS,
    CONF_WATCH_ALERTS,
    CONF_WATCH_DEPARTURES,
    CONF_WATCH_LIFTS,
    DOMAIN,
)
from homeassistant.config_entries import SOURCE_USER
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType

from .conftest import PREDICTIONS_URL, ROUTE_CONFIG_URL, ROUTE_LIST_URL, mock_feeds

WATCH_ALL = {
    CONF_WATCH_ALERTS: True,
    CONF_WATCH_LIFTS: True,
    CONF_WATCH_DEPARTURES: True,
}


@pytest.mark.usefixtures("mock_setup_entry", "feeds")
async def test_full_flow(hass: HomeAssistant) -> None:
    """Test the three steps create an entry."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": SOURCE_USER}
    )
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "user"

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], WATCH_ALL
    )
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "routes"
    assert not result["errors"]

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {CONF_ROUTES: ["1", "504"], CONF_STATIONS: ["St George"]},
    )
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "stops"
    stops_field = result["data_schema"].schema[CONF_STOPS]
    labels = [option["label"] for option in stops_field.config["options"]]
    assert "Spadina Ave At King St West · stop 8126" in labels

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_STOPS: ["8126"]}
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["title"] == "TTC transit"
    assert result["data"] == {
        **WATCH_ALL,
        CONF_ROUTES: ["1", "504"],
        CONF_STATIONS: ["St George"],
        CONF_STOPS: ["8126"],
    }


@pytest.mark.usefixtures("mock_setup_entry", "feeds")
async def test_alerts_only(hass: HomeAssistant) -> None:
    """Test watching alerts only skips stations and stops."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": SOURCE_USER}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {
            CONF_WATCH_ALERTS: True,
            CONF_WATCH_LIFTS: False,
            CONF_WATCH_DEPARTURES: False,
        },
    )
    assert CONF_STATIONS not in result["data_schema"].schema
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_ROUTES: ["2"]}
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["data"][CONF_STOPS] == []
    assert result["data"][CONF_STATIONS] == []


@pytest.mark.usefixtures("mock_setup_entry", "feeds")
async def test_nothing_chosen(hass: HomeAssistant) -> None:
    """Test at least one thing must be watched."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": SOURCE_USER}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {
            CONF_WATCH_ALERTS: False,
            CONF_WATCH_LIFTS: False,
            CONF_WATCH_DEPARTURES: False,
        },
    )
    assert result["errors"] == {"base": "nothing_chosen"}


@pytest.mark.usefixtures("mock_setup_entry", "feeds")
async def test_no_stations(hass: HomeAssistant) -> None:
    """Test a station is needed when watching elevators."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": SOURCE_USER}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], WATCH_ALL
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_ROUTES: ["1"], CONF_STATIONS: []}
    )
    assert result["errors"] == {CONF_STATIONS: "no_stations"}


@pytest.mark.usefixtures("mock_setup_entry")
async def test_route_list_unavailable(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker
) -> None:
    """Test the subway lines are still offered when the route list fails."""
    aioclient_mock.get(ROUTE_LIST_URL, status=500)
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": SOURCE_USER}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {
            CONF_WATCH_ALERTS: True,
            CONF_WATCH_LIFTS: False,
            CONF_WATCH_DEPARTURES: False,
        },
    )
    assert result["errors"] == {"base": "routes_unavailable"}
    options = result["data_schema"].schema[CONF_ROUTES].config["options"]
    assert [option["value"] for option in options] == ["1", "2", "4", "5", "6"]


@pytest.mark.parametrize(
    ("answer", "stops", "error"),
    [
        pytest.param(
            {"Error": {"content": "bad"}},
            ["99999"],
            {CONF_STOPS: "invalid_stop"},
            id="unknown",
        ),
        pytest.param(
            None, ["King and Dufferin"], {CONF_STOPS: "invalid_stop"}, id="not_a_number"
        ),
        pytest.param(None, [], {CONF_STOPS: "no_stops"}, id="none"),
        pytest.param(
            None, ["St George"], {CONF_STOPS: "subway_not_offered"}, id="subway"
        ),
    ],
)
@pytest.mark.usefixtures("mock_setup_entry")
async def test_stop_errors(
    hass: HomeAssistant,
    aioclient_mock: AiohttpClientMocker,
    answer: dict | None,
    stops: list[str],
    error: dict[str, str],
) -> None:
    """Test stops are checked with the predictions service, then recover."""
    mock_feeds(aioclient_mock, stop_predictions=answer)
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": SOURCE_USER}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {
            CONF_WATCH_ALERTS: False,
            CONF_WATCH_LIFTS: False,
            CONF_WATCH_DEPARTURES: True,
        },
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_ROUTES: ["504"]}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_STOPS: stops}
    )
    assert result["errors"] == error

    mock_feeds(aioclient_mock)
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_STOPS: ["8126"]}
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY


@pytest.mark.usefixtures("mock_setup_entry")
async def test_stop_cannot_connect(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker
) -> None:
    """Test a stop check that cannot reach the service."""
    mock_feeds(aioclient_mock)
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": SOURCE_USER}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {
            CONF_WATCH_ALERTS: False,
            CONF_WATCH_LIFTS: False,
            CONF_WATCH_DEPARTURES: True,
        },
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_ROUTES: ["504"]}
    )
    aioclient_mock.clear_requests()
    aioclient_mock.get(PREDICTIONS_URL, exc=TimeoutError())
    aioclient_mock.get(ROUTE_CONFIG_URL, exc=TimeoutError())
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_STOPS: ["8126"]}
    )
    assert result["errors"] == {"base": "cannot_connect"}


@pytest.mark.usefixtures("mock_setup_entry", "feeds")
async def test_single_instance(
    hass: HomeAssistant, mock_config_entry: MockConfigEntry
) -> None:
    """Test only one entry can exist."""
    mock_config_entry.add_to_hass(hass)
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": SOURCE_USER}
    )
    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "single_instance_allowed"


@pytest.mark.usefixtures("mock_setup_entry", "feeds")
async def test_reconfigure(
    hass: HomeAssistant, mock_config_entry: MockConfigEntry
) -> None:
    """Test changing what is watched."""
    mock_config_entry.add_to_hass(hass)
    result = await mock_config_entry.start_reconfigure_flow(hass)
    assert result["step_id"] == "user"
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {
            CONF_WATCH_ALERTS: True,
            CONF_WATCH_LIFTS: False,
            CONF_WATCH_DEPARTURES: False,
        },
    )
    assert result["step_id"] == "routes"
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_ROUTES: ["2", "504"]}
    )
    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "reconfigure_successful"
    assert mock_config_entry.data == {
        CONF_WATCH_ALERTS: True,
        CONF_WATCH_LIFTS: False,
        CONF_WATCH_DEPARTURES: False,
        CONF_ROUTES: ["2", "504"],
        CONF_STATIONS: [],
        CONF_STOPS: [],
    }


@pytest.mark.usefixtures("mock_setup_entry", "feeds")
async def test_options(hass: HomeAssistant, mock_config_entry: MockConfigEntry) -> None:
    """Test changing routes, stations and stops."""
    mock_config_entry.add_to_hass(hass)
    result = await hass.config_entries.options.async_init(mock_config_entry.entry_id)
    assert result["step_id"] == "routes"
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {CONF_ROUTES: ["504"], CONF_STATIONS: ["Union"]}
    )
    assert result["step_id"] == "stops"
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {CONF_STOPS: ["8126"]}
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert mock_config_entry.options == {
        CONF_ROUTES: ["504"],
        CONF_STATIONS: ["Union"],
        CONF_STOPS: ["8126"],
    }
