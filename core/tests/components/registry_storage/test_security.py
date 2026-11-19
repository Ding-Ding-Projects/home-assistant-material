"""Tests for what a stranger with a copy of the public registry can and cannot do."""

from pathlib import PurePath

import pytest
from pytest_homeassistant.common import MockConfigEntry

from homeassistant.components.backup.const import EXCLUDE_FROM_BACKUP
from homeassistant.components.registry_storage.client import RegistryClient, _same_site
from homeassistant.components.registry_storage.const import (
    CONF_ADDRESS,
    CONF_KEY_REF,
    CONF_PASSWORD,
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
from homeassistant.components.registry_storage.errors import LockError, Reason
from homeassistant.components.registry_storage.store import (
    KeyStore,
    RegistryStore,
    async_publish_lock,
)
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType

from .common import BASE, TOKEN, USER, FakeRegistry
from .conftest import PASSWORD, REPOSITORY


def _excluded(path: str) -> bool:
    return any(
        (PurePath("data") / path).full_match(f"data/{pattern}")
        for pattern in EXCLUDE_FROM_BACKUP
    )


def test_the_vault_key_file_is_not_in_backups() -> None:
    """A copy of a backup must never carry the key that opens the public registry."""
    assert _excluded(".storage/registry_storage.ref1")
    assert _excluded(".storage/registry_storage.0123456789abcdef")
    assert not _excluded(".storage/core.config_entries")


@pytest.mark.usefixtures("patch_session")
async def test_missing_key_is_made_again_from_the_password(
    hass: HomeAssistant, registry: FakeRegistry
) -> None:
    """After a restore the key file is gone; the password makes it again."""
    vault = new_vault_key()
    header = wrap_vault_key(vault, PASSWORD)
    await async_publish_lock(
        RegistryClient(registry, BASE, USER, TOKEN),  # type: ignore[arg-type]
        REPOSITORY,
        header,
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
            CONF_KEY_REF: "ref9",
        },
    )
    entry.add_to_hass(hass)
    assert not await hass.config_entries.async_setup(entry.entry_id)
    assert entry.state is ConfigEntryState.SETUP_ERROR
    flows = hass.config_entries.flow.async_progress_by_handler(DOMAIN)
    assert [flow["context"]["source"] for flow in flows] == ["reauth"]
    assert flows[0]["step_id"] == "restore_key"

    result = await hass.config_entries.flow.async_configure(
        flows[0]["flow_id"], {CONF_PASSWORD: "not the password at all"}
    )
    assert result["errors"] == {"base": "wrong_password"}
    result = await hass.config_entries.flow.async_configure(
        flows[0]["flow_id"], {CONF_PASSWORD: PASSWORD}
    )
    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "reauth_successful"
    loaded = await KeyStore(hass, "ref9").async_load()
    assert loaded is not None
    assert loaded[0] == vault


@pytest.mark.parametrize(
    ("realm_host", "base_host", "expected"),
    [
        ("auth.docker.io", "registry-1.docker.io", True),
        ("ghcr.io", "ghcr.io", True),
        ("auth.registry.test", "registry.test", True),
        ("evil.example.com", "registry.test", False),
        ("registry.test.evil.com", "registry.test", False),
        ("10.0.0.5", "registry.test", False),
        ("192.168.1.2", "192.168.1.3", False),
        ("com", "example.com", False),
    ],
)
def test_sign_in_service_must_belong_to_the_registry(
    realm_host: str, base_host: str, expected: bool
) -> None:
    """The account name and token are not sent to an unrelated host."""
    assert _same_site(realm_host, base_host) is expected


async def test_an_older_index_put_back_is_noticed(
    registry: FakeRegistry, store: RegistryStore
) -> None:
    """Putting an older index back in place of the newer one is refused, not trusted."""
    await store.async_put_bytes(b"first", kind="file", name="a")
    tag = store._index_tag
    older = registry.repo_manifests(REPOSITORY)[tag]
    await store.async_put_bytes(b"second", kind="file", name="b")
    assert len(await store.async_list()) == 2
    registry.repo_manifests(REPOSITORY)[tag] = older
    with pytest.raises(LockError) as err:
        await store.async_list(refresh=True)
    assert err.value.reason is Reason.TAMPERED
