"""Keep only a pointer on this disk for backups that are safely in a registry.

When the owner turns this on, a backup whose copy in a place that can be read
back in full (a container registry place) was read back and checked part by
part has its copy on this disk replaced by a small record: the pointer. The
backup stays listed, because the registry place still lists it.

The pointers and the setting are kept in ``backups/pointers.json`` inside the
configuration folder, next to the delete proof marks, so a restore does not
bring back old pointers. A pointer holds which backup it is, which place and
repository hold it, its size, a check value (the SHA-256 of the backup file)
and when it was last checked. It never holds a key, a password or a token.

Rules kept here:

- Off until turned on, and only offered when a place that can be read back
  in full is set up and unlocked.
- The copy on this disk is removed only after the registry copy was read back,
  every part opened, and its size and SHA-256 matched the copy on this disk.
  Anything else keeps the whole copy and records why.
- The newest backups chosen by the owner (none, one or three) stay whole.
- The backup made before going back to an earlier build stays whole until the
  going back has finished.
- Pointers are checked lightly once a day: the backup is in a freshly read
  index of the place and its manifest is there. The parts themselves are not
  fetched by that check.
"""

import asyncio
from collections import Counter
from collections.abc import AsyncIterator, Callable
from dataclasses import asdict, dataclass, field
from datetime import timedelta
import errno
import hashlib
from pathlib import Path
import shutil
import time
from typing import TYPE_CHECKING, Any, Final, Protocol, runtime_checkable

import orjson

from homeassistant.const import EVENT_HOMEASSISTANT_STOP
from homeassistant.core import CALLBACK_TYPE, HomeAssistant, callback
from homeassistant.helpers.event import async_call_later, async_track_time_interval
from homeassistant.helpers.json import save_json
from homeassistant.util import dt as dt_util

from .agent import BackupAgent, LocalBackupAgent
from .const import LOGGER
from .models import BackupManagerError, BackupNotFound
from .util import read_backup, receive_file

if TYPE_CHECKING:
    from .manager import BackupManager, ManagerBackup

POINTER_FILE: Final = "pointers.json"
POINTER_VERSION: Final = 1
KEEP_WHOLE_CHOICES: Final = (0, 1, 3)
DEFAULT_KEEP_WHOLE: Final = 1
DAILY_CHECK_INTERVAL: Final = timedelta(days=1)
PASS_DELAY_SECONDS: Final = 60.0
SUPERVISOR_LOCAL_AGENT_ID: Final = "hassio.local"
GOING_BACK_REASON: Final = "before_going_back"
_READ_SIZE: Final = 2**20

# States of a remote copy check.
CHECK_OK: Final = "ok"
CHECK_MISSING: Final = "missing"
CHECK_FAILED: Final = "failed"
CHECK_NO_ANSWER: Final = "no_answer"
CHECK_TIMED_OUT: Final = "timed_out"
CHECK_UNKNOWN: Final = "unknown"

# Why a backup was kept whole.
KEPT_NEWEST: Final = "newest_kept_whole"
KEPT_GOING_BACK: Final = "going_back_not_finished"
KEPT_NO_REGISTRY_COPY: Final = "no_registry_copy"
KEPT_DIFFERENT: Final = "registry_copy_differs"
KEPT_LOCAL_UNREADABLE: Final = "local_copy_unreadable"
KEPT_REMOVE_REFUSED: Final = "local_copy_not_removed"

# Pointer states after the daily check.
STATE_PRESENT: Final = "present"
STATE_MISSING: Final = "missing"
STATE_UNKNOWN: Final = "unknown"

# Why a bring back failed, beyond the states of a remote copy check.
BRING_BACK_DISK_FULL: Final = "disk_full"
BRING_BACK_DISK_REFUSED: Final = "disk_refused"
BRING_BACK_DISK_ERROR: Final = "disk_error"
BRING_BACK_REGISTRY_REFUSED: Final = "registry_refused"
BRING_BACK_REGISTRY_MISSING: Final = "registry_copy_missing"

_DISK_FULL_ERRNOS: Final = frozenset({errno.ENOSPC, errno.EDQUOT})
_DISK_REFUSED_ERRNOS: Final = frozenset(
    {errno.EACCES, errno.EPERM, errno.EROFS, errno.EBUSY, errno.ETXTBSY}
)
# A file another program briefly holds open (a virus scanner or a sync tool on
# the host of a mounted folder) refuses a move for a moment; try a few times.
_MOVE_ATTEMPTS: Final = 4
_MOVE_WAIT_SECONDS: Final = 0.5

_SECRET_WORDS: Final = ("key", "password", "token", "secret")


class PointerError(BackupManagerError):
    """Raised when a pointer action cannot be done."""

    error_code = "backup_pointer_error"

    def __init__(self, reason: str, message: str | None = None) -> None:
        """Keep the reason code."""
        super().__init__(message or reason)
        self.reason = reason


@dataclass(frozen=True, kw_only=True, slots=True)
class RemoteCopyCheck:
    """What checking the copy in a place found."""

    state: str
    repository: str | None = None
    size: int | None = None
    sha256: str | None = None
    parts: int | None = None
    part_size: int | None = None
    detail: str | None = None

    @property
    def ok(self) -> bool:
        """Return True when the copy was found and, for a full read, opened."""
        return self.state == CHECK_OK


@runtime_checkable
class PointerCapableAgent(Protocol):
    """A backup agent whose copies can be read back in full and checked lightly."""

    agent_id: str
    name: str

    async def async_read_back_backup(
        self,
        backup_id: str,
        *,
        on_progress: Callable[[int, int, int, int], None] | None = None,
    ) -> RemoteCopyCheck:
        """Read every part of the copy again and return its size and SHA-256."""

    async def async_check_backup_present(self, backup_id: str) -> RemoteCopyCheck:
        """Check, without reading the parts, that the copy is still there."""


@dataclass(kw_only=True, slots=True)
class BackupPointer:
    """The record left on this disk in place of a backup."""

    backup_id: str
    name: str
    date: str
    agent_id: str
    place_name: str
    repository: str | None
    local_agent_id: str
    filename: str
    size: int
    check_value: str
    parts: int | None
    part_size: int | None
    made_at: str
    verified_at: str
    checked_at: str | None = None
    check_state: str = STATE_PRESENT
    check_reason: str | None = None

    def to_dict(self) -> dict[str, Any]:
        """Return the stored form."""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Any) -> BackupPointer | None:
        """Return a pointer from stored data, or None if it is not one."""
        if not isinstance(data, dict):
            return None
        try:
            return cls(**{name: data[name] for name in data if name in _FIELDS})
        except TypeError:
            return None

    @property
    def stored_size(self) -> int:
        """Return how many bytes this record takes on the disk."""
        return len(orjson.dumps(self.to_dict()))


_FIELDS: Final = set(BackupPointer.__dataclass_fields__)


@dataclass(kw_only=True, slots=True)
class PointerSettings:
    """The owner's choice."""

    enabled: bool = False
    keep_whole: int = DEFAULT_KEEP_WHOLE


@dataclass(kw_only=True, slots=True)
class Transfer:
    """A bring back in progress, or the last one."""

    backup_id: str
    action: str
    state: str
    started: str
    bytes_done: int = 0
    bytes_total: int = 0
    parts_done: int = 0
    parts_total: int = 0
    reason: str | None = None
    # A short technical detail of a failure, such as an errno name. Never a secret.
    detail: str | None = None


@dataclass(kw_only=True, slots=True)
class PassState:
    """A pass that turns backups into pointers: due, running, or the last one."""

    running: bool = False
    due: str | None = None
    started: str | None = None
    finished: str | None = None
    made: int = 0
    outcomes: dict[str, int] = field(default_factory=dict)


@dataclass(kw_only=True, slots=True)
class KeptWhole:
    """Why a backup was not made a pointer at the last try."""

    reason: str
    at: str
    detail: str | None = None


@dataclass(kw_only=True, slots=True)
class _State:
    settings: PointerSettings = field(default_factory=PointerSettings)
    pointers: dict[str, BackupPointer] = field(default_factory=dict)
    kept: dict[str, KeptWhole] = field(default_factory=dict)
    last_daily_check: str | None = None


def assert_no_secret(data: dict[str, Any]) -> None:
    """Raise if a stored pointer has a field that could hold a secret."""
    for name in data:
        if any(word in name for word in _SECRET_WORDS):
            raise ValueError(f"A pointer must not have a field named {name}")


def _hash_file(path: Path) -> tuple[int, str]:
    digest = hashlib.sha256()
    size = 0
    with path.open("rb") as handle:
        while chunk := handle.read(_READ_SIZE):
            digest.update(chunk)
            size += len(chunk)
    return size, digest.hexdigest()


def _now() -> str:
    return dt_util.utcnow().isoformat()


def _move_into_place(source: Path, target: Path) -> None:
    """Move a received backup into the backup folder, waiting out a brief lock."""
    target.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(_MOVE_ATTEMPTS):
        try:
            shutil.move(source, target)
        except OSError as err:
            if err.errno not in _DISK_REFUSED_ERRNOS or attempt + 1 == _MOVE_ATTEMPTS:
                # A move across devices copies first; never leave half a copy.
                if source.exists():
                    target.unlink(missing_ok=True)
                raise
            time.sleep(_MOVE_WAIT_SECONDS)
        else:
            return


class BackupPointers:
    """Hold the pointers and turn verified backups into pointers."""

    def __init__(self, manager: BackupManager) -> None:
        """Initialize."""
        self._manager = manager
        self._hass: HomeAssistant = manager.hass
        self._path = Path(self._hass.config.path("backups", POINTER_FILE))
        self._state = _State()
        self._lock = asyncio.Lock()
        self.transfer: Transfer | None = None
        self.pass_state = PassState()
        # Goes up whenever the pointers, the kept reasons or the setting change,
        # so a page knows when to read them again.
        self.revision = 0
        self._listeners: list[Callable[[], None]] = []
        self._unsub_daily: CALLBACK_TYPE | None = None
        self._unsub_pass: CALLBACK_TYPE | None = None
        self.readable = True

    @property
    def path(self) -> Path:
        """Return where the pointers are kept."""
        return self._path

    @property
    def settings(self) -> PointerSettings:
        """Return the owner's choice."""
        return self._state.settings

    def get(self, backup_id: str) -> BackupPointer | None:
        """Return the pointer of a backup."""
        return self._state.pointers.get(backup_id)

    def all(self) -> dict[str, BackupPointer]:
        """Return every pointer."""
        return dict(self._state.pointers)

    def kept(self) -> dict[str, KeptWhole]:
        """Return why backups were kept whole at their last try."""
        return dict(self._state.kept)

    def _read_file(self) -> _State | None:
        try:
            raw = self._path.read_bytes()
        except FileNotFoundError:
            return None
        data = orjson.loads(raw)
        if not isinstance(data, dict) or data.get("version") != POINTER_VERSION:
            raise ValueError("Unknown pointer file version")
        settings = data.get("settings") or {}
        keep_whole = settings.get("keep_whole", DEFAULT_KEEP_WHOLE)
        state = _State(
            settings=PointerSettings(
                enabled=settings.get("enabled") is True,
                keep_whole=(
                    keep_whole
                    if keep_whole in KEEP_WHOLE_CHOICES
                    else DEFAULT_KEEP_WHOLE
                ),
            ),
            last_daily_check=data.get("last_daily_check"),
        )
        for backup_id, value in (data.get("pointers") or {}).items():
            if (pointer := BackupPointer.from_dict(value)) is None:
                raise ValueError(f"Pointer for {backup_id} is not valid")
            state.pointers[str(backup_id)] = pointer
        for backup_id, value in (data.get("kept") or {}).items():
            if isinstance(value, dict) and isinstance(value.get("reason"), str):
                state.kept[str(backup_id)] = KeptWhole(
                    reason=value["reason"],
                    at=str(value.get("at", "")),
                    detail=value.get("detail"),
                )
        return state

    def _write_file(self) -> None:
        pointers = {
            backup_id: pointer.to_dict()
            for backup_id, pointer in self._state.pointers.items()
        }
        for pointer in pointers.values():
            assert_no_secret(pointer)
        self._path.parent.mkdir(parents=True, exist_ok=True)
        save_json(
            str(self._path),
            {
                "version": POINTER_VERSION,
                "settings": asdict(self._state.settings),
                "pointers": pointers,
                "kept": {
                    backup_id: asdict(kept)
                    for backup_id, kept in self._state.kept.items()
                },
                "last_daily_check": self._state.last_daily_check,
            },
            atomic_writes=True,
        )

    async def _async_save(self) -> None:
        await self._hass.async_add_executor_job(self._write_file)
        self.revision += 1
        self._notify()

    async def async_load(self) -> None:
        """Load the pointers; when unreadable, nothing is made a pointer."""
        try:
            state = await self._hass.async_add_executor_job(self._read_file)
        except (OSError, TypeError, ValueError) as err:
            LOGGER.error(
                "Cannot read the backup pointers in %s: %s. No backup is made a "
                "pointer until the file is readable again",
                self._path,
                err,
            )
            self.readable = False
            return
        self.readable = True
        if state is not None:
            self._state = state

    @callback
    def async_start(self) -> None:
        """Start the daily check of the pointers."""
        self._unsub_daily = async_track_time_interval(
            self._hass, self._async_daily, DAILY_CHECK_INTERVAL
        )

        @callback
        def _stop(_: Any) -> None:
            self.async_stop()

        self._hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STOP, _stop)

    @callback
    def async_stop(self) -> None:
        """Stop the timers."""
        for unsub in (self._unsub_daily, self._unsub_pass):
            if unsub is not None:
                unsub()
        self._unsub_daily = self._unsub_pass = None

    @callback
    def async_subscribe(self, listener: Callable[[], None]) -> Callable[[], None]:
        """Call the listener whenever the pointers or a bring back change."""
        self._listeners.append(listener)

        @callback
        def remove() -> None:
            self._listeners.remove(listener)

        return remove

    @callback
    def _notify(self) -> None:
        for listener in list(self._listeners):
            listener()

    def pointer_agents(self) -> list[BackupAgent]:
        """Return the places that can hold the copy a pointer points at."""
        return [
            agent
            for agent in self._manager.backup_agents.values()
            if isinstance(agent, PointerCapableAgent)
        ]

    def local_agent_ids(self) -> list[str]:
        """Return the agents that keep copies on this system."""
        ids = list(self._manager.local_backup_agents)
        if SUPERVISOR_LOCAL_AGENT_ID in self._manager.backup_agents:
            ids.append(SUPERVISOR_LOCAL_AGENT_ID)
        return ids

    @property
    def available(self) -> bool:
        """Return True when a place that can be read back in full is set up."""
        return bool(self.pointer_agents()) and bool(self.local_agent_ids())

    async def async_set_settings(
        self, *, enabled: bool | None = None, keep_whole: int | None = None
    ) -> PointerSettings:
        """Change the owner's choice; turning it on needs a place that can be read back."""
        if not self.readable:
            raise PointerError("pointers_unreadable")
        if keep_whole is not None and keep_whole not in KEEP_WHOLE_CHOICES:
            raise PointerError("invalid_keep_whole")
        if enabled and not self.available:
            raise PointerError("no_registry_place")
        settings = self._state.settings
        if enabled is not None:
            settings.enabled = enabled
        if keep_whole is not None:
            settings.keep_whole = keep_whole
        await self._async_save()
        if settings.enabled:
            self.async_schedule_pass()
        return settings

    @callback
    def async_schedule_pass(self, delay: float = PASS_DELAY_SECONDS) -> None:
        """Run a pass a little later, after the self-check of a new backup."""
        if not self._state.settings.enabled:
            return
        if self._unsub_pass is not None:
            self._unsub_pass()

        @callback
        def _run(_: Any) -> None:
            self._unsub_pass = None
            self._hass.async_create_background_task(
                self._manager.self_checks.async_run_exclusive(self.async_run_pass),
                name="backup_pointer_pass",
            )

        self._unsub_pass = async_call_later(self._hass, delay, _run)
        self.pass_state.due = (dt_util.utcnow() + timedelta(seconds=delay)).isoformat()
        self._notify()

    async def _async_daily(self, _: Any = None) -> None:
        if not self.readable:
            return
        await self.async_check_all()
        if self._state.settings.enabled:
            await self._manager.self_checks.async_run_exclusive(self.async_run_pass)

    async def async_run_pass(self) -> dict[str, str]:
        """Try to make every eligible backup a pointer; return each outcome."""
        state = self.pass_state
        state.due = None
        if not self._state.settings.enabled or not self.readable:
            self._notify()
            return {}
        state.running = True
        state.started = _now()
        state.finished = None
        self._notify()
        outcomes: dict[str, str] = {}
        try:
            outcomes = await self._async_run_pass()
        finally:
            state.running = False
            state.finished = _now()
            state.made = sum(1 for outcome in outcomes.values() if outcome == "pointer")
            state.outcomes = dict(Counter(outcomes.values()))
            self._notify()
        return outcomes

    async def _async_run_pass(self) -> dict[str, str]:
        outcomes: dict[str, str] = {}
        backups, _ = await self._manager.async_get_backups()
        local_ids = self.local_agent_ids()
        newest = sorted(backups.values(), key=lambda backup: backup.date, reverse=True)
        keep_ids = {
            backup.backup_id
            for backup in newest
            if any(agent_id in local_ids for agent_id in backup.agents)
            or backup.backup_id in self._state.pointers
        }
        keep_newest = [
            backup.backup_id for backup in newest if backup.backup_id in keep_ids
        ][: self._state.settings.keep_whole]
        for backup in newest:
            backup_id = backup.backup_id
            if not any(agent_id in local_ids for agent_id in backup.agents):
                continue
            if backup_id in self._state.pointers:
                # The copy here came back; it is whole again.
                del self._state.pointers[backup_id]
                await self._async_save()
            if backup_id in keep_newest:
                await self._async_keep(backup_id, KEPT_NEWEST)
                outcomes[backup_id] = KEPT_NEWEST
                continue
            try:
                await self.async_make_pointer(backup_id, backup=backup)
            except PointerError as err:
                outcomes[backup_id] = err.reason
                continue
            outcomes[backup_id] = "pointer"
        return outcomes

    async def _async_keep(
        self, backup_id: str, reason: str, detail: str | None = None
    ) -> None:
        self._state.kept[backup_id] = KeptWhole(reason=reason, at=_now(), detail=detail)
        await self._async_save()

    async def _async_going_back_hold(self, backup: ManagerBackup) -> bool:
        if backup.extra_metadata.get("reason") != GOING_BACK_REASON:
            return False
        reader_writer = self._manager._reader_writer  # noqa: SLF001
        finished = await reader_writer.async_going_back_finished()
        return finished is not True

    async def _async_local_digest(
        self, agent: BackupAgent, backup_id: str
    ) -> tuple[int, str]:
        if isinstance(agent, LocalBackupAgent):
            await agent.async_get_backup(backup_id)
            path = agent.get_backup_path(backup_id)
            return await self._hass.async_add_executor_job(_hash_file, path)
        digest = hashlib.sha256()
        size = 0
        async for chunk in await agent.async_download_backup(backup_id):
            digest.update(chunk)
            size += len(chunk)
        return size, digest.hexdigest()

    async def async_make_pointer(
        self, backup_id: str, *, backup: ManagerBackup | None = None
    ) -> BackupPointer:
        """Replace the copy on this disk by a pointer, after a full read back.

        Raises PointerError with the reason the whole copy was kept.
        """
        if not self._state.settings.enabled:
            raise PointerError("not_enabled")
        if not self.readable:
            raise PointerError("pointers_unreadable")
        if backup is None:
            backup, _ = await self._manager.async_get_backup(backup_id)
            if backup is None:
                raise PointerError("not_found")
        async with self._lock:
            return await self._async_make_pointer(backup)

    async def _async_make_pointer(self, backup: ManagerBackup) -> BackupPointer:
        backup_id = backup.backup_id
        local_id = next(
            (
                agent_id
                for agent_id in self.local_agent_ids()
                if agent_id in backup.agents
            ),
            None,
        )
        if local_id is None:
            raise PointerError("not_local")
        if await self._async_going_back_hold(backup):
            await self._async_keep(backup_id, KEPT_GOING_BACK)
            raise PointerError(KEPT_GOING_BACK)
        candidates = [
            agent for agent in self.pointer_agents() if agent.agent_id in backup.agents
        ]
        if not candidates:
            await self._async_keep(backup_id, KEPT_NO_REGISTRY_COPY)
            raise PointerError(KEPT_NO_REGISTRY_COPY)
        local_agent = self._manager.backup_agents[local_id]
        try:
            local_size, local_sha = await self._async_local_digest(
                local_agent, backup_id
            )
        except Exception as err:
            LOGGER.warning("Cannot read the copy of backup %s here: %s", backup_id, err)
            await self._async_keep(backup_id, KEPT_LOCAL_UNREADABLE)
            raise PointerError(KEPT_LOCAL_UNREADABLE) from err

        last_reason = CHECK_UNKNOWN
        for agent in candidates:
            if TYPE_CHECKING:
                assert isinstance(agent, PointerCapableAgent)
            try:
                check = await agent.async_read_back_backup(backup_id)
            except Exception as err:  # noqa: BLE001
                LOGGER.warning(
                    "Reading back backup %s from %s failed: %s",
                    backup_id,
                    agent.agent_id,
                    err,
                )
                check = RemoteCopyCheck(state=CHECK_UNKNOWN)
            if not check.ok:
                last_reason = check.state
                continue
            if check.size != local_size or check.sha256 != local_sha:
                last_reason = KEPT_DIFFERENT
                continue
            return await self._async_replace(
                backup, local_id, local_agent, agent, check
            )
        await self._async_keep(backup_id, last_reason)
        raise PointerError(last_reason)

    async def _async_replace(
        self,
        backup: ManagerBackup,
        local_id: str,
        local_agent: BackupAgent,
        agent: BackupAgent,
        check: RemoteCopyCheck,
    ) -> BackupPointer:
        backup_id = backup.backup_id
        now = _now()
        filename = f"{backup_id}.tar"
        if isinstance(local_agent, LocalBackupAgent):
            filename = local_agent.get_backup_path(backup_id).name
        if TYPE_CHECKING:
            assert check.size is not None
            assert check.sha256 is not None
        pointer = BackupPointer(
            backup_id=backup_id,
            name=backup.name,
            date=backup.date,
            agent_id=agent.agent_id,
            place_name=agent.name,
            repository=check.repository,
            local_agent_id=local_id,
            filename=filename,
            size=check.size,
            check_value=f"sha256:{check.sha256}",
            parts=check.parts,
            part_size=check.part_size,
            made_at=now,
            verified_at=now,
            checked_at=now,
        )
        # Written before the copy goes, so a stop in between leaves both; the
        # next pass sees the copy here and drops the pointer.
        self._state.pointers[backup_id] = pointer
        self._state.kept.pop(backup_id, None)
        await self._async_save()
        try:
            await local_agent.async_delete_backup(backup_id)
        except Exception as err:
            LOGGER.warning(
                "The copy of backup %s here could not be removed: %s", backup_id, err
            )
            del self._state.pointers[backup_id]
            await self._async_keep(backup_id, KEPT_REMOVE_REFUSED, str(err))
            raise PointerError(KEPT_REMOVE_REFUSED) from err
        LOGGER.info("Backup %s is now a pointer to %s", backup_id, agent.agent_id)
        return pointer

    async def async_check_all(self) -> dict[str, str]:
        """Check every pointer lightly against its place; return each state."""
        states: dict[str, str] = {}
        if not self._state.pointers:
            return states
        for backup_id in list(self._state.pointers):
            states[backup_id] = await self._async_check_one(backup_id)
        self._state.last_daily_check = _now()
        await self._async_save()
        return states

    async def _async_check_one(self, backup_id: str) -> str:
        pointer = self._state.pointers[backup_id]
        agent = self._manager.backup_agents.get(pointer.agent_id)
        if not isinstance(agent, PointerCapableAgent):
            state, reason = STATE_UNKNOWN, "place_not_loaded"
        else:
            try:
                check = await agent.async_check_backup_present(backup_id)
            except Exception as err:  # noqa: BLE001
                LOGGER.debug("Checking pointer %s failed: %s", backup_id, err)
                check = RemoteCopyCheck(state=CHECK_UNKNOWN)
            if check.ok:
                state, reason = STATE_PRESENT, None
            elif check.state == CHECK_MISSING:
                state, reason = STATE_MISSING, None
            else:
                state, reason = STATE_UNKNOWN, check.state
        pointer.check_state = state
        pointer.check_reason = reason
        pointer.checked_at = _now()
        return state

    def _start_transfer(
        self, backup_id: str, action: str, total: int, parts: int
    ) -> Transfer:
        self.transfer = Transfer(
            backup_id=backup_id,
            action=action,
            state="in_progress",
            started=_now(),
            bytes_total=total,
            parts_total=parts,
        )
        self._notify()
        return self.transfer

    async def async_bring_back(
        self, backup_id: str, *, action: str = "bring_back"
    ) -> str:
        """Bring the copy back to this disk, check it and drop the pointer.

        Returns the agent id of the local copy.
        """
        if (pointer := self._state.pointers.get(backup_id)) is None:
            raise PointerError("not_a_pointer")
        async with self._lock:
            return await self._async_bring_back(pointer, action)

    async def _async_bring_back(self, pointer: BackupPointer, action: str) -> str:
        backup_id = pointer.backup_id
        agent = self._manager.backup_agents.get(pointer.agent_id)
        if not isinstance(agent, PointerCapableAgent):
            raise PointerError("place_not_loaded")
        if pointer.check_state == STATE_MISSING:
            await self._async_check_one(backup_id)
            await self._async_save()
            if pointer.check_state == STATE_MISSING:
                raise PointerError("registry_copy_missing")
        local_id = (
            pointer.local_agent_id
            if pointer.local_agent_id in self._manager.backup_agents
            else next(iter(self.local_agent_ids()), None)
        )
        if local_id is None:
            raise PointerError("not_local")
        local_agent = self._manager.backup_agents[local_id]
        part_size = pointer.part_size or 0
        parts_total = pointer.parts or 0
        transfer = self._start_transfer(backup_id, action, pointer.size, parts_total)
        digest = hashlib.sha256()

        async def counted(stream: AsyncIterator[bytes]) -> AsyncIterator[bytes]:
            async for chunk in stream:
                digest.update(chunk)
                transfer.bytes_done += len(chunk)
                transfer.parts_done = (
                    min(parts_total, -(-transfer.bytes_done // part_size))
                    if part_size
                    else 0
                )
                self._notify()
                yield chunk

        step = "asking the registry for the copy"
        try:
            stream = await agent.async_download_backup(backup_id)
            step = "receiving the copy into the temporary folder"
            if isinstance(local_agent, LocalBackupAgent):
                await self._async_receive_here(local_agent, pointer, counted(stream))
            else:
                written = await self._manager._reader_writer.async_receive_backup(  # noqa: SLF001
                    agent_ids=[local_id],
                    stream=counted(stream),
                    suggested_filename=pointer.filename,
                )
                step = "registering the copy with the local backup location"
                try:
                    await local_agent.async_upload_backup(
                        open_stream=written.open_stream,
                        backup=written.backup,
                        on_progress=lambda **kwargs: None,
                    )
                finally:
                    await written.release_stream()
        except Exception as err:
            if isinstance(err, _StepFailed):
                step, err = err.step, err.cause
            transfer.state = "failed"
            transfer.reason = _failure_reason(err)
            transfer.detail = _failure_detail(err)
            LOGGER.warning(
                "Bringing back backup %s from %s failed while %s after %s of %s "
                "bytes (reason %s): %s: %s",
                backup_id,
                agent.agent_id,
                step,
                transfer.bytes_done,
                pointer.size,
                transfer.reason,
                type(err).__name__,
                err,
                exc_info=err,
            )
            self._notify()
            raise PointerError(transfer.reason, transfer.detail) from err

        received = f"sha256:{digest.hexdigest()}"
        try:
            size, sha = await self._async_local_digest(local_agent, backup_id)
        except Exception as err:  # noqa: BLE001
            LOGGER.warning("Cannot read back backup %s here: %s", backup_id, err)
            size, sha = -1, ""
        if (
            transfer.bytes_done != pointer.size
            or received != pointer.check_value
            or size != pointer.size
            or f"sha256:{sha}" != pointer.check_value
        ):
            LOGGER.warning(
                "Backup %s came back from %s but failed its check: received %s of "
                "%s bytes, the copy here has %s bytes, check value %s",
                backup_id,
                agent.agent_id,
                transfer.bytes_done,
                pointer.size,
                size,
                "matched" if received == pointer.check_value else "differed",
            )
            transfer.state = "failed"
            transfer.reason = "check_failed"
            self._notify()
            try:
                await local_agent.async_delete_backup(backup_id)
            except Exception as err:  # noqa: BLE001
                LOGGER.warning("Could not remove a copy that failed its check: %s", err)
            raise PointerError("check_failed")

        del self._state.pointers[backup_id]
        transfer.state = "done"
        await self._async_save()
        return local_id

    async def _async_receive_here(
        self,
        local_agent: LocalBackupAgent,
        pointer: BackupPointer,
        stream: AsyncIterator[bytes],
    ) -> None:
        """Write the copy into the backup folder, then put it in place and list it.

        The copy is written beside its final name in the same folder, so the last
        step is a rename within one folder rather than a move between folders.
        """
        partial = self._path.parent / f".{pointer.filename}.part"
        run = self._hass.async_add_executor_job
        step = "writing the copy into the backup folder"
        try:
            await run(partial.parent.mkdir, 0o777, True, True)
            await receive_file(self._hass, stream, partial)
            step = "reading the copy that came back"
            try:
                backup = await run(read_backup, partial)
            except OSError:
                raise
            except Exception as err:
                raise PointerError("check_failed", "unreadable archive") from err
            if backup.backup_id != pointer.backup_id:
                raise PointerError("check_failed", "different backup")
            target = local_agent.get_new_backup_path(backup)
            step = "moving the copy into place"
            await run(_move_into_place, partial, target)
            step = "listing the copy in the local backup location"

            async def open_target() -> AsyncIterator[bytes]:
                return _read_chunks(self._hass, target)

            await local_agent.async_upload_backup(
                open_stream=open_target,
                backup=backup,
                on_progress=lambda **kwargs: None,
            )
        except BaseException as err:
            await run(partial.unlink, True)
            if isinstance(err, Exception):
                raise _StepFailed(step, err) from err
            raise

    async def async_restore(self, backup_id: str, **restore: Any) -> None:
        """Bring the copy back, check it, then restore it the normal way."""
        local_id = await self.async_bring_back(backup_id, action="restore")
        await self._manager.async_restore_backup(
            backup_id, agent_id=local_id, **restore
        )

    @callback
    def async_forget_deleted(self, backup_id: str, agent_ids: list[str]) -> None:
        """Drop a pointer when the copy it points at was deleted."""
        pointer = self._state.pointers.get(backup_id)
        if pointer is None or pointer.agent_id not in agent_ids:
            return
        del self._state.pointers[backup_id]
        self._hass.async_create_task(self._async_save(), eager_start=True)

    def summary(self, backups: dict[str, ManagerBackup]) -> dict[str, Any]:
        """Return the honest counts the page shows."""
        local_ids = self.local_agent_ids()
        whole_here = [
            backup_id
            for backup_id, backup in backups.items()
            if any(agent_id in local_ids for agent_id in backup.agents)
        ]
        pointers = self._state.pointers.values()
        return {
            "whole_here": len(whole_here),
            "pointers": len(self._state.pointers),
            "missing": sum(
                1 for pointer in pointers if pointer.check_state == STATE_MISSING
            ),
            "saved_bytes": sum(
                max(0, pointer.size - pointer.stored_size) for pointer in pointers
            ),
            "pointer_bytes": sum(pointer.stored_size for pointer in pointers),
        }


class _StepFailed(Exception):
    """A step of writing a copy here failed; carries which step and why."""

    def __init__(self, step: str, cause: Exception) -> None:
        """Keep the step and the cause."""
        super().__init__(step)
        self.step = step
        self.cause = cause


async def _read_chunks(hass: HomeAssistant, path: Path) -> AsyncIterator[bytes]:
    handle = await hass.async_add_executor_job(path.open, "rb")
    try:
        while chunk := await hass.async_add_executor_job(handle.read, _READ_SIZE):
            yield chunk
    finally:
        await hass.async_add_executor_job(handle.close)


def _failure_reason(err: BaseException) -> str:
    """Return a plain reason code for a failed bring back."""
    if isinstance(err, PointerError):
        return err.reason
    if isinstance(err, BackupNotFound):
        return BRING_BACK_REGISTRY_MISSING
    if isinstance(err, TimeoutError):
        return CHECK_TIMED_OUT
    if isinstance(err, OSError):
        if err.errno in _DISK_FULL_ERRNOS:
            return BRING_BACK_DISK_FULL
        if err.errno in _DISK_REFUSED_ERRNOS:
            return BRING_BACK_DISK_REFUSED
        return BRING_BACK_DISK_ERROR
    key = getattr(err, "translation_key", None)
    if key == "backup_registry_busy":
        return CHECK_NO_ANSWER
    if key == "backup_registry_refused":
        return BRING_BACK_REGISTRY_REFUSED
    if key == "backup_damaged":
        return CHECK_FAILED
    return CHECK_UNKNOWN


def _failure_detail(err: BaseException) -> str:
    """Return a short technical name for a failure: an errno name or a class name."""
    if isinstance(err, PointerError):
        return str(err) if str(err) != err.reason else err.reason
    if isinstance(err, OSError) and err.errno is not None:
        return errno.errorcode.get(err.errno, str(err.errno))
    if (placeholders := getattr(err, "translation_placeholders", None)) and (
        reason := placeholders.get("reason")
    ):
        return str(reason)
    return type(err).__name__


def agent_backup_for(pointer: BackupPointer) -> dict[str, Any]:
    """Return the facts of a pointer for the page, with its restorable state."""
    data = pointer.to_dict()
    data["stored_size"] = pointer.stored_size
    data["restorable"] = pointer.check_state != STATE_MISSING
    return data
