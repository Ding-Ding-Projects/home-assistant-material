"""A whole day of the brother and the sister on one climate entity."""

from datetime import timedelta
import itertools
from typing import Any

from freezegun.api import FrozenDateTimeFactory
import probatio
import pytest
from pytest_homeassistant.common import MockConfigEntry

from homeassistant.components.ac_defender.const import DOMAIN as AC_DOMAIN
from homeassistant.components.ac_defender.coordinator import DefenderCoordinator
from homeassistant.components.heat_defender.config_flow import heat_schema
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.setup import async_setup_component

from .conftest import CLIMATE, make_entry, mock_climate, set_climate, setup

MIN_INTERVAL = timedelta(minutes=10)


def ac_entry(my_temp: float = 24.0) -> MockConfigEntry:
    """Return the brother's entry for the same climate entity."""
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


class FakeDevice:
    """A climate entity that obeys commands, so a day plays out like a real one."""

    def __init__(self, hass: HomeAssistant, room: float, mode: str) -> None:
        """Register the services that change the device."""
        self.hass = hass
        self.room = room
        self.mode = mode
        self.setpoint = 17.0
        self.commands: list[tuple[str, Any]] = []
        hass.services.async_register("climate", "set_hvac_mode", self._set_mode)
        hass.services.async_register("climate", "set_temperature", self._set_temp)
        self.publish()

    def publish(self) -> None:
        """Publish the device state with the action that follows from it."""
        if self.mode == "heat":
            action = "heating" if self.room < self.setpoint else "idle"
        elif self.mode == "cool":
            action = "cooling" if self.room > self.setpoint else "idle"
        else:
            action = "off"
        set_climate(
            self.hass,
            room=self.room,
            setpoint=self.setpoint,
            mode=self.mode,
            hvac_action=action,
        )

    async def _set_mode(self, call: ServiceCall) -> None:
        self.commands.append(("mode", call.data["hvac_mode"]))
        self.mode = call.data["hvac_mode"]
        self.publish()

    async def _set_temp(self, call: ServiceCall) -> None:
        self.commands.append(("temperature", call.data["temperature"]))
        self.setpoint = call.data["temperature"]
        self.publish()


class Day:
    """Drives the room temperature through a scripted day and records everything."""

    def __init__(
        self,
        hass: HomeAssistant,
        freezer: FrozenDateTimeFactory,
        device: FakeDevice,
        brother: DefenderCoordinator,
        sister: DefenderCoordinator,
    ) -> None:
        """Remember the two defenders and the device."""
        self.hass = hass
        self.freezer = freezer
        self.device = device
        self.brother = brother
        self.sister = sister
        self.timeline: list[tuple[str, str, str, Any]] = []
        self._seen = 0

    async def step(
        self, minutes: float, room: float, wall: float | None = None
    ) -> None:
        """Move the clock and the room, then let both defenders evaluate."""
        self.freezer.tick(timedelta(minutes=minutes))
        self.device.room = room
        if wall is not None:
            self.device.setpoint = wall
        self.device.publish()
        await self.hass.async_block_till_done()
        for _ in range(2):
            await self.sister.async_evaluate()
            await self.brother.async_evaluate()
            await self.hass.async_block_till_done()
        stamp = self.freezer().isoformat()
        for kind, value in self.device.commands[self._seen :]:
            self.timeline.append((stamp, self.brother.arbiter.holder, kind, value))
        self._seen = len(self.device.commands)

    def events(self) -> list[tuple[str, str, str, str]]:
        """Return kind, who, to and code of every shared log event in order."""
        return [(e.kind, e.who, e.to, e.code) for e in self.brother.arbiter.events]


async def start_day(hass: HomeAssistant, freezer: FrozenDateTimeFactory) -> Day:
    """Set up both defenders on a cold bedroom with the heating off."""
    assert await async_setup_component(hass, "climate", {})
    device = FakeDevice(hass, room=15.0, mode="off")
    sister = make_entry(heat_mode="cap", heat_cap=22.0, floor=16.0)
    brother = ac_entry()
    await setup(hass, sister)
    await setup(hass, brother)
    return Day(hass, freezer, device, brother.runtime_data, sister.runtime_data)


async def test_a_whole_day(hass: HomeAssistant, freezer: FrozenDateTimeFactory) -> None:
    """She holds, hands over once the heating is off, he cools, and she takes the floor."""
    day = await start_day(hass, freezer)
    for minutes, room, wall in (
        (5, 17.5, None),
        (60, 22.5, None),
        (30, 24.6, 26.0),
        (3, 24.6, None),
        (20, 23.0, None),
        (180, 15.2, None),
    ):
        await day.step(minutes, room, wall)

    events = [(e.kind, e.who, e.to, e.code) for e in day.brother.arbiter.events]
    assert events == [
        ("safety", "heat", "ac", "floor_reached"),
        ("handover", "heat", "neither", "inside_band"),
        ("handover", "ac", "heat", "heat_off_first"),
        ("handover", "heat", "ac", "heat_off_still_hot"),
        ("handover", "ac", "neither", "inside_band"),
        ("safety", "heat", "ac", "floor_reached"),
    ]

    # Her setpoint drop ends the heating, and only then does he get the room.
    assert day.device.commands == [
        ("mode", "heat"),
        ("temperature", 24.5),
        ("mode", "cool"),
        ("mode", "heat"),
    ]

    # Comfort handovers keep the minimum interval, except the one that is
    # allowed because her heating is confirmed off.
    arbiter_events = day.brother.arbiter.events
    for before, after in itertools.pairwise(arbiter_events):
        if "safety" in (before.kind, after.kind) or after.code == "heat_off_still_hot":
            continue
        assert after.time - before.time >= MIN_INTERVAL

    # Both sit on the same shared log, in the same order, with the same codes.
    codes = [code for _, _, _, code in events]
    for defender in (day.brother, day.sister):
        logged = [
            entry["values"]["code"]
            for entry in reversed(defender.log)
            if entry["kind"] == "handover"
        ]
        assert logged == codes


async def test_both_restart_together_with_one_paused(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    """After a restart the paused one stays paused and the other keeps the room."""
    assert await async_setup_component(hass, "climate", {})
    device = FakeDevice(hass, room=21.0, mode="heat")
    sister_entry = make_entry(heat_mode="cap", heat_cap=22.0, floor=16.0)
    brother_entry = ac_entry()
    await setup(hass, sister_entry)
    await setup(hass, brother_entry)
    brother, sister = brother_entry.runtime_data, sister_entry.runtime_data
    assert sister.arbiter.holder == "heat"
    brother.start_pause(2)
    await brother.async_evaluate()
    assert brother.pause is not None

    assert await hass.config_entries.async_unload(brother_entry.entry_id)
    assert await hass.config_entries.async_unload(sister_entry.entry_id)
    sent_before = list(device.commands)

    freezer.tick(timedelta(minutes=1))
    device.publish()
    assert await hass.config_entries.async_setup(sister_entry.entry_id)
    assert await hass.config_entries.async_setup(brother_entry.entry_id)
    await hass.async_block_till_done()
    brother, sister = brother_entry.runtime_data, sister_entry.runtime_data

    assert brother.pause is not None
    assert brother.decision.state == "paused"
    assert sister.arbiter.holder == "heat"
    assert device.commands == sent_before

    freezer.tick(timedelta(minutes=1))
    device.room = 26.0
    device.publish()
    await hass.async_block_till_done()
    await sister.async_evaluate()
    await brother.async_evaluate()

    assert brother.decision.state == "paused"
    assert ("mode", "cool") not in device.commands
    assert "resumed" not in [e["kind"] for e in sister.log]


async def test_courtesy_wait_option_zero_turns_manual_heating_off_at_once(
    hass: HomeAssistant,
) -> None:
    """With a courtesy wait of zero the heating is turned off on the first look."""
    calls = await mock_climate(hass)
    set_climate(hass, room=20.0, setpoint=21.0, mode="heat")
    entry = make_entry(courtesy_wait_minutes=0)
    entry.add_to_hass(hass)
    hass.config_entries.async_update_entry(
        entry, options={"guards": {"cool_mode_restore": {"enabled": False}}}
    )
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    assert [c.data["hvac_mode"] for c in calls["set_hvac_mode"]] == ["off"]


async def test_courtesy_wait_is_the_only_wait_with_the_restore_guard_on(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    """The mode-restore guard does not add its own pause to the courtesy wait."""
    calls = await mock_climate(hass)
    set_climate(hass, room=20.0, setpoint=21.0, mode="heat")
    entry = make_entry(courtesy_wait_minutes=5)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    assert not calls["set_hvac_mode"]

    freezer.tick(timedelta(minutes=2))
    await entry.runtime_data.async_evaluate()
    assert not calls["set_hvac_mode"]

    freezer.tick(timedelta(minutes=4))
    await entry.runtime_data.async_evaluate()
    assert [c.data["hvac_mode"] for c in calls["set_hvac_mode"]] == ["off"]


async def test_courtesy_wait_zero_is_at_once_with_the_restore_guard_on(
    hass: HomeAssistant,
) -> None:
    """Zero means the first look, whatever the restore guard would have waited."""
    calls = await mock_climate(hass)
    set_climate(hass, room=20.0, setpoint=21.0, mode="heat")
    entry = make_entry(courtesy_wait_minutes=0)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    assert [c.data["hvac_mode"] for c in calls["set_hvac_mode"]] == ["off"]


@pytest.mark.parametrize(
    ("stored", "minutes"),
    [(0, 0.0), (10, 10.0), (30, 30.0), (99, 30.0), (-5, 0.0), ("soon", 10.0)],
)
async def test_courtesy_wait_option_is_clamped(
    hass: HomeAssistant, stored: object, minutes: float
) -> None:
    """The stored wait is kept between 0 and 30 minutes, and 10 when it is unreadable."""
    await mock_climate(hass)
    set_climate(hass, room=20.0, setpoint=21.0, mode="off")
    entry = make_entry(courtesy_wait_minutes=stored)
    await setup(hass, entry)
    assert entry.runtime_data.courtesy_wait == minutes


def test_courtesy_wait_control_is_a_slider_of_zero_to_thirty_minutes() -> None:
    """The settings form takes 0 to 30 minutes and refuses more."""
    schema = heat_schema({}, with_unit=False)
    base = {
        "heat_mode": "off",
        "heat_cap": 22.0,
        "floor": 16.0,
        "freeze_rule": True,
        "safety_temperature": 26.0,
    }
    assert schema({**base, "courtesy_wait_minutes": 30})["courtesy_wait_minutes"] == 30
    assert schema(base)["courtesy_wait_minutes"] == 10
    with pytest.raises(probatio.Invalid):
        schema({**base, "courtesy_wait_minutes": 31})
