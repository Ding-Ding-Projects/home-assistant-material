"""Actions that hand a linked file to automations as a real local file."""

from datetime import timedelta

import probatio

from homeassistant.core import (
    HomeAssistant,
    ServiceCall,
    ServiceResponse,
    SupportsResponse,
    callback,
)
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError
from homeassistant.helpers import config_validation as cv, service
from homeassistant.util import dt as dt_util

from .const import (
    DEFAULT_FILE_SECONDS,
    DOMAIN,
    MAX_FILE_SECONDS,
    LinkedMediaService,
    LinkedMediaServiceArgument,
)
from .data import async_get_manager
from .fetch import FetchError
from .manager import LinkedMediaManager

FETCH_SCHEMA = probatio.Schema(
    {
        probatio.Required(LinkedMediaServiceArgument.FILE_ID): cv.string,
        probatio.Optional(
            LinkedMediaServiceArgument.SECONDS, default=DEFAULT_FILE_SECONDS
        ): probatio.All(
            probatio.Coerce(int), probatio.Range(min=1, max=MAX_FILE_SECONDS)
        ),
    }
)
RELEASE_SCHEMA = probatio.Schema(
    {probatio.Required(LinkedMediaServiceArgument.PATH): cv.string}
)


def _manager(hass: HomeAssistant) -> LinkedMediaManager:
    if (manager := async_get_manager(hass)) is None:
        raise ServiceValidationError(
            translation_domain=DOMAIN, translation_key="not_loaded"
        )
    return manager


async def _async_fetch(call: ServiceCall) -> ServiceResponse:
    manager = _manager(call.hass)
    file_id = call.data[LinkedMediaServiceArgument.FILE_ID]
    if (linked := manager.get(file_id)) is None:
        raise ServiceValidationError(
            translation_domain=DOMAIN,
            translation_key="file_not_found",
            translation_placeholders={"file_id": file_id},
        )
    seconds = call.data[LinkedMediaServiceArgument.SECONDS]
    try:
        handout = await manager.async_hand_out(linked, seconds)
    except FetchError as err:
        raise HomeAssistantError(
            translation_domain=DOMAIN,
            translation_key="fetch_failed",
            translation_placeholders={"name": linked.name, "reason": err.reason},
        ) from err
    return {
        "path": str(handout.path),
        "content_type": linked.content_type,
        "size": handout.size,
        "expires": (dt_util.utcnow() + timedelta(seconds=seconds)).isoformat(),
    }


async def _async_release(call: ServiceCall) -> ServiceResponse:
    manager = _manager(call.hass)
    released = await manager.async_release_path(
        call.data[LinkedMediaServiceArgument.PATH]
    )
    return {"released": released}


@callback
def async_setup_services(hass: HomeAssistant) -> None:
    """Register the actions."""
    service.async_register_admin_service(
        hass,
        DOMAIN,
        LinkedMediaService.FETCH,
        _async_fetch,
        FETCH_SCHEMA,
        supports_response=SupportsResponse.ONLY,
    )
    service.async_register_admin_service(
        hass,
        DOMAIN,
        LinkedMediaService.RELEASE,
        _async_release,
        RELEASE_SCHEMA,
        supports_response=SupportsResponse.OPTIONAL,
    )
