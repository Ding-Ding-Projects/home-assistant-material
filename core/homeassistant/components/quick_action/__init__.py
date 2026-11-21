"""Run an unsaved sequence once, and list or stop it while it runs.

A quick action is started from the interface by an administrator. It runs on
the server, so it keeps going when the page is closed, and it can be listed
and stopped from any browser. Runs are kept in memory only: nothing is written
to disk or to the configuration, and a quick action never survives a restart.
Every run still going when Home Assistant stops is stopped.
"""

from typing import Any

import probatio

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.script import async_validate_actions_config
from homeassistant.helpers.typing import ConfigType

from .runner import (
    DATA_RUNNER,
    DOMAIN,
    MAX_LABEL_LENGTH,
    QuickActionRunner,
    ShuttingDownError,
    TooManyRunsError,
)

CONFIG_SCHEMA = cv.empty_config_schema(DOMAIN)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up the runner and its websocket commands."""
    hass.data[DATA_RUNNER] = QuickActionRunner(hass)
    websocket_api.async_register_command(hass, websocket_run)
    websocket_api.async_register_command(hass, websocket_list)
    websocket_api.async_register_command(hass, websocket_stop)
    websocket_api.async_register_command(hass, websocket_subscribe)
    return True


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "quick_action/run",
        probatio.Required("sequence"): cv.SCRIPT_SCHEMA,
        probatio.Optional("entity_id"): cv.entity_id,
        probatio.Optional("label", default=""): probatio.All(
            str, probatio.Length(max=MAX_LABEL_LENGTH)
        ),
    }
)
@websocket_api.async_response
async def websocket_run(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Start a quick action and return its id without waiting for it to end."""
    sequence = await async_validate_actions_config(hass, msg["sequence"])
    try:
        run_id = hass.data[DATA_RUNNER].async_start(
            sequence,
            connection.context(msg),
            label=msg["label"],
            entity_id=msg.get("entity_id"),
        )
    except TooManyRunsError as err:
        connection.send_error(msg["id"], "too_many_runs", str(err))
        return
    except ShuttingDownError as err:
        connection.send_error(msg["id"], "shutting_down", str(err))
        return
    connection.send_result(msg["id"], {"id": run_id})


@websocket_api.require_admin
@websocket_api.websocket_command({probatio.Required("type"): "quick_action/list"})
@callback
def websocket_list(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Send the running and recently ended quick actions."""
    connection.send_result(msg["id"], {"runs": hass.data[DATA_RUNNER].async_runs()})


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "quick_action/stop",
        probatio.Required("run_id"): str,
    }
)
@websocket_api.async_response
async def websocket_stop(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Stop one quick action; stopping one that already ended succeeds."""
    if not await hass.data[DATA_RUNNER].async_stop(msg["run_id"]):
        connection.send_error(
            msg["id"], websocket_api.ERR_NOT_FOUND, "No such quick action"
        )
        return
    connection.send_result(msg["id"])


@websocket_api.require_admin
@websocket_api.websocket_command(
    {probatio.Required("type"): "quick_action/subscribe"}
)
@callback
def websocket_subscribe(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Send the list now and again whenever it changes."""
    runner = hass.data[DATA_RUNNER]

    @callback
    def _send() -> None:
        connection.send_message(
            websocket_api.event_message(msg["id"], {"runs": runner.async_runs()})
        )

    connection.subscriptions[msg["id"]] = runner.async_add_listener(_send)
    connection.send_result(msg["id"])
    _send()
