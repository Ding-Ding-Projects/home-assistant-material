"""Translated errors, repair issues, entity defaults and the family switch names."""

from datetime import timedelta

import pytest
from pytest_homeassistant.common import MockConfigEntry, async_fire_time_changed

from homeassistant.components.ac_defender.const import CONF_OUTDOOR, DOMAIN
from homeassistant.components.ac_defender.coordinator import InvalidValue
from homeassistant.components.ac_defender.entity import _refused
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import entity_registry as er, issue_registry as ir
from homeassistant.util import dt as dt_util

from .conftest import CLIMATE, mock_climate_services, set_climate, setup_entry

OUTDOOR = "sensor.outdoor"


async def test_a_refused_value_becomes_a_translated_error(
    hass: HomeAssistant, mock_entry: MockConfigEntry
) -> None:
    """The error carries the integration's translation key and its values."""
    await mock_climate_services(hass)
    set_climate(hass)
    await setup_entry(hass, mock_entry)
    coordinator = mock_entry.runtime_data
    with pytest.raises(InvalidValue) as refused:
        coordinator.validate_temperature(15.0)
    err = _refused(coordinator, refused.value)
    assert isinstance(err, ServiceValidationError)
    assert (err.translation_domain, err.translation_key) == (
        DOMAIN,
        "below_device_minimum",
    )
    assert err.translation_placeholders == {"value": "15.0", "minimum": "16.0"}


async def test_a_value_above_the_device_maximum_is_a_translated_error(
    hass: HomeAssistant, mock_entry: MockConfigEntry
) -> None:
    """The message is worded from the integration's own strings."""
    await mock_climate_services(hass)
    set_climate(hass, max_temp=26.0)
    await setup_entry(hass, mock_entry)
    coordinator = mock_entry.runtime_data
    with pytest.raises(ValueError) as err:
        coordinator.validate_temperature(27.0)
    assert err.value.key == "above_device_maximum"
    assert err.value.placeholders == {"value": "27.0", "maximum": "26.0"}


async def test_a_missing_device_raises_a_repair_issue_until_it_returns(
    hass: HomeAssistant, mock_entry: MockConfigEntry
) -> None:
    """While setup waits for the device, the owner sees why in Repairs."""
    await mock_climate_services(hass)
    mock_entry.add_to_hass(hass)
    await hass.config_entries.async_setup(mock_entry.entry_id)
    await hass.async_block_till_done()
    registry = ir.async_get(hass)
    issue_id = f"climate_missing_{mock_entry.entry_id}"
    issue = registry.async_get_issue(DOMAIN, issue_id)
    assert issue is not None
    assert issue.translation_placeholders == {
        "entity_id": CLIMATE,
        "title": "Living room",
    }
    set_climate(hass)
    async_fire_time_changed(hass, dt_util.utcnow() + timedelta(minutes=2))
    await hass.async_block_till_done(wait_background_tasks=True)
    assert mock_entry.state is ConfigEntryState.LOADED
    assert registry.async_get_issue(DOMAIN, issue_id) is None


async def test_a_missing_sensor_raises_a_repair_issue_until_it_returns(
    hass: HomeAssistant,
) -> None:
    """A chosen outdoor sensor that disappears is reported, and cleared when back."""
    await mock_climate_services(hass)
    set_climate(hass)
    entry = MockConfigEntry(
        domain=DOMAIN,
        title="Living room",
        unique_id=CLIMATE,
        data={"climate_entity_id": CLIMATE, CONF_OUTDOOR: OUTDOOR},
    )
    await setup_entry(hass, entry)
    registry = ir.async_get(hass)
    issue_id = f"missing_{CONF_OUTDOOR}_{entry.entry_id}"
    assert registry.async_get_issue(DOMAIN, issue_id) is not None
    hass.states.async_set(OUTDOOR, "12.0")
    await entry.runtime_data.async_evaluate()
    assert registry.async_get_issue(DOMAIN, issue_id) is None
    hass.states.async_remove(OUTDOOR)
    await entry.runtime_data.async_evaluate()
    assert registry.async_get_issue(DOMAIN, issue_id) is not None
    await hass.config_entries.async_remove(entry.entry_id)
    assert registry.async_get_issue(DOMAIN, issue_id) is None


async def test_the_less_used_sensors_start_disabled(
    hass: HomeAssistant, mock_entry: MockConfigEntry
) -> None:
    """Next check and who holds the room are hidden until someone wants them."""
    await mock_climate_services(hass)
    set_climate(hass)
    await setup_entry(hass, mock_entry)
    registry = er.async_get(hass)
    disabled = {
        entry.translation_key
        for entry in er.async_entries_for_config_entry(registry, mock_entry.entry_id)
        if entry.disabled_by is er.RegistryEntryDisabler.INTEGRATION
    }
    assert disabled == {"next_check", "holder"}


async def test_guard_switch_names_start_with_their_family(
    hass: HomeAssistant, mock_entry: MockConfigEntry
) -> None:
    """The family groups the 51 switches when sorted, and the entity ids stay."""
    await mock_climate_services(hass)
    set_climate(hass)
    await setup_entry(hass, mock_entry)
    hot = hass.states.get("switch.living_room_hot_room_override")
    assert hot.attributes["friendly_name"] == "Living room Safety: Hot room override"
    sync = hass.states.get("switch.living_room_comfort_sync")
    assert sync.attributes["friendly_name"] == "Living room Timing: Comfort sync"
    registry = er.async_get(hass)
    keys = {
        entry.translation_key
        for entry in er.async_entries_for_config_entry(registry, mock_entry.entry_id)
        if entry.domain == "switch"
    }
    assert keys == {"guard_safety", "guard_people", "guard_timing", "guard_money"}
