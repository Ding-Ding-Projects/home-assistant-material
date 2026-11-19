"""Tests for keeping every live view: one shared camera session, rows, waits and settings."""

import asyncio
from pathlib import Path
from types import SimpleNamespace
from typing import Any
from unittest.mock import patch

from go2rtc_client import ws as go2rtc_ws
import pytest
from pytest_homeassistant.common import MockConfigEntry
from pytest_homeassistant.typing import WebSocketGenerator

from homeassistant.components.camera_recording import watched
from homeassistant.components.camera_recording.events import ClipReason
from homeassistant.components.camera_recording.live import (
    Go2RtcAccess,
    LiveSession,
    broker_for,
)
from homeassistant.components.camera_recording.watched import (
    WatchedKeeper,
    WatchedRecord,
    WatchRefused,
    WatchSettings,
    is_watched_name,
    keepers,
    watched_file_name,
)
from homeassistant.core import HomeAssistant

from .conftest import CAMERA
from .test_init import setup_entry


class FakeService:
    """A go2rtc that pulls the camera once per stream, as the real one does."""

    def __init__(self, hass: HomeAssistant, refuse: bool = False) -> None:
        """Count the pulls."""
        self.hass = hass
        self.refuse = refuse
        self.offers = 0
        self.added: list[str] = []
        self.removed: list[str] = []

    def access(self) -> Go2RtcAccess:
        """The access object the keeper uses."""

        async def add(name: str, source: str) -> None:
            self.added.append(name)
            self.offers += 1
            token = source.rsplit("/", 1)[1]
            session: LiveSession | None = broker_for(self.hass).claim(token)
            assert session is not None
            if self.refuse:
                session.failure = ClipReason.RATE_LIMITED
            else:
                session.camera_session = "provider-session"
                session.answered = True

        async def remove(name: str) -> None:
            self.removed.append(name)

        return Go2RtcAccess(None, add, remove)


async def until(check: Any) -> None:
    """Wait a little for something the background task does."""
    for _ in range(100):
        if check():
            return
        await asyncio.sleep(0.02)
    raise AssertionError("it did not happen")


async def fake_run_until(command: list[str], stop: asyncio.Event, limit: Any) -> bool:
    """Stand in for ffmpeg: write a little for a clip, then wait to be stopped."""
    if command[-1] != "-":
        Path(command[-1]).write_bytes(b"x" * 5000)
    await stop.wait()
    return False


@pytest.fixture
async def keeper(
    hass: HomeAssistant, local_entry: MockConfigEntry, no_ffmpeg: None
) -> WatchedKeeper:
    """A loaded entry whose camera streams only through its service."""
    await setup_entry(hass, local_entry)
    keeper = keepers(hass)[local_entry.entry_id]
    keeper.manager.recorders[CAMERA].no_source = True
    return keeper


@pytest.fixture
def service(hass: HomeAssistant) -> FakeService:
    """The pretend go2rtc, patched in."""
    fake = FakeService(hass)
    with (
        patch.object(watched, "async_go2rtc_access", lambda _hass: fake.access()),
        patch.object(
            watched,
            "whep_source",
            lambda _hass, token: f"webrtc:http://127.0.0.1:8123/whep/{token}",
        ),
        patch.object(watched, "_run_until", fake_run_until),
        patch.object(watched, "probe_duration", lambda _path: None),
        patch.object(watched, "LINGER_SECONDS", 0.05),
    ):
        yield fake


def test_names_and_settings() -> None:
    """File names are recognised, and settings are clamped with defaults."""
    name = watched_file_name(1_700_000_000.25, "live_view")
    assert name == "20231114T221320Z-250-live.mp4"
    assert is_watched_name(name)
    assert is_watched_name(watched_file_name(1_700_000_000, "snapshot"))
    assert not is_watched_name("../secret-live.mp4")
    assert not is_watched_name("20231114T221320Z.mp4")
    assert WatchSettings.from_dict(None) == WatchSettings()
    settings = WatchSettings.from_dict(
        {"keep_live": False, "longest_minutes": 500, "snapshot_seconds": 1}
    )
    assert (
        settings.keep_live,
        settings.longest_minutes,
        settings.snapshot_seconds,
    ) == (
        False,
        60,
        10,
    )
    assert settings.auto_start is True


def test_saving_row_read_back_says_cut_off() -> None:
    """A row still being kept when Home Assistant stopped says why it is missing."""
    row = WatchedRecord(1.0, "live_view").as_list()
    record = WatchedRecord.from_list(row)
    assert (record.state, record.reason) == ("none", "stream_ended")


async def test_two_viewers_share_one_session(
    hass: HomeAssistant, keeper: WatchedKeeper, service: FakeService
) -> None:
    """Two viewers open one camera session; it closes after the last one leaves."""
    first = await keeper.async_open(CAMERA, "a")
    second = await keeper.async_open(CAMERA, "b")
    assert first is second
    assert service.offers == 1
    assert keeper.live_state(CAMERA)["viewers"] == 2
    await until(lambda: keeper.live_state(CAMERA)["keeping_since"] is not None)

    keeper.close(CAMERA, "a")
    await asyncio.sleep(0.2)
    assert CAMERA in keeper.watches
    keeper.close(CAMERA, "b")
    assert first.task is not None
    await asyncio.wait_for(first.task, 5)

    assert CAMERA not in keeper.watches
    assert service.removed == service.added
    (row,) = [row for row in keeper.rows[CAMERA] if row.kind == "live_view"]
    assert (row.state, row.size) == ("saved", 5000)
    assert (keeper.folder(CAMERA) / row.name).is_file()
    assert keeper.kept_today(CAMERA)["live_views"] == 1


async def test_viewer_back_during_linger_reuses_the_session(
    hass: HomeAssistant, keeper: WatchedKeeper, service: FakeService
) -> None:
    """Coming back within the linger reuses the open session and starts a new part."""
    with patch.object(watched, "LINGER_SECONDS", 2):
        watch = await keeper.async_open(CAMERA, "a")
        await until(lambda: watch.keeping is not None)
        keeper.close(CAMERA, "a")
        await asyncio.sleep(0.2)
        again = await keeper.async_open(CAMERA, "b")
        assert again is watch
        await until(lambda: watch.keeping is not None)
        keeper.close(CAMERA, "b")
        keeper._end(watch)
        await asyncio.wait_for(watch.task, 5)
    assert service.offers == 1
    rows = [row for row in keeper.rows[CAMERA] if row.kind == "live_view"]
    assert [row.state for row in rows] == ["saved", "saved"]


async def test_refusal_starts_the_wait_and_asks_nothing_until_over(
    hass: HomeAssistant, keeper: WatchedKeeper, service: FakeService
) -> None:
    """Too many requests: the row says why, and the next open asks nothing."""
    service.refuse = True
    with pytest.raises(WatchRefused) as err:
        await keeper.async_open(CAMERA, "a")
    assert err.value.code == ClipReason.RATE_LIMITED.value
    assert err.value.retry_at is not None
    assert service.offers == 1
    with pytest.raises(WatchRefused) as again:
        await keeper.async_open(CAMERA, "b")
    assert again.value.code == ClipReason.RATE_LIMITED.value
    assert service.offers == 1
    assert keeper.live_state(CAMERA)["retry_at"] is not None
    (row,) = keeper.rows[CAMERA]
    assert (row.state, row.reason) == ("none", "rate_limited")
    await until(lambda: service.removed == service.added)


async def test_event_clip_running_means_busy(
    hass: HomeAssistant, keeper: WatchedKeeper, service: FakeService
) -> None:
    """While an event clip holds the camera, no second session is opened."""
    keeper.manager.live_active[CAMERA] = SimpleNamespace()
    with pytest.raises(WatchRefused) as err:
        await keeper.async_open(CAMERA, "a")
    assert err.value.code == ClipReason.CAMERA_BUSY.value
    assert service.offers == 0


async def test_keep_live_off_holds_session_without_keeping(
    hass: HomeAssistant, keeper: WatchedKeeper, service: FakeService
) -> None:
    """With keeping switched off, the live view is shared but nothing is written."""
    keeper.async_set_settings(CAMERA, keep_live=False)
    watch = await keeper.async_open(CAMERA, "a")
    keeper.close(CAMERA, "a")
    await asyncio.wait_for(watch.task, 5)
    assert service.offers == 1
    assert keeper.rows.get(CAMERA, []) == []


async def test_websocket_list_subscribe_and_points_at_recording(
    hass: HomeAssistant,
    local_entry: MockConfigEntry,
    hass_ws_client: WebSocketGenerator,
    no_ffmpeg: None,
) -> None:
    """A camera recorded all day: watching adds a row that points at the recording."""
    await setup_entry(hass, local_entry)
    keeper = keepers(hass)[local_entry.entry_id]
    keeper.manager.recorders[CAMERA].state = "recording"
    client = await hass_ws_client(hass)
    with patch.object(watched, "LINGER_SECONDS", 0.05):
        await client.send_json_auto_id(
            {"type": "camera_recording/watch/subscribe", "entity_id": CAMERA}
        )
        result = await client.receive_json()
        assert result["success"]
        sub = result["id"]
        event = await client.receive_json()
        assert event["event"]["type"] == "state"
        assert event["event"]["route"] == "camera"
        await hass.async_block_till_done()
        await client.send_json_auto_id(
            {"type": "unsubscribe_events", "subscription": sub}
        )
        await client.receive_json()
        watch = keeper.watches[CAMERA]
        await asyncio.wait_for(watch.task, 5)

    await client.send_json_auto_id(
        {
            "type": "camera_recording/watched/list",
            "entity_id": CAMERA,
            "start_time": "2000-01-01T00:00:00+00:00",
            "end_time": "2000-01-08T00:00:00+00:00",
        }
    )
    empty = await client.receive_json()
    assert empty["result"]["rows"] == []
    rows = keeper.rows[CAMERA]
    assert [(r.kind, r.state, r.points_at) for r in rows] == [
        ("live_view", "saved", "recording")
    ]
    assert empty["result"]["settings"]["longest_minutes"] == 10
    assert empty["result"]["live"]["route"] == "camera"


async def test_settings_need_known_camera(
    hass: HomeAssistant,
    local_entry: MockConfigEntry,
    hass_ws_client: WebSocketGenerator,
    no_ffmpeg: None,
) -> None:
    """Settings for a camera that is not recorded are refused; ranges are checked."""
    await setup_entry(hass, local_entry)
    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "camera_recording/watched/settings",
            "entry_id": local_entry.entry_id,
            "entity_id": "camera.other",
            "keep_live": False,
        }
    )
    assert (await client.receive_json())["error"]["code"] == "not_found"
    await client.send_json_auto_id(
        {
            "type": "camera_recording/watched/settings",
            "entry_id": local_entry.entry_id,
            "entity_id": CAMERA,
            "longest_minutes": 61,
        }
    )
    assert (await client.receive_json())["error"]["code"] == "invalid_format"
    await client.send_json_auto_id(
        {
            "type": "camera_recording/watched/settings",
            "entry_id": local_entry.entry_id,
            "entity_id": CAMERA,
            "longest_minutes": 3,
            "snapshot_seconds": 120,
        }
    )
    result = await client.receive_json()
    assert result["result"]["settings"] == {
        "auto_start": True,
        "keep_live": True,
        "keep_snapshots": True,
        "longest_minutes": 3,
        "snapshot_seconds": 120,
    }


class FakeWsClient:
    """go2rtc's WebSocket client, answering every offer from the shared stream."""

    made: list[FakeWsClient] = []

    def __init__(self, session: Any, url: str, *, source: str) -> None:
        """Remember the stream the browser watches."""
        self.source = source
        self.sent: list[Any] = []
        self.closed = False
        self.listener: Any = None
        FakeWsClient.made.append(self)

    def subscribe(self, listener: Any) -> None:
        """Keep the listener."""
        self.listener = listener

    async def send(self, message: Any) -> None:
        """Answer an offer."""
        self.sent.append(message)
        if isinstance(message, go2rtc_ws.WebRTCOffer):
            self.listener(go2rtc_ws.WebRTCAnswer("v=0 answer"))

    async def close(self) -> None:
        """Closed by the page leaving."""
        self.closed = True


async def test_two_browsers_watch_through_the_home(
    hass: HomeAssistant,
    keeper: WatchedKeeper,
    service: FakeService,
    hass_ws_client: WebSocketGenerator,
) -> None:
    """Each browser's offer is answered by go2rtc from the one shared camera session."""
    FakeWsClient.made = []
    provider = SimpleNamespace(_session=None, _url="http://127.0.0.1:11984/")
    with (
        patch.object(go2rtc_ws, "Go2RtcWsClient", FakeWsClient),
        patch.object(
            hass.config_entries,
            "async_loaded_entries",
            return_value=[SimpleNamespace(runtime_data=provider)],
        ),
    ):
        browsers = [await hass_ws_client(hass) for _ in range(2)]
        subscriptions = []
        for browser in browsers:
            await browser.send_json_auto_id(
                {
                    "type": "camera_recording/watch/offer",
                    "entity_id": CAMERA,
                    "offer": "v=0 offer",
                }
            )
            result = await browser.receive_json()
            assert result["success"]
            subscriptions.append(result["id"])
            kinds = []
            session_id = None
            while "answer" not in kinds:
                event = (await browser.receive_json())["event"]
                kinds.append(event["type"])
                if event["type"] == "session":
                    session_id = event["session_id"]
            assert "state" in kinds
            await browser.send_json_auto_id(
                {
                    "type": "camera_recording/watch/candidate",
                    "entity_id": CAMERA,
                    "session_id": session_id,
                    "candidate": "candidate:1 1 udp 1 192.0.2.4 5000 typ host",
                }
            )
            while True:
                reply = await browser.receive_json()
                if reply.get("type") == "result":
                    assert reply["success"]
                    break
        assert service.offers == 1
        watch = keeper.watches[CAMERA]
        assert [client.source for client in FakeWsClient.made] == [watch.stream] * 2
        assert all(len(client.sent) == 2 for client in FakeWsClient.made)
        for browser, sub in zip(browsers, subscriptions, strict=True):
            await browser.send_json_auto_id(
                {"type": "unsubscribe_events", "subscription": sub}
            )
        await asyncio.wait_for(watch.task, 5)
        await hass.async_block_till_done()
    assert all(client.closed for client in FakeWsClient.made)
    assert service.removed == service.added
