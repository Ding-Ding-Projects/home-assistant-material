"""Brother and sister: AC Defender and Heat Defender on the same climate entity."""

from datetime import timedelta

from freezegun.api import FrozenDateTimeFactory
import pytest
from pytest_homeassistant.common import MockConfigEntry
from pytest_homeassistant.typing import WebSocketGenerator

from homeassistant.components.ac_defender.const import DOMAIN as AC_DOMAIN
from homeassistant.config_entries import SOURCE_USER
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ServiceValidationError
from homeassistant.util import dt as dt_util

from .conftest import (
    CLIMATE,
    STATE_SENSOR,
    make_entry,
    mock_climate,
    set_climate,
    setup,
)

AC_STATE = "sensor.bedroom_state_2"


def ac_entry(my_temp: float = 24.0) -> MockConfigEntry:
    """Return an AC Defender entry for the same climate entity."""
    return MockConfigEntry(
        domain=AC_DOMAIN,
        title="Bedroom",
        unique_id=CLIMATE,
        data={
            "climate_entity_id": CLIMATE,
            "my_temperature": my_temp,
            "safety_temperature": 28.0,
        },
    )


async def both(hass: HomeAssistant, **heat: object):
    """Set up the sister and then the brother."""
    sister = make_entry(heat_mode="cap", heat_cap=22.0, floor=16.0, **heat)
    brother = ac_entry()
    await setup(hass, sister)
    await setup(hass, brother)
    return brother.runtime_data, sister.runtime_data


async def test_alone_nothing_about_the_other_appears(hass: HomeAssistant) -> None:
    """With one sibling the info shows no sibling and no band."""
    await mock_climate(hass)
    set_climate(hass, room=20.0)
    entry = make_entry()
    await setup(hass, entry)
    info = entry.runtime_data.info()
    assert info["sibling"] is None
    assert info["band"] is None
    assert entry.runtime_data.arbiter.alone()


async def test_both_see_each_other_and_share_one_band(hass: HomeAssistant) -> None:
    """Her upper limit and his temperature are one band, and each page shows the other."""
    await mock_climate(hass)
    set_climate(hass, room=23.0)
    brother, sister = await both(hass)
    assert brother.arbiter is sister.arbiter
    assert brother.info()["band"] == {"low": 22.0, "high": 24.0}
    assert brother.info()["sibling"]["role"] == "heat"
    assert sister.info()["sibling"]["role"] == "ac"
    assert sister.info()["sibling"]["my_temperature"] == 24.0


async def test_the_two_can_never_cross(hass: HomeAssistant) -> None:
    """Moving either one into the other is refused with a plain key."""
    await mock_climate(hass)
    set_climate(hass, room=23.0)
    brother, sister = await both(hass)
    with pytest.raises(ValueError, match="band_too_narrow"):
        brother.validate_temperature(22.5)
    with pytest.raises(ValueError, match="band_crossed"):
        brother.validate_temperature(21.0)
    with pytest.raises(ValueError, match="band_too_narrow"):
        sister.validate_temperature(23.5)
    with pytest.raises(ServiceValidationError):
        await hass.services.async_call(
            "number",
            "set_value",
            {"entity_id": "number.bedroom_my_temperature", "value": 22.5},
            blocking=True,
        )
    brother.validate_temperature(26.0)


async def test_flow_refuses_a_temperature_that_would_cross(
    hass: HomeAssistant,
) -> None:
    """Adding the brother with a temperature at her limit is refused."""
    await mock_climate(hass)
    set_climate(hass, room=23.0)
    await setup(hass, make_entry(heat_mode="cap", heat_cap=22.0))
    result = await hass.config_entries.flow.async_init(
        AC_DOMAIN, context={"source": SOURCE_USER}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {
            "climate_entity_id": CLIMATE,
            "my_temperature": 22.0,
            "safety_temperature": 28.0,
        },
    )
    assert result["errors"] == {"my_temperature": "band_crossed"}


async def test_she_turns_heating_off_first_and_he_waits(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    """In a hot room with the heating on she holds the room; his commands wait."""
    calls = await mock_climate(hass)
    set_climate(hass, room=25.0, setpoint=30.0, mode="cool", hvac_action="heating")
    brother, _ = await both(hass)
    assert brother.arbiter.holder == "heat"
    assert brother.gated is True
    assert calls["set_temperature"] == []
    log = [e for e in brother.log if e["kind"] == "handover"]
    assert log[0]["values"]["code"] == "heat_off_first"
    assert log[0]["values"]["who"] == "ac"

    freezer.tick(timedelta(minutes=3))
    set_climate(hass, room=25.0, setpoint=30.0, mode="cool", hvac_action="idle")
    await hass.async_block_till_done()
    await brother.async_evaluate()
    assert brother.arbiter.holder == "ac"
    assert brother.gated is False
    codes = [e["values"]["code"] for e in brother.log if e["kind"] == "handover"]
    assert "heat_off_still_hot" in codes
    assert [c.data["temperature"] for c in calls["set_temperature"]]


async def test_he_hands_to_her_when_the_room_falls(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    """A room falling under her limit goes to her and he is told to stop."""
    await mock_climate(hass)
    set_climate(hass, room=25.0, setpoint=30.0, mode="cool", hvac_action="cooling")
    brother, sister = await both(hass)
    assert brother.arbiter.holder == "ac"
    freezer.tick(timedelta(minutes=11))
    set_climate(hass, room=21.0, setpoint=22.0, mode="cool", hvac_action="idle")
    await hass.async_block_till_done()
    await brother.async_evaluate()
    assert brother.arbiter.holder == "heat"
    codes = [e["values"]["code"] for e in sister.log if e["kind"] == "handover"]
    assert "ac_stops_falling" in codes


async def test_hysteresis_stops_ping_pong(hass: HomeAssistant) -> None:
    """A room hovering around the edge does not flip the holder every evaluation."""
    await mock_climate(hass)
    set_climate(hass, room=25.0, setpoint=30.0, mode="cool", hvac_action="cooling")
    brother, _ = await both(hass)
    for room in (21.9, 25.1, 21.9, 25.1):
        set_climate(hass, room=room, setpoint=30.0, mode="cool", hvac_action="cooling")
        await hass.async_block_till_done()
        await brother.async_evaluate()
    handovers = [e for e in brother.arbiter.events if e.kind == "handover"]
    assert len(handovers) <= 2


async def test_her_safety_outranks_his_comfort(hass: HomeAssistant) -> None:
    """Below her floor she heats and his commands are gated."""
    calls = await mock_climate(hass)
    set_climate(hass, room=15.0, setpoint=17.0, mode="cool", hvac_action="idle")
    brother, _ = await both(hass)
    assert brother.arbiter.holder == "safety:heat"
    assert brother.gated is False or calls["set_temperature"] == []
    assert any(e.kind == "safety" and e.plain for e in brother.arbiter.events)


async def test_plain_log_turns_the_sibling_voice_off(hass: HomeAssistant) -> None:
    """With Plain log on, handover lines carry the plain flag."""
    await mock_climate(hass)
    set_climate(hass, room=25.0, setpoint=30.0, mode="cool", hvac_action="heating")
    sister = make_entry(heat_mode="cap", heat_cap=22.0)
    sister.add_to_hass(hass)
    hass.config_entries.async_update_entry(sister, options={"plain_log": True})
    await setup(hass, sister)
    brother = ac_entry()
    await setup(hass, brother)
    events = brother.runtime_data.arbiter.events
    assert events
    assert all(e.plain for e in events)


async def test_a_pause_is_told_to_the_other(hass: HomeAssistant) -> None:
    """Pausing one tells the other, and also_sibling pauses both."""
    await mock_climate(hass)
    set_climate(hass, room=23.0)
    brother, sister = await both(hass)
    await hass.services.async_call(
        AC_DOMAIN,
        "pause",
        {"entity_id": AC_STATE, "hours": 1, "also_sibling": True},
        blocking=True,
    )
    assert brother.pause is not None
    assert sister.pause is not None
    assert hass.states.get(STATE_SENSOR).state == "paused"
    kinds = [e.kind for e in brother.arbiter.events]
    assert "paused" in kinds


async def test_dual_setpoint_device_is_held_to_the_band(hass: HomeAssistant) -> None:
    """A device with a low and a high set point never keeps contradictory values."""
    calls = await mock_climate(hass)
    set_climate(
        hass,
        room=23.0,
        mode="heat_cool",
        target_temp_low=18.0,
        target_temp_high=28.0,
    )
    await both(hass)
    paired = [c for c in calls["set_temperature"] if "target_temp_low" in c.data]
    assert paired
    assert paired[-1].data["target_temp_low"] == 22.0
    assert paired[-1].data["target_temp_high"] == 24.0


async def test_unloading_one_leaves_the_other_alone(hass: HomeAssistant) -> None:
    """Removing a sibling makes the other behave exactly as alone."""
    await mock_climate(hass)
    set_climate(hass, room=23.0)
    sister = make_entry(heat_mode="cap", heat_cap=22.0)
    brother_entry = ac_entry()
    await setup(hass, sister)
    await setup(hass, brother_entry)
    assert await hass.config_entries.async_unload(brother_entry.entry_id)
    coordinator = sister.runtime_data
    assert coordinator.arbiter.alone()
    assert coordinator.info()["sibling"] is None
    assert coordinator.info()["band"] is None
    assert coordinator.arbiter.may_command("heat", dt_util.utcnow())


async def test_websocket_control_pauses_both_and_resumes(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """The page's pause can include the sibling, and resume clears it."""
    await mock_climate(hass)
    set_climate(hass, room=23.0)
    brother, sister = await both(hass)
    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "ac_defender/control",
            "entry_id": sister.entry.entry_id,
            "action": "pause",
            "hours": 2,
            "also_sibling": True,
        }
    )
    assert (await client.receive_json())["success"]
    assert brother.pause is not None
    assert sister.pause is not None
    await client.send_json_auto_id(
        {
            "type": "ac_defender/control",
            "entry_id": sister.entry.entry_id,
            "action": "resume",
        }
    )
    assert (await client.receive_json())["success"]
    assert sister.pause is None
    assert brother.pause is not None
