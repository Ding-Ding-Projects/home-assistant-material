"""Tests for setup, entities, the WebSocket commands and playback."""

from datetime import timedelta
import os
from pathlib import Path

import pytest
from pytest_homeassistant.common import MockConfigEntry
from pytest_homeassistant.typing import ClientSessionGenerator, WebSocketGenerator

from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from homeassistant.util import dt as dt_util

from .conftest import CAMERA, write_segment
from .test_manager import name_at


async def setup_entry(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    """Set up the entry with a finished segment on disk."""
    assert await async_setup_component(hass, "camera", {})
    hass.states.async_set(CAMERA, "idle", {"friendly_name": "Front door"})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    assert entry.state is ConfigEntryState.LOADED


@pytest.mark.usefixtures("no_ffmpeg")
async def test_setup_entities_and_unload(
    hass: HomeAssistant, local_entry: MockConfigEntry
) -> None:
    """Entities appear per camera, the switch pauses, and the entry unloads."""
    await setup_entry(hass, local_entry)
    assert (
        hass.states.get("binary_sensor.camera_recording_front_door_recording")
        is not None
    )
    assert hass.states.get("switch.camera_recording_record_front_door").state == "on"
    await hass.services.async_call(
        "switch",
        "turn_off",
        {"entity_id": "switch.camera_recording_record_front_door"},
        blocking=True,
    )
    assert hass.states.get("switch.camera_recording_record_front_door").state == "off"
    assert CAMERA in local_entry.runtime_data.paused

    assert await hass.config_entries.async_unload(local_entry.entry_id)
    assert local_entry.state is ConfigEntryState.NOT_LOADED


@pytest.mark.usefixtures("no_ffmpeg")
async def test_segments_status_and_playback(
    hass: HomeAssistant,
    local_entry: MockConfigEntry,
    hass_ws_client: WebSocketGenerator,
    hass_client: ClientSessionGenerator,
    tmp_path: Path,
) -> None:
    """The timeline gets segments, the status page gets the state, and a segment plays."""
    await setup_entry(hass, local_entry)
    manager = local_entry.runtime_data
    segment = write_segment(manager.folder(CAMERA), name_at(20), size=64)
    os.utime(
        segment,
        (
            segment.stat().st_atime,
            (dt_util.utcnow() - timedelta(minutes=15)).timestamp(),
        ),
    )
    await manager.async_copy()

    client = await hass_ws_client(hass)
    now = dt_util.utcnow()
    await client.send_json_auto_id(
        {
            "type": "camera_recording/segments",
            "entity_id": CAMERA,
            "start_time": (now - timedelta(hours=1)).isoformat(),
            "end_time": now.isoformat(),
        }
    )
    response = await client.receive_json()
    assert response["success"]
    result = response["result"]
    assert result["recorded"] is True
    assert [seg["name"] for seg in result["segments"]] == [segment.name]

    await client.send_json_auto_id(
        {
            "type": "camera_recording/segments",
            "entity_id": "camera.garden",
            "start_time": now.isoformat(),
            "end_time": (now + timedelta(hours=1)).isoformat(),
        }
    )
    response = await client.receive_json()
    assert response["result"] == {
        "recorded": False,
        "recording": False,
        "states": [],
        "segments": [],
    }

    await client.send_json_auto_id(
        {
            "type": "camera_recording/segments",
            "entity_id": CAMERA,
            "start_time": now.isoformat(),
            "end_time": (now + timedelta(days=9)).isoformat(),
        }
    )
    response = await client.receive_json()
    assert response["error"]["code"] == "invalid_time"

    await client.send_json_auto_id({"type": "camera_recording/status"})
    response = await client.receive_json()
    assert response["result"][0]["cameras"][0]["segments"] == 1

    await client.send_json_auto_id(
        {
            "type": "camera_recording/pause",
            "entry_id": local_entry.entry_id,
            "paused": True,
        }
    )
    response = await client.receive_json()
    assert response["success"]
    assert CAMERA in manager.paused

    http = await hass_client()
    url = (
        f"/api/camera_recording/segment/{local_entry.entry_id}/{CAMERA}/{segment.name}"
    )
    resp = await http.get(url)
    assert resp.status == 200
    assert resp.headers["Content-Type"] == "video/mp4"
    assert await resp.read() == b"x" * 64
    assert (
        await http.get(url.replace(segment.name, "20200101T000000Z.mp4"))
    ).status == 404
    assert (
        await http.get(url.replace(segment.name, "..%2F..%2Fsecrets.yaml"))
    ).status in (400, 404)
    assert (await http.get(url.replace(CAMERA, "camera.garden"))).status == 404
