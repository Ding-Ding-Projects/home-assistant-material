"""Discover Minecraft versions, only when the person asks for it.

Two fixed hosts are contacted. Redirects are never followed, the response size
is capped, and the result is cached with the time it was fetched.
"""

from datetime import UTC, datetime
import json
from typing import Any

import aiohttp

from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.storage import Store

from .const import (
    MOJANG_MANIFEST_URL,
    PAPER_VERSIONS_URL,
    STORAGE_KEY_VERSIONS,
    STORAGE_VERSION_VERSIONS,
    VERSION_FETCH_TIMEOUT,
    VERSION_MAX_BYTES,
    VERSION_MAX_ENTRIES,
)
from .validation import VERSION_PATTERN


class VersionError(Exception):
    """A lookup failed. The code is stable; there is no remote text."""

    def __init__(self, code: str) -> None:
        """Keep the stable error code."""
        super().__init__(code)
        self.code = code


def parse_mojang_manifest(data: Any) -> list[dict[str, str]]:
    """Return ``{id, type, released}`` for each release and snapshot."""
    entries = data.get("versions") if isinstance(data, dict) else None
    if not isinstance(entries, list):
        raise VersionError("bad_response")
    result: list[dict[str, str]] = []
    for entry in entries[:VERSION_MAX_ENTRIES]:
        if not isinstance(entry, dict):
            continue
        version_id = entry.get("id")
        kind = entry.get("type")
        if (
            not isinstance(version_id, str)
            or not VERSION_PATTERN.fullmatch(version_id)
            or kind not in ("release", "snapshot")
        ):
            continue
        released = entry.get("releaseTime")
        result.append(
            {
                "id": version_id,
                "type": kind,
                "released": released[:10] if isinstance(released, str) else "",
            }
        )
    if not result:
        raise VersionError("bad_response")
    return result


def parse_paper_versions(data: Any) -> list[dict[str, str]]:
    """Return ``{id, type}`` for each Paper version, newest first."""
    entries = data.get("versions") if isinstance(data, dict) else None
    if not isinstance(entries, list):
        raise VersionError("bad_response")
    result = [
        {"id": item, "type": "release"}
        for item in entries[:VERSION_MAX_ENTRIES]
        if isinstance(item, str) and VERSION_PATTERN.fullmatch(item)
    ]
    if not result:
        raise VersionError("bad_response")
    result.reverse()
    return result


async def _fetch_json(hass: HomeAssistant, url: str) -> Any:
    """Fetch one fixed URL: no redirects, size capped, timed out."""
    session = async_get_clientsession(hass)
    try:
        async with session.get(
            url,
            allow_redirects=False,
            timeout=aiohttp.ClientTimeout(total=VERSION_FETCH_TIMEOUT),
        ) as response:
            if 300 <= response.status < 400:
                raise VersionError("redirect_refused")
            if response.status != 200:
                raise VersionError("bad_status")
            body = bytearray()
            async for chunk in response.content.iter_chunked(64 * 1024):
                body.extend(chunk)
                if len(body) > VERSION_MAX_BYTES:
                    raise VersionError("too_large")
    except (TimeoutError, aiohttp.ClientError) as err:
        raise VersionError("fetch_failed") from err
    try:
        return json.loads(bytes(body))
    except ValueError as err:
        raise VersionError("bad_response") from err


class VersionStore:
    """Cache the fetched version lists."""

    def __init__(self, hass: HomeAssistant) -> None:
        """Initialize the cache."""
        self._hass = hass
        self._store: Store[dict[str, Any]] = Store(
            hass, STORAGE_VERSION_VERSIONS, STORAGE_KEY_VERSIONS, private=True
        )
        self._data: dict[str, Any] = {}

    async def async_load(self) -> None:
        """Load the cache."""
        stored = await self._store.async_load()
        self._data = stored if isinstance(stored, dict) else {}

    def cached(self) -> dict[str, Any]:
        """Return the cached lists and the time they were fetched."""
        return {
            "fetched_at": self._data.get("fetched_at"),
            "vanilla": self._data.get("vanilla", []),
            "paper": self._data.get("paper", []),
        }

    async def async_refresh(self) -> dict[str, Any]:
        """Fetch both lists. Nothing is cached unless both succeed."""
        vanilla = parse_mojang_manifest(await _fetch_json(self._hass, MOJANG_MANIFEST_URL))
        paper = parse_paper_versions(await _fetch_json(self._hass, PAPER_VERSIONS_URL))
        self._data = {
            "fetched_at": datetime.now(UTC).isoformat(timespec="seconds"),
            "vanilla": vanilla,
            "paper": paper,
        }
        await self._store.async_save(self._data)
        return self.cached()
