"""Pinned, bounded transport to the local deployment assistant."""

import asyncio
from collections.abc import AsyncIterator
from ipaddress import ip_address
import json
import re
from typing import Any
from urllib.parse import urlsplit

from aiohttp import ClientError, ClientSession, ClientTimeout, DummyCookieJar, Fingerprint

MAX_ARCHIVE_BYTES = 64 * 1024**3
MAX_RESPONSE_BYTES = 256 * 1024
TARGETS = frozenset({"docker", "virtualbox", "vmware"})


class HostingError(Exception):
    """A safe, machine-readable hosting error."""

    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


def validate_endpoint(url: str, fingerprint: str) -> tuple[str, str]:
    """Allow explicit local host destinations and a complete SHA256 pin only."""
    try:
        parsed = urlsplit(url)
        port = parsed.port
    except ValueError as err:
        raise HostingError("invalid_bridge_url") from err
    host = parsed.hostname or ""
    if (
        parsed.scheme != "https"
        or parsed.username is not None
        or parsed.password is not None
        or parsed.path not in ("", "/")
        or parsed.query
        or parsed.fragment
        or port is None
        or not 1024 <= port <= 65535
    ):
        raise HostingError("invalid_bridge_url")
    # Arbitrary private LAN hosts are deliberately excluded. A container reaches
    # its own physical host through the documented gateway name.
    if host not in {"localhost", "host.docker.internal", "gateway.docker.internal"}:
        try:
            address = ip_address(host)
        except ValueError as err:
            raise HostingError("invalid_bridge_host") from err
        if not address.is_loopback:
            raise HostingError("invalid_bridge_host")
    pin = fingerprint.replace(":", "").lower()
    if not re.fullmatch(r"[0-9a-f]{64}", pin):
        raise HostingError("invalid_certificate_fingerprint")
    return url.rstrip("/"), pin


def safe_job(data: dict[str, Any]) -> dict[str, Any]:
    """Project native responses onto the public job contract."""
    result = {
        key: value
        for key in (
            "id", "request_id", "state", "phase", "target", "instance_id",
            "error_code", "updated_at",
        )
        if isinstance((value := data.get(key)), str)
        and re.fullmatch(r"[A-Za-z0-9_.:+-]{1,256}", value)
    }
    if data.get("state") == "ready" and isinstance(url := data.get("lan_url"), str) and len(url) <= 2048:
        try:
            parsed = urlsplit(url)
            port = parsed.port
        except ValueError:
            return result
        if (
            parsed.scheme in {"http", "https"}
            and (port is None or 1 <= port <= 65535)
            and all(ord(character) >= 32 for character in url)
            and parsed.hostname
            and not parsed.username
            and not parsed.password
            and not parsed.query
            and not parsed.fragment
        ):
            try:
                address = ip_address(parsed.hostname)
            except ValueError:
                pass
            else:
                if address.is_private and not address.is_loopback and not address.is_link_local and not address.is_unspecified:
                    result["lan_url"] = url
    return result


class BridgeClient:
    """Use a fresh session without cookies, proxies, redirects or browser origins."""

    def __init__(self, bridge: dict[str, Any], core_id: str) -> None:
        self.url, pin = validate_endpoint(bridge["url"], bridge["fingerprint"])
        self.fingerprint = Fingerprint(bytes.fromhex(pin))
        self.headers = {
            "X-Core-Instance": core_id,
            "X-Client-Id": bridge["client_id"],
        }
        if credential := bridge.get("credential"):
            self.headers["Authorization"] = f"Bearer {credential}"

    async def request(
        self, method: str, path: str, *, body: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        stream: AsyncIterator[bytes] | None = None,
    ) -> dict[str, Any]:
        """Send one bounded request, without reflecting remote errors or bodies."""
        request_headers = self.headers | (headers or {})
        timeout = ClientTimeout(total=3600 if stream is not None else 30, sock_connect=10, sock_read=60)
        try:
            async with ClientSession(timeout=timeout, trust_env=False, cookie_jar=DummyCookieJar()) as session:
                async with session.request(
                    method, self.url + path, headers=request_headers,
                    json=body, data=stream, ssl=self.fingerprint,
                    allow_redirects=False,
                ) as response:
                    if response.status == 401:
                        raise HostingError("auth_needed")
                    if response.status not in {200, 201, 202}:
                        raise HostingError("bridge_request_rejected")
                    raw = bytearray()
                    async for chunk in response.content.iter_chunked(16384):
                        raw.extend(chunk)
                        if len(raw) > MAX_RESPONSE_BYTES:
                            raise HostingError("invalid_bridge_response")
                    data = json.loads(raw)
        except (ClientError, TimeoutError) as err:
            raise HostingError("bridge_unreachable") from err
        except (ValueError, TypeError) as err:
            raise HostingError("invalid_bridge_response") from err
        if not isinstance(data, dict):
            raise HostingError("invalid_bridge_response")
        return data


async def bounded_archive(stream: AsyncIterator[bytes], expected_size: int) -> AsyncIterator[bytes]:
    """Do not send bytes beyond the selected backup's declared size."""
    total = 0
    async with asyncio.timeout(3600):
        async for chunk in stream:
            total += len(chunk)
            if total > expected_size or total > MAX_ARCHIVE_BYTES:
                raise HostingError("archive_size_mismatch")
            yield chunk
        if total != expected_size:
            raise HostingError("archive_size_mismatch")
