"""Tests for the hard cases of live clips, the event reports they start from, and the recording check."""

import asyncio
from collections.abc import Awaitable, Callable
from datetime import timedelta
from pathlib import Path
from unittest.mock import AsyncMock, patch

from freezegun.api import FrozenDateTimeFactory
from google_nest_sdm.event import EventMessage
import pytest
from pytest_homeassistant.common import MockConfigEntry
from pytest_homeassistant.typing import WebSocketGenerator

from homeassistant.components.camera_recording.event_media import EventMediaSupport
from homeassistant.components.camera_recording.events import (
    GIVE_UP_SECONDS,
    ClipReason,
    ClipState,
    EventRecord,
    event_time,
)
from homeassistant.components.camera_recording.manager import RecordingManager
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr, entity_registry as er
from homeassistant.util import dt as dt_util

from .conftest import CAMERA
from .test_event_clips import FakeAdapter
from .test_init import setup_entry
from .test_live import FakeGo2rtc, live_manager, open_event

PROVIDER_DEVICE = "enterprises/project-id/devices/device-id"


@pytest.fixture
def go2rtc() -> FakeGo2rtc:
    """The fake program."""
    return FakeGo2rtc()


def records(manager: RecordingManager) -> list[EventRecord]:
    """Every event record of the camera, oldest first."""
    return manager.ledger[CAMERA]


def recording(
    length: float | None, content: bytes = b"c" * 900
) -> tuple[Callable[..., Awaitable[bool]], AsyncMock]:
    """A stand-in for ffmpeg writing a file, and a stand-in for the length probe."""
    calls: list[int] = []

    async def record(binary: str, source: str, output: Path, seconds: int) -> bool:
        calls.append(seconds)
        output.write_bytes(content)
        return True

    record.calls = calls  # type: ignore[attr-defined]
    return record, AsyncMock(return_value=length)


async def run_clip(
    manager: RecordingManager,
    record: EventRecord,
    length: float | None,
    content: bytes = b"c" * 900,
) -> None:
    """Run one live clip with ffmpeg and the probe stood in for."""
    writer, _probe = recording(length, content)
    manager.live_active[CAMERA] = record
    with (
        patch(
            "homeassistant.components.camera_recording.manager.async_record_clip",
            writer,
        ),
        patch(
            "homeassistant.components.camera_recording.manager.probe_duration",
            return_value=length,
        ),
    ):
        await manager._async_live_clip(CAMERA, record)


@pytest.mark.usefixtures("no_ffmpeg")
async def test_clip_cut_short_is_kept_and_says_so(
    hass: HomeAssistant, local_entry: MockConfigEntry, go2rtc: FakeGo2rtc
) -> None:
    """Video that stops after 15 of 40 seconds is kept, and the row says it was cut short."""
    manager = await live_manager(hass, local_entry, go2rtc)
    record = open_event(manager)
    await run_clip(manager, record, 15.2)
    assert (record.state, record.cut_short) == (ClipState.SAVED, True)
    assert record.duration == pytest.approx(15.2)
    row = manager.events_between(CAMERA, 0, 4_000_000_000)[0]
    assert row["cut_short"] is True
    assert go2rtc.removed

    full = open_event(manager, 200)
    await run_clip(manager, full, 39.5)
    assert (full.state, full.cut_short) == (ClipState.SAVED, False)
    await manager.async_stop()


@pytest.mark.usefixtures("no_ffmpeg")
async def test_clip_too_short_to_keep_has_a_plain_reason(
    hass: HomeAssistant, local_entry: MockConfigEntry, go2rtc: FakeGo2rtc
) -> None:
    """Video that stops after a second or two is not kept, and the reason is plain."""
    manager = await live_manager(hass, local_entry, go2rtc)
    record = open_event(manager)
    await run_clip(manager, record, 1.4)
    assert (record.state, record.reason) == (ClipState.NONE, ClipReason.STREAM_ENDED)
    assert not list(manager.folder(CAMERA).glob("*.mp4"))
    assert not list(manager.folder(CAMERA).glob(".*.part"))
    await manager.async_stop()


@pytest.mark.usefixtures("no_ffmpeg")
async def test_close_events_share_one_session(
    hass: HomeAssistant, local_entry: MockConfigEntry, go2rtc: FakeGo2rtc
) -> None:
    """Two events 5 seconds apart are one event; one inside the clip's time shares the clip."""
    manager = await live_manager(hass, local_entry, go2rtc)
    started: list[EventRecord] = []
    release = asyncio.Event()

    async def hold(
        self: RecordingManager, cam: str, record: EventRecord, seconds: int
    ) -> None:
        started.append(record)
        await release.wait()
        self.live_active.pop(cam, None)
        self._live_saved(cam, record, "clip.mp4", 10, 40.0, seconds)
        for item in self.live_covered.pop(cam, []):
            self._share_clip(item, record)

    now = dt_util.utcnow().timestamp()
    with patch.object(RecordingManager, "_async_live_clip", hold):
        manager._heard(CAMERA, now - 10, "doorbell_chime")
        manager._heard(CAMERA, now - 5, "camera_person")
        await asyncio.sleep(0)
        assert len(records(manager)) == 1
        assert len(started) == 1

        # 35 seconds after the first event, inside its 40 second clip.
        later = manager._open_record(CAMERA, now + 25)
        manager._start_live(CAMERA, later)
        assert manager.live_covered[CAMERA] == [later]

        release.set()
        await asyncio.sleep(0)
        await asyncio.sleep(0)
    assert len(started) == 1
    assert [r.state for r in records(manager)] == [ClipState.SAVED, ClipState.SAVED]
    assert records(manager)[1].name == records(manager)[0].name
    await manager.async_stop()


@pytest.mark.usefixtures("no_ffmpeg")
async def test_event_after_the_clip_waits_its_turn(
    hass: HomeAssistant, local_entry: MockConfigEntry, go2rtc: FakeGo2rtc
) -> None:
    """An event after the running clip's time is recorded next; a third is left to the service."""
    manager = await live_manager(hass, local_entry, go2rtc)
    started: list[EventRecord] = []
    release = asyncio.Event()

    async def hold(
        self: RecordingManager, cam: str, record: EventRecord, seconds: int
    ) -> None:
        started.append(record)
        await release.wait()
        self.live_active.pop(cam, None)

    with patch.object(RecordingManager, "_async_live_clip", hold):
        first = open_event(manager, 100)
        manager._start_live(CAMERA, first)
        await asyncio.sleep(0)
        second = open_event(manager, 50)
        manager._start_live(CAMERA, second)
        third = open_event(manager, 10)
        manager._start_live(CAMERA, third)
        assert manager.live_waiting[CAMERA] is second
        # No service clip can come for this camera, so the reason is given now.
        assert (third.state, third.reason) == (
            ClipState.NONE,
            ClipReason.CAMERA_BUSY,
        )

        release.set()
        for _ in range(4):
            await asyncio.sleep(0)
    assert started == [first, second]
    assert CAMERA not in manager.live_waiting
    await manager.async_stop()


@pytest.mark.usefixtures("no_ffmpeg")
async def test_hourly_budget_reached(
    hass: HomeAssistant,
    local_entry: MockConfigEntry,
    go2rtc: FakeGo2rtc,
    freezer: FrozenDateTimeFactory,
) -> None:
    """When the hourly budget is spent no session starts, and the row says why."""
    manager = await live_manager(hass, local_entry, go2rtc)
    await manager.async_set_live_options(CAMERA, clips_per_hour=1)
    started: list[EventRecord] = []

    async def done(
        self: RecordingManager, cam: str, record: EventRecord, seconds: int
    ) -> None:
        started.append(record)
        self.live_active.pop(cam, None)

    with patch.object(RecordingManager, "_async_live_clip", done):
        manager._start_live(CAMERA, open_event(manager, 300))
        await asyncio.sleep(0)
        over = open_event(manager, 5)
        manager._start_live(CAMERA, over)
    assert len(started) == 1
    assert (over.state, over.reason) == (ClipState.NONE, ClipReason.HOURLY_LIMIT)
    assert manager.status()["cameras"][0]["check"]["clips_left"] == 0

    # With the service's own clips, the event waits for that clip first.
    adapter = FakeAdapter()
    patcher = patch(
        "homeassistant.components.camera_recording.manager.async_event_media_for",
        return_value=EventMediaSupport(adapter, "fake"),
    )
    patcher.start()
    manager._unsubs.append(patcher.stop)
    waiting = open_event(manager, 100)
    manager._start_live(CAMERA, waiting)
    assert (waiting.state, waiting.skip) == (
        ClipState.SAVING,
        ClipReason.HOURLY_LIMIT,
    )
    freezer.tick(GIVE_UP_SECONDS + 5)
    await manager._async_event_clip_tick()
    assert (waiting.state, waiting.reason) == (
        ClipState.NONE,
        ClipReason.HOURLY_LIMIT,
    )
    await manager.async_stop()


class ViewedCamera:
    """A camera with a live view open in a browser."""

    def __init__(self) -> None:
        """One open viewer session."""
        self._webrtc_sessions = {"browser-session": object()}
        self.closed: list[str] = []

    def close_webrtc_session(self, session_id: str) -> None:
        """Remember what was closed."""
        self.closed.append(session_id)


@pytest.mark.usefixtures("no_ffmpeg")
async def test_open_browser_view_is_not_doubled(
    hass: HomeAssistant, local_entry: MockConfigEntry, go2rtc: FakeGo2rtc
) -> None:
    """While a browser shows the camera live, no second provider session is opened."""
    manager = await live_manager(hass, local_entry, go2rtc)
    camera = ViewedCamera()
    component = type("Component", (), {"get_entity": lambda self, _id: camera})()
    hass.data["camera"] = component
    record = open_event(manager)
    manager.live_active[CAMERA] = record
    manager.live_starts[CAMERA] = [dt_util.utcnow().timestamp()]
    with (
        patch(
            "homeassistant.components.camera_recording.manager.LIVE_BUSY_WAIT_SECONDS",
            0,
        ),
        patch(
            "homeassistant.components.camera_recording.manager.async_record_clip"
        ) as ffmpeg,
    ):
        await manager._async_live_clip(CAMERA, record)
    ffmpeg.assert_not_called()
    assert go2rtc.added == []
    assert camera.closed == []
    assert (record.state, record.reason) == (ClipState.NONE, ClipReason.CAMERA_BUSY)
    # The start that was not used goes back to this hour's budget.
    assert manager.live_starts[CAMERA] == []

    camera._webrtc_sessions.clear()
    second = open_event(manager, 100)
    await run_clip(manager, second, 39.0)
    assert second.state is ClipState.SAVED
    hass.data.pop("camera")
    await manager.async_stop()


def test_event_time_reads_every_form() -> None:
    """The integration's datetime, an ISO text, a naive time, and nonsense."""
    now = 2_000_000_000.0
    aware = dt_util.utc_from_timestamp(now - 30)
    assert event_time(aware, now) == pytest.approx(now - 30)
    assert event_time(aware.isoformat(), now) == pytest.approx(now - 30)
    assert event_time(aware.replace(tzinfo=None), now) == pytest.approx(now - 30)
    assert event_time(dt_util.utc_from_timestamp(now + 60), now) == now
    assert event_time("not a time", now) == now
    assert event_time(None, now) == now


async def provider_camera(
    hass: HomeAssistant,
    device_registry: dr.DeviceRegistry,
    entity_registry: er.EntityRegistry,
) -> dr.DeviceEntry:
    """A device of the provider integration with the recorded camera and an event entity on it."""
    provider_entry = MockConfigEntry(domain="nest")
    provider_entry.add_to_hass(hass)
    device = device_registry.async_get_or_create(
        config_entry_id=provider_entry.entry_id,
        identifiers={("nest", PROVIDER_DEVICE)},
    )
    entity_registry.async_get_or_create(
        "camera",
        "nest",
        f"{PROVIDER_DEVICE}-camera",
        device_id=device.id,
        suggested_object_id="front_door",
    )
    entity_registry.async_get_or_create(
        "event",
        "nest",
        f"{PROVIDER_DEVICE}-chime",
        device_id=device.id,
        suggested_object_id="front_door_chime",
    )
    return device


@pytest.mark.usefixtures("no_ffmpeg")
async def test_provider_bus_event_in_its_exact_shape(
    hass: HomeAssistant,
    local_entry: MockConfigEntry,
    go2rtc: FakeGo2rtc,
    device_registry: dr.DeviceRegistry,
    entity_registry: er.EntityRegistry,
) -> None:
    """The provider integration's own code fires the event that starts a clip."""
    from homeassistant.components.nest import SignalUpdateCallback  # noqa: PLC0415

    device = await provider_camera(hass, device_registry, entity_registry)
    manager = await live_manager(hass, local_entry, go2rtc)
    starts: list[EventRecord] = []

    async def note(
        self: RecordingManager, cam: str, record: EventRecord, seconds: int
    ) -> None:
        starts.append(record)
        self.live_active.pop(cam, None)

    when = dt_util.utcnow().replace(microsecond=0) - timedelta(seconds=3)
    message = EventMessage.create_event(
        {
            "eventId": "some-event-id",
            "timestamp": when.isoformat(timespec="seconds"),
            "resourceUpdate": {
                "name": PROVIDER_DEVICE,
                "events": {
                    "sdm.devices.events.DoorbellChime.Chime": {
                        "eventSessionId": "session-id",
                        "eventId": "event-id",
                    }
                },
            },
        },
        auth=None,  # type: ignore[arg-type]
    )
    provider_entry = hass.config_entries.async_entries("nest")[0]
    provider_entry.runtime_data = None
    callback = SignalUpdateCallback(hass, provider_entry)
    with patch.object(RecordingManager, "_async_live_clip", note):
        await callback.async_handle_event(message)
        await hass.async_block_till_done()

    assert device.id
    (record,) = records(manager)
    assert record.start == pytest.approx(when.timestamp())
    assert starts == [record]
    check = manager.status()["cameras"][0]["check"]
    assert check["last_event"] == {
        "at": pytest.approx(when.timestamp()),
        "kind": "doorbell_chime",
    }
    await manager.async_stop()


@pytest.mark.usefixtures("no_ffmpeg")
async def test_event_entity_is_a_second_source(
    hass: HomeAssistant,
    local_entry: MockConfigEntry,
    go2rtc: FakeGo2rtc,
    device_registry: dr.DeviceRegistry,
    entity_registry: er.EntityRegistry,
) -> None:
    """A missed bus event is caught by the camera's event entity, and both reports are one event."""
    await provider_camera(hass, device_registry, entity_registry)
    manager = await live_manager(hass, local_entry, go2rtc)
    starts: list[EventRecord] = []

    async def note(
        self: RecordingManager, cam: str, record: EventRecord, seconds: int
    ) -> None:
        starts.append(record)
        self.live_active.pop(cam, None)
        record.state = ClipState.SAVED

    entity = "event.front_door_chime"
    old = (dt_util.utcnow() - timedelta(hours=2)).isoformat()
    with patch.object(RecordingManager, "_async_live_clip", note):
        # Its first state, as restored at start, is not an event.
        hass.states.async_set(entity, old, {"event_type": "doorbell_chime"})
        await hass.async_block_till_done()
        assert records(manager) == []

        when = dt_util.utcnow() - timedelta(seconds=2)
        hass.states.async_set(entity, when.isoformat(), {"event_type": "ring"})
        await hass.async_block_till_done()
        (record,) = records(manager)
        assert starts == [record]

        device_id = entity_registry.async_get(CAMERA).device_id
        hass.bus.async_fire(
            "nest_event",
            {"device_id": device_id, "type": "doorbell_chime", "timestamp": when},
        )
        await hass.async_block_till_done()
    assert len(records(manager)) == 1
    assert len(starts) == 1
    await manager.async_stop()


@pytest.mark.usefixtures("no_ffmpeg")
async def test_recording_check_and_test_clip(
    hass: HomeAssistant,
    local_entry: MockConfigEntry,
    go2rtc: FakeGo2rtc,
    hass_ws_client: WebSocketGenerator,
) -> None:
    """The check shows the route's parts, and the test button records one short clip."""
    await setup_entry(hass, local_entry)
    manager: RecordingManager = local_entry.runtime_data
    manager.recorders[CAMERA].no_source = True
    writer, _probe = recording(10.0)
    with (
        patch(
            "homeassistant.components.camera_recording.manager.async_go2rtc_access",
            side_effect=lambda hass: go2rtc.access(),
        ),
        patch(
            "homeassistant.components.camera_recording.manager.get_ffmpeg_manager",
            return_value=type("F", (), {"binary": "ffmpeg"})(),
        ),
        patch(
            "homeassistant.components.camera_recording.manager.whep_source",
            side_effect=lambda hass, token: f"webrtc:http://127.0.0.1:1/x/{token}",
        ),
        patch(
            "homeassistant.components.camera_recording.manager.async_record_clip",
            writer,
        ),
        patch(
            "homeassistant.components.camera_recording.manager.probe_duration",
            return_value=10.0,
        ),
    ):
        client = await hass_ws_client(hass)
        await client.send_json_auto_id({"type": "camera_recording/status"})
        check = (await client.receive_json())["result"][0]["cameras"][0]["check"]
        assert check["provider_only"] is True
        assert check["last_event"] is None
        assert check["last_test"] is None
        assert check["clips_left"] == 12

        await client.send_json_auto_id(
            {
                "type": "camera_recording/test_clip",
                "entry_id": local_entry.entry_id,
                "entity_id": CAMERA,
            }
        )
        result = (await client.receive_json())["result"]
    assert result["ok"] is True
    assert result["duration"] == pytest.approx(10.0)
    assert writer.calls == [10]  # type: ignore[attr-defined]
    check = manager.status()["cameras"][0]["check"]
    assert check["last_test"]["ok"] is True
    assert check["last_clip"]["origin"] == "home"
    assert check["clips_left"] == 11


@pytest.mark.usefixtures("no_ffmpeg")
async def test_test_clip_says_why_it_cannot_run(
    hass: HomeAssistant,
    local_entry: MockConfigEntry,
    hass_ws_client: WebSocketGenerator,
) -> None:
    """Without the streaming program the test answers with the reason and records nothing."""
    await setup_entry(hass, local_entry)
    manager: RecordingManager = local_entry.runtime_data
    manager.recorders[CAMERA].no_source = True
    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "camera_recording/test_clip",
            "entry_id": local_entry.entry_id,
            "entity_id": CAMERA,
        }
    )
    result = (await client.receive_json())["result"]
    assert (result["ok"], result["reason"]) == (False, "no_go2rtc")
    assert records(manager) == []


@pytest.mark.usefixtures("no_ffmpeg")
async def test_keep_days_setting_applies_without_restart(
    hass: HomeAssistant,
    local_entry: MockConfigEntry,
    hass_ws_client: WebSocketGenerator,
) -> None:
    """The keeping time is set in range, kept in the options, and applied in place."""
    await setup_entry(hass, local_entry)
    manager: RecordingManager = local_entry.runtime_data
    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "camera_recording/set_keep_days",
            "entry_id": local_entry.entry_id,
            "keep_days": 30,
        }
    )
    result = (await client.receive_json())["result"]
    await hass.async_block_till_done()
    assert result["keep_days"] == 30
    assert local_entry.options["keep_days"] == 30
    assert local_entry.runtime_data is manager

    for days in (0, 91):
        await client.send_json_auto_id(
            {
                "type": "camera_recording/set_keep_days",
                "entry_id": local_entry.entry_id,
                "keep_days": days,
            }
        )
        assert (await client.receive_json())["success"] is False


@pytest.mark.usefixtures("no_ffmpeg")
async def test_clip_removed_for_space_says_so(
    hass: HomeAssistant, local_entry: MockConfigEntry, go2rtc: FakeGo2rtc
) -> None:
    """A clip trimmed for space leaves its row saying it was removed to make room."""
    manager = await live_manager(hass, local_entry, go2rtc)
    old = open_event(manager, 600)
    await run_clip(manager, old, 39.0, b"o" * 2000)
    new = open_event(manager, 60)
    await run_clip(manager, new, 39.0, b"n" * 2000)
    manager.max_bytes = 2500
    await manager.async_apply_limits()
    assert (old.state, old.reason) == (ClipState.NONE, ClipReason.REMOVED)
    assert new.state is ClipState.SAVED
    await manager.async_stop()


def test_stored_records_read_old_and_new_forms() -> None:
    """Rows saved before the new fields read back, and the new fields survive a round trip."""
    old = EventRecord.from_list([1.0, "saved", None, "a.mp4", "clip", 40.0, 9])
    assert (old.cut_short, old.skip, old.origin) == (False, None, None)
    new = EventRecord(2.0, ClipState.NONE, ClipReason.HOURLY_LIMIT, cut_short=True)
    new.skip = ClipReason.HOURLY_LIMIT
    again = EventRecord.from_list(new.as_list())
    assert (again.cut_short, again.skip, again.reason) == (
        True,
        ClipReason.HOURLY_LIMIT,
        ClipReason.HOURLY_LIMIT,
    )
    unknown = EventRecord.from_list([1.0, "none", "a_future_reason", None, None, 0, 0])
    assert unknown.reason is ClipReason.FAILED
