"""Tests for the diagnostics download."""

from http import HTTPStatus
import json

import pytest
from pytest_homeassistant.common import MockConfigEntry
from pytest_homeassistant.typing import ClientSessionGenerator

from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component

from .conftest import CAMERA
from .test_init import setup_entry

RTSPS = (
    "rtsps://bblp:12345678@203.0.113.50:322/streaming/live/1"
    "?api_key=query_credential#fragment_credential"
)


@pytest.mark.usefixtures("no_ffmpeg", "remote_store")
async def test_diagnostics_have_no_credentials(
    hass: HomeAssistant,
    remote_entry: MockConfigEntry,
    hass_client: ClientSessionGenerator,
) -> None:
    """Every camera is described, and no password or stream login is in the output."""
    assert await async_setup_component(hass, "diagnostics", {})
    await setup_entry(hass, remote_entry)
    recorder = remote_entry.runtime_data.recorders[CAMERA]
    recorder.last_error = f"Could not open {RTSPS}"
    recorder.source_text = "rtsps://203.0.113.50:322"
    recorder.stderr_tail = [f"{RTSPS}: Connection refused"]
    recorder.last_exit_code = 1

    client = await hass_client()
    response = await client.get(
        f"/api/diagnostics/config_entry/{remote_entry.entry_id}"
    )
    assert response.status == HTTPStatus.OK
    assert response.headers["Content-Disposition"].startswith("attachment;")
    result = (await response.json())["data"]
    camera = result["cameras"][CAMERA]
    assert camera["recorder"]["source"] == "rtsps://203.0.113.50:322"
    assert camera["recorder"]["last_exit_code"] == 1
    assert camera["chosen_mode"] == "all_day"
    assert camera["camera_state"] == "idle"
    text = json.dumps(result)
    assert "12345678" not in text
    assert "bblp" not in text
    assert "secret" not in text
    assert "cams" not in text
    assert "server" not in text
    assert "/srv/cameras" not in text
    assert "query_credential" not in text
    assert "fragment_credential" not in text
