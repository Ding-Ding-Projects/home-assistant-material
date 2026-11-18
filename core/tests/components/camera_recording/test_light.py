"""Tests for the recording amount: Light planning, event clips and the waits."""

from datetime import timedelta
import os
from pathlib import Path
from unittest.mock import AsyncMock, patch

from freezegun.api import FrozenDateTimeFactory
import pytest
from pytest_homeassistant.common import MockConfigEntry

from homeassistant.components.camera_recording.backoff import (
    is_rate_limited,
    wait_for_attempt,
)
from homeassistant.components.camera_recording.const import (
    BUFFER_SEGMENT_SECONDS,
    DOMAIN,
    MODE_ALL_DAY,
    MODE_LIGHT,
    MODE_OFF,
    RATE_LIMIT_WAIT_SECONDS,
    SEGMENT_TIME_FORMAT,
    SOURCE_INTEGRATION,
)
from homeassistant.components.camera_recording.event_media import (
    EventMedia,
    EventMediaAdapter,
    EventMediaKind,
    EventMediaSupport,
)
from homeassistant.components.camera_recording.light import LightPlanner
from homeassistant.components.camera_recording.manager import (
    ModeError,
    RecordingManager,
    event_file_name,
)
from homeassistant.components.camera_recording.recorder import (
    CameraRecorder,
    RecorderState,
)
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .conftest import CAMERA, write_segment

SENSOR = "binary_sensor.front_door_motion"


def test_pre_and_post_seconds() -> None:
    """A thing seen from 100 to 110 keeps 10 s before and 30 s after."""
    planner = LightPlanner(pre=10, post=30)
    planner.start(SENSOR, 100, now=100)
    planner.stop(SENSOR, 110)
    [kept] = planner.ranges(now=200)
    assert (kept.start, kept.end) == (90, 140)
    assert planner.claims(60, 89, now=200) is False
    assert planner.claims(85, 95, now=200) is True
    assert planner.claims(139, 150, now=200) is True
    assert planner.claims(141, 150, now=200) is False


def test_ongoing_event_keeps_following_the_clock() -> None:
    """While something is still seen, the kept stretch grows with the clock."""
    planner = LightPlanner(pre=10, post=30)
    planner.start(SENSOR, 100, now=100)
    assert planner.ranges(now=130)[0].end == 160
    assert planner.ranges(now=200)[0].end == 230


def test_adjacent_events_merge_into_one_clip() -> None:
    """Back-to-back events make one clip, and only the first starts a new one."""
    planner = LightPlanner(pre=10, post=30)
    assert planner.moment(100, now=100) is True
    assert planner.moment(125, now=125) is False
    assert planner.moment(400, now=400) is True
    ranges = planner.ranges(now=500)
    assert [(item.start, item.end) for item in ranges] == [(90, 155), (390, 430)]


def test_clip_cap_stops_a_camera_that_never_stops() -> None:
    """A camera that always sees something is cut at the cap, not recorded all day."""
    planner = LightPlanner(pre=10, post=30, max_clip=600)
    planner.start(SENSOR, 100, now=100)
    [kept] = planner.ranges(now=5000)
    assert kept.capped is True
    assert kept.end - kept.start == 600
    assert planner.cap_hit_at == 5000
    assert planner.moment(300, now=5000) is False
    assert len(planner.ranges(now=5000)) == 1
    planner.stop(SENSOR, 5000)
    assert planner.moment(6000, now=6000) is True
    assert len(planner.ranges(now=6000)) == 2


def test_waits_grow_and_stop_at_the_last_step() -> None:
    """Each wait is longer than the last, up to a cap."""
    waits = [wait_for_attempt(n, RATE_LIMIT_WAIT_SECONDS) for n in range(7)]
    assert waits == [60, 120, 300, 600, 600, 600, 600]


@pytest.mark.parametrize(
    ("text", "limited"),
    [
        (
            "Failed to start the WebRTC stream: Nest API error: Too Many Requests "
            "response from API (429): RESOURCE_EXHAUSTED (429): Rate limited",
            True,
        ),
        ("HTTP 429", True),
        ("quota exceeded for this user", True),
        ("The camera is offline", False),
        (None, False),
    ],
)
def test_rate_limit_detection(text: str | None, limited: bool) -> None:
    """Several wordings of a refusal for too many requests are recognised."""
    assert is_rate_limited(text) is limited


async def test_recorder_waits_longer_after_each_refusal(hass: HomeAssistant) -> None:
    """After a refusal the recorder does not ask again in a tight loop."""
    delays: list[float] = []
    recorder = CameraRecorder(hass, CAMERA, Path("/tmp/none"), 300, lambda: None)

    async def fake_sleep(seconds: float) -> None:
        delays.append(seconds)
        if len(delays) == 5:
            recorder._stopping = True

    with (
        patch(
            "homeassistant.components.camera_recording.recorder.async_get_stream_source",
            AsyncMock(side_effect=HomeAssistantError("429 RESOURCE_EXHAUSTED")),
        ) as asked,
        patch(
            "homeassistant.components.camera_recording.recorder.asyncio.sleep",
            fake_sleep,
        ),
    ):
        await recorder._run()

    assert delays == [60, 120, 300, 600, 600]
    assert asked.await_count == 5
    assert recorder.state is RecorderState.LIMITED


async def test_recorder_without_a_source_is_marked_provider_only(
    hass: HomeAssistant,
) -> None:
    """A camera that gives no stream address is reported as having none."""
    delays: list[float] = []
    recorder = CameraRecorder(hass, CAMERA, Path("/tmp/none"), 300, lambda: None)

    async def fake_sleep(seconds: float) -> None:
        delays.append(seconds)
        recorder._stopping = True

    with (
        patch(
            "homeassistant.components.camera_recording.recorder.async_get_stream_source",
            AsyncMock(return_value=None),
        ),
        patch(
            "homeassistant.components.camera_recording.recorder.asyncio.sleep",
            fake_sleep,
        ),
    ):
        await recorder._run()

    assert recorder.no_source is True
    assert recorder.state is RecorderState.NO_STREAM
    assert delays == [60]


async def start_manager(
    hass: HomeAssistant, entry: MockConfigEntry
) -> RecordingManager:
    """Start a manager without ffmpeg for an entry that is already added."""
    entry.add_to_hass(hass)
    manager = RecordingManager(hass, entry)
    await manager.async_start()
    return manager


def buffer_name(seconds_ago: float) -> str:
    """A buffer file name that started some seconds ago."""
    start = dt_util.utcnow() - timedelta(seconds=seconds_ago)
    return start.strftime(SEGMENT_TIME_FORMAT) + ".mp4"


def age_file(path: Path, seconds_ago: float) -> None:
    """Make a file look like it was last written some seconds ago."""
    moment = (dt_util.utcnow() - timedelta(seconds=seconds_ago)).timestamp()
    os.utime(path, (moment, moment))


@pytest.mark.usefixtures("no_ffmpeg")
async def test_old_settings_read_as_all_day(
    hass: HomeAssistant, local_entry: MockConfigEntry
) -> None:
    """Storage written before amounts existed gives every camera All day."""
    local_entry.add_to_hass(hass)
    store = Store(hass, 1, f"{DOMAIN}.{local_entry.entry_id}")
    await store.async_save({"paused": [], "cameras": {}})
    manager = RecordingManager(hass, local_entry)
    await manager.async_start()
    assert manager.modes[CAMERA].mode == MODE_ALL_DAY
    assert manager.effective_mode(CAMERA) == (MODE_ALL_DAY, None)
    status = manager.status()["cameras"][0]
    assert status["mode"] == MODE_ALL_DAY
    await manager.async_stop()


@pytest.mark.usefixtures("no_ffmpeg")
async def test_new_camera_gets_the_default_amount(
    hass: HomeAssistant, local_entry: MockConfigEntry
) -> None:
    """A camera added after amounts existed starts with the default, not All day."""
    entry = MockConfigEntry(
        domain=DOMAIN,
        title=local_entry.title,
        data=dict(local_entry.data),
        options={**local_entry.options, "default_mode": MODE_LIGHT},
    )
    entry.add_to_hass(hass)
    store = Store(hass, 1, f"{DOMAIN}.{entry.entry_id}")
    await store.async_save({"paused": [], "cameras": {}, "known": []})
    manager = RecordingManager(hass, entry)
    await manager.async_start()
    assert manager.modes[CAMERA].mode == MODE_LIGHT
    await manager.async_stop()


@pytest.mark.usefixtures("no_ffmpeg")
async def test_mode_is_stored_and_survives_restart(
    hass: HomeAssistant, local_entry: MockConfigEntry
) -> None:
    """The amount, the seconds and the sources are kept; Off is the pause."""
    manager = await start_manager(hass, local_entry)
    await manager.async_set_mode(CAMERA, MODE_LIGHT, pre=5, post=20, sources=[SENSOR])
    await manager.async_stop()

    again = RecordingManager(hass, local_entry)
    await again.async_start()
    mode = again.modes[CAMERA]
    assert (mode.mode, mode.pre, mode.post, mode.sources) == (
        MODE_LIGHT,
        5,
        20,
        [SENSOR],
    )
    await again.async_set_mode(CAMERA, MODE_OFF)
    assert again.effective_mode(CAMERA) == (MODE_OFF, None)
    assert CAMERA in again.paused
    await again.async_set_mode(CAMERA, MODE_ALL_DAY)
    assert CAMERA not in again.paused
    assert [row[1] for row in again.mode_history[CAMERA]][-3:] == [
        MODE_LIGHT,
        MODE_OFF,
        MODE_ALL_DAY,
    ]
    await again.async_stop()


@pytest.mark.usefixtures("no_ffmpeg")
async def test_light_is_refused_without_an_event_source(
    hass: HomeAssistant, local_entry: MockConfigEntry
) -> None:
    """A camera with nothing that tells an event keeps All day and says why."""
    manager = await start_manager(hass, local_entry)
    with pytest.raises(ModeError) as error:
        await manager.async_set_mode(CAMERA, MODE_LIGHT)
    assert error.value.code == "no_event_source"
    assert manager.modes[CAMERA].mode == MODE_ALL_DAY
    status = manager.status()["cameras"][0]
    assert status["light_possible"] is False
    assert status["light_reason"] == "no_event_source"
    await manager.async_stop()


@pytest.mark.usefixtures("no_ffmpeg")
async def test_light_keeps_claimed_files_and_removes_the_rest(
    hass: HomeAssistant,
    local_entry: MockConfigEntry,
    freezer: FrozenDateTimeFactory,
) -> None:
    """Only buffer files around a seen moment are kept, the older ones are removed."""
    manager = await start_manager(hass, local_entry)
    await manager.async_set_mode(CAMERA, MODE_LIGHT, pre=10, post=30, sources=[SENSOR])
    buffer = manager.buffer_folder(CAMERA)
    assert manager.recorders[CAMERA].folder == buffer
    assert manager.recorders[CAMERA].segment_seconds == BUFFER_SEGMENT_SECONDS

    stale = write_segment(buffer, buffer_name(200))
    age_file(stale, 190)
    around = write_segment(buffer, buffer_name(15))
    age_file(around, 5)
    write_segment(buffer, buffer_name(4))
    hass.states.async_set(SENSOR, "off")
    await hass.async_block_till_done()
    hass.states.async_set(SENSOR, "on")
    await hass.async_block_till_done()

    freezer.tick(5)
    await manager._async_light_tick()

    assert not stale.exists()
    assert not around.exists()
    assert around.name in manager.segments[CAMERA]
    assert (manager.folder(CAMERA) / around.name).exists()
    assert stale.name not in manager.segments[CAMERA]
    status = manager.status()["cameras"][0]
    assert status["events_today"] == 1
    assert status["effective_mode"] == MODE_LIGHT
    assert status["bytes_today"] == 100
    await manager.async_stop()


@pytest.mark.usefixtures("no_ffmpeg")
async def test_leaving_light_keeps_what_was_recorded(
    hass: HomeAssistant, local_entry: MockConfigEntry
) -> None:
    """Changing from Light to All day removes the buffer but never a kept recording."""
    manager = await start_manager(hass, local_entry)
    kept = write_segment(manager.folder(CAMERA), buffer_name(900))
    await manager._async_scan()
    await manager.async_set_mode(CAMERA, MODE_LIGHT, sources=[SENSOR])
    write_segment(manager.buffer_folder(CAMERA), buffer_name(30))
    await manager.async_set_mode(CAMERA, MODE_ALL_DAY)
    assert kept.exists()
    assert kept.name in manager.segments[CAMERA]
    assert not manager.buffer_folder(CAMERA).exists()
    await manager.async_stop()


class FakeAdapter(EventMediaAdapter):
    """Event media held in memory."""

    def __init__(self, events: dict[str, tuple[float, bytes, EventMediaKind]]) -> None:
        """Keep the events by token."""
        self.events = events

    async def async_list(self) -> list[EventMedia]:
        """Every event."""
        return [
            EventMedia(token, ts, kind, ("motion",))
            for token, (ts, _data, kind) in self.events.items()
        ]

    async def async_fetch(self, token: str) -> tuple[bytes, EventMediaKind] | None:
        """The bytes of one event."""
        if token not in self.events:
            return None
        _ts, data, kind = self.events[token]
        return data, kind


@pytest.mark.usefixtures("no_ffmpeg")
async def test_provider_only_camera_keeps_event_clips(
    hass: HomeAssistant, local_entry: MockConfigEntry
) -> None:
    """A camera with no stream keeps its integration's clips, once each, as Light."""
    now = dt_util.utcnow().timestamp()
    adapter = FakeAdapter(
        {
            "a": (now - 600, b"c" * 500, EventMediaKind.CLIP),
            "b": (now - 300, b"i" * 40, EventMediaKind.IMAGE),
        }
    )
    support = EventMediaSupport(adapter, "nest")
    with patch(
        "homeassistant.components.camera_recording.manager.async_event_media_for",
        return_value=support,
    ):
        manager = await start_manager(hass, local_entry)
        manager.recorders[CAMERA].no_source = True

        assert manager.effective_mode(CAMERA) == (MODE_LIGHT, "provider_only")
        status = manager.status()["cameras"][0]
        assert status["provider_only"] is True
        assert status["continuous_possible"] is False
        assert status["light_possible"] is True

        await manager._async_event_clip_tick()
        await manager._async_event_clip_tick()

        segments = manager.segments[CAMERA]
        names = {
            event_file_name(now - 600, EventMediaKind.CLIP),
            event_file_name(now - 300, EventMediaKind.IMAGE),
        }
        assert set(segments) == names
        assert {seg.kind for seg in segments.values()} == {"event_clip", "event_image"}
        assert sum(seg.size for seg in segments.values()) == 540
        status = manager.status()["cameras"][0]
        assert manager.status()["used_bytes"] == 540
        assert status["events_today"] == 2
        for name in names:
            assert (manager.folder(CAMERA) / name).is_file()
        await manager.async_stop()


@pytest.mark.usefixtures("no_ffmpeg")
async def test_event_clips_follow_the_keep_limits(
    hass: HomeAssistant, local_entry: MockConfigEntry
) -> None:
    """Event clips older than the age limit are not kept, and are removed later."""
    now = dt_util.utcnow().timestamp()
    adapter = FakeAdapter(
        {
            "old": (now - 20 * 86400, b"o" * 10, EventMediaKind.CLIP),
            "new": (now - 60, b"n" * 10, EventMediaKind.CLIP),
        }
    )
    with patch(
        "homeassistant.components.camera_recording.manager.async_event_media_for",
        return_value=EventMediaSupport(adapter, "nest"),
    ):
        manager = await start_manager(hass, local_entry)
        manager.recorders[CAMERA].no_source = True
        await manager._async_event_clip_tick()
        assert list(manager.segments[CAMERA]) == [
            event_file_name(now - 60, EventMediaKind.CLIP)
        ]
        manager.keep_days = 0
        await manager.async_apply_limits()
        assert manager.segments[CAMERA] == {}
        await manager.async_stop()


@pytest.mark.usefixtures("no_ffmpeg")
async def test_integration_source_is_offered_with_event_media(
    hass: HomeAssistant, local_entry: MockConfigEntry
) -> None:
    """The integration's own events count as a source when it keeps event media."""
    support = EventMediaSupport(FakeAdapter({}), "nest")
    with (
        patch(
            "homeassistant.components.camera_recording.light.async_event_media_for",
            return_value=support,
        ),
        patch(
            "homeassistant.components.camera_recording.manager.async_event_media_for",
            return_value=support,
        ),
    ):
        manager = await start_manager(hass, local_entry)
        status = manager.status()["cameras"][0]
        assert [opt["source"] for opt in status["source_options"]] == [
            SOURCE_INTEGRATION
        ]
        await manager.async_set_mode(CAMERA, MODE_LIGHT)
        assert manager.modes[CAMERA].mode == MODE_LIGHT
        await manager.async_stop()
