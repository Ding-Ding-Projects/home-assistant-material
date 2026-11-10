"""Data classes kept so that integration platforms that import them still load.

Nothing in this module collects or sends anything. The analytics integration
in this build never contacts any server.
"""

from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field


@dataclass
class AnalyticsInput:
    """Input for a single integration. Never used to send anything."""

    device_ids: Iterable[str] = field(default_factory=list)
    entity_ids: Iterable[str] = field(default_factory=list)


@dataclass
class AnalyticsModifications:
    """Result type kept for integration platforms. Never used to send anything."""

    remove: bool = False
    devices: Mapping[str, "DeviceAnalyticsModifications"] | None = None
    entities: Mapping[str, "EntityAnalyticsModifications"] | None = None


@dataclass
class DeviceAnalyticsModifications:
    """Device-level result type kept for integration platforms."""

    remove: bool = False


@dataclass
class EntityAnalyticsModifications:
    """Entity-level result type kept for integration platforms."""

    remove: bool = False
