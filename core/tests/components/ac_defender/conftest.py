"""Fixtures for the AC Defender integration tests."""

from typing import Any

import pytest
from pytest_homeassistant.common import MockConfigEntry

from homeassistant.components.ac_defender.const import (
    CONF_CLIMATE,
    CONF_MY_TEMPERATURE,
    CONF_SAFETY_TEMPERATURE,
    DOMAIN,
)
from homeassistant.core import HomeAssistant

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
