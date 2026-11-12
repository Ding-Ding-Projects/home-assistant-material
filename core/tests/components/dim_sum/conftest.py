"""Test configuration for the dim sum surprise."""

from typing import Any

from pathlib import Path

import aiohttp
import pytest

from homeassistant.components.dim_sum.const import CATALOG_URL, RELEASES_URL
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component

from pytest_homeassistant.test_util.aiohttp import AiohttpClientMocker

ASSET_BASE = "https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1/"
PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64


def dish(number: int, **change: Any) -> dict[str, Any]:
    """Return one catalogue entry."""
    value: dict[str, Any] = {
        "id": f"hk-dish-{number:04d}",
        "name": {"en": f"Dish {number}", "zhHant": f"點心{number}"},
        "image": {"path": f"images/hk-dish-{number:04d}.png"},
    }
    value.update(change)
    return value


def release(*numbers: int, tag: str = "catalog-v1", draft: bool = False) -> dict:
    """Return one release that holds the pictures for these dishes."""
    return {
        "tag_name": tag,
        "draft": draft,
        "assets": [
            {
                "name": f"hk-dish-{n:04d}.png",
                "browser_download_url": f"{ASSET_BASE}hk-dish-{n:04d}.png",
            }
            for n in numbers
        ],
    }


def mock_catalog(
    aioclient_mock: AiohttpClientMocker, dishes: list[dict], releases: list[dict]
) -> None:
    """Register the catalogue and the release list."""
    aioclient_mock.get(CATALOG_URL, json={"dishes": dishes})
    aioclient_mock.get(RELEASES_URL.format(page=1), json=releases)


def mock_picture(
    aioclient_mock: AiohttpClientMocker,
    number: int,
    body: bytes = PNG,
    content_type: str = "application/octet-stream",
) -> None:
    """Register one picture download."""
    aioclient_mock.get(
        f"{ASSET_BASE}hk-dish-{number:04d}.png",
        content=body,
        headers={"Content-Type": content_type},
    )


def mock_offline(aioclient_mock: AiohttpClientMocker) -> None:
    """Make every request fail like a lost connection."""
    aioclient_mock.get(CATALOG_URL, exc=aiohttp.ClientError())
    aioclient_mock.get(RELEASES_URL.format(page=1), exc=aiohttp.ClientError())


@pytest.fixture(autouse=True)
def isolated_config_dir(hass: HomeAssistant, tmp_path: Path) -> None:
    """Keep the cached pictures of each test in its own folder."""
    hass.config.config_dir = str(tmp_path)


@pytest.fixture
async def online(hass: HomeAssistant, aioclient_mock: AiohttpClientMocker) -> None:
    """Set up the integration with two dishes whose pictures are published."""
    mock_catalog(aioclient_mock, [dish(1), dish(2)], [release(1, 2)])
    mock_picture(aioclient_mock, 1)
    mock_picture(aioclient_mock, 2)
    assert await async_setup_component(hass, "dim_sum", {})
    await hass.async_block_till_done(wait_background_tasks=True)
