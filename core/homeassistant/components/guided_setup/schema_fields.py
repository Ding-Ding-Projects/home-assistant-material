"""Describe the options of an integration schema as form fields.

The schema is never serialized as a whole. Each key is walked on its own and
its validator is mapped to a field type by a tolerant mapper, so one validator
that cannot be described only turns that one option into a YAML box.
"""

from dataclasses import dataclass, field
import datetime
import enum
import json
from typing import Any

import probatio

CV_MODULE = "homeassistant.helpers.config_validation"

TEXT_FUNCTIONS = frozenset(
    {
        "string",
        "string_with_no_html",
        "slug",
        "icon",
        "url",
        "url_no_path",
        "isfile",
        "isdir",
        "path",
        "positive_time_period_template",
        "match_all",
        "x10_address",
        "temperature_unit_name",
        "entity_domain",
        "service",
        "ensure_list_csv",
        "time_zone",
        "template_complex_str",
        "string_or_none",
        "uuid4_hex",
        "ulid",
        "ulid_hex",
        "language",
        "country",
        "currency",
    }
)
MULTI_TEXT_FUNCTIONS = frozenset({"ensure_list_csv"})
TEMPLATE_FUNCTIONS = frozenset(
    {"template", "dynamic_template", "template_complex", "script_action"}
)
ENTITY_FUNCTIONS = frozenset({"entity_id", "entity_id_or_uuid", "comp_entity_ids"})
ENTITIES_FUNCTIONS = frozenset({"entity_ids", "entity_ids_or_uuids"})
DURATION_FUNCTIONS = frozenset(
    {
        "time_period",
        "time_period_str",
        "time_period_seconds",
        "positive_time_period",
        "positive_time_period_dict",
        "time_period_dict",
    }
)
TIME_FUNCTIONS = frozenset({"time"})
BOOLEAN_FUNCTIONS = frozenset({"boolean"})
NUMBER_FUNCTIONS = frozenset({"socket_timeout", "latitude", "longitude"})
TEMPERATURE_UNITS = ["°C", "°F"]


@dataclass(slots=True)
class Kind:
    """What a validator accepts, in terms the form understands."""

    name: str
    options: list[Any] | None = None
    minimum: float | None = None
    maximum: float | None = None
    integer: bool = False
    multiple: bool = False
    nested: list[dict[str, Any]] = field(default_factory=list)


def _is_cv(value: Any, names: frozenset[str]) -> bool:
    return (
        callable(value)
        and getattr(value, "__module__", None) == CV_MODULE
        and getattr(value, "__name__", None) in names
    )


def _cv_name(value: Any) -> str | None:
    if callable(value) and getattr(value, "__module__", None) == CV_MODULE:
        return getattr(value, "__name__", None)
    return None


def _json_safe(value: Any) -> Any:
    """Return the value when it can be sent to the frontend, else UNDEFINED."""
    if isinstance(value, enum.Enum):
        value = value.value
    if isinstance(value, datetime.timedelta):
        return probatio.UNDEFINED
    try:
        json.dumps(value)
    except (TypeError, ValueError):
        return probatio.UNDEFINED
    return value


def _options(container: Any) -> list[Any] | None:
    try:
        if isinstance(container, dict):
            items = list(container)
        elif isinstance(container, type) and issubclass(container, enum.Enum):
            items = [member.value for member in container]
        else:
            items = list(container)
    except TypeError:
        return None
    values = [_json_safe(item) for item in items]
    if not values or any(value is probatio.UNDEFINED for value in values):
        return None
    if not all(isinstance(value, (str, int, float)) for value in values):
        return None
    return values


def _merge_bounds(kind: Kind, other: Kind) -> None:
    if other.minimum is not None:
        kind.minimum = other.minimum
    if other.maximum is not None:
        kind.maximum = other.maximum


def map_validator(validator: Any, depth: int = 0) -> Kind | None:
    """Map one validator to a Kind, or None when it is not recognised."""
    if depth > 8:
        return None

    if isinstance(validator, (probatio.Schema, dict)):
        fields = describe_mapping(validator, depth + 1)
        return Kind("nested", nested=fields) if fields is not None else None

    if isinstance(validator, list):
        if len(validator) == 1:
            inner = map_validator(validator[0], depth + 1)
            if inner is not None and inner.name in {
                "text",
                "number",
                "entity",
                "select",
                "boolean",
            }:
                inner.multiple = True
                return inner
        return None

    if validator is str:
        return Kind("text")
    if validator is bool:
        return Kind("boolean")
    if validator is int:
        return Kind("number", integer=True)
    if validator is float:
        return Kind("number")
    if validator is dict:
        return None
    if validator is datetime.timedelta:
        return Kind("duration")
    if validator is datetime.time:
        return Kind("time")

    if isinstance(validator, probatio.Port):
        return Kind("number", minimum=1, maximum=65535, integer=True)
    if isinstance(validator, probatio.Coerce):
        return _map_coerce(validator.type)
    if isinstance(validator, probatio.Range):
        return Kind(
            "number",
            minimum=validator.min if isinstance(validator.min, (int, float)) else None,
            maximum=validator.max if isinstance(validator.max, (int, float)) else None,
        )
    if isinstance(validator, probatio.In):
        if (options := _options(validator.container)) is not None:
            return Kind("select", options=options)
        return None
    if isinstance(validator, probatio.Literal):
        if (options := _options([validator.lit])) is not None:
            return Kind("select", options=options)
        return None
    if isinstance(validator, probatio.EnsureList):
        return None
    if isinstance(validator, (probatio.Maybe, probatio.Msg)):
        return map_validator(validator.validator, depth + 1)
    if isinstance(validator, probatio.All):
        return _map_all(validator, depth)
    if isinstance(validator, probatio.Any):
        for member in validator.validators:
            if (kind := map_validator(member, depth + 1)) is not None:
                return kind
        return None
    if isinstance(validator, (probatio.Match, probatio.Length, probatio.Slug)):
        return Kind("text")

    return _map_cv_function(validator)


def _map_coerce(target: Any) -> Kind | None:
    if target is int:
        return Kind("number", integer=True)
    if target is float:
        return Kind("number")
    if target is str:
        return Kind("text")
    if target is bool:
        return Kind("boolean")
    if isinstance(target, type) and issubclass(target, enum.Enum):
        if (options := _options(target)) is not None:
            return Kind("select", options=options)
    return None


def _map_cv_function(validator: Any) -> Kind | None:
    name = _cv_name(validator)
    if name is None:
        return None
    if name in TEMPLATE_FUNCTIONS:
        return Kind("template")
    if name in ENTITY_FUNCTIONS:
        return Kind("entity")
    if name in ENTITIES_FUNCTIONS:
        return Kind("entity", multiple=True)
    if name in DURATION_FUNCTIONS:
        return Kind("duration")
    if name in TIME_FUNCTIONS:
        return Kind("time")
    if name in BOOLEAN_FUNCTIONS:
        return Kind("boolean")
    if name in NUMBER_FUNCTIONS:
        return Kind("number")
    if name == "temperature_unit":
        return Kind("select", options=TEMPERATURE_UNITS)
    if name in MULTI_TEXT_FUNCTIONS:
        return Kind("text", multiple=True)
    if name in TEXT_FUNCTIONS:
        return Kind("text")
    return None


def _map_all(validator: Any, depth: int) -> Kind | None:
    """Map an All(...) by its first recognisable member, merging bounds."""
    members = list(validator.validators)
    multiple = any(isinstance(member, probatio.EnsureList) for member in members)
    result: Kind | None = None
    bounds: list[Kind] = []
    for member in members:
        kind = map_validator(member, depth + 1)
        if kind is None:
            continue
        if kind.name == "number" and member.__class__ is probatio.Range:
            bounds.append(kind)
        elif result is None:
            result = kind
    if result is None and bounds:
        result = Kind("number")
    if result is None:
        return None
    for bound in bounds:
        _merge_bounds(result, bound)
    if multiple and result.name != "nested":
        result.multiple = True
    return result


def _default_of(marker: probatio.Marker) -> Any:
    default = marker.default
    if isinstance(default, probatio.Undefined):
        return probatio.UNDEFINED
    if callable(default):
        try:
            default = default()
        except Exception:  # noqa: BLE001 - a default factory may need a running instance
            return probatio.UNDEFINED
    return _json_safe(default)


def _selector(kind: Kind) -> dict[str, Any] | None:
    match kind.name:
        case "text":
            return {"text": {"multiple": True} if kind.multiple else {}}
        case "template":
            return {"template": {}}
        case "boolean":
            return {"boolean": {}}
        case "duration":
            return {"duration": {}}
        case "time":
            return {"time": {}}
        case "entity":
            return {"entity": {"multiple": True} if kind.multiple else {}}
        case "number":
            config: dict[str, Any] = {"mode": "box"}
            if kind.minimum is not None:
                config["min"] = kind.minimum
            if kind.maximum is not None:
                config["max"] = kind.maximum
            config["step"] = 1 if kind.integer else "any"
            return {"number": config}
        case "select":
            return {
                "select": {
                    "options": [
                        {"value": str(option), "label": str(option)}
                        for option in kind.options or []
                    ],
                    "multiple": kind.multiple,
                    "mode": "dropdown",
                }
            }
    return None


def _keys_of(mapping: Any) -> dict[Any, Any] | None:
    """Return the key to validator mapping of a schema, or None."""
    if isinstance(mapping, probatio.Schema):
        mapping = mapping.schema
    if isinstance(mapping, dict):
        return mapping
    return None


def mapping_parts(validator: Any, depth: int = 0) -> list[dict[Any, Any]]:
    """Find every key mapping inside Schema, All and extend chains."""
    if depth > 8:
        return []
    keys = _keys_of(validator)
    if keys is not None:
        return [keys]
    if isinstance(validator, probatio.All):
        parts: list[dict[Any, Any]] = []
        for member in validator.validators:
            parts.extend(mapping_parts(member, depth + 1))
        return parts
    if isinstance(validator, (probatio.Maybe, probatio.Msg)):
        return mapping_parts(validator.validator, depth + 1)
    return []


def describe_mapping(validator: Any, depth: int = 0) -> list[dict[str, Any]] | None:
    """Describe every option of a mapping schema.

    Returns None when the validator is not a mapping with named keys.
    """
    parts = mapping_parts(validator, depth)
    if not parts:
        return None
    fields: list[dict[str, Any]] = []
    seen: set[str] = set()
    for keys in parts:
        for key, value in keys.items():
            marker = key if isinstance(key, probatio.Marker) else None
            name = marker.schema if marker is not None else key
            if not isinstance(name, str):
                # Keys chosen by the user cannot be drawn as named options.
                return None
            if name == "platform" or name in seen:
                continue
            seen.add(name)
            fields.append(_describe_field(name, marker, value, depth))
    return fields


def _describe_field(
    name: str, marker: probatio.Marker | None, validator: Any, depth: int
) -> dict[str, Any]:
    required = isinstance(marker, probatio.Required)
    entry: dict[str, Any] = {"name": name, "required": required}
    if marker is not None:
        default = _default_of(marker)
        if default is not probatio.UNDEFINED and default is not None:
            entry["default"] = default
    kind = map_validator(validator, depth + 1)
    if kind is not None and kind.name == "nested" and kind.nested:
        return {
            "type": "expandable",
            "name": name,
            "title": name,
            "required": required,
            "schema": kind.nested,
            "label": name,
        }
    selector = _selector(kind) if kind is not None else None
    if selector is None:
        entry["selector"] = {"object": {}}
        entry["free_form"] = True
    else:
        entry["selector"] = selector
    return entry


def count_free_form(fields: list[dict[str, Any]]) -> int:
    """Count the options that fell back to a YAML box."""
    total = 0
    for item in fields:
        if item.get("free_form"):
            total += 1
        total += count_free_form(item.get("schema", []))
    return total


def item_kinds(validator: Any, depth: int = 0) -> list[dict[str, Any]] | None:
    """Describe a list item that is keyed by its kind, such as command_line.

    Returns one entry per kind with that kind's fields, or None when the item
    is an ordinary mapping of options.
    """
    parts = mapping_parts(validator, depth)
    if not parts:
        return None
    kinds: list[dict[str, Any]] = []
    for keys in parts:
        for key, value in keys.items():
            marker = key if isinstance(key, probatio.Marker) else None
            name = marker.schema if marker is not None else key
            if not isinstance(name, str):
                return None
            fields = describe_mapping(value, depth + 1)
            if fields is None:
                return None
            kinds.append({"name": name, "fields": fields})
    return kinds or None


def list_item_validator(validator: Any, depth: int = 0) -> Any | None:
    """Return the item validator of All(EnsureList(), [item]) or [item]."""
    if depth > 6:
        return None
    if isinstance(validator, list) and len(validator) == 1:
        return validator[0]
    if isinstance(validator, probatio.All):
        for member in validator.validators:
            if (item := list_item_validator(member, depth + 1)) is not None:
                return item
    return None
