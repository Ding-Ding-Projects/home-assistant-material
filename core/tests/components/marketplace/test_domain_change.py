"""Tests for an update that changes the domain of an installed integration."""

import io
import json
import os
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, patch
import zipfile

from aiogithubapi.models.git_tree import GitHubGitTreeEntryModel
from aiogithubapi.models.release import GitHubReleaseModel
import pytest
from pytest_homeassistant.common import MockConfigEntry

from homeassistant.components.marketplace.base import MarketplaceManager
from homeassistant.components.marketplace.const import (
    DOMAIN,
    DOMAIN_BRIDGE_ISSUE_PREFIX,
    DOMAIN_CHANGE_ISSUE_PREFIX,
    RESTART_ISSUE_PREFIX,
)
from homeassistant.components.marketplace.exceptions import MarketplaceError
from homeassistant.components.marketplace.repairs import async_create_fix_flow
from homeassistant.components.marketplace.repositories.base import (
    Repository,
    RepositoryArchive,
    RepositoryManifest,
)
from homeassistant.components.marketplace.repositories.integration import (
    DomainChangedError,
    IntegrationRepository,
)
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.helpers import issue_registry as ir

OLD_DOMAIN = "dougi_proxmox"
NEW_DOMAIN = "dougi_proxmox_custom"
REPOSITORY_ID = "9100"
BRIDGE = "6.0.0b0"
TARGET = "6.0.2"


def _zip(files: dict[str, str]) -> bytes:
    """Return a ZIP file holding the given members."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        for name, content in files.items():
            archive.writestr(name, content)
    return buffer.getvalue()


def _integration_files(domain: str, version: str) -> dict[str, str]:
    """Return the files of an integration."""
    return {
        "manifest.json": json.dumps(
            {"domain": domain, "name": "Proxmox VE", "version": version}
        ),
        "__init__.py": f"# {domain} {version}\n",
    }


def _release(version: str, *assets: str) -> GitHubReleaseModel:
    """Return a release with assets."""
    return GitHubReleaseModel(
        {
            "tag_name": version,
            "prerelease": "b" in version,
            "draft": False,
            "assets": [{"name": name} for name in assets],
        }
    )


def _assets_download(bridge: str = BRIDGE) -> AsyncMock:
    """Return a download that serves the ZIP assets of a bridge release."""
    files = {
        f"{OLD_DOMAIN}.zip": _zip(_integration_files(OLD_DOMAIN, bridge)),
        f"{NEW_DOMAIN}.zip": _zip(_integration_files(NEW_DOMAIN, bridge)),
    }

    async def download(url: Any, **kwargs: Any) -> bytes | None:
        return files.get(url.path.rsplit("/", maxsplit=1)[-1])

    return AsyncMock(side_effect=download)


async def _install_new_domain_only(
    self: IntegrationRepository, ref: str | None
) -> None:
    """Stand in for the install of a version that only has the new domain."""
    self._use_integration_manifest({"domain": NEW_DOMAIN, "name": "Proxmox VE"})
    self.content.path.local = self.localpath
    for name, content in _integration_files(NEW_DOMAIN, TARGET).items():
        path = Path(self.localpath, name)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
    self.data.installed_version = TARGET
    await self._async_post_install()


@pytest.fixture
async def repository(marketplace: MarketplaceManager) -> IntegrationRepository:
    """Return an integration installed at 5.3.5 with the old domain."""
    repository = IntegrationRepository(marketplace, "dougiteixeira/proxmoxve")
    repository.data.id = REPOSITORY_ID
    repository.data.domain = OLD_DOMAIN
    repository.data.installed = True
    repository.data.releases = True
    repository.data.installed_version = "5.3.5"
    repository.data.last_version = TARGET
    repository.repository_manifest = RepositoryManifest.from_dict(
        {"zip_release": True, "filename": f"{NEW_DOMAIN}.zip"}
    )
    marketplace.repositories.register(repository)
    repository.content.path.local = repository.localpath
    for name, content in _integration_files(OLD_DOMAIN, "5.3.5").items():
        path = Path(repository.localpath, name)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
    return repository


def _custom_components(repository: IntegrationRepository) -> Path:
    """Return the folder the integrations are installed to."""
    return Path(repository.marketplace.core.config_path, "custom_components")


async def _install(
    repository: IntegrationRepository, ref: str | None = TARGET, **kwargs: Any
) -> None:
    """Install with the loader and the stored data out of the way."""
    with (
        patch.object(
            repository,
            "reload_custom_components",
            AsyncMock(return_value={NEW_DOMAIN}),
        ),
        patch.object(repository.marketplace.data, "async_write"),
    ):
        await repository.async_install_repository(ref=ref, **kwargs)


async def test_bridge_release_is_installed_first(
    hass: HomeAssistant, repository: IntegrationRepository
) -> None:
    """Test the release with both domains goes in and the update stays on offer."""
    MockConfigEntry(domain=OLD_DOMAIN).add_to_hass(hass)
    releases = [
        _release(TARGET, f"{NEW_DOMAIN}.zip"),
        _release(BRIDGE, f"{OLD_DOMAIN}.zip", f"{NEW_DOMAIN}.zip"),
        _release("5.3.5", f"{OLD_DOMAIN}.zip"),
    ]

    with (
        patch.object(Repository, "_async_install_repository", _install_new_domain_only),
        patch.object(repository, "get_releases", AsyncMock(return_value=releases)),
        patch.object(repository.marketplace, "async_download_file", _assets_download()),
    ):
        await _install(repository)

    custom_components = _custom_components(repository)
    assert (custom_components / OLD_DOMAIN / "__init__.py").read_text() == (
        f"# {OLD_DOMAIN} {BRIDGE}\n"
    )
    assert (custom_components / NEW_DOMAIN / "__init__.py").read_text() == (
        f"# {NEW_DOMAIN} {BRIDGE}\n"
    )
    assert repository.data.domain == NEW_DOMAIN
    assert repository.data.previous_domain == OLD_DOMAIN
    assert repository.data.installed_version == BRIDGE
    assert repository.data.last_version == TARGET
    assert repository.pending_update
    assert repository.pending_restart

    registry = ir.async_get(hass)
    assert registry.async_get_issue(
        DOMAIN, f"{DOMAIN_BRIDGE_ISSUE_PREFIX}{REPOSITORY_ID}"
    )
    assert any(
        issue_id.startswith(RESTART_ISSUE_PREFIX)
        for domain, issue_id in registry.issues
        if domain == DOMAIN
    )


async def test_failed_bridge_keeps_the_old_install(
    hass: HomeAssistant, repository: IntegrationRepository
) -> None:
    """Test a bridge that does not download leaves the install as it was."""
    MockConfigEntry(domain=OLD_DOMAIN).add_to_hass(hass)
    releases = [_release(BRIDGE, f"{OLD_DOMAIN}.zip", f"{NEW_DOMAIN}.zip")]

    with (
        patch.object(Repository, "_async_install_repository", _install_new_domain_only),
        patch.object(repository, "get_releases", AsyncMock(return_value=releases)),
        patch.object(
            repository.marketplace, "async_download_file", AsyncMock(return_value=None)
        ),
        pytest.raises(MarketplaceError),
    ):
        await _install(repository)

    custom_components = _custom_components(repository)
    assert (custom_components / OLD_DOMAIN / "__init__.py").read_text() == (
        f"# {OLD_DOMAIN} 5.3.5\n"
    )
    assert not (custom_components / NEW_DOMAIN).exists()
    assert repository.data.domain == OLD_DOMAIN
    assert repository.data.previous_domain is None
    assert repository.data.installed_version == "5.3.5"


async def test_bridge_from_the_tree(
    hass: HomeAssistant, repository: IntegrationRepository
) -> None:
    """Test a repository without ZIP releases bridges with a tree that has both."""
    repository.repository_manifest = RepositoryManifest.from_dict({})
    MockConfigEntry(domain=OLD_DOMAIN).add_to_hass(hass)
    files = {
        f"custom_components/{domain}/{name}": content
        for domain in (OLD_DOMAIN, NEW_DOMAIN)
        for name, content in _integration_files(domain, BRIDGE).items()
    }
    archive = RepositoryArchive(
        _zip({f"repo-{BRIDGE}/{name}": content for name, content in files.items()})
    )
    tree = [GitHubGitTreeEntryModel({"path": path, "type": "blob"}) for path in files]

    async def get_tree(ref: str) -> list[GitHubGitTreeEntryModel]:
        if ref == BRIDGE:
            return tree
        return [entry for entry in tree if NEW_DOMAIN in entry.path]

    with (
        patch.object(Repository, "_async_install_repository", _install_new_domain_only),
        patch.object(
            repository,
            "get_releases",
            AsyncMock(return_value=[_release(TARGET), _release(BRIDGE)]),
        ),
        patch.object(repository, "get_tree", AsyncMock(side_effect=get_tree)),
        patch.object(
            repository, "_async_download_archive", AsyncMock(return_value=archive)
        ),
    ):
        await _install(repository)

    custom_components = _custom_components(repository)
    assert (custom_components / OLD_DOMAIN / "manifest.json").is_file()
    assert (custom_components / NEW_DOMAIN / "manifest.json").is_file()
    assert repository.data.installed_version == BRIDGE
    assert repository.data.previous_domain == OLD_DOMAIN


async def test_no_bridge_and_no_old_entries_replaces_the_folder(
    hass: HomeAssistant, repository: IntegrationRepository
) -> None:
    """Test the new domain is installed and the old folder goes."""
    releases = [_release(TARGET, f"{NEW_DOMAIN}.zip")]

    with (
        patch.object(Repository, "_async_install_repository", _install_new_domain_only),
        patch.object(repository, "get_releases", AsyncMock(return_value=releases)),
    ):
        await _install(repository)

    custom_components = _custom_components(repository)
    assert not (custom_components / OLD_DOMAIN).exists()
    assert (custom_components / NEW_DOMAIN / "manifest.json").is_file()
    assert repository.data.domain == NEW_DOMAIN
    assert repository.data.previous_domain is None
    assert repository.data.installed_version == TARGET
    assert not repository.pending_update


async def test_no_bridge_and_old_entries_asks_to_confirm(
    hass: HomeAssistant, repository: IntegrationRepository
) -> None:
    """Test entries that can not follow raise a repair and change nothing."""
    MockConfigEntry(domain=OLD_DOMAIN).add_to_hass(hass)
    releases = [_release(TARGET, f"{NEW_DOMAIN}.zip")]

    with (
        patch.object(Repository, "_async_install_repository", _install_new_domain_only),
        patch.object(repository, "get_releases", AsyncMock(return_value=releases)),
        pytest.raises(MarketplaceError) as exc_info,
    ):
        await _install(repository)

    assert exc_info.value.translation_key == "domain_change_needs_confirmation"
    issue = ir.async_get(hass).async_get_issue(
        DOMAIN, f"{DOMAIN_CHANGE_ISSUE_PREFIX}{REPOSITORY_ID}"
    )
    assert issue is not None
    assert issue.is_fixable
    assert issue.translation_placeholders["old_domain"] == OLD_DOMAIN
    assert issue.translation_placeholders["domain"] == NEW_DOMAIN
    assert (_custom_components(repository) / OLD_DOMAIN / "manifest.json").is_file()
    assert not (_custom_components(repository) / NEW_DOMAIN).exists()
    assert repository.data.domain == OLD_DOMAIN
    assert repository.data.installed_version == "5.3.5"


async def test_confirmed_domain_change_keeps_the_old_folder(
    hass: HomeAssistant, repository: IntegrationRepository
) -> None:
    """Test the confirmed install keeps the old folder until its entries are gone."""
    entry = MockConfigEntry(domain=OLD_DOMAIN)
    entry.add_to_hass(hass)

    with (
        patch.object(Repository, "_async_install_repository", _install_new_domain_only),
        patch.object(
            repository,
            "get_releases",
            AsyncMock(return_value=[_release(TARGET, f"{NEW_DOMAIN}.zip")]),
        ),
    ):
        await _install(repository, confirm_domain_change=True)

    custom_components = _custom_components(repository)
    assert (custom_components / OLD_DOMAIN / "manifest.json").is_file()
    assert (custom_components / NEW_DOMAIN / "manifest.json").is_file()
    assert repository.data.previous_domain == OLD_DOMAIN

    await hass.config_entries.async_remove(entry.entry_id)
    await repository.marketplace.async_remove_previous_domains()

    assert not (custom_components / OLD_DOMAIN).exists()
    assert repository.data.previous_domain is None


async def test_failed_confirmed_install_goes_back_to_the_old_domain(
    hass: HomeAssistant, repository: IntegrationRepository
) -> None:
    """Test a failing install does not leave the new domain behind."""
    MockConfigEntry(domain=OLD_DOMAIN).add_to_hass(hass)

    async def fail(self: IntegrationRepository, ref: str | None) -> None:
        self._use_integration_manifest({"domain": NEW_DOMAIN})
        raise MarketplaceError(translation_domain=DOMAIN, translation_key="not_loaded")

    with (
        patch.object(Repository, "_async_install_repository", fail),
        patch.object(repository, "get_releases", AsyncMock(return_value=[])),
        pytest.raises(MarketplaceError),
    ):
        await _install(repository, confirm_domain_change=True)

    assert repository.data.domain == OLD_DOMAIN
    assert repository.content.path.local == repository.localpath
    assert repository.data.previous_domain is None


async def test_startup_removes_the_old_folder_without_entries(
    hass: HomeAssistant, repository: IntegrationRepository
) -> None:
    """Test the folder of the old domain goes once no entries are left."""
    repository.data.domain = NEW_DOMAIN
    repository.data.previous_domain = OLD_DOMAIN
    old_folder = _custom_components(repository) / OLD_DOMAIN
    entry = MockConfigEntry(domain=OLD_DOMAIN)
    entry.add_to_hass(hass)

    await repository.marketplace.async_remove_previous_domains()

    assert old_folder.is_dir()
    assert repository.data.previous_domain == OLD_DOMAIN

    await hass.config_entries.async_remove(entry.entry_id)
    await repository.marketplace.async_remove_previous_domains()

    assert not old_folder.exists()
    assert repository.data.previous_domain is None


async def test_symlink_of_the_old_domain_is_never_removed(
    hass: HomeAssistant, repository: IntegrationRepository, tmp_path: Path
) -> None:
    """Test a symlink and what it points at stay."""
    repository.data.domain = NEW_DOMAIN
    repository.data.previous_domain = OLD_DOMAIN
    old_folder = _custom_components(repository) / OLD_DOMAIN
    for child in old_folder.iterdir():
        child.unlink()
    old_folder.rmdir()
    target = tmp_path / "development"
    target.mkdir()
    (target / "keep.txt").write_text("mine")
    os.symlink(target, old_folder, target_is_directory=True)

    await repository.marketplace.async_remove_previous_domains()

    assert old_folder.is_symlink()
    assert (target / "keep.txt").read_text() == "mine"
    assert repository.data.previous_domain is None


async def test_folder_of_another_repository_is_never_removed(
    hass: HomeAssistant, repository: IntegrationRepository
) -> None:
    """Test the folder another installed repository owns stays."""
    other = IntegrationRepository(repository.marketplace, "someone/other")
    other.data.id = "9101"
    other.data.domain = OLD_DOMAIN
    other.data.installed = True
    repository.marketplace.repositories.register(other)
    repository.data.domain = NEW_DOMAIN
    repository.data.previous_domain = OLD_DOMAIN

    await repository.marketplace.async_remove_previous_domains()

    assert (_custom_components(repository) / OLD_DOMAIN / "manifest.json").is_file()


async def test_uninstall_removes_both_folders(
    hass: HomeAssistant, repository: IntegrationRepository
) -> None:
    """Test removal finds the files of both domains after the rename."""
    repository.data.domain = NEW_DOMAIN
    repository.data.previous_domain = OLD_DOMAIN
    repository.content.path.local = repository.localpath
    new_folder = _custom_components(repository) / NEW_DOMAIN
    new_folder.mkdir()
    (new_folder / "manifest.json").write_text("{}")

    with patch.object(
        repository, "reload_custom_components", AsyncMock(return_value=set())
    ):
        await repository.uninstall()

    assert not (_custom_components(repository) / OLD_DOMAIN).exists()
    assert not new_folder.exists()
    assert repository.data.previous_domain is None


async def test_domain_change_repair_installs_the_new_domain(
    hass: HomeAssistant, repository: IntegrationRepository
) -> None:
    """Test confirming the repair installs with the domain change accepted."""
    issue_id = f"{DOMAIN_CHANGE_ISSUE_PREFIX}{REPOSITORY_ID}"
    flow = await async_create_fix_flow(hass, issue_id, {"repository_id": REPOSITORY_ID})
    flow.hass = hass

    result = await flow.async_step_init()
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "confirm"

    with patch.object(
        IntegrationRepository, "async_install_repository", AsyncMock()
    ) as install:
        result = await flow.async_step_confirm({})

    install.assert_awaited_once_with(confirm_domain_change=True)
    assert result["type"] is FlowResultType.CREATE_ENTRY


async def test_domain_change_repair_reports_a_failed_install(
    hass: HomeAssistant, repository: IntegrationRepository
) -> None:
    """Test a failed install is reported and not lost."""
    flow = await async_create_fix_flow(
        hass,
        f"{DOMAIN_CHANGE_ISSUE_PREFIX}{REPOSITORY_ID}",
        {"repository_id": REPOSITORY_ID},
    )
    flow.hass = hass

    with patch.object(
        IntegrationRepository,
        "async_install_repository",
        AsyncMock(side_effect=MarketplaceError("boom")),
    ):
        result = await flow.async_step_confirm({})

    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "install_failed"


async def test_refresh_still_refuses_a_changed_domain(
    repository: IntegrationRepository,
) -> None:
    """Test only an install follows a new domain, a refresh keeps the old one."""
    with pytest.raises(DomainChangedError) as exc_info:
        repository._use_integration_manifest({"domain": NEW_DOMAIN})

    assert exc_info.value.translation_key == "domain_changed"
    assert exc_info.value.old_domain == OLD_DOMAIN
    assert repository.data.domain == OLD_DOMAIN
