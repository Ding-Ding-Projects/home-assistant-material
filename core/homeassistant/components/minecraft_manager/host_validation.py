"""Strict validation of an SSH host definition.

Pure functions only: no I/O. Every value is checked with ``fullmatch`` so a
trailing newline never passes, and nothing here ever reaches a shell.
"""

import ipaddress
import re
from typing import Any

from .const import HOST_PORT_MAX, HOST_PORT_MIN, NAME_MAX_LENGTH
from .validation import NAME_PATTERN

HOST_FIELDS = ("name", "address", "port", "user")

# A DNS name: labels of letters, digits and dashes, separated by dots.
HOSTNAME_PATTERN = re.compile(
    r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?"
    r"(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*"
)
ADDRESS_MAX_LENGTH = 253
# A Unix account name. No dollar sign, no spaces, never starts with a dash.
USER_PATTERN = re.compile(r"[A-Za-z_][A-Za-z0-9_.\-]{0,31}")


def _is_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def is_valid_address(value: Any) -> bool:
    """Return True for a host name or an IP address literal."""
    if not isinstance(value, str) or not 0 < len(value) <= ADDRESS_MAX_LENGTH:
        return False
    try:
        ipaddress.ip_address(value)
    except ValueError:
        # Digits and dots that are not an address, such as 999.1.1.1, are not a name.
        return bool(HOSTNAME_PATTERN.fullmatch(value)) and not value.replace(".", "").isdigit()
    return True


def validate_host(data: Any) -> tuple[dict[str, Any], list[dict[str, str]]]:
    """Validate a host definition.

    Returns the cleaned definition and a list of ``{field, code}`` errors.
    """
    if not isinstance(data, dict):
        return {}, [{"field": "host", "code": "not_an_object"}]

    errors: list[dict[str, str]] = [
        {"field": key, "code": "unknown_field"}
        for key in sorted(set(data) - set(HOST_FIELDS))
    ]
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

    address = data.get("address")
    if isinstance(address, str):
        address = address.strip()
    if not isinstance(address, str) or not address:
        errors.append({"field": "address", "code": "required"})
    elif not is_valid_address(address):
        errors.append({"field": "address", "code": "invalid_address"})
    else:
        cleaned["address"] = address.lower()

    port = data.get("port")
    if not _is_int(port) or not HOST_PORT_MIN <= port <= HOST_PORT_MAX:
        errors.append({"field": "port", "code": "out_of_range"})
    else:
        cleaned["port"] = port

    user = data.get("user")
    if not isinstance(user, str) or not user.strip():
        errors.append({"field": "user", "code": "required"})
    elif not USER_PATTERN.fullmatch(user.strip()):
        errors.append({"field": "user", "code": "invalid_user"})
    else:
        cleaned["user"] = user.strip()

    return cleaned, errors
