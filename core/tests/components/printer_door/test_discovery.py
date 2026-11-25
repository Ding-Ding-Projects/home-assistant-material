"""Tests for the Printer door LAN discovery."""

from unittest.mock import MagicMock

import pytest
from pytest_homeassistant.common import MockConfigEntry

from homeassistant.components.printer_door.const import (
    CONF_ACCESS_CODE,
    CONF_SERIAL,
    DOMAIN,
)
from homeassistant.components.printer_door.discovery import (
    DATA_DISCOVERY,
    DISCOVERY_PORTS,
    PrinterAnnouncement,
    PrinterDiscovery,
    parse_notify,
)
from homeassistant.config_entries import SOURCE_INTEGRATION_DISCOVERY
from homeassistant.const import CONF_HOST, CONF_NAME
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType

from .conftest import ACCESS_CODE, HOST, SERIAL, FakeMqtt

NEW_HOST = "192.0.2.77"
OTHER_SERIAL = "TESTSERIAL0002"


def notify(
    host: str = NEW_HOST,
    serial: str = SERIAL,
    *,
    model: str = "C11",
    name: str = "Workshop printer",
) -> bytes:
    """Build a NOTIFY packet the way the printer sends it."""
    return (
        "NOTIFY * HTTP/1.1\r\n"
        "HOST: 239.255.255.250:1990\r\n"
        "Server: UPnP/1.0\r\n"
        f"Location: {host}\r\n"
        "NT: urn:bambulab-com:device:3dprinter:1\r\n"
        f"USN: {serial}\r\n"
        "Cache-Control: max-age=1800\r\n"
        f"DevModel.bambu.com: {model}\r\n"
        f"DevName.bambu.com: {name}\r\n"
        "DevSignal.bambu.com: -45\r\n"
        "DevConnect.bambu.com: lan\r\n"
        "DevBind.bambu.com: free\r\n\r\n"
    ).encode()


def test_parse_notify() -> None:
    """A printer announcement yields its address, serial, model and name."""
    assert parse_notify(notify()) == PrinterAnnouncement(
        host=NEW_HOST, serial=SERIAL, model="C11", name="Workshop printer"
    )


@pytest.mark.parametrize(
    "packet",
    [
        pytest.param(b"M-SEARCH * HTTP/1.1\r\nST: ssdp:all\r\n\r\n", id="search"),
        pytest.param(
            b"NOTIFY * HTTP/1.1\r\nLocation: 192.0.2.5\r\nUSN: uuid:abc\r\n\r\n",
            id="not_bambu",
        ),
        pytest.param(notify(host="printer.local"), id="host_not_an_ip"),
        pytest.param(notify(host="239.255.255.250"), id="multicast_host"),
        pytest.param(notify(serial="bad serial!"), id="bad_serial"),
        pytest.param(b"\xff\xfe\x00garbage", id="garbage"),
    ],
)
def test_parse_notify_rejects(packet: bytes) -> None:
    """Anything that is not a well formed printer announcement is ignored."""
    assert parse_notify(packet) is None


def test_parse_notify_location_url() -> None:
    """A Location given as a URL still yields the bare address."""
    announcement = parse_notify(notify(host="http://192.0.2.9:80/desc"))
    assert announcement is not None
    assert announcement.host == "192.0.2.9"


async def _setup(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    entry.add_to_hass(hass)
    await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()


async def test_moved_printer_is_rebound_by_serial(
    hass: HomeAssistant,
    mock_config_entry: MockConfigEntry,
    fake_mqtt: FakeMqtt,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """A known serial at a new address updates the entry and reconnects."""
    await _setup(hass, mock_config_entry)
    clients_before = len(fake_mqtt.clients)

    hass.data[DATA_DISCOVERY].async_handle_packet(notify())
    await hass.async_block_till_done()

    assert mock_config_entry.data[CONF_HOST] == NEW_HOST
    assert mock_config_entry.data[CONF_ACCESS_CODE] == ACCESS_CODE
    assert len(fake_mqtt.clients) > clients_before
    assert "moved from 192.0.2.10 to 192.0.2.77" in caplog.text
    assert ACCESS_CODE not in caplog.text
    assert not hass.config_entries.flow.async_progress_by_handler(DOMAIN)


async def test_same_address_does_nothing(
    hass: HomeAssistant, mock_config_entry: MockConfigEntry, fake_mqtt: FakeMqtt
) -> None:
    """An announcement at the configured address changes nothing."""
    await _setup(hass, mock_config_entry)
    clients_before = len(fake_mqtt.clients)

    hass.data[DATA_DISCOVERY].async_handle_packet(notify(host=HOST))
    await hass.async_block_till_done()

    assert mock_config_entry.data[CONF_HOST] == HOST
    assert len(fake_mqtt.clients) == clients_before


@pytest.mark.usefixtures("fake_mqtt")
async def test_unknown_printer_is_offered(
    hass: HomeAssistant, mock_config_entry: MockConfigEntry
) -> None:
    """An unknown serial starts one discovery flow, however often it announces."""
    await _setup(hass, mock_config_entry)
    discovery = hass.data[DATA_DISCOVERY]

    discovery.async_handle_packet(notify(serial=OTHER_SERIAL))
    discovery.async_handle_packet(notify(serial=OTHER_SERIAL))
    await hass.async_block_till_done()

    flows = hass.config_entries.flow.async_progress_by_handler(DOMAIN)
    assert len(flows) == 1
    assert flows[0]["context"]["source"] == SOURCE_INTEGRATION_DISCOVERY
    assert flows[0]["context"]["unique_id"] == OTHER_SERIAL
    assert flows[0]["step_id"] == "discovery_confirm"


@pytest.mark.usefixtures("fake_mqtt")
async def test_discovery_flow_creates_entry(hass: HomeAssistant) -> None:
    """The discovered printer needs only the access code and a name."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN,
        context={"source": SOURCE_INTEGRATION_DISCOVERY},
        data={
            CONF_HOST: NEW_HOST,
            CONF_SERIAL: OTHER_SERIAL,
            "model": "C11",
            CONF_NAME: "Workshop printer",
        },
    )
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "discovery_confirm"
    assert result["description_placeholders"]["host"] == NEW_HOST

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {CONF_NAME: "Workshop printer", CONF_ACCESS_CODE: ACCESS_CODE},
    )

    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["title"] == "Workshop printer"
    assert result["data"] == {
        CONF_HOST: NEW_HOST,
        CONF_SERIAL: OTHER_SERIAL,
        CONF_ACCESS_CODE: ACCESS_CODE,
    }
    assert result["result"].unique_id == OTHER_SERIAL
    await hass.async_block_till_done()


@pytest.mark.usefixtures("fake_mqtt")
async def test_discovery_flow_updates_configured_host(
    hass: HomeAssistant, mock_config_entry: MockConfigEntry
) -> None:
    """A discovery flow for a configured serial aborts and stores the new address."""
    mock_config_entry.add_to_hass(hass)
    result = await hass.config_entries.flow.async_init(
        DOMAIN,
        context={"source": SOURCE_INTEGRATION_DISCOVERY},
        data={CONF_HOST: NEW_HOST, CONF_SERIAL: SERIAL},
    )

    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "already_configured"
    assert mock_config_entry.data[CONF_HOST] == NEW_HOST
    await hass.async_block_till_done()


async def test_listener_shared_and_closed_with_last_entry(
    hass: HomeAssistant,
    mock_config_entry: MockConfigEntry,
    fake_mqtt: FakeMqtt,
    mock_discovery_listen: MagicMock,
) -> None:
    """Two printers share one listener, which closes when both unload."""
    second = MockConfigEntry(
        domain=DOMAIN,
        title="Second",
        unique_id=OTHER_SERIAL,
        data={
            CONF_HOST: "192.0.2.11",
            CONF_SERIAL: OTHER_SERIAL,
            CONF_ACCESS_CODE: "1",
        },
    )
    await _setup(hass, mock_config_entry)
    await _setup(hass, second)
    assert mock_discovery_listen.call_count == len(DISCOVERY_PORTS)
    transport = mock_discovery_listen.return_value

    await hass.config_entries.async_unload(mock_config_entry.entry_id)
    assert DATA_DISCOVERY in hass.data
    transport.close.assert_not_called()

    await hass.config_entries.async_unload(second.entry_id)
    assert DATA_DISCOVERY not in hass.data
    assert transport.close.call_count == len(DISCOVERY_PORTS)


async def test_bind_failure_only_warns(
    hass: HomeAssistant,
    mock_discovery_listen: MagicMock,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """A port that cannot be opened is logged and skipped."""
    mock_discovery_listen.side_effect = OSError("address in use")
    discovery = PrinterDiscovery(hass)

    await discovery.async_start()

    assert not discovery.listening
    assert "Cannot listen for printer announcements on UDP port" in caplog.text
