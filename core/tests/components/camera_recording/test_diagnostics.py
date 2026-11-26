"""Tests for the diagnostics download."""

import json

import pytest
from pytest_homeassistant.common import MockConfigEntry
from pytest_homeassistant.typing import ClientSessionGenerator

from homeassistant.components.camera_recording.diagnostics import (
    async_get_config_entry_diagnostics,
)
from homeassistant.core import HomeAssistant

from .conftest import CAMERA
from .test_init import setup_entry

RTSPS = "rtsps://bblp:12345678@192.168.1.50:322/streaming/live/1"


@pytest.mark.usefixtures("no_ffmpeg", "remote_store")
async def test_diagnostics_have_no_credentials(
    hass: HomeAssistant,
    remote_entry: MockConfigEntry,
    hass_client: ClientSessionGenerator,
) -> None:
    """Every camera is described, and no password or stream login is in the output."""
    await setup_entry(hass, remote_entry)
    recorder = remote_entry.runtime_data.recorders[CAMERA]
    recorder.last_error = f"Could not open {RTSPS}"
    recorder.source_text = "rtsps://192.168.1.50:322"
    recorder.stderr_tail = [f"{RTSPS}: Connection refused"]
    recorder.last_exit_code = 1

    result = await async_get_config_entry_diagnostics(hass, remote_entry)
    camera = result["cameras"][CAMERA]
    assert camera["recorder"]["source"] == "rtsps://192.168.1.50:322"
    assert camera["recorder"]["last_exit_code"] == 1
    assert camera["chosen_mode"] == "all_day"
    assert camera["camera_state"] == "idle"
    text = json.dumps(result, default=str)
    assert "12345678" not in text
    assert "bblp" not in text
    assert "secret" not in text
    assert "cams" not in text
    assert "server" not in text
