"""Tests for automatic updates of Core, the Supervisor and the operating system.

These protect the promises the updates page makes: nothing installs unless its
own switch is on, only inside the time window and only after the wait, one part
at a time in the order Supervisor, Core, operating system, never while anything
else is updating or backing up, never twice for a version that failed, and
never as a downgrade.
"""

from datetime import UTC, datetime, time, timedelta
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from pytest_homeassistant.typing import WebSocketGenerator

from homeassistant.components.auto_update import (
    DATA_MANAGER,
    DOMAIN,
    SYSTEM_PARTS,
    AutoUpdateManager,
    in_window,
    is_newer,
    window_bounds,
)
from homeassistant.components.update import DOMAIN as UPDATE_DOMAIN
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import issue_registry as ir
from homeassistant.setup import async_setup_component
from homeassistant.util import dt as dt_util

SUPERVISOR = SYSTEM_PARTS["supervisor"]
CORE = SYSTEM_PARTS["core"]
OS = SYSTEM_PARTS["os"]
INSTALL = 1
INSTALL_AND_BACKUP = 1 | 8


def _local(hour: int, minute: int = 0, day: int = 17) -> datetime:
    return datetime(2026, 11, day, hour, minute, tzinfo=dt_util.get_default_time_zone())


def _set_update(
    hass: HomeAssistant,
    entity_id: str,
    state: str = "on",
    installed: str = "1.0",
    latest: str = "2.0",
    features: int = INSTALL_AND_BACKUP,
    in_progress: bool = False,
    skipped: str | None = None,
) -> None:
    hass.states.async_set(
        entity_id,
        state,
        {
            "installed_version": installed,
            "latest_version": latest,
            "skipped_version": skipped,
            "in_progress": in_progress,
            "supported_features": features,
        },
    )


async def _mock_install(hass: HomeAssistant) -> list[ServiceCall]:
    assert await async_setup_component(hass, UPDATE_DOMAIN, {})
    calls: list[ServiceCall] = []

    async def install(call: ServiceCall) -> None:
        calls.append(call)
        _set_update(
            hass, call.data["entity_id"], state="off", installed="2.0", latest="2.0"
        )

    hass.services.async_register(UPDATE_DOMAIN, "install", install)
    return calls


@pytest.fixture(autouse=True)
def _quick_settle():
    with patch("homeassistant.components.auto_update.SETTLE_WAIT", 0.01):
        yield


async def _drain(hass: HomeAssistant, manager: "AutoUpdateManager") -> None:
    """Wait for the installer's background task, which block_till_done skips."""
    await hass.async_block_till_done()
    while manager._task is not None and not manager._task.done():
        await manager._task
    await hass.async_block_till_done()


class _Clock:
    def __init__(self, now: datetime) -> None:
        self.now = now


@pytest.fixture
def clock():
    """Control the time the manager sees; it starts inside the window."""
    value = _Clock(_local(3, 30))
    with patch.object(AutoUpdateManager, "_now", lambda self: value.now):
        yield value


async def _setup(hass: HomeAssistant, wait_days: int = 0) -> AutoUpdateManager:
    assert await async_setup_component(hass, DOMAIN, {})
    manager = hass.data[DATA_MANAGER]
    manager.wait_days = wait_days
    return manager


@pytest.mark.parametrize(
    ("hour", "minute", "expected"),
    [(2, 59, False), (3, 0, True), (4, 59, True), (5, 0, False)],
)
def test_in_window_same_day(hour: int, minute: int, expected: bool) -> None:
    """A window that stays within one day includes its start, not its end."""
    assert in_window(_local(hour, minute), time(3), time(5)) is expected


@pytest.mark.parametrize(
    ("hour", "minute", "expected"),
    [
        (22, 59, False),
        (23, 0, True),
        (0, 30, True),
        (0, 59, True),
        (1, 0, False),
        (12, 0, False),
    ],
)
def test_in_window_crosses_midnight(hour: int, minute: int, expected: bool) -> None:
    """A window that crosses midnight is open on both sides of it."""
    assert in_window(_local(hour, minute), time(23), time(1)) is expected


def test_window_bounds_for_open_and_upcoming_windows() -> None:
    """The open window is reported while open, otherwise the next one."""
    assert window_bounds(_local(0, 30), time(23), time(1)) == (
        _local(23, 0, 16),
        _local(1, 0, 17),
    )
    assert window_bounds(_local(12), time(3), time(5)) == (
        _local(3, 0, 18),
        _local(5, 0, 18),
    )
    assert window_bounds(_local(2), time(3), time(5)) == (
        _local(3, 0, 17),
        _local(5, 0, 17),
    )


@pytest.mark.parametrize(
    ("installed", "latest", "expected"),
    [
        ("1.0", "2.0", True),
        ("2.0", "2.0", False),
        ("3.0", "2.0", False),
        (None, "2.0", False),
        ("1.0", None, False),
    ],
)
def test_is_newer_never_a_downgrade(
    installed: str | None, latest: str | None, expected: bool
) -> None:
    """Only a real step forward counts."""
    assert is_newer(installed, latest) is expected


async def test_nothing_installs_while_its_switch_is_off(
    hass: HomeAssistant, clock: _Clock
) -> None:
    """The system switches default to off and are independent."""
    calls = await _mock_install(hass)
    manager = await _setup(hass)
    manager.async_set_all(True)
    for entity_id in SYSTEM_PARTS.values():
        _set_update(hass, entity_id)
    await _drain(hass, manager)
    assert not calls

    manager.async_set_system("os", True)
    await _drain(hass, manager)
    assert [call.data["entity_id"] for call in calls] == [OS]


async def test_installs_in_the_safe_order(hass: HomeAssistant, clock: _Clock) -> None:
    """Supervisor first, then Core, then the operating system."""
    calls = await _mock_install(hass)
    manager = await _setup(hass)
    for entity_id in (OS, CORE, SUPERVISOR):
        _set_update(hass, entity_id)
    for part in SYSTEM_PARTS:
        manager.async_set_system(part, True)
    await _drain(hass, manager)
    assert [call.data["entity_id"] for call in calls] == [SUPERVISOR, CORE, OS]


async def test_waits_for_the_window(hass: HomeAssistant, clock: _Clock) -> None:
    """Outside the window nothing installs; inside it the update goes ahead."""
    calls = await _mock_install(hass)
    manager = await _setup(hass)
    clock.now = _local(12)
    _set_update(hass, CORE)
    manager.async_set_system("core", True)
    await _drain(hass, manager)
    assert not calls

    clock.now = _local(3, 10, day=18)
    manager.async_schedule()
    await _drain(hass, manager)
    assert [call.data["entity_id"] for call in calls] == [CORE]


async def test_window_that_crosses_midnight(hass: HomeAssistant, clock: _Clock) -> None:
    """A window from 23:00 to 01:00 is open at half past midnight."""
    calls = await _mock_install(hass)
    manager = await _setup(hass)
    manager.async_set_window("23:00", "01:00")
    clock.now = _local(0, 30)
    _set_update(hass, CORE)
    manager.async_set_system("core", True)
    await _drain(hass, manager)
    assert len(calls) == 1


async def test_waits_the_chosen_number_of_days(
    hass: HomeAssistant, clock: _Clock
) -> None:
    """A new version waits its days before it is installed."""
    calls = await _mock_install(hass)
    manager = await _setup(hass, wait_days=1)
    _set_update(hass, CORE)
    manager.async_set_system("core", True)
    await _drain(hass, manager)
    assert not calls
    parts = manager.async_info()["system"]["parts"]
    core = next(part for part in parts if part["part"] == "core")
    assert core["eligible_at"] == (_local(3, 30) + timedelta(days=1)).isoformat()

    clock.now = _local(3, 30, day=18)
    manager.async_schedule()
    await _drain(hass, manager)
    assert len(calls) == 1


async def test_a_newer_version_restarts_the_wait(
    hass: HomeAssistant, clock: _Clock
) -> None:
    """A fix that appears resets the wait for the newer version."""
    calls = await _mock_install(hass)
    manager = await _setup(hass, wait_days=1)
    _set_update(hass, CORE, latest="2.0")
    manager.async_set_system("core", True)
    await _drain(hass, manager)

    clock.now = _local(3, 30, day=18)
    _set_update(hass, CORE, latest="2.1")
    await _drain(hass, manager)
    assert not calls
    assert manager.first_seen[CORE]["version"] == "2.1"


async def test_refuses_while_something_else_is_busy(
    hass: HomeAssistant, clock: _Clock
) -> None:
    """Another update, a backup or a restore keeps the install from starting."""
    calls = await _mock_install(hass)
    manager = await _setup(hass)
    _set_update(hass, "update.some_app", in_progress=True)
    _set_update(hass, CORE)
    manager.async_set_system("core", True)
    await _drain(hass, manager)
    assert not calls

    hass.data["backup"] = SimpleNamespace(state="create_backup")
    _set_update(hass, "update.some_app", in_progress=False)
    manager.async_schedule()
    await _drain(hass, manager)
    assert not calls

    hass.data["backup"] = SimpleNamespace(state="restore_backup")
    manager.async_schedule()
    await _drain(hass, manager)
    assert not calls

    hass.data["backup"] = SimpleNamespace(state="idle")
    manager.async_schedule()
    await _drain(hass, manager)
    assert len(calls) == 1


async def test_failure_is_not_retried_and_raises_a_repair(
    hass: HomeAssistant, clock: _Clock
) -> None:
    """A failed install is recorded once and the owner sees a repair issue."""
    attempts: list[str] = []

    async def failing(call: ServiceCall) -> None:
        attempts.append(call.data["entity_id"])
        raise HomeAssistantError("disk full")

    assert await async_setup_component(hass, UPDATE_DOMAIN, {})
    hass.services.async_register(UPDATE_DOMAIN, "install", failing)
    manager = await _setup(hass)
    _set_update(hass, SUPERVISOR)
    manager.async_set_system("supervisor", True)
    await _drain(hass, manager)
    _set_update(hass, SUPERVISOR)
    manager.async_schedule()
    await _drain(hass, manager)

    assert attempts == [SUPERVISOR]
    assert manager.results[SUPERVISOR]["ok"] is False
    assert "disk full" in manager.results[SUPERVISOR]["error"]
    registry = ir.async_get(hass)
    assert registry.async_get_issue(DOMAIN, "system_update_failed_supervisor")
    parts = manager.async_info()["system"]["parts"]
    assert parts[0]["failed"]["version"] == "2.0"

    _set_update(hass, SUPERVISOR, latest="3.0")
    await _drain(hass, manager)
    assert attempts == [SUPERVISOR, SUPERVISOR]


async def test_try_now_runs_a_failed_update_outside_the_window(
    hass: HomeAssistant, clock: _Clock
) -> None:
    """Try now ignores the window and the wait, once."""
    attempts: list[str] = []

    async def failing(call: ServiceCall) -> None:
        attempts.append(call.data["entity_id"])
        raise HomeAssistantError("busy")

    assert await async_setup_component(hass, UPDATE_DOMAIN, {})
    hass.services.async_register(UPDATE_DOMAIN, "install", failing)
    manager = await _setup(hass)
    _set_update(hass, CORE)
    manager.async_set_system("core", True)
    await _drain(hass, manager)
    assert attempts == [CORE]

    clock.now = _local(12)
    manager.async_retry_system("core")
    await _drain(hass, manager)
    assert attempts == [CORE, CORE]


async def test_backup_first_only_where_supported(
    hass: HomeAssistant, clock: _Clock
) -> None:
    """The backup option is passed to updates that support a backup."""
    calls = await _mock_install(hass)
    manager = await _setup(hass)
    _set_update(hass, SUPERVISOR, features=INSTALL)
    _set_update(hass, CORE, features=INSTALL_AND_BACKUP)
    manager.async_set_system("supervisor", True)
    manager.async_set_system("core", True)
    await _drain(hass, manager)
    by_entity = {call.data["entity_id"]: call.data for call in calls}
    assert "backup" not in by_entity[SUPERVISOR]
    assert by_entity[CORE]["backup"] is True

    manager.async_set_backup(False)
    _set_update(hass, CORE, latest="3.0")
    await _drain(hass, manager)
    assert "backup" not in calls[-1].data


async def test_never_downgrades_or_installs_a_skipped_version(
    hass: HomeAssistant, clock: _Clock
) -> None:
    """An older or skipped version is left alone."""
    calls = await _mock_install(hass)
    manager = await _setup(hass)
    _set_update(hass, CORE, installed="3.0", latest="2.0")
    _set_update(hass, OS, skipped="2.0")
    manager.async_set_system("core", True)
    manager.async_set_system("os", True)
    await _drain(hass, manager)
    assert not calls


async def test_home_time_zone_decides_the_window(hass: HomeAssistant) -> None:
    """18:30 UTC is 03:30 in Tokyo, inside the window there but not in UTC."""
    await hass.config.async_set_time_zone("Asia/Tokyo")
    utc_now = datetime(2026, 11, 17, 18, 30, tzinfo=UTC)

    def home_now(self: AutoUpdateManager) -> datetime:
        return utc_now.astimezone(dt_util.get_default_time_zone())

    calls = await _mock_install(hass)
    with patch.object(AutoUpdateManager, "_now", home_now):
        manager = await _setup(hass)
        _set_update(hass, CORE)
        manager.async_set_system("core", True)
        await _drain(hass, manager)
        assert len(calls) == 1
        window = manager.async_info()["system"]["next_window"]
    assert window["start"].endswith("+09:00")
    assert window["open"] is True


async def test_interrupted_install_is_accounted_for_after_restart(
    hass: HomeAssistant, clock: _Clock
) -> None:
    """An install that restarted the system is judged by what is installed."""
    manager = await _setup(hass)
    manager.attempts = {CORE: "2.0", OS: "2.0"}
    _set_update(hass, CORE, state="off", installed="2.0", latest="2.0")
    _set_update(hass, OS)
    manager._settle_attempts()
    assert manager.results[CORE]["ok"] is True
    assert manager.results[OS]["ok"] is False
    assert manager.failed_versions[OS] == "2.0"
    assert not manager.attempts


@pytest.mark.parametrize(
    ("message", "success"),
    [
        ({"type": "auto_update/set_system", "part": "core", "enabled": True}, True),
        ({"type": "auto_update/set_system", "part": "other", "enabled": True}, False),
        (
            {"type": "auto_update/set_system_window", "start": "03:00", "end": "05:00"},
            True,
        ),
        (
            {"type": "auto_update/set_system_window", "start": "03:00", "end": "03:10"},
            False,
        ),
        ({"type": "auto_update/set_system_wait", "days": 14}, True),
        ({"type": "auto_update/set_system_wait", "days": 15}, False),
        ({"type": "auto_update/set_system_wait", "days": -1}, False),
    ],
)
async def test_websocket_settings_are_validated(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    message: dict[str, object],
    success: bool,
) -> None:
    """The window must be long enough and the wait between 0 and 14 days."""
    await _setup(hass)
    client = await hass_ws_client(hass)
    await client.send_json_auto_id(message)
    assert (await client.receive_json())["success"] is success


async def test_info_describes_the_system_settings(
    hass: HomeAssistant, clock: _Clock
) -> None:
    """The page gets the switches, window, wait and next window."""
    manager = await _setup(hass, wait_days=1)
    clock.now = _local(12)
    system = manager.async_info()["system"]
    assert system["enabled"] == {"supervisor": False, "core": False, "os": False}
    assert system["window"] == {"start": "03:00", "end": "05:00"}
    assert system["wait_days"] == 1
    assert system["next_window"]["open"] is False
    assert system["next_window"]["day_offset"] == 1


async def test_check_for_updates_installs_nothing_while_switches_are_off(
    hass: HomeAssistant, clock: _Clock
) -> None:
    """Newly found system updates only show; the switch for everything does not cover them."""
    calls = await _mock_install(hass)
    manager = await _setup(hass)
    manager.async_set_all(True)
    for entity_id in SYSTEM_PARTS.values():
        _set_update(hass, entity_id, state="off", latest="1.0")
    await _drain(hass, manager)

    # A check for updates finds a new version of every part inside the window
    for entity_id in SYSTEM_PARTS.values():
        _set_update(hass, entity_id, latest="3.0")
    await _drain(hass, manager)
    # A later check in the window, after the wait, still installs nothing
    clock.now = _local(4, 30)
    manager.async_schedule()
    await _drain(hass, manager)
    assert not calls


async def test_info_reports_the_supervisor_updating_itself(
    hass: HomeAssistant, clock: _Clock
) -> None:
    """The page can warn when the Supervisor's own flag is still on."""
    manager = await _setup(hass)
    _set_update(hass, CORE)
    hass.states.async_set(
        SUPERVISOR,
        "on",
        {
            "installed_version": "1.0",
            "latest_version": "2.0",
            "supported_features": INSTALL,
            "auto_update": True,
        },
    )
    parts = {part["part"]: part for part in manager.async_info()["system"]["parts"]}
    assert parts["supervisor"]["self_update"] is True
    assert parts["core"]["self_update"] is None
    assert parts["os"]["self_update"] is None
