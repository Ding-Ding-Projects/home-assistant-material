"""WebSocket commands for exporting and importing integrations.

Every command is for admins only. No command response, error or log line ever
carries the value of a sign-in or the password.
"""

from typing import Any

import probatio

from homeassistant.components import websocket_api
from homeassistant.components.registry_storage.errors import LockError, Reason
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback

from .const import DATA_UNDO, MAX_COMPARE_DOMAINS, MAX_FILE_BYTES
from .listing import async_build_list, async_compare
from .settings import (
    TransferError,
    async_export_plain,
    export_locked,
    plan_changes,
    read_settings_file,
)
from .signins import async_diagnostics_redact_names
from .undo import SettingsUndo

_CONTENT = probatio.All(str, probatio.Length(max=MAX_FILE_BYTES))
_PASSWORD = probatio.All(str, probatio.Length(max=1024))


@callback
def async_register(hass: HomeAssistant) -> None:
    """Register the commands."""
    websocket_api.async_register_command(hass, ws_list)
    websocket_api.async_register_command(hass, ws_compare)
    websocket_api.async_register_command(hass, ws_settings_export)
    websocket_api.async_register_command(hass, ws_settings_export_locked)
    websocket_api.async_register_command(hass, ws_settings_preview)
    websocket_api.async_register_command(hass, ws_settings_apply)
    websocket_api.async_register_command(hass, ws_settings_undo)
    websocket_api.async_register_command(hass, ws_settings_undo_info)


def _entry(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> ConfigEntry | None:
    """Return the entry the message names, or answer not found."""
    entry = hass.config_entries.async_get_entry(msg["entry_id"])
    if entry is None:
        connection.send_error(msg["id"], "not_found", "Config entry not found")
    return entry


def _refuse(
    connection: websocket_api.ActiveConnection, msg_id: int, code: str
) -> None:
    """Answer with a code only; the code doubles as the message."""
    connection.send_error(msg_id, code, code)


def _undo(hass: HomeAssistant) -> SettingsUndo:
    return hass.data[DATA_UNDO]


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "integration_transfer/list",
        probatio.Optional("titles", default=False): bool,
        probatio.Optional("counts", default=True): bool,
    }
)
@websocket_api.async_response
async def ws_list(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return the list of installed integrations, as it is written to the file."""
    connection.send_result(
        msg["id"],
        await async_build_list(hass, titles=msg["titles"], counts=msg["counts"]),
    )


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "integration_transfer/compare",
        probatio.Required("domains"): probatio.All(
            [probatio.All(str, probatio.Length(max=200))],
            probatio.Length(max=MAX_COMPARE_DOMAINS),
        ),
    }
)
@websocket_api.async_response
async def ws_compare(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Report what this system knows about each domain named in an imported list."""
    connection.send_result(msg["id"], await async_compare(hass, msg["domains"]))


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "integration_transfer/settings/export",
        probatio.Required("entry_id"): str,
    }
)
@websocket_api.async_response
async def ws_settings_export(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return one entry's settings without sign-ins, and the names left out."""
    if (entry := _entry(hass, connection, msg)) is None:
        return
    connection.send_result(msg["id"], await async_export_plain(hass, entry))


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "integration_transfer/settings/export_locked",
        probatio.Required("entry_id"): str,
        probatio.Required("password"): _PASSWORD,
        probatio.Required("password_confirm"): _PASSWORD,
        probatio.Optional("confirmed", default=False): bool,
    }
)
@websocket_api.async_response
async def ws_settings_export_locked(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return one entry's full settings, sign-ins included, locked with a password."""
    if not msg["confirmed"]:
        _refuse(connection, msg["id"], "confirmation_required")
        return
    if (entry := _entry(hass, connection, msg)) is None:
        return
    try:
        locked = await hass.async_add_executor_job(
            export_locked, entry, msg["password"], msg["password_confirm"]
        )
    except LockError as err:
        code = (
            "password_mismatch"
            if err.reason is Reason.PASSWORD_MISMATCH
            else "password_too_weak"
        )
        _refuse(connection, msg["id"], code)
        return
    connection.send_result(msg["id"], locked)


async def _async_plan(
    hass: HomeAssistant, entry: ConfigEntry, msg: dict[str, Any]
) -> tuple[dict[str, Any], dict[str, Any], list[dict[str, Any]], list[str]]:
    """Read the file against the entry and work out what would change."""
    parsed = await hass.async_add_executor_job(
        read_settings_file, msg["content"], entry, msg.get("password")
    )
    extra = await async_diagnostics_redact_names(hass, entry.domain)
    return plan_changes(entry, parsed, extra)


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "integration_transfer/settings/preview",
        probatio.Required("entry_id"): str,
        probatio.Required("content"): _CONTENT,
        probatio.Optional("password"): _PASSWORD,
    }
)
@websocket_api.async_response
async def ws_settings_preview(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Show every change an imported file would make, by name. Changes nothing."""
    if (entry := _entry(hass, connection, msg)) is None:
        return
    try:
        _, _, changes, signins_in_file = await _async_plan(hass, entry, msg)
    except TransferError as err:
        _refuse(connection, msg["id"], err.code)
        return
    connection.send_result(
        msg["id"],
        {
            "domain": entry.domain,
            "changes": changes,
            "signins_in_file": signins_in_file,
            "undo": _undo(hass).info(entry.entry_id),
        },
    )


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "integration_transfer/settings/apply",
        probatio.Required("entry_id"): str,
        probatio.Required("content"): _CONTENT,
        probatio.Optional("password"): _PASSWORD,
        probatio.Optional("confirmed", default=False): bool,
    }
)
@websocket_api.async_response
async def ws_settings_apply(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Apply an imported file to the entry it fits; keep the old settings for Undo."""
    if not msg["confirmed"]:
        _refuse(connection, msg["id"], "confirmation_required")
        return
    if (entry := _entry(hass, connection, msg)) is None:
        return
    try:
        options, data, changes, _ = await _async_plan(hass, entry, msg)
        if not [change for change in changes if change["change"] != "kept"]:
            raise TransferError("no_changes")
        await _undo(hass).async_apply(entry, data, options)
    except TransferError as err:
        _refuse(connection, msg["id"], err.code)
        return
    connection.send_result(
        msg["id"],
        {
            "changed": sum(1 for change in changes if change["change"] != "kept"),
            "undo": _undo(hass).info(entry.entry_id),
        },
    )


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "integration_transfer/settings/undo",
        probatio.Required("entry_id"): str,
    }
)
@websocket_api.async_response
async def ws_settings_undo(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Put back the settings as they were before the latest import."""
    if (entry := _entry(hass, connection, msg)) is None:
        return
    try:
        await _undo(hass).async_undo(entry)
    except TransferError as err:
        _refuse(connection, msg["id"], err.code)
        return
    connection.send_result(msg["id"], {"undo": _undo(hass).info(entry.entry_id)})


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "integration_transfer/settings/undo_info",
        probatio.Required("entry_id"): str,
    }
)
@websocket_api.async_response
async def ws_settings_undo_info(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return whether an import of this entry can be undone."""
    if (entry := _entry(hass, connection, msg)) is None:
        return
    connection.send_result(msg["id"], _undo(hass).info(entry.entry_id))
