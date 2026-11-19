"""Config flow for the TTC transit integration."""

from typing import Any, override

import probatio

from homeassistant.config_entries import (
    SOURCE_RECONFIGURE,
    ConfigEntry,
    ConfigFlow,
    ConfigFlowResult,
    OptionsFlowWithReload,
)
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.selector import (
    BooleanSelector,
    SelectOptionDict,
    SelectSelector,
    SelectSelectorConfig,
    SelectSelectorMode,
)

from .api import TTCClient, TTCError, TTCInvalidStopError, route_name
from .const import (
    CONF_ROUTES,
    CONF_STATIONS,
    CONF_STOPS,
    CONF_WATCH_ALERTS,
    CONF_WATCH_DEPARTURES,
    CONF_WATCH_LIFTS,
    DOMAIN,
    LOGGER,
    STATIONS,
    SUBWAY_LINES,
)

TITLE = "TTC transit"
MAX_ROUTES_FOR_STOP_LIST = 8

WATCH_SCHEMA = probatio.Schema(
    {
        probatio.Required(CONF_WATCH_ALERTS, default=True): BooleanSelector(),
        probatio.Required(CONF_WATCH_LIFTS, default=True): BooleanSelector(),
        probatio.Required(CONF_WATCH_DEPARTURES, default=True): BooleanSelector(),
    }
)


class _TTCSteps:
    """Steps shared by setup, reconfiguration and options."""

    hass: HomeAssistant
    _settings: dict[str, Any]

    def _client(self) -> TTCClient:
        return TTCClient(async_get_clientsession(self.hass))

    async def _route_options(self) -> tuple[list[SelectOptionDict], bool]:
        """Return the routes to choose from, and whether the list was read."""
        options = [
            SelectOptionDict(value=route, label=name)
            for route, name in SUBWAY_LINES.items()
        ]
        try:
            titles = await self._client().async_get_routes()
        except TTCError as err:
            LOGGER.debug("Route list could not be read: %s", err)
            return options, False
        options.extend(
            SelectOptionDict(value=route, label=route_name(route, titles))
            for route in sorted(titles, key=lambda tag: (len(tag), tag))
            if route not in SUBWAY_LINES
        )
        return options, True

    async def _routes_schema(self) -> tuple[probatio.Schema, dict[str, str]]:
        errors: dict[str, str] = {}
        fields: dict[Any, Any] = {}
        if self._settings.get(CONF_WATCH_ALERTS) or self._settings.get(
            CONF_WATCH_DEPARTURES
        ):
            options, read = await self._route_options()
            if not read:
                errors["base"] = "routes_unavailable"
            fields[
                probatio.Optional(
                    CONF_ROUTES, default=self._settings.get(CONF_ROUTES, [])
                )
            ] = SelectSelector(
                SelectSelectorConfig(
                    options=options,
                    multiple=True,
                    mode=SelectSelectorMode.DROPDOWN,
                )
            )
        if self._settings.get(CONF_WATCH_LIFTS):
            fields[
                probatio.Optional(
                    CONF_STATIONS, default=self._settings.get(CONF_STATIONS, [])
                )
            ] = SelectSelector(
                SelectSelectorConfig(
                    options=list(STATIONS),
                    multiple=True,
                    custom_value=True,
                    mode=SelectSelectorMode.DROPDOWN,
                )
            )
        return probatio.Schema(fields), errors

    def _check_routes(self, user_input: dict[str, Any]) -> dict[str, str]:
        if self._settings.get(CONF_WATCH_LIFTS) and not user_input.get(CONF_STATIONS):
            return {CONF_STATIONS: "no_stations"}
        return {}

    async def _stop_options(self) -> list[SelectOptionDict]:
        client = self._client()
        surface = [
            route
            for route in self._settings.get(CONF_ROUTES, [])
            if route not in SUBWAY_LINES
        ][:MAX_ROUTES_FOR_STOP_LIST]
        seen: dict[str, SelectOptionDict] = {}
        for route in surface:
            try:
                stops = await client.async_get_route_stops(route)
            except TTCError as err:
                LOGGER.debug("Stops of route %s could not be read: %s", route, err)
                continue
            for stop in stops:
                seen.setdefault(
                    stop.stop,
                    SelectOptionDict(
                        value=stop.stop, label=f"{stop.title} · stop {stop.stop}"
                    ),
                )
        for stop in self._settings.get(CONF_STOPS, []):
            seen.setdefault(stop, SelectOptionDict(value=stop, label=f"Stop {stop}"))
        return list(seen.values())

    async def _stops_schema(self) -> probatio.Schema:
        return probatio.Schema(
            {
                probatio.Optional(
                    CONF_STOPS, default=self._settings.get(CONF_STOPS, [])
                ): SelectSelector(
                    SelectSelectorConfig(
                        options=await self._stop_options(),
                        multiple=True,
                        custom_value=True,
                        mode=SelectSelectorMode.DROPDOWN,
                    )
                )
            }
        )

    async def _check_stops(self, stops: list[str]) -> dict[str, str]:
        if not stops:
            return {CONF_STOPS: "no_stops"}
        client = self._client()
        for stop in stops:
            if not stop.isdigit():
                return {CONF_STOPS: "invalid_stop"}
            try:
                await client.async_get_predictions(stop)
            except TTCInvalidStopError:
                return {CONF_STOPS: "invalid_stop"}
            except TTCError:
                return {"base": "cannot_connect"}
        return {}


class TTCConfigFlow(_TTCSteps, ConfigFlow, domain=DOMAIN):
    """Set up TTC transit in three steps."""

    VERSION = 1

    def __init__(self) -> None:
        """Initialize the flow."""
        self._settings = {}

    @staticmethod
    @callback
    @override
    def async_get_options_flow(config_entry: ConfigEntry) -> TTCOptionsFlow:
        """Return the options flow."""
        return TTCOptionsFlow()

    @override
    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Choose what to watch."""
        errors: dict[str, str] = {}
        if user_input is not None:
            if not any(user_input.values()):
                errors["base"] = "nothing_chosen"
            else:
                self._settings.update(user_input)
                return await self.async_step_routes()
        return self.async_show_form(
            step_id="user",
            data_schema=self.add_suggested_values_to_schema(
                WATCH_SCHEMA, user_input or self._settings
            ),
            errors=errors,
        )

    async def async_step_reconfigure(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Change what is watched."""
        if not self._settings:
            entry = self._get_reconfigure_entry()
            self._settings = {**entry.data, **entry.options}
        return await self.async_step_user(user_input)

    async def async_step_routes(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Choose routes and stations."""
        errors: dict[str, str] = {}
        if user_input is not None:
            errors = self._check_routes(user_input)
            if not errors:
                self._settings.update(user_input)
                if self._settings.get(CONF_WATCH_DEPARTURES):
                    return await self.async_step_stops()
                return await self._async_finish()
        schema, load_errors = await self._routes_schema()
        return self.async_show_form(
            step_id="routes", data_schema=schema, errors=errors or load_errors
        )

    async def async_step_stops(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Choose stops for next departures."""
        errors: dict[str, str] = {}
        if user_input is not None:
            stops = [str(stop).strip() for stop in user_input.get(CONF_STOPS, [])]
            errors = await self._check_stops(stops)
            if not errors:
                self._settings[CONF_STOPS] = stops
                return await self._async_finish()
        return self.async_show_form(
            step_id="stops", data_schema=await self._stops_schema(), errors=errors
        )

    async def _async_finish(self) -> ConfigFlowResult:
        data = {
            CONF_WATCH_ALERTS: bool(self._settings.get(CONF_WATCH_ALERTS)),
            CONF_WATCH_LIFTS: bool(self._settings.get(CONF_WATCH_LIFTS)),
            CONF_WATCH_DEPARTURES: bool(self._settings.get(CONF_WATCH_DEPARTURES)),
            CONF_ROUTES: list(self._settings.get(CONF_ROUTES, [])),
            CONF_STATIONS: list(self._settings.get(CONF_STATIONS, []))
            if self._settings.get(CONF_WATCH_LIFTS)
            else [],
            CONF_STOPS: list(self._settings.get(CONF_STOPS, []))
            if self._settings.get(CONF_WATCH_DEPARTURES)
            else [],
        }
        if self.source == SOURCE_RECONFIGURE:
            return self.async_update_reload_and_abort(
                self._get_reconfigure_entry(), data=data, options={}
            )
        return self.async_create_entry(title=TITLE, data=data)


class TTCOptionsFlow(_TTCSteps, OptionsFlowWithReload):
    """Change the chosen routes, stations and stops."""

    _settings: dict[str, Any]

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Choose routes and stations."""
        self._settings = {**self.config_entry.data, **self.config_entry.options}
        return await self.async_step_routes()

    async def async_step_routes(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Choose routes and stations."""
        errors: dict[str, str] = {}
        if user_input is not None:
            errors = self._check_routes(user_input)
            if not errors:
                self._settings.update(user_input)
                if self._settings.get(CONF_WATCH_DEPARTURES):
                    return await self.async_step_stops()
                return self._finish()
        schema, load_errors = await self._routes_schema()
        return self.async_show_form(
            step_id="routes", data_schema=schema, errors=errors or load_errors
        )

    async def async_step_stops(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Choose stops for next departures."""
        errors: dict[str, str] = {}
        if user_input is not None:
            stops = [str(stop).strip() for stop in user_input.get(CONF_STOPS, [])]
            errors = await self._check_stops(stops)
            if not errors:
                self._settings[CONF_STOPS] = stops
                return self._finish()
        return self.async_show_form(
            step_id="stops", data_schema=await self._stops_schema(), errors=errors
        )

    def _finish(self) -> ConfigFlowResult:
        return self.async_create_entry(
            data={
                CONF_ROUTES: list(self._settings.get(CONF_ROUTES, [])),
                CONF_STATIONS: list(self._settings.get(CONF_STATIONS, [])),
                CONF_STOPS: list(self._settings.get(CONF_STOPS, [])),
            }
        )
