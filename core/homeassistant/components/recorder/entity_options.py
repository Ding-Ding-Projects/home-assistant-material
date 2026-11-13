"""Control recorder entity options."""

import dataclasses
from enum import StrEnum
from typing import Any

import probatio

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.recorder import get_instance
from homeassistant.helpers.storage import Store

from .entity_rules import MAX_MIN_INTERVAL, EntityRule

STORAGE_KEY = "recorder.entity_options"
STORAGE_VERSION = 1


def is_entity_recorded(hass: HomeAssistant, entity_id: str) -> bool:
    """Check if an entity is being recorded.

    Async friendly.
    """
    instance = get_instance(hass)
    return instance.entity_filter is None or instance.entity_filter(entity_id)


@callback
def async_setup(hass: HomeAssistant) -> None:
    """Set up the recorder entity options."""
    websocket_api.async_register_command(hass, ws_get_entity_options)
    websocket_api.async_register_command(hass, ws_set_entity_options)


def _store(hass: HomeAssistant) -> Store[dict[str, Any]]:
    """Return the store holding the per-entity rules."""
    return Store(hass, STORAGE_VERSION, STORAGE_KEY)


async def async_load_rules(hass: HomeAssistant) -> None:
    """Load the stored per-entity rules into the recorder."""
    data = await _store(hass).async_load()
    rules: dict[str, EntityRule] = {}
    if isinstance(data, dict):
        for entity_id, raw in data.get("entities", {}).items():
            if not isinstance(raw, dict):
                continue
            interval = raw.get("min_interval", 0)
            rules[entity_id] = EntityRule(
                recording_disabled=bool(raw.get("recording_disabled", False)),
                min_interval=(
                    interval
                    if isinstance(interval, int)
                    and not isinstance(interval, bool)
                    and 0 <= interval <= MAX_MIN_INTERVAL
                    else 0
                ),
                always_on_change=bool(raw.get("always_on_change", True)),
            )
    get_instance(hass).entity_rules.load(rules)


class EntityRecordingDisabler(StrEnum):
    """What disabled recording of an entity."""

    USER = "user"


@dataclasses.dataclass(frozen=True)
class RecorderEntityOptions:
    """Recorder options for an entity."""

    recording_disabled_by: EntityRecordingDisabler | None = None
    # True when the YAML configuration excludes the entity; it cannot be
    # changed from the interface.
    excluded_by_configuration: bool = False
    min_interval: int = 0
    always_on_change: bool = True

    def to_json(self) -> dict[str, Any]:
        """Return a JSON serializable representation for storage."""
        return {
            "recording_disabled_by": self.recording_disabled_by,
            "excluded_by_configuration": self.excluded_by_configuration,
            "min_interval": self.min_interval,
            "always_on_change": self.always_on_change,
        }


def _options_for(hass: HomeAssistant, entity_id: str) -> RecorderEntityOptions:
    """Return the options of an entity."""
    rule = get_instance(hass).entity_rules.get(entity_id)
    configured_out = not is_entity_recorded(hass, entity_id)
    return RecorderEntityOptions(
        recording_disabled_by=(
            EntityRecordingDisabler.USER
            if configured_out or rule.recording_disabled
            else None
        ),
        excluded_by_configuration=configured_out,
        min_interval=rule.min_interval,
        always_on_change=rule.always_on_change,
    )


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "recorder/entity_options/get",
        probatio.Required("entity_id"): cv.strict_entity_id,
    }
)
@callback
def ws_get_entity_options(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Get recorder settings for a single entity."""
    entity_id: str = msg["entity_id"]
    connection.send_result(msg["id"], _options_for(hass, msg["entity_id"]).to_json())


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "recorder/entity_options/set",
        probatio.Required("entity_id"): cv.strict_entity_id,
        probatio.Optional("recording_disabled"): bool,
        probatio.Optional("min_interval"): probatio.All(
            int, probatio.Range(min=0, max=MAX_MIN_INTERVAL)
        ),
        probatio.Optional("always_on_change"): bool,
    }
)
@websocket_api.async_response
async def ws_set_entity_options(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Change the recorder rules of a single entity, effective at once."""
    entity_id: str = msg["entity_id"]
    if not is_entity_recorded(hass, entity_id):
        connection.send_error(
            msg["id"],
            websocket_api.ERR_NOT_ALLOWED,
            "The entity is excluded in the YAML configuration",
        )
        return
    rules = get_instance(hass).entity_rules
    current = rules.get(entity_id)
    rules.set(
        entity_id,
        EntityRule(
            recording_disabled=msg.get("recording_disabled", current.recording_disabled),
            min_interval=msg.get("min_interval", current.min_interval),
            always_on_change=msg.get("always_on_change", current.always_on_change),
        ),
    )
    await _store(hass).async_save(
        {
            "entities": {
                eid: rule.to_json() for eid, rule in sorted(rules.as_dict().items())
            }
        }
    )
    connection.send_result(msg["id"], _options_for(hass, entity_id).to_json())
