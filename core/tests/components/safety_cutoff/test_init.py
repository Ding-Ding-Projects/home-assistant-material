"""Tests for how the Safety cutoff helper trips, cuts and resets."""

from datetime import timedelta

from freezegun.api import FrozenDateTimeFactory
import pytest
from pytest_homeassistant.common import (
    MockConfigEntry,
    async_fire_time_changed,
    async_mock_service,
    mock_restore_cache,
)

from homeassistant.components.safety_cutoff.const import DOMAIN, EVENT_TRIPPED
from homeassistant.const import ATTR_ENTITY_ID, STATE_OFF, STATE_ON, STATE_UNKNOWN
from homeassistant.core import Event, HomeAssistant, ServiceCall, State
from homeassistant.exceptions import HomeAssistantError

LEAK = "binary_sensor.shelf_leak"
PUMP = "switch.pump"
LIGHTS = "switch.lights"
POWER = "sensor.shelf_power"
TRIPPED = "binary_sensor.grow_shelf_tripped"
CAUSE = "sensor.grow_shelf_cause"
ARMED = "switch.grow_shelf_armed"
RESET = "button.grow_shelf_reset"

OPTIONS = {
    "name": "Grow shelf",
    "leaks": [LEAK],
    "switches": [PUMP, LIGHTS],
    "power_sensor": POWER,
    "power_limit": 800,
    "power_seconds": 30,
    "cut_on_power": True,
    "notify": ["notify.phone"],
}


async def _setup(
    hass: HomeAssistant, options: dict | None = None, leak: str = STATE_OFF
) -> MockConfigEntry:
    hass.states.async_set(LEAK, leak)
    hass.states.async_set(PUMP, STATE_ON)
    hass.states.async_set(LIGHTS, STATE_ON)
    hass.states.async_set(POWER, "100")
    entry = MockConfigEntry(
        domain=DOMAIN, title="Grow shelf", options=options or OPTIONS
    )
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


def _cut(calls: list[ServiceCall]) -> list[str]:
    cut: list[str] = []
    for call in calls:
        ids = call.data[ATTR_ENTITY_ID]
        cut.extend(ids if isinstance(ids, list) else [ids])
    return cut


async def test_starts_untripped(hass: HomeAssistant) -> None:
    """A dry cutoff is armed and not tripped."""
    await _setup(hass)

    assert hass.states.get(TRIPPED).state == STATE_OFF
    assert hass.states.get(CAUSE).state == "none"
    assert hass.states.get(ARMED).state == STATE_ON


async def test_leak_cuts_everything_and_notifies(hass: HomeAssistant) -> None:
    """A leak turns every switch off, fires the event and notifies."""
    cuts = async_mock_service(hass, "homeassistant", "turn_off")
    notes = async_mock_service(hass, "notify", "phone")
    events: list[Event] = []
    hass.bus.async_listen(EVENT_TRIPPED, events.append)
    await _setup(hass)

    hass.states.async_set(LEAK, STATE_ON)
    await hass.async_block_till_done()

    assert sorted(_cut(cuts)) == [LIGHTS, PUMP]
    assert hass.states.get(TRIPPED).state == STATE_ON
    assert hass.states.get(TRIPPED).attributes["cause"] == "leak"
    assert hass.states.get(TRIPPED).attributes["since"] is not None
    assert hass.states.get(CAUSE).state == "leak"
    assert len(events) == 1
    assert events[0].data["cause"] == "leak"
    assert len(notes) == 1
    assert "leak" in notes[0].data["message"]


async def test_switch_turned_on_again_is_cut_again(hass: HomeAssistant) -> None:
    """While tripped, a switch turned back on is turned off again."""
    cuts = async_mock_service(hass, "homeassistant", "turn_off")
    await _setup(hass)
    hass.states.async_set(LEAK, STATE_ON)
    hass.states.async_set(PUMP, STATE_OFF)
    hass.states.async_set(LIGHTS, STATE_OFF)
    await hass.async_block_till_done()
    cuts.clear()

    hass.states.async_set(PUMP, STATE_ON)
    await hass.async_block_till_done()

    assert _cut(cuts) == [PUMP]


async def test_switch_turned_on_when_not_tripped_is_left_alone(
    hass: HomeAssistant,
) -> None:
    """Without a trip, switching the pump on is not touched."""
    cuts = async_mock_service(hass, "homeassistant", "turn_off")
    await _setup(hass)
    hass.states.async_set(PUMP, STATE_OFF)
    hass.states.async_set(PUMP, STATE_ON)
    await hass.async_block_till_done()

    assert cuts == []


async def test_power_over_limit_for_duration_trips(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    """Power above the limit for the whole duration trips and cuts."""
    cuts = async_mock_service(hass, "homeassistant", "turn_off")
    await _setup(hass)

    hass.states.async_set(POWER, "900")
    await hass.async_block_till_done()
    freezer.tick(timedelta(seconds=29))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    assert hass.states.get(TRIPPED).state == STATE_OFF

    freezer.tick(timedelta(seconds=2))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()

    assert hass.states.get(TRIPPED).state == STATE_ON
    assert hass.states.get(CAUSE).state == "power"
    assert sorted(_cut(cuts)) == [LIGHTS, PUMP]


async def test_short_power_spike_does_not_trip(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    """Power that falls back under the limit cancels the countdown."""
    await _setup(hass)

    hass.states.async_set(POWER, "900")
    await hass.async_block_till_done()
    freezer.tick(timedelta(seconds=10))
    async_fire_time_changed(hass)
    hass.states.async_set(POWER, "100")
    await hass.async_block_till_done()
    freezer.tick(timedelta(seconds=60))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()

    assert hass.states.get(TRIPPED).state == STATE_OFF


async def test_power_trip_without_cut(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    """With cut on power off, a power trip latches but cuts nothing."""
    cuts = async_mock_service(hass, "homeassistant", "turn_off")
    await _setup(hass, {**OPTIONS, "cut_on_power": False})

    hass.states.async_set(POWER, "900")
    await hass.async_block_till_done()
    freezer.tick(timedelta(seconds=31))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()

    assert hass.states.get(TRIPPED).state == STATE_ON
    assert cuts == []


async def test_reset_refused_while_wet_and_allowed_when_dry(
    hass: HomeAssistant,
) -> None:
    """Reset needs every leak sensor dry."""
    async_mock_service(hass, "homeassistant", "turn_off")
    notes = async_mock_service(hass, "notify", "phone")
    await _setup(hass)
    hass.states.async_set(LEAK, STATE_ON)
    await hass.async_block_till_done()

    with pytest.raises(HomeAssistantError) as err:
        await hass.services.async_call(
            "button", "press", {ATTR_ENTITY_ID: RESET}, blocking=True
        )
    assert err.value.translation_key == "leak_still_wet"
    assert hass.states.get(TRIPPED).state == STATE_ON

    hass.states.async_set(LEAK, STATE_OFF)
    await hass.async_block_till_done()
    assert hass.states.get(TRIPPED).state == STATE_ON

    await hass.services.async_call(
        "button", "press", {ATTR_ENTITY_ID: RESET}, blocking=True
    )
    await hass.async_block_till_done()

    assert hass.states.get(TRIPPED).state == STATE_OFF
    assert hass.states.get(CAUSE).state == "none"
    assert "reset" in notes[-1].data["message"]


async def test_disarmed_only_notifies(hass: HomeAssistant) -> None:
    """A disarmed cutoff latches and notifies but cuts nothing."""
    cuts = async_mock_service(hass, "homeassistant", "turn_off")
    notes = async_mock_service(hass, "notify", "phone")
    await _setup(hass)
    await hass.services.async_call(
        "switch", "turn_off", {ATTR_ENTITY_ID: ARMED}, blocking=True
    )

    hass.states.async_set(LEAK, STATE_ON)
    await hass.async_block_till_done()

    assert hass.states.get(TRIPPED).state == STATE_ON
    assert cuts == []
    assert len(notes) == 1
    assert "Nothing was switched off" in notes[0].data["message"]


async def test_restored_latch_cuts_again_on_start(hass: HomeAssistant) -> None:
    """A trip survives a restart and cuts again while still latched."""
    cuts = async_mock_service(hass, "homeassistant", "turn_off")
    mock_restore_cache(
        hass,
        [
            State(
                TRIPPED,
                STATE_ON,
                {"cause": "power", "since": "2026-11-20T10:00:00+00:00"},
            ),
            State(ARMED, STATE_ON),
        ],
    )
    await _setup(hass)

    assert hass.states.get(TRIPPED).state == STATE_ON
    assert hass.states.get(TRIPPED).attributes["cause"] == "power"
    assert hass.states.get(TRIPPED).attributes["since"] == "2026-11-20T10:00:00+00:00"
    assert sorted(_cut(cuts)) == [LIGHTS, PUMP]


async def test_wet_at_start_trips(hass: HomeAssistant) -> None:
    """A sensor that is already wet at start-up trips the cutoff."""
    cuts = async_mock_service(hass, "homeassistant", "turn_off")
    await _setup(hass, leak=STATE_ON)

    assert hass.states.get(TRIPPED).state == STATE_ON
    assert sorted(_cut(cuts)) == [LIGHTS, PUMP]


async def test_unknown_leak_state_does_not_trip(hass: HomeAssistant) -> None:
    """Unknown is not wet."""
    await _setup(hass, leak=STATE_UNKNOWN)

    assert hass.states.get(TRIPPED).state == STATE_OFF


async def test_unload(hass: HomeAssistant) -> None:
    """The entry unloads cleanly."""
    entry = await _setup(hass)

    assert await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()
