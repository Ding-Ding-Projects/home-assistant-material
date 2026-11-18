"""Websocket commands for the AC Defender and Heat Defender pages."""

from typing import Any

import probatio

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from .coordinator import DefenderCoordinator


def _coordinator(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> DefenderCoordinator | None:
    entry = hass.config_entries.async_get_entry(msg["entry_id"])
    coordinator = getattr(entry, "runtime_data", None)
    if not isinstance(coordinator, DefenderCoordinator):
        connection.send_error(msg["id"], "not_found", "Defender not found")
        return None
    return coordinator


@callback
def async_register_websocket(hass: HomeAssistant) -> None:
    """Register the commands."""
    websocket_api.async_register_command(hass, ws_info)
    websocket_api.async_register_command(hass, ws_set_guard)
    websocket_api.async_register_command(hass, ws_set_temperature)
    websocket_api.async_register_command(hass, ws_set_floor)
    websocket_api.async_register_command(hass, ws_control)


@websocket_api.websocket_command(
    {probatio.Required("type"): "ac_defender/info", probatio.Required("entry_id"): str}
)
@callback
def ws_info(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return the state, the guards with their settings, the log and the cost."""
    if (coordinator := _coordinator(hass, connection, msg)) is not None:
        connection.send_result(msg["id"], coordinator.info())


@websocket_api.websocket_command(
    {
        probatio.Required("type"): "ac_defender/set_guard",
        probatio.Required("entry_id"): str,
        probatio.Required("guard"): str,
        probatio.Required("enabled"): bool,
        probatio.Optional("confirmed", default=False): bool,
    }
)
@websocket_api.require_admin
@callback
def ws_set_guard(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Switch a guard; turning a safety guard off needs the two-key confirmation."""
    if (coordinator := _coordinator(hass, connection, msg)) is None:
        return
    spec = next(
        (g.spec for g in coordinator.guards if g.spec.key == msg["guard"]), None
    )
    if spec is None:
        connection.send_error(msg["id"], "not_found", "Guard not found")
        return
    if spec.safety and not msg["enabled"] and not msg["confirmed"]:
        connection.send_error(
            msg["id"],
            "confirmation_required",
            "Turning a safety guard off needs confirmation",
        )
        return
    coordinator.set_guard_enabled(spec.key, msg["enabled"])
    connection.send_result(msg["id"], {"guard": spec.key, "enabled": msg["enabled"]})


@websocket_api.websocket_command(
    {
        probatio.Required("type"): "ac_defender/set_temperature",
        probatio.Required("entry_id"): str,
        probatio.Required("value"): probatio.Coerce(float),
    }
)
@websocket_api.require_admin
@callback
def ws_set_temperature(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Set the held temperature; the Heat Defender clamps it to the floor rules."""
    if (coordinator := _coordinator(hass, connection, msg)) is None:
        return
    try:
        value = coordinator.validate_temperature(msg["value"])
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_temperature", str(err))
        return
    coordinator.set_my_temperature(value)
    connection.send_result(msg["id"], {"value": value})


@websocket_api.websocket_command(
    {
        probatio.Required("type"): "ac_defender/set_floor",
        probatio.Required("entry_id"): str,
        probatio.Required("value"): probatio.Coerce(float),
    }
)
@websocket_api.require_admin
@callback
def ws_set_floor(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Set the Heat Defender floor; a value under the hard minimum is refused."""
    if (coordinator := _coordinator(hass, connection, msg)) is None:
        return
    if coordinator.run_mode != "heat":
        connection.send_error(
            msg["id"], "not_supported", "Only the Heat Defender has a floor"
        )
        return
    try:
        coordinator.set_floor(msg["value"])
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_floor", str(err))
        return
    connection.send_result(msg["id"], {"value": msg["value"]})


@websocket_api.websocket_command(
    {
        probatio.Required("type"): "ac_defender/control",
        probatio.Required("entry_id"): str,
        probatio.Required("action"): probatio.In(["pause", "stop", "resume"]),
        probatio.Optional("hours"): probatio.All(
            probatio.Coerce(float), probatio.Range(min=0.25, max=24)
        ),
        probatio.Optional("also_sibling", default=False): bool,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_control(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Pause, stop everything or defend again, optionally for the sibling too."""
    if (coordinator := _coordinator(hass, connection, msg)) is None:
        return
    targets = [coordinator]
    if msg["also_sibling"] and (other := coordinator.sibling()) is not None:
        targets.append(other)
    for target in targets:
        if msg["action"] == "pause":
            target.start_pause(msg.get("hours", 1.0))
        elif msg["action"] == "stop":
            target.stop_everything()
        else:
            target.defend_again()
        await target.async_evaluate()
    connection.send_result(msg["id"])
