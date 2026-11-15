"""Security boundaries of the local backup hosting transport."""

from collections.abc import AsyncIterator

import pytest

from homeassistant.components.backup.hosting.client import (
    HostingError,
    bounded_archive,
    safe_job,
    validate_endpoint,
)

PIN = "ab" * 32


@pytest.mark.parametrize(
    "url",
    [
        "http://localhost:4198", "https://localhost", "https://localhost:443",
        "https://other.example:4198", "https://192.168.1.2:4198",
        "https://localhost:4198/path", "https://user:pass@localhost:4198",
        "https://localhost:4198?credential=value", "https://localhost:4198/#fragment",
        "https://0.0.0.0:4198",
    ],
)
def test_reject_unapproved_endpoint(url: str) -> None:
    """A pairing request is not general-purpose SSRF permission."""
    with pytest.raises(HostingError):
        validate_endpoint(url, PIN)


@pytest.mark.parametrize("host", ["localhost", "host.docker.internal", "gateway.docker.internal", "127.0.0.1", "[::1]"])
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
