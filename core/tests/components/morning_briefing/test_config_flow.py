"""Tests for the Morning briefing config flow."""

from pytest_homeassistant.common import MockConfigEntry, async_mock_service

from homeassistant.components.morning_briefing.const import DOMAIN
from homeassistant.config_entries import SOURCE_USER
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType


async def test_user_flow(hass: HomeAssistant) -> None:
    """The user step creates an entry with the chosen settings."""
    async_mock_service(hass, "notify", "phone")
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": SOURCE_USER}
    )
    assert result["type"] is FlowResultType.FORM
    assert "notify.phone" in str(result["data_schema"].schema["notify"].config)

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {
            "name": "Daily",
            "time": "07:30:00",
            "notify": ["notify.phone"],
            "weather": "weather.home",
            "transit": ["sensor.line_1"],
            "extra": ["sensor.pool"],
        },
    )

    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["title"] == "Daily"
    assert result["options"]["notify"] == ["notify.phone"]
    assert result["options"]["weather"] == "weather.home"


async def test_options_flow(hass: HomeAssistant) -> None:
    """The options can be changed after setup."""
    entry = MockConfigEntry(
        domain=DOMAIN, title="Daily", options={"name": "Daily", "time": "07:30:00"}
    )
    entry.add_to_hass(hass)

    result = await hass.config_entries.options.async_init(entry.entry_id)
    assert result["type"] is FlowResultType.FORM

    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"time": "06:45:00", "notify": ["notify.custom"]}
    )

    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["data"]["time"] == "06:45:00"
    assert result["data"]["notify"] == ["notify.custom"]
