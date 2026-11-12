"""Read the public dim sum catalogue and fetch its pictures."""

import json
import posixpath
from typing import Any

import aiohttp

from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import (
    ACCEPTED_FETCH_TYPES,
    ALLOWED_FINAL_HOST_SUFFIX,
    ALLOWED_FINAL_HOSTS,
    ASSET_URL_PREFIX,
    CATALOG_MAX_DISHES,
    ID_PATTERN,
    NAME_MAX_LENGTH,
    PNG_MAGIC,
    RELEASE_TAG_PREFIX,
    USER_AGENT,
)


class DimSumError(Exception):
    """Something about the catalogue or a picture could not be used."""

    def __init__(self, code: str) -> None:
        """Keep the short reason."""
        super().__init__(code)
        self.code = code


def _clean_name(value: Any) -> str | None:
    """Return a one line name, or None when it is not usable."""
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not text or len(text) > NAME_MAX_LENGTH or not text.isprintable():
        return None
    return text


def parse_assets(releases: Any) -> dict[str, str]:
    """Return the published picture URL for each asset file name."""
    if not isinstance(releases, list):
        raise DimSumError("bad_response")
    assets: dict[str, str] = {}
    for release in releases:
        if (
            not isinstance(release, dict)
            or release.get("draft")
            or not isinstance(release.get("tag_name"), str)
            or not release["tag_name"].startswith(RELEASE_TAG_PREFIX)
        ):
            continue
        for asset in release.get("assets") or []:
            if not isinstance(asset, dict):
                continue
            name = asset.get("name")
            url = asset.get("browser_download_url")
            if (
                isinstance(name, str)
                and isinstance(url, str)
                and url.startswith(ASSET_URL_PREFIX)
            ):
                assets[name] = url
    return assets


def parse_catalog(data: Any, assets: dict[str, str]) -> list[dict[str, str]]:
    """Return the dishes that have a name in both languages and a published picture."""
    dishes = data.get("dishes") if isinstance(data, dict) else None
    if not isinstance(dishes, list):
        raise DimSumError("bad_response")
    result: list[dict[str, str]] = []
    for dish in dishes[:CATALOG_MAX_DISHES]:
        if not isinstance(dish, dict):
            continue
        dish_id = dish.get("id")
        name = dish.get("name")
        image = dish.get("image")
        if (
            not isinstance(dish_id, str)
            or not ID_PATTERN.fullmatch(dish_id)
            or not isinstance(name, dict)
            or not isinstance(image, dict)
            or not isinstance(image.get("path"), str)
        ):
            continue
        name_en = _clean_name(name.get("en"))
        name_yue = _clean_name(name.get("zhHant"))
        url = assets.get(posixpath.basename(image["path"]))
        if name_en and name_yue and url:
            result.append(
                {"id": dish_id, "name_en": name_en, "name_yue": name_yue, "url": url}
            )
    if not result:
        raise DimSumError("no_dishes")
    return result


def has_png_magic(data: bytes) -> bool:
    """Return True when the bytes start like a PNG file."""
    return data.startswith(PNG_MAGIC)


def _host_allowed(host: str | None) -> bool:
    return bool(host) and (
        host in ALLOWED_FINAL_HOSTS or host.endswith(ALLOWED_FINAL_HOST_SUFFIX)
    )


async def async_fetch_bytes(
    hass: HomeAssistant,
    url: str,
    *,
    accept: str,
    max_bytes: int,
    timeout: int,
    follow_redirects: bool,
) -> tuple[bytes, str]:
    """Fetch one URL with a size cap, a timeout and a generic agent.

    Returns the body and the lower-case content type without parameters.
    """
    session = async_get_clientsession(hass)
    headers = {"User-Agent": USER_AGENT, "Accept": accept}
    try:
        async with session.get(
            url,
            headers=headers,
            allow_redirects=follow_redirects,
            timeout=aiohttp.ClientTimeout(total=timeout),
        ) as response:
            if response.status != 200:
                raise DimSumError("bad_status")
            if response.url.scheme != "https" or not _host_allowed(response.url.host):
                raise DimSumError("host_refused")
            declared = response.headers.get("Content-Length", "")
            if declared.isdigit() and int(declared) > max_bytes:
                raise DimSumError("too_large")
            content_type = (
                response.headers.get("Content-Type", "").split(";")[0].strip().lower()
            )
            body = bytearray()
            async for chunk in response.content.iter_chunked(64 * 1024):
                body.extend(chunk)
                if len(body) > max_bytes:
                    raise DimSumError("too_large")
    except (TimeoutError, aiohttp.ClientError) as err:
        raise DimSumError("fetch_failed") from err
    return bytes(body), content_type


async def async_fetch_json(
    hass: HomeAssistant, url: str, *, max_bytes: int, timeout: int
) -> Any:
    """Fetch and decode one JSON document."""
    body, _ = await async_fetch_bytes(
        hass,
        url,
        accept="application/json",
        max_bytes=max_bytes,
        timeout=timeout,
        follow_redirects=False,
    )
    try:
        return json.loads(body)
    except (ValueError, RecursionError) as err:
        raise DimSumError("bad_response") from err


async def async_fetch_picture(
    hass: HomeAssistant, url: str, *, max_bytes: int, timeout: int
) -> bytes:
    """Fetch one picture and check its type and its first bytes."""
    if not url.startswith(ASSET_URL_PREFIX):
        raise DimSumError("url_refused")
    body, content_type = await async_fetch_bytes(
        hass,
        url,
        accept="image/png,application/octet-stream",
        max_bytes=max_bytes,
        timeout=timeout,
        follow_redirects=True,
    )
    if content_type not in ACCEPTED_FETCH_TYPES:
        raise DimSumError("bad_content_type")
    if not has_png_magic(body):
        raise DimSumError("not_a_picture")
    return body
