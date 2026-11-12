"""Tests for reading the catalogue and fetching pictures."""

from typing import Any

import pytest

from homeassistant.components.dim_sum.catalog import (
    DimSumError,
    async_fetch_picture,
    parse_assets,
    parse_catalog,
)
from homeassistant.core import HomeAssistant

from pytest_homeassistant.test_util.aiohttp import AiohttpClientMocker

from .conftest import ASSET_BASE, PNG, dish, mock_picture, release


def test_parse_keeps_dishes_with_names_and_a_published_picture() -> None:
    """A dish needs both names and a picture in a catalogue release."""
    assets = parse_assets(
        [release(1, 2, 4), release(3, tag="desktop-9"), release(5, draft=True)]
    )
    dishes = parse_catalog(
        {
            "dishes": [
                dish(1),
                dish(2, name={"en": "Only English"}),
                dish(3),
                dish(4),
                dish(5),
                dish(6),
            ]
        },
        assets,
    )
    assert [d["id"] for d in dishes] == ["hk-dish-0001", "hk-dish-0004"]
    assert dishes[0] == {
        "id": "hk-dish-0001",
        "name_en": "Dish 1",
        "name_yue": "點心1",
        "url": f"{ASSET_BASE}hk-dish-0001.png",
    }


@pytest.mark.parametrize(
    "bad_id", ["../etc/passwd", "A-B", "", "a/b", "x" * 200, ".hidden"]
)
def test_parse_refuses_unsafe_ids(bad_id: str) -> None:
    """An id that is not a plain slug is dropped."""
    bad = dish(1, id=bad_id)
    with pytest.raises(DimSumError):
        parse_catalog({"dishes": [bad]}, {"hk-dish-0001.png": f"{ASSET_BASE}x.png"})


def test_parse_refuses_foreign_picture_addresses() -> None:
    """Only addresses inside the catalogue repository's releases are kept."""
    releases = [
        {
            "tag_name": "catalog-v1",
            "assets": [
                {
                    "name": "hk-dish-0001.png",
                    "browser_download_url": "https://evil.example/hk-dish-0001.png",
                }
            ],
        }
    ]
    assert parse_assets(releases) == {}


@pytest.mark.parametrize("data", [None, [], {}, {"dishes": "x"}, {"dishes": []}])
def test_parse_rejects_bad_shapes(data: Any) -> None:
    """An unexpected shape is an error."""
    with pytest.raises(DimSumError):
        parse_catalog(data, {"a.png": f"{ASSET_BASE}a.png"})


async def test_picture_accepted(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker
) -> None:
    """A PNG is returned as it came."""
    mock_picture(aioclient_mock, 1)
    data = await async_fetch_picture(
        hass, f"{ASSET_BASE}hk-dish-0001.png", max_bytes=1000, timeout=5
    )
    assert data == PNG


@pytest.mark.parametrize(
    ("body", "content_type", "code"),
    [
        pytest.param(b"<html>" + b"x" * 40, "text/html", "bad_content_type", id="html"),
        pytest.param(b"GIF89a" + b"x" * 40, "image/png", "not_a_picture", id="magic"),
        pytest.param(PNG + b"x" * 5000, "image/png", "too_large", id="too-large"),
    ],
)
async def test_picture_refused(
    hass: HomeAssistant,
    aioclient_mock: AiohttpClientMocker,
    body: bytes,
    content_type: str,
    code: str,
) -> None:
    """A wrong type, wrong first bytes or too many bytes are refused."""
    mock_picture(aioclient_mock, 1, body, content_type)
    with pytest.raises(DimSumError) as err:
        await async_fetch_picture(
            hass, f"{ASSET_BASE}hk-dish-0001.png", max_bytes=1000, timeout=5
        )
    assert err.value.code == code


async def test_picture_from_another_address_refused(hass: HomeAssistant) -> None:
    """A picture outside the catalogue's releases is never requested."""
    with pytest.raises(DimSumError) as err:
        await async_fetch_picture(
            hass, "https://example.com/a.png", max_bytes=1000, timeout=5
        )
    assert err.value.code == "url_refused"


async def test_request_sends_only_a_generic_agent(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker
) -> None:
    """The request names no instance and sends no credentials."""
    mock_picture(aioclient_mock, 1)
    await async_fetch_picture(
        hass, f"{ASSET_BASE}hk-dish-0001.png", max_bytes=1000, timeout=5
    )
    headers = aioclient_mock.mock_calls[0][3]
    assert headers["User-Agent"].startswith("Mozilla/5.0")
    assert "HomeAssistant" not in headers["User-Agent"]
    assert "Authorization" not in headers
