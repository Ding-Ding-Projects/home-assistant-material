"""WebSocket API of the Guided setup integration."""

from typing import Any

import probatio

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.util.yaml import dump

from .catalog import async_get_catalog, async_get_form, async_is_list, async_validate
from .const import CONF_PLATFORM_KEY, DOMAIN
from .manager import DATA_MANAGER, StoredEntry

_TARGET = {
    probatio.Required("domain"): str,
    probatio.Optional("entity_domain"): probatio.Any(None, str),
}


@callback
def async_register_commands(hass: HomeAssistant) -> None:
    """Register the commands."""
    websocket_api.async_register_command(hass, ws_catalog)
    websocket_api.async_register_command(hass, ws_form)
    websocket_api.async_register_command(hass, ws_validate)
    websocket_api.async_register_command(hass, ws_save)
    websocket_api.async_register_command(hass, ws_delete)


def _apply_notice(hass: HomeAssistant, domain: str) -> dict[str, Any]:
    """Say truthfully how a change is picked up.

    A reload service exists only when the integration registered one while it
    was loaded. Without it, a restart is the only way to apply the change.
    """
    if hass.services.has_service(domain, "reload"):
        return {"mode": "reload", "service": f"{domain}.reload"}
    return {"mode": "restart", "service": None}


def _entry_view(hass: HomeAssistant, entry: StoredEntry) -> dict[str, Any]:
    return {**entry, "apply": _apply_notice(hass, entry["domain"])}


def _preview(
    domain: str, entity_domain: str | None, data: dict[str, Any], as_list: bool
) -> str:
    if entity_domain is None:
        content: dict[str, Any] = {domain: [data] if as_list else data}
    else:
        content = {entity_domain: [{CONF_PLATFORM_KEY: domain, **data}]}
    return dump(content)


async def _async_target_error(
    hass: HomeAssistant, domain: str, entity_domain: str | None
) -> str | None:
    """Return an error message when the catalog does not offer the target."""
    for item in await async_get_catalog(hass):
        if item["domain"] != domain:
            continue
        if entity_domain is None and item["has_domain_schema"]:
            return None
        if entity_domain is not None and entity_domain in item["entity_domains"]:
            return None
    return "This integration is not set up through Guided setup"


@websocket_api.websocket_command({probatio.Required("type"): f"{DOMAIN}/catalog"})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_catalog(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """List the integrations without a setup screen and the entries made here."""
    manager = hass.data[DATA_MANAGER]
    connection.send_result(
        msg["id"],
        {
            "integrations": await async_get_catalog(hass),
            "entries": [_entry_view(hass, entry) for entry in manager.entries()],
        },
    )


@websocket_api.websocket_command({probatio.Required("type"): f"{DOMAIN}/form", **_TARGET})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_form(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Return the form of one integration."""
    domain, entity_domain = msg["domain"], msg.get("entity_domain")
    if (error := await _async_target_error(hass, domain, entity_domain)) is not None:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, error)
        return
    try:
        form = await async_get_form(hass, domain, entity_domain)
    except ValueError as err:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, str(err))
        return
    connection.send_result(
        msg["id"], {**form.as_dict(), "apply": _apply_notice(hass, domain)}
    )


@websocket_api.websocket_command(
    {
        probatio.Required("type"): f"{DOMAIN}/validate",
        probatio.Required("data"): dict,
        **_TARGET,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_validate(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Check options against the real schema and preview the YAML."""
    domain, entity_domain = msg["domain"], msg.get("entity_domain")
    if (error := await _async_target_error(hass, domain, entity_domain)) is not None:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, error)
        return
    as_list = await async_is_list(hass, domain, entity_domain)
    errors = await async_validate(hass, domain, entity_domain, msg["data"], as_list)
    connection.send_result(
        msg["id"],
        {
            "valid": not errors,
            "errors": errors,
            "yaml": _preview(domain, entity_domain, msg["data"], as_list),
        },
    )


@websocket_api.websocket_command(
    {
        probatio.Required("type"): f"{DOMAIN}/save",
        probatio.Required("data"): dict,
        probatio.Optional("entry_id"): str,
        **_TARGET,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_save(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Create or replace an entry after validating it again."""
    manager = hass.data[DATA_MANAGER]
    domain, entity_domain = msg["domain"], msg.get("entity_domain")
    entry_id = msg.get("entry_id")

    if (error := await _async_target_error(hass, domain, entity_domain)) is not None:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, error)
        return
    if entry_id is not None:
        existing = manager.get(entry_id)
        if existing is None or (existing["domain"], existing["entity_domain"]) != (
            domain,
            entity_domain,
        ):
            connection.send_error(
                msg["id"], websocket_api.ERR_NOT_FOUND, "Entry not found"
            )
            return
    as_list = await async_is_list(hass, domain, entity_domain)
    if not as_list and manager.conflicts(domain, entity_domain, entry_id):
        connection.send_error(
            msg["id"],
            websocket_api.ERR_NOT_SUPPORTED,
            "This integration accepts one configuration; edit the existing one",
        )
        return

    if errors := await async_validate(
        hass, domain, entity_domain, msg["data"], as_list
    ):
        connection.send_result(msg["id"], {"saved": False, "errors": errors})
        return

    if entry_id is None:
        entry = await manager.async_add(
            domain, entity_domain, msg["data"], as_list
        )
    else:
        entry = await manager.async_update(entry_id, msg["data"])
    connection.send_result(
        msg["id"], {"saved": True, "errors": [], "entry": _entry_view(hass, entry)}
    )


@websocket_api.websocket_command(
    {probatio.Required("type"): f"{DOMAIN}/delete", probatio.Required("entry_id"): str}
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_delete(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Remove an entry that was made here."""
    manager = hass.data[DATA_MANAGER]
    if manager.get(msg["entry_id"]) is None:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "Entry not found")
        return
    entry = await manager.async_remove(msg["entry_id"])
    connection.send_result(msg["id"], {"apply": _apply_notice(hass, entry["domain"])})
