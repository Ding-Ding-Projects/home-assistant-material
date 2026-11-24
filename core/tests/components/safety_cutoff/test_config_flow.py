"""Tests for the Safety cutoff config flow."""

import pytest
from pytest_homeassistant.common import MockConfigEntry, async_mock_service

from homeassistant.components.safety_cutoff.const import DOMAIN
from homeassistant.config_entries import SOURCE_USER
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType

USER_INPUT = {
    "name": "Grow shelf",
    "leaks": ["binary_sensor.shelf_leak"],
    "switches": ["switch.pump", "switch.lights"],
    "power_sensor": "sensor.shelf_power",
    "power_limit": 800,
    "power_seconds": 30,
    "cut_on_power": True,
    "notify": ["notify.phone"],
}


async def test_user_flow(hass: HomeAssistant) -> None:
    """The user step creates an entry with the chosen settings."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": SOURCE_USER}
    )
    assert result["type"] is FlowResultType.FORM

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], USER_INPUT
    )

    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["title"] == "Grow shelf"
    assert result["options"]["leaks"] == ["binary_sensor.shelf_leak"]
    assert result["options"]["power_limit"] == 800
    assert result["options"]["notify"] == ["notify.phone"]


@pytest.mark.parametrize(
    ("override", "error"),
    [
        ({"leaks": []}, "leaks_required"),
        ({"switches": []}, "switches_required"),
    ],
)
async def test_user_flow_requires_sensors_and_switches(
    hass: HomeAssistant, override: dict[str, list[str]], error: str
) -> None:
    """An empty leak or switch list is refused."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": SOURCE_USER}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {**USER_INPUT, **override}
    )

    assert result["type"] is FlowResultType.FORM
    assert result["errors"] == {"base": error}


async def test_notify_options_come_from_services(hass: HomeAssistant) -> None:
    """The notify picker lists the notify services that exist."""

    async_mock_service(hass, "notify", "mobile_app_phone")
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": SOURCE_USER}
    )
    schema = result["data_schema"].schema
    notify = next(key for key in schema if key == "notify")
    options = schema[notify].config["options"]

    assert {"value": "notify.mobile_app_phone", "label": "notify.mobile_app_phone"} in (
        options
    )


async def test_options_flow(hass: HomeAssistant) -> None:
    """The options step changes the limit and reloads the entry."""
    entry = MockConfigEntry(
        domain=DOMAIN,
        title="Grow shelf",
        options={**USER_INPUT},
    )
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()

    result = await hass.config_entries.options.async_init(entry.entry_id)
    assert result["type"] is FlowResultType.FORM
    user_input = {k: v for k, v in USER_INPUT.items() if k != "name"}
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {**user_input, "power_limit": 1200}
    )

    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert entry.options["power_limit"] == 1200
