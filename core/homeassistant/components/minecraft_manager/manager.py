"""Keep the stored Minecraft server definitions."""

from typing import Any, TypedDict
import uuid

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from homeassistant.util.hass_dict import HassKey

from .const import MAX_SERVERS, STATE_DEFINED, STORAGE_KEY, STORAGE_VERSION

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
        self._servers = {
            item["id"]: item for item in (stored or {}).get("servers", [])
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
            if server["target"] == data["target"] and server["port"] == data["port"]:
                errors.append({"field": "port", "code": "port_in_use"})
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
