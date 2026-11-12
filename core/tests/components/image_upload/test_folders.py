"""Test the folders of the image store."""

from collections.abc import AsyncGenerator
import json
import pathlib
import tempfile
from typing import Any
from unittest.mock import patch

from aiohttp import ClientSession
import pytest
from pytest_homeassistant.typing import ClientSessionGenerator, WebSocketGenerator

from homeassistant.components import media_source
from homeassistant.components.image_upload import DOMAIN
from homeassistant.components.media_player import BrowseError
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component

from . import TEST_IMAGE


@pytest.fixture
async def image_dir(hass: HomeAssistant) -> AsyncGenerator[pathlib.Path]:
    """Set up the image store in a temporary config folder."""
    with (
        tempfile.TemporaryDirectory() as tempdir,
        patch.object(
            hass.config,
            "path",
            side_effect=lambda *a: str(pathlib.Path(tempdir, *a)),
        ),
    ):
        assert await async_setup_component(hass, "media_source", {})
        assert await async_setup_component(hass, DOMAIN, {})
        yield pathlib.Path(tempdir)


async def _upload(
    client: ClientSession, folder: str | None = None, expect: int = 200
) -> dict[str, Any]:
    """Upload the test image, optionally into a folder."""
    with TEST_IMAGE.open("rb") as fp:
        data: dict[str, Any] = {"file": fp}
        if folder is not None:
            data["folder"] = folder
        res = await client.post("/api/image/upload", data=data)
    assert res.status == expect
    return await res.json() if expect == 200 else {}


async def _call(ws: Any, msg_id: int, **kwargs: Any) -> dict[str, Any]:
    """Send one command and return its answer."""
    await ws.send_json({"id": msg_id, **kwargs})
    return await ws.receive_json()


async def test_create_list_and_nested(
    image_dir: pathlib.Path, hass_ws_client: WebSocketGenerator
) -> None:
    """Folders are created, nested and listed with their counts."""
    ws = await hass_ws_client()

    msg = await _call(ws, 1, type="image/folder/create", name="Holiday")
    assert msg["success"]
    assert msg["result"] == {"path": "Holiday"}
    msg = await _call(
        ws, 2, type="image/folder/create", parent="Holiday", name="2026"
    )
    assert msg["result"] == {"path": "Holiday/2026"}

    msg = await _call(ws, 3, type="image/folder/list")
    assert msg["result"] == {
        "folders": [
            {
                "path": "Holiday",
                "name": "Holiday",
                "parent": "",
                "images": 0,
                "folders": 1,
            },
            {
                "path": "Holiday/2026",
                "name": "2026",
                "parent": "Holiday",
                "images": 0,
                "folders": 0,
            },
        ],
        "root": {"images": 0, "folders": 1},
    }


@pytest.mark.parametrize(
    ("name", "code"),
    [
        ("", "invalid_name"),
        (".", "invalid_name"),
        ("..", "invalid_name"),
        ("a/b", "invalid_name"),
        ("a\\b", "invalid_name"),
        (" lead", "invalid_name"),
        ("trail ", "invalid_name"),
        ("bad\x00name", "invalid_name"),
        ("x" * 101, "invalid_name"),
    ],
)
async def test_create_invalid_name(
    image_dir: pathlib.Path,
    hass_ws_client: WebSocketGenerator,
    name: str,
    code: str,
) -> None:
    """An invalid name is refused with a stable code."""
    ws = await hass_ws_client()
    msg = await _call(ws, 1, type="image/folder/create", name=name)
    assert not msg["success"]
    assert msg["error"]["code"] == code


async def test_create_clash_and_missing_parent_and_depth(
    image_dir: pathlib.Path, hass_ws_client: WebSocketGenerator
) -> None:
    """Names clash regardless of letter case; parents must exist; depth is bounded."""
    ws = await hass_ws_client()
    assert (await _call(ws, 1, type="image/folder/create", name="Pets"))["success"]

    msg = await _call(ws, 2, type="image/folder/create", name="pets")
    assert msg["error"]["code"] == "exists"

    msg = await _call(ws, 3, type="image/folder/create", parent="Nope", name="a")
    assert msg["error"]["code"] == "not_found"

    parent = ""
    for index in range(6):
        msg = await _call(
            ws, 10 + index, type="image/folder/create", parent=parent, name=f"d{index}"
        )
        assert msg["success"]
        parent = msg["result"]["path"]
    msg = await _call(ws, 20, type="image/folder/create", parent=parent, name="deep")
    assert msg["error"]["code"] == "too_deep"


@pytest.mark.parametrize("path", ["/lead", "trail/", "a//b", "a/../b", "a/./b"])
async def test_invalid_paths_refused(
    image_dir: pathlib.Path, hass_ws_client: WebSocketGenerator, path: str
) -> None:
    """Folder paths with empty or dot segments are refused everywhere."""
    ws = await hass_ws_client()
    msg = await _call(ws, 1, type="image/folder/create", parent=path, name="x")
    assert msg["error"]["code"] == "invalid_name"
    msg = await _call(ws, 2, type="image/move", image_ids=["x"], folder=path)
    assert msg["error"]["code"] == "invalid_name"


async def test_upload_into_folder(
    image_dir: pathlib.Path,
    hass_client: ClientSessionGenerator,
    hass_ws_client: WebSocketGenerator,
) -> None:
    """An upload goes into the named folder; an unknown folder is refused."""
    client = await hass_client()
    ws = await hass_ws_client()
    await _call(ws, 1, type="image/folder/create", name="Holiday")

    item = await _upload(client, "Holiday")
    assert item["folder"] == "Holiday"
    root_item = await _upload(client)
    assert root_item["folder"] == ""

    await _upload(client, "Missing", expect=400)
    await _upload(client, "../evil", expect=400)

    msg = await _call(ws, 2, type="image/folder/list")
    assert msg["result"]["folders"][0]["images"] == 1
    assert msg["result"]["root"]["images"] == 1


async def test_move_images_and_serve_urls_unchanged(
    image_dir: pathlib.Path,
    hass_client: ClientSessionGenerator,
    hass_ws_client: WebSocketGenerator,
) -> None:
    """Moving an image changes its folder only: id, files and serve URL stay."""
    client = await hass_client()
    ws = await hass_ws_client()
    first = await _upload(client)
    second = await _upload(client)
    await _call(ws, 1, type="image/folder/create", name="Box")

    msg = await _call(
        ws, 2, type="image/move", image_ids=[first["id"], second["id"]], folder="Box"
    )
    assert msg["result"] == {"moved": 2}

    msg = await _call(ws, 3, type="image/list")
    assert {item["id"]: item["folder"] for item in msg["result"]} == {
        first["id"]: "Box",
        second["id"]: "Box",
    }
    assert (image_dir / "image" / first["id"] / "original").is_file()
    res = await client.get(f"/api/image/serve/{first['id']}/original")
    assert res.status == 200
    assert await res.read() == TEST_IMAGE.read_bytes()

    msg = await _call(ws, 4, type="image/move", image_ids=[first["id"]], folder="")
    assert msg["result"] == {"moved": 1}


async def test_move_unknown_image_or_folder_changes_nothing(
    image_dir: pathlib.Path,
    hass_client: ClientSessionGenerator,
    hass_ws_client: WebSocketGenerator,
) -> None:
    """An unknown image or folder leaves every image where it was."""
    client = await hass_client()
    ws = await hass_ws_client()
    item = await _upload(client)
    await _call(ws, 1, type="image/folder/create", name="Box")

    msg = await _call(
        ws, 2, type="image/move", image_ids=[item["id"], "nope"], folder="Box"
    )
    assert msg["error"]["code"] == "not_found"
    msg = await _call(ws, 3, type="image/move", image_ids=[item["id"]], folder="Nope")
    assert msg["error"]["code"] == "not_found"
    msg = await _call(ws, 4, type="image/list")
    assert msg["result"][0]["folder"] == ""


async def test_rename_moves_images_and_subfolders(
    image_dir: pathlib.Path,
    hass_client: ClientSessionGenerator,
    hass_ws_client: WebSocketGenerator,
) -> None:
    """Renaming a folder carries its images and subfolders along."""
    client = await hass_client()
    ws = await hass_ws_client()
    await _call(ws, 1, type="image/folder/create", name="Old")
    await _call(ws, 2, type="image/folder/create", parent="Old", name="Sub")
    await _call(ws, 3, type="image/folder/create", name="Other")
    top = await _upload(client, "Old")
    deep = await _upload(client, "Old/Sub")

    msg = await _call(ws, 4, type="image/folder/rename", path="Old", new_name="Other")
    assert msg["error"]["code"] == "exists"
    msg = await _call(ws, 5, type="image/folder/rename", path="Old", new_name="New")
    assert msg["result"] == {"path": "New"}

    msg = await _call(ws, 6, type="image/list")
    assert {item["id"]: item["folder"] for item in msg["result"]} == {
        top["id"]: "New",
        deep["id"]: "New/Sub",
    }
    msg = await _call(ws, 7, type="image/folder/list")
    assert [folder["path"] for folder in msg["result"]["folders"]] == [
        "New",
        "New/Sub",
        "Other",
    ]

    msg = await _call(ws, 8, type="image/folder/rename", path="New", new_name="new")
    assert msg["result"] == {"path": "new"}
    msg = await _call(ws, 9, type="image/folder/rename", path="", new_name="x")
    assert msg["error"]["code"] == "not_allowed"
    msg = await _call(ws, 10, type="image/folder/rename", path="Gone", new_name="x")
    assert msg["error"]["code"] == "not_found"


async def test_remove_folder(
    image_dir: pathlib.Path,
    hass_client: ClientSessionGenerator,
    hass_ws_client: WebSocketGenerator,
) -> None:
    """Empty folders go; others are refused unless contents move up; images stay."""
    client = await hass_client()
    ws = await hass_ws_client()
    await _call(ws, 1, type="image/folder/create", name="Empty")
    await _call(ws, 2, type="image/folder/create", name="Full")
    await _call(ws, 3, type="image/folder/create", parent="Full", name="Sub")
    item = await _upload(client, "Full")
    deep = await _upload(client, "Full/Sub")

    msg = await _call(ws, 4, type="image/folder/remove", path="Empty")
    assert msg["success"]
    msg = await _call(ws, 5, type="image/folder/remove", path="Full")
    assert msg["error"]["code"] == "not_empty"
    msg = await _call(ws, 6, type="image/folder/remove", path="Empty")
    assert msg["error"]["code"] == "not_found"
    msg = await _call(ws, 7, type="image/folder/remove", path="")
    assert msg["error"]["code"] == "not_allowed"

    msg = await _call(
        ws, 8, type="image/folder/remove", path="Full", move_to_parent=True
    )
    assert msg["result"] == {"moved_images": 1, "moved_folders": 1}
    msg = await _call(ws, 9, type="image/list")
    assert {i["id"]: i["folder"] for i in msg["result"]} == {
        item["id"]: "",
        deep["id"]: "Sub",
    }
    assert (image_dir / "image" / item["id"] / "original").is_file()


async def test_remove_folder_move_clash(
    image_dir: pathlib.Path, hass_ws_client: WebSocketGenerator
) -> None:
    """Moving contents up is refused when a subfolder name is already taken."""
    ws = await hass_ws_client()
    await _call(ws, 1, type="image/folder/create", name="A")
    await _call(ws, 2, type="image/folder/create", name="Same")
    await _call(ws, 3, type="image/folder/create", parent="A", name="Same")
    msg = await _call(ws, 4, type="image/folder/remove", path="A", move_to_parent=True)
    assert msg["error"]["code"] == "exists"
    msg = await _call(ws, 5, type="image/folder/list")
    assert len(msg["result"]["folders"]) == 3


async def test_commands_need_admin(
    image_dir: pathlib.Path,
    hass_ws_client: WebSocketGenerator,
    hass_admin_user: Any,
) -> None:
    """A user who is not an administrator cannot use the commands."""
    hass_admin_user.groups = []
    ws = await hass_ws_client()
    for index, command in enumerate(
        (
            {"type": "image/folder/list"},
            {"type": "image/folder/create", "name": "x"},
            {"type": "image/folder/rename", "path": "x", "new_name": "y"},
            {"type": "image/folder/remove", "path": "x"},
            {"type": "image/move", "image_ids": ["x"], "folder": ""},
        )
    ):
        msg = await _call(ws, index + 1, **command)
        assert msg["error"]["code"] == "unauthorized"


async def test_old_stored_shape_is_valid(
    hass: HomeAssistant,
    hass_client: ClientSessionGenerator,
    hass_ws_client: WebSocketGenerator,
    hass_storage: dict[str, Any],
) -> None:
    """Images stored before folders existed load in the root and still serve."""
    with tempfile.TemporaryDirectory() as tempdir:
        folder = pathlib.Path(tempdir, "image", "abc123")
        folder.mkdir(parents=True)
        (folder / "original").write_bytes(TEST_IMAGE.read_bytes())
        hass_storage["image"] = {
            "version": 1,
            "minor_version": 1,
            "key": "image",
            "data": {
                "items": [
                    {
                        "id": "abc123",
                        "filesize": 38847,
                        "content_type": "image/png",
                        "name": "old.png",
                        "uploaded_at": "2020-01-01T00:00:00+00:00",
                    }
                ]
            },
        }
        with patch.object(
            hass.config,
            "path",
            side_effect=lambda *a: str(pathlib.Path(tempdir, *a)),
        ):
            assert await async_setup_component(hass, "media_source", {})
            assert await async_setup_component(hass, DOMAIN, {})
            client = await hass_client()
            ws = await hass_ws_client()

            msg = await _call(ws, 1, type="image/list")
            assert msg["result"][0]["folder"] == ""
            assert msg["result"][0]["name"] == "old.png"

            res = await client.get("/api/image/serve/abc123/original")
            assert res.status == 200

            source = await media_source.async_resolve_media(
                hass, "media-source://image_upload/abc123", None
            )
            assert source.url == "/api/image/serve/abc123/original"

            browse = await media_source.async_browse_media(
                hass, "media-source://image_upload"
            )
            assert [child.identifier for child in browse.children] == ["abc123"]


async def test_folders_persist_in_storage(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    hass_storage: dict[str, Any],
) -> None:
    """Folders, empty ones included, are written to and read from storage."""
    with tempfile.TemporaryDirectory() as tempdir:
        with patch.object(
            hass.config,
            "path",
            side_effect=lambda *a: str(pathlib.Path(tempdir, *a)),
        ):
            assert await async_setup_component(hass, DOMAIN, {})
            ws = await hass_ws_client()
            await _call(ws, 1, type="image/folder/create", name="Kept")
            await _call(ws, 2, type="image/folder/create", parent="Kept", name="Inner")
            await hass.data[DOMAIN].folders._store.async_save(
                hass.data[DOMAIN].folders._data_to_save()
            )
            assert json.dumps(hass_storage["image.folders"]["data"]["folders"]) == (
                json.dumps(["Kept", "Kept/Inner"])
            )

            hass.data[DOMAIN].folders._paths.clear()
            await hass.data[DOMAIN].folders.async_load()
            msg = await _call(ws, 3, type="image/folder/list")
            assert [f["path"] for f in msg["result"]["folders"]] == [
                "Kept",
                "Kept/Inner",
            ]


async def test_browse_folders(
    image_dir: pathlib.Path,
    hass: HomeAssistant,
    hass_client: ClientSessionGenerator,
    hass_ws_client: WebSocketGenerator,
) -> None:
    """The media source lists folders first, then images, folder by folder."""
    client = await hass_client()
    ws = await hass_ws_client()
    await _call(ws, 1, type="image/folder/create", name="Holiday")
    await _call(ws, 2, type="image/folder/create", parent="Holiday", name="2026")
    root_image = await _upload(client)
    inner = await _upload(client, "Holiday")

    root = await media_source.async_browse_media(hass, "media-source://image_upload")
    assert root.title == "Image upload"
    assert [(c.title, c.can_expand) for c in root.children] == [
        ("Holiday", True),
        ("logo.png", False),
    ]
    assert root.children[0].identifier == "folder/Holiday"
    assert root.children[1].identifier == root_image["id"]

    holiday = await media_source.async_browse_media(
        hass, "media-source://image_upload/folder/Holiday"
    )
    assert holiday.title == "Holiday"
    assert [c.identifier for c in holiday.children] == [
        "folder/Holiday/2026",
        inner["id"],
    ]

    for bad in ("folder/Nope", "folder/", "folder", root_image["id"], "x"):
        with pytest.raises(BrowseError, match="Unknown item"):
            await media_source.async_browse_media(
                hass, f"media-source://image_upload/{bad}"
            )

    resolved = await media_source.async_resolve_media(
        hass, f"media-source://image_upload/{inner['id']}", None
    )
    assert resolved.url == f"/api/image/serve/{inner['id']}/original"
