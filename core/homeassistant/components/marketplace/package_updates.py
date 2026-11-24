"""Keep installed packages up to date from the index their manifest names.

A package that was installed from a .hapkg file can name an update_url, the
address of an index of packages. That recorded address is the only place an
update of that package is ever looked for. A newer version is offered through
an update entity and, when the person left automatic updates on, installed
through the same checks as a package that was dropped on the panel.
"""

import asyncio
from dataclasses import dataclass
from datetime import datetime
import hashlib
import json
from pathlib import Path
import shutil
import tempfile
from typing import TYPE_CHECKING, Any

from aiohttp import ClientError, ClientTimeout
from awesomeversion import AwesomeVersion

from homeassistant.core import callback
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.issue_registry import (
    IssueSeverity,
    async_create_issue,
    async_delete_issue,
)

from .const import DOMAIN, SIGNAL_PACKAGES_CHANGED
from .upload_archive import MAX_UPLOAD_SIZE, UploadError
from .upload_package import check_update_url
from .utils.logger import LOGGER

if TYPE_CHECKING:
    from .base import MarketplaceManager

UPLOAD_MARKER = ".marketplace-upload.json"
ISSUE_PREFIX = "package_update_failed_"
MAX_INDEX_BYTES = 1024 * 1024
REQUEST_TIMEOUT = 60
CHUNK = 64 * 1024
_SHA256_LENGTH = 64

STATE_IDLE = "idle"
STATE_UPDATING = "updating"
STATE_RESTART = "restart"
STATE_FAILED = "failed"


@dataclass
class PackageRecord:
    """An installed package that names where its updates come from."""

    key: str
    kind: str
    name: str
    title: str
    version: str
    update_url: str
    auto_update: bool
    directory: Path
    latest_version: str | None = None
    download_url: str | None = None
    sha256: str | None = None
    notes: str | None = None
    state: str = STATE_IDLE
    error: str | None = None

    @property
    def update_available(self) -> bool:
        """Return if the index offers a newer version than the installed one."""
        if self.latest_version is None:
            return False
        try:
            return AwesomeVersion(self.latest_version) > AwesomeVersion(self.version)
        except Exception:  # noqa: BLE001
            return False


def _marker_directories(
    config_path: Path, plugin_path: str, theme_path: str
) -> list[Path]:
    directories: list[Path] = []
    for base in (
        config_path / "custom_components",
        config_path / plugin_path.strip("/"),
        config_path / theme_path.strip("/"),
    ):
        if base.is_dir():
            directories.extend(
                child
                for child in sorted(base.iterdir())
                if (child / UPLOAD_MARKER).is_file()
            )
    return directories


def _read_records(
    config_path: Path, plugin_path: str, theme_path: str
) -> list[PackageRecord]:
    """Read the packages with an update address, runs in the executor."""
    records: list[PackageRecord] = []
    for directory in _marker_directories(config_path, plugin_path, theme_path):
        try:
            data = json.loads((directory / UPLOAD_MARKER).read_text(encoding="utf-8"))
            package = data["package"]
            update_url = check_update_url(package["update_url"])
            name = str(package["name"])
            kind = str(data["kind"])
            records.append(
                PackageRecord(
                    key=f"{kind}:{name}",
                    kind=kind,
                    name=name,
                    title=str(package.get("title") or name),
                    version=str(package["version"]),
                    update_url=update_url,
                    auto_update=bool(package.get("auto_update", True)),
                    directory=directory,
                )
            )
        except OSError, ValueError, KeyError, TypeError, UploadError:
            continue
    return records


def _write_auto_update(directory: Path, value: bool) -> None:
    marker = directory / UPLOAD_MARKER
    data = json.loads(marker.read_text(encoding="utf-8"))
    data["package"]["auto_update"] = value
    marker.write_text(json.dumps(data), encoding="utf-8")


def _entries(document: Any) -> list[dict[str, Any]]:
    if isinstance(document, dict):
        document = document.get("packages", document.get("entries"))
    if not isinstance(document, list):
        return []
    return [entry for entry in document if isinstance(entry, dict)]


class PackageUpdates:
    """The installed packages that can be updated, and what the index offers."""

    def __init__(self, marketplace: MarketplaceManager) -> None:
        """Initialize."""
        self.marketplace = marketplace
        self.records: dict[str, PackageRecord] = {}
        self._locks: dict[str, asyncio.Lock] = {}

    @callback
    def _changed(self, record: PackageRecord | None = None) -> None:
        async_dispatcher_send(
            self.marketplace.hass,
            SIGNAL_PACKAGES_CHANGED,
            record.key if record else None,
        )

    async def async_rescan(self) -> None:
        """Read the installed packages again, what was learned stays."""
        hass = self.marketplace.hass
        configuration = self.marketplace.configuration
        found = await hass.async_add_executor_job(
            _read_records,
            Path(hass.config.path()),
            configuration.plugin_path,
            configuration.theme_path,
        )
        previous = self.records
        self.records = {}
        for record in found:
            if (old := previous.get(record.key)) is not None and (
                old.version == record.version
            ):
                record.latest_version = old.latest_version
                record.download_url = old.download_url
                record.sha256 = old.sha256
                record.notes = old.notes
                record.state = old.state
                record.error = old.error
            self.records[record.key] = record
        self._changed()

    async def async_set_auto_update(self, key: str, value: bool) -> None:
        """Remember the choice of the person."""
        record = self.records[key]
        await self.marketplace.hass.async_add_executor_job(
            _write_auto_update, record.directory, value
        )
        record.auto_update = value
        self._changed(record)

    async def async_check_all(self, _: datetime | None = None) -> None:
        """Look for updates of every package, and install where it is allowed."""
        await self.async_rescan()
        for key in list(self.records):
            await self.async_check(key)

    async def async_check(self, key: str) -> None:
        """Look for an update of one package."""
        if (record := self.records.get(key)) is None:
            return
        try:
            await self._async_read_index(record)
        except (UploadError, ClientError, TimeoutError, ValueError) as error:
            LOGGER.warning(
                "Checking for an update of %s failed: %s", record.name, error
            )
            return
        self._changed(record)
        if (
            record.update_available
            and record.auto_update
            and record.state not in (STATE_UPDATING, STATE_RESTART)
        ):
            await self.async_install(key)

    async def _async_read_index(self, record: PackageRecord) -> None:
        document = await self._async_get_json(record.update_url)
        for entry in _entries(document):
            name = entry.get("domain", entry.get("name"))
            if name != record.name or entry.get("kind", record.kind) != record.kind:
                continue
            version = entry.get("version")
            url = entry.get("url")
            sha256 = entry.get("sha256")
            if (
                not isinstance(version, str)
                or not version
                or not isinstance(sha256, str)
                or len(sha256) != _SHA256_LENGTH
            ):
                continue
            try:
                record.download_url = check_update_url(url)
            except UploadError:
                continue
            record.latest_version = version
            record.sha256 = sha256.lower()
            notes = entry.get("notes")
            record.notes = notes[:5000] if isinstance(notes, str) else None
            return
        record.latest_version = None
        record.download_url = None
        record.sha256 = None
        record.notes = None

    async def _async_get_json(self, url: str) -> Any:
        async with self.marketplace.session.get(
            url, timeout=ClientTimeout(total=REQUEST_TIMEOUT)
        ) as response:
            response.raise_for_status()
            if response.url.scheme != "https":
                raise UploadError("upload_package_update_url")
            data = await response.content.read(MAX_INDEX_BYTES + 1)
        if len(data) > MAX_INDEX_BYTES:
            raise UploadError("upload_too_large", limit=str(MAX_INDEX_BYTES))
        return json.loads(data)

    async def async_install(self, key: str) -> None:
        """Download the offered version and install it, a failure changes nothing."""
        from .upload import InstalledPackage, error_message, install_package_file  # noqa: PLC0415

        record = self.records[key]
        lock = self._locks.setdefault(key, asyncio.Lock())
        if lock.locked():
            return
        async with lock:
            if (
                not record.update_available
                or record.download_url is None
                or record.sha256 is None
            ):
                return
            record.state = STATE_UPDATING
            record.error = None
            self._changed(record)
            hass = self.marketplace.hass
            staging: Path | None = None
            try:
                staging = Path(
                    await hass.async_add_executor_job(
                        lambda: tempfile.mkdtemp(
                            prefix=".marketplace_upload_", dir=hass.config.path()
                        )
                    )
                )
                package_file = staging / f"{record.name}.hapkg"
                await self._async_download(record, package_file)
                result = await install_package_file(
                    hass,
                    self.marketplace,
                    package_file,
                    InstalledPackage(
                        record.kind, record.name, record.version, record.auto_update
                    ),
                )
            except UploadError as error:
                self._failed(record, error_message(error))
            except (ClientError, TimeoutError, OSError) as error:
                self._failed(record, str(error) or type(error).__name__)
            else:
                # Installing scanned the packages again, this is the new record
                record = self.records.get(key, record)
                record.version = (
                    result.version or record.latest_version or record.version
                )
                record.title = result.title or record.title
                record.state = (
                    STATE_RESTART if record.kind == "integration" else STATE_IDLE
                )
                async_delete_issue(hass, DOMAIN, f"{ISSUE_PREFIX}{record.name}")
                LOGGER.info("Updated %s to %s", record.name, record.version)
            finally:
                if staging is not None:
                    await hass.async_add_executor_job(shutil.rmtree, staging, True)
            self._changed(record)

    def _failed(self, record: PackageRecord, reason: str) -> None:
        record.state = STATE_FAILED
        record.error = reason
        LOGGER.warning("Updating %s failed: %s", record.name, reason)
        async_create_issue(
            self.marketplace.hass,
            DOMAIN,
            f"{ISSUE_PREFIX}{record.name}",
            is_fixable=False,
            is_persistent=True,
            severity=IssueSeverity.WARNING,
            translation_key="package_update_failed",
            translation_placeholders={
                "name": record.title,
                "version": record.latest_version or "",
                "error": reason,
            },
        )

    async def _async_download(self, record: PackageRecord, destination: Path) -> None:
        """Download the package over https, check its digest and size."""
        sha = hashlib.sha256()
        size = 0
        hass = self.marketplace.hass
        assert record.download_url is not None
        async with self.marketplace.session.get(
            record.download_url, timeout=ClientTimeout(total=REQUEST_TIMEOUT)
        ) as response:
            response.raise_for_status()
            if response.url.scheme != "https":
                raise UploadError("upload_package_update_url")
            with destination.open("xb") as handle:
                async for chunk in response.content.iter_chunked(CHUNK):
                    size += len(chunk)
                    if size > MAX_UPLOAD_SIZE:
                        raise UploadError(
                            "upload_too_large", limit=str(MAX_UPLOAD_SIZE)
                        )
                    sha.update(chunk)
                    await hass.async_add_executor_job(handle.write, chunk)
        if sha.hexdigest() != record.sha256:
            raise UploadError("upload_package_download_checksum")
