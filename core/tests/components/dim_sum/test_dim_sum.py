"""Tests for the dim sum manager, command and view."""

from datetime import timedelta

from freezegun.api import FrozenDateTimeFactory
import pytest

from homeassistant.components.dim_sum.const import CATALOG_URL, REFRESH_INTERVAL
from homeassistant.components.dim_sum.manager import (
    DATA_MANAGER,
    DimSumManager,
    valid_picture_id,
)
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from homeassistant.util import dt as dt_util

from pytest_homeassistant.common import async_fire_time_changed
from pytest_homeassistant.test_util.aiohttp import AiohttpClientMocker
from pytest_homeassistant.typing import ClientSessionGenerator, WebSocketGenerator

from .conftest import PNG, dish, mock_catalog, mock_offline, mock_picture, release


def first(items: list) -> object:
    """Choose the first item so a test is repeatable."""
    return items[0]


async def test_start_warms_the_cache_in_the_background(
    hass: HomeAssistant, online: None
) -> None:
    """After start the catalogue and its source are cached and pictures are ready."""
    manager = hass.data[DATA_MANAGER]
    assert [d["id"] for d in manager.dishes] == ["hk-dish-0001", "hk-dish-0002"]
    assert manager.source["source_url"] == CATALOG_URL
    assert len(manager.source["revision"]) == 16
    assert await manager.async_picture("hk-dish-0001") == PNG


async def test_refresh_at_most_once_a_day(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker, online: None
) -> None:
    """A second refresh within a day makes no request, a forced one does."""
    manager = hass.data[DATA_MANAGER]
    calls = aioclient_mock.call_count
    assert await manager.async_refresh() is False
    assert aioclient_mock.call_count == calls
    assert await manager.async_refresh(force=True) is True
    assert aioclient_mock.call_count > calls


async def test_refresh_when_a_day_has_passed(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker, online: None
) -> None:
    """The catalogue is fetched again once it is a day old."""
    manager = hass.data[DATA_MANAGER]
    calls = aioclient_mock.call_count
    manager._data["fetched_at"] = (
        dt_util.utcnow() - REFRESH_INTERVAL - timedelta(minutes=1)
    ).isoformat()
    assert await manager.async_refresh() is True
    assert aioclient_mock.call_count > calls


async def test_offline_with_cache_still_answers(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker, online: None
) -> None:
    """A lost connection changes nothing for what is already cached."""
    manager = hass.data[DATA_MANAGER]
    aioclient_mock.clear_requests()
    mock_offline(aioclient_mock)
    assert await manager.async_refresh(force=True) is False
    dish_ = await manager.async_random()
    assert dish_ is not None
    assert dish_["id"] in {"hk-dish-0001", "hk-dish-0002"}


async def test_offline_without_cache_reports_none(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker
) -> None:
    """With nothing cached and no network there is simply no dish."""
    mock_offline(aioclient_mock)
    assert await async_setup_component(hass, "dim_sum", {})
    await hass.async_block_till_done(wait_background_tasks=True)
    manager = hass.data[DATA_MANAGER]
    assert manager.dishes == []
    assert await manager.async_random() is None


async def test_catalogue_without_pictures_is_not_cached(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker
) -> None:
    """A catalogue where no picture is published leaves the cache empty."""
    mock_catalog(aioclient_mock, [dish(1)], [release(5)])
    manager = DimSumManager(hass)
    await manager.async_load()
    assert await manager.async_refresh() is False
    assert manager.dishes == []


async def test_failure_is_not_retried_at_once(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker
) -> None:
    """After a failed refresh the next attempt waits."""
    mock_offline(aioclient_mock)
    manager = DimSumManager(hass)
    await manager.async_load()
    await manager.async_refresh()
    calls = aioclient_mock.call_count
    await manager.async_refresh()
    assert aioclient_mock.call_count == calls


async def test_cache_survives_a_restart(
    hass: HomeAssistant, online: None
) -> None:
    """A new manager reads the catalogue the first one stored."""
    manager = DimSumManager(hass)
    await manager.async_load()
    assert [d["id"] for d in manager.dishes] == ["hk-dish-0001", "hk-dish-0002"]


async def test_bad_picture_is_not_cached(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker
) -> None:
    """A download that is not a PNG is never written."""
    mock_catalog(aioclient_mock, [dish(1)], [release(1)])
    mock_picture(aioclient_mock, 1, b"<html>" + b"x" * 50, "text/html")
    manager = DimSumManager(hass, first)
    await manager.async_load()
    await manager.async_refresh()
    assert await manager.async_random() is None
    assert await manager.async_picture("hk-dish-0001") is None


@pytest.mark.parametrize(
    ("picture_id", "valid"),
    [
        ("hk-dish-0001", True),
        ("a", True),
        ("../secrets", False),
        ("a/b", False),
        ("a\\b", False),
        ("A", False),
        ("", False),
        ("-a", False),
        ("a" * 129, False),
        ("a.png", False),
    ],
)
def test_id_validation(picture_id: str, valid: bool) -> None:
    """Only a plain lower-case slug is an id."""
    assert valid_picture_id(picture_id) is valid


async def test_random_command_returns_a_dish_with_a_signed_picture(
    hass: HomeAssistant, online: None, hass_ws_client: WebSocketGenerator
) -> None:
    """Any signed-in user gets a dish with a short-lived picture path."""
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "dim_sum/random"})
    result = (await client.receive_json())["result"]
    assert set(result) == {"id", "name_en", "name_yue", "picture_url", "content_type"}
    assert result["content_type"] == "image/png"
    assert result["picture_url"].startswith(f"/api/dim_sum/picture/{result['id']}?authSig=")


async def test_random_command_for_a_non_admin(
    hass: HomeAssistant,
    online: None,
    hass_ws_client: WebSocketGenerator,
    hass_read_only_access_token: str,
) -> None:
    """The command needs no administrator."""
    client = await hass_ws_client(hass, hass_read_only_access_token)
    await client.send_json_auto_id({"type": "dim_sum/random"})
    response = await client.receive_json()
    assert response["success"] is True
    assert response["result"]["id"] in {"hk-dish-0001", "hk-dish-0002"}


async def test_random_command_with_nothing_available(
    hass: HomeAssistant,
    aioclient_mock: AiohttpClientMocker,
    hass_ws_client: WebSocketGenerator,
) -> None:
    """Without any cache the command answers with nothing."""
    mock_offline(aioclient_mock)
    assert await async_setup_component(hass, "dim_sum", {})
    await hass.async_block_till_done(wait_background_tasks=True)
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "dim_sum/random"})
    response = await client.receive_json()
    assert response["success"] is True
    assert response["result"] is None


async def test_view_serves_a_cached_picture(
    hass: HomeAssistant, online: None, hass_client: ClientSessionGenerator
) -> None:
    """A signed-in user gets the cached bytes with safe headers."""
    client = await hass_client()
    response = await client.get("/api/dim_sum/picture/hk-dish-0001")
    assert response.status == 200
    assert response.content_type == "image/png"
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert await response.read() == PNG


@pytest.mark.parametrize(
    ("path", "status"),
    [
        ("hk-dish-9999", 404),
        ("..%2Fsecrets", 400),
        ("UPPER", 404),
        ("a.png", 404),
    ],
)
async def test_view_refuses_unknown_and_unsafe_ids(
    hass: HomeAssistant,
    online: None,
    hass_client: ClientSessionGenerator,
    path: str,
    status: int,
) -> None:
    """An id that is not cached or not a plain slug is refused."""
    client = await hass_client()
    response = await client.get(f"/api/dim_sum/picture/{path}")
    assert response.status == status


async def test_view_needs_sign_in(
    hass: HomeAssistant, online: None, hass_client_no_auth: ClientSessionGenerator
) -> None:
    """Without a token or a signature the picture is not served."""
    client = await hass_client_no_auth()
    response = await client.get("/api/dim_sum/picture/hk-dish-0001")
    assert response.status == 401


async def test_failed_start_recovers_by_itself(
    hass: HomeAssistant,
    aioclient_mock: AiohttpClientMocker,
    freezer: FrozenDateTimeFactory,
) -> None:
    """A catalogue that could not be fetched at start is fetched later."""
    mock_offline(aioclient_mock)
    assert await async_setup_component(hass, "dim_sum", {})
    await hass.async_block_till_done(wait_background_tasks=True)
    manager = hass.data[DATA_MANAGER]
    assert manager.dishes == []

    aioclient_mock.clear_requests()
    mock_catalog(aioclient_mock, [dish(1)], [release(1)])
    mock_picture(aioclient_mock, 1)
    freezer.tick(timedelta(hours=1, minutes=1))
    async_fire_time_changed(hass)
    await hass.async_block_till_done(wait_background_tasks=True)
    assert [d["id"] for d in manager.dishes] == ["hk-dish-0001"]
