"""Fixtures for the AC Defender integration tests."""

from typing import Any

import pytest
from pytest_homeassistant.common import MockConfigEntry, async_mock_service

from homeassistant.components.ac_defender.const import (
    CONF_CLIMATE,
    CONF_MY_TEMPERATURE,
    CONF_SAFETY_TEMPERATURE,
    DOMAIN,
)
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component

CLIMATE = "climate.living_room"


def set_climate(
    hass: HomeAssistant,
    *,
    room: float = 24.0,
    setpoint: float = 23.0,
    mode: str = "cool",
    action: str = "idle",
    modes: tuple[str, ...] = ("off", "cool", "heat"),
    **extra: Any,
) -> None:
    """Publish the state of the fake climate entity."""
    hass.states.async_set(
        CLIMATE,
        mode,
        {
            "current_temperature": room,
            "temperature": setpoint,
            "hvac_modes": list(modes),
            "hvac_action": action,
            "min_temp": 16.0,
            "max_temp": 30.0,
            "target_temp_step": 0.5,
            "friendly_name": "Living room",
            **extra,
        },
    )


@pytest.fixture
def mock_entry() -> MockConfigEntry:
    """Return a config entry for the fake climate entity."""
    return MockConfigEntry(
        domain=DOMAIN,
        title="Living room",
        unique_id=CLIMATE,
        data={
            CONF_CLIMATE: CLIMATE,
            CONF_MY_TEMPERATURE: 23.0,
            CONF_SAFETY_TEMPERATURE: 28.0,
        },
    )


async def mock_climate_services(hass: HomeAssistant) -> list:
    """Load the climate component, then replace its set_temperature with a recorder."""
    assert await async_setup_component(hass, "climate", {})
    return async_mock_service(hass, "climate", "set_temperature")


async def setup_entry(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    """Add the entry and set it up."""
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
