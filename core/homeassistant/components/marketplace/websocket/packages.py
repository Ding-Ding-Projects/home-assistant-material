"""WebSocket commands for the packages installed from a file."""

from typing import Any

import probatio

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv

from ..base import MarketplaceManager
from ..package_updates import PackageRecord
from .decorators import marketplace_command


def _describe(record: PackageRecord) -> dict[str, Any]:
    return {
        "key": record.key,
        "kind": record.kind,
        "name": record.name,
        "title": record.title,
        "version": record.version,
        "latest_version": record.latest_version if record.update_available else None,
        "notes": record.notes if record.update_available else None,
        "auto_update": record.auto_update,
        "state": record.state,
        "error": record.error,
        "update_url": record.update_url,
    }


def _not_found(connection: websocket_api.ActiveConnection, msg_id: int) -> None:
    connection.send_error(msg_id, websocket_api.ERR_NOT_FOUND, "Package not found")


@websocket_api.websocket_command(
    {probatio.Required("type"): "marketplace/packages/list"}
)
@websocket_api.require_admin
@websocket_api.async_response
@marketplace_command()
async def marketplace_packages_list(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    marketplace: MarketplaceManager,
) -> None:
    """List the installed packages that can be updated."""
    connection.send_result(
        msg["id"],
        [_describe(record) for record in marketplace.package_updates.records.values()],
    )


@websocket_api.websocket_command(
    {
        probatio.Required("type"): "marketplace/packages/auto_update",
        probatio.Required("key"): cv.string,
        probatio.Required("enabled"): cv.boolean,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
@marketplace_command()
async def marketplace_packages_auto_update(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    marketplace: MarketplaceManager,
) -> None:
    """Turn automatic updates of a package on or off."""
    if msg["key"] not in marketplace.package_updates.records:
        _not_found(connection, msg["id"])
        return
    await marketplace.package_updates.async_set_auto_update(msg["key"], msg["enabled"])
    connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {
        probatio.Required("type"): "marketplace/packages/check",
        probatio.Required("key"): cv.string,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
@marketplace_command()
async def marketplace_packages_check(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    marketplace: MarketplaceManager,
) -> None:
    """Look for an update of a package now."""
    updates = marketplace.package_updates
    if msg["key"] not in updates.records:
        _not_found(connection, msg["id"])
        return
    await updates.async_check(msg["key"])
    connection.send_result(msg["id"], _describe(updates.records[msg["key"]]))


@websocket_api.websocket_command(
    {
        probatio.Required("type"): "marketplace/packages/update",
        probatio.Required("key"): cv.string,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
@marketplace_command()
async def marketplace_packages_update(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    marketplace: MarketplaceManager,
) -> None:
    """Install the version on offer now."""
    updates = marketplace.package_updates
    if msg["key"] not in updates.records:
        _not_found(connection, msg["id"])
        return
    await updates.async_install(msg["key"])
    connection.send_result(msg["id"], _describe(updates.records[msg["key"]]))
