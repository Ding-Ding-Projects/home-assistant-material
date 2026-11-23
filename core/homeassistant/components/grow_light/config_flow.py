"""Config and options flow for the Grow light helper."""

from collections.abc import Mapping
from typing import Any, cast, override

import probatio

from homeassistant.components.binary_sensor import DOMAIN as BINARY_SENSOR_DOMAIN
from homeassistant.components.input_boolean import DOMAIN as INPUT_BOOLEAN_DOMAIN
from homeassistant.components.light import DOMAIN as LIGHT_DOMAIN
from homeassistant.components.switch import DOMAIN as SWITCH_DOMAIN
from homeassistant.const import CONF_NAME
from homeassistant.helpers import selector
from homeassistant.helpers.schema_config_entry_flow import (
    SchemaCommonFlowHandler,
    SchemaConfigFlowHandler,
    SchemaFlowFormStep,
)
from homeassistant.util import dt as dt_util

from .const import (
    CONF_DOORS,
    CONF_HOURS,
    CONF_PLANT,
    CONF_PLANTED_ON,
    CONF_PLUG,
    CONF_START,
    CONF_WATER_DAYS,
    CONF_WATER_MINUTES,
    CONF_WATER_SWITCH,
    DEFAULT_HOURS,
    DEFAULT_START,
    DEFAULT_WATER_DAYS,
    DEFAULT_WATER_MINUTES,
    DOMAIN,
    PLANT_CUSTOM,
)
from .photos import async_register_photos, photo_url
from .plants import Plant, async_get_plants

PHOTOPERIOD = {
    "long_day": "Long-day",
    "short_day": "Short-day",
    "day_neutral": "Day-neutral",
}


def _plant_option(plant: Plant) -> selector.SelectOptionDict:
    """A picker row: name, photo and a one-line summary with the photo credit."""
    group = "Legume" if plant.group == "legume" else "Vegetable"
    return {
        "value": plant.id,
        "label": plant.name,
        "image": photo_url(plant.id),
        "description": (
            f"{group} · {PHOTOPERIOD.get(plant.photoperiod, plant.photoperiod)}"
            f" · {plant.total_days} days · Photo: {plant.photo_author},"
            f" {plant.photo_license}"
        ),
    }


async def _options_schema(handler: SchemaCommonFlowHandler) -> probatio.Schema:
    hass = handler.parent_handler.hass
    await async_register_photos(hass)
    plants = sorted((await async_get_plants(hass)).values(), key=lambda p: p.name)
    options: list[selector.SelectOptionDict] = [
        {"value": PLANT_CUSTOM, "label": "None, set my own hours"},
        *(_plant_option(plant) for plant in plants),
    ]
    return probatio.Schema(
        {
            probatio.Required(CONF_PLUG): selector.EntitySelector(
                selector.EntitySelectorConfig(
                    domain=[SWITCH_DOMAIN, LIGHT_DOMAIN, INPUT_BOOLEAN_DOMAIN]
                )
            ),
            probatio.Required(
                CONF_PLANT, default=PLANT_CUSTOM
            ): selector.SelectSelector(
                selector.SelectSelectorConfig(
                    options=options, mode=selector.SelectSelectorMode.DROPDOWN
                )
            ),
            probatio.Optional(
                CONF_PLANTED_ON, default=dt_util.now().date().isoformat()
            ): selector.DateSelector(),
            probatio.Required(
                CONF_START, default=DEFAULT_START
            ): selector.TimeSelector(),
            probatio.Required(
                CONF_HOURS, default=DEFAULT_HOURS
            ): selector.NumberSelector(
                selector.NumberSelectorConfig(
                    min=0.5,
                    max=24,
                    step=0.5,
                    unit_of_measurement="h",
                    mode=selector.NumberSelectorMode.BOX,
                )
            ),
            probatio.Optional(CONF_DOORS, default=[]): selector.EntitySelector(
                selector.EntitySelectorConfig(
                    domain=BINARY_SENSOR_DOMAIN, multiple=True
                )
            ),
            probatio.Optional(
                CONF_WATER_DAYS, default=DEFAULT_WATER_DAYS
            ): selector.NumberSelector(
                selector.NumberSelectorConfig(
                    min=0,
                    max=30,
                    step=1,
                    unit_of_measurement="d",
                    mode=selector.NumberSelectorMode.BOX,
                )
            ),
            probatio.Optional(CONF_WATER_SWITCH): selector.EntitySelector(
                selector.EntitySelectorConfig(
                    domain=[SWITCH_DOMAIN, INPUT_BOOLEAN_DOMAIN]
                )
            ),
            probatio.Optional(
                CONF_WATER_MINUTES, default=DEFAULT_WATER_MINUTES
            ): selector.NumberSelector(
                selector.NumberSelectorConfig(
                    min=0.5,
                    max=60,
                    step=0.5,
                    unit_of_measurement="min",
                    mode=selector.NumberSelectorMode.BOX,
                )
            ),
        }
    )


async def _config_schema(handler: SchemaCommonFlowHandler) -> probatio.Schema:
    return probatio.Schema(
        {probatio.Required(CONF_NAME): selector.TextSelector()}
    ).extend((await _options_schema(handler)).schema)


CONFIG_FLOW = {"user": SchemaFlowFormStep(_config_schema)}
OPTIONS_FLOW = {"init": SchemaFlowFormStep(_options_schema)}


class ConfigFlowHandler(SchemaConfigFlowHandler, domain=DOMAIN):
    """Handle a config or options flow for Grow light."""

    config_flow = CONFIG_FLOW
    options_flow = OPTIONS_FLOW
    options_flow_reloads = True

    @override
    def async_config_entry_title(self, options: Mapping[str, Any]) -> str:
        """Return config entry title."""
        return cast(str, options[CONF_NAME])
