"""Setup, removal, diagnostics and entity names of Heat Defender."""

from pytest_homeassistant.components.diagnostics import get_diagnostics_for_config_entry
from pytest_homeassistant.typing import ClientSessionGenerator

from homeassistant.components.heat_defender.const import DOMAIN
from homeassistant.core import HomeAssistant

from .conftest import make_entry, mock_climate, set_climate


async def test_diagnostics_redact_the_unit(
    hass: HomeAssistant, hass_client: ClientSessionGenerator
) -> None:
    """The sister shares the brother's diagnostics, with entity ids redacted."""
    await mock_climate(hass)
    set_climate(hass)
    entry = make_entry()
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    result = await get_diagnostics_for_config_entry(hass, hass_client, entry)
    assert result["data"]["climate_entity_id"] == "**REDACTED**"
    assert result["info"]["run_mode"] == "heat"


async def test_removing_the_entry_deletes_its_saved_state(
    hass: HomeAssistant, hass_storage: dict
) -> None:
    """Removing the sister removes what she kept across restarts."""
    await mock_climate(hass)
    set_climate(hass)
    entry = make_entry()
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    await hass.config_entries.async_unload(entry.entry_id)
    key = f"{DOMAIN}.{entry.entry_id}"
    assert key in hass_storage
    await hass.config_entries.async_remove(entry.entry_id)
    assert key not in hass_storage


async def test_guard_switch_names_start_with_their_family(hass: HomeAssistant) -> None:
    """The sister's switches are named by family from her own strings."""
    await mock_climate(hass)
    set_climate(hass)
    entry = make_entry()
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    state = hass.states.get("switch.bedroom_hot_room_override")
    assert state.attributes["friendly_name"] == "Bedroom Safety: Hot room override"
