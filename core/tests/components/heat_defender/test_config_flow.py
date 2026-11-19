"""Tests of the Heat Defender config and options flows."""

from typing import Any

import pytest

from homeassistant.components.ac_defender.const import CONF_ENABLED_GUARDS
from homeassistant.components.heat_defender.config_flow import floor_error
from homeassistant.components.heat_defender.const import DOMAIN
from homeassistant.config_entries import SOURCE_USER
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType

from .conftest import CLIMATE, make_entry, mock_climate, set_climate, setup
from .test_siblings import ac_entry

USER_INPUT = {
    "climate_entity_id": CLIMATE,
    "heat_mode": "cap",
    "heat_cap": 22.0,
    "floor": 16.0,
    "freeze_rule": True,
    "courtesy_wait_minutes": 10,
    "safety_temperature": 26.0,
}


async def start(hass: HomeAssistant, user_input: dict[str, Any]) -> dict:
    """Start the flow and submit the first step."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": SOURCE_USER}
    )
    assert result["step_id"] == "user"
    return await hass.config_entries.flow.async_configure(result["flow_id"], user_input)


async def test_three_steps_create_the_entry(hass: HomeAssistant) -> None:
    """The unit, the sensors and the guards create a Heat Defender."""
    set_climate(hass)
    result = await start(hass, USER_INPUT)
    assert result["step_id"] == "sensors"
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {})
    assert result["step_id"] == "guards"
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_ENABLED_GUARDS: ["comfort_sync"]}
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["data"]["heat_cap"] == 22.0
    assert result["data"]["floor"] == 16.0


async def test_a_missing_unit_is_refused(hass: HomeAssistant) -> None:
    """A climate entity that does not exist is refused."""
    result = await start(hass, USER_INPUT)
    assert result["errors"] == {"climate_entity_id": "entity_not_found"}


@pytest.mark.parametrize(
    ("attrs", "user_input", "errors"),
    [
        pytest.param(
            {"hvac_modes": ["off", "cool"]},
            USER_INPUT,
            {"climate_entity_id": "cannot_heat"},
            id="cannot_heat",
        ),
        pytest.param(
            {},
            {**USER_INPUT, "floor": 22.0},
            {"floor": "floor_above_cap"},
            id="floor_above_cap",
        ),
        pytest.param(
            {"max_temp": 21.0},
            USER_INPUT,
            {"heat_cap": "temperature_too_high"},
            id="cap_above_device",
        ),
    ],
)
async def test_unit_errors(
    hass: HomeAssistant,
    attrs: dict[str, Any],
    user_input: dict[str, Any],
    errors: dict[str, str],
) -> None:
    """Each wrong value is refused with its own error."""
    set_climate(hass, **attrs)
    result = await start(hass, user_input)
    assert result["type"] is FlowResultType.FORM
    assert result["errors"] == errors


@pytest.mark.parametrize(
    ("floor", "cap", "mode", "error"),
    [
        pytest.param(5.0, 22.0, "off", "floor_too_low", id="under_hard_floor"),
        pytest.param(22.0, 22.0, "cap", "floor_above_cap", id="at_the_cap"),
        pytest.param(22.0, 22.0, "off", None, id="no_cap_when_off"),
    ],
)
def test_floor_error(floor: float, cap: float, mode: str, error: str | None) -> None:
    """The floor is never under the hard minimum, and under the cap in cap mode."""
    assert floor_error(floor, cap, mode) == error


async def test_options_flow_validates_and_stores(hass: HomeAssistant) -> None:
    """The options flow refuses a floor above the cap, then stores a good change."""
    set_climate(hass)
    entry = make_entry(heat_mode="cap")
    entry.add_to_hass(hass)
    result = await hass.config_entries.options.async_init(entry.entry_id)
    assert result["step_id"] == "init"
    options = {
        key: value for key, value in USER_INPUT.items() if key != "climate_entity_id"
    }
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {**options, "floor": 23.0}
    )
    assert result["errors"] == {"floor": "floor_above_cap"}
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {**options, "heat_cap": 21.0}
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert entry.options["heat_cap"] == 21.0


async def test_a_cap_that_would_cross_the_brother_is_refused(
    hass: HomeAssistant,
) -> None:
    """With AC Defender on the unit, the cap must stay a band below his number."""
    await mock_climate(hass)
    set_climate(hass)
    await setup(hass, ac_entry(my_temp=22.5))
    result = await start(hass, USER_INPUT)
    assert result["errors"] == {"heat_cap": "band_too_narrow"}


async def test_the_brother_options_refuse_a_number_under_her_cap(
    hass: HomeAssistant,
) -> None:
    """AC Defender's options flow checks the shared band against the sister."""
    await mock_climate(hass)
    set_climate(hass)
    await setup(hass, make_entry(heat_mode="cap", heat_cap=22.0))
    brother = ac_entry()
    await setup(hass, brother)
    result = await hass.config_entries.options.async_init(brother.entry_id)
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"my_temperature": 22.5, "safety_temperature": 28.0}
    )
    assert result["errors"] == {"my_temperature": "band_too_narrow"}
