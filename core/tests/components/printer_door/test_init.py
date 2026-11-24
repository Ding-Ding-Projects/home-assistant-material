"""Tests for the Printer door entities and events."""

from pytest_homeassistant.common import MockConfigEntry, async_capture_events

from homeassistant.components.printer_door.const import (
    BUS_EVENT_OPENED_WHILE_PRINTING,
    DOMAIN,
)
from homeassistant.config_entries import ConfigEntryState
from homeassistant.const import STATE_OFF, STATE_ON, STATE_UNAVAILABLE
from homeassistant.core import HomeAssistant

from .conftest import BAD_AUTH, DOOR_CLOSED, DOOR_OPEN, DOOR_SUPPORTED, FakeMqtt

DOOR = "binary_sensor.printer_door"
EVENTS = "event.printer_door_events"
STATUS = "sensor.printer_print_status"
PROGRESS = "sensor.printer_print_progress"
COUNT = "sensor.printer_door_open_count_today"
LAST_OPENED = "sensor.printer_last_opened"


async def _setup(
    hass: HomeAssistant, entry: MockConfigEntry, fake_mqtt: FakeMqtt
) -> None:
    entry.add_to_hass(hass)
    await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()


async def _report(
    hass: HomeAssistant, fake_mqtt: FakeMqtt, **print_data: object
) -> None:
    fake_mqtt.client.send_report(print_data)
    await hass.async_block_till_done()


async def test_connects_and_asks_for_a_full_report(
    hass: HomeAssistant, mock_config_entry: MockConfigEntry, fake_mqtt: FakeMqtt
) -> None:
    """The link subscribes to the report topic and requests the current state."""
    await _setup(hass, mock_config_entry, fake_mqtt)

    client = fake_mqtt.client
    assert client.subscribed == ["device/TESTSERIAL0001/report"]
    assert len(client.published) == 1
    topic, payload = client.published[0]
    assert topic == "device/TESTSERIAL0001/request"
    assert "pushall" in payload


async def test_entities_follow_reports(
    hass: HomeAssistant, mock_config_entry: MockConfigEntry, fake_mqtt: FakeMqtt
) -> None:
    """Door, print status and progress follow the printer's reports."""
    await _setup(hass, mock_config_entry, fake_mqtt)
    # Connected, but nothing reported yet.
    assert hass.states.get(DOOR).state == "unknown"

    await _report(
        hass,
        fake_mqtt,
        stat=DOOR_CLOSED,
        fun=DOOR_SUPPORTED,
        gcode_state="IDLE",
        mc_percent=0,
    )
    assert hass.states.get(DOOR).state == STATE_OFF
    assert hass.states.get(DOOR).attributes["door_detection"] is True
    assert hass.states.get(STATUS).state == "idle"
    assert hass.states.get(PROGRESS).state == "0"
    assert hass.states.get(COUNT).state == "0"

    # A partial report keeps what it does not mention.
    await _report(hass, fake_mqtt, gcode_state="RUNNING", mc_percent=42)
    assert hass.states.get(DOOR).state == STATE_OFF
    assert hass.states.get(STATUS).state == "printing"
    assert hass.states.get(PROGRESS).state == "42"


async def test_open_and_close_events(
    hass: HomeAssistant, mock_config_entry: MockConfigEntry, fake_mqtt: FakeMqtt
) -> None:
    """Opening and closing the door updates the sensor, count and event entity."""
    bus_events = async_capture_events(hass, BUS_EVENT_OPENED_WHILE_PRINTING)
    await _setup(hass, mock_config_entry, fake_mqtt)
    await _report(hass, fake_mqtt, stat=DOOR_CLOSED, gcode_state="IDLE")

    await _report(hass, fake_mqtt, stat=DOOR_OPEN)
    assert hass.states.get(DOOR).state == STATE_ON
    assert hass.states.get(EVENTS).attributes["event_type"] == "opened"
    assert hass.states.get(COUNT).state == "1"
    assert hass.states.get(LAST_OPENED).state != "unknown"
    assert not bus_events

    await _report(hass, fake_mqtt, stat=DOOR_CLOSED)
    assert hass.states.get(DOOR).state == STATE_OFF
    assert hass.states.get(EVENTS).attributes["event_type"] == "closed"
    assert hass.states.get(COUNT).state == "1"


async def test_first_reading_is_not_an_opening(
    hass: HomeAssistant, mock_config_entry: MockConfigEntry, fake_mqtt: FakeMqtt
) -> None:
    """A door that is already open when the link connects does not count."""
    await _setup(hass, mock_config_entry, fake_mqtt)
    await _report(hass, fake_mqtt, stat=DOOR_OPEN)

    assert hass.states.get(DOOR).state == STATE_ON
    assert hass.states.get(COUNT).state == "0"
    assert hass.states.get(LAST_OPENED).state == "unknown"
    assert hass.states.get(EVENTS).attributes.get("event_type") is None


async def test_opened_while_printing(
    hass: HomeAssistant, mock_config_entry: MockConfigEntry, fake_mqtt: FakeMqtt
) -> None:
    """Opening during a print raises the event entity and the bus event."""
    bus_events = async_capture_events(hass, BUS_EVENT_OPENED_WHILE_PRINTING)
    await _setup(hass, mock_config_entry, fake_mqtt)
    await _report(
        hass, fake_mqtt, stat=DOOR_CLOSED, gcode_state="RUNNING", mc_percent=63
    )

    await _report(hass, fake_mqtt, stat=DOOR_OPEN)

    assert hass.states.get(EVENTS).attributes["event_type"] == "opened_while_printing"
    assert len(bus_events) == 1
    assert bus_events[0].data == {
        "entry_id": mock_config_entry.entry_id,
        "name": "Printer",
        "door": "front",
        "progress": 63,
    }


async def test_unavailable_while_disconnected(
    hass: HomeAssistant, mock_config_entry: MockConfigEntry, fake_mqtt: FakeMqtt
) -> None:
    """Entities go unavailable on a lost link and recover on reconnect."""
    await _setup(hass, mock_config_entry, fake_mqtt)
    await _report(hass, fake_mqtt, stat=DOOR_CLOSED, gcode_state="IDLE")
    assert hass.states.get(DOOR).state == STATE_OFF

    client = fake_mqtt.client
    client.on_disconnect(client, None, None, None, None)
    await hass.async_block_till_done()
    for entity_id in (DOOR, EVENTS, STATUS, PROGRESS, COUNT, LAST_OPENED):
        assert hass.states.get(entity_id).state == STATE_UNAVAILABLE

    client.on_connect(client, None, {}, fake_mqtt.reason, None)
    await hass.async_block_till_done()
    assert hass.states.get(DOOR).state == STATE_OFF


async def test_refused_access_code_starts_reauth(
    hass: HomeAssistant, mock_config_entry: MockConfigEntry, fake_mqtt: FakeMqtt
) -> None:
    """A refused access code leaves entities unavailable and asks for a new one."""
    fake_mqtt.reason = BAD_AUTH
    await _setup(hass, mock_config_entry, fake_mqtt)

    assert hass.states.get(DOOR).state == STATE_UNAVAILABLE
    flows = hass.config_entries.flow.async_progress_by_handler(DOMAIN)
    assert [flow["context"]["source"] for flow in flows] == ["reauth"]


async def test_unload(
    hass: HomeAssistant, mock_config_entry: MockConfigEntry, fake_mqtt: FakeMqtt
) -> None:
    """Unloading removes the entities."""
    await _setup(hass, mock_config_entry, fake_mqtt)

    assert await hass.config_entries.async_unload(mock_config_entry.entry_id)
    await hass.async_block_till_done()

    assert mock_config_entry.state is ConfigEntryState.NOT_LOADED
    assert hass.states.get(DOOR).state == STATE_UNAVAILABLE
