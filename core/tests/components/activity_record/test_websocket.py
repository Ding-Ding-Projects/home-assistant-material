"""Tests for the live recording and the WebSocket commands."""

from datetime import timedelta
import json
from pathlib import Path
import subprocess
from unittest.mock import patch

from freezegun import freeze_time
import pytest
from pytest_homeassistant.common import MockUser, async_fire_time_changed
from pytest_homeassistant.components.recorder.common import (
    async_wait_recording_done,
)
from pytest_homeassistant.typing import WebSocketGenerator

from homeassistant.components.activity_record import DOMAIN
from homeassistant.components.activity_record.manager import ActivityRecorder
from homeassistant.components.logbook import async_log_entry
from homeassistant.components.recorder import Recorder
from homeassistant.core import Context, HomeAssistant
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


def _day_file(hass: HomeAssistant) -> Path:
    return Path(hass.config.path("activity_record", "2026", "11", f"{DAY}.jsonl"))


def _entries(hass: HomeAssistant) -> list[dict]:
    path = _day_file(hass)
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text("utf-8").splitlines()]


@freeze_time(NOW)
@pytest.mark.usefixtures("recorder")
async def test_state_change_is_written_as_the_page_shows_it(
    hass: HomeAssistant,
) -> None:
    """A change the Activity page shows is appended to today's file."""
    hass.states.async_set("light.kitchen", "off", {"friendly_name": "Kitchen"})
    hass.states.async_set("light.kitchen", "on", {"friendly_name": "Kitchen"})
    await hass.async_block_till_done(wait_background_tasks=True)
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
    entry = _entries(hass)[0]
    assert entry["kind"] == "logbook"
    assert entry["context_user_id"] == "0123456789abcdef0123456789abcdef"
    assert entry["context_parent_id"] == "PARENT"
    assert "abcdef123456" not in entry["message"]


@freeze_time(NOW)
async def test_commits_are_batched(recorder: ActivityRecorder, hass: HomeAssistant) -> None:
    """Many entries in one interval make a single commit."""
    await hass.async_add_executor_job(recorder.repository.commit)
    for n in range(20):
        hass.states.async_set("light.a", "on" if n % 2 else "off")
    await hass.async_block_till_done(wait_background_tasks=True)
    before = _commit_count(hass)
    async_fire_time_changed(hass, dt_util.utcnow() + timedelta(seconds=61))
    await hass.async_block_till_done(wait_background_tasks=True)
    assert _commit_count(hass) == before + 1
    assert recorder.repository.uncommitted == 0


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
async def test_full_queue_drops_and_records_the_drop(
    recorder: ActivityRecorder, hass: HomeAssistant
) -> None:
    """Entries past the bound are counted and the count is written down."""
    recorder._draining = True
    with patch("homeassistant.components.activity_record.manager.MAX_QUEUE", 2):
        for n in range(5):
            recorder._enqueue({"when": f"{DAY}T10:00:0{n}+00:00", "name": str(n)})
    assert recorder.dropped_total == 3
    recorder._drain_done()
    await hass.async_block_till_done(wait_background_tasks=True)
    entries = _entries(hass)
    dropped = [e for e in entries if e.get("kind") == "dropped"]
    assert len(entries) == 3
    assert dropped[0]["count"] == 3


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


@pytest.mark.usefixtures("recorder")
async def test_commands(hass: HomeAssistant, hass_ws_client: WebSocketGenerator) -> None:
    """Status, days, read and search answer from the record."""
    for n in range(4):
        hass.states.async_set("light.a", "on" if n % 2 else "off")
    hass.states.async_set("light.b", "off")
    hass.states.async_set("light.b", "on")
    await hass.async_block_till_done(wait_background_tasks=True)
    client = await hass_ws_client(hass)
    today = dt_util.utcnow().date().isoformat()

    await client.send_json_auto_id({"type": "activity_record/status"})
    status = (await client.receive_json())["result"]
    assert status["entries_today"] == 4
    assert status["files"] == 1
    assert status["remote"] is None
    assert status["recording"] is True
    assert status["queue_depth"] == 0
    assert status["path"].endswith("activity_record")

    await client.send_json_auto_id({"type": "activity_record/days"})
    days = (await client.receive_json())["result"]
    assert days["days"] == [{"day": today, "entries": 4, "bytes": days["days"][0]["bytes"]}]

    await client.send_json_auto_id(
        {"type": "activity_record/read", "day": today, "limit": 2}
    )
    page = (await client.receive_json())["result"]
    assert len(page["entries"]) == 2
    assert page["has_more"] is True
    assert page["entries"][0]["when"] >= page["entries"][1]["when"]

    await client.send_json_auto_id({"type": "activity_record/read", "day": "nope"})
    assert (await client.receive_json())["error"]["code"] == "invalid_day"

    await client.send_json_auto_id(
        {"type": "activity_record/search", "entity_id": "light.b", "start": today}
    )
    found = (await client.receive_json())["result"]
    assert [e["entity_id"] for e in found["entries"]] == ["light.b"]
    assert found["truncated"] is False


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
