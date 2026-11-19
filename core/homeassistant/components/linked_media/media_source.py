"""Offer linked files in the media browser, like any other media file."""

from homeassistant.components.media_player import BrowseError, MediaClass
from homeassistant.components.media_source import (
    BrowseMediaSource,
    MediaSource,
    MediaSourceItem,
    PlayMedia,
    Unresolvable,
)
from homeassistant.core import HomeAssistant

from .const import DOMAIN, KIND_AUDIO, KIND_IMAGE, KIND_VIDEO
from .data import async_get_manager
from .manager import LinkedFile

MEDIA_CLASS = {
    KIND_AUDIO: MediaClass.MUSIC,
    KIND_VIDEO: MediaClass.VIDEO,
    KIND_IMAGE: MediaClass.IMAGE,
}


async def async_get_media_source(hass: HomeAssistant) -> MediaSource:
    """Set up the linked media source."""
    return LinkedMediaSource(hass)


class LinkedMediaSource(MediaSource):
    """Linked files, fetched when something plays or shows them."""

    name = "Linked media"

    def __init__(self, hass: HomeAssistant) -> None:
        """Initialize the source."""
        super().__init__(DOMAIN)
        self.hass = hass

    async def async_resolve_media(self, item: MediaSourceItem) -> PlayMedia:
        """Resolve a linked file to an address of this system."""
        manager = async_get_manager(self.hass)
        if manager is None or (linked := manager.get(item.identifier)) is None:
            raise Unresolvable("This linked file does not exist")
        manager.async_note_target(linked.file_id, item.target_media_player)
        return PlayMedia(
            f"/api/linked_media/file/{linked.file_id}", linked.content_type
        )

    async def async_browse_media(self, item: MediaSourceItem) -> BrowseMediaSource:
        """List the linked files."""
        manager = async_get_manager(self.hass)
        if manager is None:
            raise BrowseError("Linked media is not set up")
        if item.identifier:
            if (linked := manager.get(item.identifier)) is None:
                raise BrowseError("This linked file does not exist")
            return self._item(linked)
        root = BrowseMediaSource(
            domain=DOMAIN,
            identifier=None,
            media_class=MediaClass.DIRECTORY,
            media_content_type="",
            title=self.name or DOMAIN,
            can_play=False,
            can_expand=True,
            children_media_class=MediaClass.DIRECTORY,
        )
        root.children = [
            self._item(linked)
            for linked in sorted(manager.files.values(), key=lambda f: f.name)
        ]
        return root

    def _item(self, linked: LinkedFile) -> BrowseMediaSource:
        return BrowseMediaSource(
            domain=DOMAIN,
            identifier=linked.file_id,
            media_class=MEDIA_CLASS.get(linked.kind, MediaClass.URL),
            media_content_type=linked.content_type,
            title=linked.name,
            can_play=True,
            can_expand=False,
        )
