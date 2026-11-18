"""The heat safety rules, proven through every route that can reach them."""

from datetime import timedelta

import pytest
from pytest_homeassistant.common import async_fire_time_changed
from pytest_homeassistant.typing import WebSocketGenerator

from homeassistant.components.heat_defender.const import DOMAIN
from homeassistant.config_entries import SOURCE_USER
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType, InvalidData
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import device_registry as dr

from .conftest import (
    CLIMATE,
    STATE_SENSOR,
    make_entry,
    mock_climate,
    set_climate,
    setup,
)

FLOOR_NUMBER = "number.bedroom_floor"


@pytest.mark.parametrize("floor", [5.0, 9.5])
async def test_config_flow_refuses_a_floor_under_ten(
    hass: HomeAssistant, floor: float
) -> None:
    """The config flow never accepts a floor under 10 degrees."""
    set_climate(hass)
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": SOURCE_USER}
    )
    with pytest.raises(InvalidData):
        await hass.config_entries.flow.async_configure(
            result["flow_id"],
            {
                "climate_entity_id": CLIMATE,
                "heat_mode": "off",
                "heat_cap": 22.0,
                "floor": floor,
                "freeze_rule": True,
                "safety_temperature": 26.0,
            },
        )


async def test_config_flow_floor_ten_is_the_lowest_accepted(
    hass: HomeAssistant,
) -> None:
    """Ten degrees is accepted and a floor above the cap is refused."""
    set_climate(hass)
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": SOURCE_USER}
    )
    base = {
        "climate_entity_id": CLIMATE,
        "heat_mode": "cap",
        "heat_cap": 22.0,
        "freeze_rule": True,
        "safety_temperature": 26.0,
    }
    refused = await hass.config_entries.flow.async_configure(
        result["flow_id"], {**base, "floor": 23.0}
    )
    assert refused["errors"] == {"floor": "floor_above_cap"}
    accepted = await hass.config_entries.flow.async_configure(
        result["flow_id"], {**base, "floor": 10.0}
    )
    assert accepted["type"] is FlowResultType.FORM
    assert accepted["step_id"] == "sensors"


async def test_flow_refuses_a_device_that_cannot_heat(hass: HomeAssistant) -> None:
    """Only a climate entity that can heat is accepted."""
    set_climate(hass)
    hass.states.async_set(
        CLIMATE, "cool", {"hvac_modes": ["off", "cool"], "min_temp": 5, "max_temp": 30}
    )
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": SOURCE_USER}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {
            "climate_entity_id": CLIMATE,
            "heat_mode": "off",
            "heat_cap": 22.0,
            "floor": 16.0,
            "freeze_rule": True,
            "safety_temperature": 26.0,
        },
    )
    assert result["errors"] == {"climate_entity_id": "cannot_heat"}


@pytest.mark.parametrize("floor", [5.0, 9.5])
async def test_options_flow_refuses_a_floor_under_ten(
    hass: HomeAssistant, floor: float
) -> None:
    """The options flow never accepts a floor under 10 degrees."""
    set_climate(hass)
    entry = make_entry()
    entry.add_to_hass(hass)
    result = await hass.config_entries.options.async_init(entry.entry_id)
    with pytest.raises(InvalidData):
        await hass.config_entries.options.async_configure(
            result["flow_id"],
            {
                "heat_mode": "off",
                "heat_cap": 22.0,
                "floor": floor,
                "freeze_rule": True,
                "safety_temperature": 26.0,
            },
        )


async def test_number_service_refuses_a_floor_under_ten(
    hass: HomeAssistant,
) -> None:
    """The floor number has a hard minimum of 10 and the service refuses less."""
    await mock_climate(hass)
    set_climate(hass)
    entry = make_entry()
    await setup(hass, entry)
    state = hass.states.get(FLOOR_NUMBER)
    assert state.attributes["min"] == 10.0
    assert state.state == "16.0"
    with pytest.raises(ServiceValidationError):
        await hass.services.async_call(
            "number",
            "set_value",
            {"entity_id": FLOOR_NUMBER, "value": 5},
            blocking=True,
        )
    assert entry.runtime_data.floor == 16.0
    await hass.services.async_call(
        "number", "set_value", {"entity_id": FLOOR_NUMBER, "value": 12}, blocking=True
    )
    assert entry.runtime_data.floor == 12.0


async def test_websocket_refuses_a_floor_under_ten(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """The websocket API refuses a floor under 10 and accepts a valid one."""
    await mock_climate(hass)
    set_climate(hass)
    entry = make_entry()
    await setup(hass, entry)
    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {"type": "ac_defender/set_floor", "entry_id": entry.entry_id, "value": 5}
    )
    response = await client.receive_json()
    assert response["error"]["code"] == "invalid_floor"
    assert entry.runtime_data.floor == 16.0
    await client.send_json_auto_id(
        {"type": "ac_defender/set_floor", "entry_id": entry.entry_id, "value": 11}
    )
    assert (await client.receive_json())["success"]
    assert entry.runtime_data.floor == 11.0


@pytest.mark.parametrize("stored", [5, 0, -3, "nonsense"])
async def test_a_stored_floor_under_ten_is_clamped_to_ten(
    hass: HomeAssistant, stored: float | str
) -> None:
    """Even a value that bypassed every route is clamped when it is read."""
    await mock_climate(hass)
    set_climate(hass)
    entry = make_entry(floor=stored)
    await setup(hass, entry)
    assert entry.runtime_data.floor == 10.0
    assert hass.states.get(FLOOR_NUMBER).state == "10.0"


@pytest.mark.parametrize("mode", ["off", "cap"])
async def test_heating_is_allowed_at_15_9_with_a_floor_of_16(
    hass: HomeAssistant, mode: str
) -> None:
    """Whatever mode was chosen, below the floor the heating is allowed."""
    calls = await mock_climate(hass)
    set_climate(hass, room=15.9, setpoint=17.0, mode="off")
    entry = make_entry(heat_mode=mode)
    await setup(hass, entry)
    assert hass.states.get(STATE_SENSOR).state == "heating_allowed"
    assert [c.data["hvac_mode"] for c in calls["set_hvac_mode"]] == ["heat"]


async def test_heat_is_never_turned_off_below_the_floor(
    hass: HomeAssistant,
) -> None:
    """Keep-off never turns the heating off while the room is under its floor."""
    calls = await mock_climate(hass)
    set_climate(hass, room=15.0, setpoint=17.0, mode="heat")
    await setup(hass, make_entry())
    assert [c for c in calls["set_hvac_mode"] if c.data["hvac_mode"] == "off"] == []


async def test_keep_off_turns_the_heating_off_after_a_courtesy_wait(
    hass: HomeAssistant, freezer
) -> None:
    """In Off mode a warm room with the heating on is turned off after ten minutes."""
    calls = await mock_climate(hass)
    set_climate(hass, room=20.0, setpoint=21.0, mode="heat")
    entry = make_entry()
    entry.add_to_hass(hass)
    hass.config_entries.async_update_entry(
        entry, options={"guards": {"cool_mode_restore": {"enabled": False}}}
    )
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    assert calls["set_hvac_mode"] == []
    freezer.tick(timedelta(minutes=11))
    set_climate(hass, room=20.0, setpoint=21.0, mode="heat")
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    assert [c.data["hvac_mode"] for c in calls["set_hvac_mode"]] == ["off"]


async def test_the_mode_guard_waits_the_courtesy_wait_and_then_keeps_it_off(
    hass: HomeAssistant, freezer
) -> None:
    """With the guards on, the heating is left on for the courtesy wait, then turned off."""
    calls = await mock_climate(hass)
    set_climate(hass, room=20.0, setpoint=21.0, mode="heat")
    await setup(hass, make_entry())
    assert calls["set_hvac_mode"] == []
    freezer.tick(timedelta(minutes=2))
    set_climate(hass, room=20.0, setpoint=21.0, mode="heat")
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    assert calls["set_hvac_mode"] == []
    freezer.tick(timedelta(minutes=9))
    set_climate(hass, room=20.0, setpoint=21.0, mode="heat")
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    assert [c.data["hvac_mode"] for c in calls["set_hvac_mode"]] == ["off"]


async def test_stale_readings_stand_down(hass: HomeAssistant, freezer) -> None:
    """No fresh reading for 30 minutes leaves the heating to whatever controls it."""
    calls = await mock_climate(hass)
    set_climate(hass, room=20.0, setpoint=20.0, mode="off")
    await setup(hass, make_entry())
    assert hass.states.get(STATE_SENSOR).state != "standing_down"
    freezer.tick(timedelta(minutes=31))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    assert hass.states.get(STATE_SENSOR).state == "standing_down"
    assert calls["set_hvac_mode"] == []
    assert calls["set_temperature"] == []


async def test_freezing_outside_raises_the_floor(hass: HomeAssistant) -> None:
    """Below 0 outside the floor becomes the freezing floor of 18."""
    calls = await mock_climate(hass)
    hass.states.async_set("sensor.outdoor", "-3")
    set_climate(hass, room=17.0, setpoint=17.0, mode="off")
    entry = make_entry(outdoor_entity="sensor.outdoor")
    await setup(hass, entry)
    assert entry.runtime_data.guard_state["_floor"]["effective"] == 18.0
    assert hass.states.get(STATE_SENSOR).state == "heating_allowed"
    assert [c.data["hvac_mode"] for c in calls["set_hvac_mode"]] == ["heat"]


async def test_freeze_rule_can_be_off(hass: HomeAssistant) -> None:
    """With the freezing rule off the stored floor stays in force."""
    await mock_climate(hass)
    hass.states.async_set("sensor.outdoor", "-3")
    set_climate(hass, room=17.0, setpoint=17.0, mode="off")
    entry = make_entry(outdoor_entity="sensor.outdoor", freeze_rule=False)
    await setup(hass, entry)
    assert entry.runtime_data.guard_state["_floor"]["effective"] == 16.0
    assert hass.states.get(STATE_SENSOR).state != "heating_allowed"


@pytest.mark.parametrize("preset", ["away", "frost_protection"])
async def test_the_devices_own_frost_protection_is_not_fought(
    hass: HomeAssistant, preset: str
) -> None:
    """In the device's own protective preset the defender sends nothing."""
    calls = await mock_climate(hass)
    set_climate(hass, room=8.0, setpoint=10.0, mode="heat", preset_mode=preset)
    await setup(hass, make_entry())
    assert hass.states.get(STATE_SENSOR).state == "standing_down"
    assert calls["set_hvac_mode"] == []
    assert calls["set_temperature"] == []


async def test_unavailable_device_gets_no_command(hass: HomeAssistant) -> None:
    """An unavailable device is never commanded, even far below the floor."""
    calls = await mock_climate(hass)
    hass.states.async_set(CLIMATE, "unavailable", {})
    await setup(hass, make_entry())
    assert hass.states.get(STATE_SENSOR).state == "unavailable"
    assert calls["set_hvac_mode"] == []
    assert calls["set_temperature"] == []


async def test_stop_everything_leaves_the_device_alone_but_floor_resumes(
    hass: HomeAssistant,
) -> None:
    """The heat entities exist and let_it_heat pauses the sister."""
    await mock_climate(hass)
    set_climate(hass, room=20.0, setpoint=20.0, mode="off")
    entry = make_entry()
    await setup(hass, entry)
    assert hass.states.get("select.bedroom_keep_the_heating").state == "off"
    await hass.services.async_call(
        DOMAIN,
        "let_it_heat",
        {"entity_id": STATE_SENSOR, "hours": 2},
        blocking=True,
    )
    assert hass.states.get(STATE_SENSOR).state == "paused"


async def test_the_device_links_to_its_page(hass: HomeAssistant) -> None:
    """The device carries an in-app link to the Heat Defender page."""
    await mock_climate(hass)
    set_climate(hass)
    entry = make_entry()
    await setup(hass, entry)
    device = dr.async_get(hass).async_get_device_by_identifier(
        (DOMAIN, entry.entry_id), entry.entry_id
    )
    assert (
        device.configuration_url
        == f"homeassistant://config/heat-defender?entry={entry.entry_id}"
    )
