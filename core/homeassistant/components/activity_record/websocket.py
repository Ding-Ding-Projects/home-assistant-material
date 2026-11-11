"""WebSocket API of the permanent activity record. Every command is admin only."""

from typing import Any

import probatio

from homeassistant.components import websocket_api
from homeassistant.components.automation_repos.repos import mask_text
from homeassistant.core import HomeAssistant

from .const import (
    DAYS_LIMIT,
    DEFAULT_READ_LIMIT,
    DOMAIN,
    ERROR_GIT,
    ERROR_INVALID_DAY,
    READ_LIMIT,
    SEARCH_BYTES_DEFAULT,
    SEARCH_BYTES_MAX,
    SEARCH_LIMIT,
)
from .manager import ActivityRecorder
from .record_core import valid_day
from .repository import RepositoryError

_ERRORS = (RepositoryError, OSError)


def _send_error(
    connection: websocket_api.ActiveConnection, msg_id: int, err: Exception
) -> None:
    connection.send_error(msg_id, ERROR_GIT, mask_text(str(err)))


def _recorder(hass: HomeAssistant) -> ActivityRecorder:
    return hass.data[DOMAIN]


@websocket_api.require_admin
@websocket_api.websocket_command({probatio.Required("type"): "activity_record/status"})
@websocket_api.async_response
async def ws_status(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Return the status of the record."""
    try:
        result = await _recorder(hass).async_status()
    except _ERRORS as err:
        _send_error(connection, msg["id"], err)
        return
    connection.send_result(msg["id"], result)


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "activity_record/days",
        probatio.Optional("limit", default=DAYS_LIMIT): probatio.All(
            int, probatio.Range(min=1, max=DAYS_LIMIT)
        ),
        probatio.Optional("offset", default=0): probatio.All(
            int, probatio.Range(min=0)
        ),
    }
)
@websocket_api.async_response
async def ws_days(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """List the days that have entries."""
    try:
        result = await hass.async_add_executor_job(
            _recorder(hass).repository.days, msg["limit"], msg["offset"]
        )
    except _ERRORS as err:
        _send_error(connection, msg["id"], err)
        return
    connection.send_result(msg["id"], result)


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "activity_record/read",
        probatio.Required("day"): str,
        probatio.Optional("offset", default=0): probatio.All(
            int, probatio.Range(min=0)
        ),
        probatio.Optional("limit", default=DEFAULT_READ_LIMIT): probatio.All(
            int, probatio.Range(min=1, max=READ_LIMIT)
        ),
        probatio.Optional("newest_first", default=True): bool,
    }
)
@websocket_api.async_response
async def ws_read(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Read the entries of one day."""
    if valid_day(msg["day"]) is None:
        connection.send_error(msg["id"], ERROR_INVALID_DAY, "That is not a day.")
        return
    try:
        result = await hass.async_add_executor_job(
            _recorder(hass).repository.read,
            msg["day"],
            msg["offset"],
            msg["limit"],
            msg["newest_first"],
        )
    except _ERRORS as err:
        _send_error(connection, msg["id"], err)
        return
    connection.send_result(msg["id"], result)


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "activity_record/search",
        probatio.Optional("start"): str,
        probatio.Optional("end"): str,
        probatio.Optional("entity_id"): str,
        probatio.Optional("text"): probatio.All(str, probatio.Length(max=200)),
        probatio.Optional("limit", default=DEFAULT_READ_LIMIT): probatio.All(
            int, probatio.Range(min=1, max=SEARCH_LIMIT)
        ),
        probatio.Optional("max_bytes", default=SEARCH_BYTES_DEFAULT): probatio.All(
            int, probatio.Range(min=1024, max=SEARCH_BYTES_MAX)
        ),
    }
)
@websocket_api.async_response
async def ws_search(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Search a range of days within a bounded amount of data."""
    for key in ("start", "end"):
        if key in msg and valid_day(msg[key]) is None:
            connection.send_error(msg["id"], ERROR_INVALID_DAY, "That is not a day.")
            return
    try:
        result = await hass.async_add_executor_job(
            _recorder(hass).repository.search,
            msg.get("start"),
            msg.get("end"),
            msg.get("entity_id"),
            msg.get("text"),
            msg["limit"],
            msg["max_bytes"],
        )
    except _ERRORS as err:
        _send_error(connection, msg["id"], err)
        return
    connection.send_result(msg["id"], result)


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "activity_record/set_remote",
        probatio.Optional("url"): probatio.Any(str, None),
    }
)
@websocket_api.async_response
async def ws_set_remote(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Set or remove the Git remote of the record."""
    try:
        await hass.async_add_executor_job(
            _recorder(hass).repository.set_remote, msg.get("url")
        )
    except _ERRORS as err:
        _send_error(connection, msg["id"], err)
        return
    connection.send_result(msg["id"])


@websocket_api.require_admin
@websocket_api.websocket_command({probatio.Required("type"): "activity_record/push"})
@websocket_api.async_response
async def ws_push(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Send the record to its Git remote."""
    recorder = _recorder(hass)
    try:
        await hass.async_add_executor_job(recorder.repository.commit)
        result = await hass.async_add_executor_job(recorder.repository.push)
    except _ERRORS as err:
        _send_error(connection, msg["id"], err)
        return
    connection.send_result(msg["id"], result)
