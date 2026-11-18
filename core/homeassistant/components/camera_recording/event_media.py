"""Event clips and pictures a camera integration already keeps, for cameras with no stream.

A camera that only offers live video through its provider cannot be recorded
around the clock. Some of those integrations still receive the provider's own
clip or picture for every event. This module reads them from the integration's
own authenticated store, so no extra request goes to the provider and no
credential is touched.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import StrEnum

from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er


class EventMediaKind(StrEnum):
    """What the provider kept for one event."""

    CLIP = "clip"
    IMAGE = "image"


@dataclass(frozen=True, slots=True)
class EventMedia:
    """One event with media."""

    token: str
    timestamp: float
    kind: EventMediaKind
    types: tuple[str, ...]


class EventMediaAdapter(ABC):
    """Reads the event media of one camera from its integration."""

    @abstractmethod
    async def async_list(self) -> list[EventMedia]:
        """Events with media the integration still has, newest first."""

    @abstractmethod
    async def async_fetch(self, token: str) -> tuple[bytes, EventMediaKind] | None:
        """The bytes of one event's media, or None when it is gone."""


class NestEventMediaAdapter(EventMediaAdapter):
    """Event clips and pictures of a Nest camera."""

    def __init__(self, device: object) -> None:
        """Keep the Nest device the media belongs to."""
        self._manager = device.event_media_manager  # type: ignore[attr-defined]

    async def async_list(self) -> list[EventMedia]:
        """Clip previews, or pictures for cameras that only have pictures."""
        events = [
            EventMedia(
                session.event_token,
                session.timestamp.timestamp(),
                EventMediaKind.CLIP,
                tuple(str(kind) for kind in session.event_types),
            )
            for session in await self._manager.async_clip_preview_sessions()
        ]
        events.extend(
            EventMedia(
                session.event_token,
                session.timestamp.timestamp(),
                EventMediaKind.IMAGE,
                (str(session.event_type),),
            )
            for session in await self._manager.async_image_sessions()
        )
        return events

    async def async_fetch(self, token: str) -> tuple[bytes, EventMediaKind] | None:
        """The cached bytes of an event."""
        media = await self._manager.get_media_from_token(token)
        if media is None:
            return None
        kind = (
            EventMediaKind.CLIP
            if media.content_type.startswith("video/")
            else EventMediaKind.IMAGE
        )
        return media.contents, kind


@dataclass(frozen=True, slots=True)
class EventMediaSupport:
    """What an integration offers for one camera."""

    adapter: EventMediaAdapter
    source: str


def async_event_media_for(
    hass: HomeAssistant, entity_id: str
) -> EventMediaSupport | None:
    """The event media of a camera when its integration keeps any."""
    entry = er.async_get(hass).async_get(entity_id)
    if entry is None or entry.device_id is None or entry.platform != "nest":
        return None
    if not hass.config_entries.async_loaded_entries("nest"):
        return None
    from homeassistant.components.nest.media_source import (  # noqa: PLC0415
        async_get_media_source_devices,
    )

    device = async_get_media_source_devices(hass).get(entry.device_id)
    if device is None:
        return None
    return EventMediaSupport(NestEventMediaAdapter(device), "nest")
