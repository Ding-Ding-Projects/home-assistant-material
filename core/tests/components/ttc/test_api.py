"""Tests for reading the TTC feeds."""

from datetime import UTC, datetime

import pytest

from homeassistant.components.ttc.api import (
    TTCDataError,
    TTCInvalidStopError,
    normalize_station,
    parse_live_alerts,
    parse_predictions,
    route_name,
)

from .conftest import live_alerts, predictions

READ_AT = datetime(2026, 11, 18, 23, 30, 10, tzinfo=UTC)


def test_parse_live_alerts() -> None:
    """Test route, elevator and escalator alerts are told apart."""
    data = parse_live_alerts(live_alerts(), READ_AT)
    kinds = sorted(alert.kind for alert in data.current)
    assert kinds == ["elevator", "escalator", "escalator", "escalator"] + ["route"] * 4
    assert data.route_status("1") == "reduced_service"
    assert data.route_status("504") == "regular"
    assert [
        alert.station for alert in data.station_outages("woodbine station", "elevator")
    ] == ["Woodbine"]


@pytest.mark.parametrize(
    "payload",
    [
        pytest.param([], id="list"),
        pytest.param({"routes": None}, id="no_routes"),
        pytest.param({"routes": [{"no_id": True}]}, id="no_id"),
    ],
)
def test_parse_live_alerts_malformed(payload: object) -> None:
    """Test malformed answers are reported, not guessed at."""
    with pytest.raises(TTCDataError):
        parse_live_alerts(payload, READ_AT)


def test_parse_predictions_single_items() -> None:
    """Test a single direction or prediction, sent without a list, is read."""
    answer = {
        "predictions": {
            "routeTag": "29",
            "routeTitle": "29-Dufferin",
            "stopTitle": "Dufferin St At King St West",
            "direction": {
                "title": "North - 29 Dufferin towards Wilson Station",
                "prediction": {
                    "epochTime": "1795044701583",
                    "seconds": "90",
                    "tripTag": "1",
                    "vehicle": "8001",
                    "isDeparture": "false",
                },
            },
        }
    }
    data = parse_predictions(answer, "1234", READ_AT)
    assert len(data.predictions) == 1
    assert data.predictions[0].route == "29"


def test_parse_predictions() -> None:
    """Test the saved predictions are sorted by time."""
    data = parse_predictions(predictions(), "8126", READ_AT)
    times = [item.time for item in data.predictions]
    assert times == sorted(times)
    assert data.idle_routes == ("310", "304")


@pytest.mark.parametrize(
    ("payload", "error"),
    [
        pytest.param({"Error": {"content": "bad"}}, TTCInvalidStopError, id="unknown"),
        pytest.param("text", TTCDataError, id="text"),
        pytest.param(
            {"predictions": {"routeTag": "1", "direction": {"prediction": {}}}},
            TTCDataError,
            id="missing_fields",
        ),
    ],
)
def test_parse_predictions_errors(payload: object, error: type[Exception]) -> None:
    """Test unknown stops and malformed answers."""
    with pytest.raises(error):
        parse_predictions(payload, "1", READ_AT)


def test_names() -> None:
    """Test route and station names."""
    assert route_name("1", {}) == "Line 1 Yonge-University"
    assert route_name("504", {"504": "504-King"}) == "504 King"
    assert route_name("999", {}) == "999"
    assert normalize_station("St. George Station") == normalize_station("st george")
