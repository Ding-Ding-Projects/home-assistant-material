"""Tests for the container registry backup location."""

import os
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from pytest_homeassistant.common import MockConfigEntry

from homeassistant.components.backup import (
    AddonInfo,
    AgentBackup,
    BackupAgentError,
    BackupNotFound,
    Folder,
)
from homeassistant.components.backup.self_check import (
    REMOTE_MODE_FULL,
    REMOTE_MODE_LIGHT,
    SelfCheckSettings,
    async_self_check,
)
from homeassistant.components.registry_storage.backup import (
    RegistryBackupAgent,
    async_get_backup_agents,
    async_register_backup_agents_listener,
)
from homeassistant.components.registry_storage.const import (
    CONF_ADDRESS,
    CONF_BACKUPS_REPOSITORY,
    CONF_KEY_REF,
    CONF_REGISTRY,
    CONF_REPOSITORY,
    CONF_TOKEN,
    CONF_USERNAME,
    DOMAIN,
)
from homeassistant.components.registry_storage.crypto import (
    PART_SIZE,
    new_vault_key,
    wrap_vault_key,
)
from homeassistant.components.registry_storage.errors import (
    LockError,
    Reason,
    RegistryError,
)
from homeassistant.components.registry_storage.store import KeyStore
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant

from .common import TOKEN, USER, FakeRegistry
from .conftest import PASSWORD, REPOSITORY

from tests.components.backup.test_self_check import BACKUP_ID, _make_backup, _manager

BACKUPS_REPOSITORY = "tester/backups"


def _backup(
    backup_id: str = "bk1", size: int = 10, addons: int = 1, name: str = "Test"
) -> AgentBackup:
    return AgentBackup(
        addons=[
            AddonInfo(name=f"Add {i}", slug=f"addon_{i}", version="1.0")
            for i in range(addons)
        ],
        backup_id=backup_id,
        date="2026-01-01T00:00:00+00:00",
        database_included=True,
        extra_metadata={},
        folders=[Folder.MEDIA],
        homeassistant_included=True,
        homeassistant_version="2026.1.0",
        name=name,
        protected=False,
        size=size,
    )


async def _setup(hass: HomeAssistant, **options: Any) -> MockConfigEntry:
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
        options=options,
    )
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    return entry


async def _agent(hass: HomeAssistant) -> RegistryBackupAgent:
    (agent,) = await async_get_backup_agents(hass)
    assert isinstance(agent, RegistryBackupAgent)
    return agent


def _opener(data: bytes, chunk: int = 7000) -> Any:
    async def _open() -> Any:
        async def _stream() -> Any:
            for start in range(0, len(data), chunk):
                yield data[start : start + chunk]

        return _stream()

    return _open


async def _read(agent: RegistryBackupAgent, backup_id: str) -> bytes:
    return b"".join(
        [chunk async for chunk in await agent.async_download_backup(backup_id)]
    )


@pytest.mark.usefixtures("patch_session")
async def test_upload_download_list_delete(
    hass: HomeAssistant, registry: FakeRegistry
) -> None:
    """Upload then download gives the same bytes, and the registry holds no plain text."""
    await _setup(hass)
    agent = await _agent(hass)
    data = b"MARKER-PLAIN-TEXT" + os.urandom(PART_SIZE + 5000)
    backup = _backup(size=len(data))
    progress: list[int] = []

    await agent.async_upload_backup(
        open_stream=_opener(data),
        backup=backup,
        on_progress=lambda *, bytes_uploaded, **_: progress.append(bytes_uploaded),
    )

    assert progress[-1] == len(data)
    assert await _read(agent, "bk1") == data
    assert await agent.async_list_backups() == [backup]
    assert await agent.async_get_backup("bk1") == backup
    assert b"MARKER-PLAIN-TEXT" not in registry.stored_bytes()
    assert b"Test" not in registry.stored_bytes()

    await agent.async_delete_backup("bk1")
    assert await agent.async_list_backups() == []
    with pytest.raises(BackupNotFound):
        await agent.async_get_backup("bk1")
    with pytest.raises(BackupNotFound):
        await agent.async_download_backup("bk1")
    with pytest.raises(BackupNotFound):
        await agent.async_delete_backup("bk1")


@pytest.mark.usefixtures("patch_session")
async def test_listing_after_restart(hass: HomeAssistant) -> None:
    """Small and large details both come back from the encrypted index after a reload."""
    entry = await _setup(hass)
    agent = await _agent(hass)
    small = _backup("small", size=20)
    large = _backup("large", size=30, addons=40, name="Large")
    await agent.async_upload_backup(
        open_stream=_opener(b"s" * 20), backup=small, on_progress=lambda **_: None
    )
    await agent.async_upload_backup(
        open_stream=_opener(b"l" * 30), backup=large, on_progress=lambda **_: None
    )

    assert await hass.config_entries.async_reload(entry.entry_id)
    assert entry.state is ConfigEntryState.LOADED
    agent = await _agent(hass)

    assert {b.backup_id: b for b in await agent.async_list_backups()} == {
        "small": small,
        "large": large,
    }
    assert await _read(agent, "large") == b"l" * 30

    await agent.async_delete_backup("large")
    objects = await entry.runtime_data.store.async_list()
    assert [item.kind for item in objects] == ["backup"]


@pytest.mark.usefixtures("patch_session")
async def test_backups_repository_is_used(
    hass: HomeAssistant, registry: FakeRegistry
) -> None:
    """Backups go to the repository chosen for them, not the default one."""
    await _setup(hass, **{CONF_BACKUPS_REPOSITORY: BACKUPS_REPOSITORY})
    agent = await _agent(hass)
    await agent.async_upload_backup(
        open_stream=_opener(b"x" * 10), backup=_backup(), on_progress=lambda **_: None
    )

    assert len(await agent.async_list_backups()) == 1
    stored = await agent._store.async_list(BACKUPS_REPOSITORY)
    assert [item.kind for item in stored] == ["backup"]
    assert await agent._store.async_list(REPOSITORY) == []


@pytest.mark.usefixtures("patch_session")
@pytest.mark.parametrize(
    ("reason", "key"),
    [
        (Reason.RATE_LIMITED, "backup_registry_busy"),
        (Reason.UNAVAILABLE, "backup_registry_busy"),
        (Reason.AUTH_FAILED, "backup_registry_refused"),
        (Reason.DENIED, "backup_registry_refused"),
        (Reason.WRONG_PASSWORD, "backup_damaged"),
        (Reason.TAMPERED, "backup_damaged"),
        (Reason.REJECTED, "backup_failed"),
    ],
)
async def test_errors_carry_the_reason(
    hass: HomeAssistant, reason: Reason, key: str
) -> None:
    """A registry or lock error becomes a backup error with the reason code."""
    entry = await _setup(hass)
    agent = await _agent(hass)
    error = (
        LockError(reason)
        if reason in (Reason.WRONG_PASSWORD, Reason.TAMPERED)
        else RegistryError(reason)
    )

    with (
        patch.object(entry.runtime_data.store, "async_list", side_effect=error),
        patch.object(entry, "async_start_reauth") as reauth,
        pytest.raises(BackupAgentError) as raised,
    ):
        await agent.async_list_backups()

    assert raised.value.translation_key == key
    assert raised.value.translation_placeholders == {"reason": str(reason)}
    assert reauth.called is (reason is Reason.AUTH_FAILED)


@pytest.mark.usefixtures("patch_session")
async def test_upload_refused_cleans_up_details(hass: HomeAssistant) -> None:
    """A refused upload is a backup error and leaves no details object behind."""
    entry = await _setup(hass)
    agent = await _agent(hass)
    store = entry.runtime_data.store
    large = _backup("large", size=30, addons=40)

    with (
        patch.object(
            store,
            "async_put_stream",
            AsyncMock(side_effect=RegistryError(Reason.REJECTED)),
        ),
        pytest.raises(BackupAgentError) as raised,
    ):
        await agent.async_upload_backup(
            open_stream=_opener(b"l" * 30), backup=large, on_progress=lambda **_: None
        )

    assert raised.value.translation_key == "backup_failed"
    assert raised.value.translation_placeholders == {"reason": "rejected"}
    assert await store.async_list() == []


@pytest.mark.usefixtures("patch_session")
async def test_short_stream_is_refused(hass: HomeAssistant) -> None:
    """A stream that ends before the stated size is not stored."""
    entry = await _setup(hass)
    agent = await _agent(hass)

    with pytest.raises(BackupAgentError):
        await agent.async_upload_backup(
            open_stream=_opener(b"x" * 5),
            backup=_backup(size=10),
            on_progress=lambda **_: None,
        )

    assert await entry.runtime_data.store.async_list() == []


@pytest.mark.usefixtures("patch_session")
async def test_agent_listener_follows_the_place(hass: HomeAssistant) -> None:
    """The Backups page is told when a place loads or unloads."""
    calls: list[int] = []
    remove = async_register_backup_agents_listener(
        hass, listener=lambda: calls.append(1)
    )
    entry = await _setup(hass)
    loaded = len(calls)
    assert loaded >= 1

    assert await hass.config_entries.async_unload(entry.entry_id)
    assert len(calls) > loaded
    remove()


@pytest.mark.usefixtures("patch_session")
@pytest.mark.parametrize(
    ("mode", "expected"),
    [
        (REMOTE_MODE_FULL, ("full", "verified_in_full", None)),
        (REMOTE_MODE_LIGHT, ("light", "could_not_check", "no_reference_size")),
    ],
)
async def test_self_check_passes_on_a_stored_copy(
    hass: HomeAssistant,
    tmp_path: Path,
    mode: str,
    expected: tuple[str, str, str | None],
) -> None:
    """A real backup stored in the registry is a remote copy that checks out."""
    await _setup(hass)
    agent = await _agent(hass)
    path = tmp_path / "backup.tar"
    _make_backup(path)
    data = path.read_bytes()
    backup = AgentBackup(
        addons=[AddonInfo(name="Add", slug="addon_a", version="1.0")],
        backup_id=BACKUP_ID,
        date="2026-01-01T00:00:00+00:00",
        database_included=True,
        extra_metadata={},
        folders=[Folder.MEDIA],
        homeassistant_included=True,
        homeassistant_version="2026.1.0",
        name="Test",
        protected=False,
        size=len(data),
    )
    await agent.async_upload_backup(
        open_stream=_opener(data), backup=backup, on_progress=lambda **_: None
    )
    manager = _manager(hass, {agent.agent_id: (agent, False, len(data))}, None)

    result = await async_self_check(
        manager, BACKUP_ID, settings=SelfCheckSettings(remote_mode=mode)
    )

    assert result is not None
    (copy,) = result.copies
    assert copy.agent_id == agent.agent_id
    assert (copy.method, copy.status, copy.reason) == expected
