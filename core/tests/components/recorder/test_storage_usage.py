"""The tests for the recorder storage usage websocket commands."""

from pytest_homeassistant.common import MockUser
from pytest_homeassistant.components.recorder.common import async_wait_recording_done
from pytest_homeassistant.typing import WebSocketGenerator
import pytest

from homeassistant.components.recorder import Recorder
from homeassistant.components.recorder.storage_usage import (
    GROWTH_DAYS,
    _average_row_bytes,
    _day_starts,
    _estimate,
)
from homeassistant.core import HomeAssistant


async def _record_states(hass: HomeAssistant, recorder_mock: Recorder) -> None:
    """Record three changes of one sensor and one of another."""
    for value in ("1", "2", "3"):
        hass.states.async_set("sensor.busy", value)
    hass.states.async_set("sensor.quiet", "on")
    await async_wait_recording_done(hass)


async def test_storage_overview(
    hass: HomeAssistant,
    recorder_mock: Recorder,
    hass_ws_client: WebSocketGenerator,
) -> None:
    """Test the overview lists entities biggest first and the growth days."""
    await _record_states(hass, recorder_mock)
    client = await hass_ws_client()

    await client.send_json_auto_id({"type": "recorder/storage/overview"})
    response = await client.receive_json()

    assert response["success"]
    result = response["result"]
    assert result["states"]["rows"] == 4
    assert [(e["entity_id"], e["rows"]) for e in result["entities"]] == [
        ("sensor.busy", 3),
        ("sensor.quiet", 1),
    ]
    for entity in result["entities"]:
        assert entity["estimated_bytes"] == _estimate(
            entity["rows"], result["states"]["average_row_bytes"]
        )
    assert len(result["growth"]) == GROWTH_DAYS
    assert sum(day["rows"] for day in result["growth"]) == 4
    assert result["database"]["engine"] == "sqlite"


async def test_storage_overview_limit(
    hass: HomeAssistant,
    recorder_mock: Recorder,
    hass_ws_client: WebSocketGenerator,
) -> None:
    """Test the entity list is limited."""
    await _record_states(hass, recorder_mock)
    client = await hass_ws_client()

    await client.send_json_auto_id({"type": "recorder/storage/overview", "limit": 1})
    response = await client.receive_json()

    assert response["success"]
    assert [e["entity_id"] for e in response["result"]["entities"]] == ["sensor.busy"]


@pytest.mark.parametrize("limit", [0, 201])
@pytest.mark.usefixtures("recorder_mock")
async def test_storage_overview_invalid_limit(
    hass_ws_client: WebSocketGenerator, limit: int
) -> None:
    """Test the limit is bounded."""
    client = await hass_ws_client()

    await client.send_json_auto_id({"type": "recorder/storage/overview", "limit": limit})
    response = await client.receive_json()

    assert not response["success"]
    assert response["error"]["code"] == "invalid_format"


async def test_storage_entity(
    hass: HomeAssistant,
    recorder_mock: Recorder,
    hass_ws_client: WebSocketGenerator,
) -> None:
    """Test the details of one entity."""
    await _record_states(hass, recorder_mock)
    client = await hass_ws_client()

    await client.send_json_auto_id(
        {"type": "recorder/storage/entity", "entity_id": "sensor.busy", "days": 3}
    )
    response = await client.receive_json()

    assert response["success"]
    result = response["result"]
    assert result["rows"] == 3
    assert result["first"] <= result["last"]
    assert len(result["per_day"]) == 3
    assert sum(day["rows"] for day in result["per_day"]) == 3
    assert result["recording_excluded"] is False
    assert result["total_rows"] == 4


async def test_storage_entity_unknown(
    hass: HomeAssistant,
    recorder_mock: Recorder,
    hass_ws_client: WebSocketGenerator,
) -> None:
    """Test an entity without history reports no rows."""
    await _record_states(hass, recorder_mock)
    client = await hass_ws_client()

    await client.send_json_auto_id(
        {"type": "recorder/storage/entity", "entity_id": "sensor.never_seen"}
    )
    response = await client.receive_json()

    assert response["success"]
    assert response["result"]["rows"] == 0
    assert response["result"]["first"] is None
    assert response["result"]["per_day"] == []


@pytest.mark.parametrize("days", [0, 31])
@pytest.mark.usefixtures("recorder_mock")
async def test_storage_entity_invalid_days(
    hass_ws_client: WebSocketGenerator, days: int
) -> None:
    """Test the number of days is bounded."""
    client = await hass_ws_client()

    await client.send_json_auto_id(
        {"type": "recorder/storage/entity", "entity_id": "sensor.busy", "days": days}
    )
    response = await client.receive_json()

    assert not response["success"]
    assert response["error"]["code"] == "invalid_format"


@pytest.mark.parametrize(
    "command",
    [
        {"type": "recorder/storage/overview"},
        {"type": "recorder/storage/entity", "entity_id": "sensor.busy"},
    ],
)
@pytest.mark.usefixtures("recorder_mock")
async def test_storage_requires_admin(
    hass_ws_client: WebSocketGenerator,
    hass_admin_user: MockUser,
    command: dict[str, str],
) -> None:
    """Test the storage commands require an admin user."""
    hass_admin_user.groups = []
    client = await hass_ws_client()

    await client.send_json_auto_id(command)
    response = await client.receive_json()

    assert not response["success"]
    assert response["error"]["code"] == "unauthorized"


def test_average_row_bytes_and_estimate() -> None:
    """Test the size estimate helpers."""
    assert _average_row_bytes(1000, 10) == 100.0
    assert _average_row_bytes(None, 10) is None
    assert _average_row_bytes(1000, 0) is None
    assert _estimate(5, 100.0) == 500
    assert _estimate(5, None) is None


def test_day_starts_are_ascending() -> None:
    """Test the day boundaries cover the requested number of days."""
    starts = _day_starts(5)
    assert len(starts) == 5
    assert starts == sorted(starts)
