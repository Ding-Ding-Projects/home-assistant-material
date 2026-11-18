"""State survives a restart, and a restart never causes a burst of commands."""

from datetime import timedelta
from typing import Any

from freezegun.api import FrozenDateTimeFactory
from pytest_homeassistant.common import MockConfigEntry, async_fire_time_changed

from homeassistant.components.ac_defender.const import DOMAIN
from homeassistant.const import EVENT_HOMEASSISTANT_FINAL_WRITE
from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util

from .conftest import CLIMATE, mock_climate_services, set_climate, setup_entry

STATE_SENSOR = "sensor.living_room_state"
ENTRY_ID = "01ACDEFENDERTESTENTRY00001"


def make_entry() -> MockConfigEntry:
    """Return an entry with a fixed id so its stored state can be prepared."""
    return MockConfigEntry(
        domain=DOMAIN,
        title="Living room",
        unique_id=CLIMATE,
        entry_id=ENTRY_ID,
        data={
            "climate_entity_id": CLIMATE,
            "my_temperature": 23.0,
            "safety_temperature": 28.0,
        },
    )


def prepare(hass_storage: dict[str, Any], **data: Any) -> None:
    """Put a saved state in place as if the instance had been restarted."""
    key = f"{DOMAIN}.{ENTRY_ID}"
    hass_storage[key] = {
        "version": 1,
        "minor_version": 1,
        "key": key,
        "data": {"saved_at": dt_util.utcnow().isoformat(), **data},
    }


async def restart(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    """Unload and set up the entry again, as a restart does."""
    assert await hass.config_entries.async_unload(entry.entry_id)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()


async def test_a_pause_survives_a_restart(
    hass: HomeAssistant, hass_storage: dict[str, Any]
) -> None:
    """A pause is still in force after unload and setup."""
    await mock_climate_services(hass)
    set_climate(hass)
    entry = make_entry()
    await setup_entry(hass, entry)
    await hass.services.async_call(
        DOMAIN, "pause", {"entity_id": STATE_SENSOR, "hours": 2}, blocking=True
    )
    await restart(hass, entry)
    assert entry.runtime_data.pause is not None
    assert entry.runtime_data.pause.kind == "paused"


async def test_an_expired_pause_is_not_restored(
    hass: HomeAssistant, hass_storage: dict[str, Any]
) -> None:
    """A pause that ended while the instance was down is gone."""
    await mock_climate_services(hass)
    set_climate(hass)
    past = (dt_util.utcnow() - timedelta(hours=1)).isoformat()
    prepare(
        hass_storage,
        pause={
            "kind": "paused",
            "until": past,
            "reason": "paused by the owner",
            "stop_everything": False,
        },
    )
    entry = make_entry()
    await setup_entry(hass, entry)
    assert entry.runtime_data.pause is None


async def test_stop_everything_survives_a_restart_and_sends_nothing(
    hass: HomeAssistant, hass_storage: dict[str, Any]
) -> None:
    """A stop stays a stop, even in a hot room, after a restart."""
    calls = await mock_climate_services(hass)
    set_climate(hass)
    entry = make_entry()
    await setup_entry(hass, entry)
    await hass.services.async_call(
        DOMAIN, "stop_everything", {"entity_id": STATE_SENSOR}, blocking=True
    )
    set_climate(hass, room=29.0, setpoint=30.0)
    await restart(hass, entry)
    set_climate(hass, room=29.0, setpoint=30.0)
    await hass.async_block_till_done()
    assert entry.runtime_data.pause is not None
    assert entry.runtime_data.pause.stop_everything is True
    assert hass.states.get(STATE_SENSOR).state == "stopped"
    assert calls == []


async def test_running_time_and_cost_survive_a_restart(
    hass: HomeAssistant, hass_storage: dict[str, Any]
) -> None:
    """The counters of today and this month are restored."""
    await mock_climate_services(hass)
    set_climate(hass)
    entry = make_entry()
    await setup_entry(hass, entry)
    cost = entry.runtime_data.cost
    cost.seconds_today, cost.seconds_month = 3600.0, 7200.0
    cost.cost_today, cost.cost_month = 0.25, 0.5
    await restart(hass, entry)
    restored = entry.runtime_data.cost
    assert (restored.seconds_today, restored.seconds_month) == (3600.0, 7200.0)
    assert (restored.cost_today, restored.cost_month) == (0.25, 0.5)
    assert hass.states.get("sensor.living_room_running_time_today").state == "1.0"
    assert hass.states.get("sensor.living_room_running_time_this_month").state == "2.0"


async def test_last_acted_and_the_log_survive_a_restart(
    hass: HomeAssistant, hass_storage: dict[str, Any]
) -> None:
    """What each guard last did and the recent log lines are restored."""
    await mock_climate_services(hass)
    set_climate(hass, room=29.0, setpoint=30.0)
    entry = make_entry()
    await setup_entry(hass, entry)
    assert "hot_room_override" in entry.runtime_data.last_acted
    set_climate(hass)
    await restart(hass, entry)
    acted = entry.runtime_data.last_acted["hot_room_override"]
    assert "cooling now" in acted["reason"]
    assert any(
        "hot_room_override" in line["message"] for line in entry.runtime_data.log
    )
    switch = hass.states.get("switch.living_room_hot_room_override")
    assert switch.attributes["last_acted"] is not None


async def test_who_holds_the_room_survives_a_restart(
    hass: HomeAssistant, hass_storage: dict[str, Any]
) -> None:
    """The saved holder is restored into the arbiter."""
    await mock_climate_services(hass)
    set_climate(hass)
    prepare(hass_storage, holder="heat")
    entry = make_entry()
    await setup_entry(hass, entry)
    assert entry.runtime_data.arbiter.holder == "heat"


async def test_the_first_evaluation_after_a_restart_waits_for_a_fresh_reading(
    hass: HomeAssistant, hass_storage: dict[str, Any]
) -> None:
    """No burst of commands: nothing is sent until the device reports again."""
    calls = await mock_climate_services(hass)
    set_climate(hass, room=29.0, setpoint=30.0)
    prepare(hass_storage)
    entry = make_entry()
    await setup_entry(hass, entry)
    assert calls == []
    assert hass.states.get(STATE_SENSOR).state == "waiting"
    assert "fresh reading" in entry.runtime_data.decision.reason
    set_climate(hass, room=29.0, setpoint=30.0)
    async_fire_time_changed(hass, dt_util.utcnow() + timedelta(seconds=31))
    await hass.async_block_till_done()
    assert len(calls) == 1


async def test_the_wait_for_a_fresh_reading_has_a_cap(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    """A device that never reports again does not stall the defender for ever."""
    calls = await mock_climate_services(hass)
    set_climate(hass, room=29.0, setpoint=30.0)
    prepare(hass_storage)
    entry = make_entry()
    await setup_entry(hass, entry)
    assert calls == []
    freezer.tick(timedelta(minutes=11))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    assert len(calls) == 1


async def test_a_first_setup_does_not_wait(
    hass: HomeAssistant, hass_storage: dict[str, Any]
) -> None:
    """With nothing saved the first evaluation acts at once."""
    calls = await mock_climate_services(hass)
    set_climate(hass, room=29.0, setpoint=30.0)
    await setup_entry(hass, make_entry())
    assert len(calls) == 1


async def test_removing_the_entry_deletes_the_saved_state(
    hass: HomeAssistant, hass_storage: dict[str, Any]
) -> None:
    """The saved state does not outlive the entry."""
    await mock_climate_services(hass)
    set_climate(hass)
    entry = make_entry()
    await setup_entry(hass, entry)
    await hass.config_entries.async_unload(entry.entry_id)
    assert f"{DOMAIN}.{ENTRY_ID}" in hass_storage
    await hass.config_entries.async_remove(entry.entry_id)
    assert f"{DOMAIN}.{ENTRY_ID}" not in hass_storage


async def test_a_pause_given_while_waiting_for_a_reading_is_saved(
    hass: HomeAssistant, hass_storage: dict[str, Any]
) -> None:
    """A pause set during the wait for a fresh reading is written out, not lost."""
    await mock_climate_services(hass)
    set_climate(hass)
    prepare(hass_storage)
    entry = make_entry()
    await setup_entry(hass, entry)
    assert "fresh reading" in entry.runtime_data.decision.reason
    await hass.services.async_call(
        DOMAIN, "pause", {"entity_id": STATE_SENSOR, "hours": 2}, blocking=True
    )
    hass.bus.async_fire(EVENT_HOMEASSISTANT_FINAL_WRITE)
    await hass.async_block_till_done()
    saved = hass_storage[f"{DOMAIN}.{ENTRY_ID}"]["data"]
    assert saved["pause"]["kind"] == "paused"
