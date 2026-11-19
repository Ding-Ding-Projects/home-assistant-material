"""Shared access to the linked media manager."""

from homeassistant.core import HomeAssistant, callback
from homeassistant.util.hass_dict import HassKey

from .const import DOMAIN
from .manager import LinkedMediaManager

DATA_MANAGER: HassKey[LinkedMediaManager] = HassKey(DOMAIN)


@callback
def async_get_manager(hass: HomeAssistant) -> LinkedMediaManager | None:
    """Return the manager while linked media is set up."""
    return hass.data.get(DATA_MANAGER)
