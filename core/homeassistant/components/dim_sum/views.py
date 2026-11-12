"""The view that serves a cached dish picture."""

from http import HTTPStatus

from aiohttp import web

from homeassistant.components.http import KEY_HASS, HomeAssistantView

from .const import PICTURE_CONTENT_TYPE, PICTURE_VIEW_URL
from .manager import DATA_MANAGER, valid_picture_id


class DimSumPictureView(HomeAssistantView):
    """Serve one cached picture to a signed-in user."""

    url = PICTURE_VIEW_URL.format(picture_id="{picture_id}")
    name = "api:dim_sum:picture"
    requires_auth = True

    async def get(self, request: web.Request, picture_id: str) -> web.Response:
        """Return the picture, or 404 when the id is not valid or not cached."""
        if not valid_picture_id(picture_id):
            return web.Response(status=HTTPStatus.NOT_FOUND)
        manager = request.app[KEY_HASS].data[DATA_MANAGER]
        data = await manager.async_picture(picture_id)
        if data is None:
            return web.Response(status=HTTPStatus.NOT_FOUND)
        return web.Response(
            body=data,
            content_type=PICTURE_CONTENT_TYPE,
            headers={
                "Cache-Control": "private, max-age=86400",
                "X-Content-Type-Options": "nosniff",
            },
        )
