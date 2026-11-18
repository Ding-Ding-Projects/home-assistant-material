"""Tests for the queue that sends camera recordings to cloud drives, with fake drives."""

from collections.abc import Callable, Sequence
import os
from pathlib import Path
import time
from types import SimpleNamespace
from typing import Any
from unittest.mock import patch

import pytest
from pytest_homeassistant.common import MockConfigEntry
from pytest_homeassistant.typing import WebSocketGenerator

from homeassistant.components.camera_recording.cloud import (
    DRIVE_GOOGLE,
    DRIVE_ONEDRIVE,
    REASON_DRIVE_ERROR,
    REASON_FILE_GONE,
    REASON_SIGN_IN,
    CloudDrive,
    DriveError,
    OpenStream,
    RemoteFile,
)
from homeassistant.components.camera_recording.cloud_websocket import (
    async_register_cloud_websocket,
)
from homeassistant.components.camera_recording.const import DOMAIN
from homeassistant.components.camera_recording.manager import Segment
from homeassistant.components.camera_recording.uploader import (
    DATA_UPLOADER,
    MAX_ATTEMPTS,
    SEND_EVERYTHING,
    STORAGE_KEY,
    CloudUploader,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback

from .test_init import setup_entry

CAMERA = "camera.front_door"
CLIP = "20261118T093600Z-event.mp4"
RECORDING = "20261118T090000Z.mp4"


class FakeDrive(CloudDrive):
    """A drive kept in memory. No network and no account."""

    def __init__(self, hass: HomeAssistant, domain: str) -> None:
        """Start with an empty drive that is set up and loaded."""
        super().__init__(hass)
        self.domain = domain
        self.files: dict[str, tuple[tuple[str, ...], str, bytes]] = {}
        self.is_set_up = True
        self.is_loaded = True
        self.fail_with: str | None = None
        self.uploads = 0

    @property
    def set_up(self) -> bool:
        """Whether the fake integration has an entry."""
        return self.is_set_up

    @property
    def loaded(self) -> bool:
        """Whether the fake integration is loaded."""
        return self.is_loaded

    def entry(self) -> ConfigEntry | None:
        """A stand-in entry when loaded."""
        if not self.is_loaded:
            return None
        return MockConfigEntry(domain=self.domain, title="Fake")

    async def upload(
        self, open_stream: OpenStream, size: int, folder: Sequence[str], name: str
    ) -> RemoteFile:
        """Keep the bytes, or fail as told."""
        self.uploads += 1
        if not self.is_loaded:
            raise DriveError("not_loaded")
        if self.fail_with:
            raise DriveError(self.fail_with)
        data = b"".join([chunk async for chunk in open_stream()])
        assert len(data) == size
        file_id = f"id{len(self.files)}"
        self.files[file_id] = (tuple(folder), name, data)
        return RemoteFile(file_id, name, size)

    async def delete(self, file_id: str) -> None:
        """Forget a file."""
        self.files.pop(file_id, None)

    def free_space(self) -> int | None:
        """A fixed amount."""
        return 10**9

    def _reason(self, err: Exception) -> str:
        raise err

    async def _root_id(self, entry: ConfigEntry) -> str:
        return "root"

    async def _child_folder(self, entry: ConfigEntry, parent: str, name: str) -> str:
        return f"{parent}/{name}"

    async def _upload(self, *args: Any) -> RemoteFile:
        raise NotImplementedError

    async def _list(self, entry: ConfigEntry, folder_id: str) -> list[RemoteFile]:
        return []

    async def _delete(self, entry: ConfigEntry, file_id: str) -> None:
        return None

    def _free_space(self, entry: ConfigEntry) -> int | None:
        return None


class FakeManager:
    """The part of a recording manager the uploader reads."""

    def __init__(self, root: Path) -> None:
        """An index with no files yet."""
        self.entry = SimpleNamespace(entry_id="entry1")
        self.root = root
        self.segments: dict[str, dict[str, Segment]] = {CAMERA: {}}
        self.listeners: list[Callable[[], None]] = []

    def folder(self, entity_id: str) -> Path:
        """The camera folder."""
        return self.root / entity_id.split(".", 1)[1]

    @callback
    def async_add_listener(self, listener: Callable[[], None]) -> Callable[[], None]:
        """Remember the listener."""
        self.listeners.append(listener)
        return lambda: self.listeners.remove(listener)

    async def async_playable_path(self, entity_id: str, name: str) -> Path | None:
        """The local file when it is still there."""
        path = self.folder(entity_id) / name
        return path if path.is_file() else None

    def add(self, name: str, data: bytes, start: float, age: float = 60) -> Path:
        """Write a finished file and index it."""
        path = self.folder(CAMERA) / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        os.utime(path, (time.time() - age, time.time() - age))
        self.segments[CAMERA][name] = Segment(name, start, 10, len(data), True, True)
        return path


@pytest.fixture
async def setup(
    hass: HomeAssistant, tmp_path: Path
) -> tuple[CloudUploader, FakeDrive, FakeDrive, FakeManager]:
    """An uploader with two fake drives and one fake manager."""
    one = FakeDrive(hass, DRIVE_ONEDRIVE)
    google = FakeDrive(hass, DRIVE_GOOGLE)
    uploader = CloudUploader(
        hass,
        {DRIVE_ONEDRIVE: one, DRIVE_GOOGLE: google},
        bytes_per_second=0,
        settle_seconds=5,
    )
    hass.data[DATA_UPLOADER] = uploader
    await uploader.async_load()
    manager = FakeManager(tmp_path / "rec")
    uploader.async_attach(manager)  # type: ignore[arg-type]
    yield uploader, one, google, manager
    await uploader.async_stop()


async def _turn_on(uploader: CloudUploader, domain: str, **kwargs: Any) -> None:
    with patch.object(uploader, "_start_worker"):
        await uploader.async_set(domain, enabled=True, **kwargs)
    uploader.states[domain].settings.enabled_at = 0.0


async def test_off_by_default_and_nothing_is_queued(
    hass: HomeAssistant,
    setup: tuple[CloudUploader, FakeDrive, FakeDrive, FakeManager],
) -> None:
    """With every drive off, finished files are not queued or sent."""
    uploader, one, _google, manager = setup
    manager.add(CLIP, b"clip", time.time())
    assert await uploader.async_scan(manager) == 0  # type: ignore[arg-type]
    status = {row["domain"]: row for row in uploader.status()["drives"]}
    assert status[DRIVE_ONEDRIVE]["enabled"] is False
    assert status[DRIVE_ONEDRIVE]["send"] == "events"
    assert status[DRIVE_ONEDRIVE]["keep_days"] == 30
    assert one.uploads == 0


async def test_event_clips_only_by_default(
    hass: HomeAssistant,
    setup: tuple[CloudUploader, FakeDrive, FakeDrive, FakeManager],
) -> None:
    """The default sends event clips and leaves continuous recordings at home."""
    uploader, one, _google, manager = setup
    await _turn_on(uploader, DRIVE_ONEDRIVE)
    manager.add(CLIP, b"clip-bytes", time.time())
    manager.add(RECORDING, b"recording", time.time())
    assert await uploader.async_scan(manager) == 1  # type: ignore[arg-type]
    # A second scan of the same index queues nothing new.
    assert await uploader.async_scan(manager) == 0  # type: ignore[arg-type]
    assert await uploader.async_send_next(DRIVE_ONEDRIVE)
    (folder, name, data) = next(iter(one.files.values()))
    assert folder[0] == "Camera recordings"
    assert folder[1] == "front_door"
    assert name == CLIP
    assert data == b"clip-bytes"
    status = {row["domain"]: row for row in uploader.status()["drives"]}
    assert status[DRIVE_ONEDRIVE]["waiting_files"] == 0
    assert status[DRIVE_ONEDRIVE]["sent_files"] == 1
    assert status[DRIVE_ONEDRIVE]["last_sent"]["name"] == CLIP
    # The recording at its usual place is untouched.
    assert (manager.folder(CAMERA) / CLIP).read_bytes() == b"clip-bytes"


async def test_everything_sends_recordings_too(
    hass: HomeAssistant,
    setup: tuple[CloudUploader, FakeDrive, FakeDrive, FakeManager],
) -> None:
    """Everything sends continuous recordings as well as event clips."""
    uploader, _one, google, manager = setup
    await _turn_on(uploader, DRIVE_GOOGLE, send=SEND_EVERYTHING)
    manager.add(CLIP, b"c", time.time())
    manager.add(RECORDING, b"r", time.time())
    assert await uploader.async_scan(manager) == 2  # type: ignore[arg-type]
    assert await uploader.async_send_next(DRIVE_GOOGLE)
    assert await uploader.async_send_next(DRIVE_GOOGLE)
    assert {name for _, name, _ in google.files.values()} == {CLIP, RECORDING}


async def test_file_still_being_written_waits(
    hass: HomeAssistant,
    setup: tuple[CloudUploader, FakeDrive, FakeDrive, FakeManager],
) -> None:
    """A file that changed a moment ago is not sent yet."""
    uploader, one, _google, manager = setup
    await _turn_on(uploader, DRIVE_ONEDRIVE)
    manager.add(CLIP, b"clip", time.time(), age=0)
    await uploader.async_scan(manager)  # type: ignore[arg-type]
    assert not await uploader.async_send_next(DRIVE_ONEDRIVE)
    assert one.uploads == 0
    assert uploader.states[DRIVE_ONEDRIVE].queue[0]["next_try"] > time.time()


async def test_local_copy_kept_until_upload_confirmed(
    hass: HomeAssistant,
    setup: tuple[CloudUploader, FakeDrive, FakeDrive, FakeManager],
) -> None:
    """The queue's own link outlives the recording being trimmed locally."""
    uploader, one, _google, manager = setup
    await _turn_on(uploader, DRIVE_ONEDRIVE)
    path = manager.add(CLIP, b"clip", time.time())
    await uploader.async_scan(manager)  # type: ignore[arg-type]
    staged = Path(uploader.states[DRIVE_ONEDRIVE].queue[0]["staged"])
    assert staged.is_file()
    path.unlink()
    one.fail_with = REASON_DRIVE_ERROR
    assert not await uploader.async_send_next(DRIVE_ONEDRIVE)
    assert staged.is_file()
    item = uploader.states[DRIVE_ONEDRIVE].queue[0]
    assert item["attempts"] == 1
    item["next_try"] = 0
    one.fail_with = None
    assert await uploader.async_send_next(DRIVE_ONEDRIVE)
    await hass.async_block_till_done()
    assert not staged.exists()
    assert len(one.files) == 1


async def test_gives_up_after_the_limit(
    hass: HomeAssistant,
    setup: tuple[CloudUploader, FakeDrive, FakeDrive, FakeManager],
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Repeated failures back off, are logged once, then end with a plain reason."""
    uploader, one, _google, manager = setup
    await _turn_on(uploader, DRIVE_ONEDRIVE)
    manager.add(CLIP, b"clip", time.time())
    await uploader.async_scan(manager)  # type: ignore[arg-type]
    one.fail_with = REASON_DRIVE_ERROR
    waits = []
    for _ in range(MAX_ATTEMPTS):
        queue = uploader.states[DRIVE_ONEDRIVE].queue
        if not queue:
            break
        queue[0]["next_try"] = 0
        await uploader.async_send_next(DRIVE_ONEDRIVE)
        if queue:
            waits.append(queue[0]["next_try"] - time.time())
    assert waits == sorted(waits)
    state = uploader.states[DRIVE_ONEDRIVE]
    assert not state.queue
    assert state.given_up == 1
    assert state.last_problem["reason"] == REASON_DRIVE_ERROR
    assert caplog.text.count("Sending camera recordings to onedrive failed") == 1
    assert "reason: drive_error" in caplog.text


async def test_sign_in_problem_waits_without_giving_up(
    hass: HomeAssistant,
    setup: tuple[CloudUploader, FakeDrive, FakeDrive, FakeManager],
) -> None:
    """A sign-in problem waits for the owner and does not use up attempts."""
    uploader, one, _google, manager = setup
    await _turn_on(uploader, DRIVE_ONEDRIVE)
    manager.add(CLIP, b"clip", time.time())
    await uploader.async_scan(manager)  # type: ignore[arg-type]
    one.fail_with = REASON_SIGN_IN
    for _ in range(MAX_ATTEMPTS + 2):
        uploader.states[DRIVE_ONEDRIVE].queue[0]["next_try"] = 0
        await uploader.async_send_next(DRIVE_ONEDRIVE)
    item = uploader.states[DRIVE_ONEDRIVE].queue[0]
    assert item["attempts"] == 0
    assert uploader.states[DRIVE_ONEDRIVE].last_problem["reason"] == REASON_SIGN_IN


async def test_missing_file_is_dropped_with_reason(
    hass: HomeAssistant,
    setup: tuple[CloudUploader, FakeDrive, FakeDrive, FakeManager],
) -> None:
    """A file that is gone everywhere is removed from the queue with a plain reason."""
    uploader, _one, _google, manager = setup
    await _turn_on(uploader, DRIVE_ONEDRIVE)
    path = manager.add(CLIP, b"clip", time.time())
    await uploader.async_scan(manager)  # type: ignore[arg-type]
    item = uploader.states[DRIVE_ONEDRIVE].queue[0]
    Path(item["staged"]).unlink()
    path.unlink()
    assert await uploader.async_send_next(DRIVE_ONEDRIVE)
    state = uploader.states[DRIVE_ONEDRIVE]
    assert not state.queue
    assert state.last_problem["reason"] == REASON_FILE_GONE


async def test_queue_survives_a_restart(
    hass: HomeAssistant,
    setup: tuple[CloudUploader, FakeDrive, FakeDrive, FakeManager],
    tmp_path: Path,
) -> None:
    """The waiting files and the settings are stored and read back."""
    uploader, _one, _google, manager = setup
    await _turn_on(uploader, DRIVE_ONEDRIVE)
    await uploader.async_set_keep_days(DRIVE_ONEDRIVE, 90)
    manager.add(CLIP, b"clip", time.time())
    await uploader.async_scan(manager)  # type: ignore[arg-type]
    await uploader.async_stop()

    again_drive = FakeDrive(hass, DRIVE_ONEDRIVE)
    again = CloudUploader(
        hass,
        {DRIVE_ONEDRIVE: again_drive},
        bytes_per_second=0,
        settle_seconds=5,
    )
    with patch.object(again, "_start_worker") as start:
        await again.async_load()
    start.assert_called_once_with(DRIVE_ONEDRIVE)
    state = again.states[DRIVE_ONEDRIVE]
    assert state.settings.enabled
    assert state.settings.keep_days == 90
    assert len(state.queue) == 1
    assert Path(state.queue[0]["staged"]).is_file()
    assert await again.async_send_next(DRIVE_ONEDRIVE)
    assert len(again_drive.files) == 1


async def test_turning_off_empties_the_queue(
    hass: HomeAssistant,
    setup: tuple[CloudUploader, FakeDrive, FakeDrive, FakeManager],
) -> None:
    """Nothing more leaves the home once a drive is turned off."""
    uploader, one, _google, manager = setup
    await _turn_on(uploader, DRIVE_ONEDRIVE)
    manager.add(CLIP, b"clip", time.time())
    await uploader.async_scan(manager)  # type: ignore[arg-type]
    staged = Path(uploader.states[DRIVE_ONEDRIVE].queue[0]["staged"])
    await uploader.async_set(DRIVE_ONEDRIVE, enabled=False)
    assert not uploader.states[DRIVE_ONEDRIVE].queue
    assert not staged.exists()
    assert not await uploader.async_send_next(DRIVE_ONEDRIVE)
    assert one.uploads == 0


async def test_keep_for_deletes_old_files_on_the_drive(
    hass: HomeAssistant,
    setup: tuple[CloudUploader, FakeDrive, FakeDrive, FakeManager],
) -> None:
    """Files older than the keep-for time are deleted from the drive; forever keeps them."""
    uploader, one, _google, _manager = setup
    await _turn_on(uploader, DRIVE_ONEDRIVE)
    now = time.time()
    one.files = {"old": (("a",), "old.mp4", b""), "new": (("a",), "new.mp4", b"")}
    uploader.states[DRIVE_ONEDRIVE].sent = [
        ["old", now - 40 * 86400, 1, CAMERA, "old.mp4"],
        ["new", now - 86400, 1, CAMERA, "new.mp4"],
    ]
    await uploader.async_set_keep_days(DRIVE_ONEDRIVE, None)
    assert set(one.files) == {"old", "new"}
    await uploader.async_set_keep_days(DRIVE_ONEDRIVE, 30)
    assert set(one.files) == {"new"}
    assert [row[0] for row in uploader.states[DRIVE_ONEDRIVE].sent] == ["new"]


async def test_websocket_status_and_settings(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    setup: tuple[CloudUploader, FakeDrive, FakeDrive, FakeManager],
) -> None:
    """Turning a drive on needs the confirmation; settings are returned in the status."""
    uploader, _one, google, _manager = setup
    async_register_cloud_websocket(hass)
    client = await hass_ws_client(hass)

    await client.send_json_auto_id({"type": "camera_recording/cloud/status"})
    result = await client.receive_json()
    assert result["success"]
    assert [row["domain"] for row in result["result"]["drives"]] == [
        DRIVE_ONEDRIVE,
        DRIVE_GOOGLE,
    ]

    await client.send_json_auto_id(
        {"type": "camera_recording/cloud/set", "drive": DRIVE_ONEDRIVE, "enabled": True}
    )
    result = await client.receive_json()
    assert result["error"]["code"] == "confirmation_required"

    google.is_set_up = False
    await client.send_json_auto_id(
        {
            "type": "camera_recording/cloud/set",
            "drive": DRIVE_GOOGLE,
            "enabled": True,
            "video_leaves_home_confirmed": True,
        }
    )
    result = await client.receive_json()
    assert result["error"]["code"] == "not_set_up"

    with patch.object(uploader, "_start_worker"):
        await client.send_json_auto_id(
            {
                "type": "camera_recording/cloud/set",
                "drive": DRIVE_ONEDRIVE,
                "enabled": True,
                "video_leaves_home_confirmed": True,
                "send": SEND_EVERYTHING,
                "keep_days": 14,
            }
        )
        result = await client.receive_json()
    assert result["success"]
    row = result["result"]["drives"][0]
    assert row["enabled"] is True
    assert row["send"] == SEND_EVERYTHING
    assert row["keep_days"] == 14

    await client.send_json_auto_id(
        {
            "type": "camera_recording/cloud/set",
            "drive": DRIVE_ONEDRIVE,
            "keep_days": 400,
        }
    )
    result = await client.receive_json()
    assert not result["success"]


async def test_websocket_needs_admin(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    hass_read_only_access_token: str,
    setup: tuple[CloudUploader, FakeDrive, FakeDrive, FakeManager],
) -> None:
    """Only an administrator can see or change cloud uploads."""
    async_register_cloud_websocket(hass)
    client = await hass_ws_client(hass, hass_read_only_access_token)
    await client.send_json_auto_id({"type": "camera_recording/cloud/status"})
    result = await client.receive_json()
    assert result["error"]["code"] == "unauthorized"


async def test_stored_under_its_own_key(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    setup: tuple[CloudUploader, FakeDrive, FakeDrive, FakeManager],
) -> None:
    """Settings are stored under the uploader's own key and hold no account details."""
    uploader, _one, _google, _manager = setup
    await _turn_on(uploader, DRIVE_ONEDRIVE)
    await uploader.async_stop()
    stored = hass_storage[STORAGE_KEY]["data"]["drives"][DRIVE_ONEDRIVE]
    assert stored["settings"]["enabled"] is True
    assert "token" not in str(hass_storage[STORAGE_KEY])
    assert DOMAIN in STORAGE_KEY


@pytest.mark.usefixtures("no_ffmpeg")
async def test_entry_setup_attaches_the_uploader(
    hass: HomeAssistant, local_entry: MockConfigEntry
) -> None:
    """The integration hands its recording manager to the uploader, and takes it back."""
    await setup_entry(hass, local_entry)
    uploader = hass.data[DATA_UPLOADER]
    assert uploader.managers[local_entry.entry_id] is local_entry.runtime_data
    assert all(not state.settings.enabled for state in uploader.states.values())
    assert await hass.config_entries.async_unload(local_entry.entry_id)
    assert local_entry.entry_id not in uploader.managers
