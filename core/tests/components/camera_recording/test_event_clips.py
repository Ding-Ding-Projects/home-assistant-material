"""Tests for the clips kept for the events of a camera that streams only through its service."""

from datetime import timedelta
import errno
import logging
from unittest.mock import patch

from freezegun.api import FrozenDateTimeFactory
import pytest
from pytest_homeassistant.common import MockConfigEntry
from pytest_homeassistant.typing import WebSocketGenerator

from homeassistant.components.camera_recording.event_media import (
    EventMedia,
    EventMediaAdapter,
    EventMediaKind,
    EventMediaSupport,
)
from homeassistant.components.camera_recording.events import (
    GIVE_UP_SECONDS,
    ClipReason,
    ClipState,
    classify_error,
)
from homeassistant.components.camera_recording.manager import RecordingManager
from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util

from .conftest import CAMERA
from .test_init import setup_entry

SECRET_TEXT = "429 Too Many Requests https://provider.example/clip?token=abc123"


class FakeAdapter(EventMediaAdapter):
    """Event media held in memory."""

    def __init__(self) -> None:
        """Start empty."""
        self.events: list[EventMedia] = []
        self.media: dict[str, tuple[bytes, EventMediaKind] | None] = {}
        self.list_error: Exception | None = None
        self.fetch_error: Exception | None = None
        self.list_calls = 0

    async def async_list(self) -> list[EventMedia]:
        """The events, or the error set for the test."""
        self.list_calls += 1
        if self.list_error is not None:
            raise self.list_error
        return list(self.events)

    async def async_fetch(self, token: str) -> tuple[bytes, EventMediaKind] | None:
        """The media, or the error set for the test."""
        if self.fetch_error is not None:
            raise self.fetch_error
        return self.media.get(token)


@pytest.fixture
def adapter() -> FakeAdapter:
    """The fake adapter every test uses."""
    return FakeAdapter()


async def start(
    hass: HomeAssistant,
    entry: MockConfigEntry,
    adapter: FakeAdapter,
    *,
    provider_only: bool = True,
) -> RecordingManager:
    """A started manager whose camera has no stream and whose events come from the fake."""
    entry.add_to_hass(hass)
    manager = RecordingManager(hass, entry)
    await manager.async_start()
    manager.recorders[CAMERA].no_source = provider_only
    patcher = patch(
        "homeassistant.components.camera_recording.manager.async_event_media_for",
        return_value=EventMediaSupport(adapter, "fake"),
    )
    patcher.start()
    manager._unsubs.append(patcher.stop)
    return manager


def clip_event(token: str, seconds_ago: float = 60) -> EventMedia:
    """An event with a clip, some seconds ago."""
    return EventMedia(
        token,
        dt_util.utcnow().timestamp() - seconds_ago,
        EventMediaKind.CLIP,
        ("motion",),
    )


@pytest.mark.usefixtures("no_ffmpeg")
async def test_clip_is_kept_and_shown(
    hass: HomeAssistant, local_entry: MockConfigEntry, adapter: FakeAdapter
) -> None:
    """A clip the integration holds is saved, indexed and reported as saved."""
    manager = await start(hass, local_entry, adapter)
    event = clip_event("a")
    adapter.events = [event]
    adapter.media["a"] = (b"video-bytes", EventMediaKind.CLIP)

    await manager._async_event_clip_tick()

    (row,) = manager.events_between(CAMERA, 0, 4_000_000_000)
    assert row["state"] == "saved"
    assert row["kind"] == "clip"
    assert row["size"] == len(b"video-bytes")
    assert (manager.folder(CAMERA) / row["name"]).read_bytes() == b"video-bytes"
    assert manager.segments_between(CAMERA, 0, 4_000_000_000)[0].kind == "event_clip"
    summary = manager.camera_summary(CAMERA)
    assert summary is not None
    assert summary["kept_today"] == 1
    assert summary["all_day_available"] is False
    assert summary["all_day_reason"] == "provider_only"
    assert summary["last_clip"] == pytest.approx(event.timestamp)
    await manager.async_stop()


@pytest.mark.usefixtures("no_ffmpeg")
async def test_picture_only(
    hass: HomeAssistant, local_entry: MockConfigEntry, adapter: FakeAdapter
) -> None:
    """A camera whose service keeps only a still picture shows a picture, not a clip."""
    manager = await start(hass, local_entry, adapter)
    adapter.events = [
        EventMedia(
            "p",
            dt_util.utcnow().timestamp() - 30,
            EventMediaKind.IMAGE,
            ("person",),
        )
    ]
    adapter.media["p"] = (b"jpeg", EventMediaKind.IMAGE)

    await manager._async_event_clip_tick()

    (row,) = manager.events_between(CAMERA, 0, 4_000_000_000)
    assert (row["state"], row["kind"]) == ("saved", "image")
    assert row["name"].endswith(".jpg")
    await manager.async_stop()


@pytest.mark.usefixtures("no_ffmpeg")
async def test_missing_media_is_waited_for_then_explained(
    hass: HomeAssistant,
    local_entry: MockConfigEntry,
    adapter: FakeAdapter,
    freezer: FrozenDateTimeFactory,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """An event with no media yet is saving, then has a reason, logged once and counted."""
    manager = await start(hass, local_entry, adapter)
    adapter.events = [clip_event("a", 10)]

    await manager._async_event_clip_tick()
    (row,) = manager.events_between(CAMERA, 0, 4_000_000_000)
    assert row["state"] == "saving"
    assert row["progress"] is not None
    assert "No clip kept" not in caplog.text

    freezer.tick(GIVE_UP_SECONDS + 5)
    caplog.set_level(logging.WARNING)
    await manager._async_event_clip_tick()
    (row,) = manager.events_between(CAMERA, 0, 4_000_000_000)
    assert (row["state"], row["reason"]) == ("none", "no_media")
    assert caplog.text.count("No clip kept for an event of camera.front_door") == 1
    summary = manager.camera_summary(CAMERA)
    assert summary is not None
    assert summary["last_problem"]["reason"] == "no_media"
    assert manager.status()["cameras"][0]["failures"] == {"no_media": 1}

    adapter.media["a"] = (b"late", EventMediaKind.CLIP)
    await manager._async_event_clip_tick()
    (row,) = manager.events_between(CAMERA, 0, 4_000_000_000)
    assert row["state"] == "saved"
    await manager.async_stop()


@pytest.mark.usefixtures("no_ffmpeg")
async def test_rate_limit_waits_and_hides_secrets(
    hass: HomeAssistant,
    local_entry: MockConfigEntry,
    adapter: FakeAdapter,
    freezer: FrozenDateTimeFactory,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """After a refusal for too many requests nothing asks again until the wait is over."""
    manager = await start(hass, local_entry, adapter)
    adapter.events = [clip_event("a")]
    adapter.media["a"] = (b"v", EventMediaKind.CLIP)
    adapter.fetch_error = RuntimeError(SECRET_TEXT)

    await manager._async_event_clip_tick()
    (row,) = manager.events_between(CAMERA, 0, 4_000_000_000)
    assert (row["state"], row["reason"]) == ("none", "rate_limited")
    assert "abc123" not in caplog.text
    assert "provider.example" not in caplog.text
    assert "rate_limited" in caplog.text

    calls = adapter.list_calls
    freezer.tick(30)
    await manager._async_event_clip_tick()
    assert adapter.list_calls == calls

    adapter.fetch_error = None
    freezer.tick(60)
    await manager._async_event_clip_tick()
    # The minute timer may also have run once the wait was over.
    assert adapter.list_calls > calls
    (row,) = manager.events_between(CAMERA, 0, 4_000_000_000)
    assert row["state"] == "saved"
    await manager.async_stop()


@pytest.mark.usefixtures("no_ffmpeg")
async def test_list_failure_is_logged_once(
    hass: HomeAssistant,
    local_entry: MockConfigEntry,
    adapter: FakeAdapter,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """A list the integration cannot give is said once with its kind and never its text."""
    manager = await start(hass, local_entry, adapter)
    adapter.list_error = TimeoutError(SECRET_TEXT)

    await manager._async_event_clip_tick()
    await manager._async_event_clip_tick()

    assert caplog.text.count("Could not read the events of camera.front_door") == 1
    assert "timed_out" in caplog.text
    assert "abc123" not in caplog.text
    await manager.async_stop()


@pytest.mark.usefixtures("no_ffmpeg")
@pytest.mark.parametrize(
    ("error", "reason"),
    [
        (OSError(errno.ENOSPC, "No space left"), "storage_full"),
        (OSError(errno.EIO, "Input/output error"), "storage_unreachable"),
    ],
)
async def test_storage_problems(
    hass: HomeAssistant,
    local_entry: MockConfigEntry,
    adapter: FakeAdapter,
    error: OSError,
    reason: str,
) -> None:
    """A clip that cannot be written says whether storage is full or unreachable."""
    manager = await start(hass, local_entry, adapter)
    adapter.events = [clip_event("a")]
    adapter.media["a"] = (b"v", EventMediaKind.CLIP)

    with patch(
        "homeassistant.components.camera_recording.manager._write_file",
        side_effect=error,
    ):
        await manager._async_event_clip_tick()

    (row,) = manager.events_between(CAMERA, 0, 4_000_000_000)
    assert (row["state"], row["reason"]) == ("none", reason)
    assert manager.segments[CAMERA] == {}
    await manager.async_stop()


@pytest.mark.usefixtures("no_ffmpeg")
async def test_recording_off_is_explained_without_a_warning(
    hass: HomeAssistant,
    local_entry: MockConfigEntry,
    adapter: FakeAdapter,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """An event heard while the camera is off has the reason that recording was off."""
    manager = await start(hass, local_entry, adapter)
    await manager.async_set_paused(CAMERA, True)
    with patch.object(manager, "_camera_for_device", return_value=CAMERA):
        manager._provider_event(
            type("E", (), {"data": {"device_id": "d", "timestamp": None}})()  # type: ignore[arg-type]
        )

    (row,) = manager.events_between(CAMERA, 0, 4_000_000_000)
    assert (row["state"], row["reason"]) == ("none", "recording_off")
    assert "No clip kept" not in caplog.text
    await manager.async_stop()


@pytest.mark.usefixtures("no_ffmpeg")
async def test_two_reports_of_one_event_are_one_record(
    hass: HomeAssistant, local_entry: MockConfigEntry, adapter: FakeAdapter
) -> None:
    """The integration's event and its media list name one event once."""
    manager = await start(hass, local_entry, adapter)
    event = clip_event("a")
    with patch.object(manager, "_camera_for_device", return_value=CAMERA):
        manager._provider_event(
            type(
                "E",
                (),
                {
                    "data": {
                        "device_id": "d",
                        "timestamp": dt_util.utc_from_timestamp(
                            event.timestamp + 4
                        ).isoformat(),
                    }
                },
            )()  # type: ignore[arg-type]
        )
    adapter.events = [event]
    adapter.media["a"] = (b"v", EventMediaKind.CLIP)

    await manager._async_event_clip_tick()

    rows = manager.events_between(CAMERA, 0, 4_000_000_000)
    assert len(rows) == 1
    assert rows[0]["state"] == "saved"
    await manager.async_stop()


@pytest.mark.usefixtures("no_ffmpeg")
async def test_removed_for_space_and_restart(
    hass: HomeAssistant, local_entry: MockConfigEntry, adapter: FakeAdapter
) -> None:
    """A clip removed to make room says so, and what is known survives a restart."""
    manager = await start(hass, local_entry, adapter)
    adapter.events = [clip_event("a")]
    adapter.media["a"] = (b"v" * 50, EventMediaKind.CLIP)
    await manager._async_event_clip_tick()
    manager.max_bytes = 10

    await manager.async_apply_limits()

    (row,) = manager.events_between(CAMERA, 0, 4_000_000_000)
    assert (row["state"], row["reason"]) == ("none", "removed")
    await manager.async_stop()

    again = RecordingManager(hass, local_entry)
    await again.async_start()
    (row,) = again.events_between(CAMERA, 0, 4_000_000_000)
    assert (row["state"], row["reason"]) == ("none", "removed")
    await again.async_stop()


@pytest.mark.parametrize(
    ("error", "reason"),
    [
        (TimeoutError(), ClipReason.TIMED_OUT),
        (RuntimeError("HTTP 429"), ClipReason.RATE_LIMITED),
        (RuntimeError("RESOURCE_EXHAUSTED"), ClipReason.RATE_LIMITED),
        (OSError(errno.ENOSPC, "full"), ClipReason.STORAGE_FULL),
        (RuntimeError("boom"), ClipReason.FAILED),
    ],
)
def test_classify_error(error: Exception, reason: ClipReason) -> None:
    """Errors become reason codes from their kind and well-known words only."""
    assert classify_error(error) is reason
    assert ClipState.NONE.value == "none"


@pytest.mark.usefixtures("no_ffmpeg")
async def test_timeline_gets_events_and_camera_summary(
    hass: HomeAssistant,
    local_entry: MockConfigEntry,
    adapter: FakeAdapter,
    hass_ws_client: WebSocketGenerator,
) -> None:
    """The timeline command returns what became of each event and the camera's recording status."""
    await setup_entry(hass, local_entry)
    manager = local_entry.runtime_data
    manager.recorders[CAMERA].no_source = True
    adapter.events = [clip_event("a")]
    adapter.media["a"] = (b"v", EventMediaKind.CLIP)
    with patch(
        "homeassistant.components.camera_recording.manager.async_event_media_for",
        return_value=EventMediaSupport(adapter, "fake"),
    ):
        await manager._async_event_clip_tick()

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
    result = (await client.receive_json())["result"]

    assert [event["state"] for event in result["events"]] == ["saved"]
    assert result["camera"]["all_day_available"] is False
    assert result["camera"]["kept_today"] == 1
    assert "entry_id" in result["camera"]
