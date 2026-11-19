"""WebSocket commands and the file view for kept live views and snapshots."""

from http import HTTPStatus
import time
from typing import Any

from aiohttp import web
import probatio

from homeassistant.auth.permissions.const import POLICY_READ
from homeassistant.components import websocket_api
from homeassistant.components.http import KEY_HASS, KEY_HASS_USER, HomeAssistantView
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import Unauthorized
from homeassistant.helpers import config_validation as cv
from homeassistant.util import dt as dt_util
from homeassistant.util.ulid import ulid

from .watched import (
    MAX_LONGEST_MINUTES,
    MAX_SNAPSHOT_SECONDS,
    MIN_LONGEST_MINUTES,
    MIN_SNAPSHOT_SECONDS,
    ROUTE_HOME,
    LiveWatch,
    WatchedKeeper,
    WatchRefused,
    keeper_for_camera,
    keepers,
)

MAX_WINDOW_SECONDS = 8 * 86400
OFFER_LIMIT = 65536


@callback
def async_register_watched(hass: HomeAssistant) -> None:
    """Register the commands and the file view once."""
    hass.http.register_view(WatchedFileView())
    for command in (
        ws_watched_list,
        ws_watched_settings,
        ws_watch_subscribe,
        ws_watch_offer,
        ws_watch_candidate,
    ):
        websocket_api.async_register_command(hass, command)


def _check_read(connection: websocket_api.ActiveConnection, entity_id: str) -> None:
    if not connection.user.permissions.check_entity(entity_id, POLICY_READ):
        raise Unauthorized(entity_id=entity_id)


def _summary(keeper: WatchedKeeper, cam: str) -> dict[str, Any]:
    return {
        "entry_id": keeper.entry_id,
        "settings": keeper.settings_for(cam).as_dict(),
        "kept_today": keeper.kept_today(cam),
        "live": keeper.live_state(cam),
    }


@websocket_api.websocket_command(
    {
        probatio.Required("type"): "camera_recording/watched/list",
        probatio.Required("entity_id"): cv.entity_id,
        probatio.Required("start_time"): str,
        probatio.Required("end_time"): str,
    }
)
@callback
def ws_watched_list(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Kept live views and snapshots of one camera between two times."""
    cam = msg["entity_id"]
    _check_read(connection, cam)
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
    keeper = keeper_for_camera(hass, cam)
    if keeper is None:
        connection.send_result(msg["id"], {"recorded": False, "rows": []})
        return
    connection.send_result(
        msg["id"],
        {
            "recorded": True,
            "rows": keeper.rows_between(cam, start.timestamp(), end.timestamp()),
            **_summary(keeper, cam),
        },
    )


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "camera_recording/watched/settings",
        probatio.Required("entry_id"): str,
        probatio.Required("entity_id"): cv.entity_id,
        probatio.Optional("auto_start"): bool,
        probatio.Optional("keep_live"): bool,
        probatio.Optional("keep_snapshots"): bool,
        probatio.Optional("longest_minutes"): probatio.All(
            int, probatio.Range(min=MIN_LONGEST_MINUTES, max=MAX_LONGEST_MINUTES)
        ),
        probatio.Optional("snapshot_seconds"): probatio.All(
            int, probatio.Range(min=MIN_SNAPSHOT_SECONDS, max=MAX_SNAPSHOT_SECONDS)
        ),
    }
)
@callback
def ws_watched_settings(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Change what is kept of a camera's live views and snapshots."""
    keeper = keepers(hass).get(msg["entry_id"])
    cam = msg["entity_id"]
    if keeper is None or cam not in keeper.manager.cameras:
        connection.send_error(
            msg["id"], "not_found", "That camera is not recorded here"
        )
        return
    keeper.async_set_settings(
        cam,
        **{
            key: msg.get(key)
            for key in (
                "auto_start",
                "keep_live",
                "keep_snapshots",
                "longest_minutes",
                "snapshot_seconds",
            )
        },
    )
    connection.send_result(msg["id"], _summary(keeper, cam))


def _state_event(keeper: WatchedKeeper, cam: str) -> dict[str, Any]:
    return {"type": "state", **keeper.live_state(cam)}


def _refused(err: WatchRefused) -> dict[str, Any]:
    return {
        "type": "error",
        "code": err.code,
        "retry_after": (
            max(0, round(err.retry_at - time.time())) if err.retry_at else None
        ),
    }


async def _async_join(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> tuple[WatchedKeeper, LiveWatch, str] | None:
    """Add this connection as a viewer, reporting a refusal as an event."""
    cam = msg["entity_id"]
    _check_read(connection, cam)
    keeper = keeper_for_camera(hass, cam)
    if keeper is None:
        connection.send_error(msg["id"], "not_found", "That camera is not recorded")
        return None
    viewer = ulid()
    connection.subscriptions[msg["id"]] = lambda: keeper.close(cam, viewer)
    connection.send_result(msg["id"])
    try:
        watch = await keeper.async_open(cam, viewer)
    except WatchRefused as err:
        connection.send_message(websocket_api.event_message(msg["id"], _refused(err)))
        return None

    @callback
    def _push() -> None:
        connection.send_message(
            websocket_api.event_message(msg["id"], _state_event(keeper, cam))
        )
        if watch.ended:
            connection.send_message(
                websocket_api.event_message(msg["id"], {"type": "ended"})
            )

    watch.listeners.append(_push)

    def _unsubscribe() -> None:
        if _push in watch.listeners:
            watch.listeners.remove(_push)
        keeper.close(cam, viewer)

    connection.subscriptions[msg["id"]] = _unsubscribe
    _push()
    return keeper, watch, viewer


@websocket_api.websocket_command(
    {
        probatio.Required("type"): "camera_recording/watch/subscribe",
        probatio.Required("entity_id"): cv.entity_id,
    }
)
@websocket_api.async_response
async def ws_watch_subscribe(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """A picture of the camera is showing live video: keep it while it shows."""
    await _async_join(hass, connection, msg)


# The go2rtc client of each browser session, for its trickled candidates.
SESSIONS: dict[str, Any] = {}


@websocket_api.websocket_command(
    {
        probatio.Required("type"): "camera_recording/watch/offer",
        probatio.Required("entity_id"): cv.entity_id,
        probatio.Required("offer"): probatio.All(str, probatio.Length(max=OFFER_LIMIT)),
    }
)
@websocket_api.async_response
async def ws_watch_offer(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Watch a camera that streams through its service, through the home.

    The browser's offer is answered by the bundled go2rtc from the one live
    view the home already pulls, so a second viewer opens nothing new.
    """
    joined = await _async_join(hass, connection, msg)
    if joined is None:
        return
    _keeper, watch, _viewer = joined
    if watch.route != ROUTE_HOME or watch.stream is None:
        connection.send_message(
            websocket_api.event_message(
                msg["id"], {"type": "error", "code": "not_through_home"}
            )
        )
        return
    # Loaded only here: the go2rtc client library comes with the go2rtc integration.
    from go2rtc_client import ws  # noqa: PLC0415

    provider = hass.config_entries.async_loaded_entries("go2rtc")[0].runtime_data
    client = ws.Go2RtcWsClient(
        provider._session,  # noqa: SLF001
        provider._url,  # noqa: SLF001
        source=watch.stream,
    )
    session_id = ulid()
    SESSIONS[session_id] = client
    unsubscribe = connection.subscriptions[msg["id"]]

    def _close() -> None:
        SESSIONS.pop(session_id, None)
        hass.async_create_task(client.close())
        unsubscribe()

    connection.subscriptions[msg["id"]] = _close

    @callback
    def on_message(message: Any) -> None:
        match message:
            case ws.WebRTCAnswer():
                value = {"type": "answer", "answer": message.sdp}
            case ws.WebRTCCandidate():
                value = {
                    "type": "candidate",
                    "candidate": {"candidate": message.candidate},
                }
            case ws.WsError():
                value = {"type": "error", "code": "webrtc_offer_failed"}
        connection.send_message(websocket_api.event_message(msg["id"], value))

    client.subscribe(on_message)
    connection.send_message(
        websocket_api.event_message(
            msg["id"], {"type": "session", "session_id": session_id}
        )
    )
    await client.send(ws.WebRTCOffer(msg["offer"], []))


@websocket_api.websocket_command(
    {
        probatio.Required("type"): "camera_recording/watch/candidate",
        probatio.Required("entity_id"): cv.entity_id,
        probatio.Required("session_id"): str,
        probatio.Required("candidate"): str,
    }
)
@websocket_api.async_response
async def ws_watch_candidate(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """A trickled candidate from the browser for a watched live view."""
    _check_read(connection, msg["entity_id"])
    client = SESSIONS.get(msg["session_id"])
    if client is None:
        connection.send_error(msg["id"], "not_found", "No such live view")
        return
    from go2rtc_client import ws  # noqa: PLC0415

    await client.send(ws.WebRTCCandidate(msg["candidate"]))
    connection.send_result(msg["id"])


class WatchedFileView(HomeAssistantView):
    """One kept live view or snapshot. Use a signed path from auth/sign_path."""

    url = "/api/camera_recording/watched/{entry_id}/{entity_id}/{name}"
    name = "api:camera_recording:watched"
    requires_auth = True

    async def get(
        self, request: web.Request, entry_id: str, entity_id: str, name: str
    ) -> web.StreamResponse:
        """Send the file."""
        hass = request.app[KEY_HASS]
        if not request[KEY_HASS_USER].permissions.check_entity(entity_id, POLICY_READ):
            return web.Response(status=HTTPStatus.FORBIDDEN)
        keeper = keepers(hass).get(entry_id)
        path = keeper.playable_path(entity_id, name) if keeper else None
        if path is None or not await hass.async_add_executor_job(path.is_file):
            return web.Response(status=HTTPStatus.NOT_FOUND)
        return web.FileResponse(
            path,
            headers={
                "Content-Type": "image/jpeg" if name.endswith(".jpg") else "video/mp4",
                "Cache-Control": "private, max-age=3600",
            },
        )
