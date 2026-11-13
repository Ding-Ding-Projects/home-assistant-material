"""Lovelace resources support."""

import asyncio
from collections.abc import Mapping
import logging
import os
import posixpath
import re
from typing import Any, override
from urllib.parse import unquote, urlsplit
import uuid

import probatio

from homeassistant.components import websocket_api
from homeassistant.const import CONF_FILENAME, CONF_ID, CONF_RESOURCES, CONF_TYPE, CONF_URL
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import collection, storage
from homeassistant.helpers.typing import ConfigType

from .const import (
    CONF_RESOURCE_TYPE_WS,
    DOMAIN,
    RESOURCE_CREATE_FIELDS,
    RESOURCE_SCHEMA,
    RESOURCE_UPDATE_FIELDS,
    RESOURCE_UPLOAD_URL,
)
from .dashboard import LovelaceConfig, LovelaceYAML
from .websocket import websocket_lovelace_resources_impl

RESOURCE_STORAGE_KEY = f"{DOMAIN}_resources"
RESOURCES_STORAGE_VERSION = 1
_LOGGER = logging.getLogger(__name__)
UPLOADED_RESOURCE_NAME = re.compile(r"[0-9a-f]{32}\.(?:css|m?js)")


class ResourceYAMLCollection:
    """Collection representing static YAML."""

    loaded = True

    def __init__(self, data: list[dict[str, Any]]) -> None:
        """Initialize a resource YAML collection."""
        self.data = data

    async def async_get_info(self) -> dict[str, int]:
        """Return the resources info for YAML mode."""
        return {"resources": len(self.async_items() or [])}

    @callback
    def async_items(self) -> list[dict]:
        """Return list of items in collection."""
        return self.data

    async def async_get_items(self) -> list[dict]:
        """Return the configured resource list."""
        return self.async_items()


class ResourceStorageCollection(collection.DictStorageCollection):
    """Collection to store resources."""

    loaded = False
    CREATE_SCHEMA = probatio.Schema(RESOURCE_CREATE_FIELDS)
    UPDATE_SCHEMA = probatio.Schema(RESOURCE_UPDATE_FIELDS)

    def __init__(self, hass: HomeAssistant, ll_config: LovelaceConfig) -> None:
        """Initialize the storage collection."""
        super().__init__(
            storage.Store(hass, RESOURCES_STORAGE_VERSION, RESOURCE_STORAGE_KEY),
        )
        self.ll_config = ll_config
        self.upload_lock = asyncio.Lock()
        self._load_lock = asyncio.Lock()

    async def _async_ensure_loaded(self) -> None:
        """Ensure the collection has been loaded from storage."""
        if self.loaded:
            return
        async with self._load_lock:
            if not self.loaded:
                await self.async_load()
                self.loaded = True

    async def async_get_uploaded_resource(self, url: str) -> dict | None:
        """Find an active uploaded resource by its exact URL."""
        await self._async_ensure_loaded()
        return next(
            (
                item
                for item in self.data.values()
                if item.get("uploaded") and item[CONF_URL] == url
            ),
            None,
        )

    async def async_create_uploaded_resource(
        self, url: str, resource_type: str, filename: str
    ) -> dict:
        """Register a file already written by the upload view."""
        return await self.async_create_item(
            {CONF_URL: url, CONF_RESOURCE_TYPE_WS: resource_type, CONF_FILENAME: filename}
        )

    async def async_get_info(self) -> dict[str, int]:
        """Return the resources info for YAML mode."""
        await self._async_ensure_loaded()
        return {"resources": len(self.async_items() or [])}

    async def async_get_items(self) -> list[dict]:
        """Return the resource list after storage has finished loading."""
        await self._async_ensure_loaded()
        return self.async_items()

    @override
    async def async_create_item(self, data: dict) -> dict:
        """Create a new item."""
        await self._async_ensure_loaded()
        return await super().async_create_item(data)

    @override
    async def async_update_item(self, item_id: str, updates: dict) -> dict:
        """Update item."""
        await self._async_ensure_loaded()
        return await super().async_update_item(item_id, updates)

    @override
    async def async_delete_item(self, item_id: str) -> None:
        """Delete item."""
        await self._async_ensure_loaded()
        item = self.data.get(item_id)
        if not item or not item.get("uploaded"):
            await super().async_delete_item(item_id)
            return

        async with self.upload_lock:
            await super().async_delete_item(item_id)
            name = item[CONF_URL].removeprefix(f"{RESOURCE_UPLOAD_URL}/")
            if UPLOADED_RESOURCE_NAME.fullmatch(name):
                path = self.store.hass.config.path(
                    ".storage", "lovelace_resource_uploads", name
                )
                try:
                    await self.store.hass.async_add_executor_job(os.unlink, path)
                except FileNotFoundError:
                    pass
                except OSError:
                    _LOGGER.exception(
                        "Could not remove an inactive dashboard resource file"
                    )

    @override
    async def _async_load_data(self) -> collection.SerializedStorageCollection | None:
        """Load the data."""
        if (store_data := await self.store.async_load()) is not None:
            return store_data

        # Import it from config.
        try:
            conf = await self.ll_config.async_load(False)
        except HomeAssistantError:
            return None

        if CONF_RESOURCES not in conf:
            return None

        # Remove it from config and save both resources + config
        resources: list[dict[str, Any]] = conf[CONF_RESOURCES]

        try:
            probatio.Schema([RESOURCE_SCHEMA])(resources)
        except probatio.Invalid as err:
            _LOGGER.warning("Resource import failed. Data invalid: %s", err)
            return None

        conf.pop(CONF_RESOURCES)

        for item in resources:
            item[CONF_ID] = uuid.uuid4().hex

        data: collection.SerializedStorageCollection = {"items": resources}

        await self.store.async_save(data)
        await self.ll_config.async_save(conf)

        return data

    @override
    async def _process_create_data(self, data: dict) -> dict:
        """Validate the config is valid."""
        values: Mapping = data
        if CONF_FILENAME in data:
            values = {key: value for key, value in data.items() if key != CONF_FILENAME}
        filename = data.get(CONF_FILENAME)
        data = self.CREATE_SCHEMA(values)
        data[CONF_TYPE] = data.pop(CONF_RESOURCE_TYPE_WS)
        if filename is not None:
            data.update({CONF_FILENAME: filename, "uploaded": True})
        return data

    @callback
    @override
    def _get_suggested_id(self, info: dict) -> str:
        """Return unique ID."""
        return uuid.uuid4().hex

    @override
    async def _update_data(self, item: dict, update_data: dict) -> dict:
        """Return a new updated data object."""
        if item.get("uploaded"):
            raise ValueError("Uploaded resources must be replaced by uploading a new file")
        update_data = self.UPDATE_SCHEMA(update_data)
        if CONF_RESOURCE_TYPE_WS in update_data:
            update_data[CONF_TYPE] = update_data.pop(CONF_RESOURCE_TYPE_WS)

        return {**item, **update_data}


class ResourceStorageCollectionWebsocket(collection.DictStorageCollectionWebsocket):
    """Class to expose storage collection management over websocket."""

    @callback
    @override
    def async_setup(self, hass: HomeAssistant) -> None:
        """Set up the websocket commands."""
        super().async_setup(hass)

        # Register lovelace/resources for backwards compatibility, remove in
        # Home Assistant Core 2025.1
        websocket_api.async_register_command(
            hass,
            self.api_prefix,
            self.ws_list_item,
            websocket_api.BASE_COMMAND_MESSAGE_SCHEMA.extend(
                {probatio.Required("type"): f"{self.api_prefix}"}
            ),
        )

    @staticmethod
    @websocket_api.async_response
    @override
    async def ws_list_item(
        hass: HomeAssistant,
        connection: websocket_api.ActiveConnection,
        msg: dict[str, Any],
    ) -> None:
        """Send Lovelace UI resources over WebSocket connection."""
        await websocket_lovelace_resources_impl(hass, connection, msg)


async def create_yaml_resource_col(
    hass: HomeAssistant, yaml_resources: list[ConfigType] | None
) -> ResourceYAMLCollection:
    """Create yaml resources collection."""
    if yaml_resources is None:
        default_config = LovelaceYAML(hass, None, None)
        try:
            ll_conf = await default_config.async_load(False)
        except HomeAssistantError:
            pass
        else:
            if CONF_RESOURCES in ll_conf:
                _LOGGER.warning(
                    "Resources need to be specified in your configuration.yaml. Please"
                    " see the docs"
                )
                yaml_resources = ll_conf[CONF_RESOURCES]

    if yaml_resources:
        await _async_warn_missing_local_resources(hass, yaml_resources)

    return ResourceYAMLCollection(yaml_resources or [])


def _missing_resource_files(candidates: dict[str, str]) -> list[tuple[str, str]]:
    """Return (url, path) pairs for resource files that do not exist."""
    return [(url, path) for url, path in candidates.items() if not os.path.isfile(path)]


async def _async_warn_missing_local_resources(
    hass: HomeAssistant, yaml_resources: list[ConfigType]
) -> None:
    """Warn for /local resource URLs that have no backing file in www."""
    candidates: dict[str, str] = {}
    for resource in yaml_resources:
        url: str | None = resource.get(CONF_URL)
        if not url:
            continue
        try:
            parts = urlsplit(url)
        except ValueError:
            # Any string is accepted as URL, an unparsable one is not a local file
            continue
        # Only URLs served from <config>/www can be checked, skip external URLs
        # and custom static paths such as /hacsfiles/
        if parts.scheme or parts.netloc:
            continue
        # Normalize the way a browser would, so traversal cannot escape www
        path = posixpath.normpath(unquote(parts.path))
        if not path.startswith("/local/"):
            continue
        candidates[url] = hass.config.path(
            "www", path.removeprefix("/local/").lstrip("/")
        )

    if not candidates:
        return

    for url, file_path in await hass.async_add_executor_job(
        _missing_resource_files, candidates
    ):
        _LOGGER.warning(
            "Lovelace resource %s was not found at %s"
            " (file and folder names are case sensitive)",
            url,
            file_path,
        )
