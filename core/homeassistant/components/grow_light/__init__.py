"""Grow light: light hours, door pauses and watering for one crop or plug."""

from datetime import date, time

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant

from .const import (
    CONF_DOORS,
    CONF_DRY_BELOW,
    CONF_HOURS,
    CONF_MOISTURE,
    CONF_NOTIFY,
    CONF_PLANT,
    CONF_PLANTED_ON,
    CONF_PLUG,
    CONF_POWER,
    CONF_PRICE,
    CONF_RESOW_DAYS,
    CONF_START,
    CONF_WATER_DAYS,
    CONF_WATER_MINUTES,
    CONF_WATER_SWITCH,
    CONF_WATTS,
    DEFAULT_DRY_BELOW,
    DEFAULT_HOURS,
    DEFAULT_WATER_MINUTES,
    PLANT_CUSTOM,
)
from .controller import GrowLightController, GrowLightSettings
from .photos import async_register_photos
from .plants import async_get_plants

PLATFORMS = [Platform.BUTTON, Platform.EVENT, Platform.SENSOR, Platform.SWITCH]

type GrowLightConfigEntry = ConfigEntry[GrowLightController]


async def async_setup_entry(hass: HomeAssistant, entry: GrowLightConfigEntry) -> None:
    """Set up a grow light from a config entry."""
    options = entry.options
    plant = None
    planted_on = None
    if (plant_id := options.get(CONF_PLANT, PLANT_CUSTOM)) != PLANT_CUSTOM:
        plant = (await async_get_plants(hass)).get(plant_id)
        planted = options.get(CONF_PLANTED_ON)
        planted_on = date.fromisoformat(planted) if planted else entry.created_at.date()
    await async_register_photos(hass)
    controller = GrowLightController(
        hass,
        GrowLightSettings(
            plug=options[CONF_PLUG],
            start=time.fromisoformat(options[CONF_START]),
            hours=float(options.get(CONF_HOURS, DEFAULT_HOURS)),
            doors=list(options.get(CONF_DOORS, [])),
            plant=plant,
            planted_on=planted_on,
            water_days=int(options.get(CONF_WATER_DAYS, 0)),
            water_switch=options.get(CONF_WATER_SWITCH),
            water_minutes=float(options.get(CONF_WATER_MINUTES, DEFAULT_WATER_MINUTES)),
            name=entry.title,
            notify=list(options.get(CONF_NOTIFY, [])),
            moisture=options.get(CONF_MOISTURE),
            dry_below=float(options.get(CONF_DRY_BELOW, DEFAULT_DRY_BELOW)),
            watts=float(options.get(CONF_WATTS, 0)),
            power=options.get(CONF_POWER),
            price=float(options.get(CONF_PRICE, 0)),
            resow_days=int(options.get(CONF_RESOW_DAYS, 0)),
        ),
    )
    entry.runtime_data = controller
    # Entities restore the schedule switch and last watering before the first run.
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    controller.async_start()
    entry.async_on_unload(controller.async_stop)


async def async_unload_entry(hass: HomeAssistant, entry: GrowLightConfigEntry) -> None:
    """Unload a config entry."""
    await hass.config_entries.async_unload_platforms_or_raise(entry, PLATFORMS)
