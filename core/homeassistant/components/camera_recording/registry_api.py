"""WebSocket commands for the container registry place: its status, settings and playback."""

import asyncio
from contextlib import suppress
from datetime import timedelta
import time
from typing import Any

import probatio

from homeassistant.auth.permissions.const import POLICY_READ
from homeassistant.components import websocket_api
from homeassistant.components.http.auth import async_sign_path
from homeassistant.components.registry_storage import async_get_store
from homeassistant.components.registry_storage.client import valid_repository
from homeassistant.components.registry_storage.const import (
    CONF_ADDRESS,
    CONF_CAMERA_REPOSITORIES,
    CONF_REGISTRY,
    CONF_USERNAME,
    DOMAIN as REGISTRY_DOMAIN,
    RegistryKind,
)
from homeassistant.components.registry_storage.errors import (
    Reason,
    RegistryStorageError,
)
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import Unauthorized
from homeassistant.helpers import config_validation as cv
from homeassistant.util import dt as dt_util
from homeassistant.util.ulid import ulid

from .cloud import DRIVE_REGISTRY
from .const import DOMAIN
from .play_registry import SIGNED_PATH_SECONDS, GetBackJob, RegistryRecordingView
from .registry_place import (
    annotate_segments,
    async_get_place,
    get_place,
    safe_file_name,
)
from .uploader import MAX_KEEP_DAYS, MIN_KEEP_DAYS, SEND_CHOICES, async_get_uploader
from .websocket import MAX_WINDOW_SECONDS, _managers

MAX_GET_BACK_FILES = 2000
KEEP_JOBS = 20

DATA_JOBS = f"{DOMAIN}.registry_get_back"


@callback
def async_register_registry(hass: HomeAssistant) -> None:
    """Register the view and the commands, and start loading the index."""
    hass.http.register_view(RegistryRecordingView())
    get_place(hass)
    for command in REGISTRY_COMMANDS:
        websocket_api.async_register_command(hass, command)


def _registry_entry(hass: HomeAssistant):
    return next(iter(hass.config_entries.async_loaded_entries(REGISTRY_DOMAIN)), None)


def _check_read(connection: websocket_api.ActiveConnection, entity_id: str) -> None:
    if not connection.user.permissions.check_entity(entity_id, POLICY_READ):
        raise Unauthorized(entity_id=entity_id)


async def _status(hass: HomeAssistant) -> dict[str, Any]:
    place = await async_get_place(hass)
    uploader = await async_get_uploader(hass)
    entries = hass.config_entries.async_entries(REGISTRY_DOMAIN)
    store = async_get_store(hass)
    state = uploader.states[DRIVE_REGISTRY]
    drive = next(
        row for row in uploader.status()["drives"] if row["domain"] == DRIVE_REGISTRY
    )
    cameras: dict[str, dict[str, Any]] = {}
    camera_ids: set[str] = set(place.index.rows)
    camera_ids.update(item["entity_id"] for item in state.queue)
    for manager in _managers(hass):
        camera_ids.update(manager.cameras)
    for entity_id in sorted(camera_ids):
        stored, stored_bytes = place.index.counts(entity_id)
        waiting = [item for item in state.queue if item["entity_id"] == entity_id]
        cameras[entity_id] = {
            "repository": store.repository_for(camera=entity_id) if store else None,
            "own_repository": bool(
                store and entity_id in store.settings.camera_repositories
            ),
            "in_registry_files": stored,
            "in_registry_bytes": stored_bytes,
            "waiting_files": len(waiting),
            "waiting_bytes": sum(int(item["size"]) for item in waiting),
            "sending": [
                {"name": name.split("/", 1)[1], "done": done, "total": total}
                for name, (done, total) in place.progress.items()
                if name.startswith(f"{entity_id}/")
            ],
        }
    public: bool | None = None
    used: int | None = None
    if store is not None:
        with suppress(RegistryStorageError):
            public = await store.client.async_is_public(
                store.settings.default_repository
            )
        with suppress(RegistryStorageError):
            used = await store.async_used_size()
    entry = entries[0] if entries else None
    kind = entry.data.get(CONF_REGISTRY) if entry else None
    return {
        "entry_id": entry.entry_id if entry else None,
        "registry": kind,
        # Only a registry of the owner's own has an address worth showing.
        "address": entry.data.get(CONF_ADDRESS)
        if entry and kind == RegistryKind.OTHER
        else None,
        "username": entry.data.get(CONF_USERNAME) if entry else None,
        "set_up": bool(entries),
        "loaded": store is not None,
        "default_repository": store.settings.default_repository if store else None,
        "backups_repository": store.settings.backups_repository if store else None,
        "public": public,
        "used_bytes": used,
        "rate_limit_remaining": store.client.rate_limit_remaining if store else None,
        "tested": place.tested,
        "upload": drive,
        "cameras": cameras,
        "playback": place.player.waiting(),
        "indexed_files": sum(len(rows) for rows in place.index.rows.values()),
    }


@websocket_api.require_admin
@websocket_api.websocket_command(
    {probatio.Required("type"): "camera_recording/registry/status"}
)
@websocket_api.async_response
async def ws_registry_status(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """The place, the upload queue and each camera's repository and counts."""
    connection.send_result(msg["id"], await _status(hass))


async def _run_test(hass: HomeAssistant) -> dict[str, Any]:
    place = await async_get_place(hass)
    store = async_get_store(hass)
    if store is None:
        return {"ok": False, "reason": "not_loaded", "seconds": 0.0}
    result = await store.async_self_test()
    reason = str(result.reason) if result.reason else None
    await place.async_record_test(result.ok, reason, result.seconds)
    return {"ok": result.ok, "reason": reason, "seconds": result.seconds}


@websocket_api.require_admin
@websocket_api.websocket_command(
    {probatio.Required("type"): "camera_recording/registry/test"}
)
@websocket_api.async_response
async def ws_registry_test(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Upload a small locked object, open it again and compare it."""
    connection.send_result(msg["id"], await _run_test(hass))


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "camera_recording/registry/set",
        probatio.Optional("enabled"): bool,
        probatio.Optional("public_understood"): bool,
        probatio.Optional("send"): probatio.In(SEND_CHOICES),
        probatio.Optional("keep_days"): probatio.Any(
            None,
            probatio.All(int, probatio.Range(min=MIN_KEEP_DAYS, max=MAX_KEEP_DAYS)),
        ),
    }
)
@websocket_api.async_response
async def ws_registry_set(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Turn sending on or off. Turning it on needs a passed test and the public notice."""
    uploader = await async_get_uploader(hass)
    if msg.get("enabled"):
        if not uploader.drives[DRIVE_REGISTRY].loaded:
            connection.send_error(msg["id"], "not_set_up", "Set up the registry first")
            return
        if not msg.get("public_understood"):
            connection.send_error(
                msg["id"],
                "confirmation_required",
                "Confirm that locked files in a public registry can be copied by anyone",
            )
            return
        test = await _run_test(hass)
        if not test["ok"]:
            connection.send_error(
                msg["id"], "test_failed", str(test["reason"] or "test_failed")
            )
            return
    await uploader.async_set(
        DRIVE_REGISTRY, enabled=msg.get("enabled"), send=msg.get("send")
    )
    if "keep_days" in msg:
        await uploader.async_set_keep_days(DRIVE_REGISTRY, msg["keep_days"])
    connection.send_result(msg["id"], await _status(hass))


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "camera_recording/registry/camera_repository",
        probatio.Required("entity_id"): cv.entity_id,
        probatio.Required("repository"): probatio.Any(None, str),
    }
)
@websocket_api.async_response
async def ws_registry_camera_repository(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Give one camera its own repository, or null to use the default one."""
    entry = _registry_entry(hass)
    if entry is None:
        connection.send_error(msg["id"], "not_set_up", "Set up the registry first")
        return
    repository = msg["repository"]
    if repository is not None:
        repository = repository.strip()
        if not valid_repository(repository):
            connection.send_error(
                msg["id"], "invalid_repository", "That repository name is not valid"
            )
            return
    mapping = dict(entry.options.get(CONF_CAMERA_REPOSITORIES, {}))
    if repository is None:
        mapping.pop(msg["entity_id"], None)
    else:
        mapping[msg["entity_id"]] = repository
    hass.config_entries.async_update_entry(
        entry, options={**entry.options, CONF_CAMERA_REPOSITORIES: mapping}
    )
    # The change reloads the registry place; a repository that does not exist yet is
    # created by the first lock header, which is published here once it is back.
    store = None
    for _ in range(40):
        await asyncio.sleep(0.25)
        if entry.state is ConfigEntryState.LOADED:
            store = async_get_store(hass, entry.entry_id)
            if store is not None and store.settings.camera_repositories == mapping:
                break
    if store is not None and repository is not None:
        try:
            await store.async_ensure_lock(repository)
        except RegistryStorageError as err:
            connection.send_error(msg["id"], str(err.reason), str(err.reason))
            return
    connection.send_result(msg["id"], await _status(hass))


@websocket_api.require_admin
@websocket_api.websocket_command(
    {probatio.Required("type"): "camera_recording/registry/refresh"}
)
@websocket_api.async_response
async def ws_registry_refresh(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Read the registry's own list again and rebuild the recording index from it."""
    place = await async_get_place(hass)
    try:
        count = await place.async_refresh_index()
    except RegistryStorageError as err:
        connection.send_error(msg["id"], str(err.reason), str(err.reason))
        return
    connection.send_result(msg["id"], {"recordings": count})


@websocket_api.websocket_command(
    {
        probatio.Required("type"): "camera_recording/registry/where",
        probatio.Required("entity_id"): cv.entity_id,
        probatio.Required("start_time"): str,
        probatio.Required("end_time"): str,
    }
)
@websocket_api.async_response
async def ws_registry_where(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Where each recording of a camera is: here, in the registry, or both."""
    entity_id = msg["entity_id"]
    _check_read(connection, entity_id)
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
    await async_get_place(hass)
    local = [
        {
            "entry_id": manager.entry.entry_id,
            "name": seg.name,
            "start": seg.start,
            "end": seg.end,
            "size": seg.size,
            "here": seg.local,
            "kind": seg.kind,
        }
        for manager in _managers(hass)
        if entity_id in manager.cameras
        for seg in manager.segments_between(
            entity_id, start.timestamp(), end.timestamp()
        )
    ]
    connection.send_result(
        msg["id"],
        annotate_segments(hass, entity_id, local, start.timestamp(), end.timestamp()),
    )


@websocket_api.websocket_command(
    {
        probatio.Required("type"): "camera_recording/registry/play",
        probatio.Required("entity_id"): cv.entity_id,
        probatio.Required("name"): str,
    }
)
@websocket_api.async_response
async def ws_registry_play(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """A signed, short-lived path that plays one recording straight from the registry."""
    entity_id = msg["entity_id"]
    _check_read(connection, entity_id)
    place = await async_get_place(hass)
    row = place.index.find(entity_id, msg["name"])
    if row is None:
        connection.send_error(
            msg["id"], "not_in_registry", "That recording is not in the registry"
        )
        return
    path = async_sign_path(
        hass,
        f"/api/camera_recording/registry/{entity_id}/{msg['name']}",
        timedelta(seconds=SIGNED_PATH_SECONDS),
    )
    connection.send_result(
        msg["id"],
        {
            "path": path,
            "expires_in": SIGNED_PATH_SECONDS,
            "size": row["size"],
            "content_type": "image/jpeg"
            if msg["name"].endswith(".jpg")
            else "video/mp4",
            "waiting": place.player.waiting(),
        },
    )


def _jobs(hass: HomeAssistant) -> dict[str, GetBackJob]:
    return hass.data.setdefault(DATA_JOBS, {})


async def _get_back(
    hass: HomeAssistant, job: GetBackJob, items: list[dict[str, Any]], folder
) -> None:
    store = async_get_store(hass)
    place = get_place(hass)
    if store is None:
        job.state = "failed"
        job.reason = str(Reason.NOT_READY)
        return
    try:
        await hass.async_add_executor_job(
            lambda: folder.mkdir(parents=True, exist_ok=True)
        )
        base = job.done_bytes
        for item in items:
            if not safe_file_name(item["name"]):
                job.state = "failed"
                job.reason = str(Reason.INVALID_REQUEST)
                return
            target = folder / item["name"]
            if await hass.async_add_executor_job(target.is_file):
                job.done_bytes += item["size"]
                job.done_files += 1
                continue

            def _progress(done: int, _total: int, base: int = job.done_bytes) -> None:
                job.done_bytes = base + done

            await store.async_get_file(str(item["id"]), str(target), progress=_progress)
            job.done_bytes = base = base + item["size"]
            job.done_files += 1
        job.state = "done"
    except asyncio.CancelledError:
        job.state = "cancelled"
        raise
    except RegistryStorageError as err:
        job.state = "failed"
        job.reason = str(err.reason)
        if str(err.reason) == "rate_limited":
            place.player.note_limited()
    except OSError:
        job.state = "failed"
        job.reason = "disk_error"


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "camera_recording/registry/get_back",
        probatio.Required("entity_id"): cv.entity_id,
        probatio.Optional("name"): str,
        probatio.Optional("day"): probatio.Match(r"^\d{4}-\d{2}-\d{2}$"),
    }
)
@websocket_api.async_response
async def ws_registry_get_back(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Download and unlock one clip, or a whole day, into the camera's recording folder."""
    entity_id = msg["entity_id"]
    if ("name" in msg) == ("day" in msg):
        connection.send_error(msg["id"], "invalid_format", "Give a name or a day")
        return
    manager = next((m for m in _managers(hass) if entity_id in m.cameras), None)
    if manager is None:
        connection.send_error(
            msg["id"], "not_found", "That camera is not recorded here"
        )
        return
    place = await async_get_place(hass)
    rows = place.index.rows.get(entity_id, {})
    if "name" in msg:
        items = (
            [{"name": msg["name"], **rows[msg["name"]]}] if msg["name"] in rows else []
        )
    else:
        day = msg["day"]
        items = [
            {"name": name, **row}
            for name, row in rows.items()
            if time.strftime("%Y-%m-%d", time.gmtime(row["start"])) == day
        ]
    items.sort(key=lambda row: row["start"])
    if not items:
        connection.send_error(
            msg["id"], "not_in_registry", "Nothing in the registry matches"
        )
        return
    if len(items) > MAX_GET_BACK_FILES:
        connection.send_error(msg["id"], "too_many", "That is too many files at once")
        return
    jobs = _jobs(hass)
    for old in [j for j in jobs.values() if j.state != "running"][:-KEEP_JOBS]:
        del jobs[old.id]
    job = GetBackJob(
        ulid(),
        entity_id,
        [item["name"] for item in items],
        sum(int(i["size"]) for i in items),
    )
    jobs[job.id] = job
    job.task = hass.async_create_background_task(
        _get_back(hass, job, items, manager.folder(entity_id)),
        f"{DOMAIN} registry get back",
    )
    connection.send_result(msg["id"], job.as_dict())


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "camera_recording/registry/get_back_status",
        probatio.Optional("job_id"): str,
    }
)
@callback
def ws_registry_get_back_status(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """The progress of one get-back job, or of all of them."""
    jobs = _jobs(hass)
    if "job_id" in msg:
        job = jobs.get(msg["job_id"])
        if job is None:
            connection.send_error(msg["id"], "not_found", "No such job")
            return
        connection.send_result(msg["id"], job.as_dict())
        return
    connection.send_result(msg["id"], [job.as_dict() for job in jobs.values()])


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "camera_recording/registry/get_back_cancel",
        probatio.Required("job_id"): str,
    }
)
@websocket_api.async_response
async def ws_registry_get_back_cancel(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Stop a get-back job. Files already brought back stay."""
    job = _jobs(hass).get(msg["job_id"])
    if job is None:
        connection.send_error(msg["id"], "not_found", "No such job")
        return
    if job.task is not None and not job.task.done():
        job.task.cancel()
        with suppress(asyncio.CancelledError):
            await job.task
    connection.send_result(msg["id"], job.as_dict())


# Every command the interface may send. Keep in step with REGISTRY_WS in the frontend's
# src/data/registry_storage.ts: a test on each side checks the same list.
REGISTRY_COMMANDS = (
    ws_registry_status,
    ws_registry_test,
    ws_registry_set,
    ws_registry_camera_repository,
    ws_registry_refresh,
    ws_registry_where,
    ws_registry_play,
    ws_registry_get_back,
    ws_registry_get_back_status,
    ws_registry_get_back_cancel,
)
