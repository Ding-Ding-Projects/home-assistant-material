"""Tests for linked media."""

from datetime import timedelta
import json
import logging
from pathlib import Path
from typing import Any
from unittest.mock import patch

import aiohttp
from aiohttp.test_utils import TestServer
import pytest
from pytest_homeassistant.common import async_capture_events, async_fire_time_changed
from pytest_homeassistant.components.diagnostics import get_diagnostics_for_config_entry
from pytest_homeassistant.typing import ClientSessionGenerator, WebSocketGenerator

from homeassistant.components import media_source
from homeassistant.components.linked_media import handout_root, temp_root
from homeassistant.components.linked_media.address import (
    AddressClass,
    address_has_secret,
    classify_address,
    masked_address,
    parse_address,
)
from homeassistant.components.linked_media.const import DOMAIN, EVENT_FAILED, EVENT_USED
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.setup import async_setup_component
from homeassistant.util import dt as dt_util

SECRET_PASSWORD = "hunter2pass"
SECRET_QUERY = "Q7xK9mP2vL5nR8wT3yZ6"


def address(server: TestServer, path: str) -> str:
    """Return a web address on the pretend server."""
    return f"http://media.example.org:{server.port}{path}"


async def _add(
    hass_ws_client: WebSocketGenerator, hass: HomeAssistant, **data: Any
) -> dict[str, Any]:
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "linked_media/add", **data})
    response = await client.receive_json()
    assert response["success"], response
    return response["result"]


async def _added(
    hass_ws_client: WebSocketGenerator, hass: HomeAssistant, **data: Any
) -> dict[str, Any]:
    result = await _add(hass_ws_client, hass, **data)
    assert result["added"], result
    return result["file"]


def _left_over(hass: HomeAssistant) -> list[Path]:
    return [
        path
        for folder in (temp_root(hass), handout_root(hass))
        for path in folder.rglob("*")
        if path.is_file()
    ]


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        pytest.param("8.8.8.8", AddressClass.PUBLIC, id="public"),
        pytest.param("2606:4700::1111", AddressClass.PUBLIC, id="public_v6"),
        pytest.param("10.0.0.1", AddressClass.PRIVATE, id="private_10"),
        pytest.param("172.16.0.1", AddressClass.PRIVATE, id="private_172"),
        pytest.param("fd00::5", AddressClass.PRIVATE, id="private_v6"),
        pytest.param("127.0.0.1", AddressClass.BLOCKED, id="loopback"),
        pytest.param("::1", AddressClass.BLOCKED, id="loopback_v6"),
        pytest.param("::ffff:127.0.0.1", AddressClass.BLOCKED, id="mapped_loopback"),
        pytest.param("169.254.169.254", AddressClass.BLOCKED, id="link_local"),
        pytest.param("fe80::1", AddressClass.BLOCKED, id="link_local_v6"),
        pytest.param("0.0.0.0", AddressClass.BLOCKED, id="unspecified"),
        pytest.param("224.0.0.1", AddressClass.BLOCKED, id="multicast"),
        pytest.param("203.0.113.5", AddressClass.BLOCKED, id="documentation"),
        pytest.param("not an address", AddressClass.BLOCKED, id="garbage"),
    ],
)
def test_classify_address(value: str, expected: AddressClass) -> None:
    """Loopback, link-local and other special ranges are never fetched."""
    assert classify_address(value) is expected


def test_classify_own_address() -> None:
    """This system's own home network address is never fetched from."""
    assert (
        classify_address("172.16.0.1", frozenset({"172.16.0.1"}))
        is AddressClass.BLOCKED
    )


@pytest.mark.parametrize(
    ("value", "masked", "secret"),
    [
        pytest.param(
            "https://example.org/sounds/chime.mp3",
            "https://example.org/sounds/chime.mp3",
            False,
            id="plain",
        ),
        pytest.param(
            "https://user:pass@example.org/a.mp3",
            "https://example.org/…",
            True,
            id="sign_in",
        ),
        pytest.param(
            "https://example.org/a.mp3?sig=abc",
            "https://example.org/…",
            True,
            id="query",
        ),
        pytest.param(
            "https://example.org/k/Q7xK9mP2vL5nR8wT3yZ6/a.mp3",
            "https://example.org/…",
            True,
            id="key_in_path",
        ),
        pytest.param(
            "http://example.org:8080/token/a.mp3",
            "http://example.org:8080/…",
            True,
            id="token_word",
        ),
    ],
)
def test_masked_address(value: str, masked: str, secret: bool) -> None:
    """A sign-in, query or key hides the rest of the address."""
    url = parse_address(value)
    assert url is not None
    assert masked_address(url) == masked
    assert address_has_secret(url) is secret


@pytest.mark.parametrize(
    "value",
    ["ftp://example.org/a.mp3", "file:///etc/passwd", "example.org/a.mp3", "http://"],
)
def test_parse_address_refuses(value: str) -> None:
    """Only http and https web addresses are accepted."""
    assert parse_address(value) is None


@pytest.mark.usefixtures("setup_linked_media")
async def test_entry_created(hass: HomeAssistant) -> None:
    """The single entry is created by the system."""
    entries = hass.config_entries.async_entries(DOMAIN)
    assert len(entries) == 1
    assert entries[0].title == "Linked media"


@pytest.mark.usefixtures("setup_linked_media")
async def test_add_check_and_stream(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    hass_client: ClientSessionGenerator,
    media_server: TestServer,
    sound: bytes,
) -> None:
    """A linked file is checked, added and streamed without a copy."""
    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {"type": "linked_media/check", "address": address(media_server, "/sound.mp3")}
    )
    check = (await client.receive_json())["result"]
    assert check["reachable"] is True
    assert check["kind"] == "audio"
    assert check["content_type"] == "audio/mpeg"
    assert check["size"] == len(sound)
    assert check["elapsed_ms"] >= 0

    used = async_capture_events(hass, EVENT_USED)
    linked = await _added(
        hass_ws_client,
        hass,
        name="Doorbell chime",
        address=address(media_server, "/sound.mp3"),
    )
    assert linked["host"] == "media.example.org"
    assert linked["kind"] == "audio"
    assert linked["status"]["stored_bytes"] == 0

    http = await hass_client()
    response = await http.get(f"/api/linked_media/file/{linked['id']}")
    assert response.status == 200
    assert response.headers["Content-Type"] == "audio/mpeg"
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert await response.read() == sound
    await hass.async_block_till_done()
    assert _left_over(hass) == []
    assert len(used) == 1
    assert used[0].data["file_id"] == linked["id"]


@pytest.mark.usefixtures("setup_linked_media")
async def test_request_headers(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    hass_client: ClientSessionGenerator,
    media_server: TestServer,
    sound: bytes,
) -> None:
    """The fetch sends a neutral user agent, no cookies and no home details."""
    linked = await _added(
        hass_ws_client,
        hass,
        name="Headers",
        address=address(media_server, "/headers.mp3"),
    )
    http = await hass_client()
    response = await http.get(
        f"/api/linked_media/file/{linked['id']}",
        headers={"Cookie": "session=abc"},
    )
    assert await response.read() == sound
    seen = media_server.app["seen_headers"][-1]
    assert seen["User-Agent"] == "HomeAssistant-LinkedMedia/1"
    assert "Cookie" not in seen
    assert "Authorization" not in seen
    assert "X-Forwarded-For" not in seen
    assert "Referer" not in seen


@pytest.mark.usefixtures("setup_linked_media")
async def test_range_request_uses_and_removes_copy(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    hass_client: ClientSessionGenerator,
    media_server: TestServer,
    sound: bytes,
) -> None:
    """A range request is served from a copy that is removed after use."""
    linked = await _added(
        hass_ws_client, hass, name="Chime", address=address(media_server, "/sound.mp3")
    )
    http = await hass_client()
    response = await http.get(
        f"/api/linked_media/file/{linked['id']}", headers={"Range": "bytes=10-19"}
    )
    assert response.status == 206
    assert await response.read() == sound[10:20]
    assert len(_left_over(hass)) == 1

    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {"type": "linked_media/status", "file_id": linked["id"]}
    )
    status = (await client.receive_json())["result"]["status"]
    assert status["readers"] == 0
    assert status["stored_bytes"] == len(sound)
    assert status["kept_until_reuse"] is False

    async_fire_time_changed(hass, dt_util.utcnow() + timedelta(seconds=31))
    await hass.async_block_till_done()
    assert _left_over(hass) == []


@pytest.mark.usefixtures("setup_linked_media")
async def test_keep_ten_minutes(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    hass_client: ClientSessionGenerator,
    media_server: TestServer,
    sound: bytes,
) -> None:
    """A kept copy is reused and removed ten minutes after its last use."""
    linked = await _added(
        hass_ws_client,
        hass,
        name="Chime",
        address=address(media_server, "/sound.mp3"),
        fetch="keep",
    )
    http = await hass_client()
    for _ in range(2):
        response = await http.get(f"/api/linked_media/file/{linked['id']}")
        assert await response.read() == sound
    assert len(_left_over(hass)) == 1

    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {"type": "linked_media/status", "file_id": linked["id"]}
    )
    status = (await client.receive_json())["result"]["status"]
    assert status["stored_bytes"] == len(sound)
    assert status["kept_until_reuse"] is True

    async_fire_time_changed(hass, dt_util.utcnow() + timedelta(seconds=599))
    await hass.async_block_till_done()
    assert len(_left_over(hass)) == 1
    async_fire_time_changed(hass, dt_util.utcnow() + timedelta(seconds=601))
    await hass.async_block_till_done()
    assert _left_over(hass) == []


async def test_left_overs_removed_at_start(
    hass: HomeAssistant,
) -> None:
    """A copy left from an earlier run is removed when linked media starts."""
    folder = temp_root(hass) / "copies"
    await hass.async_add_executor_job(lambda: folder.mkdir(parents=True))
    leftover = folder / "old.mp3"
    await hass.async_add_executor_job(leftover.write_bytes, b"old")
    assert await async_setup_component(hass, DOMAIN, {})
    await hass.async_block_till_done()
    assert _left_over(hass) == []


@pytest.mark.usefixtures("setup_linked_media")
async def test_copies_removed_at_unload(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    hass_client: ClientSessionGenerator,
    media_server: TestServer,
) -> None:
    """Every copy is removed when linked media stops."""
    linked = await _added(
        hass_ws_client,
        hass,
        name="Chime",
        address=address(media_server, "/sound.mp3"),
        fetch="keep",
    )
    http = await hass_client()
    await (await http.get(f"/api/linked_media/file/{linked['id']}")).read()
    assert len(_left_over(hass)) == 1
    entry = hass.config_entries.async_entries(DOMAIN)[0]
    assert await hass.config_entries.async_unload(entry.entry_id)
    assert not temp_root(hass).exists()


@pytest.mark.usefixtures("setup_linked_media")
async def test_size_limit_while_streaming(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    hass_client: ClientSessionGenerator,
    media_server: TestServer,
) -> None:
    """A file without a declared size is cut off when it passes the limit."""
    failed = async_capture_events(hass, EVENT_FAILED)
    linked = await _added(
        hass_ws_client,
        hass,
        name="Long",
        address=address(media_server, "/big-chunked.mp4"),
        max_size_mb=1,
    )
    http = await hass_client()
    response = await http.get(f"/api/linked_media/file/{linked['id']}")
    with pytest.raises(aiohttp.ClientPayloadError):
        await response.read()
    await hass.async_block_till_done()
    assert failed[-1].data["reason"] == "too_large"
    assert _left_over(hass) == []


@pytest.mark.usefixtures("setup_linked_media")
async def test_size_limit_for_copy(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    hass_client: ClientSessionGenerator,
    media_server: TestServer,
) -> None:
    """A copy that passes the limit is refused plainly and removed."""
    linked = await _added(
        hass_ws_client,
        hass,
        name="Long",
        address=address(media_server, "/big-chunked.mp4"),
        max_size_mb=1,
    )
    http = await hass_client()
    response = await http.get(
        f"/api/linked_media/file/{linked['id']}", headers={"Range": "bytes=0-9"}
    )
    assert response.status == 413
    assert "too_large" in await response.text()
    await hass.async_block_till_done()
    assert _left_over(hass) == []


@pytest.mark.parametrize(
    ("path", "reason"),
    [
        pytest.param("/big.mp4", "too_large", id="declared_too_large"),
        pytest.param("/page.html", "unsupported_type", id="web_page"),
        pytest.param("/picture.svg", "unsupported_type", id="svg"),
        pytest.param("/list.m3u8", "playlist_not_supported", id="playlist"),
        pytest.param("/missing.mp3", "not_found", id="not_found"),
        pytest.param("/loop", "too_many_redirects", id="redirect_loop"),
    ],
)
@pytest.mark.usefixtures("setup_linked_media")
async def test_add_refused(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    media_server: TestServer,
    path: str,
    reason: str,
) -> None:
    """An address that does not hold a usable media file is not added."""
    result = await _add(
        hass_ws_client,
        hass,
        name="Wrong",
        address=address(media_server, path),
        max_size_mb=1,
    )
    assert result["added"] is False
    assert result["check"]["reason"] == reason


@pytest.mark.usefixtures("setup_linked_media")
async def test_kind_from_name_when_type_is_generic(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator, media_server: TestServer
) -> None:
    """A generic content type falls back to the file name."""
    linked = await _added(
        hass_ws_client, hass, name="Clip", address=address(media_server, "/clip.mp4")
    )
    assert linked["kind"] == "video"
    assert linked["content_type"] == "video/mp4"


@pytest.mark.usefixtures("setup_linked_media")
async def test_timeout(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator, media_server: TestServer
) -> None:
    """An address that does not answer in time gives a plain reason."""
    with patch("homeassistant.components.linked_media.manager.CHECK_TIMEOUT", 0.3):
        result = await _add(
            hass_ws_client,
            hass,
            name="Slow",
            address=address(media_server, "/slow.mp3"),
        )
    assert result["check"]["reason"] == "timeout"


@pytest.mark.usefixtures("setup_linked_media")
async def test_redirect_followed(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator, media_server: TestServer
) -> None:
    """A redirect on the same server is followed."""
    linked = await _added(
        hass_ws_client, hass, name="Moved", address=address(media_server, "/moved")
    )
    assert linked["kind"] == "audio"


@pytest.mark.usefixtures("setup_linked_media")
async def test_redirect_to_internal_refused(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator, media_server: TestServer
) -> None:
    """A redirect to a home network address is refused, as the first hop is."""
    result = await _add(
        hass_ws_client,
        hass,
        name="Sneaky",
        address=address(media_server, "/moved-inside"),
    )
    assert result["check"]["reason"] == "internal_address"


@pytest.mark.usefixtures("setup_linked_media")
@pytest.mark.parametrize("address_classes", [{"127.0.0.1": AddressClass.PRIVATE}])
async def test_internal_needs_switch(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    media_server: TestServer,
) -> None:
    """A home network address is fetched only with the per-file switch on."""
    refused = await _add(
        hass_ws_client, hass, name="Nas", address=address(media_server, "/sound.mp3")
    )
    assert refused["check"]["reason"] == "internal_address"
    linked = await _added(
        hass_ws_client,
        hass,
        name="Nas",
        address=address(media_server, "/sound.mp3"),
        home_network=True,
    )
    assert linked["home_network"] is True


@pytest.mark.parametrize(
    "target",
    [
        pytest.param("http://127.0.0.4/sound.mp3", id="loopback_literal"),
        pytest.param("http://[::1]/sound.mp3", id="loopback_v6_literal"),
        pytest.param("http://loopback.example.org/sound.mp3", id="loopback_name"),
        pytest.param("http://169.254.169.254/latest", id="link_local"),
    ],
)
@pytest.mark.usefixtures("setup_linked_media")
async def test_loopback_always_refused(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator, target: str
) -> None:
    """Loopback and link-local addresses are refused even with the switch on."""
    result = await _add(
        hass_ws_client, hass, name="Inside", address=target, home_network=True
    )
    assert result["check"]["reason"] == "blocked_address"


@pytest.mark.usefixtures("setup_linked_media")
async def test_secret_address_never_shown(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    hass_client: ClientSessionGenerator,
    hass_read_only_access_token: str,
    media_server: TestServer,
    caplog: pytest.LogCaptureFixture,
    sound: bytes,
) -> None:
    """An address with a password or key is never returned, logged or diagnosed."""
    caplog.set_level(logging.DEBUG)
    secret = (
        f"http://viewer:{SECRET_PASSWORD}@media.example.org:{media_server.port}"
        f"/sometimes.mp3?token={SECRET_QUERY}"
    )
    added = await _add(hass_ws_client, hass, name="Private", address=secret)
    assert added["added"]
    linked = added["file"]
    assert linked["address_hidden"] is True
    assert linked["address"] == f"http://media.example.org:{media_server.port}/…"

    client = await hass_ws_client(hass)
    responses: list[Any] = [added]
    for message in (
        {"type": "linked_media/list"},
        {"type": "linked_media/status", "file_id": linked["id"]},
        {"type": "linked_media/check", "file_id": linked["id"]},
        {"type": "linked_media/update", "file_id": linked["id"], "name": "Renamed"},
    ):
        await client.send_json_auto_id(message)
        responses.append(await client.receive_json())

    reader = await hass_ws_client(hass, hass_read_only_access_token)
    await reader.send_json_auto_id({"type": "linked_media/list"})
    read_only = await reader.receive_json()
    responses.append(read_only)
    assert "address" not in read_only["result"]["files"][0]

    http = await hass_client()
    assert await (await http.get(f"/api/linked_media/file/{linked['id']}")).read() == (
        sound
    )
    entry = hass.config_entries.async_entries(DOMAIN)[0]
    responses.append(await get_diagnostics_for_config_entry(hass, hass_client, entry))

    # A failure is logged, and the log names only the host.
    media_server.app["state"]["gone"] = True
    await client.send_json_auto_id(
        {"type": "linked_media/check", "file_id": linked["id"]}
    )
    responses.append(await client.receive_json())
    own_logs = [
        record.getMessage()
        for record in caplog.records
        if record.name.startswith("homeassistant.components.linked_media")
    ]
    assert any("media.example.org" in line for line in own_logs)
    text = json.dumps(responses) + "\n".join(own_logs)
    assert SECRET_PASSWORD not in text
    assert SECRET_QUERY not in text


@pytest.mark.usefixtures("setup_linked_media")
async def test_read_only_user_cannot_change(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    hass_read_only_access_token: str,
    media_server: TestServer,
) -> None:
    """Only an admin adds, checks, changes or removes linked files."""
    reader = await hass_ws_client(hass, hass_read_only_access_token)
    for message in (
        {"type": "linked_media/add", "name": "x", "address": "https://example.org/a"},
        {"type": "linked_media/check", "address": "https://example.org/a.mp3"},
        {"type": "linked_media/update", "file_id": "x", "name": "y"},
        {"type": "linked_media/remove", "file_id": "x"},
    ):
        await reader.send_json_auto_id(message)
        response = await reader.receive_json()
        assert response["success"] is False
        assert response["error"]["code"] == "unauthorized"


@pytest.mark.usefixtures("setup_linked_media")
async def test_update_and_remove(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    hass_client: ClientSessionGenerator,
    media_server: TestServer,
) -> None:
    """Changing the rule drops a kept copy and removing drops the file."""
    linked = await _added(
        hass_ws_client,
        hass,
        name="Chime",
        address=address(media_server, "/sound.mp3"),
        fetch="keep",
    )
    http = await hass_client()
    await (await http.get(f"/api/linked_media/file/{linked['id']}")).read()
    assert len(_left_over(hass)) == 1

    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "linked_media/update",
            "file_id": linked["id"],
            "fetch": "each_time",
            "max_size_mb": 50,
        }
    )
    updated = (await client.receive_json())["result"]
    assert updated["fetch"] == "each_time"
    assert updated["max_size_mb"] == 50
    assert _left_over(hass) == []

    await client.send_json_auto_id(
        {"type": "linked_media/remove", "file_id": linked["id"]}
    )
    assert (await client.receive_json())["success"]
    await client.send_json_auto_id({"type": "linked_media/list"})
    assert (await client.receive_json())["result"]["files"] == []
    response = await http.get(f"/api/linked_media/file/{linked['id']}")
    assert response.status == 404


@pytest.mark.usefixtures("setup_linked_media")
async def test_failure_is_recorded(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    hass_client: ClientSessionGenerator,
    media_server: TestServer,
) -> None:
    """When the address stops answering, the row says when and why."""
    failed = async_capture_events(hass, EVENT_FAILED)
    linked = await _added(
        hass_ws_client,
        hass,
        name="News",
        address=address(media_server, "/sometimes.mp3"),
    )
    media_server.app["state"]["gone"] = True
    http = await hass_client()
    response = await http.get(f"/api/linked_media/file/{linked['id']}")
    assert response.status == 404
    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {"type": "linked_media/status", "file_id": linked["id"]}
    )
    status = (await client.receive_json())["result"]
    assert status["reachable"] is False
    assert status["last_failure_reason"] == "not_found"
    assert status["last_failure_status"] == 404
    assert status["last_failure_at"] is not None
    assert failed[-1].data == {
        "file_id": linked["id"],
        "name": "News",
        "reason": "not_found",
        "status": 404,
    }


@pytest.mark.usefixtures("setup_linked_media")
async def test_media_source(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    media_server: TestServer,
) -> None:
    """A linked file is browsed and resolved like any media file."""
    linked = await _added(
        hass_ws_client, hass, name="Chime", address=address(media_server, "/sound.mp3")
    )
    browse = await media_source.async_browse_media(
        hass, f"{media_source.URI_SCHEME}{DOMAIN}"
    )
    assert [child.title for child in browse.children] == ["Chime"]
    assert browse.children[0].can_play

    resolved = await media_source.async_resolve_media(
        hass,
        f"{media_source.URI_SCHEME}{DOMAIN}/{linked['id']}",
        "media_player.kitchen",
    )
    assert resolved.url == f"/api/linked_media/file/{linked['id']}"
    assert resolved.mime_type == "audio/mpeg"


@pytest.mark.usefixtures("setup_linked_media")
async def test_player_named_in_status(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    hass_client: ClientSessionGenerator,
    media_server: TestServer,
) -> None:
    """The player that asked for the file is recorded as its last user."""
    linked = await _added(
        hass_ws_client, hass, name="Chime", address=address(media_server, "/sound.mp3")
    )
    await media_source.async_resolve_media(
        hass,
        f"{media_source.URI_SCHEME}{DOMAIN}/{linked['id']}",
        "media_player.kitchen",
    )
    http = await hass_client()
    await (await http.get(f"/api/linked_media/file/{linked['id']}")).read()
    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {"type": "linked_media/status", "file_id": linked["id"]}
    )
    status = (await client.receive_json())["result"]
    assert status["last_used_by"] == "media_player.kitchen"
    assert status["status"]["in_use"] is False


@pytest.mark.usefixtures("setup_linked_media")
async def test_fetch_and_release_services(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    media_server: TestServer,
    sound: bytes,
) -> None:
    """The fetch action hands out a real file that release removes."""
    linked = await _added(
        hass_ws_client, hass, name="Chime", address=address(media_server, "/sound.mp3")
    )
    response = await hass.services.async_call(
        DOMAIN,
        "fetch",
        {"file_id": linked["id"], "seconds": 60},
        blocking=True,
        return_response=True,
    )
    path = Path(response["path"])
    assert await hass.async_add_executor_job(path.read_bytes) == sound
    assert response["content_type"] == "audio/mpeg"
    assert response["size"] == len(sound)

    released = await hass.services.async_call(
        DOMAIN, "release", {"path": str(path)}, blocking=True, return_response=True
    )
    assert released == {"released": True}
    assert _left_over(hass) == []


@pytest.mark.usefixtures("setup_linked_media")
async def test_fetched_file_expires(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    media_server: TestServer,
) -> None:
    """A handed out file is removed after its time."""
    linked = await _added(
        hass_ws_client, hass, name="Chime", address=address(media_server, "/sound.mp3")
    )
    await hass.services.async_call(
        DOMAIN,
        "fetch",
        {"file_id": linked["id"], "seconds": 30},
        blocking=True,
        return_response=True,
    )
    assert len(_left_over(hass)) == 1
    async_fire_time_changed(hass, dt_util.utcnow() + timedelta(seconds=31))
    await hass.async_block_till_done()
    assert _left_over(hass) == []


@pytest.mark.usefixtures("setup_linked_media")
async def test_fetch_service_failure(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    media_server: TestServer,
) -> None:
    """The fetch action says plainly why a file could not be fetched."""
    linked = await _added(
        hass_ws_client,
        hass,
        name="Long",
        address=address(media_server, "/big-chunked.mp4"),
        max_size_mb=1,
    )
    with pytest.raises(HomeAssistantError) as err:
        await hass.services.async_call(
            DOMAIN,
            "fetch",
            {"file_id": linked["id"]},
            blocking=True,
            return_response=True,
        )
    assert err.value.translation_placeholders == {"name": "Long", "reason": "too_large"}
    assert _left_over(hass) == []


async def test_fetched_file_is_in_an_allowed_folder(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    media_server: TestServer,
) -> None:
    """A handed out file sits hidden in the local media folder Core allows."""
    media_dir = hass.config.media_dirs["local"]
    # Core allows the media folders by default; the test config starts empty.
    hass.config.allowlist_external_dirs = {media_dir}
    assert await async_setup_component(hass, DOMAIN, {})
    await hass.async_block_till_done()
    linked = await _added(
        hass_ws_client, hass, name="Chime", address=address(media_server, "/sound.mp3")
    )
    response = await hass.services.async_call(
        DOMAIN,
        "fetch",
        {"file_id": linked["id"]},
        blocking=True,
        return_response=True,
    )
    path = Path(response["path"])
    assert path.relative_to(media_dir).parts[0] == ".linked_media"
    assert await hass.async_add_executor_job(hass.config.is_allowed_path, str(path))

    entry = hass.config_entries.async_entries(DOMAIN)[0]
    assert await hass.config_entries.async_unload(entry.entry_id)
    assert not await hass.async_add_executor_job(handout_root(hass).exists)


async def test_handed_out_left_overs_removed_at_start(hass: HomeAssistant) -> None:
    """A handed out file left from an earlier run is removed at start."""
    folder = handout_root(hass) / "old"
    await hass.async_add_executor_job(lambda: folder.mkdir(parents=True))
    await hass.async_add_executor_job((folder / "old.mp3").write_bytes, b"old")
    assert await async_setup_component(hass, DOMAIN, {})
    await hass.async_block_till_done()
    assert _left_over(hass) == []


@pytest.mark.usefixtures("setup_linked_media")
async def test_live_stream_passes_through(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    hass_client: ClientSessionGenerator,
    media_server: TestServer,
) -> None:
    """A sound with no length is a live stream: no size limit and no copy."""
    linked = await _added(
        hass_ws_client,
        hass,
        name="Radio",
        address=address(media_server, "/radio.mp3"),
        max_size_mb=1,
        fetch="keep",
    )
    assert linked["live"] is True

    http = await hass_client()
    response = await http.get(
        f"/api/linked_media/file/{linked['id']}", headers={"Range": "bytes=0-"}
    )
    assert response.status == 200
    assert response.headers["Accept-Ranges"] == "none"
    received = 0
    while received <= 3 * 1024 * 1024:
        received += len(await response.content.readany())
    assert _left_over(hass) == []

    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {"type": "linked_media/status", "file_id": linked["id"]}
    )
    status = (await client.receive_json())["result"]
    assert status["status"]["in_use"] is True
    assert status["status"]["stored_bytes"] == 0

    response.close()
    media_server.app["state"]["radio_closed"].set()
    await hass.async_block_till_done()
    assert _left_over(hass) == []
    assert status["last_failure_reason"] is None


@pytest.mark.usefixtures("setup_linked_media")
async def test_live_stream_has_no_position(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    hass_client: ClientSessionGenerator,
    media_server: TestServer,
) -> None:
    """A player that asks for a position in a live stream gets a plain answer."""
    linked = await _added(
        hass_ws_client, hass, name="Radio", address=address(media_server, "/radio.mp3")
    )
    http = await hass_client()
    response = await http.get(
        f"/api/linked_media/file/{linked['id']}", headers={"Range": "bytes=100-"}
    )
    assert response.status == 416
    assert "live_no_position" in await response.text()
    assert _left_over(hass) == []


@pytest.mark.usefixtures("setup_linked_media")
async def test_live_stream_idle_timeout(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    hass_client: ClientSessionGenerator,
    media_server: TestServer,
) -> None:
    """A live stream that goes quiet is stopped by the idle timeout."""
    failed = async_capture_events(hass, EVENT_FAILED)
    linked = await _added(
        hass_ws_client, hass, name="Radio", address=address(media_server, "/radio.mp3")
    )
    media_server.app["state"]["radio_quiet_after"] = 512 * 1024
    http = await hass_client()
    with patch("homeassistant.components.linked_media.fetch.READ_IDLE_TIMEOUT", 0.3):
        response = await http.get(f"/api/linked_media/file/{linked['id']}")
        with pytest.raises(aiohttp.ClientPayloadError):
            await response.read()
    await hass.async_block_till_done()
    assert failed[-1].data["reason"] == "timeout"
    assert _left_over(hass) == []


@pytest.mark.usefixtures("setup_linked_media")
async def test_live_stream_is_not_handed_out(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    media_server: TestServer,
) -> None:
    """The fetch action says plainly that a live stream cannot be a file."""
    linked = await _added(
        hass_ws_client, hass, name="Radio", address=address(media_server, "/radio.mp3")
    )
    with pytest.raises(HomeAssistantError) as err:
        await hass.services.async_call(
            DOMAIN,
            "fetch",
            {"file_id": linked["id"]},
            blocking=True,
            return_response=True,
        )
    assert err.value.translation_placeholders == {
        "name": "Radio",
        "reason": "live_stream",
    }
    assert _left_over(hass) == []
