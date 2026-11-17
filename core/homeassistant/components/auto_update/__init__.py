"""Install available updates automatically.

The server does the work, so updates are installed without any browser being
open. Automatic updating can be switched on for everything or for single update
entities.

Home Assistant Core, the Supervisor and the operating system are separate,
switched off by default and updated only inside a time window, after a wait
that gives a withdrawn or quickly fixed build time to disappear. They install
one at a time in a safe order and are never retried for a version that failed.
"""

import asyncio
from collections.abc import Callable
from datetime import UTC, date, datetime, time, timedelta
import logging
from typing import Any

from awesomeversion import AwesomeVersion, AwesomeVersionException
import probatio

from homeassistant.components import websocket_api
from homeassistant.components.update import (
    ATTR_IN_PROGRESS,
    ATTR_SKIPPED_VERSION,
    DOMAIN as UPDATE_DOMAIN,
    SERVICE_INSTALL,
    UpdateEntityFeature,
)
from homeassistant.const import (
    ATTR_ENTITY_ID,
    ATTR_SUPPORTED_FEATURES,
    EVENT_HOMEASSISTANT_STOP,
    EVENT_STATE_CHANGED,
    STATE_ON,
)
from homeassistant.core import (
    CALLBACK_TYPE,
    Event,
    EventStateChangedData,
    HomeAssistant,
    State,
    callback,
)
from homeassistant.helpers import (
    config_validation as cv,
    entity_registry as er,
    issue_registry as ir,
)
from homeassistant.helpers.event import (
    async_track_state_change_event,
    async_track_time_interval,
)
from homeassistant.helpers.start import async_at_started
from homeassistant.helpers.storage import Store
from homeassistant.helpers.typing import ConfigType
from homeassistant.util import dt as dt_util
from homeassistant.util.hass_dict import HassKey

DOMAIN = "auto_update"

CONFIG_SCHEMA = cv.empty_config_schema(DOMAIN)

STORAGE_VERSION = 1
SAVE_DELAY = 1
# How long one install may take, and how long to wait for the new version to show
# once the entity no longer reports progress.
INSTALL_TIMEOUT = 3600
CONFIRM_WAIT = 60

PROTECTED_ENTITY_IDS = frozenset(
    {
        "update.home_assistant_core_update",
        "update.home_assistant_supervisor_update",
        "update.home_assistant_operating_system_update",
    }
)
# Unique id prefixes of the update entities of the supervisor integration that
# install the system itself.
PROTECTED_UNIQUE_ID_PREFIXES = (
    "home_assistant_core_",
    "home_assistant_supervisor_",
    "home_assistant_os_",
    "home_assistant_host_",
)

SYSTEM_PARTS = {
    "supervisor": "update.home_assistant_supervisor_update",
    "core": "update.home_assistant_core_update",
    "os": "update.home_assistant_operating_system_update",
}
# The safe order: the Supervisor first, then Core, then the operating system.
SYSTEM_ORDER = tuple(SYSTEM_PARTS)
DEFAULT_WINDOW_START = "03:00"
DEFAULT_WINDOW_END = "05:00"
DEFAULT_WAIT_DAYS = 1
MAX_WAIT_DAYS = 14
MIN_WINDOW_LENGTH = timedelta(minutes=30)
# How often to look again, so a window that opens is noticed within minutes.
CHECK_INTERVAL = timedelta(minutes=5)
# How long the whole system must be quiet before the next part may install.
SETTLE_WAIT = 60
BACKUP_DOMAIN = "backup"

_LOGGER = logging.getLogger(__name__)

DATA_MANAGER: HassKey["AutoUpdateManager"] = HassKey(DOMAIN)


def window_length(start: time, end: time) -> timedelta:
    """Return how long a window is; it may cross midnight."""
    length = datetime.combine(date.min, end) - datetime.combine(date.min, start)
    return length % timedelta(days=1)


def in_window(now: datetime, start: time, end: time) -> bool:
    """Whether a local time falls inside a window that may cross midnight."""
    current = now.time()
    if start <= end:
        return start <= current < end
    return current >= start or current < end


def window_bounds(now: datetime, start: time, end: time) -> tuple[datetime, datetime]:
    """Return the window that is open now, or else the next one to open."""
    length = window_length(start, end)
    for offset in (-1, 0, 1):
        opens = datetime.combine(
            now.date() + timedelta(days=offset), start, tzinfo=now.tzinfo
        )
        closes = opens + length
        if now < closes:
            return opens, closes
    raise AssertionError("A window always lies within two days")  # pragma: no cover


def is_newer(installed: str | None, latest: str | None) -> bool:
    """Whether latest is a real step forward; never a downgrade or a guess."""
    if not installed or not latest:
        return False
    try:
        return AwesomeVersion(latest) > AwesomeVersion(installed)
    except AwesomeVersionException:
        return False


_clock_string = probatio.All(cv.time, lambda value: value.isoformat("minutes"))


def parse_clock(value: str) -> time:
    """Read a stored 24-hour clock time."""
    return time.fromisoformat(value)


def effective_enabled(
    all_enabled: bool, overrides: dict[str, bool], entity_id: str, allowed: bool
) -> bool:
    """Whether automatic updating applies to an entity.

    The entity's own choice wins, otherwise the switch for everything is used.
    An entity that is not allowed never updates automatically.
    """
    if not allowed:
        return False
    return overrides.get(entity_id, all_enabled)


class AutoUpdateManager:
    """Keeps the settings and installs updates when they apply."""

    def __init__(self, hass: HomeAssistant) -> None:
        """Create the manager with default settings."""
        self.hass = hass
        self._store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, DOMAIN)
        self.all_enabled = False
        self.backup = True
        self.overrides: dict[str, bool] = {}
        self.results: dict[str, dict[str, Any]] = {}
        self.failed_versions: dict[str, str | None] = {}
        self.system: dict[str, bool] = dict.fromkeys(SYSTEM_PARTS, False)
        self.window_start = DEFAULT_WINDOW_START
        self.window_end = DEFAULT_WINDOW_END
        self.wait_days = DEFAULT_WAIT_DAYS
        # When a version of a system update was first seen: entity -> version, time.
        self.first_seen: dict[str, dict[str, str | None]] = {}
        # System installs that were started, kept across the restart they cause.
        self.attempts: dict[str, str | None] = {}
        self._forced: set[str] = set()
        self._attempted: set[tuple[str, str | None]] = set()
        self._task: asyncio.Task[None] | None = None
        self._wanted = False
        self._listeners: list[Callable[[], None]] = []

    async def async_load(self) -> None:
        """Read the stored settings."""
        data = await self._store.async_load()
        if not data:
            return
        stored_system = data.get("system", {})
        self.system = {
            part: bool(stored_system.get(part, False)) for part in SYSTEM_PARTS
        }
        window = data.get("system_window", {})
        try:
            start, end = (
                parse_clock(window.get("start", DEFAULT_WINDOW_START)),
                parse_clock(window.get("end", DEFAULT_WINDOW_END)),
            )
        except (TypeError, ValueError):
            start, end = (
                parse_clock(DEFAULT_WINDOW_START),
                parse_clock(DEFAULT_WINDOW_END),
            )
        if window_length(start, end) >= MIN_WINDOW_LENGTH:
            self.window_start = start.isoformat("minutes")
            self.window_end = end.isoformat("minutes")
        wait = data.get("system_wait_days", DEFAULT_WAIT_DAYS)
        self.wait_days = (
            wait
            if isinstance(wait, int) and 0 <= wait <= MAX_WAIT_DAYS
            else DEFAULT_WAIT_DAYS
        )
        self.first_seen = dict(data.get("first_seen", {}))
        self.attempts = dict(data.get("attempts", {}))
        self.all_enabled = bool(data.get("all", False))
        self.backup = bool(data.get("backup", True))
        self.overrides = {
            key: value
            for key, value in data.get("entities", {}).items()
            if isinstance(value, bool)
        }
        self.results = dict(data.get("results", {}))
        self.failed_versions = dict(data.get("failed", {}))

    @callback
    def _save(self) -> None:
        self._store.async_delay_save(self._data_to_save, SAVE_DELAY)

    @callback
    def _data_to_save(self) -> dict[str, Any]:
        return {
            "all": self.all_enabled,
            "backup": self.backup,
            "entities": self.overrides,
            "results": self.results,
            "failed": self.failed_versions,
            "system": self.system,
            "system_window": {"start": self.window_start, "end": self.window_end},
            "system_wait_days": self.wait_days,
            "first_seen": self.first_seen,
            "attempts": self.attempts,
        }

    @callback
    def async_add_listener(self, listener: Callable[[], None]) -> CALLBACK_TYPE:
        """Call the listener when settings or results change."""
        self._listeners.append(listener)

        @callback
        def remove() -> None:
            self._listeners.remove(listener)

        return remove

    @callback
    def _changed(self) -> None:
        self._save()
        for listener in list(self._listeners):
            listener()

    @callback
    def protected_reason(self, entity_id: str) -> str | None:
        """Why an entity can never update automatically, if it cannot."""
        if entity_id in PROTECTED_ENTITY_IDS:
            return "restarts_system"
        entry = er.async_get(self.hass).async_get(entity_id)
        if (
            entry is not None
            and entry.platform == "hassio"
            and entry.unique_id.startswith(PROTECTED_UNIQUE_ID_PREFIXES)
        ):
            return "restarts_system"
        return None

    @callback
    def is_enabled(self, entity_id: str) -> bool:
        """Whether automatic updating applies to this entity."""
        return effective_enabled(
            self.all_enabled,
            self.overrides,
            entity_id,
            self.protected_reason(entity_id) is None,
        )

    @callback
    def async_set_all(self, enabled: bool) -> None:
        """Switch automatic updating of everything on or off."""
        self.all_enabled = enabled
        self._changed()
        self.async_schedule()

    @callback
    def async_set_backup(self, enabled: bool) -> None:
        """Choose whether a backup is requested before installing."""
        self.backup = enabled
        self._changed()

    @callback
    def async_set_system(self, part: str, enabled: bool) -> None:
        """Switch automatic updating of one system part on or off."""
        self.system[part] = enabled
        self._changed()
        self.async_schedule()

    @callback
    def async_set_window(self, start: str, end: str) -> None:
        """Choose the time window, in the home's time zone, for system updates."""
        self.window_start = parse_clock(start).isoformat("minutes")
        self.window_end = parse_clock(end).isoformat("minutes")
        self._changed()
        self.async_schedule()

    @callback
    def async_set_wait_days(self, days: int) -> None:
        """Choose how many days an update waits after it first appears."""
        self.wait_days = days
        self._changed()
        self.async_schedule()

    @callback
    def async_retry_system(self, part: str) -> None:
        """Try a failed system update again now, outside the window and wait."""
        entity_id = SYSTEM_PARTS[part]
        self.failed_versions.pop(entity_id, None)
        self.attempts.pop(entity_id, None)
        self._forced.add(entity_id)
        self._changed()
        self.async_schedule()

    @callback
    def async_set_entity(self, entity_id: str, enabled: bool | None) -> None:
        """Set the choice for one entity; None follows the switch for everything."""
        if enabled is None:
            self.overrides.pop(entity_id, None)
        else:
            self.overrides[entity_id] = enabled
        self._changed()
        self.async_schedule()

    @callback
    def async_info(self) -> dict[str, Any]:
        """Describe the settings and every update entity."""
        entities = []
        for state in sorted(
            self.hass.states.async_all(UPDATE_DOMAIN), key=lambda item: item.entity_id
        ):
            reason = self.protected_reason(state.entity_id)
            entities.append(
                {
                    "entity_id": state.entity_id,
                    "enabled": self.is_enabled(state.entity_id),
                    "override": self.overrides.get(state.entity_id),
                    "allowed": reason is None,
                    "protected_reason": reason,
                    "last_result": self.results.get(state.entity_id),
                }
            )
        return {
            "all": self.all_enabled,
            "backup": self.backup,
            "entities": entities,
            "system": self._system_info(),
        }

    @callback
    def _now(self) -> datetime:
        """The current time in the home's time zone."""
        return dt_util.now()

    @callback
    def _eligible_at(self, entity_id: str, latest: str | None) -> datetime | None:
        """When a version may install; None until it has been seen."""
        seen = self.first_seen.get(entity_id)
        if not seen or seen.get("version") != latest or not seen.get("time"):
            return None
        return datetime.fromisoformat(seen["time"]) + timedelta(days=self.wait_days)

    @callback
    def _system_info(self) -> dict[str, Any]:
        now = self._now()
        opens, closes = window_bounds(
            now, parse_clock(self.window_start), parse_clock(self.window_end)
        )
        parts = []
        for part, entity_id in SYSTEM_PARTS.items():
            state = self.hass.states.get(entity_id)
            attrs = state.attributes if state is not None else {}
            latest = attrs.get("latest_version")
            eligible = (
                self._eligible_at(entity_id, latest)
                if state is not None and state.state == STATE_ON
                else None
            )
            failed_version = self.failed_versions.get(entity_id)
            result = self.results.get(entity_id)
            parts.append(
                {
                    "part": part,
                    "entity_id": entity_id,
                    "enabled": self.system[part],
                    "available": state is not None,
                    "installed_version": attrs.get("installed_version"),
                    "latest_version": latest,
                    "update_available": state is not None
                    and state.state == STATE_ON
                    and is_newer(attrs.get("installed_version"), latest),
                    "skipped": latest is not None
                    and latest == attrs.get(ATTR_SKIPPED_VERSION),
                    "eligible_at": eligible.isoformat() if eligible else None,
                    "failed": (
                        {
                            "version": failed_version,
                            "error": (result or {}).get("error"),
                            "time": (result or {}).get("time"),
                        }
                        if entity_id in self.failed_versions
                        and failed_version == latest
                        else None
                    ),
                    "last_result": result,
                }
            )
        return {
            "enabled": dict(self.system),
            "window": {"start": self.window_start, "end": self.window_end},
            "wait_days": self.wait_days,
            "next_window": {
                "start": opens.isoformat(),
                "end": closes.isoformat(),
                "open": opens <= now < closes,
                "day_offset": (opens.date() - now.date()).days,
            },
            "parts": parts,
        }

    @callback
    def async_schedule(self) -> None:
        """Look for updates to install soon, one install at a time."""
        self._wanted = True
        if self._task is None or self._task.done():
            self._task = self.hass.async_create_background_task(
                self._async_run(), f"{DOMAIN} installer"
            )

    @callback
    def _candidate(self, state: State) -> bool:
        if state.state != STATE_ON:
            return False
        entity_id = state.entity_id
        if not self.is_enabled(entity_id):
            return False
        attrs = state.attributes
        if not attrs.get(ATTR_SUPPORTED_FEATURES, 0) & UpdateEntityFeature.INSTALL:
            return False
        if attrs.get(ATTR_IN_PROGRESS):
            return False
        latest = attrs.get("latest_version")
        if latest is not None and latest == attrs.get(ATTR_SKIPPED_VERSION):
            return False
        if entity_id in self.failed_versions and self.failed_versions[entity_id] == latest:
            return False
        return (entity_id, latest) not in self._attempted

    async def _async_run(self) -> None:
        while self._wanted:
            self._wanted = False
            for state in list(self.hass.states.async_all(UPDATE_DOMAIN)):
                current = self.hass.states.get(state.entity_id)
                if current is not None and self._candidate(current):
                    await self._async_install(current)
            await self._async_run_system()

    @callback
    def _track_system_versions(self) -> None:
        """Remember when each system update version first appeared."""
        now = self._now().isoformat()
        changed = False
        for entity_id in SYSTEM_PARTS.values():
            state = self.hass.states.get(entity_id)
            if state is None or state.state != STATE_ON:
                continue
            latest = state.attributes.get("latest_version")
            seen = self.first_seen.get(entity_id)
            if seen is None or seen.get("version") != latest:
                self.first_seen[entity_id] = {"version": latest, "time": now}
                changed = True
        if changed:
            self._changed()

    @callback
    def _system_busy(self) -> bool:
        """Whether any update, backup or restore is running."""
        for state in self.hass.states.async_all(UPDATE_DOMAIN):
            if state.attributes.get(ATTR_IN_PROGRESS):
                return True
        manager = self.hass.data.get(BACKUP_DOMAIN)
        manager_state = getattr(manager, "state", None)
        return manager_state is not None and str(manager_state) != "idle"

    @callback
    def _system_candidate(self, part: str) -> State | None:
        """The state of a system update that may install now, if it may."""
        entity_id = SYSTEM_PARTS[part]
        forced = entity_id in self._forced
        if not self.system[part] and not forced:
            return None
        state = self.hass.states.get(entity_id)
        if state is None or state.state != STATE_ON:
            return None
        attrs = state.attributes
        if not attrs.get(ATTR_SUPPORTED_FEATURES, 0) & UpdateEntityFeature.INSTALL:
            return None
        if attrs.get(ATTR_IN_PROGRESS):
            return None
        latest = attrs.get("latest_version")
        if latest == attrs.get(ATTR_SKIPPED_VERSION):
            return None
        if not is_newer(attrs.get("installed_version"), latest):
            return None
        if (
            self.failed_versions.get(entity_id) == latest
            or self.attempts.get(entity_id) == latest
        ):
            return None
        if forced:
            return state
        if forced:
            return state
        eligible = self._eligible_at(entity_id, latest)
        if eligible is None or self._now() < eligible:
            return None
        return state

    async def _async_run_system(self) -> None:
        """Install the allowed system updates one at a time in the safe order."""
        self._track_system_versions()
        self._sync_failure_issues()
        start = parse_clock(self.window_start)
        end = parse_clock(self.window_end)
        for part in SYSTEM_ORDER:
            entity_id = SYSTEM_PARTS[part]
            forced = entity_id in self._forced
            if not forced and not in_window(self._now(), start, end):
                continue
            state = self._system_candidate(part)
            if state is None:
                continue
            if self._system_busy():
                return
            self._forced.discard(entity_id)
            if not await self._async_install_system(part, state):
                return
            await self._async_settle()

    async def _async_settle(self) -> None:
        """Wait until nothing is updating or backing up, plus a short pause."""
        for _ in range(INSTALL_TIMEOUT // max(SETTLE_WAIT, 1) or 1):
            await asyncio.sleep(SETTLE_WAIT)
            if not self._system_busy():
                return

    async def _async_install_system(self, part: str, state: State) -> bool:
        """Install one system update; False when it failed."""
        entity_id = state.entity_id
        version = state.attributes.get("latest_version")
        self.attempts[entity_id] = version
        await self._store.async_save(self._data_to_save())
        ok = await self._async_install(state)
        if ok:
            self.attempts.pop(entity_id, None)
            self._changed()
        return ok

    @callback
    def _sync_failure_issues(self) -> None:
        """Keep one repair issue for each system update that failed."""
        for part, entity_id in SYSTEM_PARTS.items():
            state = self.hass.states.get(entity_id)
            latest = state.attributes.get("latest_version") if state else None
            skipped = state.attributes.get(ATTR_SKIPPED_VERSION) if state else None
            failed = self.failed_versions.get(entity_id)
            issue_id = f"system_update_failed_{part}"
            if state is not None and entity_id in self.failed_versions and (
                failed == latest and latest != skipped
            ):
                result = self.results.get(entity_id) or {}
                ir.async_create_issue(
                    self.hass,
                    DOMAIN,
                    issue_id,
                    is_fixable=False,
                    is_persistent=True,
                    severity=ir.IssueSeverity.WARNING,
                    translation_key="system_update_failed",
                    translation_placeholders={
                        "name": state.name,
                        "version": str(failed),
                        "error": str(result.get("error") or ""),
                    },
                )
            else:
                ir.async_delete_issue(self.hass, DOMAIN, issue_id)

    @callback
    def _settle_attempts(self) -> None:
        """Account for installs that were running when the system restarted."""
        for entity_id, version in list(self.attempts.items()):
            state = self.hass.states.get(entity_id)
            if state is None:
                continue
            del self.attempts[entity_id]
            if state.state == STATE_ON and state.attributes.get("latest_version") == version:
                error = "The system restarted before the update finished"
                self.failed_versions[entity_id] = version
                self._record(entity_id, version, False, error)
            else:
                self.failed_versions.pop(entity_id, None)
                self._record(entity_id, version, True, None)

    async def _async_install(self, state: State) -> bool:
        entity_id = state.entity_id
        version = state.attributes.get("latest_version")
        self._attempted.add((entity_id, version))
        data: dict[str, Any] = {ATTR_ENTITY_ID: entity_id}
        if (
            self.backup
            and state.attributes.get(ATTR_SUPPORTED_FEATURES, 0)
            & UpdateEntityFeature.BACKUP
        ):
            data["backup"] = True
        name = state.name
        try:
            await self.hass.services.async_call(
                UPDATE_DOMAIN, SERVICE_INSTALL, data, blocking=True
            )
        except Exception as err:  # noqa: BLE001
            error = str(err) or type(err).__name__
            self.failed_versions[entity_id] = version
            self._record(entity_id, version, False, error)
            _LOGGER.warning(
                "Automatic update of %s to %s failed: %s", entity_id, version, error
            )
            self._log_entry(entity_id, name, f"Automatic update failed: {error}")
            return False
        if not await self._async_applied(entity_id, version):
            error = "The update was not confirmed"
            self.failed_versions[entity_id] = version
            self._record(entity_id, version, False, error)
            _LOGGER.warning(
                "Automatic update of %s to %s failed: %s", entity_id, version, error
            )
            self._log_entry(entity_id, name, f"Automatic update failed: {error}")
            return False
        self.failed_versions.pop(entity_id, None)
        self._record(entity_id, version, True, None)
        _LOGGER.info("Updated %s to %s automatically", entity_id, version)
        self._log_entry(
            entity_id,
            name,
            f"Updated automatically to {version}"
            if version
            else "Updated automatically",
        )
        return True

    async def _async_applied(self, entity_id: str, version: str | None) -> bool:
        """Wait for the install to finish and the new version to show up.

        The install action returns early for entities that report progress, so
        wait here to keep to one install at a time.
        """
        done = asyncio.Event()

        @callback
        def _check(event: Event[EventStateChangedData] | None = None) -> None:
            state = self.hass.states.get(entity_id)
            if state is None:
                done.set()
                return
            attrs = state.attributes
            if attrs.get(ATTR_IN_PROGRESS):
                return
            if state.state != STATE_ON or attrs.get("latest_version") != version:
                done.set()

        unsub = async_track_state_change_event(self.hass, entity_id, _check)
        try:
            _check()
            waited = 0
            while not done.is_set():
                try:
                    async with asyncio.timeout(CONFIRM_WAIT):
                        await done.wait()
                except TimeoutError:
                    waited += CONFIRM_WAIT
                    state = self.hass.states.get(entity_id)
                    busy = state is not None and state.attributes.get(ATTR_IN_PROGRESS)
                    if not busy or waited >= INSTALL_TIMEOUT:
                        return False
        finally:
            unsub()
        return True

    @callback
    def _record(
        self, entity_id: str, version: str | None, ok: bool, error: str | None
    ) -> None:
        self.results[entity_id] = {
            "time": datetime.now(UTC).isoformat(),
            "version": version,
            "ok": ok,
            "error": error,
        }
        self._changed()
        self._sync_failure_issues()

    @callback
    def _log_entry(self, entity_id: str, name: str, message: str) -> None:
        self.hass.bus.async_fire(
            "logbook_entry",
            {
                "name": name,
                "message": message,
                "domain": DOMAIN,
                "entity_id": entity_id,
            },
        )


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up automatic updates."""
    manager = AutoUpdateManager(hass)
    await manager.async_load()
    hass.data[DATA_MANAGER] = manager

    @callback
    def _state_filter(data: EventStateChangedData) -> bool:
        return data["entity_id"].startswith("update.")

    @callback
    def _on_state_changed(event: Event[EventStateChangedData]) -> None:
        new_state = event.data["new_state"]
        if new_state is not None and new_state.state == STATE_ON:
            manager.async_schedule()

    hass.bus.async_listen(
        EVENT_STATE_CHANGED, _on_state_changed, event_filter=_state_filter
    )

    @callback
    def _started(hass: HomeAssistant) -> None:
        manager._settle_attempts()  # noqa: SLF001
        manager.async_schedule()

    async_at_started(hass, _started)

    @callback
    def _tick(now: datetime) -> None:
        if any(manager.system.values()) or manager._forced:  # noqa: SLF001
            manager.async_schedule()

    unsub_tick = async_track_time_interval(hass, _tick, CHECK_INTERVAL)

    @callback
    def _stop(event: Event) -> None:
        unsub_tick()

    hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STOP, _stop)

    websocket_api.async_register_command(hass, websocket_info)
    websocket_api.async_register_command(hass, websocket_subscribe)
    websocket_api.async_register_command(hass, websocket_set_all)
    websocket_api.async_register_command(hass, websocket_set_entity)
    websocket_api.async_register_command(hass, websocket_set_backup)
    websocket_api.async_register_command(hass, websocket_set_system)
    websocket_api.async_register_command(hass, websocket_set_system_window)
    websocket_api.async_register_command(hass, websocket_set_system_wait)
    websocket_api.async_register_command(hass, websocket_retry_system)
    return True


@websocket_api.require_admin
@websocket_api.websocket_command({probatio.Required("type"): "auto_update/info"})
@callback
def websocket_info(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Send the settings and the state of every update entity."""
    connection.send_result(msg["id"], hass.data[DATA_MANAGER].async_info())


@websocket_api.require_admin
@websocket_api.websocket_command({probatio.Required("type"): "auto_update/subscribe"})
@callback
def websocket_subscribe(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Send the full picture now and again whenever it changes."""
    manager = hass.data[DATA_MANAGER]

    @callback
    def _send() -> None:
        connection.send_message(websocket_api.event_message(msg["id"], manager.async_info()))

    connection.subscriptions[msg["id"]] = manager.async_add_listener(_send)
    connection.send_result(msg["id"])
    _send()


@websocket_api.require_admin
@websocket_api.websocket_command(
    {probatio.Required("type"): "auto_update/set_all", probatio.Required("enabled"): bool}
)
@callback
def websocket_set_all(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Switch automatic updating of everything on or off."""
    hass.data[DATA_MANAGER].async_set_all(msg["enabled"])
    connection.send_result(msg["id"])


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "auto_update/set_entity",
        probatio.Required("entity_id"): cv.entity_id,
        probatio.Required("enabled"): probatio.Any(bool, None),
    }
)
@callback
def websocket_set_entity(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Set automatic updating for one update entity."""
    manager = hass.data[DATA_MANAGER]
    entity_id = msg["entity_id"]
    if not entity_id.startswith("update."):
        connection.send_error(msg["id"], "invalid_format", "Not an update entity")
        return
    if manager.protected_reason(entity_id) is not None and msg["enabled"] is not False:
        connection.send_error(
            msg["id"],
            "not_allowed",
            "This update restarts the system; switch it on under automatic system updates",
        )
        return
    manager.async_set_entity(entity_id, msg["enabled"])
    connection.send_result(msg["id"])


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "auto_update/set_backup",
        probatio.Required("enabled"): bool,
    }
)
@callback
def websocket_set_backup(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Choose whether a backup is requested before installing."""
    hass.data[DATA_MANAGER].async_set_backup(msg["enabled"])
    connection.send_result(msg["id"])


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "auto_update/set_system",
        probatio.Required("part"): probatio.In(list(SYSTEM_PARTS)),
        probatio.Required("enabled"): bool,
    }
)
@callback
def websocket_set_system(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Switch automatic updating of Core, the Supervisor or the system on or off."""
    hass.data[DATA_MANAGER].async_set_system(msg["part"], msg["enabled"])
    connection.send_result(msg["id"])


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "auto_update/set_system_window",
        probatio.Required("start"): _clock_string,
        probatio.Required("end"): _clock_string,
    }
)
@callback
def websocket_set_system_window(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Choose the time window for automatic system updates."""
    if window_length(parse_clock(msg["start"]), parse_clock(msg["end"])) < MIN_WINDOW_LENGTH:
        connection.send_error(
            msg["id"], "invalid_format", "The window must be at least 30 minutes long"
        )
        return
    hass.data[DATA_MANAGER].async_set_window(msg["start"], msg["end"])
    connection.send_result(msg["id"])


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "auto_update/set_system_wait",
        probatio.Required("days"): probatio.All(int, probatio.Range(min=0, max=MAX_WAIT_DAYS)),
    }
)
@callback
def websocket_set_system_wait(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Choose how many days a system update waits after it first appears."""
    hass.data[DATA_MANAGER].async_set_wait_days(msg["days"])
    connection.send_result(msg["id"])


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        probatio.Required("type"): "auto_update/retry_system",
        probatio.Required("part"): probatio.In(list(SYSTEM_PARTS)),
    }
)
@callback
def websocket_retry_system(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Try a failed system update again now."""
    hass.data[DATA_MANAGER].async_retry_system(msg["part"])
    connection.send_result(msg["id"])
