"""Tests for the backup self-check."""

from collections.abc import AsyncIterator
import io
import json
from pathlib import Path
import tarfile
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, patch

from securetar import SecureTarArchive

from homeassistant.components.backup import AddonInfo, Folder
from homeassistant.components.backup.agent import BackupAgentUnreachableError
from homeassistant.components.backup.manager import AgentBackupStatus, ManagerBackup
from homeassistant.components.backup.self_check import (
    CHECK_IDS,
    SelfCheckRunner,
    async_self_check,
    update_issue,
)
from homeassistant.core import HomeAssistant
from homeassistant.helpers import issue_registry as ir

KEY = "throwaway-test-key"
BACKUP_ID = "bk123"


def _add(tar: tarfile.TarFile, name: str, data: bytes) -> None:
    info = tarfile.TarInfo(name)
    info.size = len(data)
    tar.addfile(info, io.BytesIO(data))


def _inner(files: dict[str, bytes]) -> bytes:
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as tar:
        for name, data in files.items():
            _add(tar, name, data)
    return buffer.getvalue()


HA_FILES = {
    "data/configuration.yaml": b"default_config:\n",
    "data/.storage/core.config": b"{}",
    "data/home-assistant_v2.db": b"x" * 5000,
}


def _metadata(**overrides: Any) -> dict[str, Any]:
    data = {
        "slug": BACKUP_ID,
        "name": "Test",
        "date": "2026-01-01T00:00:00+00:00",
        "protected": False,
        "addons": [{"name": "Add", "slug": "addon_a", "version": "1.0"}],
        "folders": ["media"],
        "homeassistant": {"version": "2026.1.0", "exclude_database": False},
    }
    data.update(overrides)
    return data


def _make_backup(
    path: Path,
    *,
    metadata: dict[str, Any] | None = None,
    password: str | None = None,
    skip: tuple[str, ...] = (),
    ha_files: dict[str, bytes] | None = None,
) -> None:
    metadata = metadata or _metadata(protected=password is not None)
    members = {
        "homeassistant": ha_files if ha_files is not None else HA_FILES,
        "addon_a": {"data/file": b"a" * 100},
        "media": {"song": b"m" * 100},
    }
    with SecureTarArchive(path, "w", password=password, create_version=3) as archive:
        _add(archive.tar, "./backup.json", json.dumps(metadata).encode())
        for name, files in members.items():
            if name in skip:
                continue
            if password is None:
                _add(archive.tar, f"./{name}.tar.gz", _inner(files))
            else:
                with archive.create_tar(f"./{name}.tar.gz", gzip=True) as tar:
                    for file_name, data in files.items():
                        _add(tar, file_name, data)


class _LocalAgent:
    def __init__(self, path: Path) -> None:
        self.path = path

    def get_backup_path(self, backup_id: str) -> Path:
        return self.path


class _RemoteAgent:
    def __init__(self, data: bytes | Exception) -> None:
        self.data = data

    async def async_download_backup(
        self, backup_id: str, **kwargs: Any
    ) -> AsyncIterator[bytes]:
        if isinstance(self.data, Exception):
            raise self.data

        async def stream() -> AsyncIterator[bytes]:
            for i in range(0, len(self.data), 4096):
                yield self.data[i : i + 4096]

        return stream()


def _manager(
    hass: HomeAssistant,
    copies: dict[str, tuple[Any, bool, int]],
    password: str | None,
    *,
    database: bool = True,
) -> SimpleNamespace:
    """Return a stand-in manager. Copies are agent, protected, reported size."""
    backup = ManagerBackup(
        agents={
            agent_id: AgentBackupStatus(protected=protected, size=size)
            for agent_id, (_, protected, size) in copies.items()
        },
        addons=[AddonInfo(name="Add", slug="addon_a", version="1.0")],
        backup_id=BACKUP_ID,
        date="2026-01-01T00:00:00+00:00",
        database_included=database,
        extra_metadata={},
        failed_addons=[],
        failed_agent_ids=[],
        failed_folders=[],
        folders=[Folder.MEDIA],
        homeassistant_included=True,
        homeassistant_version="2026.1.0",
        name="Test",
        with_automatic_settings=None,
    )
    agents = {agent_id: agent for agent_id, (agent, _, _) in copies.items()}
    return SimpleNamespace(
        hass=hass,
        backup_agents=agents,
        local_backup_agents={
            agent_id: agent
            for agent_id, agent in agents.items()
            if isinstance(agent, _LocalAgent)
        },
        config=SimpleNamespace(
            data=SimpleNamespace(create_backup=SimpleNamespace(password=password))
        ),
        async_get_backup=AsyncMock(return_value=(backup, {})),
    )


def _statuses(result: Any) -> dict[str, tuple[str, str | None]]:
    return {check.check: (check.status, check.reason) for check in result.checks}


def _local(tmp_path: Path, **kwargs: Any) -> tuple[_LocalAgent, int]:
    path = tmp_path / "backup.tar"
    _make_backup(path, **kwargs)
    return _LocalAgent(path), path.stat().st_size


async def test_good_backup(hass: HomeAssistant, tmp_path: Path) -> None:
    """A complete unprotected backup passes every applicable check."""
    agent, size = _local(tmp_path)
    manager = _manager(hass, {"backup.local": (agent, False, size)}, None)

    result = await async_self_check(manager, BACKUP_ID)

    assert [check.check for check in result.checks] == list(CHECK_IDS)
    assert _statuses(result) == {
        "archive_complete": ("passed", None),
        "metadata_matches": ("passed", None),
        "key_unlocks": ("not_applicable", None),
        "parts_present": ("passed", None),
        "database_present": ("passed", None),
        "copies_match": ("not_applicable", None),
    }
    assert result.status == "passed"


async def test_good_protected_backup(hass: HomeAssistant, tmp_path: Path) -> None:
    """A protected backup unlocks with the configured key."""
    agent, size = _local(tmp_path, password=KEY)
    manager = _manager(hass, {"backup.local": (agent, True, size)}, KEY)

    result = await async_self_check(manager, BACKUP_ID)

    statuses = _statuses(result)
    assert statuses["key_unlocks"] == ("passed", None)
    assert statuses["parts_present"] == ("passed", None)
    assert statuses["database_present"] == ("passed", None)
    assert result.status == "passed"
    assert KEY not in json.dumps(result.to_dict())


async def test_truncated_archive(hass: HomeAssistant, tmp_path: Path) -> None:
    """A truncated archive fails the completeness check."""
    agent, size = _local(tmp_path)
    data = agent.path.read_bytes()
    agent.path.write_bytes(data[: size // 2])
    manager = _manager(hass, {"backup.local": (agent, False, size)}, None)

    result = await async_self_check(manager, BACKUP_ID)

    assert _statuses(result)["archive_complete"][0] == "failed"
    assert result.status == "failed"


async def test_wrong_key(hass: HomeAssistant, tmp_path: Path) -> None:
    """A backup which the configured key does not unlock fails the key check."""
    agent, size = _local(tmp_path, password=KEY)
    manager = _manager(hass, {"backup.local": (agent, True, size)}, "another-key")

    result = await async_self_check(manager, BACKUP_ID)

    statuses = _statuses(result)
    assert statuses["key_unlocks"] == ("failed", "wrong_key")
    assert statuses["database_present"][0] == "could_not_check"
    assert statuses["parts_present"] == ("passed", None)


async def test_protected_without_key(hass: HomeAssistant, tmp_path: Path) -> None:
    """Without a configured key the key check cannot run."""
    agent, size = _local(tmp_path, password=KEY)
    manager = _manager(hass, {"backup.local": (agent, True, size)}, None)

    result = await async_self_check(manager, BACKUP_ID)

    assert _statuses(result)["key_unlocks"] == ("could_not_check", "no_key_configured")
    assert result.status == "could_not_check"


async def test_missing_part(hass: HomeAssistant, tmp_path: Path) -> None:
    """A listed add-on which is not inside the archive fails the parts check."""
    agent, size = _local(tmp_path, skip=("addon_a",))
    manager = _manager(hass, {"backup.local": (agent, False, size)}, None)

    result = await async_self_check(manager, BACKUP_ID)

    parts = next(check for check in result.checks if check.check == "parts_present")
    assert parts.status == "failed"
    assert parts.detail == ["addon_a"]


async def test_metadata_mismatch(hass: HomeAssistant, tmp_path: Path) -> None:
    """backup.json which disagrees with the record fails the metadata check."""
    agent, size = _local(tmp_path, metadata=_metadata(slug="someone-else"))
    manager = _manager(hass, {"backup.local": (agent, False, size)}, None)

    result = await async_self_check(manager, BACKUP_ID)

    metadata = next(
        check for check in result.checks if check.check == "metadata_matches"
    )
    assert metadata.status == "failed"
    assert metadata.detail == ["backup_id"]


async def test_database_missing_cannot_be_judged(
    hass: HomeAssistant, tmp_path: Path
) -> None:
    """No database file may mean an external database, so it is not a failure."""
    files = {k: v for k, v in HA_FILES.items() if k != "data/home-assistant_v2.db"}
    agent, size = _local(tmp_path, ha_files=files)
    manager = _manager(hass, {"backup.local": (agent, False, size)}, None)

    result = await async_self_check(manager, BACKUP_ID)

    assert _statuses(result)["database_present"] == (
        "could_not_check",
        "no_database_file",
    )


async def test_copies_match_and_mismatch(hass: HomeAssistant, tmp_path: Path) -> None:
    """Two identical copies pass, a differing second copy fails."""
    agent, size = _local(tmp_path)
    data = agent.path.read_bytes()

    manager = _manager(
        hass,
        {
            "backup.local": (agent, False, size),
            "cloud.remote": (_RemoteAgent(data), False, size),
        },
        None,
    )
    assert _statuses(await async_self_check(manager, BACKUP_ID))["copies_match"] == (
        "passed",
        None,
    )

    altered = bytearray(data)
    altered[-100] ^= 0xFF
    manager = _manager(
        hass,
        {
            "backup.local": (agent, False, size),
            "cloud.remote": (_RemoteAgent(bytes(altered)), False, size),
        },
        None,
    )
    copies = next(
        check
        for check in (await async_self_check(manager, BACKUP_ID)).checks
        if check.check == "copies_match"
    )
    assert copies.status == "failed"
    assert copies.detail == ["backup.local", "cloud.remote"]


async def test_second_copy_wrong_size(hass: HomeAssistant, tmp_path: Path) -> None:
    """A copy which is not the size its agent reports fails."""
    agent, size = _local(tmp_path)
    data = agent.path.read_bytes()
    manager = _manager(
        hass,
        {
            "backup.local": (agent, False, size),
            "cloud.remote": (_RemoteAgent(data[:-1024]), False, size),
        },
        None,
    )

    copies = next(
        check
        for check in (await async_self_check(manager, BACKUP_ID)).checks
        if check.check == "copies_match"
    )
    assert copies.status == "failed"
    assert "cloud.remote" in copies.detail


async def test_unreachable_agent(hass: HomeAssistant) -> None:
    """A copy which cannot be downloaded cannot be checked."""
    manager = _manager(
        hass,
        {"cloud.remote": (_RemoteAgent(BackupAgentUnreachableError()), False, 10)},
        None,
    )

    result = await async_self_check(manager, BACKUP_ID)

    assert {check.status for check in result.checks} <= {
        "could_not_check",
        "not_applicable",
    }
    assert _statuses(result)["archive_complete"] == (
        "could_not_check",
        "backup_agent_unreachable",
    )


async def test_exception_becomes_could_not_check(hass: HomeAssistant) -> None:
    """An exception in a background self-check is stored, not raised."""
    manager = SimpleNamespace(
        hass=hass,
        known_backups=SimpleNamespace(set_self_check=lambda *args: stored.append(args)),
    )
    stored: list[tuple[Any, ...]] = []
    runner = SelfCheckRunner(manager)

    with patch(
        "homeassistant.components.backup.self_check.async_self_check",
        side_effect=RuntimeError("boom"),
    ):
        await runner._run(BACKUP_ID)

    assert stored[0][0] == BACKUP_ID
    assert stored[0][1]["status"] == "could_not_check"
    assert all(
        check["reason"] == "unexpected_error" for check in stored[0][1]["checks"]
    )


async def test_failed_check_creates_issue(
    hass: HomeAssistant, tmp_path: Path, issue_registry: ir.IssueRegistry
) -> None:
    """A failed self-check raises a repairs issue and a passing one clears it."""
    agent, size = _local(tmp_path, skip=("addon_a",))
    manager = _manager(hass, {"backup.local": (agent, False, size)}, None)
    result = await async_self_check(manager, BACKUP_ID)

    update_issue(hass, "Test", result)
    assert issue_registry.async_get_issue("backup", "backup_self_check_failed")

    agent, size = _local(tmp_path)
    manager = _manager(hass, {"backup.local": (agent, False, size)}, None)
    update_issue(hass, "Test", await async_self_check(manager, BACKUP_ID))
    assert not issue_registry.async_get_issue("backup", "backup_self_check_failed")
