"""Websocket commands for keeping only a pointer on this disk."""

import asyncio
from dataclasses import asdict, dataclass
from typing import TYPE_CHECKING, Any, Final

import probatio

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.util.hass_dict import HassKey

from .const import DATA_MANAGER, LOGGER
from .models import AgentBackup, BackupManagerError, Folder
from .pointer import KEEP_WHOLE_CHOICES, PointerError, agent_backup_for

if TYPE_CHECKING:
    from .manager import BackupManager

# Seconds the full listing may take before a place counts as not reached.
INFO_LIST_TIMEOUT: Final = 10.0
# Seconds the page waits before it is answered with the backups on this system
# alone; the agents on this system are bounded by the same limit.
INFO_EARLY_TIMEOUT: Final = 2.0
# Seconds a finished full listing that nobody read yet stays usable for the
# page's follow-up request.
INFO_RESULT_KEEP: Final = 30.0

type _FullListing = tuple[dict[str, list[str]], list[str]] | None


@dataclass(slots=True)
class _PendingListing:
    """A full listing an earlier answer did not wait for."""

    task: asyncio.Task[_FullListing]
    started: float


DATA_PENDING_LISTING: HassKey[_PendingListing] = HassKey(
    "backup_pointer_pending_listing"
)


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

    The agents are asked together and only for the early limit, so the page
    gets these rows within it whatever the places elsewhere do.
    """
    agent_ids = list(manager.pointers.local_agent_ids())
    try:
        async with asyncio.timeout(INFO_EARLY_TIMEOUT):
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


async def _list_all_backups(manager: BackupManager) -> _FullListing:
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


def _full_listing_task(
    hass: HomeAssistant, manager: BackupManager
) -> asyncio.Task[_FullListing]:
    """Return the full listing an earlier answer left running, or start one.

    The page asks again after an answer that was still checking; joining the
    listing already under way keeps that follow-up from starting over.
    """
    now = hass.loop.time()
    pending = hass.data.get(DATA_PENDING_LISTING)
    if pending is not None and (
        not pending.task.done() or now - pending.started < INFO_RESULT_KEEP
    ):
        return pending.task
    task = hass.async_create_background_task(
        _list_all_backups(manager), "backup pointer full listing"
    )
    hass.data[DATA_PENDING_LISTING] = _PendingListing(task, now)
    return task


async def _list_agents_by_backup(
    hass: HomeAssistant, manager: BackupManager
) -> tuple[dict[str, list[str]], list[str], list[str], list[dict[str, Any]]]:
    """Return which agents list each backup, the agents that did not answer,
    the agents still being asked, and the backups held on this system with
    their name, date and size.

    The page is answered within the early limit. When the full list is not in
    by then, the backups on this system are listed alone and every pointer
    place is reported as still being checked: the full listing keeps going
    for its own limit, and the page's next request reads its result. Only a
    place that failed, or did not answer within the full limit, is reported
    as not reached.
    """
    started = hass.loop.time()
    task = _full_listing_task(hass, manager)
    local_by_backup, local = await _list_local_backups(manager)
    remaining = max(0.0, INFO_EARLY_TIMEOUT - (hass.loop.time() - started))
    if not task.done():
        await asyncio.wait({task}, timeout=remaining)
    pointer_ids = sorted(
        agent.agent_id for agent in manager.pointers.pointer_agents()
    )
    if not task.done():
        return local_by_backup, [], pointer_ids, local
    pending = hass.data.get(DATA_PENDING_LISTING)
    if pending is not None and pending.task is task:
        del hass.data[DATA_PENDING_LISTING]
    full = task.result()
    if full is not None:
        return full[0], full[1], [], local
    return local_by_backup, pointer_ids, [], local


async def _info(hass: HomeAssistant) -> dict[str, Any]:
    manager = hass.data[DATA_MANAGER]
    pointers = manager.pointers
    backups, unreachable, checking, local_backups = await _list_agents_by_backup(
        hass, manager
    )
    return {
        "local_backups": local_backups,
        "checking": checking,
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
