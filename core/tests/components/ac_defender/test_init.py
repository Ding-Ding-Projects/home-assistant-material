"""Tests of setup, entities, services, the websocket API and diagnostics."""

from datetime import timedelta

from pytest_homeassistant.common import (
    MockConfigEntry,
    async_capture_events,
    async_fire_time_changed,
    async_mock_service,
)
from pytest_homeassistant.components.diagnostics import get_diagnostics_for_config_entry
from pytest_homeassistant.typing import ClientSessionGenerator, WebSocketGenerator

from homeassistant.components.ac_defender.const import (
    CONF_GUARDS,
    CONF_POWER_KW,
    DOMAIN,
)
from homeassistant.config_entries import ConfigEntryState
from homeassistant.const import EVENT_LOGBOOK_ENTRY
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr, entity_registry as er
from homeassistant.setup import async_setup_component
from homeassistant.util import dt as dt_util

from .conftest import CLIMATE, set_climate

STATE_SENSOR = "sensor.living_room_state"


async def mock_climate(hass: HomeAssistant) -> list:
    """Load the climate component, then replace its service with a recorder."""
    assert await async_setup_component(hass, "climate", {})
    return async_mock_service(hass, "climate", "set_temperature")


async def setup(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    """Set up the entry."""
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()


async def test_setup_and_unload(
    hass: HomeAssistant, mock_entry: MockConfigEntry
) -> None:
    """The entry loads, creates its entities on one device, and unloads."""
    set_climate(hass)
    await setup(hass, mock_entry)
    assert mock_entry.state is ConfigEntryState.LOADED
    registry = er.async_get(hass)
    entries = er.async_entries_for_config_entry(registry, mock_entry.entry_id)
    switches = [e for e in entries if e.domain == "switch"]
    assert len(switches) == 51
    assert {e.domain for e in entries} == {
        "button",
        "event",
        "number",
        "sensor",
        "switch",
    }
    assert len({e.device_id for e in entries}) == 1
    assert hass.states.get(STATE_SENSOR).state == "defending"
    assert await hass.config_entries.async_unload(mock_entry.entry_id)
    assert mock_entry.state is ConfigEntryState.NOT_LOADED


async def test_cost_sensors_need_a_power_figure(
    hass: HomeAssistant, mock_entry: MockConfigEntry
) -> None:
    """Without a power figure there is running time only."""
    set_climate(hass)
    await setup(hass, mock_entry)
    assert hass.states.get("sensor.living_room_running_time_today") is not None
    assert hass.states.get("sensor.living_room_estimated_cost_today") is None


async def test_cost_sensors_with_a_power_figure(hass: HomeAssistant) -> None:
    """A power figure adds the estimated cost sensors."""
    entry = MockConfigEntry(
        domain=DOMAIN,
        title="Living room",
        unique_id=CLIMATE,
        data={
            "climate_entity_id": CLIMATE,
            "my_temperature": 23.0,
            "safety_temperature": 28.0,
            CONF_POWER_KW: 1.2,
        },
    )
    set_climate(hass)
    await setup(hass, entry)
    assert hass.states.get("sensor.living_room_estimated_cost_today") is not None


async def test_hot_room_sends_a_command_and_logs_it(
    hass: HomeAssistant, mock_entry: MockConfigEntry
) -> None:
    """A hot room is driven cooler at once, logged to the logbook with the guard name."""
    calls = await mock_climate(hass)
    logbook = async_capture_events(hass, EVENT_LOGBOOK_ENTRY)
    set_climate(hass, room=29.0, setpoint=30.0)
    await setup(hass, mock_entry)
    assert len(calls) == 1
    assert calls[0].data["entity_id"] == CLIMATE
    assert calls[0].data["temperature"] == 28.5
    assert len(logbook) == 1
    assert "hot_room_override" in logbook[0].data["message"]
    assert hass.states.get("event.living_room_guard_acted").state != "unknown"
    switch = hass.states.get("switch.living_room_hot_room_override")
    assert switch.attributes["safety"] is True
    assert switch.attributes["last_acted"] is not None


async def test_timer_reevaluates(
    hass: HomeAssistant, mock_entry: MockConfigEntry
) -> None:
    """The periodic timer evaluates again without any state change."""
    calls = await mock_climate(hass)
    set_climate(hass)
    await setup(hass, mock_entry)
    assert calls == []
    hass.states.async_set(
        CLIMATE,
        "cool",
        {
            **hass.states.get(CLIMATE).attributes,
            "current_temperature": 29.0,
            "temperature": 30.0,
        },
        force_update=True,
    )
    await hass.async_block_till_done()
    assert len(calls) == 1
    async_fire_time_changed(hass, dt_util.utcnow() + timedelta(minutes=1))
    await hass.async_block_till_done()


async def test_unavailable_device_gets_no_command(
    hass: HomeAssistant, mock_entry: MockConfigEntry
) -> None:
    """An unavailable device is never commanded and its entities go unavailable."""
    calls = await mock_climate(hass)
    hass.states.async_set(CLIMATE, "unavailable", {})
    await setup(hass, mock_entry)
    assert calls == []
    assert hass.states.get(STATE_SENSOR).state == "unavailable"
    assert mock_entry.runtime_data.decision.state == "standing_down"


async def test_entities_come_back_with_the_device(
    hass: HomeAssistant, mock_entry: MockConfigEntry
) -> None:
    """Entities follow the defended unit: unavailable and back."""
    await mock_climate(hass)
    set_climate(hass)
    await setup(hass, mock_entry)
    assert hass.states.get(STATE_SENSOR).state != "unavailable"
    hass.states.async_set(CLIMATE, "unavailable", {})
    await hass.async_block_till_done()
    assert hass.states.get(STATE_SENSOR).state == "unavailable"
    set_climate(hass)
    await hass.async_block_till_done()
    assert hass.states.get(STATE_SENSOR).state != "unavailable"


async def test_setup_is_not_ready_while_the_device_is_missing(
    hass: HomeAssistant, mock_entry: MockConfigEntry
) -> None:
    """A missing climate entity makes setup retry instead of running blind."""
    await mock_climate(hass)
    mock_entry.add_to_hass(hass)
    await hass.config_entries.async_setup(mock_entry.entry_id)
    await hass.async_block_till_done()
    assert mock_entry.state is ConfigEntryState.SETUP_RETRY
    set_climate(hass)
    async_fire_time_changed(hass, dt_util.utcnow() + timedelta(minutes=2))
    await hass.async_block_till_done()
    assert mock_entry.state is ConfigEntryState.LOADED


async def test_guard_switches_are_configuration_and_enabled_with_a_description(
    hass: HomeAssistant, mock_entry: MockConfigEntry
) -> None:
    """The guard switches sit under configuration, stay enabled and say what they do."""
    await mock_climate(hass)
    set_climate(hass)
    await setup(hass, mock_entry)
    registry = er.async_get(hass)
    switches = [
        entry
        for entry in er.async_entries_for_config_entry(registry, mock_entry.entry_id)
        if entry.domain == "switch"
    ]
    assert len(switches) == len(mock_entry.runtime_data.guards)
    assert {entry.entity_category for entry in switches} == {er.EntityCategory.CONFIG}
    assert all(entry.disabled_by is None for entry in switches)
    state = hass.states.get("switch.living_room_hot_room_override")
    assert state.attributes["description"].startswith("At the too-hot")


async def test_pause_stop_and_defend_again(
    hass: HomeAssistant, mock_entry: MockConfigEntry
) -> None:
    """The services pause, stop and resume; a stop sends nothing even in a hot room."""
    calls = await mock_climate(hass)
    set_climate(hass)
    await setup(hass, mock_entry)
    await hass.services.async_call(
        DOMAIN, "pause", {"entity_id": STATE_SENSOR, "hours": 1}, blocking=True
    )
    assert hass.states.get(STATE_SENSOR).state == "paused"
    await hass.services.async_call(
        DOMAIN, "stop_everything", {"entity_id": STATE_SENSOR}, blocking=True
    )
    assert hass.states.get(STATE_SENSOR).state == "stopped"
    set_climate(hass, room=29.0, setpoint=30.0)
    await hass.async_block_till_done()
    assert calls == []
    await hass.services.async_call(
        DOMAIN, "defend_again", {"entity_id": STATE_SENSOR}, blocking=True
    )
    assert hass.states.get(STATE_SENSOR).state != "stopped"
    assert len(calls) == 1


async def test_buttons(hass: HomeAssistant, mock_entry: MockConfigEntry) -> None:
    """The buttons stop everything and defend again."""
    set_climate(hass)
    await setup(hass, mock_entry)
    await hass.services.async_call(
        "button",
        "press",
        {"entity_id": "button.living_room_stop_everything"},
        blocking=True,
    )
    assert hass.states.get(STATE_SENSOR).state == "stopped"
    await hass.services.async_call(
        "button",
        "press",
        {"entity_id": "button.living_room_defend_again"},
        blocking=True,
    )
    assert hass.states.get(STATE_SENSOR).state == "defending"


async def test_my_temperature_number_within_device_limits(
    hass: HomeAssistant, mock_entry: MockConfigEntry
) -> None:
    """The number follows the device limits and is stored."""
    set_climate(hass)
    await setup(hass, mock_entry)
    state = hass.states.get("number.living_room_my_temperature")
    assert (state.attributes["min"], state.attributes["max"]) == (16.0, 30.0)
    await hass.services.async_call(
        "number",
        "set_value",
        {"entity_id": state.entity_id, "value": 22.5},
        blocking=True,
    )
    assert mock_entry.options["my_temperature"] == 22.5
    assert mock_entry.runtime_data.my_temp == 22.5


async def test_switch_turns_a_guard_off_and_stores_it(
    hass: HomeAssistant, mock_entry: MockConfigEntry
) -> None:
    """A switch changes the guard in the options."""
    set_climate(hass)
    await setup(hass, mock_entry)
    entity = "switch.living_room_comfort_sync"
    assert hass.states.get(entity).state == "on"
    await hass.services.async_call(
        "switch", "turn_off", {"entity_id": entity}, blocking=True
    )
    assert hass.states.get(entity).state == "off"
    assert mock_entry.options[CONF_GUARDS]["comfort_sync"]["enabled"] is False


async def test_websocket_info_and_safety_confirmation(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    mock_entry: MockConfigEntry,
) -> None:
    """The page gets the state, the guards and the log; safety needs two keys."""
    set_climate(hass)
    await setup(hass, mock_entry)
    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {"type": "ac_defender/info", "entry_id": mock_entry.entry_id}
    )
    result = (await client.receive_json())["result"]
    assert result["state"] == "defending"
    safety = {g["id"] for g in result["guards"] if g["safety"]}
    assert "hot_room_override" in safety
    assert len(result["guards"]) == 51

    await client.send_json_auto_id(
        {
            "type": "ac_defender/set_guard",
            "entry_id": mock_entry.entry_id,
            "guard": "hot_room_override",
            "enabled": False,
        }
    )
    response = await client.receive_json()
    assert response["error"]["code"] == "confirmation_required"
    await client.send_json_auto_id(
        {
            "type": "ac_defender/set_guard",
            "entry_id": mock_entry.entry_id,
            "guard": "hot_room_override",
            "enabled": False,
            "confirmed": True,
        }
    )
    assert (await client.receive_json())["success"]
    assert mock_entry.runtime_data.enabled["hot_room_override"] is False


async def test_diagnostics_redacts_entities(
    hass: HomeAssistant,
    hass_client: ClientSessionGenerator,
    mock_entry: MockConfigEntry,
) -> None:
    """Entity ids are redacted."""
    set_climate(hass)
    await setup(hass, mock_entry)
    result = await get_diagnostics_for_config_entry(hass, hass_client, mock_entry)
    assert result["data"]["climate_entity_id"] == "**REDACTED**"
    assert result["info"]["state"] == "defending"


async def test_the_device_links_to_the_page(
    hass: HomeAssistant, mock_entry: MockConfigEntry
) -> None:
    """The device carries an in-app link to the page of the defender."""
    set_climate(hass)
    await setup(hass, mock_entry)
    device = dr.async_get(hass).async_get_device_by_identifier(
        (DOMAIN, mock_entry.entry_id), mock_entry.entry_id
    )
    assert (
        device.configuration_url
        == f"homeassistant://config/ac-defender?entry={mock_entry.entry_id}"
    )
