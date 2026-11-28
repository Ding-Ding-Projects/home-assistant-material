"""Tests for the Printer door config flow."""

from unittest.mock import patch

import pytest
from pytest_homeassistant.common import MockConfigEntry

from homeassistant.components.printer_door.const import (
    CONF_ACCESS_CODE,
    CONF_SERIAL,
    DOMAIN,
)
from homeassistant.components.printer_door.discovery import PrinterAnnouncement
from homeassistant.config_entries import SOURCE_USER
from homeassistant.const import CONF_HOST, CONF_NAME
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType

from .conftest import ACCESS_CODE, BAD_AUTH, HOST, SERIAL, FakeMqtt

USER_INPUT = {
    CONF_NAME: "Printer",
    CONF_HOST: HOST,
    CONF_SERIAL: SERIAL,
    CONF_ACCESS_CODE: ACCESS_CODE,
}


@pytest.mark.usefixtures("fake_mqtt")
async def test_user_flow(hass: HomeAssistant) -> None:
    """A reachable printer creates an entry."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": SOURCE_USER}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"next_step_id": "manual"}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], USER_INPUT
    )

    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["title"] == "Printer"
    assert result["data"] == {
        CONF_HOST: HOST,
        CONF_SERIAL: SERIAL,
        CONF_ACCESS_CODE: ACCESS_CODE,
    }
    assert result["result"].unique_id == SERIAL


async def test_user_flow_uses_the_printer_login(
    hass: HomeAssistant, fake_mqtt: FakeMqtt
) -> None:
    """The check connects as the printer's user with certificate checks off."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": SOURCE_USER}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"next_step_id": "manual"}
    )
    await hass.config_entries.flow.async_configure(result["flow_id"], USER_INPUT)

    assert fake_mqtt.client.credentials == ("bblp", ACCESS_CODE)
    assert fake_mqtt.client.insecure is True


async def test_user_flow_cannot_connect(
    hass: HomeAssistant, fake_mqtt: FakeMqtt
) -> None:
    """An unreachable printer shows an error, and a retry can succeed."""
    fake_mqtt.connect_error = True
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": SOURCE_USER}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"next_step_id": "manual"}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], USER_INPUT
    )
    assert result["type"] is FlowResultType.FORM
    assert result["errors"] == {CONF_HOST: "cannot_connect"}

    fake_mqtt.connect_error = False
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], USER_INPUT
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY


async def test_user_flow_invalid_auth(hass: HomeAssistant, fake_mqtt: FakeMqtt) -> None:
    """A wrong access code shows an error on that field."""
    fake_mqtt.reason = BAD_AUTH
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": SOURCE_USER}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"next_step_id": "manual"}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], USER_INPUT
    )
    assert result["type"] is FlowResultType.FORM
    assert result["errors"] == {CONF_ACCESS_CODE: "invalid_auth"}


@pytest.mark.usefixtures("fake_mqtt")
async def test_already_configured(
    hass: HomeAssistant, mock_config_entry: MockConfigEntry
) -> None:
    """The same serial number cannot be added twice."""
    mock_config_entry.add_to_hass(hass)
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": SOURCE_USER}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"next_step_id": "manual"}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], USER_INPUT
    )
    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "already_configured"


@pytest.mark.usefixtures("fake_mqtt")
async def test_reauth(hass: HomeAssistant, mock_config_entry: MockConfigEntry) -> None:
    """A new access code replaces the old one."""
    mock_config_entry.add_to_hass(hass)
    result = await mock_config_entry.start_reauth_flow(hass)
    assert result["step_id"] == "reauth_confirm"

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_ACCESS_CODE: "11111111"}
    )

    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "reauth_successful"
    assert mock_config_entry.data[CONF_ACCESS_CODE] == "11111111"
    await hass.async_block_till_done()


async def test_reauth_invalid_auth(
    hass: HomeAssistant, mock_config_entry: MockConfigEntry, fake_mqtt: FakeMqtt
) -> None:
    """A refused new code keeps the form open."""
    fake_mqtt.reason = BAD_AUTH
    mock_config_entry.add_to_hass(hass)
    result = await mock_config_entry.start_reauth_flow(hass)

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_ACCESS_CODE: "11111111"}
    )

    assert result["type"] is FlowResultType.FORM
    assert result["errors"] == {CONF_ACCESS_CODE: "invalid_auth"}


@pytest.mark.usefixtures("fake_mqtt")
async def test_connection_preview(hass: HomeAssistant) -> None:
    """Testing a printer creates no entry until the owner confirms."""
    flow = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": SOURCE_USER}
    )
    configure = hass.config_entries.flow.async_configure
    await configure(flow["flow_id"], {"next_step_id": "manual"})
    result = await configure(flow["flow_id"], {**USER_INPUT, "test_only": True})
    assert result["step_id"] == "tested"
    assert not hass.config_entries.async_entries(DOMAIN)
    result = await configure(flow["flow_id"], {})
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert "test_only" not in result["data"]


async def test_initial_search(hass: HomeAssistant) -> None:
    """A fresh instance can choose a discovered printer before entering a code."""

    flow = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": SOURCE_USER}
    )
    with patch(
        "homeassistant.components.printer_door.config_flow.async_find_printers",
        return_value=[PrinterAnnouncement(HOST, SERIAL, "P1S", "Studio")],
    ):
        result = await hass.config_entries.flow.async_configure(
            flow["flow_id"], {"next_step_id": "search"}
        )
    assert result["description_placeholders"]["count"] == "1"
    result = await hass.config_entries.flow.async_configure(
        flow["flow_id"], {"printer": SERIAL}
    )
    assert result["step_id"] == "discovery_confirm"
    assert result["description_placeholders"]["host"] == HOST
