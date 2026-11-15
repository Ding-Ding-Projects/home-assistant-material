"""Tests for the guided setup."""

from pathlib import Path
from unittest.mock import patch

import pytest
from pytest_homeassistant.common import MockConfigEntry

from homeassistant import config_entries
from homeassistant.components.camera_recording.const import (
    CONF_BUFFER_HOURS,
    CONF_CAMERAS,
    CONF_DESTINATION,
    CONF_KEEP_DAYS,
    CONF_MAX_GB,
    CONF_PATH,
    CONF_SEGMENT_MINUTES,
    DOMAIN,
)
from homeassistant.components.camera_recording.destination import TestResult, TestStep
from homeassistant.const import CONF_HOST, CONF_PASSWORD, CONF_PORT, CONF_USERNAME
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType

from .conftest import CAMERA

KEEP = {
    CONF_KEEP_DAYS: 7,
    CONF_MAX_GB: 500,
    CONF_BUFFER_HOURS: 2,
    CONF_SEGMENT_MINUTES: 10,
}
SSH_INPUT = {
    CONF_HOST: "192.168.1.40",
    CONF_PORT: 22,
    CONF_USERNAME: "cams",
    CONF_PASSWORD: "secret",
    CONF_PATH: "/srv/cameras",
}


@pytest.fixture(autouse=True)
def no_setup() -> None:
    """Do not start recording when an entry is created."""
    with patch(
        "homeassistant.components.camera_recording.async_setup_entry", return_value=None
    ):
        yield


async def test_local_full_flow(hass: HomeAssistant, tmp_path: Path) -> None:
    """A folder passes the real test, then cameras and limits create the entry."""
    hass.states.async_set(CAMERA, "idle")
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    assert result["type"] is FlowResultType.MENU
    assert result["menu_options"] == ["local", "external_disk", "smb", "sftp", "scp"]

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"next_step_id": "local"}
    )
    assert result["step_id"] == "local"
    folder = str(tmp_path / "recordings")
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_PATH: folder}
    )
    assert result["step_id"] == "test"
    assert (
        "✅ Write, read back and delete a test file"
        in result["description_placeholders"]["results"]
    )
    assert not any(Path(folder).iterdir())

    result = await hass.config_entries.flow.async_configure(result["flow_id"], {})
    assert result["step_id"] == "cameras"
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_CAMERAS: [CAMERA]}
    )
    assert result["step_id"] == "keep"
    result = await hass.config_entries.flow.async_configure(result["flow_id"], KEEP)

    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["title"] == folder
    assert result["data"] == {CONF_DESTINATION: "local", CONF_PATH: folder}
    assert result["options"] == {CONF_CAMERAS: [CAMERA], **KEEP}


async def test_local_relative_path(hass: HomeAssistant) -> None:
    """A relative folder is refused before any test."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"next_step_id": "local"}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_PATH: "recordings"}
    )
    assert result["errors"] == {CONF_PATH: "path_not_absolute"}


async def test_failed_test_explains(hass: HomeAssistant) -> None:
    """A failed step is shown with its reason, and setup stays on the form."""
    failed = TestResult(
        [
            TestStep("reach", True, "192.168.1.40:22"),
            TestStep("sign_in", True),
            TestStep("open_folder", False, "Permission denied"),
        ]
    )
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"next_step_id": "sftp"}
    )
    with patch(
        "homeassistant.components.camera_recording.destination.Destination.async_test",
        return_value=failed,
    ):
        result = await hass.config_entries.flow.async_configure(
            result["flow_id"], SSH_INPUT
        )
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "sftp"
    assert result["errors"] == {"base": "test_failed"}
    assert (
        "❌ Open the folder: Permission denied"
        in result["description_placeholders"]["results"]
    )
    assert (
        result["description_placeholders"]["failed"]
        == "Open the folder: Permission denied"
    )


@pytest.mark.parametrize(
    ("changes", "errors"),
    [
        pytest.param(
            {CONF_PATH: "srv/cameras"}, {CONF_PATH: "path_not_absolute"}, id="relative"
        ),
        pytest.param({CONF_PASSWORD: ""}, {"base": "password_or_key"}, id="no_secret"),
    ],
)
async def test_ssh_checks(
    hass: HomeAssistant, changes: dict[str, str], errors: dict[str, str]
) -> None:
    """SSH needs a full path and a password or a key."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"next_step_id": "scp"}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {**SSH_INPUT, **changes}
    )
    assert result["errors"] == errors


async def test_no_cameras(hass: HomeAssistant, tmp_path: Path) -> None:
    """At least one camera must be chosen."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"next_step_id": "local"}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_PATH: str(tmp_path)}
    )
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {})
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_CAMERAS: []}
    )
    assert result["errors"] == {CONF_CAMERAS: "no_cameras"}


async def test_already_configured(hass: HomeAssistant, tmp_path: Path) -> None:
    """The same folder cannot be set up twice."""
    MockConfigEntry(domain=DOMAIN, unique_id=f"local:{tmp_path}", data={}).add_to_hass(
        hass
    )
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"next_step_id": "local"}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_PATH: str(tmp_path)}
    )
    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "already_configured"


async def test_options(hass: HomeAssistant, local_entry: MockConfigEntry) -> None:
    """Cameras and limits change later on one form."""
    local_entry.add_to_hass(hass)
    result = await hass.config_entries.options.async_init(local_entry.entry_id)
    assert result["step_id"] == "init"
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {CONF_CAMERAS: [CAMERA, "camera.garden"], **KEEP}
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert local_entry.options == {CONF_CAMERAS: [CAMERA, "camera.garden"], **KEEP}
