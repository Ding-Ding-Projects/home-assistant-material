"""Tests for the cloud drives camera recordings can be sent to, with fake clients."""

from collections.abc import AsyncIterator
from pathlib import Path
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

from google_drive_api.exceptions import ApiForbiddenException, AuthException
from onedrive_personal_sdk.exceptions import AuthenticationError, NotFoundError
import pytest
from pytest_homeassistant.common import MockConfigEntry

from homeassistant.components.camera_recording.cloud import (
    DRIVE_GOOGLE,
    DRIVE_ONEDRIVE,
    REASON_NOT_LOADED,
    REASON_NOT_SET_UP,
    REASON_NOT_SUPPORTED,
    REASON_REFUSED,
    REASON_SIGN_IN,
    DriveError,
    GoogleDriveDrive,
    OneDriveDrive,
    Pacer,
    file_reader,
)
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant


def _loaded_entry(hass: HomeAssistant, domain: str, runtime: Any) -> MockConfigEntry:
    entry = MockConfigEntry(
        domain=domain, title="Drive", unique_id="u1", state=ConfigEntryState.LOADED
    )
    entry.add_to_hass(hass)
    entry.runtime_data = runtime
    return entry


async def _stream(*chunks: bytes) -> AsyncIterator[bytes]:
    for chunk in chunks:
        yield chunk


def _onedrive_runtime() -> SimpleNamespace:
    client = MagicMock()
    client.get_approot = AsyncMock(return_value=SimpleNamespace(id="approot"))
    folders: dict[tuple[str, str], str] = {}

    async def _create_folder(parent_id: str, name: str) -> SimpleNamespace:
        folders.setdefault((parent_id, name), f"{parent_id}/{name}")
        return SimpleNamespace(id=folders[(parent_id, name)])

    client.create_folder = AsyncMock(side_effect=_create_folder)
    client.list_drive_items = AsyncMock(
        return_value=[SimpleNamespace(id="f1", name="a.mp4", size=3)]
    )
    client.delete_drive_item = AsyncMock()
    quota = SimpleNamespace(remaining=5000)
    return SimpleNamespace(
        client=client,
        token_function=AsyncMock(),
        backup_folder_id="backups",
        coordinator=SimpleNamespace(data=SimpleNamespace(quota=quota)),
    )


async def test_drive_not_set_up_or_not_loaded(hass: HomeAssistant) -> None:
    """A drive without an entry, or with one that is not loaded, says which."""
    drive = OneDriveDrive(hass)
    assert not drive.set_up
    assert not drive.loaded
    with pytest.raises(DriveError) as err:
        await drive.folder_id(["Camera recordings"])
    assert err.value.reason == REASON_NOT_SET_UP

    MockConfigEntry(
        domain=DRIVE_ONEDRIVE, state=ConfigEntryState.SETUP_ERROR
    ).add_to_hass(hass)
    assert drive.set_up
    with pytest.raises(DriveError) as err:
        await drive.folder_id(["Camera recordings"])
    assert err.value.reason == REASON_NOT_LOADED
    assert drive.free_space() is None


async def test_onedrive_upload_uses_the_integrations_client(
    hass: HomeAssistant,
) -> None:
    """Folders are made inside the app folder and the file goes through the client."""
    runtime = _onedrive_runtime()
    _loaded_entry(hass, DRIVE_ONEDRIVE, runtime)
    drive = OneDriveDrive(hass)
    seen: dict[str, Any] = {}

    async def _upload(token_function: Any, file: Any, **kwargs: Any) -> Any:
        seen["token_function"] = token_function
        seen["folder"] = file.folder_path_id
        seen["data"] = b"".join([chunk async for chunk in file.content_stream])
        seen["conflict"] = kwargs["conflict_behavior"]
        return SimpleNamespace(id="file1", name=file.name)

    with patch(
        "onedrive_personal_sdk.clients.large_file_upload.LargeFileUploadClient.upload",
        side_effect=_upload,
    ):
        remote = await drive.upload(
            lambda: _stream(b"ab", b"c"),
            3,
            ["Camera recordings", "front_door", "2026-11-18"],
            "clip.mp4",
        )
    assert remote.id == "file1"
    assert seen["token_function"] is runtime.token_function
    assert seen["folder"] == "approot/Camera recordings/front_door/2026-11-18"
    assert seen["data"] == b"abc"
    assert seen["conflict"] == "replace"
    assert drive.free_space() == 5000

    listed = await drive.list(["Camera recordings"])
    assert [item.name for item in listed] == ["a.mp4"]
    # The folder path is remembered, so a second upload does not ask again.
    assert runtime.client.create_folder.await_count == 3

    runtime.client.delete_drive_item.side_effect = NotFoundError(404, "gone")
    await drive.delete("file1")


async def test_onedrive_sign_in_problem(hass: HomeAssistant) -> None:
    """An expired sign-in is reported as a reason code only."""
    runtime = _onedrive_runtime()
    runtime.client.get_approot.side_effect = AuthenticationError(401, "secret text")
    _loaded_entry(hass, DRIVE_ONEDRIVE, runtime)
    with pytest.raises(DriveError) as err:
        await OneDriveDrive(hass).folder_id(["Camera recordings"])
    assert err.value.reason == REASON_SIGN_IN
    assert "secret" not in str(err.value)


def _google_runtime(api: Any) -> SimpleNamespace:
    quota = SimpleNamespace(limit=10_000, usage=4_000)
    return SimpleNamespace(
        client=SimpleNamespace(_api=api),
        backup_folder_id="ha-root",
        data=SimpleNamespace(storage_quota=quota),
    )


async def test_google_upload_creates_folders_inside_its_own_folder(
    hass: HomeAssistant,
) -> None:
    """Folders are found or made under the integration's folder; the file is resumable."""
    api = MagicMock()
    api.list_files = AsyncMock(
        side_effect=[{"files": [{"id": "rec"}]}, {"files": []}, {"files": []}]
    )
    api.create_file = AsyncMock(side_effect=[{"id": "cam"}, {"id": "day"}])
    sent: dict[str, Any] = {}

    async def _resumable(
        metadata: dict[str, Any], open_stream: Any, size: int, **kwargs: Any
    ) -> Any:
        sent["metadata"] = metadata
        sent["data"] = b"".join([chunk async for chunk in await open_stream()])
        response = MagicMock()
        response.json = AsyncMock(return_value={"id": "gfile"})
        return response

    api.resumable_upload_file = AsyncMock(side_effect=_resumable)

    async def _all(**kwargs: Any) -> AsyncIterator[dict[str, Any]]:
        yield {"id": "x", "name": "a.mp4", "size": "7"}

    api.list_all_files = _all
    api.delete_file = AsyncMock()
    _loaded_entry(hass, DRIVE_GOOGLE, _google_runtime(api))
    drive = GoogleDriveDrive(hass)

    remote = await drive.upload(
        lambda: _stream(b"hello"),
        5,
        ["Camera recordings", "front", "2026-11-18"],
        "c.mp4",
    )
    assert remote.id == "gfile"
    assert sent["metadata"] == {"name": "c.mp4", "parents": ["day"]}
    assert sent["data"] == b"hello"
    first_query = api.list_files.await_args_list[0].kwargs["params"]["q"]
    assert "'ha-root' in parents" in first_query
    assert api.create_file.await_args_list[0].kwargs["json"]["parents"] == ["rec"]
    assert drive.free_space() == 6000

    listed = await drive.list(["Camera recordings", "front", "2026-11-18"])
    assert listed[0].size == 7
    await drive.delete("gfile")
    api.delete_file.assert_awaited_once_with("gfile")


@pytest.mark.parametrize(
    ("error", "reason"),
    [
        pytest.param(AuthException("token text"), REASON_SIGN_IN, id="sign_in"),
        pytest.param(ApiForbiddenException("forbidden"), REASON_REFUSED, id="refused"),
    ],
)
async def test_google_errors_become_reason_codes(
    hass: HomeAssistant, error: Exception, reason: str
) -> None:
    """Errors from the client become reason codes without their text."""
    api = MagicMock()
    api.list_files = AsyncMock(side_effect=error)
    _loaded_entry(hass, DRIVE_GOOGLE, _google_runtime(api))
    with pytest.raises(DriveError) as err:
        await GoogleDriveDrive(hass).folder_id(["Camera recordings"])
    assert err.value.reason == reason
    assert str(err.value) == reason


async def test_google_client_without_api(hass: HomeAssistant) -> None:
    """A client that no longer exposes its API object is reported, not worked around."""
    _loaded_entry(hass, DRIVE_GOOGLE, _google_runtime(None))
    with pytest.raises(DriveError) as err:
        await GoogleDriveDrive(hass).folder_id(["Camera recordings"])
    assert err.value.reason == REASON_NOT_SUPPORTED


async def test_delete_older_than(hass: HomeAssistant) -> None:
    """Only files older than the keeping time are deleted; a failure stops early."""
    runtime = _onedrive_runtime()
    _loaded_entry(hass, DRIVE_ONEDRIVE, runtime)
    drive = OneDriveDrive(hass)
    now = 100 * 86400.0
    gone, reason = await drive.delete_older_than(
        [("old", now - 31 * 86400), ("new", now - 86400)], 30, now
    )
    assert gone == ["old"]
    assert reason is None

    runtime.client.delete_drive_item.side_effect = AuthenticationError(401, "x")
    gone, reason = await drive.delete_older_than([("old", 0.0)], 30, now)
    assert gone == []
    assert reason == REASON_SIGN_IN


async def test_file_reader_reads_the_whole_file(
    hass: HomeAssistant, tmp_path: Path
) -> None:
    """The reader yields the file in chunks and can be opened again."""
    path = tmp_path / "clip.mp4"
    path.write_bytes(b"x" * 2_500_000)
    reader = file_reader(hass, path, 0)
    first = b"".join([chunk async for chunk in reader()])
    second = b"".join([chunk async for chunk in reader()])
    assert len(first) == 2_500_000
    assert first == second


async def test_pacer_waits_when_ahead() -> None:
    """The pacer sleeps once more bytes than the rate allows were sent."""
    pacer = Pacer(1000)
    with patch("asyncio.sleep", new=AsyncMock()) as sleep:
        await pacer.wait(500)
        await pacer.wait(1500)
    assert sleep.await_count >= 1
    unlimited = Pacer(0)
    with patch("asyncio.sleep", new=AsyncMock()) as sleep:
        await unlimited.wait(10**9)
    sleep.assert_not_awaited()
