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
    SchemaConfigFlowHandler,
    SchemaFlowFormStep,
)

from .const import (
    CONF_DOORS,
    CONF_HOURS,
    CONF_PLUG,
    CONF_START,
    DEFAULT_HOURS,
    DEFAULT_START,
    DOMAIN,
)

OPTIONS_SCHEMA = probatio.Schema(
    {
        probatio.Required(CONF_PLUG): selector.EntitySelector(
            selector.EntitySelectorConfig(
                domain=[SWITCH_DOMAIN, LIGHT_DOMAIN, INPUT_BOOLEAN_DOMAIN]
            )
        ),
        probatio.Required(CONF_START, default=DEFAULT_START): selector.TimeSelector(),
        probatio.Required(CONF_HOURS, default=DEFAULT_HOURS): selector.NumberSelector(
            selector.NumberSelectorConfig(
                min=0.5,
                max=24,
                step=0.5,
                unit_of_measurement="h",
                mode=selector.NumberSelectorMode.BOX,
            )
        ),
        probatio.Optional(CONF_DOORS, default=[]): selector.EntitySelector(
            selector.EntitySelectorConfig(domain=BINARY_SENSOR_DOMAIN, multiple=True)
        ),
    }
)

CONFIG_SCHEMA = probatio.Schema(
    {probatio.Required(CONF_NAME): selector.TextSelector()}
).extend(OPTIONS_SCHEMA.schema)

CONFIG_FLOW = {"user": SchemaFlowFormStep(CONFIG_SCHEMA)}
OPTIONS_FLOW = {"init": SchemaFlowFormStep(OPTIONS_SCHEMA)}


class ConfigFlowHandler(SchemaConfigFlowHandler, domain=DOMAIN):
    """Handle a config or options flow for Grow light."""

    config_flow = CONFIG_FLOW
    options_flow = OPTIONS_FLOW
    options_flow_reloads = True

    @override
    def async_config_entry_title(self, options: Mapping[str, Any]) -> str:
        """Return config entry title."""
        return cast(str, options[CONF_NAME])
