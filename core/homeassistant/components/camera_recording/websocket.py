"""WebSocket commands for the camera timeline and the recording status."""

from typing import Any

import probatio

from homeassistant.auth.permissions.const import POLICY_READ
from homeassistant.components import websocket_api
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import Unauthorized
from homeassistant.helpers import config_validation as cv
from homeassistant.util import dt as dt_util

from .const import DOMAIN
from .manager import RecordingManager

MAX_WINDOW_SECONDS = 8 * 86400


def _managers(hass: HomeAssistant) -> list[RecordingManager]:
    return [
        entry.runtime_data
        for entry in hass.config_entries.async_entries(DOMAIN)
        if entry.state is ConfigEntryState.LOADED
    ]


@callback
def async_register_websocket(hass: HomeAssistant) -> None:
    """Register the commands."""
    websocket_api.async_register_command(hass, ws_segments)
    websocket_api.async_register_command(hass, ws_status)
    websocket_api.async_register_command(hass, ws_pause)


@websocket_api.websocket_command(
    {
        probatio.Required("type"): "camera_recording/segments",
        probatio.Required("entity_id"): cv.entity_id,
        probatio.Required("start_time"): str,
        probatio.Required("end_time"): str,
    }
)
@callback
def ws_segments(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Recorded segments of one camera between two times, from every destination."""
    entity_id = msg["entity_id"]
    if not connection.user.permissions.check_entity(entity_id, POLICY_READ):
        raise Unauthorized(entity_id=entity_id)
    start = dt_util.parse_datetime(msg["start_time"])
    end = dt_util.parse_datetime(msg["end_time"])
    if start is None or end is None or end <= start:
        connection.send_error(
            msg["id"], "invalid_time", "Give a start time before the end time"
        )
        return
    if (end - start).total_seconds() > MAX_WINDOW_SECONDS:
        connection.send_error(
            msg["id"], "invalid_time", "Ask for at most 8 days at a time"
        )
        return
    recorded = False
    segments: list[dict[str, Any]] = []
    for manager in _managers(hass):
        if entity_id not in manager.cameras:
            continue
        recorded = True
        segments.extend(
            {
                "entry_id": manager.entry.entry_id,
                "name": seg.name,
                "start": seg.start,
                "end": seg.end,
                "size": seg.size,
                "here": seg.local,
            }
            for seg in manager.segments_between(
                entity_id, start.timestamp(), end.timestamp()
            )
        )
    states = [
        manager.recorders[entity_id].state
        for manager in _managers(hass)
        if entity_id in manager.recorders
    ]
    segments.sort(key=lambda seg: seg["start"])
    connection.send_result(
        msg["id"],
        {
            "recorded": recorded,
            "recording": any(state == "recording" for state in states),
            "states": states,
            "segments": segments,
        },
    )


@websocket_api.require_admin
@websocket_api.websocket_command({probatio.Required("type"): "camera_recording/status"})
@callback
def ws_status(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Every destination with its cameras, space and copy state."""
    connection.send_result(msg["id"], [manager.status() for manager in _managers(hass)])


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "camera_recording/pause",
        probatio.Required("entry_id"): str,
        probatio.Optional("entity_id"): cv.entity_id,
        probatio.Required("paused"): bool,
    }
)
@websocket_api.async_response
async def ws_pause(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Pause or resume one camera, or every camera of a destination."""
    manager = next(
        (m for m in _managers(hass) if m.entry.entry_id == msg["entry_id"]), None
    )
    if manager is None:
        connection.send_error(msg["id"], "not_found", "No such recording destination")
        return
    cameras = [msg["entity_id"]] if "entity_id" in msg else list(manager.cameras)
    if any(cam not in manager.recorders for cam in cameras):
        connection.send_error(
            msg["id"], "not_found", "That camera is not recorded here"
        )
        return
    for cam in cameras:
        await manager.async_set_paused(cam, msg["paused"])
    connection.send_result(msg["id"], manager.status())
