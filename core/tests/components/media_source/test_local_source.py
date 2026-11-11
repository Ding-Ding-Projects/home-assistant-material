"""Test Local Media Source."""

from collections.abc import AsyncGenerator, Callable
from http import HTTPStatus
import io
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any
from unittest.mock import patch

import pytest
from pytest_homeassistant.common import MockUser
from pytest_homeassistant.typing import (
    ClientSessionGenerator,
    MockHAClientWebSocket,
    WebSocketGenerator,
)

from homeassistant.components import media_source, websocket_api
from homeassistant.components.media_player import (
    BrowseError,
    MediaClass,
    SearchMediaQuery,
)
from homeassistant.components.media_source import const
from homeassistant.components.media_source.local_source import MAX_SEARCH_RESULTS
from homeassistant.core import HomeAssistant
from homeassistant.core_config import async_process_ha_core_config
from homeassistant.setup import async_setup_component


@pytest.fixture
async def temp_dir(hass: HomeAssistant) -> AsyncGenerator[str]:
    """Return a temp dir."""
    with TemporaryDirectory() as tmpdirname:
        target_dir = Path(tmpdirname) / "another_subdir"
        target_dir.mkdir()
        await async_process_ha_core_config(
            hass, {"media_dirs": {"test_dir": str(target_dir)}}
        )
        assert await async_setup_component(hass, const.DOMAIN, {})

        yield str(target_dir)


async def test_async_browse_media(hass: HomeAssistant) -> None:
    """Test browse media."""
    local_media = hass.config.path("media")
    await async_process_ha_core_config(
        hass, {"media_dirs": {"local": local_media, "recordings": local_media}}
    )
    await hass.async_block_till_done()

    assert await async_setup_component(hass, const.DOMAIN, {})
    await hass.async_block_till_done()

    # Test path not exists
    with pytest.raises(BrowseError) as excinfo:
        await media_source.async_browse_media(
            hass, f"{const.URI_SCHEME}{const.DOMAIN}/local/test/not/exist"
        )
    assert str(excinfo.value) == "Path does not exist."

    # Test browse file
    with pytest.raises(BrowseError) as excinfo:
        await media_source.async_browse_media(
            hass, f"{const.URI_SCHEME}{const.DOMAIN}/local/test.mp3"
        )
    assert str(excinfo.value) == "Path is not a directory."

    # Test invalid base
    with pytest.raises(BrowseError) as excinfo:
        await media_source.async_browse_media(
            hass, f"{const.URI_SCHEME}{const.DOMAIN}/invalid/base"
        )
    assert str(excinfo.value) == "Unknown source directory."

    # Test directory traversal
    with pytest.raises(BrowseError) as excinfo:
        await media_source.async_browse_media(
            hass, f"{const.URI_SCHEME}{const.DOMAIN}/local/../configuration.yaml"
        )
    assert str(excinfo.value) == "Invalid path."

    # Test successful listing
    media = await media_source.async_browse_media(
        hass, f"{const.URI_SCHEME}{const.DOMAIN}"
    )
    assert media

    media = await media_source.async_browse_media(
        hass, f"{const.URI_SCHEME}{const.DOMAIN}/local/."
    )
    assert media

    media = await media_source.async_browse_media(
        hass, f"{const.URI_SCHEME}{const.DOMAIN}/recordings/."
    )
    assert media


async def test_async_search_media(hass: HomeAssistant) -> None:
    """Test searching local media."""
    local_media = hass.config.path("media")
    await async_process_ha_core_config(
        hass, {"media_dirs": {"local": local_media, "recordings": local_media}}
    )
    await hass.async_block_till_done()

    assert await async_setup_component(hass, const.DOMAIN, {})
    await hass.async_block_till_done()

    # Search within a single directory (contextual)
    result = await media_source.async_search_media(
        hass,
        f"{const.URI_SCHEME}{const.DOMAIN}/local",
        SearchMediaQuery(search_query="test"),
    )
    assert [item.title for item in result.result] == ["test.mp3"]
    assert (
        result.result[0].media_content_id
        == f"{const.URI_SCHEME}{const.DOMAIN}/local/test.mp3"
    )

    # Search across all directories (global) finds the file in both dirs
    result = await media_source.async_search_media(
        hass,
        f"{const.URI_SCHEME}{const.DOMAIN}",
        SearchMediaQuery(search_query="sax"),
    )
    assert {item.title for item in result.result} == {"Epic Sax Guy 10 Hours.mp4"}
    assert len(result.result) == 2

    # Non-media files are not returned
    result = await media_source.async_search_media(
        hass,
        f"{const.URI_SCHEME}{const.DOMAIN}/local",
        SearchMediaQuery(search_query="not_media"),
    )
    assert result.result == []

    # Searching a non-existent directory returns no results
    result = await media_source.async_search_media(
        hass,
        f"{const.URI_SCHEME}{const.DOMAIN}/local/nonexistent",
        SearchMediaQuery(search_query="test"),
    )
    assert result.result == []

    # Filter by media class
    result = await media_source.async_search_media(
        hass,
        f"{const.URI_SCHEME}{const.DOMAIN}/local",
        SearchMediaQuery(search_query="", media_filter_classes=[MediaClass.MUSIC]),
    )
    assert [item.title for item in result.result] == ["test.mp3"]

    # Invalid path raises a BrowseError
    with pytest.raises(BrowseError):
        await media_source.async_search_media(
            hass,
            f"{const.URI_SCHEME}{const.DOMAIN}/local/../secret",
            SearchMediaQuery(search_query="test"),
        )


@pytest.mark.parametrize(
    ("suffix", "create"),
    [
        pytest.param(".mp3", Path.touch, id="files"),
        pytest.param("", Path.mkdir, id="folders"),
    ],
)
async def test_async_search_media_limit_and_hidden(
    hass: HomeAssistant,
    tmp_path: Path,
    suffix: str,
    create: Callable[[Path], None],
) -> None:
    """Test that search caps results and skips hidden entries."""
    for i in range(MAX_SEARCH_RESULTS + 20):
        create(tmp_path / f"song_{i}{suffix}")
    create(tmp_path / f".hidden_song{suffix}")

    await async_process_ha_core_config(
        hass, {"media_dirs": {"local": str(tmp_path), "recordings": str(tmp_path)}}
    )
    await hass.async_block_till_done()

    assert await async_setup_component(hass, const.DOMAIN, {})
    await hass.async_block_till_done()

    # Global search across both dirs; the first dir already fills the limit
    result = await media_source.async_search_media(
        hass,
        f"{const.URI_SCHEME}{const.DOMAIN}",
        SearchMediaQuery(search_query="song"),
    )
    assert len(result.result) == MAX_SEARCH_RESULTS
    assert all(not item.title.startswith(".") for item in result.result)


FOLDER_RESULT = ("Albums/Best Of", MediaClass.DIRECTORY, "", False, True, True)
FILE_RESULT = (
    "Albums/Best Of Live.mp3",
    MediaClass.MUSIC,
    "audio/mpeg",
    True,
    False,
    False,
)


@pytest.mark.parametrize(
    ("media_filter_classes", "expected"),
    [
        pytest.param(None, [FOLDER_RESULT, FILE_RESULT], id="no_filter"),
        pytest.param([MediaClass.MUSIC], [FILE_RESULT], id="music_filter"),
    ],
)
async def test_async_search_media_folders(
    hass: HomeAssistant,
    tmp_path: Path,
    media_filter_classes: list[MediaClass] | None,
    expected: list[tuple[str, MediaClass, str, bool, bool, bool]],
) -> None:
    """Test that search returns matching folders unless a media class filter is set."""
    (tmp_path / "Albums" / "Best Of").mkdir(parents=True)
    (tmp_path / "Albums" / "Best Of" / "track.mp3").touch()
    (tmp_path / "Albums" / "Best Of Live.mp3").touch()
    (tmp_path / ".hidden" / "Best Of").mkdir(parents=True)

    await async_process_ha_core_config(hass, {"media_dirs": {"local": str(tmp_path)}})
    await hass.async_block_till_done()

    assert await async_setup_component(hass, const.DOMAIN, {})
    await hass.async_block_till_done()

    result = await media_source.async_search_media(
        hass,
        f"{const.URI_SCHEME}{const.DOMAIN}/local",
        SearchMediaQuery(
            search_query="best of", media_filter_classes=media_filter_classes
        ),
    )
    assert [
        (
            item.media_content_id,
            item.media_class,
            item.media_content_type,
            item.can_play,
            item.can_expand,
            item.can_search,
        )
        for item in result.result
    ] == [
        (f"{const.URI_SCHEME}{const.DOMAIN}/local/{location}", *flags)
        for location, *flags in expected
    ]


async def test_browse_media_can_search(hass: HomeAssistant) -> None:
    """Test that browsable directories advertise search support."""
    local_media = hass.config.path("media")
    await async_process_ha_core_config(
        hass, {"media_dirs": {"local": local_media, "recordings": local_media}}
    )
    await hass.async_block_till_done()

    assert await async_setup_component(hass, const.DOMAIN, {})
    await hass.async_block_till_done()

    # The root of multiple directories is searchable
    media = await media_source.async_browse_media(
        hass, f"{const.URI_SCHEME}{const.DOMAIN}"
    )
    assert media.can_search

    # A directory is searchable, but the files inside it are not
    media = await media_source.async_browse_media(
        hass, f"{const.URI_SCHEME}{const.DOMAIN}/local/."
    )
    assert media.can_search
    file_child = next(child for child in media.children if child.can_play)
    assert not file_child.can_search


async def test_media_view(
    hass: HomeAssistant, hass_client: ClientSessionGenerator
) -> None:
    """Test media view."""
    local_media = hass.config.path("media")
    await async_process_ha_core_config(
        hass, {"media_dirs": {"local": local_media, "recordings": local_media}}
    )
    await hass.async_block_till_done()

    assert await async_setup_component(hass, const.DOMAIN, {})
    await hass.async_block_till_done()

    client = await hass_client()

    # Protects against non-existent files
    resp = await client.head("/media/local/invalid.txt")
    assert resp.status == HTTPStatus.NOT_FOUND

    resp = await client.get("/media/local/invalid.txt")
    assert resp.status == HTTPStatus.NOT_FOUND

    resp = await client.get("/media/recordings/invalid.txt")
    assert resp.status == HTTPStatus.NOT_FOUND

    # Protects against non-media files
    resp = await client.head("/media/local/not_media.txt")
    assert resp.status == HTTPStatus.NOT_FOUND

    resp = await client.get("/media/local/not_media.txt")
    assert resp.status == HTTPStatus.NOT_FOUND

    # Protects against unknown local media sources
    resp = await client.head("/media/unknown_source/not_media.txt")
    assert resp.status == HTTPStatus.NOT_FOUND

    resp = await client.get("/media/unknown_source/not_media.txt")
    assert resp.status == HTTPStatus.NOT_FOUND

    # Fetch available media
    resp = await client.head("/media/local/test.mp3")
    assert resp.status == HTTPStatus.OK
    assert resp.content_type == "audio/mpeg"

    resp = await client.get("/media/local/test.mp3")
    assert resp.status == HTTPStatus.OK

    resp = await client.head("/media/local/Epic Sax Guy 10 Hours.mp4")
    assert resp.status == HTTPStatus.OK
    assert resp.content_type == "video/mp4"

    resp = await client.get("/media/local/Epic Sax Guy 10 Hours.mp4")
    assert resp.status == HTTPStatus.OK

    resp = await client.get("/media/recordings/test.mp3")
    assert resp.status == HTTPStatus.OK


async def test_upload_view(
    hass: HomeAssistant,
    hass_client: ClientSessionGenerator,
    temp_dir: str,
    tmp_path: Path,
    hass_admin_user: MockUser,
) -> None:
    """Allow uploading media."""
    # We need a temp dir that's not under tempdir fixture
    extra_media_dir = tmp_path
    hass.config.media_dirs["another_path"] = temp_dir

    img = (Path(__file__).parent.parent / "image_upload/logo.png").read_bytes()

    def get_file(name):
        pic = io.BytesIO(img)
        pic.name = name
        return pic

    client = await hass_client()

    # Test normal upload
    with patch.object(Path, "mkdir", autospec=True, return_value=None) as mock_mkdir:
        res = await client.post(
            "/api/media_source/local_source/upload",
            data={
                "media_content_id": "media-source://media_source/test_dir",
                "file": get_file("logo.png"),
            },
        )

    assert res.status == 200
    data = await res.json()
    assert data["media_content_id"] == "media-source://media_source/test_dir/logo.png"
    uploaded_path = Path(temp_dir) / "logo.png"
    assert uploaded_path.is_file()
    mock_mkdir.assert_called_once()

    resolved = await media_source.async_resolve_media(
        hass, data["media_content_id"], target_media_player=None
    )
    assert resolved.url == "/media/test_dir/logo.png"
    assert resolved.mime_type == "image/png"
    assert resolved.path == uploaded_path

    # Test with bad media source ID
    for bad_id in (
        # Main dir doesn't exist
        "media-source://media_source/test_dir2",
        # Location is invalid
        "media-source://media_source/test_dir/..",
        # Domain != media_source
        "media-source://nest/test_dir/.",
        # Other directory
        f"media-source://media_source/another_path///{extra_media_dir}/",
        # Completely something else
        "http://bla",
    ):
        res = await client.post(
            "/api/media_source/local_source/upload",
            data={
                "media_content_id": bad_id,
                "file": get_file("bad-source-id.png"),
            },
        )

        assert res.status == 400, bad_id
        assert not (Path(temp_dir) / "bad-source-id.png").is_file()

    # Test invalid POST data
    res = await client.post(
        "/api/media_source/local_source/upload",
        data={
            "media_content_id": "media-source://media_source/test_dir/.",
            "file": get_file("invalid-data.png"),
            "incorrect": "format",
        },
    )

    assert res.status == 400
    assert not (Path(temp_dir) / "invalid-data.png").is_file()

    # Test invalid content type
    text_file = io.BytesIO(b"Hello world")
    text_file.name = "hello.txt"
    res = await client.post(
        "/api/media_source/local_source/upload",
        data={
            "media_content_id": "media-source://media_source/test_dir/.",
            "file": text_file,
        },
    )

    assert res.status == 400
    assert not (Path(temp_dir) / "hello.txt").is_file()

    # Test invalid filename
    with patch(
        "aiohttp.formdata.guess_filename", return_value="../invalid-filename.png"
    ):
        res = await client.post(
            "/api/media_source/local_source/upload",
            data={
                "media_content_id": "media-source://media_source/test_dir/.",
                "file": get_file("../invalid-filename.png"),
            },
        )

    assert res.status == 400
    assert not (Path(temp_dir) / "../invalid-filename.png").is_file()

    # Remove admin access
    hass_admin_user.groups = []
    res = await client.post(
        "/api/media_source/local_source/upload",
        data={
            "media_content_id": "media-source://media_source/test_dir/.",
            "file": get_file("no-admin-test.png"),
        },
    )

    assert res.status == 401
    assert not (Path(temp_dir) / "no-admin-test.png").is_file()


async def test_remove_file(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    temp_dir: str,
    hass_admin_user: MockUser,
) -> None:
    """Allow uploading media."""

    msg_count = 0
    file_count = 0

    def msgid():
        nonlocal msg_count
        msg_count += 1
        return msg_count

    def create_file():
        nonlocal file_count
        file_count += 1
        to_delete_path = Path(temp_dir) / f"to_delete_{file_count}.txt"
        to_delete_path.touch()
        return to_delete_path

    client = await hass_ws_client(hass)
    to_delete = create_file()

    await client.send_json(
        {
            "id": msgid(),
            "type": "media_source/local_source/remove",
            "media_content_id": f"media-source://media_source/test_dir/{to_delete.name}",
        }
    )

    msg = await client.receive_json()

    assert msg["success"]

    assert not to_delete.exists()

    # Test with bad media source ID
    extra_id_file = create_file()
    for bad_id, err in (
        # Not exists
        (
            "media-source://media_source/test_dir/not_exist.txt",
            websocket_api.ERR_NOT_FOUND,
        ),
        # Only a dir
        ("media-source://media_source/test_dir", websocket_api.ERR_NOT_SUPPORTED),
        # File with extra identifiers
        (
            f"media-source://media_source/test_dir/bla/../{extra_id_file.name}",
            websocket_api.ERR_INVALID_FORMAT,
        ),
        # Location is invalid
        ("media-source://media_source/test_dir/..", websocket_api.ERR_INVALID_FORMAT),
        # Domain != media_source
        ("media-source://nest/test_dir/.", websocket_api.ERR_INVALID_FORMAT),
        # Completely something else
        ("http://bla", websocket_api.ERR_INVALID_FORMAT),
    ):
        await client.send_json(
            {
                "id": msgid(),
                "type": "media_source/local_source/remove",
                "media_content_id": bad_id,
            }
        )

        msg = await client.receive_json()

        assert not msg["success"], bad_id
        assert msg["error"]["code"] == err

    assert extra_id_file.exists()

    # Test error deleting
    to_delete_2 = create_file()

    with patch("pathlib.Path.unlink", side_effect=OSError):
        await client.send_json(
            {
                "id": msgid(),
                "type": "media_source/local_source/remove",
                "media_content_id": f"media-source://media_source/test_dir/{to_delete_2.name}",
            }
        )

        msg = await client.receive_json()

    assert not msg["success"]
    assert msg["error"]["code"] == websocket_api.ERR_UNKNOWN_ERROR

    # Test requires admin access
    to_delete_3 = create_file()
    hass_admin_user.groups = []

    await client.send_json(
        {
            "id": msgid(),
            "type": "media_source/local_source/remove",
            "media_content_id": f"media-source://media_source/test_dir/{to_delete_3.name}",
        }
    )

    msg = await client.receive_json()

    assert not msg["success"]
    assert to_delete_3.is_file()


@pytest.mark.parametrize(
    ("filename", "content_type"),
    [
        ("photo.jpg", "image/jpeg"),
        ("song.mp3", "audio/mpeg"),
        ("clip.mp4", "video/mp4"),
    ],
)
async def test_media_view_serves_media_inline(
    hass: HomeAssistant,
    hass_client: ClientSessionGenerator,
    tmp_path: Path,
    filename: str,
    content_type: str,
) -> None:
    """Test ordinary media is served for the browser to render."""
    (tmp_path / filename).touch()

    await async_process_ha_core_config(hass, {"media_dirs": {"local": str(tmp_path)}})
    await hass.async_block_till_done()

    assert await async_setup_component(hass, const.DOMAIN, {})
    await hass.async_block_till_done()

    client = await hass_client()

    resp = await client.get(f"/media/local/{filename}")
    assert resp.status == HTTPStatus.OK
    assert resp.content_type == content_type
    assert "Content-Disposition" not in resp.headers

    resp = await client.head(f"/media/local/{filename}")
    assert resp.status == HTTPStatus.OK
    assert resp.content_type == content_type
    assert "Content-Disposition" not in resp.headers


async def test_media_view_serves_svg_as_attachment(
    hass: HomeAssistant, hass_client: ClientSessionGenerator, tmp_path: Path
) -> None:
    """Test an SVG is downloaded rather than rendered.

    An SVG is a document a browser executes, and these are served from the
    Home Assistant origin.
    """
    (tmp_path / "drawing.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg"></svg>'
    )

    await async_process_ha_core_config(hass, {"media_dirs": {"local": str(tmp_path)}})
    await hass.async_block_till_done()

    assert await async_setup_component(hass, const.DOMAIN, {})
    await hass.async_block_till_done()

    client = await hass_client()

    resp = await client.get("/media/local/drawing.svg")
    assert resp.status == HTTPStatus.OK
    assert resp.headers["Content-Disposition"] == "attachment"
    # Applied to every response by the HTTP integration, asserted here because
    # it is what keeps the type from being sniffed into something executable
    assert resp.headers["X-Content-Type-Options"] == "nosniff"

    resp = await client.head("/media/local/drawing.svg")
    assert resp.status == HTTPStatus.OK
    assert resp.headers["Content-Disposition"] == "attachment"
    assert resp.headers["X-Content-Type-Options"] == "nosniff"


BASE_ID = "media-source://media_source/test_dir"


async def _call(
    client: MockHAClientWebSocket, command: str, **data: object
) -> dict[str, Any]:
    """Send one media folder command and return its answer."""
    await client.send_json_auto_id(
        {"type": f"media_source/local_source/{command}", **data}
    )
    return await client.receive_json()


async def test_create_folder(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator, temp_dir: str
) -> None:
    """Test creating a folder at the top and inside another folder."""
    client = await hass_ws_client(hass)

    msg = await _call(
        client, "create_folder", parent_media_content_id=BASE_ID, name="Holiday"
    )
    assert msg["success"]
    assert msg["result"] == {"media_content_id": f"{BASE_ID}/Holiday"}
    assert (Path(temp_dir) / "Holiday").is_dir()

    msg = await _call(
        client,
        "create_folder",
        parent_media_content_id=f"{BASE_ID}/Holiday",
        name="Day 1",
    )
    assert msg["success"]
    assert (Path(temp_dir) / "Holiday" / "Day 1").is_dir()


@pytest.mark.parametrize(
    "name",
    [
        "",
        ".",
        "..",
        ".hidden",
        "a/b",
        "a\\b",
        "bad\x00name",
        "bad\nname",
        "~home",
        " padded",
        "x" * 256,
    ],
)
async def test_create_folder_invalid_name(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator, temp_dir: str, name: str
) -> None:
    """Test a bad folder name is refused and nothing is created."""
    client = await hass_ws_client(hass)

    msg = await _call(
        client, "create_folder", parent_media_content_id=BASE_ID, name=name
    )
    assert not msg["success"]
    assert msg["error"]["code"] == "invalid_name"
    assert list(Path(temp_dir).iterdir()) == []


async def test_create_folder_errors(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator, temp_dir: str
) -> None:
    """Test the existing name, missing parent and bad id answers."""
    (Path(temp_dir) / "taken").mkdir()
    client = await hass_ws_client(hass)

    msg = await _call(
        client, "create_folder", parent_media_content_id=BASE_ID, name="taken"
    )
    assert msg["error"]["code"] == "exists"

    msg = await _call(
        client,
        "create_folder",
        parent_media_content_id=f"{BASE_ID}/missing",
        name="x",
    )
    assert msg["error"]["code"] == "not_found"

    msg = await _call(
        client,
        "create_folder",
        parent_media_content_id=f"{BASE_ID}/../x",
        name="x",
    )
    assert msg["error"]["code"] == websocket_api.ERR_INVALID_FORMAT

    msg = await _call(
        client, "create_folder", parent_media_content_id="http://bla", name="x"
    )
    assert msg["error"]["code"] == websocket_api.ERR_INVALID_FORMAT


async def test_rename(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator, temp_dir: str
) -> None:
    """Test renaming a file and a folder."""
    (Path(temp_dir) / "old.png").touch()
    (Path(temp_dir) / "folder").mkdir()
    client = await hass_ws_client(hass)

    msg = await _call(
        client, "rename", media_content_id=f"{BASE_ID}/old.png", new_name="new.png"
    )
    assert msg["success"]
    assert msg["result"] == {"media_content_id": f"{BASE_ID}/new.png"}
    assert (Path(temp_dir) / "new.png").is_file()
    assert not (Path(temp_dir) / "old.png").exists()

    msg = await _call(
        client, "rename", media_content_id=f"{BASE_ID}/folder", new_name="renamed"
    )
    assert msg["success"]
    assert (Path(temp_dir) / "renamed").is_dir()


@pytest.mark.parametrize(
    ("new_name", "code"),
    [
        ("other.png", "exists"),
        ("notes.txt", "invalid_name"),
        ("a/b.png", "invalid_name"),
        ("..", "invalid_name"),
        ("", "invalid_name"),
    ],
)
async def test_rename_errors(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    temp_dir: str,
    new_name: str,
    code: str,
) -> None:
    """Test a refused rename leaves everything where it was."""
    (Path(temp_dir) / "a.png").touch()
    (Path(temp_dir) / "other.png").touch()
    client = await hass_ws_client(hass)

    msg = await _call(
        client, "rename", media_content_id=f"{BASE_ID}/a.png", new_name=new_name
    )
    assert msg["error"]["code"] == code
    assert sorted(path.name for path in Path(temp_dir).iterdir()) == [
        "a.png",
        "other.png",
    ]


async def test_rename_missing_and_root(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator, temp_dir: str
) -> None:
    """Test renaming something that is absent, and the media folder itself."""
    client = await hass_ws_client(hass)

    msg = await _call(
        client, "rename", media_content_id=f"{BASE_ID}/nope.png", new_name="x.png"
    )
    assert msg["error"]["code"] == "not_found"

    msg = await _call(client, "rename", media_content_id=BASE_ID, new_name="x")
    assert msg["error"]["code"] == "not_allowed"
    assert Path(temp_dir).is_dir()


async def test_move(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator, temp_dir: str
) -> None:
    """Test moving a file and a folder into another folder."""
    (Path(temp_dir) / "dest").mkdir()
    (Path(temp_dir) / "pic.png").touch()
    (Path(temp_dir) / "album").mkdir()
    (Path(temp_dir) / "album" / "inner.png").touch()
    client = await hass_ws_client(hass)

    msg = await _call(
        client,
        "move",
        media_content_id=f"{BASE_ID}/pic.png",
        destination_media_content_id=f"{BASE_ID}/dest",
    )
    assert msg["success"]
    assert msg["result"] == {"media_content_id": f"{BASE_ID}/dest/pic.png"}
    assert (Path(temp_dir) / "dest" / "pic.png").is_file()

    msg = await _call(
        client,
        "move",
        media_content_id=f"{BASE_ID}/album",
        destination_media_content_id=f"{BASE_ID}/dest",
    )
    assert msg["success"]
    assert (Path(temp_dir) / "dest" / "album" / "inner.png").is_file()


@pytest.mark.parametrize(
    ("source_path", "destination_path", "code"),
    [
        ("a", "a/b", "not_allowed"),
        ("a", "a", "not_allowed"),
        ("pic.png", "dest", "exists"),
        ("pic.png", "missing", "not_found"),
        ("pic.png", "pic.png", "not_allowed"),
        ("ghost.png", "dest", "not_found"),
        ("", "dest", "not_allowed"),
        ("pic.png", "../dest", websocket_api.ERR_INVALID_FORMAT),
    ],
)
async def test_move_errors(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    temp_dir: str,
    source_path: str,
    destination_path: str,
    code: str,
) -> None:
    """Test moves that are refused."""
    root = Path(temp_dir)
    (root / "a" / "b").mkdir(parents=True)
    (root / "dest").mkdir()
    (root / "dest" / "pic.png").touch()
    (root / "pic.png").touch()
    client = await hass_ws_client(hass)

    msg = await _call(
        client,
        "move",
        media_content_id=f"{BASE_ID}/{source_path}".rstrip("/"),
        destination_media_content_id=f"{BASE_ID}/{destination_path}",
    )
    assert msg["error"]["code"] == code
    assert (root / "pic.png").is_file()
    assert (root / "a" / "b").is_dir()


async def test_move_between_sources_refused(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator, tmp_path: Path
) -> None:
    """Test an item cannot move into a different media directory."""
    first = tmp_path / "first"
    second = tmp_path / "second"
    first.mkdir()
    second.mkdir()
    (first / "pic.png").touch()
    await async_process_ha_core_config(
        hass, {"media_dirs": {"one": str(first), "two": str(second)}}
    )
    assert await async_setup_component(hass, const.DOMAIN, {})
    client = await hass_ws_client(hass)

    msg = await _call(
        client,
        "move",
        media_content_id="media-source://media_source/one/pic.png",
        destination_media_content_id="media-source://media_source/two",
    )
    assert msg["error"]["code"] == "not_allowed"
    assert (first / "pic.png").is_file()


async def test_remove_folder(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator, temp_dir: str
) -> None:
    """Test removing an empty folder, and a full one only when recursive."""
    root = Path(temp_dir)
    (root / "empty").mkdir()
    (root / "full" / "sub").mkdir(parents=True)
    (root / "full" / "a.png").touch()
    (root / "full" / "sub" / "b.png").touch()
    client = await hass_ws_client(hass)

    msg = await _call(client, "remove_folder", media_content_id=f"{BASE_ID}/empty")
    assert msg["success"]
    assert msg["result"] == {"files": 0, "folders": 1}
    assert not (root / "empty").exists()

    msg = await _call(client, "folder_info", media_content_id=f"{BASE_ID}/full")
    assert msg["result"] == {"files": 2, "folders": 1}

    msg = await _call(client, "remove_folder", media_content_id=f"{BASE_ID}/full")
    assert msg["error"]["code"] == "not_empty"
    assert (root / "full" / "a.png").is_file()

    msg = await _call(
        client, "remove_folder", media_content_id=f"{BASE_ID}/full", recursive=True
    )
    assert msg["success"]
    assert msg["result"] == {"files": 2, "folders": 2}
    assert not (root / "full").exists()


async def test_remove_folder_errors(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator, temp_dir: str
) -> None:
    """Test refused folder removals."""
    (Path(temp_dir) / "pic.png").touch()
    client = await hass_ws_client(hass)

    msg = await _call(client, "remove_folder", media_content_id=f"{BASE_ID}/missing")
    assert msg["error"]["code"] == "not_found"

    msg = await _call(client, "remove_folder", media_content_id=f"{BASE_ID}/pic.png")
    assert msg["error"]["code"] == "not_allowed"

    msg = await _call(client, "remove_folder", media_content_id=BASE_ID, recursive=True)
    assert msg["error"]["code"] == "not_allowed"
    assert Path(temp_dir).is_dir()


async def test_symlinks_are_not_followed_out(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    temp_dir: str,
    tmp_path: Path,
) -> None:
    """Test a link pointing outside the media directory is never followed."""
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "secret.png").touch()
    root = Path(temp_dir)
    try:
        (root / "link").symlink_to(outside, target_is_directory=True)
    except OSError:
        pytest.skip("Symlinks are not available")
    (root / "pic.png").touch()
    client = await hass_ws_client(hass)

    msg = await _call(
        client,
        "create_folder",
        parent_media_content_id=f"{BASE_ID}/link",
        name="x",
    )
    assert msg["error"]["code"] == "not_allowed"

    msg = await _call(
        client,
        "move",
        media_content_id=f"{BASE_ID}/pic.png",
        destination_media_content_id=f"{BASE_ID}/link",
    )
    assert msg["error"]["code"] == "not_allowed"

    msg = await _call(
        client, "remove_folder", media_content_id=f"{BASE_ID}/link", recursive=True
    )
    assert msg["error"]["code"] == "not_allowed"

    msg = await _call(
        client, "rename", media_content_id=f"{BASE_ID}/link", new_name="moved"
    )
    assert msg["error"]["code"] == "not_allowed"

    msg = await _call(
        client,
        "rename",
        media_content_id=f"{BASE_ID}/link/secret.png",
        new_name="other.png",
    )
    assert msg["error"]["code"] == "not_allowed"
    assert (outside / "secret.png").is_file()
    assert (root / "link").is_symlink()


@pytest.mark.parametrize(
    ("command", "data"),
    [
        ("create_folder", {"parent_media_content_id": BASE_ID, "name": "made"}),
        ("rename", {"media_content_id": f"{BASE_ID}/pic.png", "new_name": "x.png"}),
        (
            "move",
            {
                "media_content_id": f"{BASE_ID}/pic.png",
                "destination_media_content_id": f"{BASE_ID}/dest",
            },
        ),
        ("remove_folder", {"media_content_id": f"{BASE_ID}/dest"}),
        ("folder_info", {"media_content_id": f"{BASE_ID}/dest"}),
    ],
)
async def test_folder_commands_require_admin(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    temp_dir: str,
    hass_admin_user: MockUser,
    command: str,
    data: dict[str, str],
) -> None:
    """Test none of the folder commands work for a non-admin user."""
    root = Path(temp_dir)
    (root / "dest").mkdir()
    (root / "pic.png").touch()
    client = await hass_ws_client(hass)
    hass_admin_user.groups = []

    msg = await _call(client, command, **data)
    assert not msg["success"]
    assert msg["error"]["code"] == websocket_api.ERR_UNAUTHORIZED
    assert (root / "dest").is_dir()
    assert (root / "pic.png").is_file()
    assert not (root / "made").exists()
