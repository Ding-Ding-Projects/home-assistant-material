"""Websocket commands for the Backup integration."""

from dataclasses import asdict
from typing import Any

import probatio

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv

from .config import Day, ScheduleRecurrence
from .const import DATA_MANAGER, LOGGER
from .delete_proof import (
    BackupDeleteProof,
    DeleteProofConfirmationRequired,
    DeleteProofRecordsUnreadable,
)
from .manager import (
    BackupManager,
    BackupManagerState,
    BackupNoCoreArchiveError,
    BackupVersionTooNewError,
    DecryptOnDowloadNotSupported,
    IncorrectPasswordError,
    ManagerBackup,
    ManagerStateEvent,
)
from .models import BackupManagerError, BackupNotFound, Folder
from .self_check import (
    COPY_COULD_NOT_CHECK,
    METHOD_NONE,
    REMOTE_MODES,
    CopyResult,
    SelfCheckSettings,
    async_check_location,
    async_self_check,
    could_not_check_result,
    update_issue,
)


def _with_self_check(
    manager: BackupManager, backup: ManagerBackup | None
) -> ManagerBackup | dict[str, Any] | None:
    """Add the stored self-check result to a backup, when there is one."""
    if backup is None:
        return None
    known = manager.known_backups.get(backup.backup_id)
    mark = manager.delete_proof.get(backup.backup_id)
    if (known is None or known.self_check is None) and mark is None:
        return backup
    result = asdict(backup)
    if known is not None and known.self_check is not None:
        result["self_check"] = known.self_check
    if mark is not None:
        result["delete_proof"] = mark.to_dict()
    return result


def _agent_error_translations(
    agent_errors: dict[str, Exception],
) -> dict[str, dict[str, Any]]:
    """Return the translation of each agent error which has one."""
    return {
        agent_id: {
            "translation_domain": err.translation_domain,
            "translation_key": err.translation_key,
            # Agents from custom integrations may pass non-string placeholders
            "translation_placeholders": (
                {key: str(value) for key, value in placeholders.items()}
                if (placeholders := err.translation_placeholders)
                else None
            ),
        }
        for agent_id, err in agent_errors.items()
        if isinstance(err, HomeAssistantError)
        and err.translation_domain
        and err.translation_key
    }


@callback
def async_register_websocket_handlers(hass: HomeAssistant, with_hassio: bool) -> None:
    """Register websocket commands."""
    websocket_api.async_register_command(hass, backup_agents_info)

    if with_hassio:
        websocket_api.async_register_command(hass, handle_backup_end)
        websocket_api.async_register_command(hass, handle_backup_start)

    websocket_api.async_register_command(hass, handle_details)
    websocket_api.async_register_command(hass, handle_info)
    websocket_api.async_register_command(hass, handle_can_decrypt_on_download)
    websocket_api.async_register_command(hass, handle_create)
    websocket_api.async_register_command(hass, handle_create_with_automatic_settings)
    websocket_api.async_register_command(hass, handle_delete)
    websocket_api.async_register_command(hass, handle_delete_proof_info)
    websocket_api.async_register_command(hass, handle_delete_proof_set)
    websocket_api.async_register_command(hass, handle_self_check)
    websocket_api.async_register_command(hass, handle_self_check_location)
    websocket_api.async_register_command(hass, handle_self_check_config_info)
    websocket_api.async_register_command(hass, handle_self_check_config_update)
    websocket_api.async_register_command(hass, handle_restore)
    websocket_api.async_register_command(hass, handle_subscribe_events)

    websocket_api.async_register_command(hass, handle_config_info)
    websocket_api.async_register_command(hass, handle_config_update)


@websocket_api.require_admin
@websocket_api.websocket_command({probatio.Required("type"): "backup/info"})
@websocket_api.async_response
async def handle_info(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """List all stored backups."""
    manager = hass.data[DATA_MANAGER]
    backups, agent_errors = await manager.async_get_backups()
    connection.send_result(
        msg["id"],
        {
            "agent_errors": {
                agent_id: str(err) for agent_id, err in agent_errors.items()
            },
            "agent_error_translations": _agent_error_translations(agent_errors),
            "backups": [
                _with_self_check(manager, backup) for backup in backups.values()
            ],
            "last_attempted_automatic_backup": (
                manager.config.data.last_attempted_automatic_backup
            ),
            "last_completed_automatic_backup": (
                manager.config.data.last_completed_automatic_backup
            ),
            "last_action_event": manager.last_action_event,
            "next_automatic_backup": (
                manager.config.data.schedule.next_automatic_backup
            ),
            "next_automatic_backup_additional": (
                manager.config.data.schedule.next_automatic_backup_additional
            ),
            "state": manager.state,
        },
    )


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "backup/details",
        probatio.Required("backup_id"): str,
    }
)
@websocket_api.async_response
async def handle_details(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Get backup details for a specific backup."""
    manager = hass.data[DATA_MANAGER]
    backup, agent_errors = await manager.async_get_backup(msg["backup_id"])
    connection.send_result(
        msg["id"],
        {
            "agent_errors": {
                agent_id: str(err) for agent_id, err in agent_errors.items()
            },
            "agent_error_translations": _agent_error_translations(agent_errors),
            "backup": _with_self_check(manager, backup),
        },
    )


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "backup/self_check",
        probatio.Required("backup_id"): str,
    }
)
@websocket_api.async_response
async def handle_self_check(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Check that a stored backup can be read, without restoring it."""
    manager = hass.data[DATA_MANAGER]
    if manager.self_checks.running:
        connection.send_error(
            msg["id"], "self_check_running", "A self-check is already running"
        )
        return
    if manager.state is not BackupManagerState.IDLE:
        connection.send_error(
            msg["id"],
            "backup_manager_busy",
            "A backup, upload or restore is running",
        )
        return
    settings = await manager.self_checks.async_get_settings()
    try:
        result = await manager.self_checks.async_run_exclusive(
            lambda: async_self_check(manager, msg["backup_id"], settings=settings)
        )
    except Exception:  # noqa: BLE001
        LOGGER.exception("Unexpected error in the self-check of %s", msg["backup_id"])
        result = None
        stored = could_not_check_result("unexpected_error")
    else:
        if result is None:
            connection.send_error(
                msg["id"], BackupNotFound.error_code, "Backup not found"
            )
            return
        stored = result.to_dict()
    manager.known_backups.set_self_check(msg["backup_id"], stored)
    if result is not None:
        update_issue(hass, msg["backup_id"], result)
    connection.send_result(msg["id"], {"self_check": stored})


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "backup/self_check/location",
        probatio.Required("backup_id"): str,
        probatio.Required("agent_id"): str,
        probatio.Optional("full_download", default=False): bool,
    }
)
@websocket_api.async_response
async def handle_self_check_location(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Check the copy of a backup at one location again."""
    manager = hass.data[DATA_MANAGER]
    if msg["agent_id"] not in manager.backup_agents:
        connection.send_error(
            msg["id"], "unknown_agent", f"Unknown location {msg['agent_id']}"
        )
        return
    if manager.self_checks.running:
        connection.send_error(
            msg["id"], "self_check_running", "A self-check is already running"
        )
        return
    if manager.state is not BackupManagerState.IDLE:
        connection.send_error(
            msg["id"],
            "backup_manager_busy",
            "A backup, upload or restore is running",
        )
        return
    settings = await manager.self_checks.async_get_settings()
    try:
        copy = await manager.self_checks.async_run_exclusive(
            lambda: async_check_location(
                manager,
                msg["backup_id"],
                msg["agent_id"],
                full_download=msg["full_download"],
                settings=settings,
            )
        )
    except Exception:  # noqa: BLE001
        LOGGER.exception(
            "Unexpected error in the self-check of %s at %s",
            msg["backup_id"],
            msg["agent_id"],
        )
        copy = CopyResult(
            agent_id=msg["agent_id"],
            method=METHOD_NONE,
            status=COPY_COULD_NOT_CHECK,
            reason="unexpected_error",
        )
    if copy is None:
        connection.send_error(msg["id"], BackupNotFound.error_code, "Backup not found")
        return
    stored = manager.known_backups.set_self_check_copy(msg["backup_id"], copy.to_dict())
    connection.send_result(msg["id"], {"copy": copy.to_dict(), "self_check": stored})


@websocket_api.require_admin
@websocket_api.websocket_command(
    {probatio.Required("type"): "backup/self_check/config/info"}
)
@websocket_api.async_response
async def handle_self_check_config_info(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return the settings of the self-check of remote copies."""
    manager = hass.data[DATA_MANAGER]
    settings = await manager.self_checks.async_get_settings()
    connection.send_result(
        msg["id"],
        {
            "config": settings.to_dict(),
            "defaults": SelfCheckSettings().to_dict(),
            "modes": list(REMOTE_MODES),
        },
    )


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "backup/self_check/config/update",
        probatio.Optional("remote_mode"): probatio.In(REMOTE_MODES),
        probatio.Optional("max_full_download_bytes"): probatio.Any(
            probatio.All(int, probatio.Range(min=1)), None
        ),
    }
)
@websocket_api.async_response
async def handle_self_check_config_update(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Change the settings of the self-check of remote copies."""
    manager = hass.data[DATA_MANAGER]
    changes = {
        key: msg[key]
        for key in ("remote_mode", "max_full_download_bytes")
        if key in msg
    }
    settings = await manager.self_checks.async_update_settings(**changes)
    connection.send_result(msg["id"], {"config": settings.to_dict()})


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "backup/delete",
        probatio.Required("backup_id"): str,
    }
)
@websocket_api.async_response
async def handle_delete(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Delete a backup."""
    try:
        agent_errors = await hass.data[DATA_MANAGER].async_delete_backup(
            msg["backup_id"]
        )
    except (BackupDeleteProof, DeleteProofRecordsUnreadable) as err:
        connection.send_error(msg["id"], err.error_code, str(err))
        return
    connection.send_result(
        msg["id"],
        {
            "agent_errors": {
                agent_id: str(err) for agent_id, err in agent_errors.items()
            },
            "agent_error_translations": _agent_error_translations(agent_errors),
        },
    )


@websocket_api.require_admin
@websocket_api.websocket_command(
    {probatio.Required("type"): "backup/delete_proof/info"}
)
@callback
def handle_delete_proof_info(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return every delete proof mark, including those whose backup is missing."""
    marks = hass.data[DATA_MANAGER].delete_proof
    connection.send_result(
        msg["id"],
        {
            "readable": marks.readable,
            "marks": {
                backup_id: mark.to_dict() for backup_id, mark in marks.all().items()
            },
        },
    )


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "backup/delete_proof/set",
        probatio.Required("backup_id"): str,
        probatio.Required("delete_proof"): bool,
        probatio.Optional("confirmed", default=False): bool,
    }
)
@websocket_api.async_response
async def handle_delete_proof_set(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Turn delete proof on or off; turning it off needs the confirmation."""
    manager = hass.data[DATA_MANAGER]
    backup_id = msg["backup_id"]
    try:
        if msg["delete_proof"]:
            backup, _ = await manager.async_get_backup(backup_id)
            if backup is None:
                connection.send_error(msg["id"], "not_found", "Backup not found")
                return
            user = connection.user
            mark = await manager.delete_proof.async_set(
                backup_id,
                marked_by=user.id if user else "",
                marked_by_name=user.name if user else None,
            )
            connection.send_result(
                msg["id"], {"backup_id": backup_id, "delete_proof": mark.to_dict()}
            )
            return
        await manager.delete_proof.async_clear(backup_id, confirmed=msg["confirmed"])
    except (
        DeleteProofConfirmationRequired,
        DeleteProofRecordsUnreadable,
    ) as err:
        connection.send_error(msg["id"], err.error_code, str(err))
        return
    except BackupManagerError as err:
        connection.send_error(msg["id"], "home_assistant_error", str(err))
        return
    connection.send_result(msg["id"], {"backup_id": backup_id, "delete_proof": None})


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "backup/restore",
        probatio.Required("backup_id"): str,
        probatio.Required("agent_id"): str,
        probatio.Optional("password"): str,
        probatio.Optional("restore_addons"): [str],
        probatio.Optional("restore_database", default=True): bool,
        probatio.Optional("restore_folders"): [probatio.Coerce(Folder)],
        probatio.Optional("restore_homeassistant", default=True): bool,
    }
)
@websocket_api.async_response
async def handle_restore(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Restore a backup."""
    try:
        await hass.data[DATA_MANAGER].async_restore_backup(
            msg["backup_id"],
            agent_id=msg["agent_id"],
            password=msg.get("password"),
            restore_addons=msg.get("restore_addons"),
            restore_database=msg["restore_database"],
            restore_folders=msg.get("restore_folders"),
            restore_homeassistant=msg["restore_homeassistant"],
        )
    except BackupNotFound:
        connection.send_error(msg["id"], "backup_not_found", "Backup not found")
    except IncorrectPasswordError:
        connection.send_error(msg["id"], "password_incorrect", "Incorrect password")
    except BackupVersionTooNewError as err:
        connection.send_error(msg["id"], "backup_version_too_new", str(err))
    except BackupNoCoreArchiveError as err:
        connection.send_error(msg["id"], "backup_no_core_archive", str(err))
    else:
        connection.send_result(msg["id"])


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "backup/can_decrypt_on_download",
        probatio.Required("backup_id"): str,
        probatio.Required("agent_id"): str,
        probatio.Required("password"): str,
    }
)
@websocket_api.async_response
async def handle_can_decrypt_on_download(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Check if the supplied password is correct."""
    try:
        await hass.data[DATA_MANAGER].async_can_decrypt_on_download(
            msg["backup_id"],
            agent_id=msg["agent_id"],
            password=msg.get("password"),
        )
    except BackupNotFound:
        connection.send_error(msg["id"], "backup_not_found", "Backup not found")
    except IncorrectPasswordError:
        connection.send_error(msg["id"], "password_incorrect", "Incorrect password")
    except DecryptOnDowloadNotSupported:
        connection.send_error(
            msg["id"], "decrypt_not_supported", "Decrypt on download not supported"
        )
    else:
        connection.send_result(msg["id"])


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "backup/generate",
        probatio.Required("agent_ids"): [str],
        probatio.Optional("include_addons"): [str],
        probatio.Optional("include_all_addons", default=False): bool,
        probatio.Optional("include_database", default=True): bool,
        probatio.Optional("include_folders"): [probatio.Coerce(Folder)],
        probatio.Optional("include_homeassistant", default=True): bool,
        probatio.Optional("name"): probatio.Any(str, None),
        probatio.Optional("password"): probatio.Any(str, None),
    }
)
@websocket_api.async_response
async def handle_create(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Generate a backup."""

    backup = await hass.data[DATA_MANAGER].async_initiate_backup(
        agent_ids=msg["agent_ids"],
        include_addons=msg.get("include_addons"),
        include_all_addons=msg["include_all_addons"],
        include_database=msg["include_database"],
        include_folders=msg.get("include_folders"),
        include_homeassistant=msg["include_homeassistant"],
        name=msg.get("name"),
        password=msg.get("password"),
    )
    connection.send_result(msg["id"], backup)


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "backup/generate_with_automatic_settings",
    }
)
@websocket_api.async_response
async def handle_create_with_automatic_settings(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Generate a backup with stored settings."""

    config_data = hass.data[DATA_MANAGER].config.data
    backup = await hass.data[DATA_MANAGER].async_initiate_backup(
        agent_ids=config_data.create_backup.agent_ids,
        include_addons=config_data.create_backup.include_addons,
        include_all_addons=config_data.create_backup.include_all_addons,
        include_database=config_data.create_backup.include_database,
        include_folders=config_data.create_backup.include_folders,
        include_homeassistant=True,  # always include HA
        name=config_data.create_backup.name,
        password=config_data.create_backup.password,
        with_automatic_settings=True,
    )
    connection.send_result(msg["id"], backup)


@websocket_api.ws_require_user(only_supervisor=True)
@websocket_api.websocket_command({probatio.Required("type"): "backup/start"})
@websocket_api.async_response
async def handle_backup_start(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Backup start notification."""
    manager = hass.data[DATA_MANAGER]
    LOGGER.debug("Backup start notification")

    try:
        await manager.async_pre_backup_actions()
    except Exception as err:  # noqa: BLE001
        connection.send_error(msg["id"], "pre_backup_actions_failed", str(err))
        return

    connection.send_result(msg["id"])


@websocket_api.ws_require_user(only_supervisor=True)
@websocket_api.websocket_command({probatio.Required("type"): "backup/end"})
@websocket_api.async_response
async def handle_backup_end(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Backup end notification."""
    manager = hass.data[DATA_MANAGER]
    LOGGER.debug("Backup end notification")

    try:
        await manager.async_post_backup_actions()
    except Exception as err:  # noqa: BLE001
        connection.send_error(msg["id"], "post_backup_actions_failed", str(err))
        return

    connection.send_result(msg["id"])


@websocket_api.require_admin
@websocket_api.websocket_command({probatio.Required("type"): "backup/agents/info"})
@websocket_api.async_response
async def backup_agents_info(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return backup agents info."""
    manager = hass.data[DATA_MANAGER]
    connection.send_result(
        msg["id"],
        {
            "agents": [
                {"agent_id": agent.agent_id, "name": agent.name}
                for agent in manager.backup_agents.values()
            ],
        },
    )


@websocket_api.require_admin
@websocket_api.websocket_command({probatio.Required("type"): "backup/config/info"})
@websocket_api.async_response
async def handle_config_info(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Send the stored backup config."""
    manager = hass.data[DATA_MANAGER]
    config = manager.config.data.to_dict()
    connection.send_result(
        msg["id"],
        {
            "config": config
            | {
                "next_automatic_backup": (
                    manager.config.data.schedule.next_automatic_backup
                ),
                "next_automatic_backup_additional": (
                    manager.config.data.schedule.next_automatic_backup_additional
                ),
            }
        },
    )


@callback
@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "backup/config/update",
        probatio.Optional("agents"): probatio.Schema(
            {
                str: {
                    probatio.Optional("protected"): bool,
                    probatio.Optional("retention"): probatio.Any(
                        probatio.Schema(
                            {
                                # Note: We can't use cv.positive_int
                                # because it allows 0 even
                                # though 0 is not positive.
                                probatio.Optional("copies"): probatio.Any(
                                    probatio.All(int, probatio.Range(min=1)), None
                                ),
                                probatio.Optional("days"): probatio.Any(
                                    probatio.All(int, probatio.Range(min=1)), None
                                ),
                            },
                        ),
                        None,
                    ),
                }
            }
        ),
        probatio.Optional("automatic_backups_configured"): bool,
        probatio.Optional("create_backup"): probatio.Schema(
            {
                probatio.Optional("agent_ids"): probatio.All([str], probatio.Unique()),
                probatio.Optional("include_addons"): probatio.Any(
                    probatio.All([str], probatio.Unique()), None
                ),
                probatio.Optional("include_all_addons"): bool,
                probatio.Optional("include_database"): bool,
                probatio.Optional("include_folders"): probatio.Any(
                    probatio.All([probatio.Coerce(Folder)], probatio.Unique()), None
                ),
                probatio.Optional("name"): probatio.Any(str, None),
                probatio.Optional("password"): probatio.Any(str, None),
            },
        ),
        probatio.Optional("retention"): probatio.Schema(
            {
                # Note: We can't use cv.positive_int because it allows 0 even
                # though 0 is not positive.
                probatio.Optional("copies"): probatio.Any(
                    probatio.All(int, probatio.Range(min=1)), None
                ),
                probatio.Optional("days"): probatio.Any(
                    probatio.All(int, probatio.Range(min=1)), None
                ),
            },
        ),
        probatio.Optional("schedule"): probatio.Schema(
            {
                probatio.Optional("days"): probatio.Any(
                    probatio.All([probatio.Coerce(Day)], probatio.Unique()),
                ),
                probatio.Optional("recurrence"): probatio.All(
                    str, probatio.Coerce(ScheduleRecurrence)
                ),
                probatio.Optional("time"): probatio.Any(cv.time, None),
            }
        ),
    }
)
def handle_config_update(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Update the stored backup config."""
    manager = hass.data[DATA_MANAGER]
    changes = dict(msg)
    changes.pop("id")
    changes.pop("type")
    manager.config.update(**changes)
    connection.send_result(msg["id"])


@websocket_api.require_admin
@websocket_api.websocket_command({probatio.Required("type"): "backup/subscribe_events"})
@websocket_api.async_response
async def handle_subscribe_events(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Subscribe to backup events."""

    def on_event(event: ManagerStateEvent) -> None:
        connection.send_message(websocket_api.event_message(msg["id"], event))

    manager = hass.data[DATA_MANAGER]
    on_event(manager.last_event)
    for upload_event in manager.last_upload_events.values():
        on_event(upload_event)
    connection.subscriptions[msg["id"]] = manager.async_subscribe_events(on_event)
    connection.send_result(msg["id"])
