"""Build the text of one morning briefing from the state of the home."""

from dataclasses import dataclass, field
from datetime import date, datetime
import logging
from typing import Any

from homeassistant.const import (
    ATTR_ENTITY_ID,
    ATTR_UNIT_OF_MEASUREMENT,
    STATE_UNAVAILABLE,
    STATE_UNKNOWN,
)
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import entity_registry as er
from homeassistant.util import dt as dt_util

from .const import GROW_LIGHT_DOMAIN, STAGE_HARVEST, STATUS_PAUSED, TRANSIT_QUIET_STATES

_LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class BriefingSources:
    """What the briefing may talk about."""

    weather: str | None = None
    transit: list[str] = field(default_factory=list)
    extra: list[str] = field(default_factory=list)


def _label(hass: HomeAssistant, entity_id: str) -> str:
    """Friendly name of an entity, or its id when it has none."""
    if (state := hass.states.get(entity_id)) is not None:
        return str(state.attributes.get("friendly_name") or entity_id)
    return entity_id


def _readable(hass: HomeAssistant, entity_id: str) -> str | None:
    """State with its unit, or None when the entity is missing or has no value."""
    state = hass.states.get(entity_id)
    if state is None or state.state in (STATE_UNKNOWN, STATE_UNAVAILABLE):
        return None
    unit = state.attributes.get(ATTR_UNIT_OF_MEASUREMENT)
    return f"{state.state} {unit}" if unit else state.state


def _number(value: Any) -> str:
    """Whole numbers without a trailing .0."""
    try:
        number = float(value)
    except TypeError, ValueError:
        return str(value)
    return str(int(number)) if number == int(number) else f"{number:.1f}"


def _condition(condition: Any) -> str:
    return str(condition).replace("-", " ").replace("_", " ").capitalize()


def _forecast_date(item: dict[str, Any]) -> date | None:
    raw = item.get("datetime")
    if isinstance(raw, datetime):
        return dt_util.as_local(raw).date()
    if isinstance(raw, str) and (parsed := dt_util.parse_datetime(raw)) is not None:
        return dt_util.as_local(parsed).date()
    return None


async def _weather_line(hass: HomeAssistant, entity_id: str) -> str | None:
    """Today's forecast, falling back to the current condition and temperature."""
    state = hass.states.get(entity_id)
    if state is None or state.state in (STATE_UNKNOWN, STATE_UNAVAILABLE):
        return None
    unit = hass.config.units.temperature_unit
    today = dt_util.now().date()
    try:
        response = await hass.services.async_call(
            "weather",
            "get_forecasts",
            {ATTR_ENTITY_ID: entity_id, "type": "daily"},
            blocking=True,
            return_response=True,
        )
    except HomeAssistantError, ValueError:
        response = None
        _LOGGER.debug("No daily forecast from %s", entity_id)
    forecast: list[dict[str, Any]] = []
    if isinstance(response, dict) and isinstance(
        entity_response := response.get(entity_id), dict
    ):
        items = entity_response.get("forecast")
        if isinstance(items, list):
            forecast = [item for item in items if isinstance(item, dict)]
    for item in forecast:
        if (when := _forecast_date(item)) is not None and when < today:
            continue
        parts = [_condition(item.get("condition") or state.state)]
        high, low = item.get("temperature"), item.get("templow")
        if high is not None and low is not None:
            parts.append(f"{_number(low)} to {_number(high)} {unit}")
        elif high is not None:
            parts.append(f"high {_number(high)} {unit}")
        if (rain := item.get("precipitation_probability")) is not None:
            parts.append(f"{_number(rain)}% chance of rain")
        return "Weather today: " + ", ".join(parts) + "."
    parts = [_condition(state.state)]
    if (now_temp := state.attributes.get("temperature")) is not None:
        parts.append(f"{_number(now_temp)} {unit} now")
    return "Weather now: " + ", ".join(parts) + "."


def _transit_lines(hass: HomeAssistant, entity_ids: list[str]) -> list[str]:
    lines = []
    for entity_id in entity_ids:
        state = hass.states.get(entity_id)
        if state is None or state.state.lower() in TRANSIT_QUIET_STATES:
            continue
        lines.append(f"{_label(hass, entity_id)}: {_readable(hass, entity_id)}")
    return lines


def _local_date(raw: str | None) -> date | None:
    if raw is None or (parsed := dt_util.parse_datetime(raw)) is None:
        return None
    return dt_util.as_local(parsed).date()


def _grow_light_lines(hass: HomeAssistant) -> list[str]:
    """Crops to water, crops that changed stage or are ready, and paused lights."""
    registry = er.async_get(hass)
    today = dt_util.now().date()
    water: list[str] = []
    changed: list[str] = []
    harvest: list[str] = []
    paused: list[str] = []
    for entry in hass.config_entries.async_entries(GROW_LIGHT_DOMAIN):
        found: dict[str, str] = {
            reg.translation_key: reg.entity_id
            for reg in er.async_entries_for_config_entry(registry, entry.entry_id)
            if reg.platform == GROW_LIGHT_DOMAIN and reg.translation_key
        }
        stage_state = hass.states.get(found["stage"]) if "stage" in found else None
        crop = entry.title
        if stage_state is not None and stage_state.attributes.get("plant"):
            crop = f"{stage_state.attributes['plant']} ({entry.title})"
        if (watering := hass.states.get(found.get("next_watering", ""))) is not None:
            due = _local_date(watering.state)
            if due is not None and due <= today:
                water.append(crop)
        if stage_state is not None and stage_state.state not in (
            STATE_UNKNOWN,
            STATE_UNAVAILABLE,
        ):
            if stage_state.state == STAGE_HARVEST:
                harvest.append(crop)
            elif (
                stage_state.attributes.get("day_in_stage") == 1
                and stage_state.attributes.get("days_since_planting", 0) > 0
            ):
                changed.append(
                    f"{crop} is now in {stage_state.state.replace('_', ' ')}"
                )
        status = hass.states.get(found.get("status", ""))
        if status is not None and status.state == STATUS_PAUSED:
            paused.append(entry.title)
    lines = []
    if water:
        lines.append("Water today: " + ", ".join(water) + ".")
    if changed:
        lines.append("New stage: " + "; ".join(changed) + ".")
    if harvest:
        lines.append("Ready to harvest: " + ", ".join(harvest) + ".")
    if paused:
        lines.append("Light paused (door open): " + ", ".join(paused) + ".")
    return lines


def unavailable_sources(hass: HomeAssistant, sources: BriefingSources) -> list[str]:
    """Return each selected source with no usable state, in briefing order."""
    selected = ([sources.weather] if sources.weather else []) + sources.transit + sources.extra
    return [entity for entity in dict.fromkeys(selected) if _readable(hass, entity) is None]


async def async_compose_message(hass: HomeAssistant, sources: BriefingSources) -> str:
    """Return the text of one briefing. Empty sections are left out."""
    now = dt_util.now()
    lines: list[str] = []
    if sources.weather and (line := await _weather_line(hass, sources.weather)):
        lines.append(line)
    if transit := _transit_lines(hass, sources.transit):
        lines.append("Transit alerts:")
        lines.extend(f"- {item}" for item in transit)
    lines.extend(_grow_light_lines(hass))
    lines.extend(
        f"{_label(hass, entity_id)}: {value}"
        for entity_id in sources.extra
        if (value := _readable(hass, entity_id)) is not None
    )
    if missing := unavailable_sources(hass, sources):
        selected = set(sources.transit + sources.extra)
        if sources.weather:
            selected.add(sources.weather)
        checked = len(selected) - len(missing)
        if checked == 0:
            lines.append("Couldn’t check your selected sources.")
        elif not lines:
            lines.append(f"No alerts from {checked} checked source{'s' if checked != 1 else ''}.")
        lines.extend(f"{_label(hass, entity)}: unavailable." for entity in missing)
    if not lines:
        lines.append("All quiet.")
    return "\n".join([f"Good morning, it is {now:%H:%M}.", *lines])
