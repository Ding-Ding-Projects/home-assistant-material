"""Git repositories for dashboards and their views.

Every dashboard kept in storage gets its own Git repository, and every view
(tab) of it gets its own repository inside it. Saving a dashboard commits each
view that changed and then the dashboard. Nothing is ever pushed or fetched.

The repositories live in `dashboard_repos` inside the configuration folder.
The work with Git is in `repos.py`; this file watches the dashboards and
offers the commands the interface uses.
"""

import asyncio
import logging
from pathlib import Path
from typing import Any

import probatio
import yaml

from homeassistant.components import websocket_api
from homeassistant.components.lovelace import LOVELACE_DATA
from homeassistant.components.lovelace.const import (  # pylint: disable=home-assistant-component-root-import
    MODE_STORAGE,
    ConfigNotFound,
)
from homeassistant.const import EVENT_LOVELACE_UPDATED
from homeassistant.core import Event, HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv, start
from homeassistant.helpers.typing import ConfigType
from homeassistant.util.hass_dict import HassKey

from .repos import (
    DEFAULT_ID,
    DashboardRepositories,
    RepositoryError,
    check_dashboard_id,
    plain,
)

DOMAIN = "dashboard_repos"
_LOGGER = logging.getLogger(__name__)

CONFIG_SCHEMA = cv.empty_config_schema(DOMAIN)

DATA_REPOSITORIES: HassKey[DashboardRepositories] = HassKey(DOMAIN)
DATA_LOCK: HassKey[asyncio.Lock] = HassKey(f"{DOMAIN}_lock")

ERROR_GIT = "git_error"
ERROR_NOT_FOUND = "dashboard_not_found"
ERROR_NOT_STORAGE = "not_storage_dashboard"


def _dashboard_id(url_path: str | None) -> str:
    return DEFAULT_ID if url_path is None else url_path


def _url_path(dashboard_id: str) -> str | None:
    return None if dashboard_id == DEFAULT_ID else dashboard_id


async def _async_snapshot(
    hass: HomeAssistant, dashboard_id: str, dashboard: Any
) -> None:
    """Commit one dashboard. A failure is logged once and never raised."""
    repositories = hass.data[DATA_REPOSITORIES]
    async with hass.data[DATA_LOCK]:
        try:
            config = await dashboard.async_load(False)
        except (ConfigNotFound, HomeAssistantError):
            return
        data = plain(config)
        note = repositories.notes.pop(dashboard_id, None)
        try:
            await hass.async_add_executor_job(
                repositories.snapshot_dashboard, dashboard_id, data, note
            )
        except (RepositoryError, OSError, yaml.YAMLError) as err:
            if repositories.errors.get(dashboard_id) != str(err):
                _LOGGER.warning(
                    "Dashboard %s was not committed: %s", dashboard_id, err
                )
            repositories.errors[dashboard_id] = str(err)
        else:
            repositories.errors.pop(dashboard_id, None)


def _storage_dashboards(hass: HomeAssistant) -> dict[str, Any]:
    """Return the dashboards kept in storage, by id."""
    found: dict[str, Any] = {}
    for url_path, dashboard in hass.data[LOVELACE_DATA].dashboards.items():
        if dashboard.mode != MODE_STORAGE:
            continue
        dashboard_id = _dashboard_id(url_path)
        try:
            check_dashboard_id(dashboard_id)
        except RepositoryError:
            continue
        found[dashboard_id] = dashboard
    return found


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up the dashboard repositories."""
    repositories = DashboardRepositories(Path(hass.config.path(DOMAIN)))
    hass.data[DATA_REPOSITORIES] = repositories
    hass.data[DATA_LOCK] = asyncio.Lock()

    async def _commit_saved(event: Event) -> None:
        dashboards = _storage_dashboards(hass)
        dashboard_id = _dashboard_id(event.data.get("url_path"))
        if dashboard_id in dashboards:
            await _async_snapshot(hass, dashboard_id, dashboards[dashboard_id])

    async def _commit_existing(_hass: HomeAssistant) -> None:
        for dashboard_id, dashboard in _storage_dashboards(hass).items():
            await _async_snapshot(hass, dashboard_id, dashboard)

    hass.bus.async_listen(EVENT_LOVELACE_UPDATED, _commit_saved)
    start.async_at_started(hass, _commit_existing)

    websocket_api.async_register_command(hass, websocket_status)
    websocket_api.async_register_command(hass, websocket_history)
    websocket_api.async_register_command(hass, websocket_version)
    websocket_api.async_register_command(hass, websocket_diff)
    websocket_api.async_register_command(hass, websocket_restore)
    websocket_api.async_register_command(hass, websocket_set_remote)
    websocket_api.async_register_command(hass, websocket_push)
    return True


def _send_error(
    connection: websocket_api.ActiveConnection, msg_id: int, err: Exception
) -> None:
    connection.send_error(msg_id, ERROR_GIT, str(err))


@websocket_api.require_admin
@websocket_api.websocket_command({probatio.Required("type"): "dashboard_repos/status"})
@websocket_api.async_response
async def websocket_status(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Describe the repositories of every dashboard, and what is left out."""
    repositories = hass.data[DATA_REPOSITORIES]
    stored = _storage_dashboards(hass)
    described: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    for url_path, dashboard in hass.data[LOVELACE_DATA].dashboards.items():
        dashboard_id = _dashboard_id(url_path)
        title = (dashboard.config or {}).get("title") or dashboard_id
        if dashboard_id not in stored:
            skipped.append(
                {"id": dashboard_id, "title": title, "mode": dashboard.mode}
            )
            continue
        try:
            await dashboard.async_load(False)
        except ConfigNotFound:
            skipped.append({"id": dashboard_id, "title": title, "mode": "auto-gen"})
            continue
        described.append(
            {"id": dashboard_id, "url_path": url_path, "title": title}
        )
    try:
        result = await hass.async_add_executor_job(
            lambda: [repositories.dashboard_status(item) for item in described]
        )
    except (RepositoryError, OSError) as err:
        _send_error(connection, msg["id"], err)
        return
    connection.send_result(msg["id"], {"dashboards": result, "skipped": skipped})


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "dashboard_repos/history",
        probatio.Required("dashboard_id"): str,
        probatio.Optional("view_key"): str,
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
    """Return the commits of a dashboard or one view, newest first."""
    repositories = hass.data[DATA_REPOSITORIES]
    try:
        commits = await hass.async_add_executor_job(
            repositories.commits, msg["dashboard_id"], msg.get("view_key"), msg["limit"]
        )
    except (RepositoryError, OSError) as err:
        _send_error(connection, msg["id"], err)
        return
    connection.send_result(msg["id"], [commit.as_dict() for commit in commits])


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "dashboard_repos/version",
        probatio.Required("dashboard_id"): str,
        probatio.Required("sha"): str,
        probatio.Optional("view_key"): str,
    }
)
@websocket_api.async_response
async def websocket_version(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return a dashboard or a view as it was at a commit."""
    repositories = hass.data[DATA_REPOSITORIES]
    try:
        content = await hass.async_add_executor_job(
            repositories.content, msg["dashboard_id"], msg["sha"], msg.get("view_key")
        )
    except (RepositoryError, OSError, yaml.YAMLError) as err:
        _send_error(connection, msg["id"], err)
        return
    connection.send_result(msg["id"], content)


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "dashboard_repos/diff",
        probatio.Required("dashboard_id"): str,
        probatio.Required("old"): str,
        probatio.Optional("new"): str,
        probatio.Optional("view_key"): str,
    }
)
@websocket_api.async_response
async def websocket_diff(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return what changed between two commits, as text."""
    repositories = hass.data[DATA_REPOSITORIES]
    try:
        diff = await hass.async_add_executor_job(
            repositories.difference,
            msg["dashboard_id"],
            msg["old"],
            msg.get("new"),
            msg.get("view_key"),
        )
    except (RepositoryError, OSError, yaml.YAMLError) as err:
        _send_error(connection, msg["id"], err)
        return
    connection.send_result(msg["id"], {"diff": diff})


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "dashboard_repos/restore",
        probatio.Required("dashboard_id"): str,
        probatio.Required("sha"): str,
        probatio.Optional("view_key"): str,
    }
)
@websocket_api.async_response
async def websocket_restore(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Put a dashboard or one view back as it was at a commit.

    The configuration is written back through the dashboard's own save, so
    the interface updates, and the save makes a new commit. Nothing in the
    history is rewritten.
    """
    repositories = hass.data[DATA_REPOSITORIES]
    dashboard_id = msg["dashboard_id"]
    view_key = msg.get("view_key")
    dashboard = _storage_dashboards(hass).get(dashboard_id)
    if dashboard is None:
        connection.send_error(
            msg["id"], ERROR_NOT_FOUND, "That dashboard is not kept in storage."
        )
        return
    try:
        restored = (
            await hass.async_add_executor_job(
                repositories.content, dashboard_id, msg["sha"], view_key
            )
        )["config"]
        if view_key is None:
            new_config = restored
        else:
            try:
                current = plain(await dashboard.async_load(False))
            except ConfigNotFound:
                current = {}
            views = list(current.get("views", []))
            keys = await hass.async_add_executor_job(
                repositories.locate_views, dashboard_id, current
            )
            if view_key in keys:
                views[keys.index(view_key)] = restored
            else:
                views.append(restored)
            new_config = {**current, "views": views}
    except (RepositoryError, OSError, yaml.YAMLError) as err:
        _send_error(connection, msg["id"], err)
        return
    repositories.notes[dashboard_id] = f"Restored to {msg['sha'][:7]}"
    try:
        await dashboard.async_save(new_config)
    except HomeAssistantError as err:
        repositories.notes.pop(dashboard_id, None)
        _send_error(connection, msg["id"], err)
        return
    connection.send_result(msg["id"])


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "dashboard_repos/set_remote",
        probatio.Required("dashboard_id"): str,
        probatio.Optional("url"): probatio.Any(str, None),
    }
)
@websocket_api.async_response
async def websocket_set_remote(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Set or remove the remote of one dashboard repository."""
    repositories = hass.data[DATA_REPOSITORIES]
    try:
        await hass.async_add_executor_job(
            repositories.set_dashboard_remote, msg["dashboard_id"], msg.get("url")
        )
    except (RepositoryError, OSError) as err:
        _send_error(connection, msg["id"], err)
        return
    connection.send_result(msg["id"])


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "dashboard_repos/push",
        probatio.Required("dashboard_id"): str,
    }
)
@websocket_api.async_response
async def websocket_push(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Send a dashboard repository, with the history of every view, to its remote."""
    repositories = hass.data[DATA_REPOSITORIES]
    try:
        result = await hass.async_add_executor_job(
            repositories.push_dashboard, msg["dashboard_id"]
        )
    except (RepositoryError, OSError) as err:
        _send_error(connection, msg["id"], err)
        return
    connection.send_result(msg["id"], result)
