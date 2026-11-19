"""Actions for the TTC transit integration."""

import probatio

from homeassistant.core import (
    HomeAssistant,
    ServiceCall,
    ServiceResponse,
    SupportsResponse,
    callback,
)
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError
from homeassistant.helpers import config_validation as cv

from .api import TTCError, TTCInvalidStopError
from .const import DOMAIN
from .coordinator import TTCConfigEntry, async_get_entry

ATTR_STOP = "stop"
ATTR_ROUTE = "route"
ATTR_LIMIT = "limit"

SERVICE_REFRESH = "refresh"
SERVICE_GET_DEPARTURES = "get_departures"

GET_DEPARTURES_SCHEMA = probatio.Schema(
    {
        probatio.Required(ATTR_STOP): probatio.All(
            cv.string, probatio.Match(r"^\d{1,6}$")
        ),
        probatio.Optional(ATTR_ROUTE): cv.string,
        probatio.Optional(ATTR_LIMIT, default=5): probatio.All(
            probatio.Coerce(int), probatio.Range(min=1, max=20)
        ),
    }
)


def _require_entry(hass: HomeAssistant) -> TTCConfigEntry:
    if (entry := async_get_entry(hass)) is None:
        raise ServiceValidationError(
            translation_domain=DOMAIN, translation_key="not_loaded"
        )
    return entry


@callback
def async_setup_services(hass: HomeAssistant) -> None:
    """Set up the TTC transit actions."""

    async def handle_refresh(call: ServiceCall) -> None:
        entry = _require_entry(hass)
        for coordinator in entry.runtime_data.coordinators:
            await coordinator.async_request_refresh()

    async def handle_get_departures(call: ServiceCall) -> ServiceResponse:
        entry = _require_entry(hass)
        stop: str = call.data[ATTR_STOP]
        try:
            predictions = await entry.runtime_data.client.async_get_predictions(stop)
        except TTCInvalidStopError as err:
            raise ServiceValidationError(
                translation_domain=DOMAIN,
                translation_key="invalid_stop",
                translation_placeholders={"stop": stop},
            ) from err
        except TTCError as err:
            raise HomeAssistantError(
                translation_domain=DOMAIN,
                translation_key="unreachable",
                translation_placeholders={"error": str(err)},
            ) from err
        items = predictions.for_route(call.data.get(ATTR_ROUTE))
        return {
            "stop": stop,
            "stop_title": predictions.stop_title,
            "read_at": predictions.read_at.isoformat(),
            "predicted": True,
            "departures": [item.as_dict() for item in items[: call.data[ATTR_LIMIT]]],
        }

    hass.services.async_register(DOMAIN, SERVICE_REFRESH, handle_refresh)
    hass.services.async_register(
        DOMAIN,
        SERVICE_GET_DEPARTURES,
        handle_get_departures,
        GET_DEPARTURES_SCHEMA,
        supports_response=SupportsResponse.ONLY,
    )
