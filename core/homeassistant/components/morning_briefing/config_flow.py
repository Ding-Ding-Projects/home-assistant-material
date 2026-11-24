"""Config and options flow for the Morning briefing helper."""

from collections.abc import Mapping
from typing import Any, cast, override

import probatio

from homeassistant.components.binary_sensor import DOMAIN as BINARY_SENSOR_DOMAIN
from homeassistant.components.sensor import DOMAIN as SENSOR_DOMAIN
from homeassistant.components.weather import DOMAIN as WEATHER_DOMAIN
from homeassistant.const import CONF_NAME
from homeassistant.helpers import selector
from homeassistant.helpers.schema_config_entry_flow import (
    SchemaCommonFlowHandler,
    SchemaConfigFlowHandler,
    SchemaFlowFormStep,
)

from .const import (
    CONF_EXTRA,
    CONF_NOTIFY,
    CONF_TIME,
    CONF_TRANSIT,
    CONF_WEATHER,
    DEFAULT_TIME,
    DOMAIN,
)


async def _options_schema(handler: SchemaCommonFlowHandler) -> probatio.Schema:
    hass = handler.parent_handler.hass
    services = sorted(hass.services.async_services_for_domain("notify"))
    return probatio.Schema(
        {
            probatio.Required(CONF_TIME, default=DEFAULT_TIME): selector.TimeSelector(),
            probatio.Optional(CONF_NOTIFY, default=[]): selector.SelectSelector(
                selector.SelectSelectorConfig(
                    options=[f"notify.{service}" for service in services],
                    multiple=True,
                    custom_value=True,
                    mode=selector.SelectSelectorMode.DROPDOWN,
                )
            ),
            probatio.Optional(CONF_WEATHER): selector.EntitySelector(
                selector.EntitySelectorConfig(domain=WEATHER_DOMAIN)
            ),
            probatio.Optional(CONF_TRANSIT, default=[]): selector.EntitySelector(
                selector.EntitySelectorConfig(
                    domain=[SENSOR_DOMAIN, BINARY_SENSOR_DOMAIN], multiple=True
                )
            ),
            probatio.Optional(CONF_EXTRA, default=[]): selector.EntitySelector(
                selector.EntitySelectorConfig(multiple=True)
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
    """Handle a config or options flow for Morning briefing."""

    config_flow = CONFIG_FLOW
    options_flow = OPTIONS_FLOW
    options_flow_reloads = True

    @override
    def async_config_entry_title(self, options: Mapping[str, Any]) -> str:
        """Return config entry title."""
        return cast(str, options[CONF_NAME])
