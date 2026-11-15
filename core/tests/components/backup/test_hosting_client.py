"""Security boundaries of the local backup hosting transport."""

from collections.abc import AsyncIterator

import pytest

from homeassistant.components.backup.hosting.client import (
    HostingError,
    BridgeClient,
    bounded_archive,
    safe_job,
    validate_endpoint,
)

PIN = "ab" * 32


@pytest.mark.parametrize(
    "url",
    [
        "http://localhost:4198", "https://localhost", "https://localhost:443",
        "https://other.example:4198", "https://8.8.8.8:4198",
        "https://169.254.1.2:4198", "https://100.64.0.1:4198",
        "https://172.15.1.2:4198", "https://172.32.1.2:4198",
        "https://192.0.2.1:4198", "https://[fd00::1]:4198",
        "https://192.168.1.2:4198\n", " https://192.168.1.2:4198",
        "https://localhost:4198/path", "https://user:pass@localhost:4198",
        "https://localhost:4198?credential=value", "https://localhost:4198/#fragment",
        "https://0.0.0.0:4198",
    ],
)
def test_reject_unapproved_endpoint(url: str) -> None:
    """A pairing request is not general-purpose SSRF permission."""
    with pytest.raises(HostingError):
        validate_endpoint(url, PIN)


@pytest.mark.parametrize("host", ["localhost", "host.docker.internal", "gateway.docker.internal", "127.0.0.1", "[::1]", "192.168.1.2", "10.1.2.3", "172.16.1.2", "172.31.1.2"])
def test_local_host_endpoint(host: str) -> None:
    """Only deliberate physical-host routes and full pins are accepted."""
    assert validate_endpoint(f"https://{host}:4198/", PIN) == (f"https://{host}:4198", PIN)


@pytest.mark.parametrize("pin", ["", "ab", "xy" * 32, "ab" * 31])
def test_reject_invalid_pin(pin: str) -> None:
    """TLS trust cannot silently become an unverified connection."""
    with pytest.raises(HostingError, match="invalid_certificate_fingerprint"):
        validate_endpoint("https://localhost:4198", pin)


@pytest.mark.parametrize("url", ["https://public.example/", "http://127.0.0.1:8123", "http://192.168.1.2:8123/?credential=hidden"])
def test_job_sanitization(url: str) -> None:
    """Only the contract survives, never credentials, options or public links."""
    assert safe_job({"id": "job-1", "state": "ready", "lan_url": url, "credential": "hidden", "password": "hidden", "options": {"password": "hidden"}}) == {"id": "job-1", "state": "ready"}


def test_selected_native_lan_endpoint_preserves_pin() -> None:
    """The native-emitted RFC1918 endpoint remains bound to its exact pin."""
    client = BridgeClient({"url": "https://192.168.50.20:48321", "fingerprint": PIN, "client_id": "client-1"}, "core-1")
    assert client.url == "https://192.168.50.20:48321"
    assert client.fingerprint.fingerprint == bytes.fromhex(PIN)


def test_verified_sign_in_link_remains_incomplete() -> None:
    """A probed sign-in action is reachable without becoming a ready result."""
    job = {"id": "job-1", "state": "authentication_needed", "lan_url": "http://192.168.1.2:8123/", "lan_url_verified": True, "lan_url_verified_at": "2026-11-15T16:30:00+00:00"}
    assert safe_job(job) == job


@pytest.mark.parametrize("metadata", [{}, {"lan_url_verified": False, "lan_url_verified_at": "2026-11-15T16:30:00+00:00"}, {"lan_url_verified": True}, {"lan_url_verified": True, "lan_url_verified_at": "invalid"}, {"lan_url_verified": True, "lan_url_verified_at": "2026-11-15T16:30:00"}])
def test_unverified_sign_in_link_is_not_forwarded(metadata: dict[str, object]) -> None:
    """No timestamp, no timezone or no independent probe means no link."""
    assert safe_job({"id": "job-1", "state": "authentication_needed", "lan_url": "http://192.168.1.2:8123/", **metadata}) == {"id": "job-1", "state": "authentication_needed"}


async def test_bounded_archive_exact_bytes() -> None:
    """The archive is streamed without accumulating the whole payload."""
    async def source() -> AsyncIterator[bytes]:
        yield b"ab"
        yield b"cd"

    assert [chunk async for chunk in bounded_archive(source(), 4)] == [b"ab", b"cd"]


@pytest.mark.parametrize("size", [1, 3])
async def test_bounded_archive_size_mismatch(size: int) -> None:
    """Deletion races and changed sizes never become a successful upload."""
    async def source() -> AsyncIterator[bytes]:
        yield b"ab"

    with pytest.raises(HostingError, match="archive_size_mismatch"):
        _ = [chunk async for chunk in bounded_archive(source(), size)]
