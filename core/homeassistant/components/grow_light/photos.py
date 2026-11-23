"""Serve the bundled crop photos so the picker works offline."""

from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant
from homeassistant.util.hass_dict import HassKey

from .const import PHOTO_URL
from .plants import PHOTOS

_REGISTERED: HassKey[bool] = HassKey("grow_light_photos")


async def async_register_photos(hass: HomeAssistant) -> None:
    """Register the photo folder once; the config flow can run before setup."""
    if hass.data.get(_REGISTERED) or "http" not in hass.config.components:
        return
    hass.data[_REGISTERED] = True
    await hass.http.async_register_static_paths(
        [StaticPathConfig(PHOTO_URL, str(PHOTOS), True)]
    )


def photo_url(plant_id: str) -> str:
    """Address of a crop's bundled photo."""
    return f"{PHOTO_URL}/{plant_id}.jpg"
