"""Tests for live clips: the one-time address, the limits and the state changes."""

import asyncio
from collections.abc import Awaitable, Callable
from datetime import timedelta
import logging
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from freezegun.api import FrozenDateTimeFactory
import pytest
from pytest_homeassistant.common import MockConfigEntry
from pytest_homeassistant.typing import ClientSessionGenerator, WebSocketGenerator
from webrtc_models import RTCIceCandidateInit

from homeassistant.components.camera import (
    DATA_COMPONENT,
    Camera,
    CameraEntityFeature,
    WebRTCAnswer,
    WebRTCCandidate,
    WebRTCError,
    WebRTCSendMessage,
)
from homeassistant.components.camera_recording import live
from homeassistant.components.camera_recording.event_media import (
    EventMedia,
    EventMediaKind,
)
from homeassistant.components.camera_recording.events import (
    ClipReason,
    ClipState,
    EventRecord,
)
from homeassistant.components.camera_recording.live import (
    Go2RtcAccess,
    LiveSession,
    broker_for,
    merge_candidates,
    peer_is_loopback,
)
from homeassistant.components.camera_recording.manager import RecordingManager
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.setup import async_setup_component
from homeassistant.util import dt as dt_util

from .conftest import CAMERA
from .test_event_clips import FakeAdapter
from .test_init import setup_entry

ANSWER = (
    "v=0\r\no=- 1 1 IN IP4 192.0.2.9\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=mid:0\r\n"
)
SECRET = "429 Too Many Requests https://provider.example/live?token=abc123"

type Behaviour = Callable[[str, WebRTCSendMessage], Awaitable[None]]


class FakeCamera(Camera):
    """A camera whose service behaviour each test sets."""

    _attr_name = "Front door"
    _attr_supported_features = CameraEntityFeature.STREAM

    def __init__(self, behaviour: Behaviour) -> None:
        """Keep the behaviour."""
        super().__init__()
        self.behaviour = behaviour
        self.offers: list[str] = []
        self.closed: list[str] = []

    async def async_handle_async_webrtc_offer(
        self, offer_sdp: str, session_id: str, send_message: WebRTCSendMessage
    ) -> None:
        """Pass the offer to the behaviour."""
        self.offers.append(offer_sdp)
        await self.behaviour(session_id, send_message)

    async def async_on_webrtc_candidate(
        self, session_id: str, candidate: RTCIceCandidateInit
    ) -> None:
        """Candidates are not needed."""

    def close_webrtc_session(self, session_id: str) -> None:
        """Remember what was closed."""
        self.closed.append(session_id)


async def answer_with_candidate(session_id: str, send: WebRTCSendMessage) -> None:
    """A service that trickles one candidate and then answers."""
    send(
        WebRTCCandidate(
            RTCIceCandidateInit(
                "candidate:1 1 udp 1 203.0.113.5 4000 typ host",
                sdp_mid="0",
                sdp_m_line_index=0,
            )
        )
    )
    send(WebRTCAnswer(ANSWER))


async def add_camera(hass: HomeAssistant, behaviour: Behaviour) -> FakeCamera:
    """Set up the component and add the fake camera."""
    assert await async_setup_component(hass, "camera_recording", {})
    camera = FakeCamera(behaviour)
    await hass.data[DATA_COMPONENT].async_add_entities([camera])
    assert camera.entity_id == CAMERA
    return camera


def post(client, token: str, body: bytes = b"v=0\r\nm=video 9\r\n"):
    """Post an offer to the one-time address."""
    return client.post(
        f"/api/camera_recording/whep/{token}",
        data=body,
        headers={"Content-Type": "application/sdp"},
    )


async def test_answer_once_with_candidates(
    hass: HomeAssistant, hass_client_no_auth: ClientSessionGenerator
) -> None:
    """The offer reaches the camera, the answer carries the trickled candidate, and the id is spent."""
    camera = await add_camera(hass, answer_with_candidate)
    client = await hass_client_no_auth()
    session = broker_for(hass).mint(CAMERA)

    response = await post(client, session.token)

    assert response.status == 201
    assert response.content_type == "application/sdp"
    text = await response.text()
    assert "a=candidate:1 1 udp 1 203.0.113.5 4000 typ host" in text
    assert text.index("a=mid:0") < text.index("a=candidate:")
    assert len(camera.offers) == 1
    assert session.answered
    assert (await post(client, session.token)).status == 404
    assert len(camera.offers) == 1


async def test_refuses_other_callers_without_spending_the_id(
    hass: HomeAssistant, hass_client_no_auth: ClientSessionGenerator
) -> None:
    """A caller that is not on this computer, or is behind a proxy, learns nothing and burns nothing."""
    camera = await add_camera(hass, answer_with_candidate)
    client = await hass_client_no_auth()
    session = broker_for(hass).mint(CAMERA)

    with patch.object(live, "peer_is_loopback", return_value=False):
        assert (await post(client, session.token)).status == 403
    proxied = await client.post(
        f"/api/camera_recording/whep/{session.token}",
        data=b"v=0\r\n",
        headers={"X-Forwarded-For": "192.0.2.4"},
    )
    assert proxied.status in (400, 403)
    assert camera.offers == []

    assert (await post(client, session.token)).status == 201


async def test_expired_unknown_and_bad_requests(
    hass: HomeAssistant,
    hass_client_no_auth: ClientSessionGenerator,
    freezer: FrozenDateTimeFactory,
) -> None:
    """An expired id, an unknown id and a body that is not an offer all fail."""
    camera = await add_camera(hass, answer_with_candidate)
    client = await hass_client_no_auth()
    old = broker_for(hass).mint(CAMERA)
    freezer.tick(31)
    assert (await post(client, old.token)).status == 404
    assert (await post(client, "unknown")).status == 404

    fresh = broker_for(hass).mint(CAMERA)
    assert (await post(client, fresh.token, b"not an offer")).status == 400
    assert fresh.failure is ClipReason.FAILED
    assert camera.offers == []


@pytest.mark.parametrize(
    ("raises", "status", "reason"),
    [
        (HomeAssistantError(SECRET), 429, ClipReason.RATE_LIMITED),
        (HomeAssistantError("camera offline"), 502, ClipReason.FAILED),
    ],
)
async def test_refusal_is_classified_and_not_logged(
    hass: HomeAssistant,
    hass_client_no_auth: ClientSessionGenerator,
    caplog: pytest.LogCaptureFixture,
    raises: HomeAssistantError,
    status: int,
    reason: ClipReason,
) -> None:
    """A refused offer gives a reason code and nothing from the provider's text is logged."""

    async def refuse(session_id: str, send: WebRTCSendMessage) -> None:
        raise raises

    await add_camera(hass, refuse)
    client = await hass_client_no_auth()
    session = broker_for(hass).mint(CAMERA)

    response = await post(client, session.token)

    assert response.status == status
    assert session.failure is reason
    assert "abc123" not in caplog.text
    assert "provider.example" not in caplog.text


async def test_error_message_and_silence(
    hass: HomeAssistant, hass_client_no_auth: ClientSessionGenerator
) -> None:
    """An error message from the service and no answer at all are told apart."""

    async def error(session_id: str, send: WebRTCSendMessage) -> None:
        send(WebRTCError("failed", "too many requests"))

    async def silent(session_id: str, send: WebRTCSendMessage) -> None:
        return

    camera = await add_camera(hass, error)
    client = await hass_client_no_auth()
    first = broker_for(hass).mint(CAMERA)
    assert (await post(client, first.token)).status == 429
    assert first.failure is ClipReason.RATE_LIMITED

    camera.behaviour = silent
    second = broker_for(hass).mint(CAMERA)
    with patch.object(live, "LIVE_OFFER_TIMEOUT_SECONDS", 0.05):
        assert (await post(client, second.token)).status == 504
    assert second.failure is ClipReason.TIMED_OUT


def test_merge_candidates_goes_into_the_right_section() -> None:
    """Candidates land at the end of their own media section."""
    sdp = "v=0\nm=audio 9 RTP/AVP 0\na=mid:0\nm=video 9 RTP/AVP 96\na=mid:1\n"
    merged = merge_candidates(
        sdp,
        [
            RTCIceCandidateInit("candidate:a", sdp_mid="1", sdp_m_line_index=1),
            RTCIceCandidateInit("a=candidate:b", sdp_mid="0", sdp_m_line_index=0),
        ],
    )
    lines = merged.split("\r\n")
    assert lines.index("a=candidate:b") < lines.index("m=video 9 RTP/AVP 96")
    assert lines.index("a=candidate:a") > lines.index("m=video 9 RTP/AVP 96")


@pytest.mark.parametrize(
    ("peer", "headers", "result"),
    [
        (("127.0.0.1", 1), {}, True),
        (("::1", 1, 0, 0), {}, True),
        (("::ffff:127.0.0.1", 1, 0, 0), {}, True),
        (("203.0.113.5", 1), {}, False),
        (("127.0.0.1", 1), {"X-Real-IP": "1.2.3.4"}, False),
        (None, {}, False),
    ],
)
def test_peer_is_loopback(
    peer: tuple | None, headers: dict[str, str], result: bool
) -> None:
    """Only a direct caller on this computer passes."""
    request = SimpleNamespace(
        headers=headers,
        transport=SimpleNamespace(get_extra_info=lambda _name: peer),
    )
    assert peer_is_loopback(request) is result  # type: ignore[arg-type]


class FakeGo2rtc:
    """Stands in for the program's client: remembers the streams added and removed."""

    def __init__(self) -> None:
        """Start with no streams."""
        self.added: list[tuple[str, str]] = []
        self.removed: list[str] = []
        self.fail_add: Exception | None = None

    def access(self) -> Go2RtcAccess:
        """The access object the manager asks for."""

        async def add(name: str, source: str) -> None:
            if self.fail_add:
                raise self.fail_add
            self.added.append((name, source))

        async def remove(name: str) -> None:
            self.removed.append(name)

        return Go2RtcAccess(None, add, remove)


@pytest.fixture
def go2rtc() -> FakeGo2rtc:
    """The fake program."""
    return FakeGo2rtc()


async def live_manager(
    hass: HomeAssistant, entry: MockConfigEntry, go2rtc: FakeGo2rtc | None
) -> RecordingManager:
    """A started manager whose camera has no stream of its own."""
    entry.add_to_hass(hass)
    manager = RecordingManager(hass, entry)
    await manager.async_start()
    manager.recorders[CAMERA].no_source = True
    patcher = patch(
        "homeassistant.components.camera_recording.manager.async_go2rtc_access",
        side_effect=lambda hass: go2rtc.access() if go2rtc else None,
    )
    patcher.start()
    manager._unsubs.append(patcher.stop)
    ffmpeg = patch(
        "homeassistant.components.camera_recording.manager.get_ffmpeg_manager",
        return_value=SimpleNamespace(binary="ffmpeg"),
    )
    ffmpeg.start()
    manager._unsubs.append(ffmpeg.stop)
    http = patch(
        "homeassistant.components.camera_recording.manager.whep_source",
        side_effect=lambda hass, token: f"webrtc:http://127.0.0.1:1/x/{token}",
    )
    http.start()
    manager._unsubs.append(http.stop)
    return manager


def open_event(manager: RecordingManager, seconds_ago: float = 5) -> EventRecord:
    """An event heard just now."""
    return manager._open_record(CAMERA, dt_util.utcnow().timestamp() - seconds_ago)


def writes_clip(content: bytes = b"clip-bytes") -> Callable[..., Awaitable[bool]]:
    """A stand-in for ffmpeg that writes the file."""

    async def record(binary: str, source: str, output: Path, seconds: int) -> bool:
        output.write_bytes(content)
        return True

    return record


@pytest.mark.usefixtures("no_ffmpeg")
async def test_live_state(
    hass: HomeAssistant, local_entry: MockConfigEntry, go2rtc: FakeGo2rtc
) -> None:
    """Live clips are on only for a camera with no stream, with the program set up and not switched off."""
    manager = await live_manager(hass, local_entry, go2rtc)
    assert manager.live_state(CAMERA) == (True, None)
    await manager.async_set_live_options(CAMERA, change_live=True, live=False)
    assert manager.live_state(CAMERA) == (False, "switched_off")
    await manager.async_set_live_options(CAMERA, change_live=True, live=None)
    manager.recorders[CAMERA].no_source = False
    assert manager.live_state(CAMERA) == (False, "not_needed")
    manager.recorders[CAMERA].no_source = True
    manager.status()
    await manager.async_stop()

    other = await live_manager(hass, local_entry, None)
    assert other.live_state(CAMERA) == (False, "no_go2rtc")
    await other.async_stop()


@pytest.mark.usefixtures("no_ffmpeg")
async def test_one_session_per_camera_and_hourly_limit(
    hass: HomeAssistant,
    local_entry: MockConfigEntry,
    go2rtc: FakeGo2rtc,
    freezer: FrozenDateTimeFactory,
) -> None:
    """A second event waits while one runs, and the hourly budget stops a flood."""
    manager = await live_manager(hass, local_entry, go2rtc)
    await manager.async_set_live_options(CAMERA, clips_per_hour=2)
    release = asyncio.Event()
    started: list[float] = []

    async def hold(self: RecordingManager, cam: str, record: EventRecord) -> None:
        started.append(record.start)
        try:
            await release.wait()
        finally:
            self.live_active.pop(cam, None)

    with patch.object(RecordingManager, "_async_live_clip", hold):
        first = open_event(manager, 100)
        manager._start_live(CAMERA, first)
        await asyncio.sleep(0)
        manager._start_live(CAMERA, open_event(manager, 50))
        await asyncio.sleep(0)
        assert len(started) == 1

        release.set()
        await asyncio.sleep(0)
        await asyncio.sleep(0)
        release.clear()
        manager._start_live(CAMERA, open_event(manager, 20))
        await asyncio.sleep(0)
        assert len(started) == 2
        release.set()
        await asyncio.sleep(0)
        await asyncio.sleep(0)
        release.clear()

        manager._start_live(CAMERA, open_event(manager, 10))
        await asyncio.sleep(0)
        assert len(started) == 2
        assert manager.live_budget_left(CAMERA, dt_util.utcnow().timestamp()) == 0

        freezer.tick(timedelta(hours=1, seconds=1))
        manager._start_live(CAMERA, open_event(manager, 1))
        await asyncio.sleep(0)
        assert len(started) == 3
        release.set()
    await manager.async_stop()


@pytest.mark.usefixtures("no_ffmpeg")
async def test_no_live_clip_after_refusal_or_when_service_clip_is_saved(
    hass: HomeAssistant, local_entry: MockConfigEntry, go2rtc: FakeGo2rtc
) -> None:
    """Nothing asks while a refusal wait lasts, and a video the service already gave is enough."""
    manager = await live_manager(hass, local_entry, go2rtc)
    calls: list[str] = []

    async def count(self: RecordingManager, cam: str, record: EventRecord) -> None:
        calls.append(cam)
        self.live_active.pop(cam, None)

    with patch.object(RecordingManager, "_async_live_clip", count):
        manager._note_limited(CAMERA, dt_util.utcnow().timestamp())
        manager._start_live(CAMERA, open_event(manager, 40))
        await asyncio.sleep(0)
        assert calls == []

        manager._limited_until.clear()
        saved = open_event(manager, 30)
        saved.state = ClipState.SAVED
        manager._start_live(CAMERA, saved)
        await asyncio.sleep(0)
        assert calls == []

        manager._start_live(CAMERA, open_event(manager, 3))
        await asyncio.sleep(0)
        assert calls == [CAMERA]
    await manager.async_stop()


@pytest.mark.usefixtures("no_ffmpeg")
async def test_live_clip_is_saved(
    hass: HomeAssistant,
    local_entry: MockConfigEntry,
    go2rtc: FakeGo2rtc,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """A finished live clip is indexed, marked as recorded here, and its temporary stream is gone."""
    manager = await live_manager(hass, local_entry, go2rtc)
    record = open_event(manager)
    manager.live_active[CAMERA] = record
    caplog.set_level(logging.DEBUG)

    with (
        patch(
            "homeassistant.components.camera_recording.manager.async_record_clip",
            writes_clip(b"c" * 500),
        ),
        patch(
            "homeassistant.components.camera_recording.manager.probe_duration",
            return_value=39.8,
        ),
    ):
        await manager._async_live_clip(CAMERA, record)

    assert (record.state, record.origin, record.size) == (ClipState.SAVED, "home", 500)
    assert record.duration == pytest.approx(39.8)
    assert record.name is not None
    assert (manager.folder(CAMERA) / record.name).read_bytes() == b"c" * 500
    assert not list(manager.folder(CAMERA).glob(".*.part"))
    ((stream, source),) = go2rtc.added
    assert go2rtc.removed == [stream]
    assert source.startswith("webrtc:http://127.0.0.1:")
    assert CAMERA not in manager.live_active
    assert manager.events_between(CAMERA, 0, 4_000_000_000)[0]["origin"] == "home"
    token = source.rsplit("/", 1)[1]
    assert token not in caplog.text
    await manager.async_stop()


@pytest.mark.usefixtures("no_ffmpeg")
@pytest.mark.parametrize(
    ("failure", "answered", "reason"),
    [
        (ClipReason.RATE_LIMITED, False, ClipReason.RATE_LIMITED),
        (None, True, ClipReason.TIMED_OUT),
        (None, False, ClipReason.FAILED),
    ],
)
async def test_live_clip_failures_have_reasons(
    hass: HomeAssistant,
    local_entry: MockConfigEntry,
    go2rtc: FakeGo2rtc,
    caplog: pytest.LogCaptureFixture,
    failure: ClipReason | None,
    answered: bool,
    reason: ClipReason,
) -> None:
    """A clip that did not come says why, a refusal starts the wait, and the stream is still removed."""
    manager = await live_manager(hass, local_entry, go2rtc)
    record = open_event(manager)
    manager.live_active[CAMERA] = record

    async def nothing(binary: str, source: str, output: Path, seconds: int) -> bool:
        (session,) = broker_for(hass)._sessions.values()
        session.failure = failure
        session.answered = answered
        return False

    with patch(
        "homeassistant.components.camera_recording.manager.async_record_clip",
        nothing,
    ):
        await manager._async_live_clip(CAMERA, record)

    assert (record.state, record.reason) == (ClipState.NONE, reason)
    assert len(go2rtc.removed) == 1
    assert manager._limited(CAMERA, dt_util.utcnow().timestamp()) is (
        reason is ClipReason.RATE_LIMITED
    )
    assert f"No clip kept for an event of {CAMERA}: {reason.value}" in caplog.text
    assert broker_for(hass)._sessions == {}
    await manager.async_stop()


@pytest.mark.usefixtures("no_ffmpeg")
async def test_live_clip_without_the_program_or_when_it_refuses(
    hass: HomeAssistant, local_entry: MockConfigEntry, go2rtc: FakeGo2rtc
) -> None:
    """Without go2rtc the reason is that the video cannot be saved, and a failing add is classified."""
    manager = await live_manager(hass, local_entry, None)
    record = open_event(manager)
    await manager._async_live_clip(CAMERA, record)
    assert (record.state, record.reason) == (ClipState.NONE, ClipReason.UNSUPPORTED)
    await manager.async_stop()

    broken = await live_manager(hass, local_entry, go2rtc)
    go2rtc.fail_add = TimeoutError()
    second = open_event(broken, 200)
    await broken._async_live_clip(CAMERA, second)
    assert second.reason is ClipReason.TIMED_OUT
    await broken.async_stop()


@pytest.mark.usefixtures("no_ffmpeg")
async def test_service_clip_waits_while_live_clip_runs(
    hass: HomeAssistant, local_entry: MockConfigEntry, go2rtc: FakeGo2rtc
) -> None:
    """The service's own clip is not fetched for an event that a live clip is recording."""

    manager = await live_manager(hass, local_entry, go2rtc)
    adapter = FakeAdapter()
    now = dt_util.utcnow().timestamp()
    record = manager._open_record(CAMERA, now - 20)
    manager.live_active[CAMERA] = record
    adapter.events = [EventMedia("a", now - 20, EventMediaKind.CLIP, ("motion",))]
    adapter.media["a"] = (b"v", EventMediaKind.CLIP)

    await manager._async_keep_events(CAMERA, adapter, adapter.events, now)
    assert record.state is ClipState.SAVING

    manager.live_active.clear()
    await manager._async_keep_events(CAMERA, adapter, adapter.events, now)
    assert (record.state, record.origin) == (ClipState.SAVED, "service")
    await manager.async_stop()


@pytest.mark.usefixtures("no_ffmpeg")
async def test_set_live_options_websocket(
    hass: HomeAssistant,
    local_entry: MockConfigEntry,
    go2rtc: FakeGo2rtc,
    hass_ws_client: WebSocketGenerator,
) -> None:
    """The switch, the length and the budget are set by the admin command and kept in range."""

    await setup_entry(hass, local_entry)
    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "camera_recording/set_live",
            "entry_id": local_entry.entry_id,
            "entity_id": CAMERA,
            "live": False,
            "clip_seconds": 90,
            "clips_per_hour": 5,
        }
    )
    result = (await client.receive_json())["result"]
    camera = result["cameras"][0]
    assert (
        camera["live_choice"],
        camera["clip_seconds"],
        camera["clips_per_hour"],
    ) == (
        False,
        90,
        5,
    )
    await client.send_json_auto_id(
        {
            "type": "camera_recording/set_live",
            "entry_id": local_entry.entry_id,
            "entity_id": CAMERA,
            "clip_seconds": 5,
        }
    )
    assert (await client.receive_json())["success"] is False


def test_session_is_data_only() -> None:
    """A live session holds an id and outcomes, never an address or a sign-in."""
    session = LiveSession("t", CAMERA)
    assert {"token", "entity_id", "failure", "answered"} <= set(session.__slots__)
