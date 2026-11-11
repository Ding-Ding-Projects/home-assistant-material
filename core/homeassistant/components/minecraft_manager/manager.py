"""Keep the stored Minecraft server definitions."""

from typing import Any, TypedDict
import uuid

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from homeassistant.util.hass_dict import HassKey

from .const import (
    LOCAL_HOST_TARGETS,
    MAX_SERVERS,
    RESERVED_LOCAL_PORTS,
    STATE_DEFINED,
    STORAGE_KEY,
    STORAGE_VERSION,
)

DATA_MANAGER: HassKey["MinecraftManager"] = HassKey("minecraft_manager")


class ServerDefinition(TypedDict):
    """One stored server definition."""

    id: str
    name: str
    edition: str
    flavour: str
    version: str
    port: int
    memory_mb: int
    target: str
    state: str


def _is_usable(item: Any) -> bool:
    """Return True when a stored entry has the fields the manager relies on."""
    return (
        isinstance(item, dict)
        and isinstance(item.get("id"), str)
        and isinstance(item.get("name"), str)
        and isinstance(item.get("target"), str)
        and isinstance(item.get("port"), int)
    )


def _same_host(target_a: str, target_b: str) -> bool:
    """Return True when two targets run on the same machine."""
    if target_a == target_b:
        return True
    return target_a in LOCAL_HOST_TARGETS and target_b in LOCAL_HOST_TARGETS


class MinecraftManager:
    """Own the stored server definitions. Nothing here starts a process."""

    def __init__(self, hass: HomeAssistant) -> None:
        """Initialize the manager."""
        self._store: Store[dict[str, list[ServerDefinition]]] = Store(
            hass, STORAGE_VERSION, STORAGE_KEY, private=True
        )
        self._servers: dict[str, ServerDefinition] = {}

    async def async_load(self) -> None:
        """Load the stored definitions."""
        stored = await self._store.async_load()
        items = (stored or {}).get("servers", [])
        # A damaged entry is skipped instead of failing the whole list.
        self._servers = {
            item["id"]: item
            for item in (items if isinstance(items, list) else [])
            if _is_usable(item)
        }

    def servers(self) -> list[ServerDefinition]:
        """Return all definitions, sorted by name."""
        return sorted(self._servers.values(), key=lambda item: item["name"].lower())

    def get(self, server_id: str) -> ServerDefinition | None:
        """Return one definition."""
        return self._servers.get(server_id)

    def conflicts(
        self, data: dict[str, Any], ignore_id: str | None = None
    ) -> list[dict[str, str]]:
        """Return errors for a duplicate name or a port used on the same target."""
        errors: list[dict[str, str]] = []
        for server in self._servers.values():
            if server["id"] == ignore_id:
                continue
            if server["name"].lower() == data["name"].lower():
                errors.append({"field": "name", "code": "duplicate_name"})
            if server["port"] == data["port"] and _same_host(
                server["target"], data["target"]
            ):
                errors.append({"field": "port", "code": "port_in_use"})
        if (
            data["target"] in LOCAL_HOST_TARGETS
            and data["port"] in RESERVED_LOCAL_PORTS
        ):
            errors.append({"field": "port", "code": "port_reserved"})
        return errors

    def is_full(self) -> bool:
        """Return True when no more definitions are accepted."""
        return len(self._servers) >= MAX_SERVERS

    async def async_add(self, data: dict[str, Any]) -> ServerDefinition:
        """Store a new definition."""
        server: ServerDefinition = {
            "id": uuid.uuid4().hex,
            **data,
            "state": STATE_DEFINED,
        }  # type: ignore[typeddict-item]
        self._servers[server["id"]] = server
        await self._async_save()
        return server

    async def async_update(self, server_id: str, data: dict[str, Any]) -> ServerDefinition:
        """Replace the settings of a definition."""
        server: ServerDefinition = {
            **self._servers[server_id],
            **data,
        }  # type: ignore[typeddict-item]
        self._servers[server_id] = server
        await self._async_save()
        return server

    async def async_remove(self, server_id: str) -> None:
        """Remove a definition."""
        self._servers.pop(server_id)
        await self._async_save()

    async def _async_save(self) -> None:
        await self._store.async_save({"servers": list(self._servers.values())})
