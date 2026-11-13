"""Add something to Home Assistant from a ZIP archive of a repository.

The panel looks inside the archive first and shows what it found. This view
looks again, on its own, and installs only the item the person chose. What is
installed is placed by name, the way the link based install places it, and
nothing it did not create is ever overwritten.
"""

import asyncio
from dataclasses import dataclass
from datetime import UTC, datetime
import hashlib
from http import HTTPStatus
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
from urllib.parse import quote
import zipfile

from aiohttp import BodyPartReader
from aiohttp.web import Request, Response
import probatio
import yaml

from homeassistant import components
from homeassistant.components import lovelace
from homeassistant.components.frontend import (
    CONF_THEMES,
    CONFIG_SCHEMA as FRONTEND_CONFIG_SCHEMA,
    DATA_EXTRA_MODULE_URL,
    DOMAIN as FRONTEND_DOMAIN,
)
from homeassistant.components.http import (
    KEY_HASS,
    KEY_HASS_USER,
    HomeAssistantView,
    require_admin,
)
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.issue_registry import IssueSeverity, async_create_issue
from homeassistant.helpers.template import MAX_CUSTOM_TEMPLATE_SIZE
from homeassistant.helpers.translation import async_invalidate_translations
from homeassistant.loader import (
    PACKAGE_CUSTOM_COMPONENTS,
    async_clear_custom_components_cache,
    async_get_custom_components,
    async_mount_config_dir,
)
from homeassistant.util.yaml import load_yaml, load_yaml_dict

from .base import MarketplaceManager
from .const import DASHBOARD_RESOURCE_BASE, DOMAIN, RESTART_ISSUE_PREFIX
from .upload_archive import (
    INSTALLABLE_KINDS,
    MAX_UPLOAD_SIZE,
    VALID_DOMAIN,
    Item,
    UploadError,
    detect,
    read_marker,
    slug,
    stage_files,
    validate_archive,
)
from .utils.logger import LOGGER

UPLOAD_MARKER = ".marketplace-upload.json"
UPLOAD_LOCK = "marketplace_upload_lock"
FIELD_LIMIT = 1024
READ_CHUNK = 64 * 1024

_STATUS_BY_KEY = {
    "upload_too_large": HTTPStatus.REQUEST_ENTITY_TOO_LARGE,
    "not_loaded": HTTPStatus.SERVICE_UNAVAILABLE,
    "warning_not_accepted": HTTPStatus.FORBIDDEN,
}


@dataclass
class _Plan:
    """What is staged and where it goes."""

    item: Item
    staged: Path
    target: Path
    replaces_upload: bool
    created_www: bool = False


@dataclass
class _Result:
    """What an install did."""

    kind: str
    name: str
    path: str
    restart_required: bool = False
    resource_url: str | None = None
    resource_added: bool = False


def _error_response(view: HomeAssistantView, error: UploadError) -> Response:
    """Answer with the message of an error, in the language of Home Assistant."""
    message = str(
        HomeAssistantError(
            translation_domain=DOMAIN,
            translation_key=error.key,
            translation_placeholders=error.placeholders,
        )
    )
    return view.json(
        {
            "message": message,
            "code": error.key,
            "translation_domain": DOMAIN,
            "translation_key": error.key,
            "translation_placeholders": error.placeholders,
        },
        status_code=_STATUS_BY_KEY.get(error.key, HTTPStatus.BAD_REQUEST),
    )


class MarketplaceUploadView(HomeAssistantView):
    """Install an item of an uploaded ZIP archive."""

    url = "/api/marketplace/upload"
    name = "api:marketplace:upload"

    @require_admin
    async def post(self, request: Request) -> Response:
        """Install what was chosen in an uploaded archive.

        The form holds the fields kind and source, naming the item the panel
        showed, and then the archive itself as file.
        """
        hass = request.app[KEY_HASS]
        try:
            marketplace = _loaded_marketplace(hass, request[KEY_HASS_USER].id)
            lock = hass.data.setdefault(UPLOAD_LOCK, asyncio.Lock())
            async with lock:
                result = await _receive_and_install(hass, marketplace, request)
        except UploadError as error:
            return _error_response(self, error)

        return self.json(
            {
                "kind": result.kind,
                "name": result.name,
                "path": result.path,
                "restart_required": result.restart_required,
                "resource_url": result.resource_url,
                "resource_added": result.resource_added,
            },
            status_code=HTTPStatus.CREATED,
        )


def _loaded_marketplace(hass: HomeAssistant, user_id: str) -> MarketplaceManager:
    """Return the Marketplace of a user who accepted its warning."""
    if not (entries := hass.config_entries.async_loaded_entries(DOMAIN)):
        raise UploadError("not_loaded")

    marketplace: MarketplaceManager = entries[0].runtime_data
    if not marketplace.warning_accepted(user_id):
        raise UploadError("warning_not_accepted")
    return marketplace


async def _read_text_field(part: BodyPartReader) -> str:
    """Return a small text field of the form."""
    data = await part.read(decode=True)
    if len(data) > FIELD_LIMIT:
        raise UploadError("upload_bad_request")
    return bytes(data).decode("utf-8", errors="replace")


async def _receive_and_install(
    hass: HomeAssistant, marketplace: MarketplaceManager, request: Request
) -> _Result:
    """Read the form, keep the archive in a temporary folder and install."""
    config_path = Path(hass.config.path())
    staging = Path(
        await hass.async_add_executor_job(
            lambda: tempfile.mkdtemp(prefix=".marketplace_upload_", dir=config_path)
        )
    )
    try:
        fields: dict[str, str] = {}
        archive_path = staging / "upload.zip"
        archive_name = ""
        reader = await request.multipart()
        received = False
        while part := await reader.next():
            if not isinstance(part, BodyPartReader):
                raise UploadError("upload_bad_request")
            if part.name in ("kind", "source"):
                fields[part.name] = await _read_text_field(part)
            elif part.name == "file" and not received:
                if "kind" not in fields or "source" not in fields:
                    raise UploadError("upload_bad_request")
                archive_name = part.filename or ""
                await _save_upload(hass, part, archive_path)
                received = True
            else:
                raise UploadError("upload_bad_request")

        if not received:
            raise UploadError("upload_bad_request")

        plan = await hass.async_add_executor_job(
            _prepare,
            archive_path,
            archive_name,
            fields["kind"],
            fields["source"],
            staging / "stage",
            marketplace,
            config_path,
        )
        return await _install(hass, marketplace, plan, config_path)
    finally:
        await hass.async_add_executor_job(shutil.rmtree, staging, True)


async def _save_upload(
    hass: HomeAssistant, part: BodyPartReader, destination: Path
) -> None:
    """Keep the archive on disk, stopping at the size an upload may have."""
    size = 0
    with destination.open("xb") as handle:
        while chunk := await part.read_chunk(READ_CHUNK):
            size += len(chunk)
            if size > MAX_UPLOAD_SIZE:
                raise UploadError("upload_too_large", limit=str(MAX_UPLOAD_SIZE))
            await hass.async_add_executor_job(handle.write, chunk)


def _prepare(
    archive_path: Path,
    archive_name: str,
    kind: str,
    source: str,
    stage: Path,
    marketplace: MarketplaceManager,
    config_path: Path,
) -> _Plan:
    """Check the archive, find the chosen item again and stage its files.

    Runs in the executor.
    """
    try:
        archive = zipfile.ZipFile(archive_path)
    except zipfile.BadZipFile as error:
        raise UploadError("upload_not_zip") from error

    with archive:
        infos = archive.infolist()
        validate_archive(infos)
        by_name = {info.filename: info for info in infos}

        def read(path: str) -> str | None:
            return read_marker(archive, by_name[path]) if path in by_name else None

        items = detect([info.filename for info in infos], read, archive_name)
        item = next(
            (found for found in items if found.kind == kind and found.source == source),
            None,
        )
        if item is None:
            raise UploadError("upload_item_not_found")

        if item.kind not in INSTALLABLE_KINDS:
            raise UploadError("upload_not_supported", name=item.name)

        if item.problems:
            raise UploadError(
                "upload_item_invalid", name=item.name, problems=", ".join(item.problems)
            )

        stage.mkdir()
        return _stage(archive, by_name, item, stage, marketplace, config_path)


def _marker_data(item: Item) -> str:
    return json.dumps(
        {
            "source": "upload",
            "kind": item.kind,
            "name": item.name,
            "version": item.version,
            "uploaded": datetime.now(UTC).isoformat(),
        }
    )


def _existing_target(target: Path, relative: str, *, directory: bool) -> bool:
    """Return if the target is an earlier upload, refuse anything else."""
    if not os.path.lexists(target):
        return False

    if directory and target.is_dir() and not target.is_symlink():
        if (target / UPLOAD_MARKER).is_file():
            return True

    raise UploadError("upload_target_exists", path=relative)


def _stage(
    archive: zipfile.ZipFile,
    by_name: dict[str, zipfile.ZipInfo],
    item: Item,
    stage: Path,
    marketplace: MarketplaceManager,
    config_path: Path,
) -> _Plan:
    """Unpack the files of an item into the staging folder, ready to move."""
    configuration = marketplace.configuration
    directory = slug(item.domain if item.kind == "integration" else item.name)
    plan: _Plan

    if item.kind == "integration":
        domain = item.domain or ""
        if not VALID_DOMAIN.match(domain):
            raise UploadError("upload_item_invalid", name=item.name, problems="domain")
        if (Path(components.__file__).parent / domain / "manifest.json").is_file():
            raise UploadError("upload_built_in", domain=domain)
        target = config_path / "custom_components" / domain
        staged = stage / domain
        staged.mkdir()
        stage_files(archive, by_name, item.source, staged)
        if not (staged / "manifest.json").is_file():
            raise UploadError("upload_item_not_found")
        plan = _Plan(
            item,
            staged,
            target,
            _existing_target(
                target, f"custom_components/{domain}", directory=True
            ),
        )

    elif item.kind == "plugin":
        created_www = not (config_path / "www").is_dir()
        script_dir = item.source.rsplit("/", 1)[0] if "/" in item.source else ""
        copies_directory = script_dir == "dist" or script_dir.endswith("/dist")
        target = config_path / configuration.plugin_path.strip("/") / directory
        staged = stage / directory
        staged.mkdir()
        stage_files(
            archive,
            by_name,
            script_dir,
            staged,
            only=None if copies_directory else item.file,
        )
        if not (staged / (item.file or "")).is_file():
            raise UploadError("upload_item_not_found")
        relative = f"{configuration.plugin_path.strip('/')}/{directory}"
        plan = _Plan(
            item,
            staged,
            target,
            _existing_target(target, relative, directory=True),
            created_www,
        )

    elif item.kind == "theme":
        target = config_path / configuration.theme_path.strip("/") / directory
        staged = stage / directory
        staged.mkdir()
        if item.rule == "theme_hacs_file":
            folder, _, name = item.source.rpartition("/")
            stage_files(archive, by_name, folder, staged, only=name)
        else:
            stage_files(archive, by_name, item.source, staged)
        _check_themes(staged)
        relative = f"{configuration.theme_path.strip('/')}/{directory}"
        plan = _Plan(
            item,
            staged,
            target,
            _existing_target(target, relative, directory=True),
        )

    elif item.kind == "template":
        name = item.file or ""
        if not name.endswith(".jinja") or "/" in name:
            raise UploadError("upload_item_invalid", name=item.name, problems="file")
        folder, _, _ = item.source.rpartition("/")
        staged = stage / name
        stage_files(archive, by_name, folder, stage, only=name)
        _check_template(staged)
        target = config_path / "custom_templates" / name
        plan = _Plan(
            item,
            staged,
            target,
            _existing_target(target, f"custom_templates/{name}", directory=False),
        )

    else:
        name = item.source.rsplit("/", 1)[-1]
        staged = stage / name
        folder = item.source.rpartition("/")[0]
        stage_files(archive, by_name, folder, stage, only=name)
        try:
            load_yaml_dict(str(staged))
        except HomeAssistantError as error:
            raise UploadError(
                "upload_blueprint_invalid", name=item.name, error=str(error)
            ) from error
        target = config_path / "blueprints" / (item.domain or "") / "uploaded" / name
        plan = _Plan(
            item,
            staged,
            target,
            _existing_target(
                target,
                f"blueprints/{item.domain}/uploaded/{name}",
                directory=False,
            ),
        )

    if plan.item.kind in ("integration", "plugin", "theme"):
        (plan.staged / UPLOAD_MARKER).write_text(
            _marker_data(plan.item), encoding="utf-8"
        )
    return plan


def _check_themes(staged: Path) -> None:
    """Refuse a theme the frontend can not load.

    A broken one stops Home Assistant from loading its configuration at the
    next start, and a tag would serve the files it names to every user.
    """
    for theme in staged.rglob("*.yaml"):
        try:
            yaml.safe_load(theme.read_text(encoding="utf-8"))
            themes = load_yaml(str(theme))
        except (HomeAssistantError, UnicodeDecodeError, yaml.YAMLError) as error:
            raise UploadError(
                "upload_theme_invalid", file=theme.name, error=str(error)
            ) from error

        if not isinstance(themes, dict):
            continue
        try:
            FRONTEND_CONFIG_SCHEMA({FRONTEND_DOMAIN: {CONF_THEMES: themes}})
        except probatio.Invalid as error:
            raise UploadError(
                "upload_theme_invalid", file=theme.name, error=str(error)
            ) from error


def _check_template(staged: Path) -> None:
    """Refuse a template Home Assistant can not read."""
    content = staged.read_bytes()
    if len(content) > MAX_CUSTOM_TEMPLATE_SIZE:
        raise UploadError(
            "upload_template_invalid", file=staged.name, error="too large"
        )
    try:
        content.decode("utf-8")
    except UnicodeDecodeError as error:
        raise UploadError(
            "upload_template_invalid", file=staged.name, error="not UTF-8"
        ) from error


def _place(plan: _Plan) -> None:
    """Move the staged files into place, put the old upload back on failure."""
    plan.target.parent.mkdir(parents=True, exist_ok=True)
    if not plan.replaces_upload:
        os.replace(plan.staged, plan.target)
        return

    previous = plan.target.with_name(f"{plan.target.name}.marketplace-old")
    shutil.rmtree(previous, ignore_errors=True)
    os.replace(plan.target, previous)
    try:
        os.replace(plan.staged, plan.target)
    except OSError:
        os.replace(previous, plan.target)
        raise
    shutil.rmtree(previous, ignore_errors=True)


async def _install(
    hass: HomeAssistant,
    marketplace: MarketplaceManager,
    plan: _Plan,
    config_path: Path,
) -> _Result:
    """Place the files and run the steps that make Home Assistant use them."""
    try:
        await hass.async_add_executor_job(_place, plan)
    except OSError as error:
        raise UploadError("upload_write_failed", error=str(error)) from error

    item = plan.item
    result = _Result(
        kind=item.kind,
        name=item.name,
        path=plan.target.relative_to(config_path).as_posix(),
    )
    LOGGER.info("Added %s %s from an uploaded archive", item.kind, item.name)

    try:
        if item.kind == "integration":
            await _reload_custom_components(hass, item.domain or "")
            result.restart_required = True
        elif item.kind == "plugin":
            await _add_dashboard_resource(hass, plan, result)
        elif item.kind == "theme":
            await _call(hass, "frontend", "reload_themes")
        elif item.kind == "template":
            await _call(hass, "homeassistant", "reload_custom_templates")
        else:
            blueprints = hass.data.get("blueprint", {}).get(item.domain)
            if blueprints is not None:
                await blueprints.async_reset_cache()
    except Exception as error:
        LOGGER.exception("Steps after adding %s from an archive failed", item.name)
        raise UploadError(
            "upload_post_install_failed", name=item.name, error=str(error)
        ) from error

    if result.restart_required:
        async_create_issue(
            hass=hass,
            domain=DOMAIN,
            issue_id=f"{RESTART_ISSUE_PREFIX}upload_{slug(item.name)}",
            is_fixable=True,
            severity=IssueSeverity.WARNING,
            translation_key="restart_required",
            translation_placeholders={"name": item.name},
        )
    return result


async def _call(hass: HomeAssistant, domain: str, service: str) -> None:
    """Call a reload service, the files are in place when it fails."""
    try:
        await hass.services.async_call(domain, service, {})
    except HomeAssistantError:
        LOGGER.exception("Calling %s.%s failed", domain, service)


async def _reload_custom_components(hass: HomeAssistant, domain: str) -> None:
    """Scan custom_components again, the loader mounts it at startup only."""
    if PACKAGE_CUSTOM_COMPONENTS not in sys.modules:
        async_mount_config_dir(hass)
    async_clear_custom_components_cache(hass)
    async_invalidate_translations(hass, {domain})
    await async_get_custom_components(hass)


async def _add_dashboard_resource(
    hass: HomeAssistant, plan: _Plan, result: _Result
) -> None:
    """Add the card as a dashboard resource, when the dashboards allow it."""
    directory = plan.target.name
    file = plan.item.file or ""
    digest = await hass.async_add_executor_job(_file_tag, plan.target / file)
    namespace = f"{DASHBOARD_RESOURCE_BASE}/{directory}"
    url = f"{namespace}/{quote(file)}?v=upload-{digest}"
    result.resource_url = url
    result.restart_required = plan.created_www

    if (extra := hass.data.get(DATA_EXTRA_MODULE_URL)) is not None and any(
        known.startswith(f"{namespace}/") for known in extra.urls
    ):
        result.resource_added = True
        return

    lovelace_data = hass.data.get(lovelace.LOVELACE_DATA)
    resources = getattr(lovelace_data, "resources", None)
    if (
        not isinstance(resources, lovelace.resources.ResourceStorageCollection)
        or resources.store is None
        or resources.store.key != "lovelace_resources"
    ):
        return

    if not resources.loaded:
        await resources.async_load()
        resources.loaded = True

    for entry in resources.async_items():
        if entry["url"].startswith(f"{namespace}/"):
            await resources.async_update_item(entry["id"], {"url": url})
            result.resource_added = True
            return

    await resources.async_create_item({"res_type": "module", "url": url})
    result.resource_added = True


def _file_tag(path: Path) -> str:
    """Return a short tag that changes when the card file does."""
    return hashlib.sha256(path.read_bytes()).hexdigest()[:10]
