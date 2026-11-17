"""Keep unsaved edits of automations, scripts and scenes as drafts.

The editors send their newest state a moment after every change. Each state is
a commit in a temporary Git repository that sits in a folder Home Assistant
never loads, so a draft can never run, reload anything or touch a file that is
live. The live item only changes when the owner presses Save, and a draft is
then removed. After a crash or a restart the editor offers the draft back.
"""

from datetime import datetime, timedelta
import logging
from pathlib import Path
import shutil
from typing import Any

import probatio

from homeassistant.components import websocket_api
from homeassistant.core import CALLBACK_TYPE, HomeAssistant, callback
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.helpers.typing import ConfigType
from homeassistant.util.hass_dict import HassKey

from .store import KINDS, DraftError, DraftRepository

DOMAIN = "editor_drafts"

CONFIG_SCHEMA = cv.empty_config_schema(DOMAIN)

# Inside the folder that backups leave out and that no loader scans.
STORAGE_PATH = (".cache", DOMAIN)
PURGE_INTERVAL = timedelta(hours=12)

_LOGGER = logging.getLogger(__name__)

DATA_REPOSITORY: HassKey[DraftRepository] = HassKey(DOMAIN)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up the editor drafts."""
    if shutil.which("git") is None:
        _LOGGER.warning("Git is not installed, so editor drafts are not kept")
    repository = DraftRepository(Path(hass.config.path(*STORAGE_PATH)))
    hass.data[DATA_REPOSITORY] = repository

    async def _purge(now: datetime | None = None) -> None:
        try:
            await hass.async_add_executor_job(repository.purge_expired)
        except DraftError, OSError:
            _LOGGER.debug("Old editor drafts could not be removed", exc_info=True)

    @callback
    def _tick(now: datetime) -> None:
        hass.async_create_background_task(_purge(now), "editor drafts purge")

    unsub: CALLBACK_TYPE = async_track_time_interval(hass, _tick, PURGE_INTERVAL)
    hass.bus.async_listen_once("homeassistant_stop", lambda _event: unsub())

    for command in (
        websocket_save,
        websocket_get,
        websocket_list,
        websocket_history,
        websocket_restore_version,
        websocket_discard,
    ):
        websocket_api.async_register_command(hass, command)
    hass.async_create_background_task(_purge(), "editor drafts purge")
    return True


async def _run(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    func: Any,
    *args: Any,
) -> None:
    try:
        result = await hass.async_add_executor_job(func, *args)
    except DraftError as err:
        connection.send_error(msg["id"], err.code, str(err))
    except OSError:
        connection.send_error(msg["id"], "unavailable", "Drafts cannot be kept.")
    else:
        connection.send_result(msg["id"], result)


KIND = probatio.In(KINDS)
ITEM_ID = probatio.All(str, probatio.Length(min=1, max=64))


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "editor_drafts/save",
        probatio.Required("kind"): KIND,
        probatio.Required("item_id"): ITEM_ID,
        probatio.Required("config"): dict,
        probatio.Optional("base_hash"): probatio.Any(
            None, probatio.All(str, probatio.Length(max=128))
        ),
        probatio.Optional("meta"): dict,
    }
)
@websocket_api.async_response
async def websocket_save(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Store the newest state of a draft."""
    await _run(
        hass,
        connection,
        msg,
        hass.data[DATA_REPOSITORY].save,
        msg["kind"],
        msg["item_id"],
        msg["config"],
        msg.get("base_hash"),
        msg.get("meta"),
    )


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "editor_drafts/get",
        probatio.Required("kind"): KIND,
        probatio.Required("item_id"): ITEM_ID,
    }
)
@websocket_api.async_response
async def websocket_get(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Return one draft, or nothing."""
    await _run(
        hass,
        connection,
        msg,
        hass.data[DATA_REPOSITORY].get,
        msg["kind"],
        msg["item_id"],
    )


@websocket_api.require_admin
@websocket_api.websocket_command({probatio.Required("type"): "editor_drafts/list"})
@websocket_api.async_response
async def websocket_list(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Return every draft without its content."""
    await _run(hass, connection, msg, hass.data[DATA_REPOSITORY].list)


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "editor_drafts/history",
        probatio.Required("kind"): KIND,
        probatio.Required("item_id"): ITEM_ID,
    }
)
@websocket_api.async_response
async def websocket_history(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Return the autosaves of one draft."""
    await _run(
        hass,
        connection,
        msg,
        hass.data[DATA_REPOSITORY].history,
        msg["kind"],
        msg["item_id"],
    )


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "editor_drafts/restore_version",
        probatio.Required("kind"): KIND,
        probatio.Required("item_id"): ITEM_ID,
        probatio.Required("sha"): str,
    }
)
@websocket_api.async_response
async def websocket_restore_version(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Make an earlier autosave the current draft and return it."""
    await _run(
        hass,
        connection,
        msg,
        hass.data[DATA_REPOSITORY].restore_version,
        msg["kind"],
        msg["item_id"],
        msg["sha"],
    )


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "editor_drafts/discard",
        probatio.Required("kind"): KIND,
        probatio.Required("item_id"): ITEM_ID,
    }
)
@websocket_api.async_response
async def websocket_discard(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Remove a draft."""
    await _run(
        hass,
        connection,
        msg,
        hass.data[DATA_REPOSITORY].discard,
        msg["kind"],
        msg["item_id"],
    )
