"""Strict validation of a Minecraft server definition.

Pure functions only: no I/O, so the rules are easy to test and the same rules
can be mirrored in the interface.
"""

import re
from typing import Any

from .const import (
    EDITIONS,
    FLAVOURS_BY_EDITION,
    MEMORY_MAX_MB,
    MEMORY_MIN_MB,
    NAME_MAX_LENGTH,
    PORT_MAX,
    PORT_MIN,
    TARGETS,
)

# Both patterns are used with fullmatch, so a trailing newline never passes.
# Letters, digits, spaces and a few separators; must start with a letter or digit.
NAME_PATTERN = re.compile(r"[A-Za-z0-9][A-Za-z0-9 _.\-]*")
# A release such as 1.21.4, a snapshot such as 25w45a, or the word latest.
VERSION_PATTERN = re.compile(r"(latest|[A-Za-z0-9][A-Za-z0-9._+\-]{0,39})")

FIELDS = ("name", "edition", "flavour", "version", "port", "memory_mb", "target")


def _is_int(value: Any) -> bool:
    """Return True for a real integer; a bool is not accepted."""
    return isinstance(value, int) and not isinstance(value, bool)


def validate_server(data: Any) -> tuple[dict[str, Any], list[dict[str, str]]]:
    """Validate a server definition.

    Returns the cleaned definition (only the known fields) and a list of
    errors, each with the field name and a stable code. The list is empty
    when the definition is valid.
    """
    errors: list[dict[str, str]] = []
    if not isinstance(data, dict):
        return {}, [{"field": "server", "code": "not_an_object"}]

    unknown = sorted(set(data) - set(FIELDS))
    errors.extend({"field": key, "code": "unknown_field"} for key in unknown)

    cleaned: dict[str, Any] = {}

    name = data.get("name")
    if not isinstance(name, str) or not name.strip():
        errors.append({"field": "name", "code": "required"})
    else:
        name = name.strip()
        if len(name) > NAME_MAX_LENGTH:
            errors.append({"field": "name", "code": "too_long"})
        elif not NAME_PATTERN.fullmatch(name):
            errors.append({"field": "name", "code": "invalid_characters"})
        else:
            cleaned["name"] = name

    edition = data.get("edition")
    if edition not in EDITIONS:
        errors.append({"field": "edition", "code": "invalid_choice"})
    else:
        cleaned["edition"] = edition

    flavour = data.get("flavour")
    if edition in EDITIONS and flavour in FLAVOURS_BY_EDITION[edition]:
        cleaned["flavour"] = flavour
    else:
        errors.append({"field": "flavour", "code": "invalid_choice"})

    version = data.get("version")
    if not isinstance(version, str) or not VERSION_PATTERN.fullmatch(version):
        errors.append({"field": "version", "code": "invalid_version"})
    else:
        cleaned["version"] = version

    port = data.get("port")
    if not _is_int(port) or not PORT_MIN <= port <= PORT_MAX:
        errors.append({"field": "port", "code": "out_of_range"})
    else:
        cleaned["port"] = port

    memory = data.get("memory_mb")
    if not _is_int(memory) or not MEMORY_MIN_MB <= memory <= MEMORY_MAX_MB:
        errors.append({"field": "memory_mb", "code": "out_of_range"})
    else:
        cleaned["memory_mb"] = memory

    target = data.get("target")
    if target not in TARGETS:
        errors.append({"field": "target", "code": "invalid_choice"})
    else:
        cleaned["target"] = target

    return cleaned, errors
