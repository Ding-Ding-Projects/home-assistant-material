"""Tests for setup, unload, removal and diagnostics."""

import json

import pytest
from pytest_homeassistant.common import MockConfigEntry

from homeassistant.components.registry_storage import async_get_store
from homeassistant.components.registry_storage.const import (
    CONF_ADDRESS,
    CONF_KEY_REF,
    CONF_REGISTRY,
    CONF_REPOSITORY,
    CONF_TOKEN,
    CONF_USERNAME,
    DOMAIN,
)
from homeassistant.components.registry_storage.crypto import (
    new_vault_key,
    wrap_vault_key,
)
from homeassistant.components.registry_storage.diagnostics import (
    async_get_config_entry_diagnostics,
)
from homeassistant.components.registry_storage.store import KeyStore
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant

from .common import TOKEN, USER, FakeRegistry
from .conftest import PASSWORD, REPOSITORY


async def _entry(hass: HomeAssistant, *, save_key: bool = True) -> MockConfigEntry:
    if save_key:
        await KeyStore(hass, "ref1").async_save(
            new_vault_key(), wrap_vault_key(new_vault_key(), PASSWORD)
        )
    entry = MockConfigEntry(
        domain=DOMAIN,
        title=REPOSITORY,
        data={
            CONF_REGISTRY: "docker_hub",
            CONF_ADDRESS: "https://registry-1.docker.io",
            CONF_USERNAME: USER,
            CONF_TOKEN: TOKEN,
            CONF_REPOSITORY: REPOSITORY,
            CONF_KEY_REF: "ref1",
        },
    )
    entry.add_to_hass(hass)
    return entry


@pytest.mark.usefixtures("patch_session")
async def test_setup_unload_remove(hass: HomeAssistant, hass_storage: dict) -> None:
    """A place sets up, offers its store to other integrations, unloads and forgets its key when removed."""
    entry = await _entry(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    assert entry.state is ConfigEntryState.LOADED
    store = async_get_store(hass)
    assert store is entry.runtime_data.store
    assert async_get_store(hass, entry.entry_id) is store
    assert async_get_store(hass, "other") is None

    assert await hass.config_entries.async_unload(entry.entry_id)
    assert entry.state is ConfigEntryState.NOT_LOADED
    assert async_get_store(hass) is None

    assert "registry_storage.ref1" in hass_storage
    await hass.config_entries.async_remove(entry.entry_id)
    assert "registry_storage.ref1" not in hass_storage


@pytest.mark.usefixtures("patch_session")
async def test_missing_key(hass: HomeAssistant) -> None:
    """A place whose key file is gone does not start and says why."""
    entry = await _entry(hass, save_key=False)
    assert not await hass.config_entries.async_setup(entry.entry_id)
    assert entry.state is ConfigEntryState.SETUP_ERROR


@pytest.mark.usefixtures("patch_session")
async def test_registry_down_retries(
    hass: HomeAssistant, registry: FakeRegistry
) -> None:
    """A registry that cannot be reached means a retry later, not a failure."""
    entry = await _entry(hass)
    for _ in range(8):
        registry.fail("GET", 503)
    assert not await hass.config_entries.async_setup(entry.entry_id)
    assert entry.state is ConfigEntryState.SETUP_RETRY


@pytest.mark.usefixtures("patch_session")
async def test_diagnostics_hold_nothing_sensitive(hass: HomeAssistant) -> None:
    """Diagnostics show counts and redacted settings only."""
    entry = await _entry(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    text = json.dumps(await async_get_config_entry_diagnostics(hass, entry))
    for secret in (TOKEN, USER, REPOSITORY, "ref1", "registry-1.docker.io"):
        assert secret not in text
    assert '"repositories": 1' in text
