"""WebSocket commands for sending camera recordings to cloud drives."""

from typing import Any

import probatio

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from .cloud import DRIVES
from .uploader import MAX_KEEP_DAYS, MIN_KEEP_DAYS, SEND_CHOICES, async_get_uploader


@callback
def async_register_cloud_websocket(hass: HomeAssistant) -> None:
    """Register the commands."""
    websocket_api.async_register_command(hass, ws_cloud_status)
    websocket_api.async_register_command(hass, ws_cloud_set)


@websocket_api.require_admin
@websocket_api.websocket_command(
    {probatio.Required("type"): "camera_recording/cloud/status"}
)
@websocket_api.async_response
async def ws_cloud_status(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Each cloud drive: whether it is set up, what is sent, waiting and sent."""
    uploader = await async_get_uploader(hass)
    connection.send_result(msg["id"], uploader.status())


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "camera_recording/cloud/set",
        probatio.Required("drive"): probatio.In(DRIVES),
        probatio.Optional("enabled"): bool,
        probatio.Optional("video_leaves_home_confirmed"): bool,
        probatio.Optional("send"): probatio.In(SEND_CHOICES),
        probatio.Optional("keep_days"): probatio.Any(
            None,
            probatio.All(int, probatio.Range(min=MIN_KEEP_DAYS, max=MAX_KEEP_DAYS)),
        ),
    }
)
@websocket_api.async_response
async def ws_cloud_set(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Change one drive. Turning it on needs the owner's confirmation that video leaves the home."""
    uploader = await async_get_uploader(hass)
    drive = msg["drive"]
    enabled = msg.get("enabled")
    if enabled:
        if not uploader.drives[drive].set_up:
            connection.send_error(
                msg["id"], "not_set_up", "Set up the drive's integration first"
            )
            return
        if not msg.get("video_leaves_home_confirmed"):
            connection.send_error(
                msg["id"],
                "confirmation_required",
                "Confirm that video will leave the home before turning this on",
            )
            return
    await uploader.async_set(drive, enabled=enabled, send=msg.get("send"))
    if "keep_days" in msg:
        await uploader.async_set_keep_days(drive, msg["keep_days"])
    connection.send_result(msg["id"], uploader.status())
