"""Fixtures for linked media tests.

A local pretend web server stands in for the web. Every name resolves to the
loopback address of that server, and the address check is told which loopback
addresses count as public or home network for each test.
"""

import asyncio
from collections.abc import AsyncIterator, Iterator
import socket
from typing import Any
from unittest.mock import patch

from aiohttp import web
from aiohttp.test_utils import TestServer
import pytest

from homeassistant.components.linked_media.address import AddressClass, classify_address
from homeassistant.components.linked_media.const import DOMAIN
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component

SOUND = bytes(range(256)) * 200
BIG_CHUNK = b"\0" * (256 * 1024)
BIG_CHUNKS = 8


async def _sound(request: web.Request) -> web.Response:
    return web.Response(body=SOUND, content_type="audio/mpeg")


async def _clip(request: web.Request) -> web.Response:
    return web.Response(body=SOUND, content_type="application/octet-stream")


async def _big_unknown_length(request: web.Request) -> web.StreamResponse:
    response = web.StreamResponse(headers={"Content-Type": "audio/mpeg"})
    response.enable_chunked_encoding()
    await response.prepare(request)
    for _ in range(BIG_CHUNKS):
        await response.write(BIG_CHUNK)
    await response.write_eof()
    return response


async def _big_declared(request: web.Request) -> web.Response:
    return web.Response(body=BIG_CHUNK * BIG_CHUNKS, content_type="video/mp4")


async def _page(request: web.Request) -> web.Response:
    return web.Response(text="<html></html>", content_type="text/html")


async def _playlist(request: web.Request) -> web.Response:
    return web.Response(text="#EXTM3U\n", content_type="application/vnd.apple.mpegurl")


async def _svg(request: web.Request) -> web.Response:
    return web.Response(text="<svg/>", content_type="image/svg+xml")


async def _slow(request: web.Request) -> web.Response:
    await asyncio.sleep(5)
    return web.Response(body=SOUND, content_type="audio/mpeg")


async def _redirect_same(request: web.Request) -> web.Response:
    raise web.HTTPFound("/sound.mp3")


async def _redirect_internal(request: web.Request) -> web.Response:
    raise web.HTTPFound(f"http://internal.example.org:{request.url.port}/sound.mp3")


async def _redirect_loop(request: web.Request) -> web.Response:
    raise web.HTTPFound("/loop")


async def _sometimes(request: web.Request) -> web.Response:
    if request.app["state"]["gone"]:
        raise web.HTTPNotFound
    return web.Response(body=SOUND, content_type="audio/mpeg")


async def _echo_headers(request: web.Request) -> web.Response:
    request.app["seen_headers"].append(dict(request.headers))
    return web.Response(body=SOUND, content_type="audio/mpeg")


@pytest.fixture
async def media_server() -> AsyncIterator[TestServer]:
    """Run the pretend web server."""
    app = web.Application()
    app["seen_headers"] = []
    app["state"] = {"gone": False}
    app.router.add_get("/sound.mp3", _sound)
    app.router.add_get("/clip.mp4", _clip)
    app.router.add_get("/big.mp3", _big_unknown_length)
    app.router.add_get("/big.mp4", _big_declared)
    app.router.add_get("/page.html", _page)
    app.router.add_get("/list.m3u8", _playlist)
    app.router.add_get("/picture.svg", _svg)
    app.router.add_get("/slow.mp3", _slow)
    app.router.add_get("/moved", _redirect_same)
    app.router.add_get("/moved-inside", _redirect_internal)
    app.router.add_get("/loop", _redirect_loop)
    app.router.add_get("/headers.mp3", _echo_headers)
    app.router.add_get("/sometimes.mp3", _sometimes)
    server = TestServer(app, host="127.0.0.1")
    await server.start_server()
    yield server
    await server.close()


@pytest.fixture
def address_classes() -> dict[str, AddressClass]:
    """Return how each loopback address is classed in a test."""
    return {"127.0.0.1": AddressClass.PUBLIC, "127.0.0.2": AddressClass.PRIVATE}


@pytest.fixture
def resolved() -> dict[str, str]:
    """Return what each name resolves to; any other name is the server."""
    return {
        "internal.example.org": "127.0.0.2",
        "loopback.example.org": "127.0.0.3",
    }


@pytest.fixture(autouse=True)
def pretend_network(
    address_classes: dict[str, AddressClass], resolved: dict[str, str]
) -> Iterator[None]:
    """Resolve every name locally and class the loopback addresses per test."""

    async def _getaddrinfo(host: str, port: int) -> list[tuple[Any, ...]]:
        address = resolved.get(host, "127.0.0.1")
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (address, port))]

    def _classify(value: str, own: frozenset[str] = frozenset()) -> AddressClass:
        if value in address_classes:
            return address_classes[value]
        return classify_address(value, own)

    with (
        patch("homeassistant.components.linked_media.fetch._getaddrinfo", _getaddrinfo),
        patch(
            "homeassistant.components.linked_media.fetch.classify_address", _classify
        ),
    ):
        yield


@pytest.fixture
async def setup_linked_media(hass: HomeAssistant) -> None:
    """Set up linked media."""
    assert await async_setup_component(hass, DOMAIN, {})
    await hass.async_block_till_done()


@pytest.fixture
def sound() -> bytes:
    """Return the bytes of the pretend sound file."""
    return SOUND
