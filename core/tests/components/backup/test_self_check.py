"""Tests for the backup self-check."""

import asyncio
from collections.abc import AsyncIterator
import io
import json
from pathlib import Path
import tarfile
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from pytest_homeassistant.typing import WebSocketGenerator
from securetar import SecureTarArchive

from homeassistant.components.backup import AddonInfo, Folder
from homeassistant.components.backup.agent import BackupAgentUnreachableError
from homeassistant.components.backup.const import DATA_MANAGER
from homeassistant.components.backup.manager import (
    AgentBackupStatus,
    BackupManagerState,
    CreateBackupEvent,
    CreateBackupStage,
    CreateBackupState,
    IdleEvent,
    ManagerBackup,
)
from homeassistant.components.backup.models import BackupNotFound
from homeassistant.components.backup.self_check import (
    CHECK_IDS,
    REMOTE_MODE_FULL,
    REMOTE_MODE_LIGHT,
    REMOTE_MODE_OFF,
    CopyResult,
    SelfCheckRunner,
    SelfCheckSettings,
    async_check_location,
    async_self_check,
    update_issue,
)
from homeassistant.core import HomeAssistant
from homeassistant.helpers import issue_registry as ir

from .common import setup_backup_integration

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
    def __init__(
        self,
        data: bytes | Exception,
        *,
        error_after_first_chunk: Exception | None = None,
    ) -> None:
        self.data = data
        self.error_after_first_chunk = error_after_first_chunk
        self.downloads = 0
        self.served = 0

    async def async_download_backup(
        self, backup_id: str, **kwargs: Any
    ) -> AsyncIterator[bytes]:
        self.downloads += 1
        if isinstance(self.data, Exception):
            raise self.data
        data = self.data

        async def stream() -> AsyncIterator[bytes]:
            for i in range(0, len(data), 4096):
                if i and self.error_after_first_chunk is not None:
                    raise self.error_after_first_chunk
                self.served += len(data[i : i + 4096])
                yield data[i : i + 4096]

        return stream()


def _manager(
    hass: HomeAssistant,
    copies: dict[str, tuple[Any, bool, int]],
    password: str | None,
    *,
    database: bool = True,
    agent_errors: dict[str, Exception] | None = None,
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
        async_get_backup=AsyncMock(return_value=(backup, agent_errors or {})),
        state=BackupManagerState.IDLE,
    )


FULL = SelfCheckSettings(remote_mode=REMOTE_MODE_FULL, max_full_download_bytes=None)
LIGHT = SelfCheckSettings(remote_mode=REMOTE_MODE_LIGHT)
OFF = SelfCheckSettings(remote_mode=REMOTE_MODE_OFF)


def _copies(result: Any) -> dict[str, tuple[str, str, str | None]]:
    return {
        copy.agent_id: (copy.method, copy.status, copy.reason) for copy in result.copies
    }


def _check(result: Any, check_id: str) -> Any:
    return next(check for check in result.checks if check.check == check_id)


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
    assert _statuses(await async_self_check(manager, BACKUP_ID, settings=FULL))[
        "copies_match"
    ] == ("passed", None)

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
        for check in (await async_self_check(manager, BACKUP_ID, settings=FULL)).checks
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
        for check in (await async_self_check(manager, BACKUP_ID, settings=FULL)).checks
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

    result = await async_self_check(manager, BACKUP_ID, settings=FULL)

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
        state=BackupManagerState.IDLE,
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


async def test_light_check_does_not_download(
    hass: HomeAssistant, tmp_path: Path
) -> None:
    """The default check opens a remote copy but never reads it to its end."""
    agent, size = _local(tmp_path)
    remote = _RemoteAgent(agent.path.read_bytes())
    manager = _manager(
        hass,
        {
            "backup.local": (agent, False, size),
            "cloud.remote": (remote, False, size),
        },
        None,
    )

    result = await async_self_check(manager, BACKUP_ID, settings=LIGHT)

    assert _copies(result) == {
        "backup.local": ("full", "verified_in_full", None),
        "cloud.remote": ("light", "present_size_matches", None),
    }
    assert result.copies[1].opened is True
    assert remote.downloads == 1
    assert remote.served <= 4096 < size
    assert _check(result, "copies_match").status == "passed"
    assert result.status == "passed"


async def test_light_check_size_differs(hass: HomeAssistant, tmp_path: Path) -> None:
    """A remote copy which reports another size than the local one is flagged."""
    agent, size = _local(tmp_path)
    remote = _RemoteAgent(agent.path.read_bytes())
    manager = _manager(
        hass,
        {
            "backup.local": (agent, False, size),
            "cloud.remote": (remote, False, size - 10),
        },
        None,
    )

    result = await async_self_check(manager, BACKUP_ID, settings=LIGHT)

    assert _copies(result)["cloud.remote"] == (
        "light",
        "present_size_differs",
        "size_mismatch",
    )
    assert result.copies[1].size_expected == size
    assert remote.downloads == 0
    assert _check(result, "copies_match").status == "failed"
    assert _check(result, "copies_match").detail == ["cloud.remote"]


async def test_light_check_missing_copy_raises_issue(
    hass: HomeAssistant, tmp_path: Path, issue_registry: ir.IssueRegistry
) -> None:
    """A copy which is gone raises an issue that names the location."""
    agent, size = _local(tmp_path)
    manager = _manager(
        hass,
        {
            "backup.local": (agent, False, size),
            "cloud.remote": (_RemoteAgent(BackupNotFound()), False, size),
        },
        None,
    )

    result = await async_self_check(manager, BACKUP_ID, settings=LIGHT)
    update_issue(hass, "Test", result)

    assert _copies(result)["cloud.remote"] == ("light", "missing", "backup_not_found")
    issue = issue_registry.async_get_issue("backup", "backup_self_check_failed")
    assert issue
    details = issue.translation_placeholders["details"]
    assert "cloud.remote (the copy is missing)" in details


@pytest.mark.parametrize(
    ("error", "reason"),
    [
        (BackupAgentUnreachableError(), "backup_agent_unreachable"),
        (TimeoutError(), "timeout"),
        (RuntimeError("throttled"), "read_error"),
    ],
)
async def test_light_check_errors_are_not_failures(
    hass: HomeAssistant,
    tmp_path: Path,
    issue_registry: ir.IssueRegistry,
    error: Exception,
    reason: str,
) -> None:
    """A throttled or unreachable location is reported as not checked, no issue."""
    agent, size = _local(tmp_path)
    manager = _manager(
        hass,
        {
            "backup.local": (agent, False, size),
            "cloud.remote": (_RemoteAgent(error), False, size),
        },
        None,
    )

    result = await async_self_check(manager, BACKUP_ID, settings=LIGHT)
    update_issue(hass, "Test", result)

    assert _copies(result)["cloud.remote"] == ("light", "could_not_check", reason)
    assert _check(result, "copies_match").status == "could_not_check"
    assert not issue_registry.async_get_issue("backup", "backup_self_check_failed")


async def test_remote_checks_off(hass: HomeAssistant, tmp_path: Path) -> None:
    """With remote checks off the remote copy is not touched, nor passed."""
    agent, size = _local(tmp_path)
    remote = _RemoteAgent(agent.path.read_bytes())
    manager = _manager(
        hass,
        {
            "backup.local": (agent, False, size),
            "cloud.remote": (remote, False, size),
        },
        None,
    )

    result = await async_self_check(manager, BACKUP_ID, settings=OFF)

    assert _copies(result)["cloud.remote"] == (
        "none",
        "not_checked",
        "remote_checks_off",
    )
    assert remote.downloads == 0
    assert _check(result, "copies_match").status == "could_not_check"
    assert _check(result, "copies_match").reason == "remote_checks_off"


async def test_remote_only_light_cannot_judge_content(hass: HomeAssistant) -> None:
    """Without a local copy the content is not judged without a full download."""
    manager = _manager(
        hass,
        {"cloud.remote": (_RemoteAgent(b"x" * 10000), False, 10000)},
        None,
    )

    result = await async_self_check(manager, BACKUP_ID, settings=LIGHT)

    assert _statuses(result)["archive_complete"] == (
        "could_not_check",
        "remote_copy_not_downloaded",
    )
    assert result.status == "could_not_check"


async def test_full_mode_over_size_limit_is_downgraded(
    hass: HomeAssistant, tmp_path: Path
) -> None:
    """A full download above the size limit is replaced by the light check."""
    agent, size = _local(tmp_path)
    remote = _RemoteAgent(agent.path.read_bytes())
    manager = _manager(
        hass,
        {
            "backup.local": (agent, False, size),
            "cloud.remote": (remote, False, size),
        },
        None,
    )
    settings = SelfCheckSettings(
        remote_mode=REMOTE_MODE_FULL, max_full_download_bytes=size - 1
    )

    result = await async_self_check(manager, BACKUP_ID, settings=settings)

    assert _copies(result)["cloud.remote"] == (
        "light",
        "present_size_matches",
        None,
    )
    assert result.copies[1].downgraded == "over_size_limit"
    assert remote.served <= 4096


async def test_full_download_cut_off_is_not_a_failure(
    hass: HomeAssistant, tmp_path: Path, issue_registry: ir.IssueRegistry
) -> None:
    """A download which breaks half way, for example on throttling, is no failure."""
    agent, size = _local(tmp_path)
    remote = _RemoteAgent(
        agent.path.read_bytes(), error_after_first_chunk=RuntimeError("429")
    )
    manager = _manager(
        hass,
        {
            "backup.local": (agent, False, size),
            "cloud.remote": (remote, False, size),
        },
        None,
    )

    result = await async_self_check(manager, BACKUP_ID, settings=FULL)
    update_issue(hass, "Test", result)

    assert _copies(result)["cloud.remote"] == ("full", "could_not_check", "read_error")
    assert not issue_registry.async_get_issue("backup", "backup_self_check_failed")


async def test_listing_error_is_reported_per_location(
    hass: HomeAssistant, tmp_path: Path
) -> None:
    """A location which cannot be asked about shows up as not checked."""
    agent, size = _local(tmp_path)
    manager = _manager(
        hass,
        {"backup.local": (agent, False, size)},
        None,
        agent_errors={"cloud.remote": BackupAgentUnreachableError()},
    )

    result = await async_self_check(manager, BACKUP_ID, settings=LIGHT)

    assert _copies(result)["cloud.remote"] == (
        "none",
        "could_not_check",
        "backup_agent_unreachable",
    )


async def test_check_location_light_and_full(
    hass: HomeAssistant, tmp_path: Path
) -> None:
    """One location can be checked again lightly or with a full download."""
    agent, size = _local(tmp_path)
    data = agent.path.read_bytes()
    altered = bytearray(data)
    altered[-100] ^= 0xFF
    manager = _manager(
        hass,
        {
            "backup.local": (agent, False, size),
            "cloud.good": (_RemoteAgent(data), False, size),
            "cloud.bad": (_RemoteAgent(bytes(altered)), False, size),
        },
        None,
    )

    light = await async_check_location(
        manager, BACKUP_ID, "cloud.bad", full_download=False
    )
    full_good = await async_check_location(
        manager, BACKUP_ID, "cloud.good", full_download=True
    )
    full_bad = await async_check_location(
        manager, BACKUP_ID, "cloud.bad", full_download=True
    )

    assert (light.method, light.status) == ("light", "present_size_matches")
    assert (full_good.method, full_good.status) == ("full", "verified_in_full")
    assert (full_bad.method, full_bad.status, full_bad.reason) == (
        "full",
        "content_differs",
        "digest_differs_from_other_copy",
    )
    assert manager.backup_agents["cloud.good"].served == len(data)


async def test_check_location_without_backup(hass: HomeAssistant) -> None:
    """A location which does not hold the backup reports it missing."""
    manager = _manager(hass, {"cloud.here": (_RemoteAgent(b"x"), False, 1)}, None)
    manager.backup_agents["cloud.elsewhere"] = _RemoteAgent(b"x")

    copy = await async_check_location(
        manager, BACKUP_ID, "cloud.elsewhere", full_download=False
    )
    manager.async_get_backup = AsyncMock(return_value=(None, {}))
    nothing = await async_check_location(
        manager, BACKUP_ID, "cloud.elsewhere", full_download=False
    )

    assert (copy.status, copy.reason) == ("missing", "backup_not_found")
    assert nothing is None


async def test_settings_are_stored_and_validated(hass: HomeAssistant) -> None:
    """Settings persist, and bad stored data falls back to the safe default."""
    manager = SimpleNamespace(hass=hass)
    runner = SelfCheckRunner(manager)

    defaults = await runner.async_get_settings()
    assert (defaults.remote_mode, defaults.max_full_download_bytes) == (
        "light",
        1024**3,
    )
    await runner.async_update_settings(remote_mode="full", max_full_download_bytes=None)
    settings = await SelfCheckRunner(manager).async_get_settings()
    assert (settings.remote_mode, settings.max_full_download_bytes) == ("full", None)

    broken = SelfCheckSettings.from_dict(
        {"remote_mode": "everything", "max_full_download_bytes": -5}
    )
    assert broken == SelfCheckSettings()
    assert SelfCheckSettings.from_dict("garbage") == SelfCheckSettings()


async def test_automatic_check_waits_for_idle_and_runs_alone(
    hass: HomeAssistant, tmp_path: Path
) -> None:
    """A self-check starts only when nothing else runs, and never two at once."""
    agent, size = _local(tmp_path)
    listeners: list[Any] = []
    manager = _manager(hass, {"backup.local": (agent, False, size)}, None)
    manager.state = BackupManagerState.CREATE_BACKUP

    def subscribe(listener: Any) -> Any:
        listeners.append(listener)
        return lambda: listeners.remove(listener)

    manager.async_subscribe_events = subscribe
    stored: list[tuple[Any, ...]] = []
    manager.known_backups = SimpleNamespace(
        set_self_check=lambda *args: stored.append(args)
    )
    runner = SelfCheckRunner(manager)

    first = hass.async_create_task(runner._run(BACKUP_ID))
    second = hass.async_create_task(runner._run("other"))
    await asyncio.sleep(0.05)
    assert not stored
    assert listeners
    assert runner.running

    manager.state = BackupManagerState.IDLE
    listeners[0](IdleEvent())
    await asyncio.gather(first, second)

    assert [item[0] for item in stored] == [BACKUP_ID, "other"]
    assert not runner.running
    assert not listeners


async def test_websocket_settings_and_busy(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """The settings commands work, and a check is refused while a backup runs."""
    await setup_backup_integration(hass)
    client = await hass_ws_client(hass)
    manager = hass.data[DATA_MANAGER]

    await client.send_json_auto_id({"type": "backup/self_check/config/info"})
    response = await client.receive_json()
    assert response["result"]["config"] == {
        "remote_mode": "light",
        "max_full_download_bytes": 1024**3,
    }
    assert response["result"]["modes"] == ["off", "light", "full"]

    await client.send_json_auto_id(
        {
            "type": "backup/self_check/config/update",
            "remote_mode": "off",
            "max_full_download_bytes": 5000,
        }
    )
    response = await client.receive_json()
    assert response["result"]["config"] == {
        "remote_mode": "off",
        "max_full_download_bytes": 5000,
    }
    await client.send_json_auto_id(
        {"type": "backup/self_check/config/update", "remote_mode": "sometimes"}
    )
    assert not (await client.receive_json())["success"]

    manager.last_event = CreateBackupEvent(
        reason=None,
        stage=CreateBackupStage.HOME_ASSISTANT,
        state=CreateBackupState.IN_PROGRESS,
    )
    await client.send_json_auto_id({"type": "backup/self_check", "backup_id": "abc"})
    assert (await client.receive_json())["error"]["code"] == "backup_manager_busy"
    await client.send_json_auto_id(
        {
            "type": "backup/self_check/location",
            "backup_id": "abc",
            "agent_id": "backup.local",
        }
    )
    assert (await client.receive_json())["error"]["code"] == "backup_manager_busy"
    await client.send_json_auto_id(
        {
            "type": "backup/self_check/location",
            "backup_id": "abc",
            "agent_id": "nowhere.x",
        }
    )
    assert (await client.receive_json())["error"]["code"] == "unknown_agent"


async def test_websocket_location_check_is_stored(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """A location check is returned and merged into the stored result."""
    await setup_backup_integration(hass)
    client = await hass_ws_client(hass)
    manager = hass.data[DATA_MANAGER]
    manager.known_backups.set_self_check(
        "abc",
        {
            "status": "passed",
            "checks": [],
            "copies": [
                {"agent_id": "backup.local", "status": "verified_in_full"},
                {"agent_id": "cloud.x", "status": "could_not_check"},
            ],
        },
    )
    copy = CopyResult(
        agent_id="cloud.x", method="full", status="verified_in_full", size_read=5
    )

    with patch(
        "homeassistant.components.backup.websocket.async_check_location",
        AsyncMock(return_value=copy),
    ) as check:
        manager.backup_agents["cloud.x"] = object()
        await client.send_json_auto_id(
            {
                "type": "backup/self_check/location",
                "backup_id": "abc",
                "agent_id": "cloud.x",
                "full_download": True,
            }
        )
        response = await client.receive_json()

    assert check.call_args.kwargs["full_download"] is True
    assert response["result"]["copy"]["status"] == "verified_in_full"
    assert response["result"]["self_check"]["copies"] == [
        {"agent_id": "backup.local", "status": "verified_in_full"},
        copy.to_dict(),
    ]
