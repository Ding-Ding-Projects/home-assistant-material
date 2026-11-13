"""The tests for the per-entity recorder rules."""

from unittest.mock import patch

from pytest_homeassistant.common import MockUser
from pytest_homeassistant.components.recorder.common import async_wait_recording_done
from pytest_homeassistant.typing import WebSocketGenerator
import pytest

from homeassistant.components.recorder import Recorder, get_instance
from homeassistant.components.recorder.entity_rules import (
    EntityRecordingRules,
    EntityRule,
)
from homeassistant.core import HomeAssistant, State
from homeassistant.helpers.recorder import session_scope
from homeassistant.components.recorder.db_schema import States


def _state(value: str) -> State:
    return State("sensor.power", value)


def test_rules_default_records_everything() -> None:
    """An entity without a rule is always recorded."""
    rules = EntityRecordingRules()
    assert not rules.active
    assert rules.should_record("sensor.power", _state("1"))


def test_rules_disabled_drops_everything() -> None:
    """A disabled entity is never recorded."""
    rules = EntityRecordingRules()
    rules.set("sensor.power", EntityRule(recording_disabled=True))
    assert not rules.should_record("sensor.power", _state("1"))
    assert rules.should_record("sensor.other", _state("1"))


def test_rules_min_interval_and_value_change() -> None:
    """Repeats inside the interval are dropped, a new value is kept."""
    rules = EntityRecordingRules()
    rules.set("sensor.power", EntityRule(min_interval=60))
    with patch("time.monotonic", return_value=1000.0):
        assert rules.should_record("sensor.power", _state("1"))
    with patch("time.monotonic", return_value=1010.0):
        assert not rules.should_record("sensor.power", _state("1"))
        assert rules.should_record("sensor.power", _state("2"))
    with patch("time.monotonic", return_value=1060.0):
        # 50 s after the last recorded change, same value.
        assert not rules.should_record("sensor.power", _state("2"))
    with patch("time.monotonic", return_value=1071.0):
        assert rules.should_record("sensor.power", _state("2"))


def test_rules_min_interval_without_always_on_change() -> None:
    """Without always_on_change even a new value waits for the interval."""
    rules = EntityRecordingRules()
    rules.set("sensor.power", EntityRule(min_interval=60, always_on_change=False))
    with patch("time.monotonic", return_value=1000.0):
        assert rules.should_record("sensor.power", _state("1"))
    with patch("time.monotonic", return_value=1010.0):
        assert not rules.should_record("sensor.power", _state("2"))


def test_rules_removed_entity_is_recorded() -> None:
    """The removal of an entity is always recorded."""
    rules = EntityRecordingRules()
    rules.set("sensor.power", EntityRule(min_interval=60))
    with patch("time.monotonic", return_value=1000.0):
        assert rules.should_record("sensor.power", _state("1"))
        assert rules.should_record("sensor.power", None)


def test_rules_default_rule_is_removed() -> None:
    """Setting a rule that changes nothing removes it."""
    rules = EntityRecordingRules()
    rules.set("sensor.power", EntityRule(recording_disabled=True))
    rules.set("sensor.power", EntityRule())
    assert not rules.active


async def test_set_and_get_entity_options(
    hass: HomeAssistant,
    recorder_mock: Recorder,
    hass_ws_client: WebSocketGenerator,
) -> None:
    """Test switching off history and limiting the rate, with effect at once."""
    client = await hass_ws_client()

    await client.send_json_auto_id(
        {"type": "recorder/entity_options/get", "entity_id": "sensor.power"}
    )
    result = (await client.receive_json())["result"]
    assert result["recording_disabled_by"] is None
    assert result["min_interval"] == 0
    assert result["excluded_by_configuration"] is False

    await client.send_json_auto_id(
        {
            "type": "recorder/entity_options/set",
            "entity_id": "sensor.power",
            "recording_disabled": True,
        }
    )
    response = await client.receive_json()
    assert response["success"]
    assert response["result"]["recording_disabled_by"] == "user"

    hass.states.async_set("sensor.power", "1")
    hass.states.async_set("sensor.kept", "1")
    await async_wait_recording_done(hass)
    with session_scope(hass=hass, read_only=True) as session:
        assert session.query(States).count() == 1

    await client.send_json_auto_id(
        {
            "type": "recorder/entity_options/set",
            "entity_id": "sensor.power",
            "recording_disabled": False,
            "min_interval": 600,
        }
    )
    response = await client.receive_json()
    assert response["result"]["recording_disabled_by"] is None
    assert response["result"]["min_interval"] == 600
    assert get_instance(hass).entity_rules.get("sensor.power").min_interval == 600


@pytest.mark.usefixtures("recorder_mock")
@pytest.mark.parametrize("interval", [-1, 3601])
async def test_set_entity_options_bounds(
    hass_ws_client: WebSocketGenerator, interval: int
) -> None:
    """Test the interval is bounded."""
    client = await hass_ws_client()
    await client.send_json_auto_id(
        {
            "type": "recorder/entity_options/set",
            "entity_id": "sensor.power",
            "min_interval": interval,
        }
    )
    assert not (await client.receive_json())["success"]


@pytest.mark.usefixtures("recorder_mock")
async def test_set_entity_options_requires_admin(
    hass_ws_client: WebSocketGenerator, hass_admin_user: MockUser
) -> None:
    """Test only an admin can change the options."""
    hass_admin_user.groups = []
    client = await hass_ws_client()
    await client.send_json_auto_id(
        {
            "type": "recorder/entity_options/set",
            "entity_id": "sensor.power",
            "recording_disabled": True,
        }
    )
    response = await client.receive_json()
    assert not response["success"]
    assert response["error"]["code"] == "unauthorized"
