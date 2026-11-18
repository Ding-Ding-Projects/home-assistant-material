"""Light recording: which moments to keep, and what counts as something being seen."""

from dataclasses import dataclass
import re

from homeassistant.components.binary_sensor import BinarySensorDeviceClass
from homeassistant.const import STATE_UNAVAILABLE, STATE_UNKNOWN
from homeassistant.core import HomeAssistant, State
from homeassistant.helpers import entity_registry as er

from .const import (
    MAX_CLIP_SECONDS,
    MAX_POST_SECONDS,
    MAX_PRE_SECONDS,
    MIN_POST_SECONDS,
    MIN_PRE_SECONDS,
    SOURCE_INTEGRATION,
)
from .event_media import async_event_media_for

BINARY_EVENT_CLASSES = {
    BinarySensorDeviceClass.MOTION: "motion",
    BinarySensorDeviceClass.MOVING: "motion",
    BinarySensorDeviceClass.OCCUPANCY: "person",
    BinarySensorDeviceClass.PRESENCE: "person",
    BinarySensorDeviceClass.SOUND: "sound",
}

_WORDS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"person|people|human|face"), "person"),
    (re.compile(r"vehicle|car\b|_car|license|plate"), "vehicle"),
    (re.compile(r"animal|pet|dog|cat\b|_cat"), "animal"),
    (re.compile(r"doorbell|ring|visitor|button|press"), "doorbell"),
    (re.compile(r"sound|audio|noise|bark|crying|glass"), "sound"),
    (re.compile(r"motion|movement|move|detect"), "motion"),
]


def clamp_seconds(value: float, low: int, high: int) -> int:
    """A whole number of seconds within the allowed range."""
    return int(min(max(round(value), low), high))


def clamp_pre(value: float) -> int:
    """Seconds kept before something is seen."""
    return clamp_seconds(value, MIN_PRE_SECONDS, MAX_PRE_SECONDS)


def clamp_post(value: float) -> int:
    """Seconds kept after something stops being seen."""
    return clamp_seconds(value, MIN_POST_SECONDS, MAX_POST_SECONDS)


def event_kind(domain: str, entity_id: str, state: State | None) -> str | None:
    """What kind of event an entity reports, or None when it reports none."""
    if domain not in ("binary_sensor", "event"):
        return None
    device_class = state.attributes.get("device_class") if state else None
    name = state.attributes.get("friendly_name", "") if state else ""
    text = f"{entity_id} {name}".lower()
    by_word = next((kind for pattern, kind in _WORDS if pattern.search(text)), None)
    if domain == "event":
        if device_class == "doorbell":
            return "doorbell"
        if device_class == "motion":
            return by_word or "motion"
        return by_word
    if device_class in BINARY_EVENT_CLASSES:
        fallback = BINARY_EVENT_CLASSES[device_class]
        if by_word and by_word != "doorbell":
            return by_word
        return fallback
    return None if by_word == "doorbell" else by_word


@dataclass(frozen=True, slots=True)
class SourceOption:
    """One thing that can tell a camera saw something."""

    source: str
    kind: str


def source_options(hass: HomeAssistant, camera_id: str) -> list[SourceOption]:
    """Sensors and event entities on the camera's device, then the integration's events."""
    registry = er.async_get(hass)
    options: list[SourceOption] = []
    entry = registry.async_get(camera_id)
    if entry is not None and entry.device_id is not None:
        for other in er.async_entries_for_device(registry, entry.device_id):
            if other.entity_id == camera_id or other.disabled_by is not None:
                continue
            kind = event_kind(
                other.domain, other.entity_id, hass.states.get(other.entity_id)
            )
            if kind is not None:
                options.append(SourceOption(other.entity_id, kind))
    if async_event_media_for(hass, camera_id) is not None:
        options.append(SourceOption(SOURCE_INTEGRATION, "integration"))
    return options


def resolve_sources(
    hass: HomeAssistant, camera_id: str, chosen: list[str] | None
) -> list[str]:
    """The sources in use: the owner's choice, or every one found for the camera."""
    if chosen is None:
        return [option.source for option in source_options(hass, camera_id)]
    return list(chosen)


def state_is_active(state: State | None) -> bool:
    """Whether a binary sensor reports something right now."""
    return state is not None and state.state == "on"


def state_is_known(state: State | None) -> bool:
    """Whether a state carries a real value."""
    return state is not None and state.state not in (STATE_UNKNOWN, STATE_UNAVAILABLE)


@dataclass(slots=True)
class KeepRange:
    """A stretch of time to keep, with the cap flag."""

    start: float
    end: float
    capped: bool = False


@dataclass(slots=True)
class _Seen:
    start: float
    end: float | None


class LightPlanner:
    """Turns "something was seen" into the stretches of video to keep."""

    def __init__(self, pre: int, post: int, max_clip: int = MAX_CLIP_SECONDS) -> None:
        """Set the seconds kept before and after, and the longest single clip."""
        self.pre = pre
        self.post = post
        self.max_clip = max_clip
        self._seen: list[_Seen] = []
        self._open: dict[str, _Seen] = {}
        self.cap_hit_at: float | None = None

    def _starts_new_clip(self, at: float, now: float) -> bool:
        ranges = self.ranges(now)
        if not ranges:
            return True
        last = ranges[-1]
        if last.capped and at < last.end:
            return False
        return at - self.pre > last.end

    def start(self, source: str, at: float, now: float) -> bool:
        """A source began seeing something. Returns whether this starts a new clip."""
        if source in self._open:
            return False
        new = self._starts_new_clip(at, now)
        seen = _Seen(at, None)
        self._open[source] = seen
        self._seen.append(seen)
        return new

    def stop(self, source: str, at: float) -> None:
        """A source stopped seeing something."""
        seen = self._open.pop(source, None)
        if seen is not None:
            seen.end = max(at, seen.start)

    def moment(self, at: float, now: float) -> bool:
        """A single moment, as an event entity reports. Returns whether it starts a new clip."""
        new = self._starts_new_clip(at, now)
        self._seen.append(_Seen(at, at))
        return new

    def ranges(self, now: float) -> list[KeepRange]:
        """Stretches to keep, merged, each at most the longest clip."""
        ranges: list[KeepRange] = []
        for seen in sorted(self._seen, key=lambda item: item.start):
            start = seen.start - self.pre
            end = (seen.end if seen.end is not None else now) + self.post
            last = ranges[-1] if ranges else None
            if last is not None and last.capped and seen.start < last.end:
                continue
            if last is not None and not last.capped and start <= last.end:
                last.end = max(last.end, end)
            else:
                if last is not None and last.capped:
                    start = max(start, last.end)
                last = KeepRange(start, end)
                ranges.append(last)
            if last.end - last.start > self.max_clip:
                last.end = last.start + self.max_clip
                last.capped = True
                self.cap_hit_at = now
        return ranges

    def claims(self, start: float, end: float, now: float) -> bool:
        """Whether a recorded file overlaps a stretch to keep."""
        return any(item.end > start and item.start < end for item in self.ranges(now))

    def forget_before(self, cutoff: float) -> None:
        """Drop things seen long ago and fully handled."""
        self._seen = [
            seen
            for seen in self._seen
            if seen.end is None or seen.end + self.post >= cutoff
        ]
