"""Tests for the live recording and the WebSocket commands."""

from datetime import timedelta
import json
from pathlib import Path
import subprocess
from unittest.mock import patch

from freezegun import freeze_time
import pytest
from pytest_homeassistant.common import MockUser, async_fire_time_changed
from pytest_homeassistant.typing import WebSocketGenerator

from homeassistant.components.activity_record import (
    CONFIG_SCHEMA,
    DOMAIN,
    manager as manager_module,
)
from homeassistant.components.activity_record.manager import ActivityRecorder
from homeassistant.components.activity_record.repository import ActivityRepository
from homeassistant.components.logbook import async_log_entry
from homeassistant.components.recorder import Recorder
from homeassistant.const import (
    EVENT_HOMEASSISTANT_FINAL_WRITE,
    EVENT_HOMEASSISTANT_STOP,
)
from homeassistant.core import Context, CoreState, HomeAssistant
from homeassistant.setup import async_setup_component
from homeassistant.util import dt as dt_util

NOW = "2026-11-11T10:00:00+00:00"
DAY = "2026-11-11"


@pytest.fixture
async def recorder(
    recorder_mock: Recorder, hass: HomeAssistant, tmp_path: Path
) -> ActivityRecorder:
    """Set up the record in a temporary configuration folder."""
    hass.config.config_dir = str(tmp_path)
    assert await async_setup_component(hass, "logbook", {})
    assert await async_setup_component(hass, DOMAIN, {})
    await hass.async_block_till_done(wait_background_tasks=True)
    return hass.data[DOMAIN]


async def _settle(hass: HomeAssistant, seconds: int) -> None:
    async_fire_time_changed(hass, dt_util.utcnow() + timedelta(seconds=seconds))
    await hass.async_block_till_done(wait_background_tasks=True)


async def _flush(hass: HomeAssistant) -> None:
    """Let the short wait before a flush pass."""
    await _settle(hass, 4)


def _files(hass: HomeAssistant) -> list[Path]:
    return sorted(
        path
        for path in Path(hass.config.path("activity_record")).glob("2026/*/*.jsonl")
        if path.is_file()
    )


def _entries(hass: HomeAssistant, day: str = DAY) -> list[dict]:
    entries = []
    for path in _files(hass):
        if path.name.startswith(day):
            entries += [json.loads(line) for line in path.read_text("utf-8").splitlines()]
    return entries


def _names(hass: HomeAssistant) -> list[str]:
    return [e.get("name") for path in _files(hass) for e in _read(path)]


def _read(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text("utf-8").splitlines()]


def _entry(n: int, day: str = DAY) -> dict:
    return {"when": f"{day}T10:00:0{n}+00:00", "kind": "logbook", "name": f"e{n}"}


def _commit_count(hass: HomeAssistant) -> int:
    result = subprocess.run(
        ["git", "rev-list", "--count", "HEAD"],
        cwd=hass.config.path("activity_record"),
        capture_output=True,
        text=True,
        check=False,
    )
    return int(result.stdout.strip() or 0)


@freeze_time(NOW)
@pytest.mark.usefixtures("recorder")
async def test_state_change_is_written_as_the_page_shows_it(
    hass: HomeAssistant,
) -> None:
    """A change the Activity page shows is appended to today's chunk."""
    hass.states.async_set("light.kitchen", "off", {"friendly_name": "Kitchen"})
    hass.states.async_set("light.kitchen", "on", {"friendly_name": "Kitchen"})
    await hass.async_block_till_done(wait_background_tasks=True)
    await _flush(hass)
    assert [p.name for p in _files(hass)] == [f"{DAY}.001.jsonl"]
    entries = _entries(hass)
    assert len(entries) == 1
    entry = entries[0]
    assert entry["when"].startswith(DAY)
    assert entry["kind"] == "state_change"
    assert entry["entity_id"] == "light.kitchen"
    assert entry["name"] == "Kitchen"
    assert entry["state"] == "on"
    assert entry["context_id"]


@freeze_time(NOW)
@pytest.mark.usefixtures("recorder")
async def test_continuous_sensor_is_not_written(hass: HomeAssistant) -> None:
    """What the page leaves out, the record leaves out."""
    hass.states.async_set("sensor.temp", "20", {"unit_of_measurement": "C"})
    hass.states.async_set("sensor.temp", "21", {"unit_of_measurement": "C"})
    hass.states.async_set("light.a", "off")
    hass.states.async_set("light.a", "on")
    await hass.async_block_till_done(wait_background_tasks=True)
    await _flush(hass)
    assert [e["entity_id"] for e in _entries(hass)] == ["light.a"]


@freeze_time(NOW)
@pytest.mark.usefixtures("recorder")
async def test_logbook_entry_keeps_who_caused_it_and_is_masked(
    hass: HomeAssistant,
) -> None:
    """A described entry keeps its user and context and has secrets removed."""
    async_log_entry(
        hass,
        "Door",
        "opened with token=abcdef123456",
        "light",
        "light.hall",
        Context(user_id="0123456789abcdef0123456789abcdef", parent_id="PARENT"),
    )
    await hass.async_block_till_done(wait_background_tasks=True)
    await _flush(hass)
    entry = _entries(hass)[0]
    assert entry["kind"] == "logbook"
    assert entry["context_user_id"] == "0123456789abcdef0123456789abcdef"
    assert entry["context_parent_id"] == "PARENT"
    assert "abcdef123456" not in entry["message"]


@freeze_time(NOW)
async def test_a_quiet_home_waits_before_it_writes(
    recorder: ActivityRecorder, hass: HomeAssistant
) -> None:
    """The first entry waits a few seconds so one flush takes many entries."""
    hass.states.async_set("light.a", "off")
    hass.states.async_set("light.a", "on")
    await hass.async_block_till_done(wait_background_tasks=True)
    assert _files(hass) == []
    assert recorder._flush_timer is not None
    await _settle(hass, 2)
    assert _files(hass) == []
    await _settle(hass, 4)
    assert len(_entries(hass)) == 1


@freeze_time(NOW)
async def test_a_full_batch_is_written_at_once(
    recorder: ActivityRecorder, hass: HomeAssistant
) -> None:
    """A thousand queued entries do not wait for the timer."""
    with patch.object(manager_module, "BATCH_SIZE", 3):
        for n in range(3):
            recorder._enqueue(_entry(n))
        await hass.async_block_till_done(wait_background_tasks=True)
    assert _names(hass) == ["e0", "e1", "e2"]


@freeze_time(NOW)
async def test_commits_are_batched_every_ten_minutes(
    recorder: ActivityRecorder, hass: HomeAssistant
) -> None:
    """Many entries in one interval make a single commit; the default interval is 600 s."""
    assert recorder.commit_interval == 600
    await hass.async_add_executor_job(recorder.repository.commit)
    for n in range(20):
        hass.states.async_set("light.a", "on" if n % 2 else "off")
    await hass.async_block_till_done(wait_background_tasks=True)
    await _flush(hass)
    before = _commit_count(hass)
    await _settle(hass, 300)
    assert _commit_count(hass) == before
    await _settle(hass, 601)
    assert _commit_count(hass) == before + 1
    assert recorder.repository.uncommitted == 0


def test_commit_interval_defaults_and_minimum() -> None:
    """Ten minutes by default, one minute at least."""
    assert CONFIG_SCHEMA({DOMAIN: {}})[DOMAIN]["commit_interval"] == 600
    assert CONFIG_SCHEMA({DOMAIN: {"commit_interval": 60}})
    with pytest.raises(Exception):  # noqa: B017, PT011
        CONFIG_SCHEMA({DOMAIN: {"commit_interval": 59}})


@freeze_time(NOW)
async def test_a_failed_write_loses_nothing_and_keeps_the_order(
    recorder: ActivityRecorder, hass: HomeAssistant
) -> None:
    """A full disk puts the batch back; it is retried with backoff and lands in order."""
    for n in range(3):
        recorder._enqueue(_entry(n))
    real = recorder.repository.append
    calls = {"n": 0}

    def flaky(items):
        calls["n"] += 1
        if calls["n"] <= 2:
            raise OSError("disk full")
        return real(items)

    delays: list[float] = []
    real_later = manager_module.async_call_later

    def later(hass_, delay, action):
        delays.append(delay)
        return real_later(hass_, delay, action)

    with (
        patch.object(recorder.repository, "append", flaky),
        patch.object(manager_module, "async_call_later", later),
    ):
        await _settle(hass, 4)
        assert _files(hass) == []
        assert recorder.dropped_total == 0
        assert recorder.last_error == "disk full"
        status = await recorder.async_status()
        assert status["queue_depth"] == 3
        assert status["retrying"] is True
        await _settle(hass, 4 + 6)
        recorder._enqueue(_entry(3))
        await _settle(hass, 4 + 6 + 11)
        await _settle(hass, 4 + 6 + 11 + 5)
    assert delays[:2] == [5, 10]
    assert _names(hass) == ["e0", "e1", "e2", "e3"]
    assert recorder.dropped_total == 0
    assert recorder.last_error is None


@freeze_time(NOW)
async def test_backoff_grows_and_then_stays_at_a_minute(
    recorder: ActivityRecorder, hass: HomeAssistant
) -> None:
    """Retries wait 5, 10, 30 and then 60 seconds."""
    recorder._enqueue(_entry(0))
    delays: list[float] = []
    real_later = manager_module.async_call_later

    def later(hass_, delay, action):
        delays.append(delay)
        return real_later(hass_, delay, action)

    with (
        patch.object(
            recorder.repository, "append", side_effect=OSError("read-only")
        ),
        patch.object(manager_module, "async_call_later", later),
    ):
        offset = 4
        await _settle(hass, offset)
        for wait in (6, 11, 31, 61, 61):
            offset += wait
            await _settle(hass, offset)
    assert [d for d in delays if d >= 5] == [5, 10, 30, 60, 60, 60][: len([d for d in delays if d >= 5])]
    assert delays.count(60) >= 1


@freeze_time(NOW)
async def test_a_partial_multi_day_write_requeues_only_the_rest(
    recorder: ActivityRecorder, hass: HomeAssistant
) -> None:
    """When the second day fails the first is not written twice and the second is not lost."""
    blocked = Path(hass.config.path("activity_record", "2026", "11", "2026-11-12.001.jsonl"))
    blocked.mkdir(parents=True)
    recorder._enqueue(_entry(0))
    recorder._enqueue(_entry(1, "2026-11-12"))
    await _settle(hass, 4)
    assert _names(hass) == ["e0"]
    assert recorder.dropped_total == 0
    blocked.rmdir()
    await _settle(hass, 4 + 6)
    assert sorted(_names(hass)) == ["e0", "e1"]


@freeze_time(NOW)
async def test_a_bad_entry_becomes_a_placeholder_not_a_lost_batch(
    recorder: ActivityRecorder, hass: HomeAssistant
) -> None:
    """An entry that cannot be masked leaves a line that says so; the rest is kept."""
    recorder._enqueue(_entry(0))
    recorder._enqueue({"when": f"{DAY}T10:00:05+00:00", "kind": "logbook", "name": "boom"})
    recorder._enqueue(_entry(2))
    real = manager_module.mask_entry

    def mask(entry, secrets):
        if entry.get("name") == "boom":
            raise ValueError("cannot mask")
        return real(entry, secrets)

    with patch.object(manager_module, "mask_entry", mask):
        await _flush(hass)
    entries = _entries(hass)
    assert [e["name"] for e in entries] == ["e0", "Activity record", "e2"]
    assert entries[1]["kind"] == "unwritable"
    assert "cannot mask" in entries[1]["message"]


@freeze_time(NOW)
async def test_an_entry_without_a_usable_time_is_kept(
    recorder: ActivityRecorder, hass: HomeAssistant
) -> None:
    """Missing or crafted times are filed today and the original is kept."""
    recorder._enqueue({"kind": "logbook", "name": "no time"})
    recorder._enqueue({"when": "../../../etc/x", "kind": "logbook", "name": "bad"})
    await _flush(hass)
    entries = _entries(hass)
    assert [e["name"] for e in entries] == ["no time", "bad"]
    assert entries[1]["when_raw"] == "../../../etc/x"
    assert not list(Path(hass.config.path()).glob("**/etc"))


@freeze_time(NOW)
async def test_full_queue_drops_and_writes_the_drop_down_at_once(
    recorder: ActivityRecorder, hass: HomeAssistant
) -> None:
    """The drop line is queued when the queue first overflows and a summary follows."""
    with patch.object(manager_module, "MAX_QUEUE", 2):
        for n in range(5):
            recorder._enqueue(_entry(n))
    assert recorder.dropped_total == 3
    assert [e["kind"] for e in recorder._queue].count("dropped") == 1
    await _flush(hass)
    dropped = [e for e in _entries(hass) if e.get("kind") == "dropped"]
    assert [e["count"] for e in dropped][0] == 1
    assert "being dropped" in dropped[0]["message"]
    await _flush(hass)
    await _settle(hass, 8)
    dropped = [e for e in _entries(hass) if e.get("kind") == "dropped"]
    assert [e["count"] for e in dropped] == [1, 3]
    assert dropped[1]["first_at"] <= dropped[1]["last_at"]
    assert len(_entries(hass)) == 2 + 2


@freeze_time(NOW)
async def test_the_drop_count_survives_a_restart(
    recorder: ActivityRecorder, hass: HomeAssistant
) -> None:
    """The total is kept in an ignored file next to the record."""
    with patch.object(manager_module, "MAX_QUEUE", 1):
        for n in range(4):
            recorder._enqueue(_entry(n))
    await _flush(hass)
    assert recorder.dropped_total == 3
    await recorder.async_stop()
    again = ActivityRecorder(hass, 600)
    await again._async_startup()
    assert again.dropped_total == 3
    status = await again.async_status()
    assert status["dropped_total"] == 3
    await again.async_stop()


@freeze_time(NOW)
async def test_stop_writes_and_commits_the_tail(
    recorder: ActivityRecorder, hass: HomeAssistant
) -> None:
    """On shutdown what is queued is written and committed."""
    hass.states.async_set("light.a", "off")
    hass.states.async_set("light.a", "on")
    await recorder.async_stop()
    assert recorder.repository.uncommitted == 0
    assert len(_entries(hass)) == 1
    log = subprocess.run(
        ["git", "log", "--format=%s"],
        cwd=hass.config.path("activity_record"),
        capture_output=True,
        text=True,
        check=True,
    )
    assert "Record 1 activity entry" in log.stdout


@freeze_time(NOW)
async def test_recording_goes_on_until_the_final_write(
    recorder: ActivityRecorder, hass: HomeAssistant
) -> None:
    """Entries of the stop stage are kept; the final write flushes and commits."""
    hass.bus.async_fire(EVENT_HOMEASSISTANT_STOP)
    await hass.async_block_till_done()
    assert recorder._stopped is False
    hass.states.async_set("light.a", "off")
    hass.states.async_set("light.a", "on")
    await hass.async_block_till_done(wait_background_tasks=True)
    hass.bus.async_fire(EVENT_HOMEASSISTANT_FINAL_WRITE)
    await hass.async_block_till_done(wait_background_tasks=True)
    assert recorder._stopped is True
    assert len(_entries(hass)) == 1
    assert recorder.repository.uncommitted == 0
    recorder._drain_done(False)
    assert recorder._flush_timer is None
    assert recorder._commit_timer is None


async def test_event_types_are_rechecked_every_few_seconds_until_started(
    recorder_mock: Recorder, hass: HomeAssistant, tmp_path: Path
) -> None:
    """Before Home Assistant has started, event types registered later are picked up."""
    hass.set_state(CoreState.starting)
    hass.config.config_dir = str(tmp_path)
    assert await async_setup_component(hass, "logbook", {})
    assert await async_setup_component(hass, DOMAIN, {})
    await hass.async_block_till_done(wait_background_tasks=True)
    recorder: ActivityRecorder = hass.data[DOMAIN]
    assert recorder._early_unsub is not None
    with patch.object(recorder, "_resubscribe") as resubscribe:
        async_fire_time_changed(hass, dt_util.utcnow() + timedelta(seconds=4))
        await hass.async_block_till_done()
    assert resubscribe.call_count >= 1
    recorder.async_refresh()
    assert recorder._early_unsub is None


@pytest.mark.usefixtures("recorder")
async def test_commands(hass: HomeAssistant, hass_ws_client: WebSocketGenerator) -> None:
    """Status, days, read and search answer from the record."""
    for n in range(4):
        hass.states.async_set("light.a", "on" if n % 2 else "off")
    hass.states.async_set("light.b", "off")
    hass.states.async_set("light.b", "on")
    await hass.async_block_till_done(wait_background_tasks=True)
    await _flush(hass)
    client = await hass_ws_client(hass)
    today = dt_util.utcnow().date().isoformat()

    await client.send_json_auto_id({"type": "activity_record/status"})
    status = (await client.receive_json())["result"]
    assert status["entries_today"] == 4
    assert status["files"] == 1
    assert status["remote"] is None
    assert status["recording"] is True
    assert status["queue_depth"] == 0
    assert status["lock_held"] is False
    assert status["dropped_total"] == 0
    assert status["restores"] == []
    assert status["path"].endswith("activity_record")

    await client.send_json_auto_id({"type": "activity_record/days"})
    days = (await client.receive_json())["result"]
    assert [(d["day"], d["entries"]) for d in days["days"]] == [(today, 4)]

    await client.send_json_auto_id(
        {"type": "activity_record/read", "day": today, "limit": 2}
    )
    page = (await client.receive_json())["result"]
    assert len(page["entries"]) == 2
    assert page["has_more"] is True
    assert page["entries"][0]["when"] >= page["entries"][1]["when"]
    await client.send_json_auto_id(
        {
            "type": "activity_record/read",
            "day": today,
            "limit": 5,
            "cursor": page["next_cursor"],
        }
    )
    rest = (await client.receive_json())["result"]
    assert len(rest["entries"]) == 2
    assert rest["has_more"] is False

    await client.send_json_auto_id(
        {"type": "activity_record/search", "entity_id": "light.b", "start": today}
    )
    found = (await client.receive_json())["result"]
    assert [e["entity_id"] for e in found["entries"]] == ["light.b"]
    assert found["truncated"] is False


@pytest.mark.usefixtures("recorder")
@pytest.mark.parametrize(
    ("command", "code"),
    [
        ({"type": "activity_record/read", "day": "nope"}, "invalid_day"),
        ({"type": "activity_record/read", "day": "../../etc"}, "invalid_day"),
        ({"type": "activity_record/read", "day": "2026-11-11/../../x"}, "invalid_day"),
        ({"type": "activity_record/read", "day": "2026-11-11\n"}, "invalid_day"),
        ({"type": "activity_record/read", "day": "2026-13-45"}, "invalid_day"),
        ({"type": "activity_record/read", "day": DAY, "cursor": "../x"}, "invalid_cursor"),
        ({"type": "activity_record/read", "day": DAY, "cursor": "1:2:3"}, "invalid_cursor"),
        ({"type": "activity_record/read", "day": DAY, "cursor": "9" * 40}, "invalid_format"),
        ({"type": "activity_record/search", "start": "../.."}, "invalid_day"),
        ({"type": "activity_record/search", "end": "2026-02-30"}, "invalid_day"),
        ({"type": "activity_record/search", "max_bytes": 10**9}, "invalid_format"),
        ({"type": "activity_record/read", "day": DAY, "offset": 5}, "invalid_format"),
    ],
)
async def test_crafted_days_and_cursors_are_refused(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    command: dict,
    code: str,
) -> None:
    """Strings that are not days or cursors never reach the file system."""
    client = await hass_ws_client(hass)
    await client.send_json_auto_id(command)
    assert (await client.receive_json())["error"]["code"] == code


async def test_cursor_paging_through_the_websocket_with_new_entries(
    recorder: ActivityRecorder, hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """Older entries continue from the cursor even when newer ones arrive between pages."""
    today = dt_util.utcnow().date().isoformat()
    for n in range(8):
        recorder._enqueue(_entry(n, today))
    await _flush(hass)
    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {"type": "activity_record/read", "day": today, "limit": 3}
    )
    first = (await client.receive_json())["result"]
    for n in range(8, 10):
        recorder._enqueue(_entry(n, today))
    await _flush(hass)
    await client.send_json_auto_id(
        {
            "type": "activity_record/read",
            "day": today,
            "limit": 10,
            "cursor": first["next_cursor"],
        }
    )
    second = (await client.receive_json())["result"]
    names = [e["name"] for e in first["entries"] + second["entries"]]
    assert names == [f"e{n}" for n in (7, 6, 5, 4, 3, 2, 1, 0)]
    assert first["total"] == 8


async def test_one_search_at_a_time(
    recorder: ActivityRecorder, hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """A second search while one runs is answered busy."""
    client = await hass_ws_client(hass)
    with recorder.repository._search_lock:
        await client.send_json_auto_id({"type": "activity_record/search"})
        assert (await client.receive_json())["error"]["code"] == "busy"
    await client.send_json_auto_id({"type": "activity_record/search"})
    assert (await client.receive_json())["success"]


@pytest.mark.usefixtures("recorder")
async def test_push_runs_in_the_background_and_shows_progress(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    tmp_path: Path,
) -> None:
    """The push command starts a task; the status reports its progress and result."""
    bare = tmp_path / "bare.git"
    subprocess.run(["git", "init", "--bare", str(bare)], check=True, capture_output=True)
    subprocess.run(
        ["git", "remote", "add", "origin", str(bare)],
        cwd=hass.config.path("activity_record"),
        check=True,
        capture_output=True,
    )
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "activity_record/push"})
    assert (await client.receive_json())["result"] == {"started": True}
    await hass.async_block_till_done(wait_background_tasks=True)
    await client.send_json_auto_id({"type": "activity_record/status"})
    status = (await client.receive_json())["result"]
    assert status["push"]["running"] is False
    assert status["push"]["step"] == status["push"]["steps"] >= 1
    assert status["last_push"]["ok"] is True


async def test_a_second_instance_does_not_record(
    recorder_mock: Recorder, hass: HomeAssistant, tmp_path: Path, hass_ws_client: WebSocketGenerator
) -> None:
    """With the folder locked by another process nothing is recorded and the status says so."""
    hass.config.config_dir = str(tmp_path)
    other = ActivityRepository(tmp_path / "activity_record")
    assert other.acquire_lock() is True
    assert await async_setup_component(hass, "logbook", {})
    assert await async_setup_component(hass, DOMAIN, {})
    await hass.async_block_till_done(wait_background_tasks=True)
    recorder: ActivityRecorder = hass.data[DOMAIN]
    hass.states.async_set("light.a", "off")
    hass.states.async_set("light.a", "on")
    await hass.async_block_till_done(wait_background_tasks=True)
    await _flush(hass)
    assert _files(hass) == []
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "activity_record/status"})
    status = (await client.receive_json())["result"]
    assert status["lock_held"] is True
    assert status["recording"] is False
    await recorder.async_stop()
    other.release_lock()


@pytest.mark.usefixtures("recorder")
async def test_remote_and_push(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """Bad remotes are refused, a good one is kept, push needs a remote."""
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "activity_record/push"})
    assert (await client.receive_json())["error"]["code"] == "git_error"

    await client.send_json_auto_id(
        {"type": "activity_record/set_remote", "url": "https://u:p@example.com/r.git"}
    )
    refusal = await client.receive_json()
    assert refusal["error"]["code"] == "git_error"
    assert "p@" not in refusal["error"]["message"]

    await client.send_json_auto_id(
        {"type": "activity_record/set_remote", "url": "https://example.com/r.git"}
    )
    assert (await client.receive_json())["success"]
    await client.send_json_auto_id({"type": "activity_record/status"})
    assert (await client.receive_json())["result"]["remote"] == (
        "https://example.com/r.git"
    )


@pytest.mark.usefixtures("recorder")
@pytest.mark.parametrize(
    "command",
    [
        {"type": "activity_record/status"},
        {"type": "activity_record/days"},
        {"type": "activity_record/read", "day": DAY},
        {"type": "activity_record/search"},
        {"type": "activity_record/set_remote", "url": None},
        {"type": "activity_record/push"},
    ],
)
async def test_commands_require_admin(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    hass_admin_user: MockUser,
    command: dict,
) -> None:
    """Every command is for administrators only."""
    hass_admin_user.groups = []
    client = await hass_ws_client(hass)
    await client.send_json_auto_id(command)
    assert (await client.receive_json())["error"]["code"] == "unauthorized"
