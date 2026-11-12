"""Cache of the dim sum catalogue and its pictures."""

import asyncio
from collections.abc import Callable, Sequence
from datetime import datetime
import hashlib
import json
import logging
import os
from pathlib import Path
import random
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util
from homeassistant.util.hass_dict import HassKey

from .catalog import (
    DimSumError,
    async_fetch_bytes,
    async_fetch_picture,
    parse_assets,
    parse_catalog,
)
from .const import (
    CATALOG_MAX_BYTES,
    CATALOG_TIMEOUT,
    CATALOG_URL,
    FAILURE_BACKOFF,
    ID_PATTERN,
    PICTURE_CACHE_MAX,
    PICTURE_CONTENT_TYPE,
    PICTURE_DIR,
    PICTURE_MAX_BYTES,
    PICTURE_TIMEOUT,
    PICTURE_WARM_COUNT,
    REFRESH_INTERVAL,
    RELEASE_MAX_PAGES,
    RELEASES_MAX_BYTES,
    RELEASES_URL,
    STORAGE_KEY,
    STORAGE_VERSION,
)

_LOGGER = logging.getLogger(__name__)

DATA_MANAGER: HassKey[DimSumManager] = HassKey("dim_sum_manager")


def valid_picture_id(picture_id: str) -> bool:
    """Return True for a plain dish id that is safe to use as a file name."""
    return bool(ID_PATTERN.fullmatch(picture_id))


def _read_bytes(path: Path) -> bytes | None:
    try:
        return path.read_bytes()
    except OSError:
        return None


def _write_picture(directory: Path, name: str, data: bytes) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / name
    temporary = directory / f"{name}.part"
    temporary.write_bytes(data)
    os.replace(temporary, target)
    files = sorted(
        (p for p in directory.glob("*.png") if p.is_file()),
        key=lambda p: p.stat().st_mtime,
    )
    for stale in files[: max(0, len(files) - PICTURE_CACHE_MAX)]:
        stale.unlink(missing_ok=True)


def _cached_ids(directory: Path) -> set[str]:
    if not directory.is_dir():
        return set()
    return {p.stem for p in directory.glob("*.png") if valid_picture_id(p.stem)}


class DimSumManager:
    """Keep the catalogue and a few pictures on disk, and pick one at random."""

    def __init__(
        self,
        hass: HomeAssistant,
        choose: Callable[[Sequence[Any]], Any] = random.choice,
    ) -> None:
        """Initialize the manager."""
        self._hass = hass
        self._choose = choose
        self._store: Store[dict[str, Any]] = Store(
            hass, STORAGE_VERSION, STORAGE_KEY, private=True
        )
        self._data: dict[str, Any] = {}
        self._dishes: list[dict[str, str]] = []
        self._directory = Path(hass.config.path(".storage", PICTURE_DIR))
        self._lock = asyncio.Lock()
        self._network_failed_at: datetime | None = None

    @property
    def dishes(self) -> list[dict[str, str]]:
        """The dishes that have a published picture."""
        return self._dishes

    @property
    def source(self) -> dict[str, Any]:
        """Where the cached catalogue came from."""
        return {
            "source_url": self._data.get("source_url"),
            "revision": self._data.get("revision"),
            "fetched_at": self._data.get("fetched_at"),
        }

    async def async_load(self) -> None:
        """Load the cached catalogue, if there is one."""
        stored = await self._store.async_load()
        if not isinstance(stored, dict):
            return
        dishes = stored.get("dishes")
        if not isinstance(dishes, list):
            return
        self._data = stored
        self._dishes = [
            dish
            for dish in dishes
            if isinstance(dish, dict)
            and all(isinstance(dish.get(key), str) for key in ("id", "name_en", "name_yue", "url"))
            and valid_picture_id(dish["id"])
        ]

    def _network_allowed(self) -> bool:
        failed = self._network_failed_at
        return failed is None or dt_util.utcnow() - failed >= FAILURE_BACKOFF

    def _refresh_due(self) -> bool:
        fetched = dt_util.parse_datetime(self._data.get("fetched_at") or "")
        return (
            not self._dishes
            or fetched is None
            or dt_util.utcnow() - fetched >= REFRESH_INTERVAL
        )

    async def async_refresh(self, *, force: bool = False) -> bool:
        """Fetch the catalogue when it is more than a day old. Never raises."""
        async with self._lock:
            if not force and not self._refresh_due():
                return False
            if not self._network_allowed():
                return False
            try:
                await self._async_fetch_catalog()
            except DimSumError as err:
                self._network_failed_at = dt_util.utcnow()
                _LOGGER.debug("Dim sum catalogue not refreshed: %s", err.code)
                return False
            return True

    async def _async_fetch_catalog(self) -> None:
        body, _ = await async_fetch_bytes(
            self._hass,
            CATALOG_URL,
            accept="application/json",
            max_bytes=CATALOG_MAX_BYTES,
            timeout=CATALOG_TIMEOUT,
            follow_redirects=False,
        )
        releases: list[Any] = []
        for page in range(1, RELEASE_MAX_PAGES + 1):
            raw, _ = await async_fetch_bytes(
                self._hass,
                RELEASES_URL.format(page=page),
                accept="application/json",
                max_bytes=RELEASES_MAX_BYTES,
                timeout=CATALOG_TIMEOUT,
                follow_redirects=False,
            )
            decoded = await self._hass.async_add_executor_job(_decode, raw)
            if not isinstance(decoded, list):
                raise DimSumError("bad_response")
            releases.extend(decoded)
            if len(decoded) < 100:
                break
        catalog = await self._hass.async_add_executor_job(_decode, body)
        dishes = parse_catalog(catalog, parse_assets(releases))
        self._dishes = dishes
        self._data = {
            "source_url": CATALOG_URL,
            "revision": hashlib.sha256(body).hexdigest()[:16],
            "fetched_at": dt_util.utcnow().isoformat(),
            "dishes": dishes,
        }
        self._network_failed_at = None
        await self._store.async_save(self._data)

    async def _async_download(self, dish: dict[str, str]) -> bool:
        if not self._network_allowed():
            return False
        try:
            data = await async_fetch_picture(
                self._hass,
                dish["url"],
                max_bytes=PICTURE_MAX_BYTES,
                timeout=PICTURE_TIMEOUT,
            )
        except DimSumError as err:
            self._network_failed_at = dt_util.utcnow()
            _LOGGER.debug("Dim sum picture not fetched: %s", err.code)
            return False
        await self._hass.async_add_executor_job(
            _write_picture, self._directory, f"{dish['id']}.png", data
        )
        return True

    async def async_warm(self) -> None:
        """Refresh the catalogue and keep a few pictures ready. Never raises."""
        await self.async_refresh()
        cached = await self._hass.async_add_executor_job(_cached_ids, self._directory)
        wanted = PICTURE_WARM_COUNT - len(cached)
        candidates = [dish for dish in self._dishes if dish["id"] not in cached]
        for _ in range(min(max(wanted, 0), len(candidates))):
            dish = self._choose(candidates)
            candidates.remove(dish)
            if not await self._async_download(dish):
                break

    async def async_random(self) -> dict[str, str] | None:
        """Return one dish whose picture is cached, or None."""
        if not self._dishes:
            return None
        cached = await self._hass.async_add_executor_job(_cached_ids, self._directory)
        dish = self._choose(self._dishes)
        if dish["id"] not in cached and not await self._async_download(dish):
            available = [d for d in self._dishes if d["id"] in cached]
            if not available:
                return None
            dish = self._choose(available)
        return {
            "id": dish["id"],
            "name_en": dish["name_en"],
            "name_yue": dish["name_yue"],
            "content_type": PICTURE_CONTENT_TYPE,
        }

    async def async_picture(self, picture_id: str) -> bytes | None:
        """Return a cached picture, or None."""
        if not valid_picture_id(picture_id):
            return None
        return await self._hass.async_add_executor_job(
            _read_bytes, self._directory / f"{picture_id}.png"
        )


def _decode(body: bytes) -> Any:
    try:
        return json.loads(body)
    except (ValueError, RecursionError) as err:
        raise DimSumError("bad_response") from err
