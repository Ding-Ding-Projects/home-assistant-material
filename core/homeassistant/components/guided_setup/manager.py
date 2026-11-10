"""Keep the entries made in the interface and render them as YAML files."""

import os
from typing import Any, TypedDict
import uuid

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from homeassistant.util.file import write_utf8_file_atomic
from homeassistant.util.hass_dict import HassKey
from homeassistant.util.yaml import dump

from .const import CONF_PLATFORM_KEY, FILES_DIRECTORY, STORAGE_KEY, STORAGE_VERSION

DATA_MANAGER: HassKey["GuidedSetupManager"] = HassKey("guided_setup_manager")

FILE_HEADER = (
    "# Written by Guided setup in the Home Assistant interface.\n"
    "# Edit these options in Settings, Devices & services, Guided setup.\n"
    "# Changes made to this file by hand are replaced the next time it is saved.\n"
)


class StoredEntry(TypedDict):
    """One configuration made in the interface."""

    id: str
    domain: str
    entity_domain: str | None
    data: dict[str, Any]
    as_list: bool


class GuidedSetupManager:
    """Own the stored entries and the generated files."""

    def __init__(self, hass: HomeAssistant) -> None:
        """Initialize the manager."""
        self._hass = hass
        self._store: Store[dict[str, list[StoredEntry]]] = Store(
            hass, STORAGE_VERSION, STORAGE_KEY, private=True
        )
        self._entries: dict[str, StoredEntry] = {}

    @property
    def directory(self) -> str:
        """Return the directory that holds the generated files."""
        return self._hass.config.path(FILES_DIRECTORY)

    async def async_load(self) -> None:
        """Load the stored entries."""
        stored = await self._store.async_load()
        self._entries = {
            item["id"]: {"as_list": False, **item}
            for item in (stored or {}).get("entries", [])
        }

    def entries(self) -> list[StoredEntry]:
        """Return all entries."""
        return list(self._entries.values())

    def get(self, entry_id: str) -> StoredEntry | None:
        """Return one entry."""
        return self._entries.get(entry_id)

    def conflicts(
        self, domain: str, entity_domain: str | None, ignore_id: str | None = None
    ) -> bool:
        """Return True when a domain-level integration already has an entry."""
        if entity_domain is not None:
            return False
        return any(
            entry["domain"] == domain
            and entry["entity_domain"] is None
            and not entry["as_list"]
            and entry["id"] != ignore_id
            for entry in self._entries.values()
        )

    async def async_add(
        self,
        domain: str,
        entity_domain: str | None,
        data: dict[str, Any],
        as_list: bool = False,
    ) -> StoredEntry:
        """Add an entry and write its file."""
        entry: StoredEntry = {
            "id": uuid.uuid4().hex,
            "domain": domain,
            "entity_domain": entity_domain,
            "data": data,
            "as_list": as_list,
        }
        self._entries[entry["id"]] = entry
        await self._async_save(domain)
        return entry

    async def async_update(self, entry_id: str, data: dict[str, Any]) -> StoredEntry:
        """Replace the options of an entry and write its file."""
        entry = self._entries[entry_id]
        entry["data"] = data
        await self._async_save(entry["domain"])
        return entry

    async def async_remove(self, entry_id: str) -> StoredEntry:
        """Remove an entry and rewrite or delete its file."""
        entry = self._entries.pop(entry_id)
        await self._async_save(entry["domain"])
        return entry

    def _render(self, domain: str) -> dict[str, Any]:
        content: dict[str, Any] = {}
        for entry in self._entries.values():
            if entry["domain"] != domain:
                continue
            if entry["entity_domain"] is None and entry["as_list"]:
                content.setdefault(domain, []).append(entry["data"])
            elif entry["entity_domain"] is None:
                content[domain] = entry["data"]
            else:
                content.setdefault(entry["entity_domain"], []).append(
                    {CONF_PLATFORM_KEY: domain, **entry["data"]}
                )
        return content

    async def _async_save(self, domain: str) -> None:
        """Write the stored entries first, then the file of one integration."""
        await self._store.async_save(self._data_to_save())
        content = self._render(domain)
        path = os.path.join(self.directory, f"{domain}.yaml")
        text = FILE_HEADER + dump(content) if content else None
        await self._hass.async_add_executor_job(_write_file, path, text)

    def _data_to_save(self) -> dict[str, list[StoredEntry]]:
        return {"entries": list(self._entries.values())}


def _write_file(path: str, text: str | None) -> None:
    """Write a generated file, or delete it when nothing is left."""
    if text is None:
        if os.path.exists(path):
            os.remove(path)
        return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    write_utf8_file_atomic(path, text, private=True)
