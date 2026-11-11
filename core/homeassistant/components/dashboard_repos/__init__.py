"""Git repositories for dashboards and their views.

Every dashboard kept in storage gets its own Git repository, and every view
(tab) of it gets its own repository inside it. Saving a dashboard commits each
view that changed and then the dashboard. Nothing is pushed or fetched unless
a remote is set on a dashboard and a push is asked for.

The repositories live in `dashboard_repos` inside the configuration folder.
The work with Git is in `repos.py`; this file watches the dashboards and
offers the commands the interface uses.
"""

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
    check_config,
    check_dashboard_id,
    mask_text,
    place_view,
    plain,
)
from .snapshot_queue import SnapshotQueue

DOMAIN = "dashboard_repos"
_LOGGER = logging.getLogger(__name__)

CONFIG_SCHEMA = cv.empty_config_schema(DOMAIN)

DATA_REPOSITORIES: HassKey[DashboardRepositories] = HassKey(DOMAIN)
DATA_QUEUE: HassKey[SnapshotQueue] = HassKey(f"{DOMAIN}_queue")

ERROR_GIT = "git_error"
ERROR_NOT_FOUND = "dashboard_not_found"
ERROR_NOT_STORAGE = "not_storage_dashboard"
ERROR_NOT_RECORDED = "current_state_not_recorded"
ERROR_CHANGED = "dashboard_changed"
ERROR_SAVE_FAILED = "save_failed"

_RECORD_ERRORS = (RepositoryError, OSError, yaml.YAMLError)


def _dashboard_id(url_path: str | None) -> str:
    return DEFAULT_ID if url_path is None else url_path


def _url_path(dashboard_id: str) -> str | None:
    return None if dashboard_id == DEFAULT_ID else dashboard_id


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


def _all_dashboard_ids(hass: HomeAssistant) -> set[str]:
    return {_dashboard_id(url_path) for url_path in hass.data[LOVELACE_DATA].dashboards}


def _send_not_stored(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Answer that a dashboard is not kept in storage, and say why."""
    if msg["dashboard_id"] in _all_dashboard_ids(hass):
        connection.send_error(
            msg["id"],
            ERROR_NOT_STORAGE,
            "This dashboard is not edited in the interface, so no history is kept.",
        )
        return
    connection.send_error(
        msg["id"], ERROR_NOT_FOUND, "That dashboard was not found."
    )


def _note_error(
    repositories: DashboardRepositories, dashboard_id: str, err: Exception
) -> None:
    if repositories.errors.get(dashboard_id) != str(err):
        _LOGGER.warning("Dashboard %s was not committed: %s", dashboard_id, err)
    repositories.errors[dashboard_id] = str(err)


async def _async_snapshot(hass: HomeAssistant, dashboard_id: str) -> None:
    """Commit one dashboard. A failure is logged once and never raised.

    Saves are coalesced by the queue: the commit reads the newest saved
    configuration when its turn comes.
    """
    repositories = hass.data[DATA_REPOSITORIES]

    async def _commit() -> None:
        dashboard = _storage_dashboards(hass).get(dashboard_id)
        if dashboard is None:
            return
        note = repositories.notes.pop(dashboard_id, None)
        try:
            config = await dashboard.async_load(False)
        except (ConfigNotFound, HomeAssistantError):
            return
        try:
            await hass.async_add_executor_job(
                repositories.snapshot_dashboard, dashboard_id, plain(config), note
            )
        except _RECORD_ERRORS as err:
            _note_error(repositories, dashboard_id, err)
        else:
            repositories.errors.pop(dashboard_id, None)

    await hass.data[DATA_QUEUE].run(dashboard_id, _commit)


async def _async_archive(hass: HomeAssistant, dashboard_id: str) -> None:
    """Move the repository of a dashboard that no longer exists out of the way."""
    repositories = hass.data[DATA_REPOSITORIES]
    async with hass.data[DATA_QUEUE].lock:
        if dashboard_id in _all_dashboard_ids(hass):
            return
        hass.data[DATA_QUEUE].discard(dashboard_id)
        moved = await hass.async_add_executor_job(
            repositories.archive_dashboard, dashboard_id
        )
    if moved is not None:
        _LOGGER.info(
            "The history of the deleted dashboard %s was moved to %s",
            dashboard_id,
            moved,
        )


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up the dashboard repositories."""
    repositories = DashboardRepositories(Path(hass.config.path(DOMAIN)))
    hass.data[DATA_REPOSITORIES] = repositories
    hass.data[DATA_QUEUE] = SnapshotQueue()

    async def _commit_saved(event: Event) -> None:
        try:
            url_path = event.data.get("url_path")
            dashboard_id = _dashboard_id(url_path)
            if dashboard_id in _storage_dashboards(hass):
                await _async_snapshot(hass, dashboard_id)
            elif dashboard_id not in _all_dashboard_ids(hass):
                check_dashboard_id(dashboard_id)
                await _async_archive(hass, dashboard_id)
        except Exception:  # noqa: BLE001
            _LOGGER.exception("A saved dashboard was not committed")

    async def _commit_existing(_hass: HomeAssistant) -> None:
        try:
            known = await hass.async_add_executor_job(repositories.known_dashboards)
        except OSError:
            _LOGGER.exception("The existing dashboard histories could not be listed")
            known = []
        for dashboard_id in known:
            if dashboard_id in _all_dashboard_ids(hass):
                continue
            try:
                await _async_archive(hass, dashboard_id)
            except Exception:  # noqa: BLE001
                _LOGGER.exception("The history of dashboard %s was not set aside", dashboard_id)
        for dashboard_id in _storage_dashboards(hass):
            try:
                await _async_snapshot(hass, dashboard_id)
            except Exception:  # noqa: BLE001
                _LOGGER.exception("Dashboard %s was not committed", dashboard_id)

    hass.bus.async_listen(EVENT_LOVELACE_UPDATED, _commit_saved)
    start.async_at_started(hass, _commit_existing)

    websocket_api.async_register_command(hass, websocket_status)
    websocket_api.async_register_command(hass, websocket_history)
    websocket_api.async_register_command(hass, websocket_version)
    websocket_api.async_register_command(hass, websocket_diff)
    websocket_api.async_register_command(hass, websocket_restore)
    websocket_api.async_register_command(hass, websocket_forget)
    websocket_api.async_register_command(hass, websocket_archives)
    websocket_api.async_register_command(hass, websocket_forget_archive)
    websocket_api.async_register_command(hass, websocket_forget_removed_view)
    websocket_api.async_register_command(hass, websocket_set_remote)
    websocket_api.async_register_command(hass, websocket_push)
    return True


def _send_error(
    connection: websocket_api.ActiveConnection, msg_id: int, err: Exception
) -> None:
    connection.send_error(msg_id, ERROR_GIT, mask_text(str(err)))


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
        probatio.Optional("without_saving_current", default=False): bool,
    }
)
@websocket_api.async_response
async def websocket_restore(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Put a dashboard or one view back as it was at a commit.

    The current state is committed first, after any save still waiting, so
    going back never loses it. When that cannot be done the command refuses,
    unless `without_saving_current` says the person accepted that. One view is
    put back by its key only: when no view has that key any more it is added
    as a new tab. The configuration is checked, written back through the
    dashboard's own save, and committed, and the new commit is reported.
    """
    repositories = hass.data[DATA_REPOSITORIES]
    dashboard_id = msg["dashboard_id"]
    view_key = msg.get("view_key")
    sha = msg["sha"]
    note = f"Restored to {sha[:7]}"
    new_view = False
    commit: str | None = None
    async with hass.data[DATA_QUEUE].lock:
        dashboard = _storage_dashboards(hass).get(dashboard_id)
        if dashboard is None:
            _send_not_stored(hass, connection, msg)
            return
        try:
            restored = (
                await hass.async_add_executor_job(
                    repositories.content, dashboard_id, sha, view_key
                )
            )["config"]
        except _RECORD_ERRORS as err:
            _send_error(connection, msg["id"], err)
            return

        try:
            current = plain(await dashboard.async_load(False))
        except ConfigNotFound:
            current = None
        before = current
        recorded = False
        if current is not None:
            try:
                await hass.async_add_executor_job(
                    repositories.snapshot_dashboard,
                    dashboard_id,
                    current,
                    f"Before restoring to {sha[:7]}",
                )
            except _RECORD_ERRORS as err:
                if not msg["without_saving_current"]:
                    connection.send_error(
                        msg["id"],
                        ERROR_NOT_RECORDED,
                        "The current state of this dashboard could not be "
                        f"recorded first: {mask_text(str(err))}",
                    )
                    return
            else:
                recorded = True
                repositories.errors.pop(dashboard_id, None)

        try:
            if view_key is None:
                new_config = restored
            else:
                if current is None:
                    connection.send_error(
                        msg["id"],
                        ERROR_NOT_FOUND,
                        "This dashboard has no stored configuration to put a "
                        "view back into.",
                    )
                    return
                views = current.get("views", [])
                if not isinstance(views, list):
                    raise RepositoryError(
                        "The views of this dashboard are not a list of views."
                    )
                keys = (
                    await hass.async_add_executor_job(
                        repositories.current_keys, dashboard_id
                    )
                    if recorded
                    else []
                )
                views, new_view = place_view(views, keys, view_key, restored)
                new_config = {**current, "views": views}
            new_config = await hass.async_add_executor_job(check_config, new_config)
        except _RECORD_ERRORS as err:
            _send_error(connection, msg["id"], err)
            return

        try:
            latest = plain(await dashboard.async_load(False))
        except ConfigNotFound:
            latest = None
        if latest != before:
            connection.send_error(
                msg["id"],
                ERROR_CHANGED,
                "The dashboard was saved while this restore was being prepared. "
                "Nothing was changed. Try again.",
            )
            return

        try:
            await dashboard.async_save(new_config)
        except HomeAssistantError as err:
            connection.send_error(
                msg["id"],
                ERROR_SAVE_FAILED,
                f"The dashboard could not be saved: {mask_text(str(err))}",
            )
            return
        hass.data[DATA_QUEUE].discard(dashboard_id)
        try:
            saved = await dashboard.async_load(False)
            commit = await hass.async_add_executor_job(
                repositories.snapshot_dashboard, dashboard_id, plain(saved), note
            )
        except (ConfigNotFound, HomeAssistantError, *_RECORD_ERRORS) as err:
            _note_error(repositories, dashboard_id, err)
        else:
            repositories.errors.pop(dashboard_id, None)
    connection.send_result(msg["id"], {"commit": commit, "new_view": new_view})


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "dashboard_repos/forget",
        probatio.Required("dashboard_id"): str,
    }
)
@websocket_api.async_response
async def websocket_forget(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Delete the whole history of a dashboard and start it again.

    The dashboard itself is not changed. Its current configuration becomes the
    first version of the new history. A remote that already received the old
    history is not changed.
    """
    repositories = hass.data[DATA_REPOSITORIES]
    dashboard_id = msg["dashboard_id"]
    commit: str | None = None
    async with hass.data[DATA_QUEUE].lock:
        dashboard = _storage_dashboards(hass).get(dashboard_id)
        if dashboard is None:
            _send_not_stored(hass, connection, msg)
            return
        try:
            await hass.async_add_executor_job(
                repositories.forget_dashboard, dashboard_id
            )
        except (RepositoryError, OSError) as err:
            _send_error(connection, msg["id"], err)
            return
        hass.data[DATA_QUEUE].discard(dashboard_id)
        try:
            config = await dashboard.async_load(False)
            commit = await hass.async_add_executor_job(
                repositories.snapshot_dashboard, dashboard_id, plain(config), None
            )
        except ConfigNotFound:
            pass
        except (HomeAssistantError, *_RECORD_ERRORS) as err:
            _note_error(repositories, dashboard_id, err)
    connection.send_result(msg["id"], {"commit": commit})


@websocket_api.require_admin
@websocket_api.websocket_command({probatio.Required("type"): "dashboard_repos/archives"})
@websocket_api.async_response
async def websocket_archives(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """List the histories of deleted dashboards that were set aside."""
    repositories = hass.data[DATA_REPOSITORIES]
    try:
        archives = await hass.async_add_executor_job(repositories.list_archives)
    except (RepositoryError, OSError) as err:
        _send_error(connection, msg["id"], err)
        return
    connection.send_result(msg["id"], {"archives": archives})


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "dashboard_repos/forget_archive",
        probatio.Required("name"): str,
    }
)
@websocket_api.async_response
async def websocket_forget_archive(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Delete the archived history of a deleted dashboard, for good."""
    repositories = hass.data[DATA_REPOSITORIES]
    async with hass.data[DATA_QUEUE].lock:
        try:
            await hass.async_add_executor_job(repositories.forget_archive, msg["name"])
        except (RepositoryError, OSError) as err:
            _send_error(connection, msg["id"], err)
            return
    connection.send_result(msg["id"])


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "dashboard_repos/forget_removed_view",
        probatio.Required("dashboard_id"): str,
        probatio.Required("view_key"): str,
    }
)
@websocket_api.async_response
async def websocket_forget_removed_view(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Delete the history of a view that was removed from a dashboard."""
    repositories = hass.data[DATA_REPOSITORIES]
    async with hass.data[DATA_QUEUE].lock:
        try:
            await hass.async_add_executor_job(
                repositories.forget_removed_view, msg["dashboard_id"], msg["view_key"]
            )
        except (RepositoryError, OSError) as err:
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
    async with hass.data[DATA_QUEUE].lock:
        if msg["dashboard_id"] not in _storage_dashboards(hass):
            _send_not_stored(hass, connection, msg)
            return
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
    async with hass.data[DATA_QUEUE].lock:
        if msg["dashboard_id"] not in _storage_dashboards(hass):
            _send_not_stored(hass, connection, msg)
            return
    try:
        result = await hass.async_add_executor_job(
            repositories.push_dashboard, msg["dashboard_id"]
        )
    except (RepositoryError, OSError) as err:
        _send_error(connection, msg["id"], err)
        return
    connection.send_result(msg["id"], result)
