"""Plays recorded segments to the frontend."""

from http import HTTPStatus

from aiohttp import web

from homeassistant.auth.permissions.const import POLICY_READ
from homeassistant.components.http import KEY_HASS, KEY_HASS_USER, HomeAssistantView
from homeassistant.config_entries import ConfigEntryState

from .const import DOMAIN
from .destination import DestinationError
from .manager import SEGMENT_NAME, RecordingManager


class SegmentView(HomeAssistantView):
    """One recorded segment as an MP4 file. Use a signed path from auth/sign_path."""

    url = "/api/camera_recording/segment/{entry_id}/{entity_id}/{name}"
    name = "api:camera_recording:segment"
    requires_auth = True

    async def get(
        self, request: web.Request, entry_id: str, entity_id: str, name: str
    ) -> web.StreamResponse:
        """Send the file, fetching it back from the destination when it is not here."""
        hass = request.app[KEY_HASS]
        if not SEGMENT_NAME.match(name):
            return web.Response(status=HTTPStatus.NOT_FOUND)
        if not request[KEY_HASS_USER].permissions.check_entity(entity_id, POLICY_READ):
            return web.Response(status=HTTPStatus.FORBIDDEN)
        entry = hass.config_entries.async_get_entry(entry_id)
        if (
            entry is None
            or entry.domain != DOMAIN
            or entry.state is not ConfigEntryState.LOADED
        ):
            return web.Response(status=HTTPStatus.NOT_FOUND)
        manager: RecordingManager = entry.runtime_data
        if entity_id not in manager.cameras:
            return web.Response(status=HTTPStatus.NOT_FOUND)
        try:
            path = await manager.async_playable_path(entity_id, name)
        except DestinationError:
            return web.Response(status=HTTPStatus.BAD_GATEWAY)
        if path is None:
            return web.Response(status=HTTPStatus.NOT_FOUND)
        return web.FileResponse(
            path,
            headers={
                "Content-Type": (
                    "image/jpeg" if name.endswith(".jpg") else "video/mp4"
                ),
                "Cache-Control": "private, max-age=3600",
            },
        )
