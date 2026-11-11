"""Keep the SSH hosts and the key pair this instance holds for each one.

The private key of a host lives in its own file with owner-only permissions
under the configuration folder. It is never stored in the host record, never
returned by a command and never logged.
"""

import os
import stat
from typing import Any, TypedDict
import uuid

import asyncssh

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import (
    KEY_COMMENT,
    KEYS_DIRECTORY,
    MAX_HOSTS,
    STORAGE_KEY_HOSTS,
    STORAGE_VERSION_HOSTS,
)
from .ssh import SshError


class StoredHostKey(TypedDict):
    """The trusted host key of a machine."""

    fingerprint: str
    key: str


class HostDefinition(TypedDict):
    """One stored host."""

    id: str
    name: str
    address: str
    port: int
    user: str
    public_key: str
    host_key: StoredHostKey | None


def _is_usable(item: Any) -> bool:
    return (
        isinstance(item, dict)
        and isinstance(item.get("id"), str)
        and isinstance(item.get("name"), str)
        and isinstance(item.get("address"), str)
        and isinstance(item.get("port"), int)
        and isinstance(item.get("user"), str)
        and isinstance(item.get("public_key"), str)
    )


def write_key_file(directory: str, file_name: str, data: bytes) -> str:
    """Write a private key readable by the owner only. Blocking."""
    os.makedirs(directory, mode=0o700, exist_ok=True)
    os.chmod(directory, 0o700)
    path = os.path.join(directory, file_name)
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "wb") as handle:
        handle.write(data)
    os.chmod(path, 0o600)
    return path


def read_key_file(path: str) -> asyncssh.SSHKey:
    """Read a private key, tightening its permissions first. Blocking."""
    try:
        mode = stat.S_IMODE(os.stat(path).st_mode)
        if mode & 0o077:
            os.chmod(path, 0o600)
        return asyncssh.read_private_key(path)
    except (OSError, asyncssh.KeyImportError) as err:
        raise SshError("key_missing") from err


def public_view(host: HostDefinition) -> dict[str, Any]:
    """Return the fields an interface may see. Never anything private."""
    trusted = host.get("host_key")
    return {
        "id": host["id"],
        "name": host["name"],
        "address": host["address"],
        "port": host["port"],
        "user": host["user"],
        "public_key": host["public_key"],
        "host_key_fingerprint": trusted["fingerprint"] if trusted else None,
    }


class HostStore:
    """Own the stored hosts and their key files."""

    def __init__(self, hass: HomeAssistant) -> None:
        """Initialize the store."""
        self._hass = hass
        self._store: Store[dict[str, list[HostDefinition]]] = Store(
            hass, STORAGE_VERSION_HOSTS, STORAGE_KEY_HOSTS, private=True
        )
        self._hosts: dict[str, HostDefinition] = {}

    @property
    def keys_directory(self) -> str:
        """Return the folder holding the private keys."""
        return self._hass.config.path(*KEYS_DIRECTORY.split("/"))

    def key_path(self, host_id: str) -> str:
        """Return the key file of a host. The id is a generated hex string."""
        return os.path.join(self.keys_directory, f"{host_id}.key")

    async def async_load(self) -> None:
        """Load the stored hosts, skipping a damaged entry."""
        stored = await self._store.async_load()
        items = (stored or {}).get("hosts", [])
        self._hosts = {
            item["id"]: item
            for item in (items if isinstance(items, list) else [])
            if _is_usable(item)
        }

    def hosts(self) -> list[HostDefinition]:
        """Return all hosts, sorted by name."""
        return sorted(self._hosts.values(), key=lambda item: item["name"].lower())

    def get(self, host_id: str) -> HostDefinition | None:
        """Return one host."""
        return self._hosts.get(host_id)

    def is_full(self) -> bool:
        """Return True when no more hosts are accepted."""
        return len(self._hosts) >= MAX_HOSTS

    def conflicts(
        self, data: dict[str, Any], ignore_id: str | None = None
    ) -> list[dict[str, str]]:
        """Return errors for a duplicate name or a duplicate address and user."""
        errors: list[dict[str, str]] = []
        for host in self._hosts.values():
            if host["id"] == ignore_id:
                continue
            if host["name"].lower() == data["name"].lower():
                errors.append({"field": "name", "code": "duplicate_name"})
            if (
                host["address"] == data["address"]
                and host["port"] == data["port"]
                and host["user"] == data["user"]
            ):
                errors.append({"field": "address", "code": "duplicate_host"})
        return errors

    async def async_create(self, data: dict[str, Any]) -> HostDefinition:
        """Store a host and generate its key pair."""
        host_id = uuid.uuid4().hex
        key = asyncssh.generate_private_key("ssh-ed25519", comment=KEY_COMMENT)
        private = key.export_private_key("openssh")
        await self._hass.async_add_executor_job(
            write_key_file, self.keys_directory, f"{host_id}.key", private
        )
        host: HostDefinition = {
            "id": host_id,
            **data,
            "public_key": key.export_public_key("openssh").decode().strip(),
            "host_key": None,
        }  # type: ignore[typeddict-item]
        self._hosts[host_id] = host
        await self._async_save()
        return host

    async def async_update(self, host_id: str, data: dict[str, Any]) -> HostDefinition:
        """Change a host. A new address or port drops the trusted host key."""
        current = self._hosts[host_id]
        host: HostDefinition = {**current, **data}  # type: ignore[typeddict-item]
        if (host["address"], host["port"]) != (current["address"], current["port"]):
            host["host_key"] = None
        self._hosts[host_id] = host
        await self._async_save()
        return host

    async def async_set_host_key(
        self, host_id: str, fingerprint: str, key_line: str
    ) -> HostDefinition:
        """Trust a host key."""
        host = self._hosts[host_id]
        host["host_key"] = {"fingerprint": fingerprint, "key": key_line}
        await self._async_save()
        return host

    async def async_remove(self, host_id: str) -> None:
        """Remove a host and delete its private key file."""
        self._hosts.pop(host_id)
        await self._hass.async_add_executor_job(self._delete_key_file, host_id)
        await self._async_save()

    def _delete_key_file(self, host_id: str) -> None:
        try:
            os.remove(self.key_path(host_id))
        except FileNotFoundError:
            pass

    async def async_load_key(self, host_id: str) -> asyncssh.SSHKey:
        """Read the private key of a host."""
        return await self._hass.async_add_executor_job(
            read_key_file, self.key_path(host_id)
        )

    async def _async_save(self) -> None:
        await self._store.async_save({"hosts": list(self._hosts.values())})
