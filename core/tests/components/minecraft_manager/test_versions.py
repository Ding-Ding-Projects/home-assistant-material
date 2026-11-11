"""Tests for version discovery."""

from typing import Any

import pytest

from homeassistant.components.minecraft_manager.const import (
    MOJANG_MANIFEST_URL,
    PAPER_VERSIONS_URL,
)
from homeassistant.components.minecraft_manager.versions import (
    VersionError,
    VersionStore,
    parse_mojang_manifest,
    parse_paper_versions,
)
from homeassistant.core import HomeAssistant

from tests.test_util.aiohttp import AiohttpClientMocker

MANIFEST: dict[str, Any] = {
    "versions": [
        {"id": "25w45a", "type": "snapshot", "releaseTime": "2026-11-05T10:00:00+00:00"},
        {"id": "1.21.4", "type": "release", "releaseTime": "2024-12-03T10:12:57+00:00"},
        {"id": "b1.7.3", "type": "old_beta", "releaseTime": "2011-07-08T00:00:00+00:00"},
        {"id": "1.21; rm -rf", "type": "release"},
        "junk",
    ]
}


def test_parse_mojang_keeps_releases_and_snapshots_only() -> None:
    """Old types, hostile ids and junk are dropped."""
    assert parse_mojang_manifest(MANIFEST) == [
        {"id": "25w45a", "type": "snapshot", "released": "2026-11-05"},
        {"id": "1.21.4", "type": "release", "released": "2024-12-03"},
    ]


def test_parse_paper_newest_first_and_validated() -> None:
    """The list is reversed and an invalid id is dropped."""
    result = parse_paper_versions({"versions": ["1.20", "1.21; id", "1.21.4"]})
    assert [item["id"] for item in result] == ["1.21.4", "1.20"]


@pytest.mark.parametrize("data", [None, [], {}, {"versions": "x"}, {"versions": []}])
def test_parse_rejects_bad_shapes(data: Any) -> None:
    """An unexpected shape is an error, not an empty list."""
    with pytest.raises(VersionError):
        parse_mojang_manifest(data)
    with pytest.raises(VersionError):
        parse_paper_versions(data)


async def test_refresh_caches_with_time(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker
) -> None:
    """A refresh fetches both fixed hosts and stores the time."""
    aioclient_mock.get(MOJANG_MANIFEST_URL, json=MANIFEST)
    aioclient_mock.get(PAPER_VERSIONS_URL, json={"versions": ["1.21.4"]})
    store = VersionStore(hass)
    assert store.cached()["fetched_at"] is None
    data = await store.async_refresh()
    assert data["fetched_at"]
    assert data["paper"] == [{"id": "1.21.4", "type": "release"}]
    assert aioclient_mock.call_count == 2


async def test_redirect_is_refused(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker
) -> None:
    """A redirect to another host is never followed."""
    aioclient_mock.get(
        MOJANG_MANIFEST_URL, status=302, headers={"Location": "https://example.com/x"}
    )
    store = VersionStore(hass)
    with pytest.raises(VersionError) as error:
        await store.async_refresh()
    assert error.value.code == "redirect_refused"
    assert aioclient_mock.call_count == 1
    assert store.cached()["fetched_at"] is None


async def test_oversized_response_is_refused(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker
) -> None:
    """A body over the size cap is dropped."""
    aioclient_mock.get(MOJANG_MANIFEST_URL, content=b"x" * (4 * 1024 * 1024 + 10))
    with pytest.raises(VersionError) as error:
        await VersionStore(hass).async_refresh()
    assert error.value.code == "too_large"


async def test_failed_second_host_keeps_old_cache(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker
) -> None:
    """Nothing is cached unless both lookups succeed."""
    aioclient_mock.get(MOJANG_MANIFEST_URL, json=MANIFEST)
    aioclient_mock.get(PAPER_VERSIONS_URL, status=500)
    store = VersionStore(hass)
    with pytest.raises(VersionError):
        await store.async_refresh()
    assert store.cached()["vanilla"] == []
