"""Fetch a linked file from its web address, safely.

Only addresses the owner added are fetched. Every hop of a redirect is checked,
names are resolved once and the connection goes to the checked address, so a
name cannot point somewhere else between the check and the connection.
"""

import asyncio
from collections.abc import AsyncIterator
from dataclasses import dataclass
import ipaddress
import mimetypes
import socket
import time
from typing import Any

import aiohttp
from aiohttp.abc import AbstractResolver, ResolveResult
from yarl import URL

from .address import AddressClass, classify_address, parse_address
from .const import (
    CHUNK_SIZE,
    CONNECT_TIMEOUT,
    KIND_AUDIO,
    KIND_IMAGE,
    KIND_VIDEO,
    MAX_REDIRECTS,
    READ_IDLE_TIMEOUT,
    USER_AGENT,
    FailureReason,
)

PLAYLIST_TYPES = frozenset(
    {
        "application/vnd.apple.mpegurl",
        "application/x-mpegurl",
        "audio/mpegurl",
        "audio/x-mpegurl",
        "audio/x-scpls",
        "application/dash+xml",
    }
)
REFUSED_TYPES = frozenset({"image/svg+xml"})
GENERIC_TYPES = frozenset({"", "application/octet-stream", "binary/octet-stream"})
REDIRECT_STATUSES = frozenset({301, 302, 303, 307, 308})

REQUEST_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "audio/*, video/*, image/*;q=0.9, */*;q=0.1",
    "Accept-Encoding": "identity",
}


class FetchError(Exception):
    """A linked file could not be fetched, with a plain reason."""

    def __init__(self, reason: FailureReason, status: int | None = None) -> None:
        """Keep the reason and the status the server answered with."""
        super().__init__(reason.value)
        self.reason = reason
        self.status = status


def kind_for_type(content_type: str) -> str | None:
    """Return the media kind for a content type, or None when not allowed."""
    if content_type in REFUSED_TYPES or content_type in PLAYLIST_TYPES:
        return None
    main = content_type.split("/", 1)[0]
    if main == "audio":
        return KIND_AUDIO
    if main == "video":
        return KIND_VIDEO
    if main == "image":
        return KIND_IMAGE
    return None


def media_type_for(header: str | None, url: URL) -> tuple[str, str]:
    """Return the content type and kind of a response, or raise FetchError."""
    content_type = (header or "").split(";", 1)[0].strip().lower()
    if content_type in GENERIC_TYPES:
        content_type = (mimetypes.guess_type(url.path)[0] or "").lower()
    if content_type in PLAYLIST_TYPES:
        raise FetchError(FailureReason.PLAYLIST_NOT_SUPPORTED)
    if (kind := kind_for_type(content_type)) is None:
        raise FetchError(FailureReason.UNSUPPORTED_TYPE)
    return content_type, kind


async def _getaddrinfo(host: str, port: int) -> list[tuple[Any, ...]]:
    """Resolve a name with the system resolver."""
    loop = asyncio.get_running_loop()
    return await loop.getaddrinfo(
        host, port, type=socket.SOCK_STREAM, proto=socket.IPPROTO_TCP
    )


def _allowed(cls: AddressClass, home_network: bool) -> FailureReason | None:
    if cls is AddressClass.PUBLIC:
        return None
    if cls is AddressClass.PRIVATE:
        return None if home_network else FailureReason.INTERNAL_ADDRESS
    return FailureReason.BLOCKED_ADDRESS


class CheckedResolver(AbstractResolver):
    """Resolve once and hand back only addresses that passed the check."""

    def __init__(self, home_network: bool, own_addresses: frozenset[str]) -> None:
        """Keep the policy for this fetch."""
        self.home_network = home_network
        self.own_addresses = own_addresses
        self.refused: FailureReason | None = None

    async def resolve(
        self, host: str, port: int = 0, family: socket.AddressFamily = socket.AF_INET
    ) -> list[ResolveResult]:
        """Resolve a name and refuse it if any address is not allowed."""
        infos = await _getaddrinfo(host, port)
        results: list[ResolveResult] = []
        for fam, _type, proto, _canon, sockaddr in infos:
            address = sockaddr[0]
            if reason := _allowed(
                classify_address(address, self.own_addresses), self.home_network
            ):
                self.refused = reason
                raise OSError("address refused")
            results.append(
                ResolveResult(
                    hostname=host,
                    host=address,
                    port=sockaddr[1],
                    family=fam,
                    proto=proto,
                    flags=socket.AI_NUMERICHOST,
                )
            )
        if not results:
            raise OSError("no address")
        return results

    async def close(self) -> None:
        """Nothing to close."""


def _check_url(url: URL, home_network: bool, own_addresses: frozenset[str]) -> None:
    """Refuse a hop that is not a web address or names a refused literal."""
    if url.scheme not in ("http", "https") or not url.host:
        raise FetchError(FailureReason.INVALID_ADDRESS)
    try:
        ipaddress.ip_address(url.host)
    except ValueError:
        return
    if reason := _allowed(classify_address(url.host, own_addresses), home_network):
        raise FetchError(reason)


@dataclass(slots=True)
class OpenedFile:
    """An answered request whose body has not been read yet."""

    session: aiohttp.ClientSession
    response: aiohttp.ClientResponse
    content_type: str
    kind: str
    size: int | None
    max_bytes: int
    elapsed: float

    @property
    def live(self) -> bool:
        """Return True for a sound with no length, such as internet radio."""
        return self.size is None and self.kind == KIND_AUDIO

    async def iter_chunks(self) -> AsyncIterator[bytes]:
        """Yield the body, stopping when the size limit is passed.

        A live stream has no end, so it has no size limit; the idle timeout
        still stops it when the server goes quiet.
        """
        received = 0
        live = self.live
        try:
            async for chunk in self.response.content.iter_chunked(CHUNK_SIZE):
                received += len(chunk)
                if not live and received > self.max_bytes:
                    raise FetchError(FailureReason.TOO_LARGE)
                yield chunk
        except TimeoutError as err:
            raise FetchError(FailureReason.TIMEOUT) from err
        except aiohttp.ClientError as err:
            raise FetchError(FailureReason.CANNOT_CONNECT) from err

    async def close(self) -> None:
        """Close the response and its session."""
        self.response.close()
        await self.session.close()


def _checked_size(size: int | None, max_bytes: int) -> int | None:
    """Refuse a declared size over the limit before any body is read."""
    if size is not None and size > max_bytes:
        raise FetchError(FailureReason.TOO_LARGE)
    return size


async def async_open(
    address: str,
    *,
    home_network: bool,
    own_addresses: frozenset[str],
    max_bytes: int,
    total_timeout: float | None,
) -> OpenedFile:
    """Open a linked file and check its answer before any body is read."""
    if (url := parse_address(address)) is None:
        raise FetchError(FailureReason.INVALID_ADDRESS)
    resolver = CheckedResolver(home_network, own_addresses)
    connector = aiohttp.TCPConnector(resolver=resolver, use_dns_cache=False)
    session = aiohttp.ClientSession(
        connector=connector,
        cookie_jar=aiohttp.DummyCookieJar(),
        trust_env=False,
        auto_decompress=False,
        timeout=aiohttp.ClientTimeout(
            total=total_timeout, connect=CONNECT_TIMEOUT, sock_read=READ_IDLE_TIMEOUT
        ),
    )
    started = time.monotonic()
    try:
        response = await _follow(session, url, resolver, home_network, own_addresses)
        try:
            content_type, kind = media_type_for(
                response.headers.get("Content-Type"), response.url
            )
            size = _checked_size(response.content_length, max_bytes)
        except BaseException:
            response.close()
            raise
    except BaseException:
        await session.close()
        raise
    return OpenedFile(
        session=session,
        response=response,
        content_type=content_type,
        kind=kind,
        size=size,
        max_bytes=max_bytes,
        elapsed=time.monotonic() - started,
    )


async def _follow(
    session: aiohttp.ClientSession,
    url: URL,
    resolver: CheckedResolver,
    home_network: bool,
    own_addresses: frozenset[str],
) -> aiohttp.ClientResponse:
    """Send the request, following a few redirects and checking each hop."""
    for _hop in range(MAX_REDIRECTS + 1):
        _check_url(url, home_network, own_addresses)
        try:
            response = await session.get(
                url, headers=REQUEST_HEADERS, allow_redirects=False
            )
        except TimeoutError as err:
            raise FetchError(FailureReason.TIMEOUT) from err
        except aiohttp.ClientError as err:
            if resolver.refused is not None:
                raise FetchError(resolver.refused) from err
            raise FetchError(FailureReason.CANNOT_CONNECT) from err
        if response.status in REDIRECT_STATUSES:
            location = response.headers.get("Location")
            response.close()
            if not location:
                raise FetchError(FailureReason.HTTP_ERROR, response.status)
            try:
                url = url.join(URL(location))
            except ValueError as err:
                raise FetchError(FailureReason.INVALID_ADDRESS) from err
            continue
        if response.status in (404, 410):
            response.close()
            raise FetchError(FailureReason.NOT_FOUND, response.status)
        if response.status >= 400 or response.status < 200:
            response.close()
            raise FetchError(FailureReason.HTTP_ERROR, response.status)
        return response
    raise FetchError(FailureReason.TOO_MANY_REDIRECTS)
