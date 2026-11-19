"""Keep every snapshot of a recorded camera, whoever or whatever asked for it.

Every still picture of a camera entity is made by its async_camera_image call,
whether a dashboard asks through the image proxy, the snapshot action writes a
file, a notification attaches it or another integration fetches it. This module
wraps that call on the camera entities of the recorded cameras, from this
integration only, and keeps a copy in the background. The picture returned to
the caller is never changed or delayed by keeping it.
"""

import asyncio
from collections.abc import Callable
from dataclasses import dataclass, field
import hashlib
import time
from typing import Any

from homeassistant.components.camera import (
    DATA_COMPONENT as CAMERA_DATA,
    DOMAIN as CAMERA_DOMAIN,
    SERVICE_SNAPSHOT,
)
from homeassistant.components.http import KEY_HASS_USER
from homeassistant.const import ATTR_ENTITY_ID, EVENT_CALL_SERVICE, EVENT_STATE_CHANGED
from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers.http import current_request

from .const import LOGGER
from .events import classify_error
from .watched import (
    KIND_SNAPSHOT,
    ORIGIN_AUTOMATION,
    ORIGIN_DASHBOARD,
    ORIGIN_OTHER,
    ORIGIN_PERSON,
    POINTS_AT_RECORDING,
    STATE_NONE,
    STATE_SAVED,
    WatchedKeeper,
    WatchedRecord,
    watched_file_name,
)

# A snapshot action is matched to the picture it asks for within this time.
SERVICE_MATCH_SECONDS = 15
MAX_SNAPSHOT_BYTES = 10_000_000
PROXY_PATH = "/api/camera_proxy"
WRAPPED = "_camera_recording_snapshot_wrapped"


@dataclass(slots=True)
class SnapshotState:
    """What was last kept for one camera, to skip repeats."""

    last_kept: float = 0
    last_hash: str | None = None
    pending_service: list[tuple[float, str]] = field(default_factory=list)


def classify_origin(path: str | None, has_user: bool) -> str:
    """Who asked for a picture, from the web request that asked, if any."""
    if path is None:
        return ORIGIN_OTHER
    if path.startswith(PROXY_PATH):
        return ORIGIN_DASHBOARD
    return ORIGIN_PERSON if has_user else ORIGIN_OTHER


def decide(
    state: SnapshotState,
    *,
    now: float,
    digest: str,
    forced: bool,
    repeat_seconds: int,
) -> bool:
    """Whether to keep a picture: always when asked by a person or an action.

    Anything else, such as a dashboard picture that refreshes all day, is kept
    at most once per repeat time and only when the picture changed.
    """
    if forced:
        return True
    if now - state.last_kept < repeat_seconds:
        return False
    return digest != state.last_hash


class SnapshotKeeper:
    """Wraps the picture call of recorded cameras and keeps what passes through."""

    def __init__(self, hass: HomeAssistant, keeper: WatchedKeeper) -> None:
        """Nothing is wrapped until attach."""
        self.hass = hass
        self.keeper = keeper
        self.states: dict[str, SnapshotState] = {}
        self._originals: dict[str, tuple[Any, Callable[..., Any]]] = {}
        self._tasks: set[asyncio.Task[None]] = set()

    def state(self, cam: str) -> SnapshotState:
        """The repeat state of a camera."""
        return self.states.setdefault(cam, SnapshotState())

    @callback
    def note_service_call(self, event: Event) -> None:
        """A snapshot action was called: the next picture of its cameras is always kept."""
        data = event.data
        if (
            data.get("domain") != CAMERA_DOMAIN
            or data.get("service") != SERVICE_SNAPSHOT
        ):
            return
        targets = (data.get("service_data") or {}).get(ATTR_ENTITY_ID)
        if isinstance(targets, str):
            targets = [targets]
        if not isinstance(targets, list):
            return
        origin = ORIGIN_PERSON if event.context.user_id else ORIGIN_AUTOMATION
        now = time.monotonic()
        for cam in targets:
            if cam in self.keeper.manager.cameras:
                self.state(cam).pending_service.append((now, origin))

    def _service_origin(self, cam: str) -> str | None:
        state = self.state(cam)
        now = time.monotonic()
        state.pending_service = [
            item
            for item in state.pending_service
            if now - item[0] < SERVICE_MATCH_SECONDS
        ]
        if state.pending_service:
            return state.pending_service.pop(0)[1]
        return None

    @callback
    def wrap(self, cam: str) -> bool:
        """Wrap the picture call of one camera entity. True when wrapped."""
        component = self.hass.data.get(CAMERA_DATA)
        camera = component.get_entity(cam) if component else None
        if camera is None or getattr(camera, WRAPPED, False):
            return False
        original = camera.async_camera_image

        async def async_camera_image(
            width: int | None = None, height: int | None = None
        ) -> bytes | None:
            image = await original(width=width, height=height)
            if image:
                self.seen(cam, image)
            return image

        camera.async_camera_image = async_camera_image
        setattr(camera, WRAPPED, True)
        self._originals[cam] = (camera, original)
        return True

    @callback
    def unwrap_all(self) -> None:
        """Give every camera entity its own picture call back."""
        for camera, _original in self._originals.values():
            if getattr(camera, WRAPPED, False):
                del camera.async_camera_image
                delattr(camera, WRAPPED)
        self._originals.clear()
        for task in list(self._tasks):
            task.cancel()

    @callback
    def seen(self, cam: str, image: bytes) -> None:
        """A picture of a camera was made. Decide quickly, write in the background."""
        settings = self.keeper.settings_for(cam)
        if not settings.keep_snapshots or len(image) > MAX_SNAPSHOT_BYTES:
            return
        request = current_request.get()
        service_origin = self._service_origin(cam)
        if service_origin is not None:
            origin, forced = service_origin, True
        else:
            has_user = request is not None and request.get(KEY_HASS_USER) is not None
            origin = classify_origin(request.path if request else None, has_user)
            forced = False
        state = self.state(cam)
        now = time.time()
        digest = hashlib.sha256(image).hexdigest()
        if not decide(
            state,
            now=now,
            digest=digest,
            forced=forced,
            repeat_seconds=settings.snapshot_seconds,
        ):
            return
        state.last_kept = now
        state.last_hash = digest
        if self.keeper.plain_recording(cam):
            self.keeper.add_row(
                cam,
                WatchedRecord(
                    now,
                    KIND_SNAPSHOT,
                    STATE_SAVED,
                    origin,
                    points_at=POINTS_AT_RECORDING,
                ),
            )
            return
        task = self.keeper.manager.entry.async_create_task(
            self.hass,
            self._async_write(cam, now, origin, image),
            "camera_recording snapshot",
        )
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def _async_write(
        self, cam: str, now: float, origin: str, image: bytes
    ) -> None:
        name = watched_file_name(now, KIND_SNAPSHOT)
        folder = self.keeper.folder(cam)

        def _write() -> None:
            folder.mkdir(parents=True, exist_ok=True)
            part = folder / f".{name}.part"
            part.write_bytes(image)
            part.replace(folder / name)

        try:
            await self.hass.async_add_executor_job(_write)
        except OSError as err:
            LOGGER.debug("Could not keep a snapshot of %s (%s)", cam, err.errno)
            self.keeper.add_row(
                cam,
                WatchedRecord(
                    now,
                    KIND_SNAPSHOT,
                    STATE_NONE,
                    origin,
                    classify_error(err).value,
                ),
            )
            return
        self.keeper.add_row(
            cam,
            WatchedRecord(
                now, KIND_SNAPSHOT, STATE_SAVED, origin, None, name, 0, len(image)
            ),
        )


def async_attach_snapshots(
    hass: HomeAssistant, keeper: WatchedKeeper
) -> Callable[[], None]:
    """Wrap the recorded cameras now and as they appear. Returns the undo."""
    snapshots = SnapshotKeeper(hass, keeper)
    keeper.snapshots = snapshots
    for cam in keeper.manager.cameras:
        snapshots.wrap(cam)
    unsub_service = hass.bus.async_listen(
        EVENT_CALL_SERVICE, snapshots.note_service_call
    )

    @callback
    def _entity_added(event: Event) -> None:
        cam = event.data.get(ATTR_ENTITY_ID)
        if cam in keeper.manager.cameras:
            snapshots.wrap(cam)

    cams = set(keeper.manager.cameras)

    @callback
    def _is_new_camera(data: Any) -> bool:
        return data.get("old_state") is None and data.get(ATTR_ENTITY_ID) in cams

    unsub_registry = hass.bus.async_listen(
        EVENT_STATE_CHANGED, _entity_added, event_filter=_is_new_camera
    )

    @callback
    def _undo() -> None:
        unsub_service()
        unsub_registry()
        snapshots.unwrap_all()

    return _undo
