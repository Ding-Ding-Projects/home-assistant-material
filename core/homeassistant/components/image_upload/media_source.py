"""Expose image_upload as media sources."""

import pathlib
from typing import override

from propcache.api import cached_property

from homeassistant.components.media_player import BrowseError, MediaClass
from homeassistant.components.media_source import (
    BrowseMediaSource,
    MediaSource,
    MediaSourceItem,
    PlayMedia,
    Unresolvable,
)
from homeassistant.core import HomeAssistant

from .const import DOMAIN, FOLDER_IMAGE
from .folders import ImageFolders, name_of, parent_of

FOLDER_PREFIX = "folder"


async def async_get_media_source(hass: HomeAssistant) -> ImageUploadMediaSource:
    """Set up image media source."""
    return ImageUploadMediaSource(hass)


class ImageUploadMediaSource(MediaSource):
    """Provide images as media sources."""

    name: str = "Image upload"

    def __init__(self, hass: HomeAssistant) -> None:
        """Initialize ImageMediaSource."""
        super().__init__(DOMAIN)
        self.hass = hass

    @cached_property
    def image_folder(self) -> pathlib.Path:
        """Return the image folder path."""
        return pathlib.Path(self.hass.config.path(FOLDER_IMAGE))

    @override
    async def async_resolve_media(self, item: MediaSourceItem) -> PlayMedia:
        """Resolve media to a url."""
        image = self.hass.data[DOMAIN].data.get(item.identifier)

        if not image:
            raise Unresolvable(f"Could not resolve media item: {item.identifier}")

        return PlayMedia(
            f"/api/image/serve/{image['id']}/original",
            image["content_type"],
            path=self.image_folder / item.identifier / "original",
        )

    @override
    async def async_browse_media(
        self,
        item: MediaSourceItem,
    ) -> BrowseMediaSource:
        """Return media."""
        collection = self.hass.data[DOMAIN]
        folders: ImageFolders = collection.folders

        folder = ""
        if item.identifier:
            prefix, _, folder = item.identifier.partition("/")
            if prefix != FOLDER_PREFIX or not folders.exists(folder) or not folder:
                raise BrowseError("Unknown item")

        subfolders = [
            BrowseMediaSource(
                domain=DOMAIN,
                identifier=f"{FOLDER_PREFIX}/{path}",
                media_class=MediaClass.DIRECTORY,
                media_content_type="",
                title=name_of(path),
                can_play=False,
                can_expand=True,
            )
            for path in sorted(folders.async_list_paths(), key=str.casefold)
            if parent_of(path) == folder
        ]
        images = [
            BrowseMediaSource(
                domain=DOMAIN,
                identifier=image["id"],
                media_class=MediaClass.IMAGE,
                media_content_type=image["content_type"],
                title=image["name"],
                thumbnail=f"/api/image/serve/{image['id']}/256x256",
                can_play=True,
                can_expand=False,
            )
            for image in collection.data.values()
            if image.get("folder", "") == folder
        ]

        return BrowseMediaSource(
            domain=DOMAIN,
            identifier=f"{FOLDER_PREFIX}/{folder}" if folder else None,
            media_class=MediaClass.DIRECTORY if folder else MediaClass.APP,
            media_content_type="",
            title=name_of(folder) if folder else "Image upload",
            can_play=False,
            can_expand=True,
            children_media_class=MediaClass.IMAGE,
            children=[*subfolders, *images],
        )
