"""Tests for deriving the relying party."""

from aiohttp.test_utils import make_mocked_request
import pytest

from homeassistant.components.passkey.ceremony import counter_regressed
from homeassistant.components.passkey.origin import (
    RelyingParty,
    async_resolve_relying_party,
)


def _request(scheme: str, host: str, origin: str | None = None):  # -> web.Request
    headers = {"Origin": origin} if origin else {}
    return make_mocked_request("POST", "/", headers=headers).clone(
        scheme=scheme, host=host
    )


@pytest.mark.parametrize(
    ("scheme", "host", "origin", "expected"),
    [
        (
            "https",
            "ha.example.com",
            None,
            RelyingParty("https://ha.example.com", "ha.example.com"),
        ),
        (
            "https",
            "ha.example.com:8123",
            None,
            RelyingParty("https://ha.example.com:8123", "ha.example.com"),
        ),
        (
            "https",
            "HA.Example.com:443",
            None,
            RelyingParty("https://ha.example.com", "ha.example.com"),
        ),
        (
            "https",
            "ha.example.com",
            "https://ha.example.com",
            RelyingParty("https://ha.example.com", "ha.example.com"),
        ),
        (
            "http",
            "localhost:8123",
            None,
            RelyingParty("http://localhost:8123", "localhost"),
        ),
        ("http", "ha.example.com", None, None),
        ("http", "192.168.1.5:8123", None, None),
        ("https", "192.168.1.5", None, None),
        ("https", "[2001:db8::1]:8123", None, None),
        ("https", "ha.example.com", "https://evil.example", None),
        ("https", "ha.example.com", "http://ha.example.com", None),
        ("https", "ha.example.com.", None, None),
        ("https", "ha.example.com.:8123", None, None),
        ("https", "user@ha.example.com", None, None),
        ("https", "evil.example@ha.example.com", None, None),
        ("https", "ha.example.com/path", None, None),
        ("https", "ha.example.com?x=1", None, None),
        ("https", "ha.example.com#frag", None, None),
        ("https", r"ha.example.com\evil.example", None, None),
    ],
    ids=[
        "https",
        "https_port",
        "normalised_host",
        "matching_origin_header",
        "localhost_http",
        "http_remote_host",
        "http_ip",
        "https_ip",
        "https_ipv6",
        "origin_header_differs",
        "origin_header_scheme_differs",
        "trailing_dot",
        "trailing_dot_port",
        "userinfo",
        "userinfo_lookalike",
        "path",
        "query",
        "fragment",
        "backslash",
    ],
)
def test_resolve_relying_party(
    scheme: str, host: str, origin: str | None, expected: RelyingParty | None
) -> None:
    """The relying party comes only from the request."""
    assert async_resolve_relying_party(_request(scheme, host, origin)) == expected


def test_resolve_without_request() -> None:
    """No request means no relying party."""
    assert async_resolve_relying_party(None) is None


@pytest.mark.parametrize(
    ("stored", "new", "regressed"),
    [
        (0, 0, False),
        (0, 1, False),
        (5, 6, False),
        (5, 5, True),
        (5, 3, True),
        (5, 0, True),
    ],
)
def test_counter_regressed(stored: int, new: int, regressed: bool) -> None:
    """The counter must increase once either side is non-zero."""
    assert counter_regressed(stored, new) is regressed
