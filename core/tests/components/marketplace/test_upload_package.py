"""Tests for installing a packaged installer (.hapkg)."""

import hashlib
from http import HTTPStatus
import io
import json
from pathlib import Path
from typing import Any
import zipfile

from aiohttp import FormData
import pytest
from pytest_homeassistant.typing import ClientSessionGenerator

from homeassistant.components.marketplace.upload import UPLOAD_MARKER
from homeassistant.core import HomeAssistant

URL = "/api/marketplace/upload"
UPDATE_URL = "https://example.com/releases/index.json"
SOURCE = "custom_components/demo_x"


def package_files(version: str = "1.0.0", extra: str = "") -> dict[str, bytes]:
    """Return the files of the demo integration."""
    return {
        f"{SOURCE}/__init__.py": f"# {extra}".encode(),
        f"{SOURCE}/manifest.json": json.dumps(
            {"domain": "demo_x", "name": "Demo X", "version": version}
        ).encode(),
    }


def make_package(
    files: dict[str, bytes] | None = None,
    *,
    version: str = "1.0.0",
    kind: str = "integration",
    name: str = "demo_x",
    manifest_overrides: dict[str, Any] | None = None,
    corrupt: str | None = None,
    leave_out: str | None = None,
    add_unlisted: str | None = None,
    update_url: str | None = UPDATE_URL,
) -> bytes:
    """Build a package, with the faults a test asks for."""
    files = files if files is not None else package_files(version)
    manifest: dict[str, Any] = {
        "format": 1,
        "kind": kind,
        "domain" if kind == "integration" else "name": name,
        "version": version,
        "title": "Demo X",
        "description": "A demo",
        "source": {"repository": "owner/repo", "path": "integrations/demo_x"},
        "files": {
            path: hashlib.sha256(data).hexdigest() for path, data in files.items()
        },
    }
    if update_url:
        manifest["update_url"] = update_url
    manifest.update(manifest_overrides or {})
    if corrupt:
        manifest["files"][corrupt] = "0" * 64
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("hapkg.json", json.dumps(manifest))
        for path, data in files.items():
            if path != leave_out:
                archive.writestr(path, data)
        if add_unlisted:
            archive.writestr(add_unlisted, b"surprise")
    return buffer.getvalue()


async def upload_package(
    hass: HomeAssistant,
    hass_client: ClientSessionGenerator,
    data: bytes,
    *,
    kind: str = "integration",
    source: str = SOURCE,
    filename: str = "demo_x.hapkg",
) -> tuple[int, dict[str, Any]]:
    """Send a package to the upload endpoint."""
    client = await hass_client()
    form = FormData()
    form.add_field("kind", kind)
    form.add_field("source", source)
    form.add_field("file", data, filename=filename)
    response = await client.post(URL, data=form)
    return response.status, await response.json()


@pytest.mark.usefixtures("init_integration")
async def test_a_package_is_installed_with_its_provenance(
    hass: HomeAssistant, hass_client: ClientSessionGenerator, config_dir: Path
) -> None:
    """Test that a good package installs and records where it came from."""
    status, body = await upload_package(hass, hass_client, make_package())

    assert status == HTTPStatus.CREATED
    assert body["title"] == "Demo X"
    assert body["version"] == "1.0.0"
    target = config_dir / "custom_components" / "demo_x"
    assert (target / "manifest.json").is_file()
    assert not (target / "hapkg.json").exists()
    marker = json.loads((target / UPLOAD_MARKER).read_text())
    assert marker["version"] == "1.0.0"
    assert marker["package"]["source"] == {
        "repository": "owner/repo",
        "path": "integrations/demo_x",
    }
    assert marker["package"]["update_url"] == UPDATE_URL
    assert marker["package"]["auto_update"] is True


@pytest.mark.usefixtures("init_integration")
async def test_a_plain_zip_still_works(
    hass: HomeAssistant, hass_client: ClientSessionGenerator, config_dir: Path
) -> None:
    """Test that an archive without a manifest is installed as before."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr(
            "themes-main/themes/ocean.yaml", "Ocean:\n  primary-color: '#123456'\n"
        )

    status, body = await upload_package(
        hass,
        hass_client,
        buffer.getvalue(),
        kind="theme",
        source="themes-main/themes",
        filename="themes-main.zip",
    )

    assert status == HTTPStatus.CREATED
    assert body["title"] is None
    assert (config_dir / "themes" / "themes" / "ocean.yaml").is_file()


@pytest.mark.parametrize(
    ("package", "code"),
    [
        pytest.param(
            make_package(corrupt=f"{SOURCE}/__init__.py"),
            "upload_package_checksum",
            id="bad_checksum",
        ),
        pytest.param(
            make_package(add_unlisted=f"{SOURCE}/extra.py"),
            "upload_package_unlisted",
            id="unlisted_file",
        ),
        pytest.param(
            make_package(leave_out=f"{SOURCE}/__init__.py"),
            "upload_package_missing",
            id="listed_file_missing",
        ),
        pytest.param(
            make_package(manifest_overrides={"format": 2}),
            "upload_package_format",
            id="unknown_format",
        ),
        pytest.param(
            make_package(manifest_overrides={"kind": "theme", "name": "demo_x"}),
            "upload_package_kind",
            id="wrong_kind",
        ),
        pytest.param(
            make_package(manifest_overrides={"domain": "other"}),
            "upload_package_kind",
            id="wrong_domain",
        ),
        pytest.param(
            make_package(manifest_overrides={"version": ""}),
            "upload_package_invalid",
            id="empty_version",
        ),
        pytest.param(
            make_package(update_url="http://example.com/index.json"),
            "upload_package_update_url",
            id="update_url_not_https",
        ),
    ],
)
@pytest.mark.usefixtures("init_integration")
async def test_a_bad_package_is_refused(
    hass: HomeAssistant,
    hass_client: ClientSessionGenerator,
    config_dir: Path,
    package: bytes,
    code: str,
) -> None:
    """Test that every fault in a package is refused and nothing is written."""
    status, body = await upload_package(hass, hass_client, package)

    assert status == HTTPStatus.BAD_REQUEST
    assert body["code"] == code
    assert not (config_dir / "custom_components").exists()
