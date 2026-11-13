"""Upload and serve single-file dashboard resources."""

from hashlib import sha256
from http import HTTPStatus
from pathlib import Path
import unicodedata
import uuid

from aiohttp.web import FileResponse, Request, Response, StreamResponse

from homeassistant.components.http import KEY_HASS, HomeAssistantView, require_admin
from homeassistant.core import HomeAssistant
from homeassistant.util.file import WriteError, write_utf8_file

from .const import LOVELACE_DATA, RESOURCE_UPLOAD_URL
from .resources import UPLOADED_RESOURCE_NAME, ResourceStorageCollection

MAX_UPLOAD_SIZE = 5 * 1024 * 1024
_TYPES = {
    "css": ("css", "text/css"),
    "js": ("module", "text/javascript"),
    "mjs": ("module", "text/javascript"),
}


def _upload_path(hass: HomeAssistant, stored_name: str) -> Path:
    """Return the path of a validated generated name."""
    return Path(hass.config.path(".storage", "lovelace_resource_uploads", stored_name))


def _write_file(path: Path, content: bytes) -> None:
    """Write a complete resource into the private configuration directory."""
    path.parent.mkdir(parents=True, exist_ok=True)
    write_utf8_file(str(path), content, private=True, mode="wb")


class ResourceUploadView(HomeAssistantView):
    """Create a dashboard resource from a standalone JavaScript or CSS file."""

    url = RESOURCE_UPLOAD_URL
    name = "api:lovelace:resource-upload"

    @require_admin
    async def post(self, request: Request) -> Response:
        """Validate the file and register it in the normal resource collection."""
        hass = request.app[KEY_HASS]
        resources = hass.data[LOVELACE_DATA].resources
        if hass.config.safe_mode or not isinstance(
            resources, ResourceStorageCollection
        ):
            return self.json_message(
                "Resource upload is unavailable", HTTPStatus.FORBIDDEN
            )

        filename = request.query.get("filename", "")
        name, separator, extension = filename.rpartition(".")
        extension = extension.lower()
        if (
            not name
            or not separator
            or extension not in _TYPES
            or len(filename.encode()) > 255
            or any(
                char in "/\\" or unicodedata.category(char).startswith("C")
                for char in filename
            )
        ):
            return self.json_message(
                "Choose a JavaScript or CSS file", HTTPStatus.BAD_REQUEST
            )

        if (
            request.content_length is not None
            and request.content_length > MAX_UPLOAD_SIZE
        ):
            return self.json_message(
                "Resource exceeds the size limit", HTTPStatus.REQUEST_ENTITY_TOO_LARGE
            )
        content = bytearray()
        async for chunk in request.content.iter_chunked(64 * 1024):
            content.extend(chunk)
            if len(content) > MAX_UPLOAD_SIZE:
                return self.json_message(
                    "Resource exceeds the size limit",
                    HTTPStatus.REQUEST_ENTITY_TOO_LARGE,
                )
        try:
            if not content.strip() or b"\0" in content:
                raise ValueError
            content.decode("utf-8")
        except ValueError:
            return self.json_message(
                "Resource must contain UTF-8 text", HTTPStatus.BAD_REQUEST
            )

        digest = sha256(content).hexdigest()
        file_id = uuid.uuid5(uuid.NAMESPACE_URL, f"{filename}:{digest}").hex
        stored_name = f"{file_id}.{extension}"
        url = f"{RESOURCE_UPLOAD_URL}/{stored_name}"
        path = _upload_path(hass, stored_name)
        resource_type, _ = _TYPES[extension]
        async with resources.upload_lock:
            existing = await resources.async_get_uploaded_resource(url)
            try:
                await hass.async_add_executor_job(_write_file, path, bytes(content))
            except (OSError, WriteError):
                return self.json_message(
                    "Resource file could not be saved", HTTPStatus.INTERNAL_SERVER_ERROR
                )
            if existing is not None:
                return self.json(existing)
            try:
                resource = await resources.async_create_uploaded_resource(
                    url, resource_type, filename
                )
            except Exception:
                if await resources.async_get_uploaded_resource(url) is None:
                    await hass.async_add_executor_job(
                        lambda: path.unlink(missing_ok=True)
                    )
                raise
        return self.json(resource, status_code=HTTPStatus.CREATED)


class ResourceUploadFileView(HomeAssistantView):
    """Serve an active uploaded resource to an authenticated dashboard."""

    url = RESOURCE_UPLOAD_URL + "/{filename}"
    name = "api:lovelace:resource-upload-file"

    async def get(self, request: Request, filename: str) -> StreamResponse:
        """Allow normal Home Assistant authentication, including signed paths."""
        hass = request.app[KEY_HASS]
        resources = hass.data[LOVELACE_DATA].resources
        if (
            hass.config.safe_mode
            or not UPLOADED_RESOURCE_NAME.fullmatch(filename)
            or not isinstance(resources, ResourceStorageCollection)
            or await resources.async_get_uploaded_resource(
                f"{RESOURCE_UPLOAD_URL}/{filename}"
            )
            is None
        ):
            return self.json_message("Resource not found", HTTPStatus.NOT_FOUND)

        extension = filename.rsplit(".", 1)[1]
        return FileResponse(
            _upload_path(hass, filename),
            headers={
                "Content-Type": _TYPES[extension][1],
                "Cache-Control": "private, no-store",
            },
        )
