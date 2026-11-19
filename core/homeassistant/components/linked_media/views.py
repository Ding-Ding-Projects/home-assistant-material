"""Serve a linked file to players through an address of this system."""

from collections.abc import Callable
from http import HTTPStatus
from pathlib import Path

from aiohttp import hdrs, web
from aiohttp.abc import AbstractStreamWriter
from aiohttp.web_request import BaseRequest

from homeassistant.components.http import KEY_HASS, HomeAssistantView

from .const import FETCH_KEEP, FailureReason
from .data import async_get_manager
from .fetch import FetchError
from .manager import LinkedFile, LinkedMediaManager

SAFE_HEADERS = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox",
}
FAILURE_STATUS = {
    "not_found": HTTPStatus.NOT_FOUND,
    "too_large": HTTPStatus.REQUEST_ENTITY_TOO_LARGE,
    "timeout": HTTPStatus.GATEWAY_TIMEOUT,
    "unsupported_type": HTTPStatus.UNSUPPORTED_MEDIA_TYPE,
    "playlist_not_supported": HTTPStatus.UNSUPPORTED_MEDIA_TYPE,
    "live_no_position": HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE,
}


def _failure(err: FetchError) -> web.Response:
    """Answer a player with a plain reason."""
    return web.Response(
        status=FAILURE_STATUS.get(err.reason.value, HTTPStatus.BAD_GATEWAY),
        text=f"The linked file could not be fetched: {err.reason.value}",
        headers=SAFE_HEADERS,
    )


class CopyResponse(web.FileResponse):
    """A file response that lets go of its copy once it has been sent."""

    def __init__(
        self, path: Path, on_done: Callable[[], None], headers: dict[str, str]
    ) -> None:
        """Remember what to call when the copy is no longer read."""
        super().__init__(path, headers=headers)
        self._on_done: Callable[[], None] | None = on_done

    async def prepare(self, request: BaseRequest) -> AbstractStreamWriter | None:
        """Send the file, then let go of the copy."""
        try:
            return await super().prepare(request)
        finally:
            if self._on_done is not None:
                self._on_done()
                self._on_done = None


class LinkedFileView(HomeAssistantView):
    """A linked file, fetched when it is asked for. Use a signed path."""

    url = "/api/linked_media/file/{file_id}"
    name = "api:linked_media:file"
    requires_auth = True

    async def get(self, request: web.Request, file_id: str) -> web.StreamResponse:
        """Send the file, fetching it from its web address now."""
        hass = request.app[KEY_HASS]
        manager = async_get_manager(hass)
        if manager is None or (linked := manager.get(file_id)) is None:
            return web.Response(status=HTTPStatus.NOT_FOUND)
        if linked.live:
            if request.headers.get(hdrs.RANGE, "bytes=0-").strip() != "bytes=0-":
                return _failure(FetchError(FailureReason.LIVE_NO_POSITION))
            return await self._pass_through(request, manager, linked)
        if hdrs.RANGE in request.headers or linked.fetch == FETCH_KEEP:
            return await self._send_copy(request, manager, linked)
        return await self._pass_through(request, manager, linked)

    async def _send_copy(
        self, request: web.Request, manager: LinkedMediaManager, linked: LinkedFile
    ) -> web.StreamResponse:
        """Serve byte ranges from a temporary copy that is removed afterwards."""
        try:
            copy = await manager.async_acquire_copy(linked)
        except FetchError as err:
            return _failure(err)
        return CopyResponse(
            copy.path,
            lambda: manager.release_copy(linked.file_id),
            headers={**SAFE_HEADERS, hdrs.CONTENT_TYPE: linked.content_type},
        )

    async def _pass_through(
        self, request: web.Request, manager: LinkedMediaManager, linked: LinkedFile
    ) -> web.StreamResponse:
        """Stream the file straight through, keeping no copy at all."""
        try:
            # Only the idle timeout limits a stream, so a long play is not cut.
            opened = await manager.async_open(linked, None)
        except FetchError as err:
            return _failure(err)
        if opened.live:
            linked.live = True
        manager.stream_started(linked)
        try:
            headers = {**SAFE_HEADERS, hdrs.CONTENT_TYPE: opened.content_type}
            if opened.live:
                headers[hdrs.ACCEPT_RANGES] = "none"
            response = web.StreamResponse(headers=headers)
            if opened.size is not None:
                response.content_length = opened.size
            await response.prepare(request)
            try:
                async for chunk in opened.iter_chunks():
                    await response.write(chunk)
            except FetchError as err:
                manager.record_failure(linked, err)
                # The answer has started, so the only plain signal left is to stop.
                if request.transport is not None:
                    request.transport.close()
                return response
            await response.write_eof()
        finally:
            await opened.close()
            manager.stream_ended(linked.file_id)
        return response
