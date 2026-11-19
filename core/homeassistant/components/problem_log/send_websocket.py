"""WebSocket commands for sending the problem log. Every one is for admins only.

No command ever returns the sign-in.
"""

from collections.abc import Awaitable, Callable
from functools import wraps
from typing import Any

import probatio

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.util.hass_dict import HassKey

from .send_manager import MODES, ProblemLogSender, SendRefused

DATA_SENDER: HassKey[ProblemLogSender] = HassKey("problem_log_sender")

_Handler = Callable[
    [HomeAssistant, websocket_api.ActiveConnection, dict[str, Any], ProblemLogSender],
    Awaitable[Any],
]


def _refusals(handler: _Handler) -> Callable[..., Awaitable[None]]:
    """Run a handler; send its result, or the plain code of a refusal."""

    @wraps(handler)
    async def wrapper(
        hass: HomeAssistant,
        connection: websocket_api.ActiveConnection,
        msg: dict[str, Any],
    ) -> None:
        sender = hass.data[DATA_SENDER]
        try:
            result = await handler(hass, connection, msg, sender)
        except SendRefused as err:
            connection.send_error(msg["id"], err.code, err.code)
            return
        connection.send_result(msg["id"], result)

    return wrapper


@websocket_api.require_admin
@websocket_api.websocket_command({probatio.Required("type"): "problem_log/send/state"})
@websocket_api.async_response
@_refusals
async def ws_state(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    sender: ProblemLogSender,
) -> dict[str, Any]:
    """Return the settings and the state of sending."""
    return await sender.async_state()


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "problem_log/send/update",
        probatio.Optional("enabled"): bool,
        probatio.Optional("mode"): probatio.In(MODES),
        probatio.Optional("repository"): probatio.All(str, probatio.Length(max=300)),
        probatio.Optional("keep_names"): bool,
        probatio.Optional("client_id"): probatio.All(str, probatio.Length(max=100)),
    }
)
@websocket_api.async_response
@_refusals
async def ws_update(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    sender: ProblemLogSender,
) -> dict[str, Any]:
    """Change the settings."""
    changes = {k: v for k, v in msg.items() if k not in ("id", "type")}
    await sender.async_update_settings(changes)
    return await sender.async_state()


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "problem_log/send/set_token",
        probatio.Required("token"): probatio.All(str, probatio.Length(min=1, max=500)),
    }
)
@websocket_api.async_response
@_refusals
async def ws_set_token(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    sender: ProblemLogSender,
) -> dict[str, Any]:
    """Store an access token and check the repository with it."""
    await sender.async_set_token(msg["token"])
    return await sender.async_state()


@websocket_api.require_admin
@websocket_api.websocket_command(
    {probatio.Required("type"): "problem_log/send/sign_out"}
)
@websocket_api.async_response
@_refusals
async def ws_sign_out(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    sender: ProblemLogSender,
) -> dict[str, Any]:
    """Forget the sign-in."""
    await sender.async_sign_out()
    return await sender.async_state()


@websocket_api.require_admin
@websocket_api.websocket_command(
    {probatio.Required("type"): "problem_log/send/device_start"}
)
@websocket_api.async_response
@_refusals
async def ws_device_start(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    sender: ProblemLogSender,
) -> dict[str, Any]:
    """Start the guided sign-in with a code."""
    return await sender.async_device_start()


@websocket_api.require_admin
@websocket_api.websocket_command(
    {probatio.Required("type"): "problem_log/send/device_cancel"}
)
@websocket_api.async_response
@_refusals
async def ws_device_cancel(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    sender: ProblemLogSender,
) -> dict[str, Any]:
    """Stop waiting for approval."""
    await sender.async_device_cancel()
    return await sender.async_state()


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "problem_log/send/hold",
        probatio.Required("file"): probatio.All(str, probatio.Length(min=1, max=200)),
        probatio.Required("held"): bool,
    }
)
@websocket_api.async_response
@_refusals
async def ws_hold(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    sender: ProblemLogSender,
) -> dict[str, Any]:
    """Hold a problem back, or let it be sent again."""
    await sender.async_hold(msg["file"], msg["held"])
    return await sender.async_state()


@websocket_api.require_admin
@websocket_api.websocket_command(
    {probatio.Required("type"): "problem_log/send/preview"}
)
@websocket_api.async_response
@_refusals
async def ws_preview(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    sender: ProblemLogSender,
) -> dict[str, Any]:
    """Return the exact files the next send would write."""
    return {"files": await sender.async_preview()}


@websocket_api.require_admin
@websocket_api.websocket_command({probatio.Required("type"): "problem_log/send/test"})
@websocket_api.async_response
@_refusals
async def ws_test(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    sender: ProblemLogSender,
) -> dict[str, Any]:
    """Check the repository and the sign-in without sending."""
    return await sender.async_test()


@websocket_api.require_admin
@websocket_api.websocket_command(
    {probatio.Required("type"): "problem_log/send/send_now"}
)
@websocket_api.async_response
@_refusals
async def ws_send_now(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    sender: ProblemLogSender,
) -> dict[str, Any]:
    """Send now, if the hourly limit and every other rule allow it."""
    return await sender.async_send()


@callback
def async_register(hass: HomeAssistant) -> None:
    """Register every command."""
    for handler in (
        ws_state,
        ws_update,
        ws_set_token,
        ws_sign_out,
        ws_device_start,
        ws_device_cancel,
        ws_hold,
        ws_preview,
        ws_test,
        ws_send_now,
    ):
        websocket_api.async_register_command(hass, handler)
