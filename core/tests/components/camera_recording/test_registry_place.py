"""Tests for sending recordings to the locked registry and playing them back from it."""

from collections.abc import AsyncGenerator
import os
from pathlib import Path
import time
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from pytest_homeassistant.common import MockConfigEntry
from pytest_homeassistant.typing import ClientSessionGenerator, WebSocketGenerator

from homeassistant.components.camera_recording.cloud import (
    DRIVE_REGISTRY,
    REASON_RATE_LIMITED,
    DriveError,
)
from homeassistant.components.camera_recording.play_registry import (
    CLOSE_GRACE_SECONDS,
    IDLE_SECONDS,
    MAX_PARTS,
    RangeNotSatisfiable,
    RegistryPlayer,
    parse_range,
    parts_for,
)
from homeassistant.components.camera_recording.registry_place import (
    RegistryDrive,
    RegistryIndex,
    annotate_segments,
    get_place,
    object_name,
)
from homeassistant.components.registry_storage.crypto import PART_SIZE
from homeassistant.components.registry_storage.store import RegistryStore
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant

from tests.components.registry_storage.conftest import (  # noqa: F401
    client,
    fast_kdf,
    make_store,
    registry,
    sleeps,
    vault_key,
)

CAMERA = "camera.front_door"
CLIP = "20261118T093600Z-event.mp4"
FOLDER = ("Camera recordings", "front_door", "2026-11-18")


def _loaded_registry(hass: HomeAssistant, store: RegistryStore) -> MockConfigEntry:
    entry = MockConfigEntry(
        domain="registry_storage", title="Registry", state=ConfigEntryState.LOADED
    )
    entry.add_to_hass(hass)
    entry.runtime_data = SimpleNamespace(store=store, client=store.client)
    return entry


def _stream_of(path: Path):
    async def _chunks():
        yield path.read_bytes()

    _chunks.path = path  # type: ignore[attr-defined]
    return _chunks


@pytest.fixture
def store(request: pytest.FixtureRequest) -> RegistryStore:
    """A store on the in-memory registry of the registry_storage tests."""
    return request.getfixturevalue("make_store")()


@pytest.fixture
async def place(
    hass: HomeAssistant, store: RegistryStore
) -> AsyncGenerator[RegistryDrive]:
    """A registry drive on a loaded fake registry, with its index loaded."""
    _loaded_registry(hass, store)
    drive = RegistryDrive(hass)
    await get_place(hass).async_load()
    yield drive
    await get_place(hass).async_stop()


def test_parse_range() -> None:
    """Only the first range is served, suffix ranges count from the end."""
    assert parse_range(None, 100) == (0, 100, False)
    assert parse_range("bytes=0-9", 100) == (0, 10, True)
    assert parse_range("bytes=90-", 100) == (90, 100, True)
    assert parse_range("bytes=90-500", 100) == (90, 100, True)
    assert parse_range("bytes=-10", 100) == (90, 100, True)
    assert parse_range("bytes=-500", 100) == (0, 100, True)
    assert parse_range("bytes=0-9,20-29", 100) == (0, 10, True)
    assert parse_range("bytes=abc", 100) == (0, 100, False)
    with pytest.raises(RangeNotSatisfiable):
        parse_range("bytes=100-", 100)


def test_parts_for() -> None:
    """A range maps to the parts that hold it and nothing else."""
    assert list(parts_for(0, 1)) == [0]
    assert list(parts_for(0, PART_SIZE)) == [0]
    assert list(parts_for(PART_SIZE - 1, PART_SIZE + 1)) == [0, 1]
    assert list(parts_for(3 * PART_SIZE, 3 * PART_SIZE + 5)) == [3]
    assert list(parts_for(5, 5)) == []


async def test_index_states_survive_trimming(hass: HomeAssistant) -> None:
    """A recording trimmed from this system is still drawn, from the registry."""
    index = RegistryIndex(hass)
    index.add(
        CAMERA,
        CLIP,
        object_id="obj1",
        start=1000.0,
        duration=10.0,
        size=64,
        kind="event_clip",
    )
    place = get_place(hass)
    place.index = index
    here = [
        {
            "entry_id": "e",
            "name": "kept.mp4",
            "start": 900.0,
            "end": 950.0,
            "size": 5,
            "here": True,
            "kind": "recording",
        }
    ]
    merged = annotate_segments(hass, CAMERA, here, 0, 5000)
    by_name = {seg["name"]: seg for seg in merged}
    assert by_name["kept.mp4"]["here"] is True
    assert by_name["kept.mp4"]["in_registry"] is False
    assert by_name[CLIP]["here"] is False
    assert by_name[CLIP]["in_registry"] is True
    both = [{**here[0], "name": CLIP, "start": 1000.0, "end": 1010.0}]
    merged = annotate_segments(hass, CAMERA, both, 0, 5000)
    assert len(merged) == 1
    assert merged[0]["here"] is True
    assert merged[0]["in_registry"] is True
    assert annotate_segments(hass, CAMERA, [], 2000, 3000) == []
    assert index.remove_object("obj1") is True
    assert index.remove_object("obj1") is False


async def test_upload_lists_and_deletes(
    hass: HomeAssistant, place: RegistryDrive, store: RegistryStore, tmp_path: Path
) -> None:
    """A finished file is locked, indexed with its camera and day, listed and removed."""
    path = tmp_path / CLIP
    data = os.urandom(PART_SIZE + 777)
    path.write_bytes(data)
    remote = await place.upload(_stream_of(path), len(data), FOLDER, CLIP)
    assert remote.size == len(data)
    row = get_place(hass).index.find(CAMERA, CLIP)
    assert row is not None
    assert row["id"] == remote.id
    assert row["kind"] == "event_clip"
    stored = await store.async_get_object(remote.id)
    assert stored.name == object_name(CAMERA, "2026-11-18", CLIP)
    assert stored.camera == CAMERA
    again = await place.upload(_stream_of(path), len(data), FOLDER, CLIP)
    assert again.id == remote.id
    assert len(await store.async_list(kind="recording")) == 1
    assert [item.id for item in await place.list(FOLDER)] == [remote.id]
    await place.delete(remote.id)
    assert get_place(hass).index.find(CAMERA, CLIP) is None
    assert await store.async_list(kind="recording", refresh=True) == []


async def test_per_camera_repository(
    hass: HomeAssistant, place: RegistryDrive, store: RegistryStore, tmp_path: Path
) -> None:
    """A camera with its own repository sends there; the others use the default."""
    store.settings.camera_repositories[CAMERA] = "tester/cam-front"
    path = tmp_path / CLIP
    path.write_bytes(b"x" * 100)
    remote = await place.upload(_stream_of(path), 100, FOLDER, CLIP)
    assert (await store.async_get_object(remote.id)).repository == "tester/cam-front"
    other = tmp_path / "20261118T093700Z-event.mp4"
    other.write_bytes(b"y" * 100)
    remote = await place.upload(
        _stream_of(other),
        100,
        ("Camera recordings", "garden", "2026-11-18"),
        other.name,
    )
    assert (await store.async_get_object(remote.id)).repository == "tester/vault"


async def test_rate_limit_is_a_waiting_reason(
    hass: HomeAssistant, place: RegistryDrive, store: RegistryStore, tmp_path: Path
) -> None:
    """A busy registry makes the queue wait instead of giving up."""
    from homeassistant.components.camera_recording.uploader import WAITING_REASONS  # noqa: PLC0415
    from homeassistant.components.registry_storage.errors import Reason, RegistryError  # noqa: PLC0415

    path = tmp_path / CLIP
    path.write_bytes(b"x" * 10)
    with (
        patch.object(
            store, "async_put_file", side_effect=RegistryError(Reason.RATE_LIMITED)
        ),
        pytest.raises(DriveError) as err,
    ):
        await place.upload(_stream_of(path), 10, FOLDER, CLIP)
    assert err.value.reason == REASON_RATE_LIMITED
    assert REASON_RATE_LIMITED in WAITING_REASONS


async def test_not_set_up(hass: HomeAssistant, tmp_path: Path) -> None:
    """Without a registry place there is nothing to send to."""
    drive = RegistryDrive(hass)
    path = tmp_path / CLIP
    path.write_bytes(b"x")
    assert drive.set_up is False
    with pytest.raises(DriveError) as err:
        await drive.upload(_stream_of(path), 1, FOLDER, CLIP)
    assert err.value.reason == "not_set_up"


async def test_playing_a_range_fetches_only_the_parts_it_needs(
    hass: HomeAssistant, place: RegistryDrive, store: RegistryStore, tmp_path: Path
) -> None:
    """The first megabyte and the last bytes come back exact, one part at a time, shared."""
    data = os.urandom(3 * PART_SIZE + 4321)
    path = tmp_path / CLIP
    path.write_bytes(data)
    remote = await place.upload(_stream_of(path), len(data), FOLDER, CLIP)
    player = RegistryPlayer(hass)
    one = player.open_session(remote.id, len(data))
    two = player.open_session(remote.id, len(data))
    assert one is two
    assert one.readers == 2
    head = b"".join([c async for c in player.read(one, 0, PART_SIZE)])
    assert head == data[:PART_SIZE]
    tail = b"".join([c async for c in player.read(two, len(data) - 100, len(data))])
    assert tail == data[-100:]
    middle = b"".join([c async for c in player.read(one, PART_SIZE - 5, PART_SIZE + 5)])
    assert middle == data[PART_SIZE - 5 : PART_SIZE + 5]
    assert one.downloads == 3
    assert len(one.parts) <= MAX_PARTS
    player.release(one)
    player.release(two)
    assert one.readers == 0


async def test_idle_cleanup_and_close(hass: HomeAssistant) -> None:
    """Unlocked parts are dropped after the last viewer leaves, and after idle time."""
    player = RegistryPlayer(hass)
    session = player.open_session("obj", 10)
    session.parts[0] = b"plain"
    base = time.monotonic()
    player.sweep(base + 1)
    assert "obj" in player.sessions
    player.release(session)
    player.sweep(base + CLOSE_GRACE_SECONDS - 1)
    assert "obj" in player.sessions
    player.sweep(base + CLOSE_GRACE_SECONDS + 5)
    assert "obj" not in player.sessions
    assert session.parts == {}
    open_one = player.open_session("obj2", 10)
    open_one.parts[0] = b"plain"
    player.sweep(base + IDLE_SECONDS + 100)
    assert player.sessions == {}
    player.open_session("obj3", 10)
    player.close_all()
    assert player.sessions == {}


async def test_rate_limit_wait_grows_and_resets(hass: HomeAssistant) -> None:
    """A busy registry is waited for, longer each time, and the wait is reported."""
    player = RegistryPlayer(hass)
    assert player.waiting() is None
    player.note_limited()
    first = player.waiting()
    assert first is not None
    assert first["reason"] == "rate_limited"
    player.note_limited()
    second = player.waiting()
    assert second is not None
    assert second["retry_after"] > first["retry_after"]
    player.note_ok()
    player.note_limited()
    third = player.waiting()
    assert third is not None
    assert third["retry_after"] <= first["retry_after"]


@pytest.mark.usefixtures("no_ffmpeg")
async def test_play_over_http_with_ranges(
    hass: HomeAssistant,
    place: RegistryDrive,
    store: RegistryStore,
    local_entry: MockConfigEntry,
    hass_ws_client: WebSocketGenerator,
    hass_client: ClientSessionGenerator,
    tmp_path: Path,
) -> None:
    """A signed path plays an older recording by ranges, and where it lives is reported."""
    from .test_init import setup_entry  # noqa: PLC0415

    await setup_entry(hass, local_entry)
    data = os.urandom(2 * PART_SIZE + 99)
    path = tmp_path / CLIP
    path.write_bytes(data)
    await place.upload(_stream_of(path), len(data), FOLDER, CLIP)
    ws = await hass_ws_client(hass)
    await ws.send_json_auto_id(
        {"type": "camera_recording/registry/play", "entity_id": CAMERA, "name": CLIP}
    )
    result = (await ws.receive_json())["result"]
    assert result["size"] == len(data)
    assert result["content_type"] == "video/mp4"
    http = await hass_client()
    full = await http.get(result["path"])
    assert full.status == 200
    assert full.headers["Accept-Ranges"] == "bytes"
    assert await full.read() == data
    head = await http.get(result["path"], headers={"Range": "bytes=0-1048575"})
    assert head.status == 206
    assert await head.read() == data[:PART_SIZE]
    tail = await http.get(result["path"], headers={"Range": "bytes=-100"})
    assert tail.status == 206
    assert (
        tail.headers["Content-Range"]
        == f"bytes {len(data) - 100}-{len(data) - 1}/{len(data)}"
    )
    assert await tail.read() == data[-100:]
    past = await http.get(result["path"], headers={"Range": f"bytes={len(data)}-"})
    assert past.status == 416
    unknown = await http.get(
        f"/api/camera_recording/registry/{CAMERA}/20200101T000000Z.mp4"
    )
    assert unknown.status == 404

    await ws.send_json_auto_id(
        {
            "type": "camera_recording/registry/where",
            "entity_id": CAMERA,
            "start_time": "2026-11-18T00:00:00+00:00",
            "end_time": "2026-11-19T00:00:00+00:00",
        }
    )
    rows = (await ws.receive_json())["result"]
    assert [(row["name"], row["here"], row["in_registry"]) for row in rows] == [
        (CLIP, False, True)
    ]

    await ws.send_json_auto_id({"type": "camera_recording/registry/status"})
    status = (await ws.receive_json())["result"]
    assert status["loaded"] is True
    assert status["cameras"][CAMERA]["in_registry_files"] == 1
    assert status["upload"]["domain"] == DRIVE_REGISTRY
    assert status["upload"]["enabled"] is False


@pytest.mark.usefixtures("no_ffmpeg")
async def test_rate_limited_view_says_so(
    hass: HomeAssistant,
    place: RegistryDrive,
    local_entry: MockConfigEntry,
    hass_ws_client: WebSocketGenerator,
    hass_client: ClientSessionGenerator,
    tmp_path: Path,
) -> None:
    """While the registry asks for a pause, playback answers 429 with the wait."""
    from .test_init import setup_entry  # noqa: PLC0415

    await setup_entry(hass, local_entry)
    path = tmp_path / CLIP
    path.write_bytes(b"x" * 100)
    await place.upload(_stream_of(path), 100, FOLDER, CLIP)
    ws = await hass_ws_client(hass)
    await ws.send_json_auto_id(
        {"type": "camera_recording/registry/play", "entity_id": CAMERA, "name": CLIP}
    )
    result = (await ws.receive_json())["result"]
    get_place(hass).player.note_limited()
    response = await (await hass_client()).get(result["path"])
    assert response.status == 429
    assert (await response.json())["reason"] == "rate_limited"
    assert int(response.headers["Retry-After"]) > 0


@pytest.mark.usefixtures("no_ffmpeg")
async def test_get_back_a_day(
    hass: HomeAssistant,
    place: RegistryDrive,
    local_entry: MockConfigEntry,
    hass_ws_client: WebSocketGenerator,
    tmp_path: Path,
) -> None:
    """A whole day is downloaded, unlocked and written to the camera folder."""
    from .test_init import setup_entry  # noqa: PLC0415

    await setup_entry(hass, local_entry)
    data = os.urandom(PART_SIZE + 5)
    path = tmp_path / CLIP
    path.write_bytes(data)
    await place.upload(_stream_of(path), len(data), FOLDER, CLIP)
    get_place(hass).index.rows[CAMERA][CLIP]["start"] = 1795000000.0
    day = time.strftime("%Y-%m-%d", time.gmtime(1795000000.0))
    ws = await hass_ws_client(hass)
    await ws.send_json_auto_id(
        {"type": "camera_recording/registry/get_back", "entity_id": CAMERA, "day": day}
    )
    job = (await ws.receive_json())["result"]
    assert job["files"] == 1
    for _ in range(100):
        await hass.async_block_till_done()
        await ws.send_json_auto_id(
            {"type": "camera_recording/registry/get_back_status", "job_id": job["id"]}
        )
        job = (await ws.receive_json())["result"]
        if job["state"] != "running":
            break
    assert job["state"] == "done"
    assert job["done_bytes"] == len(data)
    restored = local_entry.runtime_data.folder(CAMERA) / CLIP
    assert restored.read_bytes() == data
    assert not list(restored.parent.glob("*.part"))
