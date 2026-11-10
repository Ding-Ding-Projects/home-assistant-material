"""Tests for the no-op analytics integration."""

from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component


async def test_setup_registers_nothing(hass: HomeAssistant) -> None:
    """The integration loads and registers no sending machinery."""
    assert await async_setup_component(hass, "analytics", {})
    await hass.async_block_till_done()
    assert "analytics" in hass.config.components
    assert not hass.services.async_services_for_domain("analytics")


async def test_stored_preferences_do_not_break_start(
    hass: HomeAssistant, hass_storage
) -> None:
    """A stored preference from an older installation is ignored."""
    hass_storage["core.analytics"] = {
        "version": 1,
        "key": "core.analytics",
        "data": {"onboarded": True, "preferences": {"base": True}, "uuid": "x"},
    }
    assert await async_setup_component(hass, "analytics", {})
