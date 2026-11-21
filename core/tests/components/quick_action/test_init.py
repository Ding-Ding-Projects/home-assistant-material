"""Tests for quick actions.

These protect what the quick action dialog promises: a run starts at once and
keeps going on the server, it can be listed and stopped before a later step
happens, a failing step is reported, only administrators can use any of it,
the number of kept runs is limited and nothing survives a stop of Home
Assistant.
"""

from collections.abc import AsyncGenerator
from datetime import timedelta
from typing import Any

from freezegun.api import FrozenDateTimeFactory
import pytest
from pytest_homeassistant.common import async_fire_time_changed, async_mock_service
from pytest_homeassistant.typing import WebSocketGenerator

from homeassistant.auth.models import User
from homeassistant.components.quick_action import DOMAIN
from homeassistant.components.quick_action.runner import (
    DATA_RUNNER,
    KEEP_ENDED,
    MAX_RUNS,
)
from homeassistant.const import EVENT_HOMEASSISTANT_STOP
from homeassistant.core import Context, HomeAssistant, ServiceCall
from homeassistant.exceptions import HomeAssistantError
from homeassistant.setup import async_setup_component

RECORD = {"action": "test.record", "data": {"step": "after"}}
WAIT = timedelta(minutes=5)
WAIT_THEN_RECORD = [{"delay": {"minutes": 5}}, RECORD]


@pytest.fixture(autouse=True)
async def stop_runs_after_test(hass: HomeAssistant) -> AsyncGenerator[None]:
    """Stop runs and their timers so nothing lingers after a test."""
    yield
    if (runner := hass.data.get(DATA_RUNNER)) is not None:
        await runner._async_shutdown(None)  # noqa: SLF001


async def _setup(hass: HomeAssistant) -> list[ServiceCall]:
    """Set up quick actions with a service that records each call."""
    calls = async_mock_service(hass, "test", "record")
    assert await async_setup_component(hass, DOMAIN, {})
    await hass.async_block_till_done()
    return calls


async def _list(client: Any) -> list[dict[str, Any]]:
    await client.send_json_auto_id({"type": "quick_action/list"})
    result = await client.receive_json()
    assert result["success"]
    return result["result"]["runs"]


async def _run(client: Any, sequence: list[dict[str, Any]], **extra: Any) -> str:
    await client.send_json_auto_id(
        {"type": "quick_action/run", "sequence": sequence, **extra}
    )
    result = await client.receive_json()
    assert result["success"], result
    return result["result"]["id"]


async def test_run_returns_at_once_and_runs(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    hass_admin_user: User,
    freezer: FrozenDateTimeFactory,
) -> None:
    """The run answers before the wait ends, and the later step still happens."""
    calls = await _setup(hass)
    client = await hass_ws_client(hass)

    run_id = await _run(
        client, WAIT_THEN_RECORD, entity_id="light.kitchen", label="Kitchen"
    )
    await hass.async_block_till_done()
    assert calls == []

    runs = await _list(client)
    assert len(runs) == 1
    run = runs[0]
    assert run["id"] == run_id
    assert run["state"] == "running"
    assert run["label"] == "Kitchen"
    assert run["entity_id"] == "light.kitchen"
    assert run["user_id"] == hass_admin_user.id
    assert run["total_steps"] == 2
    assert run["started"]
    assert run["ended"] is None
    assert run["error"] is None

    freezer.tick(WAIT + timedelta(seconds=1))
    async_fire_time_changed(hass)
    await hass.async_block_till_done(wait_background_tasks=True)

    assert len(calls) == 1
    assert calls[0].data == {"step": "after"}
    run = (await _list(client))[0]
    assert run["state"] == "finished"
    assert run["ended"]
    assert run["current_step"] is None


async def test_stop_during_wait_prevents_later_step(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    freezer: FrozenDateTimeFactory,
) -> None:
    """Stopping during the wait means the step after it never happens."""
    calls = await _setup(hass)
    client = await hass_ws_client(hass)
    run_id = await _run(client, WAIT_THEN_RECORD)
    await hass.async_block_till_done()

    await client.send_json_auto_id({"type": "quick_action/stop", "run_id": run_id})
    assert (await client.receive_json())["success"]
    assert (await _list(client))[0]["state"] == "stopped"

    # Stopping again is harmless.
    await client.send_json_auto_id({"type": "quick_action/stop", "run_id": run_id})
    assert (await client.receive_json())["success"]

    freezer.tick(WAIT + timedelta(seconds=1))
    async_fire_time_changed(hass)
    await hass.async_block_till_done(wait_background_tasks=True)
    assert calls == []
    assert (await _list(client))[0]["state"] == "stopped"


async def test_ended_runs_are_forgotten(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    freezer: FrozenDateTimeFactory,
) -> None:
    """An ended run leaves the list by itself after the keep time."""
    await _setup(hass)
    client = await hass_ws_client(hass)
    await _run(client, [RECORD])
    await hass.async_block_till_done(wait_background_tasks=True)
    assert (await _list(client))[0]["state"] == "finished"

    freezer.tick(KEEP_ENDED + timedelta(seconds=1))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    assert await _list(client) == []


async def test_failing_step_is_recorded(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """A step that fails ends the run as failed with the error text."""
    await _setup(hass)

    async def fail(call: ServiceCall) -> None:
        raise HomeAssistantError("The door is jammed")

    hass.services.async_register("test", "fail", fail)
    client = await hass_ws_client(hass)
    await _run(client, [{"action": "test.fail"}])
    await hass.async_block_till_done(wait_background_tasks=True)

    run = (await _list(client))[0]
    assert run["state"] == "failed"
    assert run["error"] == "The door is jammed"


async def test_stop_unknown_run(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """Stopping a run that is not known is reported."""
    await _setup(hass)
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "quick_action/stop", "run_id": "nope"})
    result = await client.receive_json()
    assert result["error"]["code"] == "not_found"


@pytest.mark.parametrize(
    "message",
    [
        {"type": "quick_action/run", "sequence": [RECORD]},
        {"type": "quick_action/list"},
        {"type": "quick_action/stop", "run_id": "abc"},
        {"type": "quick_action/subscribe"},
    ],
)
async def test_non_admin_refused(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    hass_admin_user: User,
    message: dict[str, Any],
) -> None:
    """Only an administrator can start, list, stop or follow quick actions."""
    calls = await _setup(hass)
    hass_admin_user.groups = []
    client = await hass_ws_client(hass)
    await client.send_json_auto_id(message)
    result = await client.receive_json()
    assert result["error"]["code"] == "unauthorized"
    await hass.async_block_till_done(wait_background_tasks=True)
    assert calls == []
    assert hass.data[DATA_RUNNER].async_runs() == []


async def test_run_limit(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """Runs that are still going fill the limit; an ended one makes room."""
    await _setup(hass)
    client = await hass_ws_client(hass)
    ids = [await _run(client, WAIT_THEN_RECORD) for _ in range(MAX_RUNS)]
    await hass.async_block_till_done()

    await client.send_json_auto_id(
        {"type": "quick_action/run", "sequence": WAIT_THEN_RECORD}
    )
    result = await client.receive_json()
    assert result["error"]["code"] == "too_many_runs"
    assert len(await _list(client)) == MAX_RUNS

    await client.send_json_auto_id({"type": "quick_action/stop", "run_id": ids[0]})
    assert (await client.receive_json())["success"]
    new_id = await _run(client, WAIT_THEN_RECORD)

    runs = await _list(client)
    assert len(runs) == MAX_RUNS
    listed = {run["id"] for run in runs}
    assert ids[0] not in listed
    assert new_id in listed


async def test_subscribe_follows_changes(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator
) -> None:
    """A subscriber gets the list now and again when a run starts."""
    await _setup(hass)
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "quick_action/subscribe"})
    assert (await client.receive_json())["success"]
    first = await client.receive_json()
    assert first["event"] == {"runs": []}

    hass.data[DATA_RUNNER].async_start(
        [{"delay": {"minutes": 5}}], Context()
    )
    event = await client.receive_json()
    assert event["event"]["runs"][0]["state"] == "running"



async def test_stopping_home_assistant_stops_runs(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    freezer: FrozenDateTimeFactory,
) -> None:
    """A run does not outlive Home Assistant, and no new run starts then."""
    calls = await _setup(hass)
    client = await hass_ws_client(hass)
    await _run(client, WAIT_THEN_RECORD)
    await hass.async_block_till_done()

    hass.bus.async_fire(EVENT_HOMEASSISTANT_STOP)
    await hass.async_block_till_done()

    assert (await _list(client))[0]["state"] == "stopped"
    await client.send_json_auto_id(
        {"type": "quick_action/run", "sequence": [RECORD]}
    )
    result = await client.receive_json()
    assert result["error"]["code"] == "shutting_down"

    freezer.tick(WAIT + timedelta(seconds=1))
    async_fire_time_changed(hass)
    await hass.async_block_till_done(wait_background_tasks=True)
    assert calls == []
