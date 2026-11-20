"""Apply an imported settings file and undo it.

Before an import changes an entry, the entry's data and options as they were
are kept in a private store (one record per entry, the latest import only), so
Undo can put them back. The store is only readable by Home Assistant itself;
it is never part of the integrations list export.
"""

from typing import Any, TypedDict

from homeassistant.config_entries import ConfigEntry, ConfigEntryState
from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import UNDO_STORAGE_KEY, UNDO_STORAGE_VERSION
from .settings import TransferError


class UndoRecord(TypedDict):
    """The settings of one entry as they were before an import."""

    domain: str
    saved_at: str
    data: dict[str, Any]
    options: dict[str, Any]


class SettingsUndo:
    """Keep the settings as they were before the latest import of each entry."""

    def __init__(self, hass: HomeAssistant) -> None:
        """Initialize."""
        self._hass = hass
        self._store: Store[dict[str, UndoRecord]] = Store(
            hass, UNDO_STORAGE_VERSION, UNDO_STORAGE_KEY, private=True
        )
        self._records: dict[str, UndoRecord] = {}

    async def async_load(self) -> None:
        """Load the records."""
        stored = await self._store.async_load()
        if isinstance(stored, dict):
            self._records = {
                entry_id: record
                for entry_id, record in stored.items()
                if isinstance(record, dict)
                and isinstance(record.get("data"), dict)
                and isinstance(record.get("options"), dict)
            }

    def info(self, entry_id: str) -> dict[str, Any]:
        """Return whether Undo is possible for an entry, and since when."""
        record = self._records.get(entry_id)
        return {
            "available": record is not None,
            "saved_at": record["saved_at"] if record else None,
        }

    async def _async_save(self) -> None:
        await self._store.async_save(self._records)

    async def async_forget(self, entry_id: str) -> None:
        """Drop the record of an entry, for example when the entry is removed."""
        if self._records.pop(entry_id, None) is not None:
            await self._async_save()

    async def _async_set_and_reload(
        self, entry: ConfigEntry, data: dict[str, Any], options: dict[str, Any]
    ) -> bool:
        """Change the entry and reload it; return whether it is loaded afterwards."""
        self._hass.config_entries.async_update_entry(entry, data=data, options=options)
        try:
            await self._hass.config_entries.async_reload(entry.entry_id)
        except Exception:  # noqa: BLE001
            return False
        return entry.state is ConfigEntryState.LOADED

    async def async_apply(
        self, entry: ConfigEntry, data: dict[str, Any], options: dict[str, Any]
    ) -> None:
        """Apply new settings; on a failed reload put the old ones back and refuse."""
        if entry.disabled_by is not None:
            raise TransferError("entry_disabled")
        previous_data = dict(entry.data)
        previous_options = dict(entry.options)
        record = UndoRecord(
            domain=entry.domain,
            saved_at=dt_util.now().isoformat(timespec="seconds"),
            data=previous_data,
            options=previous_options,
        )
        earlier = self._records.get(entry.entry_id)
        self._records[entry.entry_id] = record
        await self._async_save()
        if await self._async_set_and_reload(entry, data, options):
            return
        await self._async_set_and_reload(entry, previous_data, previous_options)
        if earlier is None:
            self._records.pop(entry.entry_id, None)
        else:
            self._records[entry.entry_id] = earlier
        await self._async_save()
        raise TransferError("reload_failed")

    async def async_undo(self, entry: ConfigEntry) -> None:
        """Put back the settings as they were before the latest import."""
        record = self._records.get(entry.entry_id)
        if record is None or record["domain"] != entry.domain:
            raise TransferError("nothing_to_undo")
        loaded = await self._async_set_and_reload(
            entry, record["data"], record["options"]
        )
        del self._records[entry.entry_id]
        await self._async_save()
        if not loaded and entry.disabled_by is None:
            raise TransferError("reload_failed")
