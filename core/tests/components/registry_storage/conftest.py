"""Fixtures for the Container registry storage tests."""

from collections.abc import Generator
from unittest.mock import AsyncMock, patch

import pytest

from homeassistant.components.registry_storage import crypto
from homeassistant.components.registry_storage.client import RegistryClient
from homeassistant.components.registry_storage.crypto import (
    new_vault_key,
    wrap_vault_key,
)
from homeassistant.components.registry_storage.store import (
    RegistryStore,
    StorageSettings,
)
from homeassistant.core import HomeAssistant

from .common import BASE, TOKEN, USER, FakeRegistry

PASSWORD = "obsidian marmalade tundra gazebo nutmeg"
REPOSITORY = "tester/vault"


@pytest.fixture(autouse=True)
def fast_kdf(monkeypatch: pytest.MonkeyPatch) -> None:
    """Use the smallest accepted cost so the tests stay quick."""
    monkeypatch.setattr(crypto, "KDF_MEMORY_KIB", crypto.KDF_MIN_MEMORY_KIB)
    monkeypatch.setattr(crypto, "KDF_ITERATIONS", crypto.KDF_MIN_ITERATIONS)
    monkeypatch.setattr(crypto, "KDF_LANES", 1)


@pytest.fixture
def registry() -> FakeRegistry:
    """Return an empty in-memory registry with a bearer token challenge."""
    return FakeRegistry()


@pytest.fixture
def patch_session(registry: FakeRegistry) -> Generator[FakeRegistry]:
    """Make the integration talk to the in-memory registry."""
    with (
        patch(
            "homeassistant.components.registry_storage.async_get_clientsession",
            return_value=registry,
        ),
        patch(
            "homeassistant.components.registry_storage.config_flow.async_get_clientsession",
            return_value=registry,
        ),
    ):
        yield registry


@pytest.fixture
def sleeps() -> AsyncMock:
    """Return a stand-in for sleeping, so backoff takes no time."""
    return AsyncMock()


@pytest.fixture
def client(registry: FakeRegistry, sleeps: AsyncMock) -> RegistryClient:
    """Return a client signed in to the in-memory registry."""
    return RegistryClient(registry, BASE, USER, TOKEN, sleep=sleeps)  # type: ignore[arg-type]


@pytest.fixture
def vault_key() -> bytes:
    """Return a fresh vault key."""
    return new_vault_key()


@pytest.fixture
def make_store(
    hass: HomeAssistant, registry: FakeRegistry, sleeps: AsyncMock, vault_key: bytes
):
    """Return a factory for stores that share one registry and one vault key."""

    def _make(settings: StorageSettings | None = None) -> RegistryStore:
        client = RegistryClient(registry, BASE, USER, TOKEN, sleep=sleeps)  # type: ignore[arg-type]
        header = wrap_vault_key(vault_key, PASSWORD)
        return RegistryStore(
            hass, client, vault_key, header, settings or StorageSettings(REPOSITORY)
        )

    return _make


@pytest.fixture
def store(make_store) -> RegistryStore:
    """Return one store."""
    return make_store()
