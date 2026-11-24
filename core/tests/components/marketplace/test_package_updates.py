"""Tests for updating installed packages from their update index."""

import hashlib
import json
from pathlib import Path
from typing import Any

import pytest
from pytest_homeassistant.test_util.aiohttp import AiohttpClientMockResponse
from pytest_homeassistant.typing import ClientSessionGenerator
from yarl import URL

from homeassistant.components.marketplace.base import MarketplaceManager
from homeassistant.components.marketplace.const import DOMAIN, RESTART_ISSUE_PREFIX
from homeassistant.components.marketplace.package_updates import (
    STATE_FAILED,
    STATE_IDLE,
    STATE_RESTART,
)
from homeassistant.components.marketplace.upload import UPLOAD_MARKER
from homeassistant.core import HomeAssistant
from homeassistant.helpers import issue_registry as ir

from .conftest import MarketplaceResponses
from .test_upload_package import (
    SOURCE,
    UPDATE_URL,
    make_package,
    package_files,
    upload_package,
)

PACKAGE_URL = "https://example.com/releases/demo_x-1.1.0.hapkg"
KEY = "integration:demo_x"


def _index(package: bytes, version: str = "1.1.0", **changes: Any) -> bytes:
    entry = {
        "domain": "demo_x",
        "kind": "integration",
        "title": "Demo X",
        "version": version,
        "url": PACKAGE_URL,
        "sha256": hashlib.sha256(package).hexdigest(),
        "notes": "Fixes the demo.",
    }
    entry.update(changes)
    return json.dumps([entry]).encode()


async def _install_first(
    hass: HomeAssistant, hass_client: ClientSessionGenerator
) -> MarketplaceManager:
    status, _ = await upload_package(hass, hass_client, make_package())
    assert status == 201
    return hass.config_entries.async_loaded_entries(DOMAIN)[0].runtime_data


def _offer(
    responses: MarketplaceResponses, package: bytes, **index_changes: Any
) -> None:
    responses.add(
        UPDATE_URL,
        AiohttpClientMockResponse(
            "get", URL(UPDATE_URL), response=_index(package, **index_changes)
        ),
        keep=True,
    )
    responses.add(
        PACKAGE_URL,
        AiohttpClientMockResponse("get", URL(PACKAGE_URL), response=package),
        keep=True,
    )


def _new_package(**changes: Any) -> bytes:
    return make_package(package_files("1.1.0", extra="new"), version="1.1.0", **changes)


@pytest.mark.usefixtures("init_integration")
async def test_a_newer_version_is_found_and_only_offered(
    hass: HomeAssistant,
    hass_client: ClientSessionGenerator,
    response_mocker: MarketplaceResponses,
    config_dir: Path,
) -> None:
    """Test that with automatic updates off a newer version is only offered."""
    marketplace = await _install_first(hass, hass_client)
    await marketplace.package_updates.async_set_auto_update(KEY, False)
    _offer(response_mocker, _new_package())

    await marketplace.package_updates.async_check_all()

    record = marketplace.package_updates.records[KEY]
    assert record.update_available
    assert record.latest_version == "1.1.0"
    assert record.notes == "Fixes the demo."
    assert record.version == "1.0.0"
    assert record.state == STATE_IDLE
    manifest = json.loads(
        (config_dir / "custom_components/demo_x/manifest.json").read_text()
    )
    assert manifest["version"] == "1.0.0"


@pytest.mark.usefixtures("init_integration")
async def test_an_update_is_installed_automatically(
    hass: HomeAssistant,
    hass_client: ClientSessionGenerator,
    response_mocker: MarketplaceResponses,
    config_dir: Path,
) -> None:
    """Test the automatic update, ending in a restart-needed repair."""
    marketplace = await _install_first(hass, hass_client)
    _offer(response_mocker, _new_package())

    await marketplace.package_updates.async_check_all()

    record = marketplace.package_updates.records[KEY]
    assert record.state == STATE_RESTART
    assert record.version == "1.1.0"
    target = config_dir / "custom_components" / "demo_x"
    assert (target / "__init__.py").read_text() == "# new"
    marker = json.loads((target / UPLOAD_MARKER).read_text())
    assert marker["package"]["version"] == "1.1.0"
    assert marker["package"]["auto_update"] is True
    assert ir.async_get(hass).async_get_issue(
        DOMAIN, f"{RESTART_ISSUE_PREFIX}upload_demo-x"
    )


@pytest.mark.usefixtures("init_integration")
async def test_a_wrong_download_checksum_is_refused(
    hass: HomeAssistant,
    hass_client: ClientSessionGenerator,
    response_mocker: MarketplaceResponses,
    config_dir: Path,
) -> None:
    """Test that a download that does not match the index changes nothing."""
    marketplace = await _install_first(hass, hass_client)
    _offer(response_mocker, _new_package(), sha256="a" * 64)

    await marketplace.package_updates.async_check_all()

    record = marketplace.package_updates.records[KEY]
    assert record.state == STATE_FAILED
    assert record.version == "1.0.0"
    assert (config_dir / "custom_components/demo_x/__init__.py").read_text() == "# "
    assert ir.async_get(hass).async_get_issue(DOMAIN, "package_update_failed_demo_x")


@pytest.mark.usefixtures("init_integration")
async def test_a_package_with_a_bad_file_checksum_is_refused(
    hass: HomeAssistant,
    hass_client: ClientSessionGenerator,
    response_mocker: MarketplaceResponses,
    config_dir: Path,
) -> None:
    """Test that the checks of a dropped package apply to an update."""
    marketplace = await _install_first(hass, hass_client)
    _offer(
        response_mocker,
        make_package(
            package_files("1.1.0", extra="new"),
            version="1.1.0",
            corrupt=f"{SOURCE}/__init__.py",
        ),
    )

    await marketplace.package_updates.async_check_all()

    record = marketplace.package_updates.records[KEY]
    assert record.state == STATE_FAILED
    assert record.version == "1.0.0"
    assert (config_dir / "custom_components/demo_x/__init__.py").read_text() == "# "


@pytest.mark.usefixtures("init_integration")
async def test_a_downgrade_is_refused(
    hass: HomeAssistant,
    hass_client: ClientSessionGenerator,
    response_mocker: MarketplaceResponses,
    config_dir: Path,
) -> None:
    """Test that a package older than the installed one is not installed."""
    marketplace = await _install_first(hass, hass_client)
    old = make_package(package_files("0.5.0", extra="old"), version="0.5.0")
    _offer(response_mocker, old, version="2.0.0")

    await marketplace.package_updates.async_check_all()

    record = marketplace.package_updates.records[KEY]
    assert record.state == STATE_FAILED
    assert record.error
    assert (config_dir / "custom_components/demo_x/__init__.py").read_text() == "# "


@pytest.mark.usefixtures("init_integration")
async def test_a_domain_change_is_refused(
    hass: HomeAssistant,
    hass_client: ClientSessionGenerator,
    response_mocker: MarketplaceResponses,
    config_dir: Path,
) -> None:
    """Test that an update can not turn into another package."""
    marketplace = await _install_first(hass, hass_client)
    other_files = {
        "custom_components/other/__init__.py": b"",
        "custom_components/other/manifest.json": json.dumps(
            {"domain": "other", "name": "Other", "version": "1.1.0"}
        ).encode(),
    }
    _offer(
        response_mocker,
        make_package(other_files, version="1.1.0", name="other"),
    )

    await marketplace.package_updates.async_check_all()

    record = marketplace.package_updates.records[KEY]
    assert record.state == STATE_FAILED
    assert record.version == "1.0.0"
    assert not (config_dir / "custom_components" / "other").exists()


@pytest.mark.usefixtures("init_integration")
async def test_the_switch_decides_between_offer_and_install(
    hass: HomeAssistant,
    hass_client: ClientSessionGenerator,
    config_dir: Path,
) -> None:
    """Test that the choice is kept in the marker of the package."""
    marketplace = await _install_first(hass, hass_client)
    marker = config_dir / "custom_components/demo_x" / UPLOAD_MARKER

    await marketplace.package_updates.async_set_auto_update(KEY, False)

    assert json.loads(marker.read_text())["package"]["auto_update"] is False
    await marketplace.package_updates.async_rescan()
    assert marketplace.package_updates.records[KEY].auto_update is False


@pytest.mark.usefixtures("init_integration")
async def test_an_index_that_is_not_https_is_never_read(
    hass: HomeAssistant,
    hass_client: ClientSessionGenerator,
) -> None:
    """Test that a package with a plain http update address is refused at install."""
    status, body = await upload_package(
        hass,
        hass_client,
        make_package(update_url="http://example.com/index.json"),
    )

    assert status == 400
    assert body["code"] == "upload_package_update_url"
