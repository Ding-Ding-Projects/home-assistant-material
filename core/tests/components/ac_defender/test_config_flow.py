"""Tests of the AC Defender config flow."""

import pytest
from pytest_homeassistant.common import MockConfigEntry

from homeassistant.components.ac_defender.const import (
    CONF_CLIMATE,
    CONF_ENABLED_GUARDS,
    CONF_GUARDS,
    CONF_MY_TEMPERATURE,
    CONF_ROOM_SENSOR,
    CONF_SAFETY_TEMPERATURE,
    DOMAIN,
)
from homeassistant.config_entries import SOURCE_USER
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType

from .conftest import CLIMATE, set_climate

USER_INPUT = {
    CONF_CLIMATE: CLIMATE,
    CONF_MY_TEMPERATURE: 23.0,
    CONF_SAFETY_TEMPERATURE: 28.0,
}


async def test_three_steps(hass: HomeAssistant) -> None:
    """The unit, the sensors, then the guards create the entry."""
    set_climate(hass)
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": SOURCE_USER}
    )
    assert result["step_id"] == "user"
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], USER_INPUT
    )
    assert result["step_id"] == "sensors"
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {})
    assert result["step_id"] == "guards"
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_ENABLED_GUARDS: ["comfort_sync"]}
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["title"] == "Living room"
    assert result["data"][CONF_CLIMATE] == CLIMATE
    guards = result["options"][CONF_GUARDS]
    assert guards["comfort_sync"]["enabled"] is True
    assert guards["natural_walkback"]["enabled"] is False
    assert guards["hot_room_override"]["enabled"] is True


@pytest.mark.parametrize(
    ("attrs", "user_input", "field", "error"),
    [
        pytest.param(
            {"modes": ("off", "heat")},
            USER_INPUT,
            CONF_CLIMATE,
            "cannot_cool",
            id="cannot_cool",
        ),
        pytest.param(
            {},
            {**USER_INPUT, CONF_MY_TEMPERATURE: 10.0},
            CONF_MY_TEMPERATURE,
            "temperature_too_low",
            id="too_low",
        ),
        pytest.param(
            {},
            {**USER_INPUT, CONF_MY_TEMPERATURE: 31.0},
            CONF_MY_TEMPERATURE,
            "temperature_too_high",
            id="too_high",
        ),
        pytest.param(
            {},
            {**USER_INPUT, CONF_SAFETY_TEMPERATURE: 22.0},
            CONF_SAFETY_TEMPERATURE,
            "safety_below_target",
            id="safety_below_target",
        ),
    ],
)
async def test_errors(
    hass: HomeAssistant,
    attrs: dict,
    user_input: dict,
    field: str,
    error: str,
) -> None:
    """Invalid input shows an error on the right field."""
    set_climate(hass, **attrs)
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": SOURCE_USER}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], user_input
    )
    assert result["type"] is FlowResultType.FORM
    assert result["errors"] == {field: error}


async def test_missing_entity(hass: HomeAssistant) -> None:
    """An entity that does not exist is refused."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": SOURCE_USER}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], USER_INPUT
    )
    assert result["errors"] == {CONF_CLIMATE: "entity_not_found"}


async def test_already_configured(
    hass: HomeAssistant, mock_entry: MockConfigEntry
) -> None:
    """One defender per climate entity."""
    mock_entry.add_to_hass(hass)
    set_climate(hass)
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": SOURCE_USER}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], USER_INPUT
    )
    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "already_configured"


async def test_reconfigure(hass: HomeAssistant, mock_entry: MockConfigEntry) -> None:
    """The unit settings and the sensors can be changed."""
    set_climate(hass)
    hass.states.async_set("sensor.desk", "24", {"device_class": "temperature"})
    mock_entry.add_to_hass(hass)
    result = await mock_entry.start_reconfigure_flow(hass)
    assert result["step_id"] == "reconfigure"
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {**USER_INPUT, CONF_MY_TEMPERATURE: 22.0}
    )
    assert result["step_id"] == "reconfigure_sensors"
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_ROOM_SENSOR: "sensor.desk"}
    )
    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "reconfigure_successful"
    assert mock_entry.data[CONF_MY_TEMPERATURE] == 22.0
    assert mock_entry.data[CONF_ROOM_SENSOR] == "sensor.desk"


async def test_options_flow(hass: HomeAssistant, mock_entry: MockConfigEntry) -> None:
    """The options flow changes the temperatures and validates them."""
    set_climate(hass)
    mock_entry.add_to_hass(hass)
    result = await hass.config_entries.options.async_init(mock_entry.entry_id)
    assert result["step_id"] == "init"
    result = await hass.config_entries.options.async_configure(
        result["flow_id"],
        {CONF_MY_TEMPERATURE: 31.0, CONF_SAFETY_TEMPERATURE: 34.0},
    )
    assert result["errors"] == {CONF_MY_TEMPERATURE: "temperature_too_high"}
    result = await hass.config_entries.options.async_configure(
        result["flow_id"],
        {CONF_MY_TEMPERATURE: 22.0, CONF_SAFETY_TEMPERATURE: 27.0},
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert mock_entry.options[CONF_MY_TEMPERATURE] == 22.0
