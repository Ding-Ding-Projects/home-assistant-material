"""Per-entity recording rules chosen by the user.

Two rules can be set for a single entity, in addition to the YAML filter, which
always stays authoritative:

* ``recording_disabled``: no state change of the entity is recorded.
* ``min_interval``: a state change is skipped when the previous recorded one
  of the same entity is less than this many seconds old.

The rules live in memory so that deciding about an event never touches the
database or the disk. They are persisted by ``entity_options`` and loaded at
start up.
"""

from __future__ import annotations

from dataclasses import dataclass
import time

from homeassistant.core import State

MAX_MIN_INTERVAL = 3600


@dataclass(frozen=True, slots=True)
class EntityRule:
    """The rules of one entity."""

    recording_disabled: bool = False
    # Seconds, 0 means every change is recorded.
    min_interval: int = 0
    # When true a change to a different state value is always recorded, even
    # inside the interval, so a door opening or a switch turning on is never
    # dropped. Only attribute changes and repeated values are thinned out.
    always_on_change: bool = True

    @property
    def is_default(self) -> bool:
        """Return if the rule changes nothing."""
        return not self.recording_disabled and self.min_interval == 0

    def to_json(self) -> dict[str, bool | int]:
        """Return a JSON serializable representation for storage."""
        return {
            "recording_disabled": self.recording_disabled,
            "min_interval": self.min_interval,
            "always_on_change": self.always_on_change,
        }


class EntityRecordingRules:
    """In memory rules consulted by the recorder for every state change."""

    def __init__(self) -> None:
        """Initialize without rules."""
        self._rules: dict[str, EntityRule] = {}
        # entity_id -> (monotonic time, state value) of the last recorded
        # change. Only kept for entities that have a minimum interval.
        self._last_recorded: dict[str, tuple[float, str]] = {}

    @property
    def active(self) -> bool:
        """Return if any rule exists, so the hot path can skip the lookup."""
        return bool(self._rules)

    def get(self, entity_id: str) -> EntityRule:
        """Return the rule of an entity, the default one when it has none."""
        return self._rules.get(entity_id, EntityRule())

    def as_dict(self) -> dict[str, EntityRule]:
        """Return a copy of all rules."""
        return dict(self._rules)

    def set(self, entity_id: str, rule: EntityRule) -> None:
        """Set the rule of an entity, removing it when it changes nothing."""
        self._last_recorded.pop(entity_id, None)
        if rule.is_default:
            self._rules.pop(entity_id, None)
        else:
            self._rules[entity_id] = rule

    def load(self, data: dict[str, EntityRule]) -> None:
        """Replace all rules."""
        self._rules = {k: v for k, v in data.items() if not v.is_default}
        self._last_recorded.clear()

    def should_record(self, entity_id: str, new_state: State | None) -> bool:
        """Return if a state change of an entity is to be recorded.

        Called from the event loop for every state change, so it only does
        dictionary lookups.
        """
        rule = self._rules.get(entity_id)
        if rule is None:
            return True
        if rule.recording_disabled:
            return False
        if rule.min_interval <= 0 or new_state is None:
            # A removed entity is always recorded: the history needs the end.
            self._last_recorded.pop(entity_id, None)
            return True
        now = time.monotonic()
        last = self._last_recorded.get(entity_id)
        if last is not None:
            elapsed = now - last[0]
            changed_value = new_state.state != last[1]
            if elapsed < rule.min_interval and not (
                rule.always_on_change and changed_value
            ):
                return False
        self._last_recorded[entity_id] = (now, new_state.state)
        return True
