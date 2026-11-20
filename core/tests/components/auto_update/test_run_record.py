"""Tests for the shared display record of an "Update everything" run.

These protect what a second browser relies on to show "Updating 2 of 2": only
administrators can read or write the record, malformed runs are refused, the
record never installs anything and it disappears by itself.
"""

from datetime import datetime, timedelta
from typing import Any

from freezegun.api import FrozenDateTimeFactory
import pytest
from pytest_homeassistant.common import async_fire_time_changed
from pytest_homeassistant.typing import WebSocketGenerator

from homeassistant.auth.models import User
from homeassistant.components.auto_update import DOMAIN
from homeassistant.components.auto_update.run_record import (
    DATA_RUN_RECORD,
    MAX_RUN_STEPS,
    RUN_EXPIRE_AFTER,
)
from homeassistant.components.update import DOMAIN as UPDATE_DOMAIN
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.setup import async_setup_component
from homeassistant.util import dt as dt_util

UPDATE_A = "update.app_a"
UPDATE_B = "update.app_b"


async def _setup(hass: HomeAssistant) -> list[ServiceCall]:
    """Set up the integration with two offered updates and record installs."""
    assert await async_setup_component(hass, UPDATE_DOMAIN, {})
    calls: list[ServiceCall] = []

    async def install(call: ServiceCall) -> None:
        calls.append(call)

    hass.services.async_register(UPDATE_DOMAIN, "install", install)
    for entity_id in (UPDATE_A, UPDATE_B):
        hass.states.async_set(
            entity_id,
            "on",
            {"installed_version": "1.0", "latest_version": "2.0"},
        )
    assert await async_setup_component(hass, DOMAIN, {})
    await hass.async_block_till_done()
    return calls


async def test_set_and_get(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """A stored run is returned as sent, and nothing is installed."""
    calls = await _setup(hass)
    client = await hass_ws_client(hass)

    await client.send_json_auto_id({"type": "auto_update/run/get"})
    result = await client.receive_json()
    assert result["success"]
    assert result["result"] is None

    await client.send_json_auto_id(
        {
            "type": "auto_update/run/set",
            "entity_ids": [UPDATE_A, UPDATE_B],
            "position": 2,
            "state": "running",
            "current": UPDATE_B,
        }
    )
    assert (await client.receive_json())["success"]

    await client.send_json_auto_id({"type": "auto_update/run/get"})
    run = (await client.receive_json())["result"]
    assert run["entity_ids"] == [UPDATE_A, UPDATE_B]
    assert run["position"] == 2
    assert run["total"] == 2
    assert run["state"] == "running"
    assert run["current"] == UPDATE_B
    assert run["started"]
    assert run["updated"]

    await hass.async_block_till_done()
    assert calls == []


async def test_started_kept_for_the_same_run(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    """The start time stays while the same run moves on."""
    await _setup(hass)
    record = hass.data[DATA_RUN_RECORD]
    record.async_set([UPDATE_A, UPDATE_B], 1, "running", UPDATE_A)
    started = record.async_get()["started"]
    freezer.tick(timedelta(minutes=5))
    record.async_set([UPDATE_A, UPDATE_B], 2, "running", UPDATE_B)
    run = record.async_get()
    assert run["started"] == started
    assert run["updated"] != started


async def test_reported_start_survives_an_emptied_record(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    freezer: FrozenDateTimeFactory,
) -> None:
    """The driving browser's start time is kept when the record was emptied.

    A Core restart in the middle of a run empties the in-memory record; the
    next report must not move the start to the time of that report.
    """
    await _setup(hass)
    client = await hass_ws_client(hass)
    # Only forwards: a sign-in made before a clock moved back is refused.
    run_start = dt_util.utcnow().replace(microsecond=0)
    freezer.move_to(run_start + timedelta(minutes=4))
    await client.send_json_auto_id(
        {
            "type": "auto_update/run/set",
            "entity_ids": [UPDATE_A, UPDATE_B],
            "position": 2,
            "state": "done",
            "started": run_start.isoformat(),
        }
    )
    assert (await client.receive_json())["success"]
    run = hass.data[DATA_RUN_RECORD].async_get()
    assert run["started"] == run_start.isoformat()
    assert run["updated"] == (run_start + timedelta(minutes=4)).isoformat()


@pytest.mark.parametrize(
    "reported",
    [
        pytest.param("2026-11-20T07:30:00+00:00", id="future"),
        pytest.param("2026-11-18T07:18:00+00:00", id="older_than_a_day"),
        pytest.param("2026-11-20T07:14:00", id="no_timezone"),
    ],
)
async def test_implausible_reported_start_ignored(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory, reported: str
) -> None:
    """An implausible reported start falls back to the server clock."""
    freezer.move_to("2026-11-20T07:18:00+00:00")
    await _setup(hass)
    record = hass.data[DATA_RUN_RECORD]
    record.async_set(
        [UPDATE_A],
        1,
        "running",
        UPDATE_A,
        datetime.fromisoformat(reported),
    )
    assert record.async_get()["started"] == "2026-11-20T07:18:00+00:00"


async def test_reported_start_slightly_ahead_is_clamped(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    """A browser clock a few seconds ahead never yields a start in the future."""
    freezer.move_to("2026-11-20T07:18:00+00:00")
    await _setup(hass)
    record = hass.data[DATA_RUN_RECORD]
    record.async_set(
        [UPDATE_A],
        1,
        "running",
        UPDATE_A,
        datetime.fromisoformat("2026-11-20T07:18:20+00:00"),
    )
    assert record.async_get()["started"] == "2026-11-20T07:18:00+00:00"


async def test_clear(hass: HomeAssistant, hass_ws_client: WebSocketGenerator) -> None:
    """Clearing removes the record."""
    await _setup(hass)
    hass.data[DATA_RUN_RECORD].async_set([UPDATE_A], 1, "done")
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "auto_update/run/clear"})
    assert (await client.receive_json())["success"]
    assert hass.data[DATA_RUN_RECORD].async_get() is None


@pytest.mark.parametrize(
    "message",
    [
        pytest.param(
            {"entity_ids": [], "position": 1, "state": "running"}, id="empty"
        ),
        pytest.param(
            {"entity_ids": ["light.kitchen"], "position": 1, "state": "running"},
            id="not_update",
        ),
        pytest.param(
            {"entity_ids": ["update.missing"], "position": 1, "state": "running"},
            id="unknown_entity",
        ),
        pytest.param(
            {"entity_ids": [UPDATE_A, UPDATE_A], "position": 1, "state": "running"},
            id="duplicate",
        ),
        pytest.param(
            {"entity_ids": [UPDATE_A], "position": 2, "state": "running"},
            id="position_past_end",
        ),
        pytest.param(
            {"entity_ids": [UPDATE_A], "position": 0, "state": "running"},
            id="position_zero",
        ),
        pytest.param(
            {"entity_ids": [UPDATE_A], "position": 1, "state": "installing"},
            id="unknown_state",
        ),
        pytest.param(
            {
                "entity_ids": [UPDATE_A],
                "position": 1,
                "state": "running",
                "current": UPDATE_B,
            },
            id="current_outside_run",
        ),
        pytest.param(
            {
                "entity_ids": [f"update.item_{index}" for index in range(51)],
                "position": 1,
                "state": "running",
            },
            id="too_many",
        ),
        pytest.param(
            {
                "entity_ids": [UPDATE_A],
                "position": 1,
                "state": "running",
                "started": "not a time",
            },
            id="started_not_a_timestamp",
        ),
    ],
)
async def test_set_refuses_bad_input(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    message: dict[str, Any],
) -> None:
    """Malformed runs are refused and nothing is stored."""
    await _setup(hass)
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "auto_update/run/set", **message})
    result = await client.receive_json()
    assert not result["success"]
    assert result["error"]["code"] == "invalid_format"
    assert hass.data[DATA_RUN_RECORD].async_get() is None


async def test_accepts_the_largest_run(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """A run of exactly the maximum size is accepted."""
    await _setup(hass)
    entity_ids = [f"update.item_{index}" for index in range(MAX_RUN_STEPS)]
    for entity_id in entity_ids:
        hass.states.async_set(entity_id, "on", {})
    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "auto_update/run/set",
            "entity_ids": entity_ids,
            "position": MAX_RUN_STEPS,
            "state": "done",
        }
    )
    assert (await client.receive_json())["success"]
    assert hass.data[DATA_RUN_RECORD].async_get()["total"] == MAX_RUN_STEPS


@pytest.mark.parametrize(
    "message",
    [
        {"type": "auto_update/run/get"},
        {"type": "auto_update/run/clear"},
        {"type": "auto_update/run/subscribe"},
        {
            "type": "auto_update/run/set",
            "entity_ids": [UPDATE_A],
            "position": 1,
            "state": "running",
        },
    ],
)
async def test_non_admin_refused(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    hass_admin_user: User,
    message: dict[str, Any],
) -> None:
    """Only an administrator can read or change the run."""
    await _setup(hass)
    hass_admin_user.groups = []
    client = await hass_ws_client(hass)
    await client.send_json_auto_id(message)
    result = await client.receive_json()
    assert result["error"]["code"] == "unauthorized"
    assert hass.data[DATA_RUN_RECORD].async_get() is None


async def test_subscribe_follows_changes_and_expiry(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    freezer: FrozenDateTimeFactory,
) -> None:
    """A second browser sees each change and the record expiring by itself."""
    await _setup(hass)
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "auto_update/run/subscribe"})
    assert (await client.receive_json())["success"]
    first = await client.receive_json()
    assert first["event"] == {"run": None}

    hass.data[DATA_RUN_RECORD].async_set([UPDATE_A, UPDATE_B], 1, "running", UPDATE_A)
    event = await client.receive_json()
    assert event["event"]["run"]["position"] == 1
    assert event["event"]["run"]["current"] == UPDATE_A

    freezer.tick(RUN_EXPIRE_AFTER + timedelta(seconds=1))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    event = await client.receive_json()
    assert event["event"] == {"run": None}
    assert hass.data[DATA_RUN_RECORD].async_get() is None


async def test_expired_record_not_returned(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    """A record that has not changed for too long is gone even before the timer."""
    await _setup(hass)
    record = hass.data[DATA_RUN_RECORD]
    record.async_set([UPDATE_A], 1, "running", UPDATE_A)
    freezer.tick(RUN_EXPIRE_AFTER)
    assert record.async_get() is None
