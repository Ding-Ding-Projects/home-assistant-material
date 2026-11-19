"""Tests for keeping every snapshot of a recorded camera."""

from pathlib import Path

from freezegun.api import FrozenDateTimeFactory
import pytest
from pytest_homeassistant.common import MockConfigEntry, MockUser
from pytest_homeassistant.typing import ClientSessionGenerator, WebSocketGenerator

from homeassistant.components.camera import DATA_COMPONENT, Camera, async_get_image
from homeassistant.components.camera_recording.snapshots import (
    SnapshotState,
    classify_origin,
    decide,
)
from homeassistant.components.camera_recording.watched import (
    ORIGIN_AUTOMATION,
    ORIGIN_DASHBOARD,
    ORIGIN_OTHER,
    ORIGIN_PERSON,
    WatchedKeeper,
    keepers,
)
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import Context, HomeAssistant
from homeassistant.setup import async_setup_component

from .conftest import CAMERA


class PictureCamera(Camera):
    """A camera whose picture each test sets."""

    _attr_name = "Front door"

    def __init__(self) -> None:
        """Start with one picture."""
        super().__init__()
        self.picture = b"\xff\xd8first\xff\xd9"
        self.asked = 0

    async def async_camera_image(
        self, width: int | None = None, height: int | None = None
    ) -> bytes | None:
        """The current picture."""
        self.asked += 1
        return self.picture


async def setup_with_camera(
    hass: HomeAssistant, entry: MockConfigEntry
) -> tuple[PictureCamera, WatchedKeeper]:
    """Set up the camera, then the recording entry, and return its keeper."""
    assert await async_setup_component(hass, "camera", {})
    camera = PictureCamera()
    await hass.data[DATA_COMPONENT].async_add_entities([camera])
    assert camera.entity_id == CAMERA
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    assert entry.state is ConfigEntryState.LOADED
    return camera, keepers(hass)[entry.entry_id]


def snapshot_rows(keeper: WatchedKeeper) -> list:
    """The snapshot rows of the camera."""
    return [row for row in keeper.rows.get(CAMERA, []) if row.kind == "snapshot"]


@pytest.mark.parametrize(
    ("since", "same", "forced", "expected"),
    [
        pytest.param(5, False, True, True, id="asked-by-action-always"),
        pytest.param(5, False, False, False, id="repeat-too-soon"),
        pytest.param(61, True, False, False, id="unchanged-picture"),
        pytest.param(61, False, False, True, id="changed-after-limit"),
    ],
)
def test_decide(since: int, same: bool, forced: bool, expected: bool) -> None:
    """Repeats are kept once per limit and only when changed; actions always."""
    state = SnapshotState(last_kept=1000, last_hash="a")
    assert (
        decide(
            state,
            now=1000 + since,
            digest="a" if same else "b",
            forced=forced,
            repeat_seconds=60,
        )
        is expected
    )


@pytest.mark.parametrize(
    ("path", "user", "expected"),
    [
        pytest.param(None, False, ORIGIN_OTHER, id="no-request"),
        pytest.param("/api/camera_proxy/camera.x", False, ORIGIN_DASHBOARD, id="proxy"),
        pytest.param("/api/other", True, ORIGIN_PERSON, id="signed-in"),
        pytest.param("/api/other", False, ORIGIN_OTHER, id="anonymous"),
    ],
)
def test_classify_origin(path: str | None, user: bool, expected: str) -> None:
    """Who asked is read from the request path and its user."""
    assert classify_origin(path, user) == expected


@pytest.mark.usefixtures("no_ffmpeg")
async def test_three_in_a_minute_keep_one_then_changed_keeps_another(
    hass: HomeAssistant,
    local_entry: MockConfigEntry,
    freezer: FrozenDateTimeFactory,
) -> None:
    """A picture asked for again and again is kept once a minute, only when changed."""
    camera, keeper = await setup_with_camera(hass, local_entry)
    for _ in range(3):
        image = await async_get_image(hass, CAMERA)
        assert image.content == camera.picture
        freezer.tick(10)
    await hass.async_block_till_done()
    assert camera.asked == 3
    (row,) = snapshot_rows(keeper)
    assert (row.state, row.origin) == ("saved", ORIGIN_OTHER)
    path = keeper.folder(CAMERA) / row.name
    assert path.read_bytes() == camera.picture

    freezer.tick(61)
    await async_get_image(hass, CAMERA)
    await hass.async_block_till_done()
    assert len(snapshot_rows(keeper)) == 1

    camera.picture = b"\xff\xd8second\xff\xd9"
    await async_get_image(hass, CAMERA)
    await hass.async_block_till_done()
    rows = snapshot_rows(keeper)
    assert len(rows) == 2
    assert (keeper.folder(CAMERA) / rows[1].name).read_bytes() == camera.picture
    assert keeper.kept_today(CAMERA)["snapshots"] == 2


@pytest.mark.usefixtures("no_ffmpeg")
@pytest.mark.parametrize(
    ("by_person", "origin"),
    [
        pytest.param(False, ORIGIN_AUTOMATION, id="automation"),
        pytest.param(True, ORIGIN_PERSON, id="person"),
    ],
)
async def test_snapshot_action_always_kept(
    hass: HomeAssistant,
    local_entry: MockConfigEntry,
    tmp_path: Path,
    hass_admin_user: MockUser,
    by_person: bool,
    origin: str,
) -> None:
    """The snapshot action is kept even right after a repeat, with who asked."""
    camera, keeper = await setup_with_camera(hass, local_entry)
    hass.config.allowlist_external_dirs = {str(tmp_path)}
    await async_get_image(hass, CAMERA)
    await hass.async_block_till_done()
    await hass.services.async_call(
        "camera",
        "snapshot",
        {"entity_id": CAMERA, "filename": str(tmp_path / "door.jpg")},
        blocking=True,
        context=Context(user_id=hass_admin_user.id if by_person else None),
    )
    await hass.async_block_till_done()
    rows = snapshot_rows(keeper)
    assert [row.origin for row in rows] == [ORIGIN_OTHER, origin]
    assert (tmp_path / "door.jpg").read_bytes() == camera.picture


@pytest.mark.usefixtures("no_ffmpeg")
async def test_dashboard_picture_kept_with_its_origin(
    hass: HomeAssistant,
    local_entry: MockConfigEntry,
    hass_client: ClientSessionGenerator,
) -> None:
    """A dashboard asking through the image proxy is named as the dashboard."""
    camera, keeper = await setup_with_camera(hass, local_entry)
    client = await hass_client()
    response = await client.get(f"/api/camera_proxy/{CAMERA}")
    assert response.status == 200
    assert await response.read() == camera.picture
    await hass.async_block_till_done()
    (row,) = snapshot_rows(keeper)
    assert row.origin == ORIGIN_DASHBOARD


@pytest.mark.usefixtures("no_ffmpeg")
async def test_switch_off_and_unload_restore_the_camera(
    hass: HomeAssistant,
    local_entry: MockConfigEntry,
    hass_ws_client: WebSocketGenerator,
) -> None:
    """With the switch off nothing is kept; unloading gives the camera its own call back."""
    camera, keeper = await setup_with_camera(hass, local_entry)
    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "camera_recording/watched/settings",
            "entry_id": local_entry.entry_id,
            "entity_id": CAMERA,
            "keep_snapshots": False,
        }
    )
    result = await client.receive_json()
    assert result["success"]
    assert result["result"]["settings"]["keep_snapshots"] is False
    await async_get_image(hass, CAMERA)
    await hass.async_block_till_done()
    assert snapshot_rows(keeper) == []

    assert "async_camera_image" in vars(camera)
    assert await hass.config_entries.async_unload(local_entry.entry_id)
    await hass.async_block_till_done()
    assert "async_camera_image" not in vars(camera)
    assert keepers(hass) == {}


@pytest.mark.usefixtures("no_ffmpeg")
async def test_all_day_camera_points_at_the_recording(
    hass: HomeAssistant, local_entry: MockConfigEntry
) -> None:
    """A camera recorded all day keeps no second copy of its picture."""
    _camera, keeper = await setup_with_camera(hass, local_entry)
    keeper.manager.recorders[CAMERA].state = "recording"
    await async_get_image(hass, CAMERA)
    await hass.async_block_till_done()
    (row,) = snapshot_rows(keeper)
    assert (row.state, row.points_at, row.name) == ("saved", "recording", None)
    assert not keeper.folder(CAMERA).exists()
