"""Install available updates automatically.

The server does the work, so updates are installed without any browser being
open. Automatic updating can be switched on for everything or for single update
entities. Home Assistant Core, the Supervisor and the operating system are
never installed automatically, because installing them restarts the system.
"""

import asyncio
from collections.abc import Callable
from datetime import UTC, datetime
import logging
from typing import Any

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
from homeassistant.helpers import config_validation as cv, entity_registry as er
from homeassistant.helpers.event import async_track_state_change_event
from homeassistant.helpers.start import async_at_started
from homeassistant.helpers.storage import Store
from homeassistant.helpers.typing import ConfigType
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

_LOGGER = logging.getLogger(__name__)

DATA_MANAGER: HassKey["AutoUpdateManager"] = HassKey(DOMAIN)


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
        self._attempted: set[tuple[str, str | None]] = set()
        self._task: asyncio.Task[None] | None = None
        self._wanted = False
        self._listeners: list[Callable[[], None]] = []

    async def async_load(self) -> None:
        """Read the stored settings."""
        data = await self._store.async_load()
        if not data:
            return
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

    async def _async_install(self, state: State) -> None:
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
            return
        if not await self._async_applied(entity_id, version):
            error = "The update was not confirmed"
            self.failed_versions[entity_id] = version
            self._record(entity_id, version, False, error)
            _LOGGER.warning(
                "Automatic update of %s to %s failed: %s", entity_id, version, error
            )
            self._log_entry(entity_id, name, f"Automatic update failed: {error}")
            return
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
        manager.async_schedule()

    async_at_started(hass, _started)

    websocket_api.async_register_command(hass, websocket_info)
    websocket_api.async_register_command(hass, websocket_subscribe)
    websocket_api.async_register_command(hass, websocket_set_all)
    websocket_api.async_register_command(hass, websocket_set_entity)
    websocket_api.async_register_command(hass, websocket_set_backup)
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
            "This update restarts the system and is never installed automatically",
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
