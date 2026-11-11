"""Git repositories for automations.

Every automation gets its own Git repository, and all of them sit inside one
master repository. Saving an automation commits it. One push commits every
automation that changed, then the master, and sends them to their remotes
where a remote is set.

The repositories live in `automation_repos` inside the configuration folder.
The work with Git is in `repos.py`; this file reads the automations and
offers the commands the interface uses.
"""

import asyncio
from dataclasses import dataclass, field
import logging
from pathlib import Path
from typing import Any

import probatio
import yaml

from homeassistant.components import websocket_api
from homeassistant.components.automation import EVENT_AUTOMATION_RELOADED
from homeassistant.components.automation.config import async_validate_config_item  # pylint: disable=home-assistant-component-root-import
from homeassistant.config import AUTOMATION_CONFIG_PATH
from homeassistant.const import CONF_ID
from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv, start
from homeassistant.helpers.typing import ConfigType
from homeassistant.util.hass_dict import HassKey
from homeassistant.util.yaml import load_yaml

from .repos import AutomationRepositories, RepositoryError, mask_text

DOMAIN = "automation_repos"
_LOGGER = logging.getLogger(__name__)

CONFIG_SCHEMA = cv.empty_config_schema(DOMAIN)

DATA_REPOSITORIES: HassKey[AutomationRepositories] = HassKey(DOMAIN)


@dataclass
class _Recorder:
    """Runs the saves of automation history one at a time.

    While one run waits for the lock, further requests add nothing: the run
    reads the newest saved automations when its turn comes.
    """

    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    waiting: bool = False
    errors: dict[str, str] = field(default_factory=dict)


DATA_RECORDER: HassKey[_Recorder] = HassKey(f"{DOMAIN}_recorder")

ERROR_GIT = "git_error"
ERROR_UNREADABLE = "automations_unreadable"


def _read_automations(path: str) -> dict[str, dict[str, Any]]:
    """Read the automations the editor manages, by id.

    The file is read without secrets. If it refers to one, reading fails,
    so a password can never end up in a commit.
    """
    try:
        data = load_yaml(path)
    except FileNotFoundError:
        return {}
    if not data:
        return {}
    if not isinstance(data, list):
        raise HomeAssistantError("The automations file does not hold a list.")
    return {
        str(item[CONF_ID]): dict(item)
        for item in data
        if isinstance(item, dict) and item.get(CONF_ID) is not None
    }


async def _async_read_automations(hass: HomeAssistant) -> dict[str, dict[str, Any]]:
    return await hass.async_add_executor_job(
        _read_automations, hass.config.path(AUTOMATION_CONFIG_PATH)
    )


async def _async_find_invalid(
    hass: HomeAssistant, configs: dict[str, dict[str, Any]]
) -> dict[str, str]:
    """Return the automations that do not load, with the reason."""
    invalid: dict[str, str] = {}
    for automation_id, config in configs.items():
        try:
            await async_validate_config_item(hass, automation_id, dict(config))
        except (probatio.Invalid, HomeAssistantError) as err:
            invalid[automation_id] = str(err)[:300]
    return invalid


async def _async_record(hass: HomeAssistant) -> None:
    """Record every automation that changed. A failure is logged, never raised."""
    recorder = hass.data[DATA_RECORDER]
    if recorder.waiting:
        return
    recorder.waiting = True
    queued = True
    try:
        async with recorder.lock:
            recorder.waiting = False
            queued = False
            await _async_record_all(hass)
    except Exception:  # noqa: BLE001
        _LOGGER.exception("The automations were not committed")
    finally:
        if queued:
            recorder.waiting = False


async def _async_record_all(hass: HomeAssistant) -> None:
    repositories = hass.data[DATA_REPOSITORIES]
    recorder = hass.data[DATA_RECORDER]
    try:
        configs = await _async_read_automations(hass)
    except (HomeAssistantError, OSError) as err:
        _LOGGER.warning("Automations were not committed: %s", err)
        return
    try:
        moved = await hass.async_add_executor_job(
            repositories.archive_unlisted, configs
        )
    except OSError as err:
        _LOGGER.warning("History of deleted automations was not set aside: %s", err)
    else:
        if moved:
            _LOGGER.info("The history of deleted automations was moved: %s", moved)
    for automation_id, item in configs.items():
        try:
            await hass.async_add_executor_job(
                repositories.snapshot, automation_id, item
            )
        except (RepositoryError, OSError, yaml.YAMLError) as err:
            message = mask_text(str(err))
            if recorder.errors.get(automation_id) != message:
                _LOGGER.warning(
                    "Automation %s was not committed: %s", automation_id, message
                )
            recorder.errors[automation_id] = message
        else:
            recorder.errors.pop(automation_id, None)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up the automation repositories."""
    repositories = AutomationRepositories(Path(hass.config.path(DOMAIN)))
    hass.data[DATA_REPOSITORIES] = repositories
    hass.data[DATA_RECORDER] = _Recorder()

    async def _commit_saved(_event: Event) -> None:
        await _async_record(hass)

    async def _commit_existing(_hass: HomeAssistant) -> None:
        await _async_record(hass)

    hass.bus.async_listen(EVENT_AUTOMATION_RELOADED, _commit_saved)
    start.async_at_started(hass, _commit_existing)

    websocket_api.async_register_command(hass, websocket_status)
    websocket_api.async_register_command(hass, websocket_history)
    websocket_api.async_register_command(hass, websocket_version)
    websocket_api.async_register_command(hass, websocket_diff)
    websocket_api.async_register_command(hass, websocket_push)
    websocket_api.async_register_command(hass, websocket_forget)
    websocket_api.async_register_command(hass, websocket_record)
    websocket_api.async_register_command(hass, websocket_set_remote)
    return True


def _send_error(
    connection: websocket_api.ActiveConnection, msg_id: int, err: Exception
) -> None:
    code = ERROR_GIT if isinstance(err, RepositoryError) else ERROR_UNREADABLE
    connection.send_error(msg_id, code, mask_text(str(err)))


@websocket_api.require_admin
@websocket_api.websocket_command({probatio.Required("type"): "automation_repos/status"})
@websocket_api.async_response
async def websocket_status(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Describe every automation repository and the master."""
    repositories = hass.data[DATA_REPOSITORIES]
    try:
        configs = await _async_read_automations(hass)
        result = await hass.async_add_executor_job(repositories.status, configs)
    except (RepositoryError, HomeAssistantError, OSError) as err:
        _send_error(connection, msg["id"], err)
        return
    connection.send_result(msg["id"], result)


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "automation_repos/history",
        probatio.Required("automation_id"): str,
        probatio.Optional("limit", default=100): probatio.All(
            int, probatio.Range(min=1, max=500)
        ),
    }
)
@websocket_api.async_response
async def websocket_history(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return the commits of one automation, newest first."""
    repositories = hass.data[DATA_REPOSITORIES]
    try:
        commits = await hass.async_add_executor_job(
            repositories.history, msg["automation_id"], msg["limit"]
        )
    except (RepositoryError, OSError) as err:
        _send_error(connection, msg["id"], err)
        return
    connection.send_result(msg["id"], [commit.as_dict() for commit in commits])


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "automation_repos/version",
        probatio.Required("automation_id"): str,
        probatio.Required("sha"): str,
    }
)
@websocket_api.async_response
async def websocket_version(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return an automation as it was at a commit."""
    repositories = hass.data[DATA_REPOSITORIES]
    try:
        config = await hass.async_add_executor_job(
            repositories.version, msg["automation_id"], msg["sha"]
        )
    except (RepositoryError, OSError, yaml.YAMLError) as err:
        _send_error(connection, msg["id"], err)
        return
    connection.send_result(msg["id"], config)


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "automation_repos/diff",
        probatio.Required("automation_id"): str,
        probatio.Required("old"): str,
        probatio.Optional("new"): str,
    }
)
@websocket_api.async_response
async def websocket_diff(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return what changed between two commits, or a commit and now."""
    repositories = hass.data[DATA_REPOSITORIES]
    try:
        diff = await hass.async_add_executor_job(
            repositories.diff, msg["automation_id"], msg["old"], msg.get("new")
        )
    except (RepositoryError, OSError) as err:
        _send_error(connection, msg["id"], err)
        return
    connection.send_result(msg["id"], {"diff": diff})


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "automation_repos/push",
        probatio.Optional("message"): str,
        probatio.Optional("automation_ids"): [str],
    }
)
@websocket_api.async_response
async def websocket_push(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Commit every changed automation, then the master, then send them."""
    repositories = hass.data[DATA_REPOSITORIES]
    try:
        async with hass.data[DATA_RECORDER].lock:
            configs = await _async_read_automations(hass)
            invalid = await _async_find_invalid(hass, configs)
            result = await hass.async_add_executor_job(
                repositories.push_all,
                configs,
                msg.get("message"),
                msg.get("automation_ids"),
                invalid,
            )
    except (RepositoryError, HomeAssistantError, OSError) as err:
        _send_error(connection, msg["id"], err)
        return
    connection.send_result(msg["id"], result.as_dict())


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "automation_repos/record",
        probatio.Required("automation_id"): str,
        probatio.Optional("message"): str,
    }
)
@websocket_api.async_response
async def websocket_record(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Commit the automation as it is now, so going back to a version loses nothing."""
    repositories = hass.data[DATA_REPOSITORIES]
    automation_id = msg["automation_id"]
    async with hass.data[DATA_RECORDER].lock:
        try:
            configs = await _async_read_automations(hass)
            config = configs.get(automation_id)
            commit = None
            if config is not None:
                commit = await hass.async_add_executor_job(
                    repositories.snapshot, automation_id, config, msg.get("message")
                )
        except (RepositoryError, HomeAssistantError, OSError, yaml.YAMLError) as err:
            _send_error(connection, msg["id"], err)
            return
    connection.send_result(msg["id"], {"commit": commit})


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "automation_repos/forget",
        probatio.Required("automation_id"): str,
    }
)
@websocket_api.async_response
async def websocket_forget(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Delete the whole history of one automation and start it again.

    The automation itself is not changed. Its current configuration becomes
    the first version of the new history. A remote that already received the
    old history is not changed.
    """
    repositories = hass.data[DATA_REPOSITORIES]
    automation_id = msg["automation_id"]
    commit: str | None = None
    async with hass.data[DATA_RECORDER].lock:
        try:
            await hass.async_add_executor_job(repositories.forget, automation_id)
        except OSError as err:
            _send_error(connection, msg["id"], err)
            return
        try:
            configs = await _async_read_automations(hass)
            if automation_id in configs:
                commit = await hass.async_add_executor_job(
                    repositories.snapshot, automation_id, configs[automation_id]
                )
        except (RepositoryError, HomeAssistantError, OSError, yaml.YAMLError) as err:
            _LOGGER.warning(
                "Automation %s was not committed: %s", automation_id, mask_text(str(err))
            )
    connection.send_result(msg["id"], {"commit": commit})


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "automation_repos/set_remote",
        probatio.Optional("automation_id"): probatio.Any(str, None),
        probatio.Optional("url"): probatio.Any(str, None),
    }
)
@websocket_api.async_response
async def websocket_set_remote(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Set or remove the remote of one automation, or of the master."""
    repositories = hass.data[DATA_REPOSITORIES]
    try:
        await hass.async_add_executor_job(
            repositories.set_remote, msg.get("automation_id"), msg.get("url")
        )
    except (RepositoryError, OSError) as err:
        _send_error(connection, msg["id"], err)
        return
    connection.send_result(msg["id"])


@callback
def async_get_repositories(hass: HomeAssistant) -> AutomationRepositories:
    """Return the repositories, for other integrations."""
    return hass.data[DATA_REPOSITORIES]
