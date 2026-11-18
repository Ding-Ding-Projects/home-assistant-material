"""Config flow of Heat Defender: the sister of AC Defender."""

from typing import Any

import probatio

from homeassistant.components.ac_defender.config_flow import (
    SENSOR_KEYS,
    ACDefenderConfigFlow,
    sensors_schema,
    temperature_error,
)
from homeassistant.components.ac_defender.const import (
    CONF_CLIMATE,
    CONF_FLOOR,
    CONF_FREEZE_RULE,
    CONF_HEAT_CAP,
    CONF_HEAT_MODE,
    CONF_PLAIN_LOG,
    CONF_POWER_KW,
    CONF_SAFETY_TEMPERATURE,
    DEFAULT_FLOOR,
    HARD_FLOOR,
    HEAT_MODE_CAP,
    HEAT_MODE_OFF,
)
from homeassistant.components.ac_defender.siblings import sibling_band_error
from homeassistant.components.climate import DOMAIN as CLIMATE_DOMAIN, HVACMode
from homeassistant.config_entries import ConfigEntry, OptionsFlow
from homeassistant.core import callback
from homeassistant.helpers import selector

from .const import DOMAIN

DEFAULT_CAP = 22.0
DEFAULT_TOO_WARM = 26.0


def floor_error(floor: float, cap: float, mode: str) -> str | None:
    """Return an error key when the floor is not allowed."""
    if floor < HARD_FLOOR:
        return "floor_too_low"
    if mode == HEAT_MODE_CAP and floor >= cap:
        return "floor_above_cap"
    return None


def _number(low: float, high: float) -> selector.NumberSelector:
    return selector.NumberSelector(
        selector.NumberSelectorConfig(
            min=low,
            max=high,
            step=0.5,
            unit_of_measurement="°C",
            mode=selector.NumberSelectorMode.SLIDER,
        )
    )


def heat_schema(defaults: dict[str, Any], *, with_unit: bool) -> probatio.Schema:
    """Return the heat fields: the mode, the cap, the floor and the freezing rule."""
    fields: dict[Any, Any] = {}
    if with_unit:
        fields[
            probatio.Required(
                CONF_CLIMATE, default=defaults.get(CONF_CLIMATE, probatio.UNDEFINED)
            )
        ] = selector.EntitySelector(
            selector.EntitySelectorConfig(domain=[CLIMATE_DOMAIN])
        )
    fields[
        probatio.Required(
            CONF_HEAT_MODE, default=defaults.get(CONF_HEAT_MODE, HEAT_MODE_OFF)
        )
    ] = selector.SelectSelector(
        selector.SelectSelectorConfig(
            options=[HEAT_MODE_OFF, HEAT_MODE_CAP],
            translation_key="heat_mode",
            mode=selector.SelectSelectorMode.LIST,
        )
    )
    fields[
        probatio.Required(
            CONF_HEAT_CAP, default=defaults.get(CONF_HEAT_CAP, DEFAULT_CAP)
        )
    ] = _number(HARD_FLOOR, 35)
    fields[
        probatio.Required(CONF_FLOOR, default=defaults.get(CONF_FLOOR, DEFAULT_FLOOR))
    ] = _number(HARD_FLOOR, 24)
    fields[
        probatio.Required(
            CONF_FREEZE_RULE, default=defaults.get(CONF_FREEZE_RULE, True)
        )
    ] = selector.BooleanSelector()
    fields[
        probatio.Required(
            CONF_SAFETY_TEMPERATURE,
            default=defaults.get(CONF_SAFETY_TEMPERATURE, DEFAULT_TOO_WARM),
        )
    ] = _number(15, 40)
    return probatio.Schema(fields)


def heat_errors(
    hass: Any,
    user_input: dict[str, Any],
    climate: str,
    skip_entry_id: str | None = None,
) -> dict[str, str]:
    """Validate the heat fields."""
    errors: dict[str, str] = {}
    state = hass.states.get(climate)
    if state is None:
        errors[CONF_CLIMATE] = "entity_not_found"
        return errors
    if HVACMode.HEAT not in (state.attributes.get("hvac_modes") or []):
        errors[CONF_CLIMATE] = "cannot_heat"
    mode, cap, floor = (
        user_input[CONF_HEAT_MODE],
        user_input[CONF_HEAT_CAP],
        user_input[CONF_FLOOR],
    )
    if error := floor_error(floor, cap, mode):
        errors[CONF_FLOOR] = error
    elif mode == HEAT_MODE_CAP and (error := temperature_error(hass, climate, cap)):
        errors[CONF_HEAT_CAP] = error
    if not errors and (
        band := sibling_band_error(
            hass,
            "heat",
            climate,
            cap,
            heat_mode=mode,
            floor=floor,
            skip_entry_id=skip_entry_id,
        )
    ):
        errors[CONF_HEAT_CAP] = band
    return errors


class HeatDefenderConfigFlow(ACDefenderConfigFlow, domain=DOMAIN):
    """Same three steps as the brother, with the heat fields."""

    VERSION = 1
    run_mode = "heat"

    def _needs(self) -> HVACMode:
        return HVACMode.HEAT

    def _unit_schema(self, defaults: dict[str, Any]) -> probatio.Schema:
        return heat_schema(defaults, with_unit=True)

    def _validate_unit(self, user_input: dict[str, Any]) -> dict[str, str]:
        return heat_errors(self.hass, user_input, user_input[CONF_CLIMATE])

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        """Return the options flow."""
        return HeatOptionsFlow()


class HeatOptionsFlow(OptionsFlow):
    """Change the heat fields and the sensors."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> Any:
        """Change the mode, the cap, the floor and the sensors."""
        entry = self.config_entry
        defaults = {**entry.data, **entry.options}
        errors: dict[str, str] = {}
        if user_input is not None:
            errors = heat_errors(
                self.hass, user_input, entry.data[CONF_CLIMATE], entry.entry_id
            )
            if not errors:
                cleared = dict.fromkeys((*SENSOR_KEYS, CONF_POWER_KW))
                return self.async_create_entry(
                    data={**entry.options, **cleared, **user_input}
                )
        schema = heat_schema(defaults, with_unit=False).extend(
            sensors_schema(defaults).schema
        )
        schema = schema.extend(
            {
                probatio.Optional(
                    CONF_PLAIN_LOG, default=defaults.get(CONF_PLAIN_LOG, False)
                ): selector.BooleanSelector()
            }
        )
        return self.async_show_form(step_id="init", data_schema=schema, errors=errors)
