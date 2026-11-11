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


_NOT_LAN_NETWORKS = tuple(
    ipaddress.ip_network(net)
    for net in (
        "192.0.2.0/24",  # documentation
        "198.51.100.0/24",  # documentation
        "203.0.113.0/24",  # documentation
        "198.18.0.0/15",  # benchmarking
        "2001:db8::/32",  # documentation
    )
)
_BROADCAST = ipaddress.IPv4Address("255.255.255.255")
_NUMERIC_LABEL = re.compile(r"(0[xX][0-9A-Fa-f]*|[0-9]+)")


def is_lan_address(value: str) -> bool:
    """Return True for a private, loopback or link-local unicast address.

    Unspecified, multicast, broadcast, reserved, documentation and benchmarking
    ranges, an IPv4-mapped IPv6 form and any ``%scope`` are never accepted.
    """
    if not isinstance(value, str) or "%" in value:
        return False
    try:
        address = ipaddress.ip_address(value)
    except ValueError:
        return False
    if (
        address.is_unspecified
        or address.is_multicast
        or address.is_reserved
        or address == _BROADCAST
        or getattr(address, "ipv4_mapped", None) is not None
    ):
        return False
    if any(
        address.version == network.version and address in network
        for network in _NOT_LAN_NETWORKS
    ):
        return False
    return address.is_private or address.is_loopback or address.is_link_local


def is_valid_address(value: Any) -> bool:
    """Return True for a dotted decimal IPv4, a plain IPv6 literal or a host name.

    A scope (``%``), hexadecimal, octal and short numeric forms such as
    ``0x7f.1`` are never a host name.
    """
    if not isinstance(value, str) or not 0 < len(value) <= ADDRESS_MAX_LENGTH:
        return False
    if "%" in value:
        return False
    try:
        ipaddress.ip_address(value)
    except ValueError:
        pass
    else:
        return True
    if not HOSTNAME_PATTERN.fullmatch(value):
        return False
    # A real name ends in a label that is not a number, so 1.2.3 or 0x7f.1
    # can never be read as an address by a resolver.
    return not _NUMERIC_LABEL.fullmatch(value.rsplit(".", 1)[-1])


def is_forbidden_target(value: str) -> bool:
    """Return True for an address a host must never point at.

    Loopback, link-local and unspecified addresses and the name ``localhost``
    would send the instance's own sign-in attempts at itself or at its
    neighbours on the same link.
    """
    try:
        address = ipaddress.ip_address(value)
    except ValueError:
        name = value.lower().rstrip(".")
        return name == "localhost" or name.endswith(".localhost")
    mapped = getattr(address, "ipv4_mapped", None)
    if mapped is not None:
        address = mapped
    return address.is_loopback or address.is_link_local or address.is_unspecified


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
    elif is_forbidden_target(address):
        errors.append({"field": "address", "code": "address_not_allowed"})
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
