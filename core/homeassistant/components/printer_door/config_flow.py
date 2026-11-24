"""Config flow for the Printer door integration."""

from collections.abc import Mapping
from typing import Any, override

import probatio

from homeassistant.config_entries import ConfigFlow, ConfigFlowResult
from homeassistant.const import CONF_HOST, CONF_NAME
from homeassistant.helpers.selector import (
    TextSelector,
    TextSelectorConfig,
    TextSelectorType,
)

from .const import CONF_ACCESS_CODE, CONF_SERIAL, DOMAIN
from .link import CannotConnect, InvalidAuth, check_connection

ACCESS_CODE_SELECTOR = TextSelector(TextSelectorConfig(type=TextSelectorType.PASSWORD))


class PrinterDoorConfigFlow(ConfigFlow, domain=DOMAIN):
    """Ask for the printer's address, serial number and LAN access code."""

    VERSION = 1

    @override
    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Handle the first step."""
        errors: dict[str, str] = {}
        if user_input is not None:
            serial = user_input[CONF_SERIAL].strip()
            await self.async_set_unique_id(serial)
            self._abort_if_unique_id_configured()
            errors = await self._async_validate(
                user_input[CONF_HOST], user_input[CONF_ACCESS_CODE]
            )
            if not errors:
                return self.async_create_entry(
                    title=user_input[CONF_NAME],
                    data={
                        CONF_HOST: user_input[CONF_HOST],
                        CONF_SERIAL: serial,
                        CONF_ACCESS_CODE: user_input[CONF_ACCESS_CODE],
                    },
                )
        schema = probatio.Schema(
            {
                probatio.Required(CONF_NAME, default="3D printer"): str,
                probatio.Required(CONF_HOST): str,
                probatio.Required(CONF_SERIAL): str,
                probatio.Required(CONF_ACCESS_CODE): ACCESS_CODE_SELECTOR,
            }
        )
        return self.async_show_form(
            step_id="user",
            data_schema=self.add_suggested_values_to_schema(schema, user_input),
            errors=errors,
        )

    async def async_step_reauth(
        self, entry_data: Mapping[str, Any]
    ) -> ConfigFlowResult:
        """Start reauthentication after the printer refused the access code."""
        return await self.async_step_reauth_confirm()

    async def async_step_reauth_confirm(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Ask for the new access code."""
        errors: dict[str, str] = {}
        entry = self._get_reauth_entry()
        if user_input is not None:
            errors = await self._async_validate(
                entry.data[CONF_HOST], user_input[CONF_ACCESS_CODE]
            )
            if not errors:
                return self.async_update_reload_and_abort(
                    entry,
                    data_updates={CONF_ACCESS_CODE: user_input[CONF_ACCESS_CODE]},
                )
        return self.async_show_form(
            step_id="reauth_confirm",
            data_schema=probatio.Schema(
                {probatio.Required(CONF_ACCESS_CODE): ACCESS_CODE_SELECTOR}
            ),
            errors=errors,
        )

    async def _async_validate(self, host: str, access_code: str) -> dict[str, str]:
        """Connect once and map failures to form errors."""
        try:
            await self.hass.async_add_executor_job(check_connection, host, access_code)
        except CannotConnect:
            return {"base": "cannot_connect"}
        except InvalidAuth:
            return {CONF_ACCESS_CODE: "invalid_auth"}
        return {}
