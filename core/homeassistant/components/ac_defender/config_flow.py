"""Config flow of AC Defender (and the base the Heat Defender flow builds on)."""

from typing import Any

import probatio

from homeassistant.components.climate import (
    ATTR_MAX_TEMP,
    ATTR_MIN_TEMP,
    DOMAIN as CLIMATE_DOMAIN,
    HVACMode,
)
from homeassistant.config_entries import (
    ConfigEntry,
    ConfigFlow,
    ConfigFlowResult,
    OptionsFlow,
)
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import selector

from .const import (
    CONF_CLIMATE,
    CONF_DOOR_SENSOR,
    CONF_ENABLED_GUARDS,
    CONF_GUARDS,
    CONF_MY_TEMPERATURE,
    CONF_OUTDOOR,
    CONF_PLAIN_LOG,
    CONF_POWER_KW,
    CONF_PRESENCE,
    CONF_ROOM_SENSOR,
    CONF_SAFETY_TEMPERATURE,
    DEFAULT_MY_TEMPERATURE,
    DEFAULT_SAFETY_TEMPERATURE,
    DOMAIN,
)
from .guards import guards_for
from .siblings import sibling_band_error

SENSOR_KEYS = (CONF_ROOM_SENSOR, CONF_DOOR_SENSOR, CONF_PRESENCE, CONF_OUTDOOR)


def _entity(*domains: str, device_class: list[str] | None = None) -> Any:
    config = selector.EntitySelectorConfig(domain=list(domains))
    if device_class:
        config["device_class"] = device_class
    return selector.EntitySelector(config)


def sensors_schema(defaults: dict[str, Any]) -> probatio.Schema:
    """Return the optional sensor fields."""

    def opt(key: str, sel: Any) -> tuple[Any, Any]:
        value = defaults.get(key)
        marker = (
            probatio.Optional(key, description={"suggested_value": value})
            if value
            else probatio.Optional(key)
        )
        return marker, sel

    return probatio.Schema(
        dict(
            [
                opt(
                    CONF_ROOM_SENSOR,
                    _entity("sensor", device_class=["temperature"]),
                ),
                opt(CONF_DOOR_SENSOR, _entity("binary_sensor")),
                opt(
                    CONF_PRESENCE, _entity("binary_sensor", "person", "device_tracker")
                ),
                opt(CONF_OUTDOOR, _entity("sensor", "weather")),
                opt(
                    CONF_POWER_KW,
                    selector.NumberSelector(
                        selector.NumberSelectorConfig(
                            min=0.1,
                            max=50,
                            step=0.1,
                            unit_of_measurement="kW",
                            mode=selector.NumberSelectorMode.BOX,
                        )
                    ),
                ),
            ]
        )
    )


def guard_choices(run_mode: str) -> tuple[list[str], list[str]]:
    """Return the guards that can be chosen at the start and those on by default."""
    chosen = [g.spec.key for g in guards_for(run_mode) if not g.spec.safety]
    default_on = [
        g.spec.key
        for g in guards_for(run_mode)
        if not g.spec.safety and g.spec.default_on
    ]
    return chosen, default_on


def guards_options(run_mode: str, enabled: list[str]) -> dict[str, dict[str, bool]]:
    """Return the stored guard choices; safety guards always start on."""
    return {
        g.spec.key: {"enabled": g.spec.safety or g.spec.key in enabled}
        for g in guards_for(run_mode)
    }


def climate_error(hass: HomeAssistant, entity_id: str, needs: HVACMode) -> str | None:
    """Return an error key when the climate entity cannot be defended."""
    state = hass.states.get(entity_id)
    if state is None:
        return "entity_not_found"
    if needs not in (state.attributes.get("hvac_modes") or []):
        return "cannot_cool" if needs == HVACMode.COOL else "cannot_heat"
    return None


def temperature_error(hass: HomeAssistant, entity_id: str, value: float) -> str | None:
    """Return an error key when a temperature is outside the device limits."""
    state = hass.states.get(entity_id)
    if state is None:
        return None
    low = state.attributes.get(ATTR_MIN_TEMP)
    high = state.attributes.get(ATTR_MAX_TEMP)
    if low is not None and value < float(low):
        return "temperature_too_low"
    if high is not None and value > float(high):
        return "temperature_too_high"
    return None


class ACDefenderConfigFlow(ConfigFlow, domain=DOMAIN):
    """Three steps: the unit, the optional sensors, the guards."""

    VERSION = 1
    run_mode = "cool"

    def __init__(self) -> None:
        """Start empty."""
        self._data: dict[str, Any] = {}

    def _needs(self) -> HVACMode:
        return HVACMode.COOL

    def _unit_schema(self, defaults: dict[str, Any]) -> probatio.Schema:
        return probatio.Schema(
            {
                probatio.Required(
                    CONF_CLIMATE, default=defaults.get(CONF_CLIMATE, probatio.UNDEFINED)
                ): _entity(CLIMATE_DOMAIN),
                probatio.Required(
                    CONF_MY_TEMPERATURE,
                    default=defaults.get(CONF_MY_TEMPERATURE, DEFAULT_MY_TEMPERATURE),
                ): selector.NumberSelector(
                    selector.NumberSelectorConfig(
                        min=7,
                        max=35,
                        step=0.5,
                        unit_of_measurement="°C",
                        mode=selector.NumberSelectorMode.SLIDER,
                    )
                ),
                probatio.Required(
                    CONF_SAFETY_TEMPERATURE,
                    default=defaults.get(
                        CONF_SAFETY_TEMPERATURE, DEFAULT_SAFETY_TEMPERATURE
                    ),
                ): selector.NumberSelector(
                    selector.NumberSelectorConfig(
                        min=15,
                        max=40,
                        step=0.5,
                        unit_of_measurement="°C",
                        mode=selector.NumberSelectorMode.SLIDER,
                    )
                ),
            }
        )

    def _validate_unit(self, user_input: dict[str, Any]) -> dict[str, str]:
        errors: dict[str, str] = {}
        entity_id = user_input[CONF_CLIMATE]
        if error := climate_error(self.hass, entity_id, self._needs()):
            errors[CONF_CLIMATE] = error
        elif error := temperature_error(
            self.hass, entity_id, user_input[CONF_MY_TEMPERATURE]
        ):
            errors[CONF_MY_TEMPERATURE] = error
        if (
            CONF_MY_TEMPERATURE not in errors
            and user_input[CONF_SAFETY_TEMPERATURE] <= user_input[CONF_MY_TEMPERATURE]
        ):
            errors[CONF_SAFETY_TEMPERATURE] = "safety_below_target"
        if not errors and (
            band := sibling_band_error(
                self.hass, "ac", entity_id, user_input[CONF_MY_TEMPERATURE]
            )
        ):
            errors[CONF_MY_TEMPERATURE] = band
        return errors

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Choose the unit, my temperature and the safety temperature."""
        errors: dict[str, str] = {}
        if user_input is not None:
            errors = self._validate_unit(user_input)
            if not errors:
                await self.async_set_unique_id(user_input[CONF_CLIMATE])
                self._abort_if_unique_id_configured()
                self._data.update(user_input)
                return await self.async_step_sensors()
        return self.async_show_form(
            step_id="user",
            data_schema=self.add_suggested_values_to_schema(
                self._unit_schema(user_input or {}), user_input
            ),
            errors=errors,
        )

    async def async_step_sensors(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Choose the optional sensors."""
        if user_input is not None:
            self._data.update(user_input)
            return await self.async_step_guards()
        return self.async_show_form(step_id="sensors", data_schema=sensors_schema({}))

    async def async_step_guards(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Choose which guards start on."""
        chosen, default_on = guard_choices(self.run_mode)
        if user_input is not None:
            title = self.hass.states.get(self._data[CONF_CLIMATE])
            name = title.name if title else self._data[CONF_CLIMATE]
            return self.async_create_entry(
                title=name,
                data=self._data,
                options={
                    CONF_GUARDS: guards_options(
                        self.run_mode, user_input[CONF_ENABLED_GUARDS]
                    )
                },
            )
        return self.async_show_form(
            step_id="guards",
            data_schema=probatio.Schema(
                {
                    probatio.Required(
                        CONF_ENABLED_GUARDS, default=default_on
                    ): selector.SelectSelector(
                        selector.SelectSelectorConfig(
                            options=chosen,
                            multiple=True,
                            translation_key="guard",
                            mode=selector.SelectSelectorMode.LIST,
                        )
                    )
                }
            ),
        )

    async def async_step_reconfigure(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Change the unit and the sensors of an existing entry."""
        entry = self._get_reconfigure_entry()
        errors: dict[str, str] = {}
        if user_input is not None:
            errors = self._validate_unit(user_input)
            if not errors:
                await self.async_set_unique_id(user_input[CONF_CLIMATE])
                self._abort_if_unique_id_mismatch()
                self._data = {**entry.data, **user_input}
                return await self.async_step_reconfigure_sensors()
        defaults = {**entry.data, **entry.options}
        return self.async_show_form(
            step_id="reconfigure",
            data_schema=self._unit_schema(defaults),
            errors=errors,
        )

    async def async_step_reconfigure_sensors(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Change the optional sensors."""
        entry = self._get_reconfigure_entry()
        if user_input is not None:
            data = {k: v for k, v in self._data.items() if k not in SENSOR_KEYS}
            data.update(user_input)
            return self.async_update_reload_and_abort(
                entry, data=data, options={**entry.options}
            )
        return self.async_show_form(
            step_id="reconfigure_sensors",
            data_schema=sensors_schema({**entry.data, **entry.options}),
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        """Return the options flow."""
        return DefenderOptionsFlow()


class DefenderOptionsFlow(OptionsFlow):
    """Change the temperatures, the sensors and which guards are on."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> Any:
        """Change the temperatures and the sensors."""
        entry = self.config_entry
        errors: dict[str, str] = {}
        defaults = {**entry.data, **entry.options}
        if user_input is not None:
            errors = _options_errors(self.hass, entry, user_input)
            if not errors:
                cleared = dict.fromkeys((*SENSOR_KEYS, CONF_POWER_KW))
                return self.async_create_entry(
                    data={**entry.options, **cleared, **user_input}
                )
        schema = probatio.Schema(
            {
                probatio.Required(
                    CONF_MY_TEMPERATURE,
                    default=defaults.get(CONF_MY_TEMPERATURE, DEFAULT_MY_TEMPERATURE),
                ): selector.NumberSelector(
                    selector.NumberSelectorConfig(
                        min=7,
                        max=35,
                        step=0.5,
                        unit_of_measurement="°C",
                        mode=selector.NumberSelectorMode.SLIDER,
                    )
                ),
                probatio.Required(
                    CONF_SAFETY_TEMPERATURE,
                    default=defaults.get(
                        CONF_SAFETY_TEMPERATURE, DEFAULT_SAFETY_TEMPERATURE
                    ),
                ): selector.NumberSelector(
                    selector.NumberSelectorConfig(
                        min=15,
                        max=40,
                        step=0.5,
                        unit_of_measurement="°C",
                        mode=selector.NumberSelectorMode.SLIDER,
                    )
                ),
            }
        ).extend(sensors_schema(defaults).schema)
        schema = schema.extend(
            {
                probatio.Optional(
                    CONF_PLAIN_LOG, default=defaults.get(CONF_PLAIN_LOG, False)
                ): selector.BooleanSelector()
            }
        )
        return self.async_show_form(step_id="init", data_schema=schema, errors=errors)


def _options_errors(
    hass: HomeAssistant, entry: ConfigEntry, user_input: dict[str, Any]
) -> dict[str, str]:
    errors: dict[str, str] = {}
    climate = entry.data[CONF_CLIMATE]
    if error := temperature_error(hass, climate, user_input[CONF_MY_TEMPERATURE]):
        errors[CONF_MY_TEMPERATURE] = error
    elif user_input[CONF_SAFETY_TEMPERATURE] <= user_input[CONF_MY_TEMPERATURE]:
        errors[CONF_SAFETY_TEMPERATURE] = "safety_below_target"
    elif band := sibling_band_error(
        hass,
        "ac",
        climate,
        user_input[CONF_MY_TEMPERATURE],
        skip_entry_id=entry.entry_id,
    ):
        errors[CONF_MY_TEMPERATURE] = band
    return errors
