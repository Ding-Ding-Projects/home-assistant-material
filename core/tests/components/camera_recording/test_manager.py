"""Tests for copying, limits and the segment index."""

from datetime import timedelta
import os
from pathlib import Path

from freezegun.api import FrozenDateTimeFactory
import pytest
from pytest_homeassistant.common import MockConfigEntry

from homeassistant.components.camera_recording.const import SEGMENT_TIME_FORMAT
from homeassistant.components.camera_recording.manager import (
    RecordingManager,
    parse_start,
    remote_path,
)
from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util

from .conftest import CAMERA, MemoryDestination, write_segment


def name_at(minutes_ago: float) -> str:
    """A segment file name that started some minutes ago."""
    start = dt_util.utcnow() - timedelta(minutes=minutes_ago)
    return start.strftime(SEGMENT_TIME_FORMAT) + ".mp4"


async def start_manager(
    hass: HomeAssistant, entry: MockConfigEntry
) -> RecordingManager:
    """Start a manager without ffmpeg for an entry that is already added."""
    manager = RecordingManager(hass, entry)
    await manager.async_start()
    return manager


def test_names() -> None:
    """Segment names parse back to their start, and remote paths group by day."""
    assert parse_start("20261115T151000Z.mp4") is not None
    assert parse_start("../x.mp4") is None
    assert (
        remote_path(CAMERA, "20261115T151000Z.mp4")
        == "front_door/2026-11-15/20261115T151000Z.mp4"
    )


@pytest.mark.usefixtures("no_ffmpeg")
async def test_copy_and_trim(
    hass: HomeAssistant, remote_entry: MockConfigEntry, remote_store: dict[str, bytes]
) -> None:
    """Finished segments are copied, and copies older than the buffer leave this computer."""
    remote_entry.add_to_hass(hass)
    manager = await start_manager(hass, remote_entry)
    folder = manager.folder(CAMERA)
    old = write_segment(folder, name_at(180))
    os.utime(
        old,
        (old.stat().st_atime, (dt_util.utcnow() - timedelta(minutes=175)).timestamp()),
    )
    recent = write_segment(folder, name_at(10))
    os.utime(
        recent,
        (recent.stat().st_atime, (dt_util.utcnow() - timedelta(minutes=5)).timestamp()),
    )

    await manager.async_copy()

    assert sorted(remote_store) == sorted(
        [remote_path(CAMERA, old.name), remote_path(CAMERA, recent.name)]
    )
    assert not old.exists()
    assert recent.exists()
    segments = manager.segments[CAMERA]
    assert segments[old.name].remote and not segments[old.name].local
    assert segments[recent.name].remote and segments[recent.name].local
    assert manager.status()["cameras"][0]["waiting"] == 0
    await manager.async_stop()


@pytest.mark.usefixtures("no_ffmpeg")
async def test_copy_failure_keeps_files(
    hass: HomeAssistant, remote_entry: MockConfigEntry, remote_store: dict[str, bytes]
) -> None:
    """When the destination is away, segments wait here and the problem is shown."""
    MemoryDestination.fail = True
    remote_entry.add_to_hass(hass)
    manager = await start_manager(hass, remote_entry)
    segment = write_segment(manager.folder(CAMERA), name_at(30))

    await manager.async_copy()

    assert segment.exists()
    assert remote_store == {}
    status = manager.status()
    assert status["error"] == "The share is offline"
    assert status["cameras"][0]["waiting"] == 1
    await manager.async_stop()


@pytest.mark.usefixtures("no_ffmpeg")
async def test_limits(
    hass: HomeAssistant, remote_entry: MockConfigEntry, remote_store: dict[str, bytes]
) -> None:
    """Recordings past the age limit, then past the space limit, are removed oldest first."""
    remote_entry.add_to_hass(hass)
    hass.config_entries.async_update_entry(
        remote_entry,
        options={**remote_entry.options, "keep_days": 1, "max_gb": 0.00000015},
    )
    manager = await start_manager(hass, remote_entry)
    folder = manager.folder(CAMERA)
    too_old = write_segment(folder, name_at(60 * 30))
    older = write_segment(folder, name_at(30))
    newer = write_segment(folder, name_at(15))
    for path in (too_old, older, newer):
        start = parse_start(path.name)
        os.utime(path, (start.timestamp(), start.timestamp() + 300))
    await manager.async_copy()
    assert len(remote_store) == 3

    await manager.async_apply_limits()

    assert list(manager.segments[CAMERA]) == [newer.name]
    assert list(remote_store) == [remote_path(CAMERA, newer.name)]
    await manager.async_stop()


@pytest.mark.usefixtures("no_ffmpeg")
async def test_playback_fetches_back(
    hass: HomeAssistant, remote_entry: MockConfigEntry, remote_store: dict[str, bytes]
) -> None:
    """A segment no longer here is fetched back from the destination for playback."""
    remote_entry.add_to_hass(hass)
    hass.config_entries.async_update_entry(
        remote_entry, options={**remote_entry.options, "buffer_hours": 0}
    )
    manager = await start_manager(hass, remote_entry)
    segment = write_segment(manager.folder(CAMERA), name_at(30), size=42)
    os.utime(
        segment,
        (
            segment.stat().st_atime,
            (dt_util.utcnow() - timedelta(minutes=25)).timestamp(),
        ),
    )
    await manager.async_copy()
    assert not segment.exists()

    path = await manager.async_playable_path(CAMERA, segment.name)

    assert path is not None
    assert path.read_bytes() == b"x" * 42
    assert await manager.async_playable_path(CAMERA, "20200101T000000Z.mp4") is None
    await manager.async_stop()


@pytest.mark.usefixtures("no_ffmpeg")
async def test_local_destination_is_written_in_place(
    hass: HomeAssistant,
    local_entry: MockConfigEntry,
    tmp_path: Path,
    freezer: FrozenDateTimeFactory,
) -> None:
    """A folder destination is where ffmpeg writes, so nothing is copied."""
    local_entry.add_to_hass(hass)
    manager = await start_manager(hass, local_entry)
    assert manager.folder(CAMERA) == tmp_path / "rec" / "front_door"
    segment = write_segment(manager.folder(CAMERA), name_at(20))

    await manager.async_copy()

    seg = manager.segments[CAMERA][segment.name]
    assert seg.local and seg.remote
    window = manager.segments_between(CAMERA, seg.start - 1, seg.end + 1)
    assert [s.name for s in window] == [segment.name]
    assert manager.segments_between(CAMERA, seg.end + 10, seg.end + 20) == []
    await manager.async_stop()


@pytest.mark.usefixtures("no_ffmpeg")
async def test_index_survives_restart(
    hass: HomeAssistant, remote_entry: MockConfigEntry, remote_store: dict[str, bytes]
) -> None:
    """Copied segments that left this computer stay in the index after a restart."""
    remote_entry.add_to_hass(hass)
    hass.config_entries.async_update_entry(
        remote_entry, options={**remote_entry.options, "buffer_hours": 0}
    )
    manager = await start_manager(hass, remote_entry)
    segment = write_segment(manager.folder(CAMERA), name_at(30))
    os.utime(
        segment,
        (
            segment.stat().st_atime,
            (dt_util.utcnow() - timedelta(minutes=25)).timestamp(),
        ),
    )
    await manager.async_copy()
    await manager.async_set_paused(CAMERA, True)
    await manager.async_stop()

    again = RecordingManager(hass, remote_entry)
    await again.async_start()
    assert segment.name in again.segments[CAMERA]
    assert CAMERA in again.paused
    await again.async_stop()
