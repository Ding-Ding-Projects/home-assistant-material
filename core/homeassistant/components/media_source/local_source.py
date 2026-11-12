"""Local Media Source Implementation."""

from collections.abc import Awaitable
import io
import logging
import mimetypes
import os
from pathlib import Path
import shutil
from typing import Any, Protocol, cast, override

from aiohttp import hdrs, web
from aiohttp.web_request import FileField
import probatio

from homeassistant.components import http, websocket_api
from homeassistant.components.http import require_admin
from homeassistant.components.media_player import (
    BrowseError,
    BrowseMedia,
    MediaClass,
    SearchMedia,
    SearchMediaQuery,
)
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.util import raise_if_invalid_filename, raise_if_invalid_path

from .const import (
    DATA_LOCAL_SOURCE,
    DOMAIN,
    DOWNLOAD_ONLY_MIME_TYPES,
    MEDIA_CLASS_MAP,
    MEDIA_MIME_TYPES,
    URI_SCHEME,
)
from .error import Unresolvable
from .models import BrowseMediaSource, MediaSource, MediaSourceItem, PlayMedia

# 2 GiB; aiohttp spools file fields to a temporary file, so uploads stay out of memory.
MAX_UPLOAD_SIZE = 1024 * 1024 * 1024 * 2
MAX_SEARCH_RESULTS = 100
MAX_NAME_LENGTH = 255
LOGGER = logging.getLogger(__name__)


class PathNotSupportedError(HomeAssistantError):
    """Error to indicate a path is not supported."""


class InvalidFileNameError(HomeAssistantError):
    """Error to indicate an invalid file name."""


class MediaFolderError(HomeAssistantError):
    """Error raised by a folder or rename operation, with a stable error code."""

    def __init__(self, code: str, message: str) -> None:
        """Initialize the error."""
        super().__init__(message)
        self.code = code


def _validate_entry_name(name: str, *, media_file: bool) -> str:
    """Validate a new file or folder name and return it."""
    if (
        not name
        or len(name.encode()) > MAX_NAME_LENGTH
        or name in (".", "..")
        or name != name.strip()
        or name.startswith(".")
        or any(char in name for char in "/\\")
        or any(ord(char) < 32 or ord(char) == 127 for char in name)
    ):
        raise MediaFolderError("invalid_name", "Invalid name")

    try:
        raise_if_invalid_filename(name)
    except ValueError as err:
        raise MediaFolderError("invalid_name", "Invalid name") from err

    if media_file:
        mime_type, _ = mimetypes.guess_type(name)
        if not mime_type or mime_type.split("/")[0] not in MEDIA_MIME_TYPES:
            raise MediaFolderError("invalid_name", "Not a media file name")

    return name


def _raise_walk_error(err: OSError) -> None:
    """Re-raise an error found while walking a folder."""
    raise err


def _count_contents(folder: Path) -> tuple[int, int]:
    """Return how many files and folders a folder holds, not following links.

    The folder itself is not counted. A link counts as a file. An unreadable
    subfolder raises an OSError instead of being skipped.
    """
    files = 0
    folders = 0
    for dirpath, dirnames, filenames in os.walk(folder, onerror=_raise_walk_error):
        real_dirs = [
            name for name in dirnames if not (Path(dirpath) / name).is_symlink()
        ]
        folders += len(real_dirs)
        files += len(filenames) + len(dirnames) - len(real_dirs)
    return files, folders


class UploadedFile(Protocol):
    """Protocol describing properties of an uploaded file."""

    filename: str
    file: io.IOBase
    content_type: str


async def async_get_media_source(hass: HomeAssistant) -> LocalSource:
    """Set up local media source."""
    return LocalSource(hass, DOMAIN, "My media", hass.config.media_dirs, "/media")


class LocalSource(MediaSource):
    """Provide local directories as media sources."""

    def __init__(
        self,
        hass: HomeAssistant,
        domain: str,
        name: str,
        media_dirs: dict[str, str],
        url_prefix: str,
    ) -> None:
        """Initialize local source."""
        super().__init__(domain)
        self.hass = hass
        self.name = name
        self.media_dirs = media_dirs
        self.url_prefix = url_prefix

    @callback
    def async_full_path(self, source_dir_id: str, location: str) -> Path:
        """Return full path."""
        base_path = self.media_dirs[source_dir_id]
        full_path = Path(base_path, location)
        full_path.relative_to(base_path)
        return full_path

    @callback
    def async_parse_identifier(self, item: MediaSourceItem) -> tuple[str, str]:
        """Parse identifier."""
        if item.domain != self.domain:
            raise Unresolvable("Unknown domain.")

        source_dir_id, _, location = item.identifier.partition("/")
        if source_dir_id not in self.media_dirs:
            raise Unresolvable("Unknown source directory.")

        try:
            raise_if_invalid_path(location)
        except ValueError as err:
            raise Unresolvable("Invalid path.") from err

        if Path(location).is_absolute():
            raise Unresolvable("Invalid path.")

        return source_dir_id, location

    async def async_delete_media(self, item: MediaSourceItem) -> None:
        """Delete media."""
        source_dir_id, location = self.async_parse_identifier(item)
        full_path = self.async_full_path(source_dir_id, location)
        root = Path(self.media_dirs[source_dir_id]).resolve()

        def _do_delete() -> None:
            parent = full_path.parent.resolve()
            if not parent.is_relative_to(root) or full_path.resolve() == root:
                raise PathNotSupportedError("Path is not a file")
            item_path = parent / full_path.name
            if not item_path.exists():
                raise FileNotFoundError("Path does not exist")

            if not item_path.is_file():
                raise PathNotSupportedError("Path is not a file")

            item_path.unlink()

        await self.hass.async_add_executor_job(_do_delete)

    async def async_upload_media(
        self, target_folder: MediaSourceItem, uploaded_file: UploadedFile
    ) -> str:
        """Upload media.

        Return value is the media source ID of the uploaded file.
        """
        source_dir_id, location = self.async_parse_identifier(target_folder)

        if not uploaded_file.content_type.startswith(("image/", "video/", "audio/")):
            LOGGER.error("Content type not allowed")
            raise probatio.Invalid("Only images and video are allowed")

        try:
            raise_if_invalid_filename(uploaded_file.filename)
        except ValueError as err:
            raise InvalidFileNameError from err

        full_dir = self.async_full_path(source_dir_id, location)
        root = Path(self.media_dirs[source_dir_id]).resolve()

        def _do_move() -> None:
            """Move file to target."""
            target_dir = full_dir.resolve()
            if not target_dir.is_relative_to(root):
                raise PathNotSupportedError("Path is outside the media folder")
            try:
                target_path = target_dir / uploaded_file.filename

                target_path.relative_to(target_dir)
                raise_if_invalid_path(str(target_path))

                target_dir.mkdir(parents=True, exist_ok=True)
            except ValueError as err:
                raise PathNotSupportedError("Invalid path") from err

            if target_path.is_symlink():
                raise PathNotSupportedError("Links cannot be overwritten")

            with target_path.open("wb") as target_fp:
                shutil.copyfileobj(uploaded_file.file, target_fp)

        await self.hass.async_add_executor_job(
            _do_move,
        )

        return f"{target_folder.media_source_id}/{uploaded_file.filename}"

    def _checked_dir(self, source_dir_id: str, location: str) -> Path:
        """Return an existing folder whose real path is inside the media directory."""
        root = Path(self.media_dirs[source_dir_id]).resolve()
        try:
            real = self.async_full_path(source_dir_id, location).resolve(strict=True)
        except FileNotFoundError as err:
            raise MediaFolderError("not_found", "Folder does not exist") from err
        if not real.is_relative_to(root):
            raise MediaFolderError("not_allowed", "Path is outside the media folder")
        if not real.is_dir():
            raise MediaFolderError("not_allowed", "Path is not a folder")
        return real

    def _checked_entry(self, source_dir_id: str, location: str) -> Path:
        """Return an existing file or folder that may be renamed, moved or removed."""
        parts = [part for part in location.replace("\\", "/").split("/") if part]
        if not parts or "." in parts:
            raise MediaFolderError("not_allowed", "The media folder itself is fixed")
        parent_location = "/".join(parts[:-1])
        entry = self._checked_dir(source_dir_id, parent_location) / parts[-1]
        root = Path(self.media_dirs[source_dir_id]).resolve()
        if not entry.name or entry == root:
            raise MediaFolderError("not_allowed", "The media folder itself is fixed")
        if not os.path.lexists(entry):
            raise MediaFolderError("not_found", "Path does not exist")
        if entry.is_symlink():
            raise MediaFolderError("not_allowed", "Links cannot be changed")
        return entry

    def _media_id(self, source_dir_id: str, path: Path) -> str:
        """Return the media content ID of a path inside a media directory."""
        root = Path(self.media_dirs[source_dir_id]).resolve()
        relative = path.relative_to(root).as_posix()
        return f"{URI_SCHEME}{DOMAIN}/{source_dir_id}/{relative}"

    async def async_create_folder(self, parent: MediaSourceItem, name: str) -> str:
        """Create a folder and return its media content ID."""
        source_dir_id, location = self.async_parse_identifier(parent)

        def _do_create() -> str:
            _validate_entry_name(name, media_file=False)
            target = self._checked_dir(source_dir_id, location) / name
            if os.path.lexists(target):
                raise MediaFolderError("exists", "Name already exists")
            try:
                target.mkdir()
            except FileExistsError as err:
                raise MediaFolderError("exists", "Name already exists") from err
            return self._media_id(source_dir_id, target)

        return await self.hass.async_add_executor_job(_do_create)

    async def async_rename(self, item: MediaSourceItem, new_name: str) -> str:
        """Rename a file or folder and return its new media content ID."""
        source_dir_id, location = self.async_parse_identifier(item)

        def _do_rename() -> str:
            entry = self._checked_entry(source_dir_id, location)
            _validate_entry_name(new_name, media_file=entry.is_file())
            target = entry.parent / new_name
            if os.path.lexists(target) and not (
                entry.name != new_name
                and entry.name.casefold() == new_name.casefold()
                and entry.samefile(target)
            ):
                raise MediaFolderError("exists", "Name already exists")
            entry.rename(target)
            return self._media_id(source_dir_id, target)

        return await self.hass.async_add_executor_job(_do_rename)

    async def async_move(
        self, item: MediaSourceItem, destination: MediaSourceItem
    ) -> str:
        """Move a file or folder into another folder of the same source."""
        source_dir_id, location = self.async_parse_identifier(item)
        dest_source_dir_id, dest_location = self.async_parse_identifier(destination)
        if dest_source_dir_id != source_dir_id:
            raise MediaFolderError(
                "not_allowed", "Items can only move within the same media folder"
            )

        def _do_move() -> str:
            entry = self._checked_entry(source_dir_id, location)
            dest = self._checked_dir(source_dir_id, dest_location)
            if entry.is_dir() and (dest == entry or dest.is_relative_to(entry)):
                raise MediaFolderError(
                    "not_allowed", "A folder cannot move into itself"
                )
            target = dest / entry.name
            if os.path.lexists(target):
                raise MediaFolderError("exists", "Name already exists")
            shutil.move(str(entry), str(target))
            return self._media_id(source_dir_id, target)

        return await self.hass.async_add_executor_job(_do_move)

    async def async_folder_info(self, item: MediaSourceItem) -> dict[str, int]:
        """Return how many files and folders a folder holds."""
        source_dir_id, location = self.async_parse_identifier(item)

        def _do_count() -> dict[str, int]:
            files, folders = _count_contents(self._checked_dir(source_dir_id, location))
            return {"files": files, "folders": folders}

        return await self.hass.async_add_executor_job(_do_count)

    async def async_remove_folder(
        self,
        item: MediaSourceItem,
        recursive: bool,
        expected_files: int | None = None,
        expected_folders: int | None = None,
    ) -> dict[str, int]:
        """Remove a folder, and what it holds only when recursive is set.

        The answer counts what was removed inside the folder, in the same way as
        folder info: the folder itself is not counted. When expected counts are
        given and the live counts differ, nothing is removed and the error code
        is "changed".
        """
        source_dir_id, location = self.async_parse_identifier(item)

        def _do_remove() -> dict[str, int]:
            entry = self._checked_entry(source_dir_id, location)
            if not entry.is_dir():
                raise MediaFolderError("not_allowed", "Path is not a folder")
            files, folders = _count_contents(entry)
            if (files or folders) and not recursive:
                raise MediaFolderError("not_empty", "Folder is not empty")
            if (expected_files is not None and expected_files != files) or (
                expected_folders is not None and expected_folders != folders
            ):
                raise MediaFolderError("changed", "Folder contents changed")
            if recursive:
                shutil.rmtree(entry)
            else:
                entry.rmdir()
            return {"files": files, "folders": folders}

        return await self.hass.async_add_executor_job(_do_remove)

    @override
    async def async_resolve_media(self, item: MediaSourceItem) -> PlayMedia:
        """Resolve media to a url."""
        source_dir_id, location = self.async_parse_identifier(item)
        path = self.async_full_path(source_dir_id, location)
        mime_type, _ = mimetypes.guess_type(str(path))
        assert isinstance(mime_type, str)
        return PlayMedia(f"{self.url_prefix}/{item.identifier}", mime_type, path=path)

    @override
    async def async_browse_media(self, item: MediaSourceItem) -> BrowseMediaSource:
        """Return media."""
        if item.identifier:
            try:
                source_dir_id, location = self.async_parse_identifier(item)
            except Unresolvable as err:
                raise BrowseError(str(err)) from err

        else:
            source_dir_id, location = None, ""

        return await self.hass.async_add_executor_job(
            self._browse_media, source_dir_id, location
        )

    @override
    async def async_search_media(
        self, item: MediaSourceItem, query: SearchMediaQuery
    ) -> SearchMedia:
        """Search media by file or folder name within the local media directories."""
        if item.identifier:
            try:
                source_dir_id, location = self.async_parse_identifier(item)
            except Unresolvable as err:
                raise BrowseError(str(err)) from err
            search_dirs = [(source_dir_id, location)]
        else:
            search_dirs = [(source_dir_id, "") for source_dir_id in self.media_dirs]

        return await self.hass.async_add_executor_job(
            self._search_media, search_dirs, query
        )

    def _search_media(
        self, search_dirs: list[tuple[str, str]], query: SearchMediaQuery
    ) -> SearchMedia:
        """Search media files and folders by name (runs in the executor)."""
        query_str = query.search_query.casefold()
        filter_classes = set(query.media_filter_classes or ())
        results: list[BrowseMedia] = []

        for source_dir_id, location in search_dirs:
            if len(results) >= MAX_SEARCH_RESULTS:
                break
            base_path = Path(self.media_dirs[source_dir_id])
            search_path = base_path / location
            if not search_path.is_dir():
                continue

            # Traverse lazily so MAX_SEARCH_RESULTS can short-circuit large libraries
            for path in search_path.rglob("*"):
                if len(results) >= MAX_SEARCH_RESULTS:
                    break
                relative = path.relative_to(base_path)
                if any(part.startswith(".") for part in relative.parts):
                    continue
                if query_str not in path.name.casefold():
                    continue
                if path.is_dir():
                    # A media class filter asks for media, which a folder is not
                    if not filter_classes:
                        results.append(
                            BrowseMediaSource(
                                domain=self.domain,
                                identifier=f"{source_dir_id}/{relative}",
                                media_class=MediaClass.DIRECTORY,
                                media_content_type="",
                                title=path.name,
                                can_play=False,
                                can_expand=True,
                                can_search=True,
                            )
                        )
                    continue
                if not path.is_file():
                    continue
                mime_type, _ = mimetypes.guess_type(str(path))
                if not mime_type or mime_type.split("/")[0] not in MEDIA_MIME_TYPES:
                    continue
                media_class = MEDIA_CLASS_MAP.get(
                    mime_type.split("/")[0], MediaClass.DIRECTORY
                )
                if filter_classes and media_class not in filter_classes:
                    continue
                results.append(
                    BrowseMediaSource(
                        domain=self.domain,
                        identifier=f"{source_dir_id}/{relative}",
                        media_class=media_class,
                        media_content_type=mime_type,
                        title=path.name,
                        can_play=True,
                        can_expand=False,
                    )
                )

        results.sort(key=lambda item: item.title)
        return SearchMedia(result=results)

    def _browse_media(
        self, source_dir_id: str | None, location: str
    ) -> BrowseMediaSource:
        """Browse media."""

        # If only one media dir is configured, use that as the local media root
        if source_dir_id is None and len(self.media_dirs) == 1:
            source_dir_id = list(self.media_dirs)[0]

        # Multiple folder, root is requested
        if source_dir_id is None:
            if location:
                raise BrowseError("Folder not found.")

            base = BrowseMediaSource(
                domain=self.domain,
                identifier="",
                media_class=MediaClass.DIRECTORY,
                media_content_type=None,
                title=self.name,
                can_play=False,
                can_expand=True,
                can_search=True,
                children_media_class=MediaClass.DIRECTORY,
            )

            base.children = [
                self._browse_media(source_dir_id, "")
                for source_dir_id in self.media_dirs
            ]

            return base

        full_path = Path(self.media_dirs[source_dir_id], location)

        if not full_path.exists():
            if location == "":
                raise BrowseError("Media directory does not exist.")
            raise BrowseError("Path does not exist.")

        if not full_path.is_dir():
            raise BrowseError("Path is not a directory.")

        result = self._build_item_response(source_dir_id, full_path)
        if not result:
            raise BrowseError("Unknown source directory.")
        return result

    def _build_item_response(
        self, source_dir_id: str, path: Path, is_child: bool = False
    ) -> BrowseMediaSource | None:
        mime_type, _ = mimetypes.guess_type(str(path))
        is_file = path.is_file()
        is_dir = path.is_dir()

        # Make sure it's a file or directory
        if not is_file and not is_dir:
            return None

        # Check that it's a media file
        if is_file and (
            not mime_type or mime_type.split("/")[0] not in MEDIA_MIME_TYPES
        ):
            return None

        title = path.name

        media_class = MediaClass.DIRECTORY
        if mime_type:
            media_class = MEDIA_CLASS_MAP.get(
                mime_type.split("/")[0], MediaClass.DIRECTORY
            )

        media = BrowseMediaSource(
            domain=self.domain,
            identifier=f"{source_dir_id}/{path.relative_to(self.media_dirs[source_dir_id])}",
            media_class=media_class,
            media_content_type=mime_type or "",
            title=title,
            can_play=is_file,
            can_expand=is_dir,
            can_search=is_dir,
        )

        if is_file or is_child:
            return media

        # Append first level children
        media.children = []
        for child_path in path.iterdir():
            if child_path.name[0] != ".":
                child = self._build_item_response(source_dir_id, child_path, True)
                if child:
                    media.children.append(child)

        # Sort children showing directories first, then by name
        media.children.sort(key=lambda child: (child.can_play, child.title))

        return media


@callback
def _async_media_headers(mime_type: str) -> dict[str, str]:
    """Return the headers a media file of this type is served with."""
    if mime_type in DOWNLOAD_ONLY_MIME_TYPES:
        return {hdrs.CONTENT_DISPOSITION: "attachment"}

    return {}


class LocalMediaView(http.HomeAssistantView):
    """Local Media Finder View.

    Returns media files in config/media.
    """

    name = "media"

    def __init__(self, hass: HomeAssistant, source: LocalSource) -> None:
        """Initialize the media view."""
        self.hass = hass
        self.source = source
        self.name = source.url_prefix.strip("/").replace("/", ":")
        self.url = f"{source.url_prefix}/{{source_dir_id}}/{{location:.*}}"

    async def _validate_media_path(
        self, source_dir_id: str, location: str
    ) -> tuple[Path, str]:
        """Validate media path and return it with its media type if valid."""
        try:
            raise_if_invalid_path(location)
        except ValueError as err:
            raise web.HTTPBadRequest from err

        if source_dir_id not in self.source.media_dirs:
            raise web.HTTPNotFound

        media_path = self.source.async_full_path(source_dir_id, location)

        # Check that the file exists
        if not self.hass.async_add_executor_job(media_path.is_file):
            raise web.HTTPNotFound

        # Check that it's a media file
        mime_type, _ = mimetypes.guess_type(str(media_path))
        if not mime_type or mime_type.split("/")[0] not in MEDIA_MIME_TYPES:
            raise web.HTTPNotFound

        return media_path, mime_type

    async def head(
        self, request: web.Request, source_dir_id: str, location: str
    ) -> web.Response:
        """Handle a HEAD request.

        This is sent by some DLNA renderers, like Samsung ones, prior to sending
        the GET request.

        Check whether the location exists or not.
        """
        _, mime_type = await self._validate_media_path(source_dir_id, location)
        return web.Response(
            content_type=mime_type, headers=_async_media_headers(mime_type)
        )

    async def get(
        self, request: web.Request, source_dir_id: str, location: str
    ) -> web.FileResponse:
        """Handle a GET request."""
        media_path, mime_type = await self._validate_media_path(source_dir_id, location)
        return web.FileResponse(media_path, headers=_async_media_headers(mime_type))


class UploadMediaView(http.HomeAssistantView):
    """View to upload images."""

    url = "/api/media_source/local_source/upload"
    name = "api:media_source:local_source:upload"
    schema = probatio.Schema(
        {
            "media_content_id": str,
            "file": FileField,
        }
    )

    @require_admin
    async def post(self, request: web.Request) -> web.Response:
        """Handle upload."""
        hass = request.app[http.KEY_HASS]

        # Increase max payload
        request._client_max_size = MAX_UPLOAD_SIZE  # noqa: SLF001

        try:
            data = self.schema(dict(await request.post()))
        except probatio.Invalid as err:
            LOGGER.error("Received invalid upload data: %s", err)
            raise web.HTTPBadRequest from err

        try:
            target_folder = MediaSourceItem.from_uri(
                hass, data["media_content_id"], None
            )
        except ValueError as err:
            LOGGER.error("Received invalid upload data: %s", err)
            raise web.HTTPBadRequest from err

        if target_folder.domain != DOMAIN:
            raise web.HTTPBadRequest

        source = cast(LocalSource, hass.data[DATA_LOCAL_SOURCE])
        try:
            uploaded_media_source_id = await source.async_upload_media(
                target_folder, data["file"]
            )
        except Unresolvable as err:
            LOGGER.error("Invalid local source ID: %s", data["media_content_id"])
            raise web.HTTPBadRequest from err
        except InvalidFileNameError as err:
            LOGGER.error("Invalid filename uploaded: %s", data["file"].filename)
            raise web.HTTPBadRequest from err
        except PathNotSupportedError as err:
            LOGGER.error("Invalid path for upload: %s", data["media_content_id"])
            raise web.HTTPBadRequest from err
        except OSError as err:
            LOGGER.error("Error uploading file: %s", err)
            raise web.HTTPInternalServerError from err

        return self.json({"media_content_id": uploaded_media_source_id})


@websocket_api.websocket_command(
    {
        probatio.Required("type"): "media_source/local_source/remove",
        probatio.Required("media_content_id"): str,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_remove_media(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Remove media."""
    try:
        item = MediaSourceItem.from_uri(hass, msg["media_content_id"], None)
    except ValueError as err:
        connection.send_error(msg["id"], websocket_api.ERR_INVALID_FORMAT, str(err))
        return

    if item.domain != DOMAIN:
        connection.send_error(
            msg["id"], websocket_api.ERR_INVALID_FORMAT, "Invalid media source domain"
        )
        return

    source = cast(LocalSource, hass.data[DATA_LOCAL_SOURCE])

    try:
        await source.async_delete_media(item)
    except Unresolvable as err:
        connection.send_error(msg["id"], websocket_api.ERR_INVALID_FORMAT, str(err))
    except FileNotFoundError as err:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, str(err))
    except PathNotSupportedError as err:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_SUPPORTED, str(err))
    except OSError as err:
        LOGGER.error("Error removing media: %s", err)
        connection.send_error(
            msg["id"], websocket_api.ERR_UNKNOWN_ERROR, "Could not remove the file"
        )
    else:
        connection.send_result(msg["id"])


def _item_from_message(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    key: str,
) -> MediaSourceItem | None:
    """Return the local source item a message names, or answer with an error."""
    try:
        item = MediaSourceItem.from_uri(hass, msg[key], None)
    except ValueError as err:
        connection.send_error(msg["id"], websocket_api.ERR_INVALID_FORMAT, str(err))
        return None

    if item.domain != DOMAIN:
        connection.send_error(
            msg["id"], websocket_api.ERR_INVALID_FORMAT, "Invalid media source domain"
        )
        return None
    return item


async def _async_answer(
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
    operation: Awaitable[Any],
) -> None:
    """Run a folder operation and answer with its result or a stable error code."""
    try:
        result = await operation
    except Unresolvable as err:
        connection.send_error(msg["id"], websocket_api.ERR_INVALID_FORMAT, str(err))
    except MediaFolderError as err:
        connection.send_error(msg["id"], err.code, str(err))
    except OSError as err:
        LOGGER.error("Error in media folder operation: %s", err)
        connection.send_error(
            msg["id"], websocket_api.ERR_UNKNOWN_ERROR, "The operation failed"
        )
    else:
        connection.send_result(msg["id"], result)


@websocket_api.websocket_command(
    {
        probatio.Required("type"): "media_source/local_source/create_folder",
        probatio.Required("parent_media_content_id"): str,
        probatio.Required("name"): str,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_create_folder(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Create a folder."""
    if (
        parent := _item_from_message(
            hass, connection, msg, "parent_media_content_id"
        )
    ) is None:
        return
    source = cast(LocalSource, hass.data[DATA_LOCAL_SOURCE])
    await _async_answer(
        connection,
        msg,
        _wrap_id(source.async_create_folder(parent, msg["name"])),
    )


@websocket_api.websocket_command(
    {
        probatio.Required("type"): "media_source/local_source/rename",
        probatio.Required("media_content_id"): str,
        probatio.Required("new_name"): str,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_rename(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Rename a file or folder."""
    if (item := _item_from_message(hass, connection, msg, "media_content_id")) is None:
        return
    source = cast(LocalSource, hass.data[DATA_LOCAL_SOURCE])
    await _async_answer(
        connection, msg, _wrap_id(source.async_rename(item, msg["new_name"]))
    )


@websocket_api.websocket_command(
    {
        probatio.Required("type"): "media_source/local_source/move",
        probatio.Required("media_content_id"): str,
        probatio.Required("destination_media_content_id"): str,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_move(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Move a file or folder into another folder."""
    if (item := _item_from_message(hass, connection, msg, "media_content_id")) is None:
        return
    if (
        destination := _item_from_message(
            hass, connection, msg, "destination_media_content_id"
        )
    ) is None:
        return
    source = cast(LocalSource, hass.data[DATA_LOCAL_SOURCE])
    await _async_answer(
        connection, msg, _wrap_id(source.async_move(item, destination))
    )


@websocket_api.websocket_command(
    {
        probatio.Required("type"): "media_source/local_source/folder_info",
        probatio.Required("media_content_id"): str,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_folder_info(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Return how many files and folders a folder holds."""
    if (item := _item_from_message(hass, connection, msg, "media_content_id")) is None:
        return
    source = cast(LocalSource, hass.data[DATA_LOCAL_SOURCE])
    await _async_answer(connection, msg, source.async_folder_info(item))


@websocket_api.websocket_command(
    {
        probatio.Required("type"): "media_source/local_source/remove_folder",
        probatio.Required("media_content_id"): str,
        probatio.Optional("recursive", default=False): bool,
        probatio.Optional("expected_files"): probatio.All(int, probatio.Range(min=0)),
        probatio.Optional("expected_folders"): probatio.All(
            int, probatio.Range(min=0)
        ),
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_remove_folder(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Remove a folder; a folder that is not empty only with recursive set."""
    if (item := _item_from_message(hass, connection, msg, "media_content_id")) is None:
        return
    source = cast(LocalSource, hass.data[DATA_LOCAL_SOURCE])
    await _async_answer(
        connection,
        msg,
        source.async_remove_folder(
            item,
            msg["recursive"],
            msg.get("expected_files"),
            msg.get("expected_folders"),
        ),
    )


async def _wrap_id(operation: Awaitable[str]) -> dict[str, str]:
    """Wrap a media content ID in the answer shape."""
    return {"media_content_id": await operation}
