"""Config and options flow for the Safety cutoff helper."""

from collections.abc import Mapping
from typing import Any, cast, override

import probatio

from homeassistant.components.binary_sensor import DOMAIN as BINARY_SENSOR_DOMAIN
from homeassistant.components.input_boolean import DOMAIN as INPUT_BOOLEAN_DOMAIN
from homeassistant.components.light import DOMAIN as LIGHT_DOMAIN
from homeassistant.components.sensor import DOMAIN as SENSOR_DOMAIN, SensorDeviceClass
from homeassistant.components.switch import DOMAIN as SWITCH_DOMAIN
from homeassistant.const import CONF_NAME
from homeassistant.helpers import selector
from homeassistant.helpers.schema_config_entry_flow import (
    SchemaCommonFlowHandler,
    SchemaConfigFlowHandler,
    SchemaFlowError,
    SchemaFlowFormStep,
)

from .const import (
    CONF_CUT_ON_POWER,
    CONF_LEAKS,
    CONF_NOTIFY,
    CONF_POWER_LIMIT,
    CONF_POWER_SECONDS,
    CONF_POWER_SENSOR,
    CONF_SWITCHES,
    DEFAULT_POWER_LIMIT,
    DEFAULT_POWER_SECONDS,
    DOMAIN,
)

NOTIFY_DOMAIN = "notify"


async def _options_schema(handler: SchemaCommonFlowHandler) -> probatio.Schema:
    hass = handler.parent_handler.hass
    services = hass.services.async_services_for_domain(NOTIFY_DOMAIN)
    notify_options: list[selector.SelectOptionDict] = [
        {"value": f"{NOTIFY_DOMAIN}.{service}", "label": f"{NOTIFY_DOMAIN}.{service}"}
        for service in sorted(services)
    ]
    return probatio.Schema(
        {
            probatio.Required(CONF_LEAKS): selector.EntitySelector(
                selector.EntitySelectorConfig(
                    domain=BINARY_SENSOR_DOMAIN, multiple=True
                )
            ),
            probatio.Required(CONF_SWITCHES): selector.EntitySelector(
                selector.EntitySelectorConfig(
                    domain=[SWITCH_DOMAIN, LIGHT_DOMAIN, INPUT_BOOLEAN_DOMAIN],
                    multiple=True,
                )
            ),
            probatio.Optional(CONF_POWER_SENSOR): selector.EntitySelector(
                selector.EntitySelectorConfig(
                    domain=SENSOR_DOMAIN, device_class=SensorDeviceClass.POWER
                )
            ),
            probatio.Optional(
                CONF_POWER_LIMIT, default=DEFAULT_POWER_LIMIT
            ): selector.NumberSelector(
                selector.NumberSelectorConfig(
                    min=1,
                    max=20000,
                    step=1,
                    unit_of_measurement="W",
                    mode=selector.NumberSelectorMode.BOX,
                )
            ),
            probatio.Optional(
                CONF_POWER_SECONDS, default=DEFAULT_POWER_SECONDS
            ): selector.NumberSelector(
                selector.NumberSelectorConfig(
                    min=1,
                    max=3600,
                    step=1,
                    unit_of_measurement="s",
                    mode=selector.NumberSelectorMode.BOX,
                )
            ),
            probatio.Optional(
                CONF_CUT_ON_POWER, default=True
            ): selector.BooleanSelector(),
            probatio.Optional(CONF_NOTIFY, default=[]): selector.SelectSelector(
                selector.SelectSelectorConfig(
                    options=notify_options,
                    multiple=True,
                    custom_value=True,
                    mode=selector.SelectSelectorMode.DROPDOWN,
                )
            ),
        }
    )


async def _config_schema(handler: SchemaCommonFlowHandler) -> probatio.Schema:
    return probatio.Schema(
        {probatio.Required(CONF_NAME): selector.TextSelector()}
    ).extend((await _options_schema(handler)).schema)


async def _validate(
    handler: SchemaCommonFlowHandler, user_input: dict[str, Any]
) -> dict[str, Any]:
    if not user_input[CONF_LEAKS]:
        raise SchemaFlowError("leaks_required")
    if not user_input[CONF_SWITCHES]:
        raise SchemaFlowError("switches_required")
    return user_input


CONFIG_FLOW = {
    "user": SchemaFlowFormStep(_config_schema, validate_user_input=_validate)
}
OPTIONS_FLOW = {
    "init": SchemaFlowFormStep(_options_schema, validate_user_input=_validate)
}


class ConfigFlowHandler(SchemaConfigFlowHandler, domain=DOMAIN):
    """Handle a config or options flow for Safety cutoff."""

    config_flow = CONFIG_FLOW
    options_flow = OPTIONS_FLOW
    options_flow_reloads = True

    @override
    def async_config_entry_title(self, options: Mapping[str, Any]) -> str:
        """Return config entry title."""
        return cast(str, options[CONF_NAME])
