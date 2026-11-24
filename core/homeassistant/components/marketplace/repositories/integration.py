"""Class for integration repositories."""

import asyncio
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from functools import partial
import os
from pathlib import Path
import shutil
import sys
from typing import TYPE_CHECKING, Any, override

from awesomeversion import AwesomeVersion, AwesomeVersionStrategy
from awesomeversion.exceptions import AwesomeVersionException
import probatio

from homeassistant import components
from homeassistant.core import callback
from homeassistant.helpers import issue_registry as ir
from homeassistant.helpers.issue_registry import IssueSeverity, async_create_issue
from homeassistant.helpers.translation import async_invalidate_translations
from homeassistant.loader import (
    PACKAGE_CUSTOM_COMPONENTS,
    IntegrationNotLoaded,
    async_clear_custom_components_cache,
    async_get_custom_components,
    async_get_loaded_integration,
    async_mount_config_dir,
)
from homeassistant.util.json import json_loads_object

from ..const import (
    DOMAIN,
    DOMAIN_BRIDGE_ISSUE_PREFIX,
    DOMAIN_CHANGE_ISSUE_PREFIX,
    RESTART_ISSUE_PREFIX,
)
from ..enums import RepositoryCategory, RepositoryFile
from ..exceptions import (
    AppRepositoryError,
    CatalogContentUnresolvedError,
    GitHubRateLimitError,
    MarketplaceError,
    ReplacesBuiltInNotConfirmedError,
)
from ..types import DownloadableContent
from ..utils.backup import Backup
from ..utils.decode import decode_content
from ..utils.decorator import concurrent
from ..utils.filters import get_first_directory_in_directory
from ..utils.logger import LOGGER
from ..utils.path import entry_in_directory, is_safe
from ..utils.url import github_raw_file, github_release_asset, ref_version
from ..utils.validate import INTEGRATION_MANIFEST_VALUES, VALID_DOMAIN
from ..utils.version import is_newer_version
from .base import Repository

if TYPE_CHECKING:
    from ..base import MarketplaceManager


class DomainChangedError(MarketplaceError):
    """For an update of an installed integration that changes its domain."""

    def __init__(self, repository: str, old_domain: str, domain: str) -> None:
        """Initialize the exception."""
        super().__init__(
            translation_domain=DOMAIN,
            translation_key="domain_changed",
            translation_placeholders={
                "repository": repository,
                "old_domain": old_domain,
                "domain": domain,
            },
        )
        self.old_domain = old_domain
        self.domain = domain


@dataclass(frozen=True)
class DomainBridge:
    """A release that carries the old and the new domain of an integration."""

    version: str
    old_domain: str
    domain: str
    # The release ships a ZIP asset per domain, else the tree holds a folder per domain
    from_assets: bool


# A tree has to be fetched for every release looked at, so only a few are
BRIDGE_TREE_LOOKUPS = 5


def _validated_domain(domain: Any) -> str:
    """Return the domain of a remote manifest, rejecting anything but a slug.

    The domain names the directory below custom_components/ the install is
    written to, so anything else would let a repository pick its own target.
    """
    if not isinstance(domain, str) or not VALID_DOMAIN.match(domain):
        raise MarketplaceError(
            translation_domain=DOMAIN,
            translation_key="invalid_domain",
            translation_placeholders={"domain": str(domain)},
        )

    return domain


def _manifest_value(manifest: dict[str, Any], key: str, default: Any) -> Any:
    """Return a value of manifest.json, the default when it has the wrong type."""
    if key not in manifest:
        return default

    try:
        return INTEGRATION_MANIFEST_VALUES[key](manifest[key])
    except probatio.Invalid:
        LOGGER.warning(
            "Ignoring %s in manifest.json, %r is not valid", key, manifest[key]
        )
        return default


# The version formats the loader accepts for a custom integration
LOADABLE_VERSION_STRATEGIES = [
    AwesomeVersionStrategy.CALVER,
    AwesomeVersionStrategy.SEMVER,
    AwesomeVersionStrategy.SIMPLEVER,
    AwesomeVersionStrategy.BUILDVER,
    AwesomeVersionStrategy.PEP440,
]


def _is_loadable_version(version: Any) -> bool:
    """Return if the loader accepts this as the version of a custom integration."""
    if not isinstance(version, str):
        return False

    try:
        AwesomeVersion(version, ensure_strategy=LOADABLE_VERSION_STRATEGIES)
    except AwesomeVersionException:
        return False
    return True


def _check_loadable_manifest(directory: Path, domain: str | None) -> None:
    """Refuse an installed manifest.json the loader would not load."""
    try:
        manifest = json_loads_object(
            (directory / RepositoryFile.MANIFEST_JSON).read_text(encoding="utf-8")
        )
    except (OSError, ValueError) as exception:
        raise MarketplaceError(
            translation_domain=DOMAIN,
            translation_key="installed_manifest_unusable",
            translation_placeholders={"error": str(exception)},
        ) from exception

    if manifest.get("domain") != domain:
        raise MarketplaceError(
            translation_domain=DOMAIN,
            translation_key="installed_manifest_other_domain",
            translation_placeholders={
                "found": str(manifest.get("domain")),
                "domain": str(domain),
            },
        )

    if not _is_loadable_version(manifest.get("version")):
        raise MarketplaceError(
            translation_domain=DOMAIN,
            translation_key="installed_manifest_without_version",
        )


class IntegrationRepository(Repository):
    """Integration repository."""

    remote_path = "custom_components"

    def __init__(self, marketplace: MarketplaceManager, full_name: str) -> None:
        """Initialize."""
        super().__init__(marketplace=marketplace)
        self.data.full_name = full_name
        self.data.category = RepositoryCategory.INTEGRATION
        self.content.path.local = self.localpath
        self._domain_change_allowed = False
        self._domain_change_confirmed = False
        self._domain_moved_from: str | None = None
        self._bridge: DomainBridge | None = None

    @property
    @override
    def localpath(self) -> str:
        """Return localpath."""
        return (
            f"{self.marketplace.core.config_path}/custom_components/{self.data.domain}"
        )

    @override
    def _content_name(self) -> str | None:
        """Return the name in the manifest.json of the integration."""
        if self.data.manifest_name is not None:
            return self.data.manifest_name
        if "name" in self.integration_manifest:
            return str(self.integration_manifest["name"])
        return None

    @override
    def _category_directory(self) -> str | None:
        """Return the custom_components folder."""
        return f"{self.marketplace.core.config_path}/custom_components"

    @override
    async def remove_local_directory(self) -> bool:
        """Remove the integration, its folder is named by its domain."""
        if not self.data.domain:
            self.logger.error("%s Missing domain", self.string)
            return False

        if not await super().remove_local_directory():
            return False

        previous = self.data.previous_domain
        return previous is None or await self._async_remove_domain_folder(previous)

    @override
    async def async_pre_install(self) -> None:
        """Run pre install steps."""
        if not self.data.domain:
            return

        for repository in self.marketplace.repositories.list_installed:
            if (
                repository is not self
                and repository.data.category == RepositoryCategory.INTEGRATION
                and repository.data.domain == self.data.domain
            ):
                raise MarketplaceError(
                    translation_domain=DOMAIN,
                    translation_key="integration_owned",
                    translation_placeholders={
                        "domain": str(self.data.domain),
                        "owner": repository.data.full_name,
                    },
                )

        if (
            self._domain_moved_from is not None
            and not self._replace_built_in_confirmed
            and await self.async_replaces_built_in()
        ):
            raise ReplacesBuiltInNotConfirmedError(
                self.data.full_name, str(self.data.domain)
            )

    @override
    async def async_post_installation(self) -> None:
        """Run post installation steps."""
        self.pending_restart = True
        found = await self.reload_custom_components()
        if self.data.config_flow:
            # Code new to this run is found like any other integration, code
            # the loader already knows keeps running until a restart.
            self.pending_restart = (
                self._known_to_the_loader() or self.data.domain not in found
            )

        if self._domain_moved_from is not None:
            self.data.previous_domain = self._domain_moved_from

        # The old domain keeps loading its entries until the restart
        if self._bridge is not None:
            self.pending_restart = True
            self._async_create_bridge_issue(self._bridge)

        if self.pending_restart:
            self.logger.debug("%s Creating restart_required issue", self.string)
            async_create_issue(
                hass=self.marketplace.hass,
                domain=DOMAIN,
                issue_id=f"{RESTART_ISSUE_PREFIX}{self.data.id}_{self.ref}",
                is_fixable=True,
                issue_domain=self.data.domain or DOMAIN,
                severity=IssueSeverity.WARNING,
                translation_key="restart_required",
                translation_placeholders={
                    "name": self.display_name,
                },
            )

        await self.async_remove_previous_domain()

    def _known_to_the_loader(self) -> bool:
        """Return if this run already resolved the domain, its own or a built-in."""
        try:
            async_get_loaded_integration(self.marketplace.hass, str(self.data.domain))
        except IntegrationNotLoaded:
            return False
        return True

    @override
    async def async_check_written_content(self) -> None:
        """Refuse an integration the loader would not load."""
        await self.marketplace.hass.async_add_executor_job(
            _check_loadable_manifest, Path(self.content.path.local), self.data.domain
        )

    @override
    async def async_replaces_built_in(self) -> bool:
        """Return if the domain belongs to an integration of Home Assistant."""
        if not self.data.domain:
            return False

        # The same check the loader makes before loading a custom integration
        manifest = Path(components.__file__).parent / self.data.domain / "manifest.json"
        return await self.marketplace.hass.async_add_executor_job(manifest.is_file)

    @override
    async def async_post_uninstall(self) -> None:
        """Run post uninstall steps."""
        # Code this run loaded keeps running until a restart, and so does
        # an integration only set up from YAML
        loaded = self._known_to_the_loader()
        await self.reload_custom_components()
        self.pending_restart = loaded or not self.data.config_flow
        self.data.previous_domain = None
        for prefix in (DOMAIN_BRIDGE_ISSUE_PREFIX, DOMAIN_CHANGE_ISSUE_PREFIX):
            ir.async_delete_issue(
                self.marketplace.hass, DOMAIN, f"{prefix}{self.data.id}"
            )

        if self.pending_restart:
            async_create_issue(
                hass=self.marketplace.hass,
                domain=DOMAIN,
                issue_id=f"{RESTART_ISSUE_PREFIX}{self.data.id}_uninstall",
                is_fixable=True,
                issue_domain=self.data.domain or DOMAIN,
                severity=IssueSeverity.WARNING,
                translation_key="restart_required_uninstall",
                translation_placeholders={"name": self.display_name},
            )

    @override
    async def async_read_content_details(self) -> None:
        """Take the domain and the name from the manifest.json of the integration."""
        if manifest := await self.async_get_integration_manifest():
            self._use_integration_manifest(manifest)

        self.content.path.local = self.localpath

    @override
    @concurrent(concurrenttasks=10)
    async def update_repository(
        self, ignore_issues: bool = False, force: bool = False
    ) -> None:
        """Refresh the repository from GitHub."""
        if not await self.common_update(ignore_issues, force) and not force:
            return

        # Resolved again for every version, the last one may have had it elsewhere
        self.content.path.remote = self.remote_path
        if self.repository_manifest.content_in_root:
            self.content.path.remote = ""

        if self.content.path.remote == "custom_components":
            name = get_first_directory_in_directory(self.tree, "custom_components")
            self.content.path.remote = f"custom_components/{name}"

        await self.async_read_content_details()

        if self.data.installed:
            self.async_dispatch_changed("update")

    @override
    def try_resolve_content(self) -> bool:
        """Return if the tree holds an integration, a manifest.json included.

        With content_in_root any tree resolves, the manifest.json tells.
        """
        return (
            super().try_resolve_content()
            and self._integration_manifest_path() in self.treefiles
        )

    @override
    def resolve_content(self) -> None:
        """Point the content at the integration directory in the tree."""
        if self.repository_manifest.content_in_root:
            self.content.path.remote = ""

        if self.content.path.remote == "custom_components":
            name = get_first_directory_in_directory(self.tree, "custom_components")
            if name is None:
                if (
                    "repository.json" in self.treefiles
                    or "repository.yaml" in self.treefiles
                    or "repository.yml" in self.treefiles
                ):
                    raise AppRepositoryError(self.data.full_name)
                raise MarketplaceError(
                    translation_domain=DOMAIN,
                    translation_key="structure_not_compliant",
                    translation_placeholders={
                        "repository": self.data.full_name,
                        "version": str(ref_version(self.ref)),
                    },
                )
            self.content.path.remote = f"custom_components/{name}"

    def _use_integration_manifest(self, manifest: dict[str, Any]) -> None:
        """Take the details of the integration from its manifest.json."""
        try:
            domain = _validated_domain(manifest["domain"])
            if self.data.installed and self.data.domain not in (None, domain):
                if not self._domain_change_allowed:
                    raise DomainChangedError(
                        self.data.full_name, str(self.data.domain), domain
                    )
                self._domain_moved_from = self.data.domain

            self.integration_manifest = manifest
            self.data.authors = _manifest_value(manifest, "codeowners", [])
            self.data.domain = domain
            self.data.manifest_name = _manifest_value(manifest, "name", None)
            self.data.config_flow = _manifest_value(manifest, "config_flow", False)

        except KeyError as exception:
            self.validate.errors.append(
                MarketplaceError(
                    translation_domain=DOMAIN,
                    translation_key="integration_manifest_key_missing",
                    translation_placeholders={"key": str(exception)},
                )
            )
            LOGGER.error(
                "Missing expected key '%s' in '%s'",
                exception,
                RepositoryFile.MANIFEST_JSON,
            )

    @override
    async def _async_resolve_catalog_content(
        self, version: str, *, commit: bool
    ) -> Callable[[], Awaitable[None]]:
        """Resolve the content of a catalog version, and read its manifest.json."""
        download: Callable[[], Awaitable[None]]
        if self.repository_manifest.zip_release and self.repository_manifest.filename:
            # Without the tree, the catalog domain names the directory
            if self.data.domain is None:
                raise CatalogContentUnresolvedError(
                    translation_domain=DOMAIN, translation_key="catalog_without_domain"
                )
            if self.repository_manifest.content_in_root:
                self.content.path.remote = ""
            else:
                self.content.path.remote = f"custom_components/{self.data.domain}"
            download = partial(self.download_zip_files, self.validate)
        else:
            download = await super()._async_resolve_catalog_content(
                version, commit=commit
            )

        manifest_path = self._integration_manifest_path()
        manifest = await self._async_download_integration_manifest(
            version, manifest_path
        )
        if manifest is None or "domain" not in manifest:
            raise CatalogContentUnresolvedError(
                translation_domain=DOMAIN,
                translation_key="catalog_manifest_unusable",
                translation_placeholders={"path": manifest_path},
            )

        self._use_integration_manifest(manifest)
        self.content.path.local = self.localpath
        return download

    async def reload_custom_components(self) -> set[str]:
        """Scan custom_components again, return the domains the loader found."""
        self.logger.info("Reloading custom_component cache")
        # The loader mounts custom_components at startup, a first install
        # creates the folder after that
        try:
            if PACKAGE_CUSTOM_COMPONENTS not in sys.modules:
                async_mount_config_dir(self.marketplace.hass)
            async_clear_custom_components_cache(self.marketplace.hass)
            if self.data.domain:
                # Requests during discovery must wait for the refreshed metadata.
                async_invalidate_translations(self.marketplace.hass, {self.data.domain})
            found = await async_get_custom_components(self.marketplace.hass)
        finally:
            if self.data.domain:
                async_invalidate_translations(self.marketplace.hass, {self.data.domain})
        self.logger.info("Custom_component cache reloaded")
        return set(found)

    def _integration_manifest_path(self) -> str:
        """Return the path of the manifest.json in the repository."""
        if self.repository_manifest.content_in_root:
            return RepositoryFile.MANIFEST_JSON
        return f"{self.content.path.remote}/{RepositoryFile.MANIFEST_JSON}"

    async def async_get_integration_manifest(self) -> dict[str, Any] | None:
        """Get manifest.json through the GitHub API."""
        manifest_path = self._integration_manifest_path()

        if manifest_path not in (entry.path for entry in self.tree):
            raise MarketplaceError(
                translation_domain=DOMAIN,
                translation_key="integration_manifest_missing",
                translation_placeholders={"path": manifest_path},
            )

        target_ref = self.version_to_install()
        self.logger.debug(
            "%s Getting %s for ref=%s", self.string, manifest_path, target_ref
        )

        response = await self.marketplace.async_github_api_method(
            method=self.marketplace.githubapi.repos.contents.get,
            repository=self.data.full_name,
            path=manifest_path,
            params={"ref": target_ref},
        )
        if response:
            return json_loads_object(decode_content(response.data.content))
        return None

    async def _async_download_integration_manifest(
        self, version: str | None, manifest_path: str
    ) -> dict[str, Any] | None:
        """Download the manifest.json of a version, None when it is not there."""
        self.logger.debug(
            "%s Getting manifest.json for version=%s", self.string, version
        )
        try:
            result = await self.marketplace.async_download_file(
                github_raw_file(
                    repository=self.data.full_name, ref=version, path=manifest_path
                ),
                nolog=True,
            )
            if result is None:
                return None
            return json_loads_object(result)
        except ValueError:
            return None

    @override
    async def async_install_repository(
        self,
        *,
        ref: str | None = None,
        confirm_replace_built_in: bool = False,
        confirm_domain_change: bool = False,
    ) -> None:
        """Install a repository, confirm_domain_change accepts a new domain."""
        self._domain_change_confirmed = confirm_domain_change
        try:
            await super().async_install_repository(
                ref=ref, confirm_replace_built_in=confirm_replace_built_in
            )
        finally:
            self._domain_change_confirmed = False

    @override
    async def _async_install_repository(self, ref: str | None) -> None:
        """Install a version, one that changes the domain moves to the new one."""
        try:
            await super()._async_install_repository(ref)
        except DomainChangedError as change:
            await self._async_install_domain_change(ref, change)

    async def _async_install_domain_change(
        self, ref: str | None, change: DomainChangedError
    ) -> None:
        """Install what an update that changes the domain needs."""
        old_domain, domain = change.old_domain, change.domain
        if bridge := await self._async_find_bridge(old_domain, domain, ref):
            await self._async_install_bridge(bridge)
            return

        if (
            self.marketplace.hass.config_entries.async_entries(old_domain)
            and not self._domain_change_confirmed
        ):
            self._async_create_domain_change_issue(old_domain, domain)
            raise MarketplaceError(
                translation_domain=DOMAIN,
                translation_key="domain_change_needs_confirmation",
                translation_placeholders={
                    "repository": self.data.full_name,
                    "old_domain": old_domain,
                    "domain": domain,
                },
            )

        self._domain_change_allowed = True
        try:
            await super()._async_install_repository(ref)
        except BaseException:
            self._async_revert_domain(old_domain)
            raise
        finally:
            self._domain_change_allowed = False
            self._domain_moved_from = None

        ir.async_delete_issue(
            self.marketplace.hass,
            DOMAIN,
            f"{DOMAIN_CHANGE_ISSUE_PREFIX}{self.data.id}",
        )

    def _async_revert_domain(self, domain: str) -> None:
        """Go back to the domain the files of the install are in."""
        self.data.domain = domain
        self.content.path.local = self.localpath
        self._domain_moved_from = None

    async def _async_find_bridge(
        self, old_domain: str, domain: str, ref: str | None
    ) -> DomainBridge | None:
        """Return the newest release between the installed and the target version.

        A bridge carries both domains, so the integration can move its config
        entries over before the version that has the new domain only.
        """
        target = ref or self.data.last_version
        try:
            releases = await self.get_releases(prerelease=True, returnlimit=30)
        except GitHubRateLimitError:
            raise
        except MarketplaceError as exception:
            self.logger.debug(
                "%s Could not look for a bridge release: %s", self.string, exception
            )
            return None

        zip_release = self.repository_manifest.zip_release
        wanted = {f"{old_domain}.zip", f"{domain}.zip"}
        tree_lookups = 0
        for release in releases:
            version = release.tag_name
            if target is not None and is_newer_version(version, target):
                continue
            installed = self.data.installed_version
            if installed is not None and not is_newer_version(version, installed):
                continue

            if wanted <= {asset.name for asset in release.assets or []}:
                return DomainBridge(version, old_domain, domain, from_assets=True)

            if zip_release or tree_lookups >= BRIDGE_TREE_LOOKUPS:
                continue
            tree_lookups += 1
            try:
                tree = await self.get_tree(version)
            except GitHubRateLimitError:
                raise
            except MarketplaceError:
                continue
            paths = {entry.path for entry in tree or []}
            if {
                f"custom_components/{old_domain}/{RepositoryFile.MANIFEST_JSON}",
                f"custom_components/{domain}/{RepositoryFile.MANIFEST_JSON}",
            } <= paths:
                return DomainBridge(version, old_domain, domain, from_assets=False)

        return None

    async def _async_install_bridge(self, bridge: DomainBridge) -> None:
        """Install a bridge release, the target stays the update on offer."""
        self.logger.info(
            "%s Installing %s, it carries %s and %s",
            self.string,
            bridge.version,
            bridge.old_domain,
            bridge.domain,
        )
        self.data.domain = bridge.domain
        self._domain_moved_from = bridge.old_domain
        self._bridge = bridge
        self.ref = f"tags/{bridge.version}"
        self.content.path.local = self.localpath
        self.validate.errors.clear()
        try:
            with self._install_failure_names_the_version(bridge.version):
                await self._async_run_install(partial(self._async_write_bridge, bridge))
        except BaseException:
            self._async_revert_domain(bridge.old_domain)
            raise
        finally:
            self._bridge = None
            self._domain_moved_from = None
            self._end_install()

    async def _async_write_bridge(self, bridge: DomainBridge) -> None:
        """Write both domains of a bridge release and mark it installed."""
        await self._async_write_content(partial(self._async_download_bridge, bridge))

        self.data.installed = True
        self.data.installed_commit = self.data.last_commit
        self.data.releases = True
        self.data.installed_version = bridge.version

    async def _async_download_bridge(self, bridge: DomainBridge) -> None:
        """Download a folder for each domain, the old one is put back on failure."""
        hass = self.marketplace.hass
        new_local = self.content.path.local
        old_local = self._domain_path(bridge.old_domain)
        old_backup = Backup(self.marketplace, old_local)
        await hass.async_add_executor_job(old_backup.create)

        def _undo() -> None:
            if old_backup.is_first_install:
                old_backup.remove_first_install()
            else:
                old_backup.restore()
            old_backup.cleanup()

        try:
            folders = ((bridge.old_domain, old_local), (bridge.domain, new_local))
            if bridge.from_assets:
                for domain, local in folders:
                    filename = f"{domain}.zip"
                    self.content.path.local = local
                    await self.async_download_zip_file(
                        DownloadableContent(
                            name=filename,
                            url=github_release_asset(
                                repository=self.data.full_name,
                                version=bridge.version,
                                filename=filename,
                            ),
                        ),
                        self.validate,
                    )
            else:
                archive = await self._async_download_archive(bridge.version)
                for domain, local in folders:
                    await hass.async_add_executor_job(
                        archive.extract_directory, f"custom_components/{domain}", local
                    )
            self.content.path.local = new_local
            self._raise_for_install_errors()
            await self.async_check_written_content()
        except Exception, asyncio.CancelledError:
            self.content.path.local = new_local
            await asyncio.shield(hass.async_add_executor_job(_undo))
            raise

        await hass.async_add_executor_job(old_backup.cleanup)

    def _domain_path(self, domain: str) -> str:
        """Return the folder of a domain."""
        return f"{self.marketplace.core.config_path}/custom_components/{domain}"

    @callback
    def _async_create_bridge_issue(self, bridge: DomainBridge) -> None:
        """Tell the integration changed its domain and a restart finishes the move."""
        async_create_issue(
            hass=self.marketplace.hass,
            domain=DOMAIN,
            issue_id=f"{DOMAIN_BRIDGE_ISSUE_PREFIX}{self.data.id}",
            is_fixable=False,
            issue_domain=bridge.domain,
            severity=IssueSeverity.WARNING,
            translation_key="domain_bridge_installed",
            translation_placeholders={
                "name": self.display_name,
                "old_domain": bridge.old_domain,
                "domain": bridge.domain,
                "version": bridge.version,
                "target": self.data.last_version or bridge.version,
            },
        )

    @callback
    def _async_create_domain_change_issue(self, old_domain: str, domain: str) -> None:
        """Ask to confirm a new domain the existing config entries do not follow."""
        async_create_issue(
            hass=self.marketplace.hass,
            domain=DOMAIN,
            issue_id=f"{DOMAIN_CHANGE_ISSUE_PREFIX}{self.data.id}",
            is_fixable=True,
            severity=IssueSeverity.WARNING,
            translation_key="domain_change_confirmation",
            translation_placeholders={
                "name": self.display_name,
                "old_domain": old_domain,
                "domain": domain,
            },
            data={"repository_id": self.data.id},
        )

    async def async_remove_previous_domain(self) -> None:
        """Remove the folder of the old domain, once no config entries are left."""
        previous = self.data.previous_domain
        if previous is None:
            return

        if previous == self.data.domain or not VALID_DOMAIN.match(previous):
            self.data.previous_domain = None
            return

        if self.marketplace.hass.config_entries.async_entries(previous):
            return

        if not await self._async_remove_domain_folder(previous):
            return

        self.data.previous_domain = None
        ir.async_delete_issue(
            self.marketplace.hass,
            DOMAIN,
            f"{DOMAIN_BRIDGE_ISSUE_PREFIX}{self.data.id}",
        )

    async def _async_remove_domain_folder(self, domain: str) -> bool:
        """Remove the folder of a domain, return if it is gone or not ours to remove.

        A symlink and a folder another repository installed to stay.
        """
        if not VALID_DOMAIN.match(domain) or any(
            repository is not self
            and repository.data.category == RepositoryCategory.INTEGRATION
            and repository.data.domain == domain
            for repository in self.marketplace.repositories.list_installed
        ):
            return True

        def _remove() -> None:
            directory = f"{self.marketplace.core.config_path}/custom_components"
            path = entry_in_directory(directory, Path(directory, domain))
            if os.path.islink(path) or not os.path.isdir(path):
                if os.path.lexists(path):
                    self.logger.warning("%s Not removing %s", self.string, path)
                return
            if not is_safe(self.marketplace, path):
                self.logger.error(
                    "%s Path %s is blocked from removal", self.string, path
                )
                return
            self.logger.debug("%s Removing %s", self.string, path)
            shutil.rmtree(path)

        try:
            await self.marketplace.hass.async_add_executor_job(_remove)
        except (OSError, MarketplaceError) as exception:
            self.logger.error(
                "%s Removing the folder of %s failed with %s",
                self.string,
                domain,
                exception,
            )
            return False
        return True
