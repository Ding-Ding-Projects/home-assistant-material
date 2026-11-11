"""Derive the WebAuthn relying party from the request itself."""

from dataclasses import dataclass
from ipaddress import ip_address

from aiohttp import web
import yarl


@dataclass(frozen=True, slots=True)
class RelyingParty:
    """The origin and relying party identifier a ceremony is bound to."""

    origin: str
    rp_id: str


_FORBIDDEN_HOST_CHARACTERS = frozenset("@/?#\\ \t\r\n")


def _is_localhost(host: str) -> bool:
    return host == "localhost" or host.endswith(".localhost")


def _is_ip_address(host: str) -> bool:
    try:
        ip_address(host)
    except ValueError:
        return False
    return True


def async_resolve_relying_party(request: web.Request | None) -> RelyingParty | None:
    """Return the relying party for a request, or None when passkeys cannot be used.

    The origin is built from the scheme and host the HTTP stack resolved for this
    request and never from the request body. WebAuthn needs a secure context and a
    domain name, so plain http is only accepted for localhost and IP addresses are
    refused. A browser always sends the Origin header on the requests that matter
    here, and it must agree with the derived origin when present.
    """
    if request is None or _FORBIDDEN_HOST_CHARACTERS.intersection(request.host):
        return None
    try:
        url = yarl.URL(f"{request.scheme}://{request.host}")
    except ValueError:
        return None

    host = url.raw_host
    if not host or url.scheme not in ("http", "https"):
        return None
    host = host.lower()
    if host.endswith(".") or _is_ip_address(host):
        return None
    if url.scheme == "http" and not _is_localhost(host):
        return None

    port = url.port
    default_port = 443 if url.scheme == "https" else 80
    netloc = host if port in (None, default_port) else f"{host}:{port}"
    origin = f"{url.scheme}://{netloc}"

    if (header := request.headers.get("Origin")) is not None and header != origin:
        return None
    return RelyingParty(origin=origin, rp_id=host)
