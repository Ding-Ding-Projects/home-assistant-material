"""Websocket commands for keeping only a pointer on this disk."""

from dataclasses import asdict
from typing import Any

import probatio

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from .const import DATA_MANAGER
from .models import BackupManagerError, Folder
from .pointer import KEEP_WHOLE_CHOICES, PointerError, agent_backup_for


@callback
def async_register_pointer_websocket_handlers(hass: HomeAssistant) -> None:
    """Register the pointer commands."""
    websocket_api.async_register_command(hass, handle_pointer_info)
    websocket_api.async_register_command(hass, handle_pointer_settings)
    websocket_api.async_register_command(hass, handle_pointer_run)
    websocket_api.async_register_command(hass, handle_pointer_check)
    websocket_api.async_register_command(hass, handle_pointer_bring_back)
    websocket_api.async_register_command(hass, handle_pointer_restore)
    websocket_api.async_register_command(hass, handle_pointer_subscribe)


async def _info(hass: HomeAssistant) -> dict[str, Any]:
    manager = hass.data[DATA_MANAGER]
    pointers = manager.pointers
    backups, _ = await manager.async_get_backups()
    return {
        "readable": pointers.readable,
        "available": pointers.available,
        "settings": asdict(pointers.settings),
        "keep_whole_choices": list(KEEP_WHOLE_CHOICES),
        "summary": pointers.summary(backups),
        "pointers": {
            backup_id: agent_backup_for(pointer)
            for backup_id, pointer in pointers.all().items()
        },
        "kept": {
            backup_id: asdict(kept) for backup_id, kept in pointers.kept().items()
        },
        "transfer": asdict(pointers.transfer) if pointers.transfer else None,
        "places": [
            {"agent_id": agent.agent_id, "name": agent.name}
            for agent in pointers.pointer_agents()
        ],
        "local_agent_ids": pointers.local_agent_ids(),
    }


def _send_pointer_error(
    connection: websocket_api.ActiveConnection, msg_id: int, err: Exception
) -> None:
    if isinstance(err, PointerError):
        connection.send_error(msg_id, err.reason, str(err))
        return
    connection.send_error(msg_id, "home_assistant_error", str(err))


@websocket_api.require_admin
@websocket_api.websocket_command({probatio.Required("type"): "backup/pointer/info"})
@websocket_api.async_response
async def handle_pointer_info(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return the setting, the pointers and the honest counts."""
    connection.send_result(msg["id"], await _info(hass))


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "backup/pointer/settings",
        probatio.Optional("enabled"): bool,
        probatio.Optional("keep_whole"): probatio.In(KEEP_WHOLE_CHOICES),
    }
)
@websocket_api.async_response
async def handle_pointer_settings(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Turn keeping only a pointer on or off, and choose how many stay whole."""
    pointers = hass.data[DATA_MANAGER].pointers
    try:
        settings = await pointers.async_set_settings(
            enabled=msg.get("enabled"), keep_whole=msg.get("keep_whole")
        )
    except PointerError as err:
        _send_pointer_error(connection, msg["id"], err)
        return
    connection.send_result(msg["id"], asdict(settings))


@websocket_api.require_admin
@websocket_api.websocket_command({probatio.Required("type"): "backup/pointer/run"})
@websocket_api.async_response
async def handle_pointer_run(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Try now to make every eligible backup a pointer."""
    manager = hass.data[DATA_MANAGER]
    outcomes = await manager.self_checks.async_run_exclusive(
        manager.pointers.async_run_pass
    )
    connection.send_result(msg["id"], {"outcomes": outcomes})


@websocket_api.require_admin
@websocket_api.websocket_command({probatio.Required("type"): "backup/pointer/check"})
@websocket_api.async_response
async def handle_pointer_check(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Check every pointer against its place now."""
    states = await hass.data[DATA_MANAGER].pointers.async_check_all()
    connection.send_result(msg["id"], {"states": states})


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "backup/pointer/bring_back",
        probatio.Required("backup_id"): str,
    }
)
@websocket_api.async_response
async def handle_pointer_bring_back(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Bring a backup back to this disk and check it; the pointer is then gone."""
    try:
        agent_id = await hass.data[DATA_MANAGER].pointers.async_bring_back(
            msg["backup_id"]
        )
    except BackupManagerError as err:
        _send_pointer_error(connection, msg["id"], err)
        return
    connection.send_result(msg["id"], {"agent_id": agent_id})


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "backup/pointer/restore",
        probatio.Required("backup_id"): str,
        probatio.Optional("password"): str,
        probatio.Optional("restore_addons"): [str],
        probatio.Optional("restore_database", default=True): bool,
        probatio.Optional("restore_folders"): [probatio.Coerce(Folder)],
        probatio.Optional("restore_homeassistant", default=True): bool,
    }
)
@websocket_api.async_response
async def handle_pointer_restore(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Bring a backup back, check it, then restore it the normal way."""
    try:
        await hass.data[DATA_MANAGER].pointers.async_restore(
            msg["backup_id"],
            password=msg.get("password"),
            restore_addons=msg.get("restore_addons"),
            restore_database=msg["restore_database"],
            restore_folders=msg.get("restore_folders"),
            restore_homeassistant=msg["restore_homeassistant"],
        )
    except BackupManagerError as err:
        _send_pointer_error(connection, msg["id"], err)
        return
    connection.send_result(msg["id"])


@websocket_api.require_admin
@websocket_api.websocket_command(
    {probatio.Required("type"): "backup/pointer/subscribe"}
)
@websocket_api.async_response
async def handle_pointer_subscribe(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Send the progress of a bring back whenever it changes."""
    pointers = hass.data[DATA_MANAGER].pointers

    @callback
    def _changed() -> None:
        connection.send_message(
            websocket_api.event_message(
                msg["id"],
                {"transfer": asdict(pointers.transfer) if pointers.transfer else None},
            )
        )

    connection.subscriptions[msg["id"]] = pointers.async_subscribe(_changed)
    connection.send_result(msg["id"])
    _changed()
