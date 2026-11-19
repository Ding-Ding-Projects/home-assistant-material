"""A locked container registry as a place that camera recordings are sent to.

It plugs into the same queue as the cloud drives: the queue keeps its own link to every
waiting file and removes it only after the registry has accepted the locked object and
answered for it. Each finished clip or recording is one locked object, named with its
camera and day inside the encrypted index, so a day's bundle grows by adding objects and
nothing already stored is ever sent again.

This module also keeps the recording index of what is in the registry. It survives the
local copy being trimmed, so the timeline can draw older recordings that now exist only
there.
"""

import asyncio
from collections.abc import Sequence
from contextlib import suppress
import logging
from pathlib import Path
import time
from typing import TYPE_CHECKING, Any, override

from homeassistant.components.registry_storage import async_get_store
from homeassistant.components.registry_storage.errors import (
    Reason,
    RegistryStorageError,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from homeassistant.util.hass_dict import HassKey

from .cloud import (
    DRIVE_REGISTRY,
    REASON_CHECK_FAILED,
    REASON_DRIVE_ERROR,
    REASON_LOCKED,
    REASON_NOT_LOADED,
    REASON_NOT_SET_UP,
    REASON_RATE_LIMITED,
    REASON_REFUSED,
    REASON_SIGN_IN,
    REASON_TIMED_OUT,
    CloudDrive,
    DriveError,
    OpenStream,
    RemoteFile,
)
from .const import DOMAIN, EVENT_CLIP_SECONDS, EVENT_IMAGE_SECONDS

if TYPE_CHECKING:
    from .play_registry import RegistryPlayer

_LOGGER = logging.getLogger(__name__)

DATA_PLACE: HassKey[RegistryPlace] = HassKey(f"{DOMAIN}.registry_place")
INDEX_STORAGE_KEY = f"{DOMAIN}.registry_index"
INDEX_STORAGE_VERSION = 1
SAVE_DELAY = 5

KIND_RECORDING = "recording"
ROOT_PREFIX = "Camera recordings"
DEFAULT_RECORDING_SECONDS = 300.0

# Registry reasons turned into the reason codes the queue and the page already know.
_REASONS: dict[Reason, str] = {
    Reason.RATE_LIMITED: REASON_RATE_LIMITED,
    Reason.AUTH_FAILED: REASON_SIGN_IN,
    Reason.DENIED: REASON_REFUSED,
    Reason.UNAVAILABLE: REASON_DRIVE_ERROR,
    Reason.TIMEOUT: REASON_TIMED_OUT,
    Reason.INVALID_RESPONSE: REASON_DRIVE_ERROR,
    Reason.REJECTED: REASON_REFUSED,
    Reason.NOT_FOUND: REASON_DRIVE_ERROR,
    Reason.INSECURE_ADDRESS: REASON_NOT_SET_UP,
    Reason.INVALID_ADDRESS: REASON_NOT_SET_UP,
    Reason.INVALID_REPOSITORY: REASON_NOT_SET_UP,
    Reason.PASSWORD_TOO_WEAK: REASON_LOCKED,
    Reason.PASSWORD_MISMATCH: REASON_LOCKED,
    Reason.WRONG_PASSWORD: REASON_LOCKED,
    Reason.NOT_LOCKED: REASON_LOCKED,
    Reason.UNSUPPORTED_FORMAT: REASON_LOCKED,
    Reason.TAMPERED: REASON_CHECK_FAILED,
    Reason.TRUNCATED: REASON_CHECK_FAILED,
    Reason.SELF_TEST_FAILED: REASON_CHECK_FAILED,
    Reason.NOT_READY: REASON_NOT_LOADED,
}


def reason_code(err: RegistryStorageError) -> str:
    """The queue's reason code for a registry or lock error."""
    return _REASONS.get(err.reason, REASON_DRIVE_ERROR)


def safe_file_name(name: str) -> bool:
    """Whether a name read back from the registry is a plain file name with no folders."""
    return bool(name) and name not in (".", "..") and not {"/", "\\", "\0"} & set(name)


def camera_entity(folder_camera: str) -> str:
    """The camera entity id of a folder name."""
    return f"camera.{folder_camera}"


def object_name(entity_id: str, day: str, name: str) -> str:
    """The name of the locked object: camera, day, file. Only the index ever shows it."""
    return f"{entity_id.split('.', 1)[-1]}/{day}/{name}"


class RegistryIndex:
    """What is in the registry for each camera, kept when local copies are trimmed.

    Rows are keyed by camera entity id, then file name:
    {"id", "start", "duration", "size", "kind", "stored_at"}.
    """

    def __init__(self, hass: HomeAssistant) -> None:
        """Start empty. Call async_load before use."""
        self._store: Store[dict[str, Any]] = Store(
            hass, INDEX_STORAGE_VERSION, INDEX_STORAGE_KEY
        )
        self.rows: dict[str, dict[str, dict[str, Any]]] = {}
        self.loaded = False

    async def async_load(self) -> None:
        """Read the stored rows."""
        stored = await self._store.async_load() or {}
        loaded = {
            str(cam): {str(name): dict(row) for name, row in rows.items()}
            for cam, rows in stored.get("rows", {}).items()
        }
        for cam, rows in loaded.items():
            rows.update(self.rows.get(cam, {}))
        self.rows = loaded | {
            cam: rows for cam, rows in self.rows.items() if cam not in loaded
        }
        self.loaded = True

    def _data(self) -> dict[str, Any]:
        return {"rows": self.rows}

    def save(self) -> None:
        """Save soon."""
        self._store.async_delay_save(self._data, SAVE_DELAY)

    async def async_stop(self) -> None:
        """Save now."""
        await self._store.async_save(self._data())

    def add(
        self,
        entity_id: str,
        name: str,
        *,
        object_id: str,
        start: float,
        duration: float,
        size: int,
        kind: str,
    ) -> None:
        """Remember a recording that is now in the registry."""
        self.rows.setdefault(entity_id, {})[name] = {
            "id": object_id,
            "start": start,
            "duration": duration,
            "size": size,
            "kind": kind,
            "stored_at": time.time(),
        }
        self.save()

    def find(self, entity_id: str, name: str) -> dict[str, Any] | None:
        """The row of one recording, if it is in the registry."""
        return self.rows.get(entity_id, {}).get(name)

    def remove_object(self, object_id: str) -> bool:
        """Forget the recording stored as this object. Returns whether one was known."""
        for rows in self.rows.values():
            for name, row in list(rows.items()):
                if row["id"] == object_id:
                    del rows[name]
                    self.save()
                    return True
        return False

    def between(self, entity_id: str, start: float, end: float) -> list[dict[str, Any]]:
        """Rows of a camera that overlap a time window, oldest first, with their names."""
        found = [
            {"name": name, **row}
            for name, row in self.rows.get(entity_id, {}).items()
            if row["start"] + row["duration"] > start and row["start"] < end
        ]
        return sorted(found, key=lambda row: row["start"])

    def counts(self, entity_id: str) -> tuple[int, int]:
        """How many recordings of a camera are in the registry, and their size."""
        rows = self.rows.get(entity_id, {})
        return len(rows), sum(int(row["size"]) for row in rows.values())

    def replace_from_registry(
        self, found: dict[str, dict[str, dict[str, Any]]]
    ) -> None:
        """Make the index match what the registry lists."""
        self.rows = found
        self.save()


class RegistryPlace:
    """The index, the playback and the last test of the registry as one place."""

    def __init__(self, hass: HomeAssistant) -> None:
        """Set up empty."""
        self.hass = hass
        self.index = RegistryIndex(hass)
        self._store: Store[dict[str, Any]] = Store(
            hass, INDEX_STORAGE_VERSION, f"{DOMAIN}.registry_place"
        )
        self.tested: dict[str, Any] | None = None
        self.progress: dict[str, tuple[int, int]] = {}
        self.load_task: asyncio.Task[None] | None = None
        self._player: RegistryPlayer | None = None

    @property
    def player(self) -> RegistryPlayer:
        """The playback of older recordings, made on first use."""
        if self._player is None:
            from .play_registry import RegistryPlayer  # noqa: PLC0415

            self._player = RegistryPlayer(self.hass)
            self._player.start()
        return self._player

    async def async_load(self) -> None:
        """Read the index and the last test."""
        await self.index.async_load()
        stored = await self._store.async_load() or {}
        self.tested = stored.get("tested")

    async def async_record_test(
        self, ok: bool, reason: str | None, seconds: float
    ) -> None:
        """Keep the result of the last self test."""
        self.tested = {
            "ok": ok,
            "reason": reason,
            "at": time.time(),
            "seconds": seconds,
        }
        await self._store.async_save({"tested": self.tested})

    async def async_stop(self) -> None:
        """Save and throw away anything unlocked."""
        if self._player is not None:
            self._player.close_all()
        await self.index.async_stop()

    async def async_refresh_index(self) -> int:
        """Rebuild the index from the registry's own list. Returns how many recordings."""
        store = async_get_store(self.hass)
        if store is None:
            return 0
        found: dict[str, dict[str, dict[str, Any]]] = {}
        for item in await store.async_list(kind=KIND_RECORDING, refresh=True):
            file_name = item.meta.get("f")
            if not item.camera or not safe_file_name(str(file_name or "")):
                continue
            found.setdefault(item.camera, {})[str(file_name)] = {
                "id": item.id,
                "start": float(item.meta.get("s", item.created)),
                "duration": float(item.meta.get("d", DEFAULT_RECORDING_SECONDS)),
                "size": item.plain_size,
                "kind": str(item.meta.get("k", "recording")),
                "stored_at": item.created,
            }
        self.index.replace_from_registry(found)
        return sum(len(rows) for rows in found.values())


def get_place(hass: HomeAssistant) -> RegistryPlace:
    """The one place of this instance. It loads in the background on first use."""
    if (place := hass.data.get(DATA_PLACE)) is None:
        place = hass.data[DATA_PLACE] = RegistryPlace(hass)
        place.load_task = hass.async_create_task(place.async_load())
    return place


async def async_get_place(hass: HomeAssistant) -> RegistryPlace:
    """The place, once its stored state is loaded."""
    place = get_place(hass)
    if place.load_task is not None:
        await asyncio.shield(place.load_task)
    return place


def annotate_segments(
    hass: HomeAssistant,
    entity_id: str,
    segments: list[dict[str, Any]],
    start: float,
    end: float,
) -> list[dict[str, Any]]:
    """Say where each segment is, and add the ones that exist only in the registry.

    Every row gains `in_registry`. Rows already listed from the local index keep their
    own fields; added rows have `here` false and no `entry_id` of their own.
    """
    place = hass.data.get(DATA_PLACE)
    rows = place.index.between(entity_id, start, end) if place is not None else []
    by_name = {row["name"]: row for row in rows}
    listed = {segment["name"] for segment in segments}
    for segment in segments:
        segment["in_registry"] = segment["name"] in by_name
    extra = [
        {
            "entry_id": None,
            "name": row["name"],
            "start": row["start"],
            "end": row["start"] + row["duration"],
            "size": row["size"],
            "here": False,
            "kind": row["kind"],
            "in_registry": True,
        }
        for row in rows
        if row["name"] not in listed
    ]
    return sorted([*segments, *extra], key=lambda segment: segment["start"])


def _segment_facts(
    hass: HomeAssistant, entity_id: str, name: str
) -> tuple[float, float, str]:
    """Start, duration and kind of a file, from the recording index or its name."""
    from .manager import SEGMENT_NAME, parse_start  # noqa: PLC0415
    from .uploader import DATA_UPLOADER  # noqa: PLC0415

    uploader = hass.data.get(DATA_UPLOADER)
    if uploader is not None:
        for manager in uploader.managers.values():
            segment = manager.segments.get(entity_id, {}).get(name)
            if segment is not None:
                return segment.start, segment.duration, segment.kind
    parsed = parse_start(name) if SEGMENT_NAME.match(name) else None
    start = parsed.timestamp() if parsed else time.time()
    if "-event" in name:
        if name.endswith(".mp4"):
            return start, float(EVENT_CLIP_SECONDS), "event_clip"
        return start, float(EVENT_IMAGE_SECONDS), "event_image"
    return start, DEFAULT_RECORDING_SECONDS, "recording"


def _keep_days(hass: HomeAssistant) -> int | None:
    from .uploader import DATA_UPLOADER  # noqa: PLC0415

    uploader = hass.data.get(DATA_UPLOADER)
    if uploader is None or DRIVE_REGISTRY not in uploader.states:
        return None
    return uploader.states[DRIVE_REGISTRY].settings.keep_days


class RegistryDrive(CloudDrive):
    """The locked container registry, through the registry storage integration.

    There are no folders: the camera and day are part of each object's name, which only
    the encrypted index holds. Which repository a clip goes to is decided by the store
    from the camera.
    """

    domain = DRIVE_REGISTRY

    @property
    @override
    def account_title(self) -> str | None:
        """Nothing about the account is ever shown."""
        return None

    @override
    def free_space(self) -> int | None:
        """A public registry has no quota to report."""
        return None

    @override
    def _reason(self, err: Exception) -> str:
        if isinstance(err, RegistryStorageError):
            return reason_code(err)
        raise err

    @override
    async def folder_id(self, folder: Sequence[str]) -> str:
        self._loaded_entry()
        return "/".join(folder)

    @override
    async def _root_id(self, entry: ConfigEntry) -> str:
        return ROOT_PREFIX

    @override
    async def _child_folder(self, entry: ConfigEntry, parent: str, name: str) -> str:
        return f"{parent}/{name}"

    def _store(self, entry: ConfigEntry) -> Any:
        return entry.runtime_data.store

    @override
    async def _upload(
        self,
        entry: ConfigEntry,
        open_stream: OpenStream,
        size: int,
        folder_id: str,
        name: str,
    ) -> RemoteFile:
        parts = folder_id.split("/")
        if len(parts) < 3:
            raise DriveError(REASON_NOT_SET_UP)
        entity_id, day = camera_entity(parts[1]), parts[2]
        place = get_place(self.hass)
        if place.load_task is not None:
            await asyncio.shield(place.load_task)
        store = self._store(entry)
        known = place.index.find(entity_id, name)
        if known is not None:
            return RemoteFile(str(known["id"]), name, int(known["size"]))
        path = getattr(open_stream, "path", None)
        spooled: Path | None = None
        if path is None:
            spooled = await self._spool(open_stream)
            path = spooled
        start, duration, kind = _segment_facts(self.hass, entity_id, name)
        key = f"{entity_id}/{name}"

        def _progress(done: int, total: int) -> None:
            place.progress[key] = (done, total)

        try:
            stored = await store.async_put_file(
                str(path),
                kind=KIND_RECORDING,
                name=object_name(entity_id, day, name),
                camera=entity_id,
                keep_days=_keep_days(self.hass),
                meta={
                    "f": name,
                    "s": round(start, 1),
                    "d": round(duration, 1),
                    "k": kind,
                },
                progress=_progress,
            )
        finally:
            place.progress.pop(key, None)
            if spooled is not None:
                await self.hass.async_add_executor_job(
                    lambda: spooled.unlink(missing_ok=True)
                )
        place.index.add(
            entity_id,
            name,
            object_id=stored.id,
            start=start,
            duration=duration,
            size=stored.plain_size,
            kind=kind,
        )
        return RemoteFile(stored.id, name, stored.plain_size)

    async def _spool(self, open_stream: OpenStream) -> Path:
        target = Path(self.hass.config.path(DOMAIN, ".registry_spool"))
        await self.hass.async_add_executor_job(
            lambda: target.mkdir(parents=True, exist_ok=True)
        )
        spooled = target / f"{time.time_ns()}.part"
        handle = await self.hass.async_add_executor_job(spooled.open, "wb")
        try:
            async for chunk in open_stream():
                await self.hass.async_add_executor_job(handle.write, chunk)
        finally:
            await self.hass.async_add_executor_job(handle.close)
        return spooled

    @override
    async def _list(self, entry: ConfigEntry, folder_id: str) -> list[RemoteFile]:
        parts = folder_id.split("/")
        wanted = f"{parts[1]}/" if len(parts) > 1 else ""
        items = await self._store(entry).async_list(kind=KIND_RECORDING)
        return [
            RemoteFile(item.id, item.name, item.plain_size)
            for item in items
            if item.name.startswith(wanted)
        ]

    @override
    async def _delete(self, entry: ConfigEntry, file_id: str) -> None:
        try:
            await self._store(entry).async_delete(file_id)
        except RegistryStorageError as err:
            if err.reason is not Reason.OBJECT_NOT_FOUND:
                raise
        place = get_place(self.hass)
        place.index.remove_object(file_id)

    @override
    def _free_space(self, entry: ConfigEntry) -> int | None:
        return None


def clear_stray_files(hass: HomeAssistant) -> None:
    """Remove half-spooled and half-downloaded files left by a stop. Runs in the executor."""
    for folder in (".registry_spool", ".registry_getback"):
        root = Path(hass.config.path(DOMAIN, folder))
        if not root.is_dir():
            continue
        for entry in root.iterdir():
            with suppress(OSError):
                entry.unlink()


__all__ = [
    "DATA_PLACE",
    "RegistryDrive",
    "RegistryIndex",
    "RegistryPlace",
    "annotate_segments",
    "async_get_place",
    "clear_stray_files",
    "get_place",
    "object_name",
]
