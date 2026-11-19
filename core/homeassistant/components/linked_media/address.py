"""Checks and masking for the web addresses of linked files."""

from enum import StrEnum
import ipaddress
import re

from yarl import URL

ALLOWED_SCHEMES = ("http", "https")

PRIVATE_NETWORKS = tuple(
    ipaddress.ip_network(net)
    for net in (
        "10.0.0.0/8",
        "172.16.0.0/12",
        "192.168.0.0/16",
        "100.64.0.0/10",
        "fc00::/7",
    )
)

_SECRET_WORDS = re.compile(
    r"(token|secret|passw|apikey|api_key|api-key|auth|signature|sig=|key=|session)",
    re.IGNORECASE,
)
# A long run of letters and digits mixed together reads like a key.
_KEY_LIKE = re.compile(r"[A-Za-z0-9_\-]{20,}")
_HAS_DIGIT = re.compile(r"\d")
_HAS_LETTER = re.compile(r"[A-Za-z]")

HIDDEN_PATH = "/…"


class AddressClass(StrEnum):
    """Where an address points."""

    PUBLIC = "public"
    PRIVATE = "private"
    BLOCKED = "blocked"


def classify_address(
    value: str, own_addresses: frozenset[str] = frozenset()
) -> AddressClass:
    """Classify one resolved address."""
    try:
        ip = ipaddress.ip_address(value.split("%", 1)[0])
    except ValueError:
        return AddressClass.BLOCKED
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    if str(ip) in own_addresses:
        return AddressClass.BLOCKED
    if (
        ip.is_loopback
        or ip.is_unspecified
        or ip.is_multicast
        or ip.is_link_local
        or ip.is_reserved
    ):
        return AddressClass.BLOCKED
    if any(ip in net for net in PRIVATE_NETWORKS):
        return AddressClass.PRIVATE
    if not ip.is_global:
        return AddressClass.BLOCKED
    return AddressClass.PUBLIC


def parse_address(address: str) -> URL | None:
    """Return the address as a URL when it is a usable web address."""
    try:
        url = URL(address.strip())
    except ValueError:
        return None
    if url.scheme not in ALLOWED_SCHEMES or not url.host or not url.is_absolute():
        return None
    return url


def _segment_looks_secret(segment: str) -> bool:
    if _SECRET_WORDS.search(segment):
        return True
    return any(
        _HAS_DIGIT.search(run) and _HAS_LETTER.search(run)
        for run in _KEY_LIKE.findall(segment)
    )


def address_has_secret(url: URL) -> bool:
    """Return True when the address carries a sign-in, a query or a key."""
    if url.user or url.password or url.query_string or url.fragment:
        return True
    return any(_segment_looks_secret(part) for part in url.path.split("/"))


def masked_address(url: URL) -> str:
    """Return the address as it may be shown again after it was added."""
    origin = f"{url.scheme}://{url.host}"
    if not url.is_default_port():
        origin += f":{url.port}"
    if address_has_secret(url):
        return origin + HIDDEN_PATH
    return origin + url.raw_path
