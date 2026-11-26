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
from .discovery import CONF_MODEL, async_find_printers
from .link import CannotConnect, InvalidAuth, check_connection

ACCESS_CODE_SELECTOR = TextSelector(TextSelectorConfig(type=TextSelectorType.PASSWORD))


class PrinterDoorConfigFlow(ConfigFlow, domain=DOMAIN):
    """Ask for the printer's address, serial number and LAN access code."""

    VERSION = 1

    _discovered: dict[str, Any]

    @override
    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Choose between listening for announcements and entering an address."""
        return self.async_show_menu(step_id="user", menu_options=["search", "manual"])

    async def async_step_search(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Listen briefly, then let the owner choose a printer or enter its address."""
        if user_input is None:
            self._candidates = {
                printer.serial: printer
                for printer in await async_find_printers(self.hass)
                if not self.hass.config_entries.async_entry_for_domain_unique_id(
                    DOMAIN, printer.serial
                )
            }
        elif user_input["printer"] == "__manual__":
            return await self.async_step_manual()
        else:
            printer = self._candidates[user_input["printer"]]
            return await self.async_step_integration_discovery(
                {
                    CONF_HOST: printer.host,
                    CONF_SERIAL: printer.serial,
                    CONF_MODEL: printer.model,
                    CONF_NAME: printer.name,
                }
            )
        options = {
            serial: f"{printer.name or printer.model or serial} ({serial}, {printer.host})"
            for serial, printer in self._candidates.items()
        }
        options["__manual__"] = "Enter address manually"
        return self.async_show_form(
            step_id="search",
            data_schema=probatio.Schema(
                {probatio.Required("printer"): probatio.In(options)}
            ),
            description_placeholders={"count": str(len(self._candidates))},
        )

    async def async_step_manual(
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
            if "base" in errors:
                errors[CONF_HOST] = errors.pop("base")
            if not errors:
                if user_input.get("test_only"):
                    self._tested = {**user_input, CONF_SERIAL: serial}
                    return await self.async_step_tested()
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
                probatio.Optional("test_only", default=False): bool,
                probatio.Required(CONF_ACCESS_CODE): ACCESS_CODE_SELECTOR,
            }
        )
        return self.async_show_form(
            step_id="manual",
            data_schema=self.add_suggested_values_to_schema(schema, user_input),
            errors=errors,
        )

    async def async_step_tested(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Create an entry only after the owner accepts the successful check."""
        if user_input is not None:
            self._abort_if_unique_id_configured()
            return self.async_create_entry(
                title=self._tested[CONF_NAME],
                data={
                    key: self._tested[key]
                    for key in (CONF_HOST, CONF_SERIAL, CONF_ACCESS_CODE)
                },
            )
        return self.async_show_form(
            step_id="tested",
            data_schema=probatio.Schema({}),
            description_placeholders={"host": self._tested[CONF_HOST]},
        )

    @override
    async def async_step_integration_discovery(
        self, discovery_info: dict[str, Any]
    ) -> ConfigFlowResult:
        """Offer a printer found on the network."""
        serial = discovery_info[CONF_SERIAL]
        host = discovery_info[CONF_HOST]
        await self.async_set_unique_id(serial)
        self._abort_if_unique_id_configured(updates={CONF_HOST: host})
        self._discovered = discovery_info
        name = discovery_info.get(CONF_NAME) or discovery_info.get(CONF_MODEL) or serial
        self.context["title_placeholders"] = {"name": name}
        return await self.async_step_discovery_confirm()

    async def async_step_discovery_confirm(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Ask only for the access code and the name."""
        errors: dict[str, str] = {}
        host = self._discovered[CONF_HOST]
        serial = self._discovered[CONF_SERIAL]
        if user_input is not None:
            errors = await self._async_validate(host, user_input[CONF_ACCESS_CODE])
            if not errors:
                return self.async_create_entry(
                    title=user_input[CONF_NAME],
                    data={
                        CONF_HOST: host,
                        CONF_SERIAL: serial,
                        CONF_ACCESS_CODE: user_input[CONF_ACCESS_CODE],
                    },
                )
        default_name = self._discovered.get(CONF_NAME) or "3D printer"
        schema = probatio.Schema(
            {
                probatio.Required(CONF_NAME, default=default_name): str,
                probatio.Required(CONF_ACCESS_CODE): ACCESS_CODE_SELECTOR,
            }
        )
        return self.async_show_form(
            step_id="discovery_confirm",
            data_schema=self.add_suggested_values_to_schema(schema, user_input),
            errors=errors,
            description_placeholders={
                "name": self.context["title_placeholders"]["name"],
                "model": self._discovered.get(CONF_MODEL) or "-",
                "host": host,
                "serial": serial,
            },
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
