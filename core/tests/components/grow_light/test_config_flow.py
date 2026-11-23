"""Tests for the Grow light config flow."""

from homeassistant.components.grow_light.const import DOMAIN
from homeassistant.config_entries import SOURCE_USER
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType


async def test_user_flow(hass: HomeAssistant) -> None:
    """The user step creates an entry with the chosen settings."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": SOURCE_USER}
    )
    assert result["type"] is FlowResultType.FORM

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {
            "name": "Basil shelf",
            "plug": "switch.basil_plug",
            "start": "06:00:00",
            "hours": 14,
            "doors": ["binary_sensor.tent_door"],
        },
    )

    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["title"] == "Basil shelf"
    assert result["options"]["hours"] == 14
    assert result["options"]["doors"] == ["binary_sensor.tent_door"]
