"""WebSocket API of Google setup."""

from typing import Any

import probatio

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.loader import async_get_integrations

from .api import GoogleSetupError, async_enable_apis, parse_service_account_key
from .const import GOOGLE_APIS, GOOGLE_DOMAINS


@websocket_api.require_admin
@websocket_api.websocket_command({probatio.Required("type"): "google_setup/status"})
@websocket_api.async_response
async def ws_status(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Report the Google APIs and the integrations available in this build."""
    integrations = await async_get_integrations(hass, GOOGLE_DOMAINS)
    connection.send_result(
        msg["id"],
        {
            "apis": [
                {"id": api_id, "service": service}
                for api_id, service in GOOGLE_APIS.items()
            ],
            "domains": [
                domain
                for domain in GOOGLE_DOMAINS
                if not isinstance(integrations[domain], Exception)
            ],
            "my_link": "my" in hass.config.components,
        },
    )


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "google_setup/enable_apis",
        # Loose types so a validation message can never echo the key back.
        probatio.Required("service_account_key"): object,
        probatio.Optional("apis"): object,
    }
)
@websocket_api.async_response
async def ws_enable_apis(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Enable the chosen Google APIs, using the key only for this call."""
    requested = msg.get("apis")
    if requested is None:
        selected = dict(GOOGLE_APIS)
    elif isinstance(requested, list) and all(
        isinstance(a, str) and a in GOOGLE_APIS for a in requested
    ):
        selected = {a: GOOGLE_APIS[a] for a in requested}
    else:
        connection.send_error(msg["id"], "invalid_format", "Unknown API requested")
        return
    try:
        account = await hass.async_add_executor_job(
            parse_service_account_key, msg["service_account_key"]
        )
        results = await async_enable_apis(
            async_get_clientsession(hass), account, selected
        )
    except GoogleSetupError as err:
        connection.send_error(msg["id"], "google_setup_failed", str(err))
        return
    connection.send_result(
        msg["id"], {"project_id": account.project_id, "apis": results}
    )
