"""Fixtures for the Heat Defender integration tests."""

from typing import Any

from pytest_homeassistant.common import MockConfigEntry, async_mock_service

from homeassistant.components.heat_defender.const import DOMAIN
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component

CLIMATE = "climate.bedroom"
STATE_SENSOR = "sensor.bedroom_state"


def set_climate(
    hass: HomeAssistant,
    *,
    room: float | None = 19.0,
    setpoint: float = 20.0,
    mode: str = "heat",
    **extra: Any,
) -> None:
    """Publish the state of the fake climate entity."""
    attrs = {
        "temperature": setpoint,
        "hvac_modes": ["off", "heat", "cool"],
        "hvac_action": "idle",
        "min_temp": 5.0,
        "max_temp": 30.0,
        "target_temp_step": 0.5,
        "friendly_name": "Bedroom",
        **extra,
    }
    if room is not None:
        attrs["current_temperature"] = room
    hass.states.async_set(CLIMATE, mode, attrs)


async def mock_climate(hass: HomeAssistant) -> dict[str, list]:
    """Load the climate component and replace its services with recorders."""
    assert await async_setup_component(hass, "climate", {})
    return {
        name: async_mock_service(hass, "climate", name)
        for name in ("set_temperature", "set_hvac_mode")
    }


def make_entry(**options: Any) -> MockConfigEntry:
    """Return a Heat Defender entry; the stored values can be set directly."""
    data = {
        "climate_entity_id": CLIMATE,
        "heat_mode": "off",
        "heat_cap": 22.0,
        "floor": 16.0,
        "freeze_rule": True,
        "safety_temperature": 26.0,
    }
    data.update(options)
    return MockConfigEntry(domain=DOMAIN, title="Bedroom", unique_id=CLIMATE, data=data)


async def setup(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    """Set up the entry."""
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
