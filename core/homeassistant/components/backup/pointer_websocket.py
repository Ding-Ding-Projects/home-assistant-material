"""Websocket commands for keeping only a pointer on this disk."""

import asyncio
from dataclasses import asdict
from typing import TYPE_CHECKING, Any, Final

import probatio

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from .const import DATA_MANAGER, LOGGER
from .models import AgentBackup, BackupManagerError, Folder
from .pointer import KEEP_WHOLE_CHOICES, PointerError, agent_backup_for

if TYPE_CHECKING:
    from .manager import BackupManager

# Seconds the page waits for the places to list their backups.
INFO_LIST_TIMEOUT: Final = 10.0


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


async def _list_one_local_agent(
    manager: BackupManager, agent_id: str
) -> list[AgentBackup]:
    """List the backups of one agent on this system; a failure lists none."""
    agent = manager.backup_agents.get(agent_id)
    if agent is None:
        return []
    try:
        return await agent.async_list_backups()
    except Exception as err:  # noqa: BLE001
        LOGGER.debug("Listing the backups of %s failed: %s", agent_id, err)
        return []


async def _list_local_backups(
    manager: BackupManager,
) -> tuple[dict[str, list[str]], list[dict[str, Any]]]:
    """Return the backups the agents on this system hold, with what a row shows.

    The agents are asked together and only for the short limit, so a slow
    disk never holds the page longer than the full list may.
    """
    agent_ids = list(manager.pointers.local_agent_ids())
    try:
        async with asyncio.timeout(INFO_LIST_TIMEOUT):
            results = await asyncio.gather(
                *(_list_one_local_agent(manager, agent_id) for agent_id in agent_ids)
            )
    except TimeoutError:
        LOGGER.debug("The backups on this system did not list in time")
        return {}, []
    by_backup: dict[str, list[str]] = {}
    details: dict[str, dict[str, Any]] = {}
    for agent_id, listed in zip(agent_ids, results, strict=True):
        for agent_backup in listed:
            by_backup.setdefault(agent_backup.backup_id, []).append(agent_id)
            row = details.setdefault(
                agent_backup.backup_id,
                {
                    "backup_id": agent_backup.backup_id,
                    "name": agent_backup.name,
                    "date": agent_backup.date,
                    "size": agent_backup.size,
                    "agent_ids": [],
                },
            )
            row["agent_ids"].append(agent_id)
    local = sorted(details.values(), key=lambda row: row["date"], reverse=True)
    return by_backup, local


async def _list_all_backups(
    manager: BackupManager,
) -> tuple[dict[str, list[str]], list[str]] | None:
    """Return which agents list each backup and the agents that did not answer.

    None when the full list did not arrive within the short limit.
    """
    try:
        async with asyncio.timeout(INFO_LIST_TIMEOUT):
            backups, errors = await manager.async_get_backups()
    except TimeoutError:
        LOGGER.warning(
            "Listing the backups took longer than %s seconds; showing the "
            "pointers with the registry state as unknown",
            INFO_LIST_TIMEOUT,
        )
        return None
    return (
        {backup_id: list(backup.agents) for backup_id, backup in backups.items()},
        sorted(errors),
    )


async def _list_agents_by_backup(
    manager: BackupManager,
) -> tuple[dict[str, list[str]], list[str], list[dict[str, Any]]]:
    """Return which agents list each backup, the agents that did not answer,
    and the backups held on this system with their name, date and size.

    A place that does not answer within a short time must not hold the page:
    the backups on this system are then listed alone and every pointer place
    is reported as not reached, so its pointers read as unknown, not missing.
    The full list and the list on this system are asked for together, so both
    stay within the same short limit.
    """
    full, (local_by_backup, local) = await asyncio.gather(
        _list_all_backups(manager), _list_local_backups(manager)
    )
    if full is not None:
        return full[0], full[1], local
    unreachable = sorted(
        agent.agent_id for agent in manager.pointers.pointer_agents()
    )
    return local_by_backup, unreachable, local


async def _info(hass: HomeAssistant) -> dict[str, Any]:
    manager = hass.data[DATA_MANAGER]
    pointers = manager.pointers
    backups, unreachable, local_backups = await _list_agents_by_backup(manager)
    return {
        "local_backups": local_backups,
        "readable": pointers.readable,
        "available": pointers.available,
        "settings": asdict(pointers.settings),
        "keep_whole_choices": list(KEEP_WHOLE_CHOICES),
        "summary": pointers.summary(backups),
        "unreachable": unreachable,
        "pointers": {
            backup_id: agent_backup_for(pointer)
            for backup_id, pointer in pointers.all().items()
        },
        "kept": {
            backup_id: asdict(kept) for backup_id, kept in pointers.kept().items()
        },
        "transfer": asdict(pointers.transfer) if pointers.transfer else None,
        "pass": asdict(pointers.pass_state),
        "revision": pointers.revision,
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
    """Send the progress of a bring back and of a pass whenever either changes.

    The revision goes up whenever the pointers or the setting change, so the
    page knows when to read them again.
    """
    pointers = hass.data[DATA_MANAGER].pointers

    @callback
    def _changed() -> None:
        connection.send_message(
            websocket_api.event_message(
                msg["id"],
                {
                    "transfer": asdict(pointers.transfer)
                    if pointers.transfer
                    else None,
                    "pass": asdict(pointers.pass_state),
                    "revision": pointers.revision,
                },
            )
        )

    connection.subscriptions[msg["id"]] = pointers.async_subscribe(_changed)
    connection.send_result(msg["id"])
    _changed()
