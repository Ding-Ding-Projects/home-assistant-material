"""Logical folders for the uploaded images.

Folders only exist in storage. Images stay where they are on disk and keep
their identifiers and serve URLs; an image records the folder it sits in.
"""

from __future__ import annotations

from collections import Counter
from typing import TYPE_CHECKING, Any, TypedDict

from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.storage import Store

if TYPE_CHECKING:
    from . import ImageStorageCollection

FOLDERS_STORAGE_KEY = "image.folders"
FOLDERS_STORAGE_VERSION = 1
SAVE_DELAY = 10

MAX_DEPTH = 6
MAX_NAME_LENGTH = 100
MAX_PATH_LENGTH = 255
MAX_MOVE_IMAGES = 500


class FolderError(HomeAssistantError):
    """Error raised by a folder operation, with a stable error code."""

    def __init__(self, code: str, message: str) -> None:
        """Initialize the error."""
        super().__init__(message)
        self.code = code


class FolderInfo(TypedDict):
    """A folder with the number of images and folders directly inside it."""

    path: str
    name: str
    parent: str
    images: int
    folders: int


def validate_name(name: str) -> str:
    """Validate one folder name and return it."""
    if (
        not name
        or len(name) > MAX_NAME_LENGTH
        or name in (".", "..")
        or name != name.strip()
        or any(char in name for char in "/\\")
        or any(ord(char) < 32 or ord(char) == 127 for char in name)
    ):
        raise FolderError("invalid_name", "Invalid folder name")
    return name


def _check_size(path: str) -> None:
    """Check that a folder path is not too deep or too long."""
    if len(path.split("/")) > MAX_DEPTH:
        raise FolderError("too_deep", "Folders are nested too deeply")
    if len(path) > MAX_PATH_LENGTH:
        raise FolderError("invalid_name", "Folder path is too long")


def normalize_folder(value: str) -> str:
    """Validate a folder path and return it; the empty string is the root."""
    if value == "":
        return ""
    for name in value.split("/"):
        validate_name(name)
    _check_size(value)
    return value


def parent_of(path: str) -> str:
    """Return the parent folder of a path."""
    return path.rpartition("/")[0]


def name_of(path: str) -> str:
    """Return the last segment of a path."""
    return path.rpartition("/")[2]


def join(parent: str, name: str) -> str:
    """Join a parent folder and a name."""
    return f"{parent}/{name}" if parent else name


def _ancestors(path: str) -> list[str]:
    """Return a path and all folders above it, shallowest first."""
    parts = path.split("/")
    return ["/".join(parts[: index + 1]) for index in range(len(parts))]


class ImageFolders:
    """The folders of the image store."""

    def __init__(self, hass: HomeAssistant, collection: ImageStorageCollection) -> None:
        """Initialize the folders."""
        self._collection = collection
        self._store: Store[dict[str, Any]] = Store(
            hass, FOLDERS_STORAGE_VERSION, FOLDERS_STORAGE_KEY
        )
        self._paths: set[str] = set()

    async def async_load(self) -> None:
        """Load the stored folders."""
        raw = await self._store.async_load()
        for path in (raw or {}).get("folders", []):
            try:
                normalize_folder(path)
            except (FolderError, TypeError, AttributeError):
                continue
            self._paths.update(_ancestors(path))

    @callback
    def async_adopt_image_folders(self) -> None:
        """Make sure every folder an image names exists."""
        for item in self._collection.data.values():
            folder = item.get("folder", "")
            if folder and folder not in self._paths:
                try:
                    normalize_folder(folder)
                except FolderError:
                    item["folder"] = ""
                    continue
                self._paths.update(_ancestors(folder))

    @callback
    def _async_save(self) -> None:
        """Schedule saving the folders."""
        self._store.async_delay_save(self._data_to_save, SAVE_DELAY)

    @callback
    def _data_to_save(self) -> dict[str, Any]:
        """Return the data to store."""
        return {"folders": sorted(self._paths, key=str.casefold)}

    @callback
    def exists(self, path: str) -> bool:
        """Return if a folder exists; the root always does."""
        return path == "" or path in self._paths

    @callback
    def require(self, path: str) -> str:
        """Return a folder path that must exist."""
        normalize_folder(path)
        if not self.exists(path):
            raise FolderError("not_found", "Folder does not exist")
        return path

    def _clashes(self, parent: str, name: str, ignore: str | None = None) -> bool:
        """Return if a folder of that name, in any letter case, exists in parent."""
        folded = name.casefold()
        return any(
            path != ignore
            and parent_of(path) == parent
            and name_of(path).casefold() == folded
            for path in self._paths
        )

    @callback
    def async_list_paths(self) -> list[str]:
        """Return the path of every folder."""
        return list(self._paths)

    @callback
    def async_list(self) -> dict[str, Any]:
        """Return all folders with their direct image and folder counts."""
        images = Counter(
            item.get("folder", "") for item in self._collection.data.values()
        )
        subfolders = Counter(parent_of(path) for path in self._paths)
        folders: list[FolderInfo] = [
            {
                "path": path,
                "name": name_of(path),
                "parent": parent_of(path),
                "images": images[path],
                "folders": subfolders[path],
            }
            for path in sorted(self._paths, key=str.casefold)
        ]
        return {
            "folders": folders,
            "root": {"images": images[""], "folders": subfolders[""]},
        }

    @callback
    def async_create(self, parent: str, name: str) -> dict[str, str]:
        """Create a folder."""
        validate_name(name)
        self.require(parent)
        path = join(parent, name)
        _check_size(path)
        if self._clashes(parent, name):
            raise FolderError("exists", "Name already exists")
        self._paths.add(path)
        self._async_save()
        return {"path": path}

    async def _async_relocate(self, old: str, new: str) -> None:
        """Move a folder, what it holds and its images, to a new path."""

        def moved(path: str) -> str:
            if path == old:
                return new
            if path.startswith(f"{old}/"):
                return new + path[len(old) :]
            return path

        self._paths = {moved(path) for path in self._paths}
        for item_id, item in list(self._collection.data.items()):
            folder = item.get("folder", "")
            if moved(folder) != folder:
                await self._collection.async_update_item(
                    item_id, {"folder": moved(folder)}
                )
        self._async_save()

    async def async_rename(self, path: str, new_name: str) -> dict[str, str]:
        """Rename a folder."""
        if path == "":
            raise FolderError("not_allowed", "The root folder is fixed")
        self.require(path)
        validate_name(new_name)
        parent = parent_of(path)
        new = join(parent, new_name)
        if self._clashes(parent, new_name, ignore=path):
            raise FolderError("exists", "Name already exists")
        for existing in self._paths:
            if existing == path or existing.startswith(f"{path}/"):
                _check_size(new + existing[len(path) :])
        if new != path:
            await self._async_relocate(path, new)
        return {"path": new}

    async def async_remove(self, path: str, move_to_parent: bool) -> dict[str, int]:
        """Remove a folder; images are never deleted.

        A folder that holds anything is only removed when move_to_parent is set,
        which moves its images and subfolders up to its parent.
        """
        if path == "":
            raise FolderError("not_allowed", "The root folder is fixed")
        self.require(path)
        subfolders = sorted(p for p in self._paths if parent_of(p) == path)
        image_ids = [
            item_id
            for item_id, item in self._collection.data.items()
            if item.get("folder", "") == path
        ]
        if (subfolders or image_ids) and not move_to_parent:
            raise FolderError("not_empty", "Folder is not empty")

        parent = parent_of(path)
        for sub in subfolders:
            if self._clashes(parent, name_of(sub), ignore=path):
                raise FolderError("exists", "Name already exists")

        self._paths.discard(path)
        for sub in subfolders:
            await self._async_relocate(sub, join(parent, name_of(sub)))
        for item_id in image_ids:
            await self._collection.async_update_item(item_id, {"folder": parent})
        self._async_save()
        return {"moved_images": len(image_ids), "moved_folders": len(subfolders)}

    async def async_move_images(
        self, image_ids: list[str], folder: str
    ) -> dict[str, int]:
        """Move images into a folder; nothing moves when one is unknown."""
        self.require(folder)
        unique_ids = list(dict.fromkeys(image_ids))
        if any(image_id not in self._collection.data for image_id in unique_ids):
            raise FolderError("not_found", "Image does not exist")
        moved = 0
        for image_id in unique_ids:
            if self._collection.data[image_id].get("folder", "") != folder:
                await self._collection.async_update_item(image_id, {"folder": folder})
                moved += 1
        return {"moved": moved}
