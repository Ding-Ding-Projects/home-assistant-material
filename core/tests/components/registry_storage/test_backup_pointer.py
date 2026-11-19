"""Tests for keeping only a pointer on this disk for backups in the registry."""

import hashlib
import json
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from pytest_homeassistant.common import MockConfigEntry
from pytest_homeassistant.typing import WebSocketGenerator

from homeassistant.components.backup import BackupDeleteProof
from homeassistant.components.backup.config import (
    delete_backups_exceeding_configured_count,
)
from homeassistant.components.backup.const import DATA_MANAGER
from homeassistant.components.backup.manager import BackupManager
from homeassistant.components.backup.pointer import (
    KEPT_GOING_BACK,
    KEPT_NEWEST,
    KEPT_NO_REGISTRY_COPY,
    STATE_MISSING,
    BackupPointer,
    PointerError,
    assert_no_secret,
)
from homeassistant.components.backup.self_check import KIND_LOCAL, _agent_kind
from homeassistant.components.backup.util import read_backup
from homeassistant.components.registry_storage.backup import RegistryBackupAgent
from homeassistant.components.registry_storage.errors import Reason, RegistryError
from homeassistant.components.registry_storage.store import KeyStore
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component

from .common import TOKEN, FakeRegistry
from .conftest import PASSWORD
from .test_backup import _opener, _setup

from tests.components.backup.test_self_check import _make_backup, _metadata

LOCAL_AGENT_ID = "backup.local"
OLD_ID = "bkold"
NEW_ID = "bknew"
ALLOWED_POINTER_FIELDS = set(BackupPointer.__dataclass_fields__)


@pytest.fixture
def hass_config_dir(tmp_path: Path) -> str:
    """Keep every backup file of a test in its own folder."""
    return tmp_path.as_posix()


async def _setup_all(hass: HomeAssistant) -> tuple[BackupManager, MockConfigEntry]:
    with (
        patch("homeassistant.components.backup.is_hassio", return_value=False),
        patch("homeassistant.components.backup.backup.is_hassio", return_value=False),
        patch("homeassistant.components.backup.services.is_hassio", return_value=False),
    ):
        assert await async_setup_component(hass, "backup", {})
        await hass.async_block_till_done(wait_background_tasks=True)
    entry = await _setup(hass)
    await hass.async_block_till_done(wait_background_tasks=True)
    return hass.data[DATA_MANAGER], entry


def _registry_agent(
    manager: BackupManager, entry: MockConfigEntry
) -> RegistryBackupAgent:
    agent = manager.backup_agents[f"registry_storage.{entry.entry_id}"]
    assert isinstance(agent, RegistryBackupAgent)
    return agent


async def _add_backup(
    hass: HomeAssistant,
    manager: BackupManager,
    agent: RegistryBackupAgent | None,
    backup_id: str,
    *,
    year: int = 2026,
    extra: dict[str, str] | None = None,
) -> bytes:
    """Write a real backup file here and, when given, put the same bytes in the registry."""
    path = Path(hass.config.path("backups", f"{backup_id}.tar"))
    path.parent.mkdir(parents=True, exist_ok=True)
    metadata = _metadata(slug=backup_id, date=f"{year}-01-01T00:00:00+00:00")
    if extra is not None:
        metadata["extra"] = extra
    await hass.async_add_executor_job(lambda: _make_backup(path, metadata=metadata))
    data = await hass.async_add_executor_job(path.read_bytes)
    if agent is not None:
        backup = await hass.async_add_executor_job(read_backup, path)
        await agent.async_upload_backup(
            open_stream=_opener(data),
            backup=backup,
            on_progress=lambda **kwargs: None,
        )
    local = manager.local_backup_agents[LOCAL_AGENT_ID]
    local._loaded_backups = False
    return data


async def _enable(manager: BackupManager, keep_whole: int = 0) -> None:
    await manager.pointers.async_set_settings(enabled=True, keep_whole=keep_whole)


def _local_files(hass: HomeAssistant) -> list[str]:
    return sorted(p.name for p in Path(hass.config.path("backups")).glob("*.tar"))


@pytest.mark.usefixtures("patch_session")
async def test_verified_swap_keeps_backup_listed(hass: HomeAssistant) -> None:
    """After a full read back matches, the copy here becomes a pointer and the backup stays listed."""
    manager, entry = await _setup_all(hass)
    agent = _registry_agent(manager, entry)
    data = await _add_backup(hass, manager, agent, OLD_ID)
    await _enable(manager)

    outcomes = await manager.pointers.async_run_pass()

    assert outcomes == {OLD_ID: "pointer"}
    assert _local_files(hass) == []
    pointer = manager.pointers.get(OLD_ID)
    assert pointer is not None
    assert pointer.size == len(data)
    assert pointer.check_value == f"sha256:{hashlib.sha256(data).hexdigest()}"
    assert pointer.agent_id == agent.agent_id
    assert pointer.parts == 1
    backups, _ = await manager.async_get_backups()
    assert list(backups[OLD_ID].agents) == [agent.agent_id]


@pytest.mark.parametrize(
    ("fault", "reason"),
    [
        pytest.param(RegistryError(Reason.UNAVAILABLE), "no_answer", id="no_answer"),
        pytest.param(RegistryError(Reason.TIMEOUT), "timed_out", id="timed_out"),
        pytest.param(RegistryError(Reason.INVALID_RESPONSE), "unknown", id="unknown"),
        pytest.param("tamper", "failed", id="tampered"),
    ],
)
@pytest.mark.usefixtures("patch_session")
async def test_each_failure_keeps_the_whole_copy(
    hass: HomeAssistant, fault: Any, reason: str
) -> None:
    """A read back that fails, is unknown or gets no answer keeps the whole copy and says why."""
    manager, entry = await _setup_all(hass)
    agent = _registry_agent(manager, entry)
    await _add_backup(hass, manager, agent, OLD_ID)
    await _enable(manager)
    await manager.async_get_backups()
    client = agent._store.client
    real_get_blob = client.async_get_blob

    async def broken(repository: str, digest: str, *args: Any, **kwargs: Any) -> bytes:
        if fault == "tamper":
            blob = await real_get_blob(repository, digest, *args, **kwargs)
            return blob[:-1] + bytes([blob[-1] ^ 1])
        raise fault

    with patch.object(client, "async_get_blob", side_effect=broken):
        outcomes = await manager.pointers.async_run_pass()

    assert outcomes == {OLD_ID: reason}
    assert _local_files(hass) == [f"{OLD_ID}.tar"]
    assert manager.pointers.get(OLD_ID) is None
    assert manager.pointers.kept()[OLD_ID].reason == reason


@pytest.mark.usefixtures("patch_session")
async def test_differing_registry_copy_keeps_whole(hass: HomeAssistant) -> None:
    """A registry copy that reads back fine but differs from the copy here is never trusted."""
    manager, entry = await _setup_all(hass)
    agent = _registry_agent(manager, entry)
    await _add_backup(hass, manager, agent, OLD_ID)
    path = Path(hass.config.path("backups", f"{OLD_ID}.tar"))
    await hass.async_add_executor_job(
        lambda: path.write_bytes(path.read_bytes() + b"\0" * 10)
    )
    await _enable(manager)

    assert await manager.pointers.async_run_pass() == {OLD_ID: "registry_copy_differs"}
    assert _local_files(hass) == [f"{OLD_ID}.tar"]


@pytest.mark.parametrize(
    ("keep_whole", "pointers"),
    [
        pytest.param(0, {OLD_ID, NEW_ID}, id="none"),
        pytest.param(1, {OLD_ID}, id="newest_1"),
        pytest.param(3, set(), id="newest_3"),
    ],
)
@pytest.mark.usefixtures("patch_session")
async def test_newest_kept_whole(
    hass: HomeAssistant, keep_whole: int, pointers: set[str]
) -> None:
    """The newest backups the owner chose stay whole on this disk."""
    manager, entry = await _setup_all(hass)
    agent = _registry_agent(manager, entry)
    await _add_backup(hass, manager, agent, OLD_ID, year=2025)
    await _add_backup(hass, manager, agent, NEW_ID, year=2026)
    await _enable(manager, keep_whole)

    outcomes = await manager.pointers.async_run_pass()

    assert set(manager.pointers.all()) == pointers
    for backup_id in {OLD_ID, NEW_ID} - pointers:
        assert outcomes[backup_id] == KEPT_NEWEST


@pytest.mark.usefixtures("patch_session")
async def test_pointer_holds_no_secret(
    hass: HomeAssistant, registry: FakeRegistry
) -> None:
    """The pointer file holds only the allowed facts: no key, password or token."""
    manager, entry = await _setup_all(hass)
    agent = _registry_agent(manager, entry)
    await _add_backup(hass, manager, agent, OLD_ID)
    await _enable(manager)
    await manager.pointers.async_run_pass()

    raw = await hass.async_add_executor_job(manager.pointers.path.read_text)
    stored = json.loads(raw)
    pointer = stored["pointers"][OLD_ID]
    assert set(pointer) == ALLOWED_POINTER_FIELDS
    assert_no_secret(pointer)
    vault_key, _ = await KeyStore(hass, "ref1").async_load()  # type: ignore[misc]
    for secret in (TOKEN, PASSWORD, vault_key.hex()):
        assert secret not in raw
    assert manager.pointers.path == Path(hass.config.path("backups", "pointers.json"))
    with pytest.raises(ValueError):
        assert_no_secret({**pointer, "token": "x"})


@pytest.mark.usefixtures("patch_session")
async def test_bring_back_round_trip(hass: HomeAssistant) -> None:
    """Bringing back writes the same bytes here, checks them and drops the pointer."""
    manager, entry = await _setup_all(hass)
    agent = _registry_agent(manager, entry)
    data = await _add_backup(hass, manager, agent, OLD_ID)
    await _enable(manager)
    await manager.pointers.async_run_pass()
    seen: list[tuple[int, int]] = []
    manager.pointers.async_subscribe(
        lambda: (
            seen.append(
                (
                    manager.pointers.transfer.bytes_done,
                    manager.pointers.transfer.parts_done,
                )
            )
            if manager.pointers.transfer
            else None
        )
    )

    local_id = await manager.pointers.async_bring_back(OLD_ID)

    assert local_id == LOCAL_AGENT_ID
    (name,) = _local_files(hass)
    path = Path(hass.config.path("backups", name))
    assert await hass.async_add_executor_job(path.read_bytes) == data
    assert manager.pointers.get(OLD_ID) is None
    transfer = manager.pointers.transfer
    assert transfer is not None
    assert transfer.state == "done"
    assert transfer.bytes_done == transfer.bytes_total == len(data)
    assert transfer.parts_done == transfer.parts_total == 1
    assert (len(data), 1) in seen
    backups, _ = await manager.async_get_backups()
    assert set(backups[OLD_ID].agents) == {LOCAL_AGENT_ID, agent.agent_id}


@pytest.mark.usefixtures("patch_session")
async def test_restore_from_pointer_round_trip(hass: HomeAssistant) -> None:
    """Restore brings the copy back, checks it, then restores it the normal way."""
    manager, entry = await _setup_all(hass)
    agent = _registry_agent(manager, entry)
    data = await _add_backup(hass, manager, agent, OLD_ID)
    await _enable(manager)
    await manager.pointers.async_run_pass()
    restored: dict[str, Any] = {}

    async def fake_restore(**kwargs: Any) -> None:
        # Core restores a local copy from its file, as the real restore does.
        local = manager.local_backup_agents[kwargs["agent_id"]]
        path = local.get_backup_path(kwargs["backup_id"])
        restored["data"] = await hass.async_add_executor_job(path.read_bytes)
        restored["agent_id"] = kwargs["agent_id"]

    with patch.object(
        manager._reader_writer,
        "async_restore_backup",
        AsyncMock(side_effect=fake_restore),
    ):
        await manager.pointers.async_restore(
            OLD_ID,
            password=None,
            restore_addons=None,
            restore_database=True,
            restore_folders=None,
            restore_homeassistant=True,
        )

    assert restored == {"data": data, "agent_id": LOCAL_AGENT_ID}
    assert manager.pointers.get(OLD_ID) is None


@pytest.mark.usefixtures("patch_session")
async def test_missing_registry_copy_detected(
    hass: HomeAssistant, registry: FakeRegistry, hass_ws_client: WebSocketGenerator
) -> None:
    """The daily check finds a missing copy; the backup is never offered as restorable."""
    manager, entry = await _setup_all(hass)
    agent = _registry_agent(manager, entry)
    await _add_backup(hass, manager, agent, OLD_ID)
    await _enable(manager)
    await manager.pointers.async_run_pass()
    assert await manager.pointers.async_check_all() == {OLD_ID: "present"}

    item, _ = (await agent._async_objects())[OLD_ID]
    repo = registry.repo_manifests(item.repository)
    body = repo[item.id]
    for key in [key for key, value in repo.items() if value == body]:
        del repo[key]

    assert await manager.pointers.async_check_all() == {OLD_ID: STATE_MISSING}
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "backup/pointer/info"})
    info = (await client.receive_json())["result"]
    assert info["pointers"][OLD_ID]["restorable"] is False
    assert info["summary"]["missing"] == 1
    with pytest.raises(PointerError) as err:
        await manager.pointers.async_bring_back(OLD_ID)
    assert err.value.reason == "registry_copy_missing"


@pytest.mark.usefixtures("patch_session")
async def test_delete_proof_pointer_cannot_be_deleted(hass: HomeAssistant) -> None:
    """A delete proof backup keeps its mark as a pointer; nothing of it can be deleted."""
    manager, entry = await _setup_all(hass)
    agent = _registry_agent(manager, entry)
    await _add_backup(hass, manager, agent, OLD_ID)
    await manager.delete_proof.async_set(
        OLD_ID, marked_by="owner", marked_by_name="Owner"
    )
    await _enable(manager)
    await manager.pointers.async_run_pass()
    assert manager.pointers.get(OLD_ID) is not None

    with pytest.raises(BackupDeleteProof):
        await manager.async_delete_backup(OLD_ID)
    with pytest.raises(BackupDeleteProof):
        await manager.async_delete_backup(OLD_ID, agent_ids=[agent.agent_id])

    assert manager.delete_proof.is_marked(OLD_ID)
    assert manager.pointers.get(OLD_ID) is not None
    assert [backup.backup_id for backup in await agent.async_list_backups()] == [OLD_ID]


@pytest.mark.usefixtures("patch_session")
async def test_going_back_backup_stays_whole_until_finished(
    hass: HomeAssistant,
) -> None:
    """The backup made before going back is never a pointer until going back finished."""
    manager, entry = await _setup_all(hass)
    agent = _registry_agent(manager, entry)
    await _add_backup(
        hass, manager, agent, OLD_ID, extra={"reason": "before_going_back"}
    )
    await _enable(manager)
    reader_writer = manager._reader_writer

    for answer in (False, None):
        with patch.object(
            reader_writer, "async_going_back_finished", AsyncMock(return_value=answer)
        ):
            assert await manager.pointers.async_run_pass() == {OLD_ID: KEPT_GOING_BACK}
    assert _local_files(hass) == [f"{OLD_ID}.tar"]

    with patch.object(
        reader_writer, "async_going_back_finished", AsyncMock(return_value=True)
    ):
        assert await manager.pointers.async_run_pass() == {OLD_ID: "pointer"}


@pytest.mark.usefixtures("patch_session")
async def test_no_verified_copy_never_a_pointer(hass: HomeAssistant) -> None:
    """Retention and a pass never make a pointer of a backup with no registry copy."""
    manager, _ = await _setup_all(hass)
    await _add_backup(hass, manager, None, OLD_ID, year=2025)
    await _add_backup(hass, manager, None, NEW_ID, year=2026)
    await _enable(manager)

    await delete_backups_exceeding_configured_count(manager)
    assert manager.pointers.all() == {}
    assert await manager.pointers.async_run_pass() == {
        OLD_ID: KEPT_NO_REGISTRY_COPY,
        NEW_ID: KEPT_NO_REGISTRY_COPY,
    }
    assert _local_files(hass) == [f"{NEW_ID}.tar", f"{OLD_ID}.tar"]


@pytest.mark.usefixtures("patch_session")
async def test_counts_and_self_check_treat_pointers_apart(hass: HomeAssistant) -> None:
    """A pointer is never counted as a copy on this system."""
    manager, entry = await _setup_all(hass)
    agent = _registry_agent(manager, entry)
    data = await _add_backup(hass, manager, agent, OLD_ID, year=2025)
    await _add_backup(hass, manager, agent, NEW_ID, year=2026)
    await _enable(manager, keep_whole=1)
    await manager.pointers.async_run_pass()

    backups, _ = await manager.async_get_backups()
    summary = manager.pointers.summary(backups)
    assert summary["whole_here"] == 1
    assert summary["pointers"] == 1
    assert 0 < summary["saved_bytes"] < len(data)
    local = await manager.local_backup_agents[LOCAL_AGENT_ID].async_list_backups()
    assert [backup.backup_id for backup in local] == [NEW_ID]
    assert all(
        _agent_kind(manager, agent_id) != KIND_LOCAL
        for agent_id in backups[OLD_ID].agents
    )
    assert any(
        _agent_kind(manager, agent_id) == KIND_LOCAL
        for agent_id in backups[NEW_ID].agents
    )


@pytest.mark.usefixtures("patch_session")
async def test_deleting_the_registry_copy_drops_the_pointer(
    hass: HomeAssistant,
) -> None:
    """When the backup is deleted, its pointer goes with it."""
    manager, entry = await _setup_all(hass)
    agent = _registry_agent(manager, entry)
    await _add_backup(hass, manager, agent, OLD_ID)
    await _enable(manager)
    await manager.pointers.async_run_pass()

    assert await manager.async_delete_backup(OLD_ID) == {}
    await hass.async_block_till_done()

    assert manager.pointers.get(OLD_ID) is None


@pytest.mark.parametrize(
    "message",
    [
        {"type": "backup/pointer/info"},
        {"type": "backup/pointer/settings", "enabled": True},
        {"type": "backup/pointer/run"},
        {"type": "backup/pointer/check"},
        {"type": "backup/pointer/bring_back", "backup_id": OLD_ID},
        {"type": "backup/pointer/restore", "backup_id": OLD_ID},
        {"type": "backup/pointer/subscribe"},
    ],
)
@pytest.mark.usefixtures("patch_session")
async def test_non_admin_refused(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    hass_read_only_access_token: str,
    message: dict[str, Any],
) -> None:
    """Every pointer command is for admins only."""
    await _setup_all(hass)
    client = await hass_ws_client(hass, hass_read_only_access_token)

    await client.send_json_auto_id(message)
    result = await client.receive_json()

    assert not result["success"]
    assert result["error"]["code"] == "unauthorized"


async def test_turning_on_needs_a_registry_place(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """Without a place that can be read back, the setting cannot be turned on."""
    with patch("homeassistant.components.backup.is_hassio", return_value=False):
        assert await async_setup_component(hass, "backup", {})
        await hass.async_block_till_done(wait_background_tasks=True)
    client = await hass_ws_client(hass)

    await client.send_json_auto_id({"type": "backup/pointer/info"})
    info = (await client.receive_json())["result"]
    assert info["available"] is False
    assert info["settings"] == {"enabled": False, "keep_whole": 1}

    await client.send_json_auto_id({"type": "backup/pointer/settings", "enabled": True})
    result = await client.receive_json()
    assert not result["success"]
    assert result["error"]["code"] == "no_registry_place"


@pytest.mark.usefixtures("patch_session")
async def test_settings_and_info_over_websocket(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """An admin turns it on, chooses three, and sees the pointer counted apart."""
    manager, entry = await _setup_all(hass)
    agent = _registry_agent(manager, entry)
    await _add_backup(hass, manager, agent, OLD_ID)
    client = await hass_ws_client(hass)

    await client.send_json_auto_id(
        {"type": "backup/pointer/settings", "enabled": True, "keep_whole": 0}
    )
    assert (await client.receive_json())["result"] == {
        "enabled": True,
        "keep_whole": 0,
    }
    await client.send_json_auto_id({"type": "backup/pointer/run"})
    assert (await client.receive_json())["result"] == {"outcomes": {OLD_ID: "pointer"}}
    await client.send_json_auto_id({"type": "backup/pointer/info"})
    info = (await client.receive_json())["result"]
    assert info["summary"]["pointers"] == 1
    assert info["summary"]["whole_here"] == 0
    assert info["pointers"][OLD_ID]["restorable"] is True
    assert info["places"] == [{"agent_id": agent.agent_id, "name": agent.name}]
