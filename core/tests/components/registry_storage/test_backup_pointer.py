"""Tests for keeping only a pointer on this disk for backups in the registry."""

import asyncio
import errno
import hashlib
import json
import logging
from pathlib import Path
import tarfile
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from pytest_homeassistant.common import MockConfigEntry
from pytest_homeassistant.typing import WebSocketGenerator

from homeassistant.components.backup import BackupDeleteProof, BackupNotFound
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
    summary = manager.pointers.summary(
        {backup_id: list(backup.agents) for backup_id, backup in backups.items()}
    )
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


@pytest.mark.usefixtures("patch_session")
async def test_info_names_a_registry_that_did_not_answer(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """A registry that fails to list is reported unreachable; the pointer is not called missing."""
    manager, entry = await _setup_all(hass)
    agent = _registry_agent(manager, entry)
    await _add_backup(hass, manager, agent, OLD_ID)
    await _enable(manager)
    assert await manager.pointers.async_run_pass() == {OLD_ID: "pointer"}
    client = await hass_ws_client(hass)

    with patch.object(
        agent,
        "async_list_backups",
        AsyncMock(side_effect=RegistryError(Reason.UNAVAILABLE)),
    ):
        await client.send_json_auto_id({"type": "backup/pointer/info"})
        info = (await client.receive_json())["result"]

    assert info["unreachable"] == [agent.agent_id]
    assert info["pointers"][OLD_ID]["restorable"] is True
    assert info["summary"]["missing"] == 0


@pytest.mark.usefixtures("patch_session")
async def test_info_does_not_wait_for_a_silent_registry(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """A registry that never answers holds the page only for the short limit."""
    manager, entry = await _setup_all(hass)
    agent = _registry_agent(manager, entry)
    await _add_backup(hass, manager, agent, OLD_ID)
    await _add_backup(hass, manager, None, NEW_ID, year=2027)
    await _enable(manager)
    assert (await manager.pointers.async_run_pass())[OLD_ID] == "pointer"
    client = await hass_ws_client(hass)

    async def never(**kwargs: Any) -> list[Any]:
        await asyncio.Event().wait()
        return []

    with (
        patch.object(agent, "async_list_backups", never),
        patch(
            "homeassistant.components.backup.pointer_websocket.INFO_LIST_TIMEOUT",
            0.05,
        ),
    ):
        await client.send_json_auto_id({"type": "backup/pointer/info"})
        info = (await client.receive_json())["result"]

    assert info["unreachable"] == [agent.agent_id]
    assert info["summary"]["pointers"] == 1
    assert info["summary"]["whole_here"] == 1
    assert info["pointers"][OLD_ID]["restorable"] is True


async def _pointer_ready(hass: HomeAssistant) -> tuple[BackupManager, bytes]:
    """Set up a place, make one backup a pointer and return the manager and its bytes."""
    manager, entry = await _setup_all(hass)
    agent = _registry_agent(manager, entry)
    data = await _add_backup(hass, manager, agent, OLD_ID)
    await _enable(manager)
    assert await manager.pointers.async_run_pass() == {OLD_ID: "pointer"}
    return manager, data


def _leftovers(hass: HomeAssistant) -> list[str]:
    """Partial files the bring back may have left in the backup folder."""
    return sorted(p.name for p in Path(hass.config.path("backups")).glob(".*.part"))


@pytest.mark.usefixtures("patch_session")
async def test_bring_back_over_websocket_end_to_end(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """The page's bring back call writes the same bytes here, lists them and drops the pointer."""
    manager, data = await _pointer_ready(hass)
    client = await hass_ws_client(hass)

    await client.send_json_auto_id(
        {"type": "backup/pointer/bring_back", "backup_id": OLD_ID}
    )
    result = await client.receive_json()

    assert result["success"], result
    assert result["result"] == {"agent_id": LOCAL_AGENT_ID}
    (name,) = _local_files(hass)
    path = Path(hass.config.path("backups", name))
    assert await hass.async_add_executor_job(path.read_bytes) == data
    assert _leftovers(hass) == []
    assert manager.pointers.get(OLD_ID) is None
    assert manager.pointers.transfer is not None
    assert manager.pointers.transfer.state == "done"
    local = manager.local_backup_agents[LOCAL_AGENT_ID]
    assert local.get_backup_path(OLD_ID) == path
    await client.send_json_auto_id({"type": "backup/pointer/info"})
    info = (await client.receive_json())["result"]
    assert info["pointers"] == {}
    assert info["summary"]["whole_here"] == 1
    assert info["transfer"]["state"] == "done"


@pytest.mark.parametrize(
    ("target", "fault", "reason", "detail"),
    [
        pytest.param(
            "receive_file",
            OSError(errno.ENOSPC, "No space left on device"),
            "disk_full",
            "ENOSPC",
            id="disk_full",
        ),
        pytest.param(
            "receive_file",
            OSError(errno.EIO, "Input/output error"),
            "disk_error",
            "EIO",
            id="disk_error",
        ),
        pytest.param(
            "move",
            PermissionError(errno.EACCES, "Permission denied"),
            "disk_refused",
            "EACCES",
            id="disk_refused",
        ),
        pytest.param(
            "read_backup",
            tarfile.ReadError("not a tar file"),
            "check_failed",
            "unreadable archive",
            id="unreadable_copy",
        ),
    ],
)
@pytest.mark.usefixtures("patch_session")
async def test_bring_back_disk_failures(
    hass: HomeAssistant,
    caplog: pytest.LogCaptureFixture,
    target: str,
    fault: Exception,
    reason: str,
    detail: str,
) -> None:
    """A copy this disk cannot take keeps the pointer, leaves nothing behind and logs why."""
    manager, _ = await _pointer_ready(hass)
    targets = {
        "receive_file": "homeassistant.components.backup.pointer.receive_file",
        "move": "homeassistant.components.backup.pointer.shutil.move",
        "read_backup": "homeassistant.components.backup.pointer.read_backup",
    }
    caplog.set_level(logging.WARNING)

    with (
        patch(targets[target], side_effect=fault),
        patch("homeassistant.components.backup.pointer.time.sleep"),
        pytest.raises(PointerError) as err,
    ):
        await manager.pointers.async_bring_back(OLD_ID)

    assert err.value.reason == reason
    assert str(err.value) == detail
    transfer = manager.pointers.transfer
    assert transfer is not None
    assert (transfer.state, transfer.reason, transfer.detail) == (
        "failed",
        reason,
        detail,
    )
    assert manager.pointers.get(OLD_ID) is not None
    assert _local_files(hass) == []
    assert _leftovers(hass) == []
    # Logged at warning level with the reason and the exception, never a secret.
    assert f"Bringing back backup {OLD_ID}" in caplog.text
    assert f"(reason {reason})" in caplog.text
    assert any(
        record.levelno == logging.WARNING and record.exc_info
        for record in caplog.records
    )
    assert PASSWORD not in caplog.text
    assert TOKEN not in caplog.text


@pytest.mark.parametrize(
    ("fault", "reason"),
    [
        pytest.param(
            RegistryError(Reason.AUTH_FAILED), "registry_refused", id="refused"
        ),
        pytest.param(RegistryError(Reason.UNAVAILABLE), "no_answer", id="no_answer"),
    ],
)
@pytest.mark.usefixtures("patch_session")
async def test_bring_back_registry_failures(
    hass: HomeAssistant, caplog: pytest.LogCaptureFixture, fault: Any, reason: str
) -> None:
    """A registry that refuses or does not answer is named as such, not as this disk."""
    manager, _ = await _pointer_ready(hass)
    agent = manager.backup_agents[manager.pointers.get(OLD_ID).agent_id]
    caplog.set_level(logging.WARNING)

    with (
        patch.object(agent._store.client, "async_get_blob", side_effect=fault),
        pytest.raises(PointerError) as err,
    ):
        await manager.pointers.async_bring_back(OLD_ID)

    assert err.value.reason == reason
    assert manager.pointers.get(OLD_ID) is not None
    assert _local_files(hass) == []
    assert _leftovers(hass) == []
    assert f"(reason {reason})" in caplog.text


@pytest.mark.usefixtures("patch_session")
async def test_bring_back_registry_copy_gone(hass: HomeAssistant) -> None:
    """A registry that no longer has the backup says the copy is missing."""
    manager, _ = await _pointer_ready(hass)
    agent = manager.backup_agents[manager.pointers.get(OLD_ID).agent_id]

    with (
        patch.object(
            agent, "async_download_backup", side_effect=BackupNotFound("gone")
        ),
        pytest.raises(PointerError) as err,
    ):
        await manager.pointers.async_bring_back(OLD_ID)

    assert err.value.reason == "registry_copy_missing"
    assert manager.pointers.get(OLD_ID) is not None


@pytest.mark.usefixtures("patch_session")
async def test_bring_back_waits_out_a_brief_lock(hass: HomeAssistant) -> None:
    """A file another program holds for a moment is moved once it lets go."""
    manager, data = await _pointer_ready(hass)
    real_move = __import__("shutil").move
    calls: list[int] = []

    def flaky_move(source: Any, target: Any) -> Any:
        calls.append(1)
        if len(calls) == 1:
            raise OSError(errno.EBUSY, "Device or resource busy")
        return real_move(source, target)

    with (
        patch(
            "homeassistant.components.backup.pointer.shutil.move",
            side_effect=flaky_move,
        ),
        patch("homeassistant.components.backup.pointer.time.sleep"),
    ):
        assert await manager.pointers.async_bring_back(OLD_ID) == LOCAL_AGENT_ID

    assert len(calls) == 2
    (name,) = _local_files(hass)
    path = Path(hass.config.path("backups", name))
    assert await hass.async_add_executor_job(path.read_bytes) == data
    assert _leftovers(hass) == []


@pytest.mark.usefixtures("patch_session")
async def test_pass_progress_is_sent_to_the_page(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """A page subscribed to the pointers hears a pass start and end, with its result."""
    manager, entry = await _setup_all(hass)
    agent = _registry_agent(manager, entry)
    await _add_backup(hass, manager, agent, OLD_ID)
    await _enable(manager)
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "backup/pointer/subscribe"})
    assert (await client.receive_json())["success"]
    first = (await client.receive_json())["event"]
    assert first["pass"]["running"] is False
    # Turning it on schedules a pass a little later; the page is told when.
    assert first["pass"]["due"] is not None

    await client.send_json_auto_id({"type": "backup/pointer/run"})
    events: list[dict[str, Any]] = []
    while True:
        message = await client.receive_json()
        if message.get("type") == "result":
            assert message["result"] == {"outcomes": {OLD_ID: "pointer"}}
            break
        events.append(message["event"])

    assert any(event["pass"]["running"] for event in events)
    last = events[-1]
    assert last["pass"]["running"] is False
    assert last["pass"]["made"] == 1
    assert last["pass"]["outcomes"] == {"pointer": 1}
    assert last["revision"] > first["revision"]


@pytest.mark.usefixtures("patch_session")
async def test_pass_with_nothing_to_do_reports_it(hass: HomeAssistant) -> None:
    """A pass with no backup here ends with an empty result the page can explain."""
    manager, _ = await _setup_all(hass)
    await _enable(manager)

    assert await manager.pointers.async_run_pass() == {}

    state = manager.pointers.pass_state
    assert state.running is False
    assert state.finished is not None
    assert (state.made, state.outcomes) == (0, {})
