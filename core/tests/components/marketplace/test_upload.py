"""Tests for adding something to Home Assistant from an uploaded archive."""

from http import HTTPStatus
import io
import json
from pathlib import Path
import stat
from typing import Any
from unittest.mock import patch
import zipfile

from aiohttp import FormData
import pytest
from pytest_homeassistant.common import async_mock_service
from pytest_homeassistant.typing import ClientSessionGenerator

from homeassistant.components.marketplace.const import DOMAIN, RESTART_ISSUE_PREFIX
from homeassistant.components.marketplace.upload import UPLOAD_MARKER
from homeassistant.core import HomeAssistant
from homeassistant.helpers import issue_registry as ir

URL = "/api/marketplace/upload"

INTEGRATION_FILES = {
    "demo-main/README.md": b"demo",
    "demo-main/custom_components/demo_x/__init__.py": b"",
    "demo-main/custom_components/demo_x/manifest.json": json.dumps(
        {"domain": "demo_x", "name": "Demo X", "version": "1.2.0"}
    ).encode(),
    "demo-main/custom_components/demo_x/.git/HEAD": b"ref",
}
INTEGRATION_SOURCE = "demo-main/custom_components/demo_x"


def _zip(files: dict[str, bytes], *, links: tuple[str, ...] = ()) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, data in files.items():
            archive.writestr(name, data)
        for name in links:
            info = zipfile.ZipInfo(name)
            info.create_system = 3
            info.external_attr = (stat.S_IFLNK | 0o777) << 16
            archive.writestr(info, "/etc/passwd")
    return buffer.getvalue()


def _assert_no_staging_left(config_dir: Path) -> None:
    assert not [
        path
        for path in config_dir.iterdir()
        if path.name.startswith(".marketplace_upload_")
    ]


def _assert_nothing_added(config_dir: Path) -> None:
    _assert_no_staging_left(config_dir)
    for name in ("custom_components", "themes", "custom_templates", "blueprints"):
        assert not (config_dir / name).exists()


async def _upload(
    hass: HomeAssistant,
    hass_client: ClientSessionGenerator,
    data: bytes,
    kind: str,
    source: str,
    *,
    filename: str = "demo-main.zip",
    token: str | None = None,
) -> tuple[int, dict[str, Any]]:
    client = await (hass_client(token) if token else hass_client())
    form = FormData()
    form.add_field("kind", kind)
    form.add_field("source", source)
    form.add_field(
        "file", data, filename=filename, content_type="application/zip"
    )
    response = await client.post(URL, data=form)
    return response.status, await response.json()


@pytest.mark.usefixtures("init_integration")
async def test_adds_an_integration(
    hass: HomeAssistant, hass_client: ClientSessionGenerator, config_dir: Path
) -> None:
    """Test that the chosen integration is placed without the history folder."""
    status, body = await _upload(
        hass,
        hass_client,
        _zip(INTEGRATION_FILES),
        "integration",
        INTEGRATION_SOURCE,
    )

    assert status == HTTPStatus.CREATED
    assert body == {
        "kind": "integration",
        "name": "Demo X",
        "path": "custom_components/demo_x",
        "restart_required": True,
        "resource_url": None,
        "resource_added": False,
    }
    target = config_dir / "custom_components" / "demo_x"
    assert sorted(path.name for path in target.iterdir()) == [
        UPLOAD_MARKER,
        "__init__.py",
        "manifest.json",
    ]
    _assert_no_staging_left(config_dir)
    assert ir.async_get(hass).async_get_issue(
        DOMAIN, f"{RESTART_ISSUE_PREFIX}upload_demo_x"
    )


@pytest.mark.usefixtures("init_integration")
async def test_an_earlier_upload_is_replaced(
    hass: HomeAssistant, hass_client: ClientSessionGenerator, config_dir: Path
) -> None:
    """Test that adding the same thing again replaces what an upload put there."""
    first = _zip(INTEGRATION_FILES)
    second = _zip(
        {
            **INTEGRATION_FILES,
            f"{INTEGRATION_SOURCE}/new.py": b"new",
        }
    )

    await _upload(hass, hass_client, first, "integration", INTEGRATION_SOURCE)
    status, _ = await _upload(
        hass, hass_client, second, "integration", INTEGRATION_SOURCE
    )

    assert status == HTTPStatus.CREATED
    assert (config_dir / "custom_components" / "demo_x" / "new.py").is_file()
    assert not (config_dir / "custom_components" / "demo_x.marketplace-old").exists()


@pytest.mark.usefixtures("init_integration")
async def test_something_else_in_the_way_is_left_alone(
    hass: HomeAssistant, hass_client: ClientSessionGenerator, config_dir: Path
) -> None:
    """Test that a folder an upload did not create is never overwritten."""
    existing = config_dir / "custom_components" / "demo_x"
    existing.mkdir(parents=True)
    (existing / "mine.py").write_text("mine")

    status, body = await _upload(
        hass, hass_client, _zip(INTEGRATION_FILES), "integration", INTEGRATION_SOURCE
    )

    assert status == HTTPStatus.BAD_REQUEST
    assert body["code"] == "upload_target_exists"
    assert [path.name for path in existing.iterdir()] == ["mine.py"]


@pytest.mark.usefixtures("init_integration")
async def test_a_built_in_domain_is_refused(
    hass: HomeAssistant, hass_client: ClientSessionGenerator, config_dir: Path
) -> None:
    """Test that a custom integration can not take over a built-in one this way."""
    files = {
        "custom_components/sun/manifest.json": json.dumps({"domain": "sun"}).encode()
    }

    status, body = await _upload(
        hass, hass_client, _zip(files), "integration", "custom_components/sun"
    )

    assert status == HTTPStatus.BAD_REQUEST
    assert body["code"] == "upload_built_in"
    assert not (config_dir / "custom_components").exists()


@pytest.mark.usefixtures("init_integration")
async def test_adds_a_theme(
    hass: HomeAssistant, hass_client: ClientSessionGenerator, config_dir: Path
) -> None:
    """Test that a theme goes to its own folder and the themes reload."""
    reloads = async_mock_service(hass, "frontend", "reload_themes")
    files = {"themes-main/themes/ocean.yaml": b"Ocean:\n  primary-color: '#123456'\n"}

    status, body = await _upload(
        hass,
        hass_client,
        _zip(files),
        "theme",
        "themes-main/themes",
        filename="themes-main.zip",
    )

    assert status == HTTPStatus.CREATED
    assert body["path"] == "themes/themes"
    assert (config_dir / "themes" / "themes" / "ocean.yaml").is_file()
    assert len(reloads) == 1


@pytest.mark.usefixtures("init_integration")
async def test_a_broken_theme_is_not_added(
    hass: HomeAssistant, hass_client: ClientSessionGenerator, config_dir: Path
) -> None:
    """Test that a theme the frontend can not load never reaches the folder."""
    files = {"themes/bad.yaml": b"Bad: [unclosed\n"}

    status, body = await _upload(
        hass, hass_client, _zip(files), "theme", "themes"
    )

    assert status == HTTPStatus.BAD_REQUEST
    assert body["code"] == "upload_theme_invalid"
    assert not (config_dir / "themes").exists()


@pytest.mark.usefixtures("init_integration")
async def test_adds_a_template(
    hass: HomeAssistant, hass_client: ClientSessionGenerator, config_dir: Path
) -> None:
    """Test that a template file goes to the shared templates folder."""
    reloads = async_mock_service(hass, "homeassistant", "reload_custom_templates")
    files = {
        "hacs.json": b'{"filename": "macros.jinja"}',
        "macros.jinja": b"{% macro hello() %}hi{% endmacro %}",
    }

    status, body = await _upload(
        hass, hass_client, _zip(files), "template", "macros.jinja"
    )

    assert status == HTTPStatus.CREATED
    assert body["path"] == "custom_templates/macros.jinja"
    assert (config_dir / "custom_templates" / "macros.jinja").is_file()
    assert len(reloads) == 1


@pytest.mark.usefixtures("init_integration")
async def test_adds_a_blueprint(
    hass: HomeAssistant, hass_client: ClientSessionGenerator, config_dir: Path
) -> None:
    """Test that a blueprint goes below the folder of its kind."""
    source = "bp/blueprints/automation/author/motion.yaml"
    files = {
        source: b"blueprint:\n  name: Motion light\n  domain: automation\n  input: {}\n"
    }

    status, body = await _upload(hass, hass_client, _zip(files), "blueprint", source)

    assert status == HTTPStatus.CREATED
    assert body["path"] == "blueprints/automation/uploaded/motion.yaml"
    assert (config_dir / body["path"]).is_file()


@pytest.mark.usefixtures("init_integration")
async def test_adds_a_dashboard_card(
    hass: HomeAssistant, hass_client: ClientSessionGenerator, config_dir: Path
) -> None:
    """Test that a card goes to www/community and its resource address is returned."""
    files = {
        "lovelace-fancy-card-master/hacs.json": b'{"name": "fancy-card"}',
        "lovelace-fancy-card-master/dist/fancy-card.js": b"console.log(1)",
    }
    source = "lovelace-fancy-card-master/dist/fancy-card.js"

    status, body = await _upload(hass, hass_client, _zip(files), "plugin", source)

    assert status == HTTPStatus.CREATED
    assert body["path"] == "www/community/fancy-card"
    assert body["resource_url"].startswith("/local/community/fancy-card/fancy-card.js?v=upload-")
    assert (config_dir / "www" / "community" / "fancy-card" / "fancy-card.js").is_file()


@pytest.mark.parametrize(
    ("data", "kind", "source", "code"),
    [
        pytest.param(b"not a zip", "integration", "x", "upload_not_zip", id="not_zip"),
        pytest.param(
            _zip(INTEGRATION_FILES),
            "integration",
            "demo-main/custom_components/other",
            "upload_item_not_found",
            id="item_not_in_archive",
        ),
        pytest.param(
            _zip(INTEGRATION_FILES),
            "theme",
            INTEGRATION_SOURCE,
            "upload_item_not_found",
            id="wrong_kind",
        ),
        pytest.param(
            _zip(
                {
                    "hello/config.json": b'{"name": "Hello", "version": "1", "slug": "hello"}'
                }
            ),
            "app",
            "hello",
            "upload_not_supported",
            id="app",
        ),
        pytest.param(
            _zip({"../evil.txt": b"x", **INTEGRATION_FILES}),
            "integration",
            INTEGRATION_SOURCE,
            "upload_unsafe_path",
            id="traversal",
        ),
        pytest.param(
            _zip(INTEGRATION_FILES, links=("demo-main/link",)),
            "integration",
            INTEGRATION_SOURCE,
            "upload_link_entry",
            id="symlink",
        ),
        pytest.param(
            _zip(
                {
                    "x/custom_components/y/manifest.json": b'{"domain": "../../evil"}',
                }
            ),
            "integration",
            "x/custom_components/y",
            "upload_item_invalid",
            id="domain_with_a_path",
        ),
    ],
)
@pytest.mark.usefixtures("init_integration")
async def test_refused_uploads(
    hass: HomeAssistant,
    hass_client: ClientSessionGenerator,
    config_dir: Path,
    data: bytes,
    kind: str,
    source: str,
    code: str,
) -> None:
    """Test what is refused, and that nothing is written when it is."""
    status, body = await _upload(hass, hass_client, data, kind, source)

    assert status == HTTPStatus.BAD_REQUEST
    assert body["code"] == code
    assert body["translation_domain"] == DOMAIN
    _assert_nothing_added(config_dir)


@pytest.mark.usefixtures("init_integration")
async def test_too_large_an_archive_is_refused(
    hass: HomeAssistant, hass_client: ClientSessionGenerator, config_dir: Path
) -> None:
    """Test that an archive past the size limit stops while it is received."""
    with patch("homeassistant.components.marketplace.upload.MAX_UPLOAD_SIZE", 100):
        status, body = await _upload(
            hass,
            hass_client,
            _zip(INTEGRATION_FILES),
            "integration",
            INTEGRATION_SOURCE,
        )

    assert status == HTTPStatus.REQUEST_ENTITY_TOO_LARGE
    assert body["code"] == "upload_too_large"
    _assert_nothing_added(config_dir)


@pytest.mark.usefixtures("init_integration")
async def test_the_file_has_to_follow_the_fields(
    hass: HomeAssistant, hass_client: ClientSessionGenerator
) -> None:
    """Test that a form that sends the archive first is refused."""
    client = await hass_client()
    form = FormData()
    form.add_field("file", _zip(INTEGRATION_FILES), filename="a.zip")
    form.add_field("kind", "integration")
    form.add_field("source", INTEGRATION_SOURCE)

    response = await client.post(URL, data=form)

    assert response.status == HTTPStatus.BAD_REQUEST
    assert (await response.json())["code"] == "upload_bad_request"


@pytest.mark.usefixtures("init_integration")
async def test_requires_an_admin(
    hass: HomeAssistant,
    hass_client: ClientSessionGenerator,
    hass_read_only_access_token: str,
    config_dir: Path,
) -> None:
    """Test that a user who is not an admin can not upload."""
    client = await hass_client(hass_read_only_access_token)
    form = FormData()
    form.add_field("kind", "integration")
    form.add_field("source", INTEGRATION_SOURCE)
    form.add_field("file", _zip(INTEGRATION_FILES), filename="a.zip")

    response = await client.post(URL, data=form)

    assert response.status == HTTPStatus.UNAUTHORIZED
    assert not (config_dir / "custom_components").exists()


@pytest.mark.parametrize("warning_accepted", [None])
@pytest.mark.usefixtures("init_integration")
async def test_the_warning_has_to_be_accepted(
    hass: HomeAssistant, hass_client: ClientSessionGenerator, config_dir: Path
) -> None:
    """Test that nothing is added before the first-run warning is accepted."""
    status, body = await _upload(
        hass, hass_client, _zip(INTEGRATION_FILES), "integration", INTEGRATION_SOURCE
    )

    assert status == HTTPStatus.FORBIDDEN
    assert body["code"] == "warning_not_accepted"
    assert not (config_dir / "custom_components").exists()
