"""Read and check the manifest of a packaged installer (.hapkg).

A package is a ZIP archive that holds a manifest named hapkg.json at its root
and the folder of the item it installs. The manifest names the item and lists
every file with its SHA-256 digest, so a damaged or altered package is refused
before anything is written. Nothing here needs Home Assistant, only the
standard library. The panel applies the same rules in
frontend/src/data/marketplace/archive-package.ts.
"""

from dataclasses import dataclass
import hashlib
import json
import re
from urllib.parse import urlsplit
import zipfile

from .upload_archive import INSTALLABLE_KINDS, UploadError

MANIFEST_NAME = "hapkg.json"
PACKAGE_FORMAT = 1
MAX_MANIFEST_BYTES = 2 * 1024 * 1024
MAX_TEXT = 200
MAX_DESCRIPTION = 2000
READ_CHUNK = 64 * 1024

_SHA256 = re.compile(r"^[0-9a-f]{64}$")
_REPOSITORY = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
_CONTROL = re.compile(r"[\x00-\x1f\x7f]")


@dataclass(frozen=True)
class PackageSource:
    """Where a package says it was built from."""

    repository: str
    path: str


@dataclass(frozen=True)
class Package:
    """What the manifest of a package says."""

    kind: str
    name: str
    version: str
    title: str
    description: str
    source: PackageSource | None
    files: dict[str, str]
    update_url: str | None = None


def _invalid(problem: str) -> UploadError:
    return UploadError("upload_package_invalid", problem=problem)


def _text(data: dict, key: str, limit: int, *, required: bool) -> str:
    value = data.get(key)
    if value is None:
        if required:
            raise _invalid(key)
        return ""
    if not isinstance(value, str) or _CONTROL.search(value) or len(value) > limit:
        raise _invalid(key)
    value = value.strip()
    if required and not value:
        raise _invalid(key)
    return value


def _source(data: dict) -> PackageSource | None:
    value = data.get("source")
    if value is None:
        return None
    if not isinstance(value, dict):
        raise _invalid("source")
    repository = value.get("repository")
    path = value.get("path", "")
    if (
        not isinstance(repository, str)
        or not _REPOSITORY.match(repository)
        or not isinstance(path, str)
        or _CONTROL.search(path)
        or len(path) > 512
        or path.startswith("/")
        or ".." in path.split("/")
    ):
        raise _invalid("source")
    return PackageSource(repository, path)


def check_update_url(value: object) -> str:
    """Return an address a package may be updated from, only https is allowed."""
    if (
        not isinstance(value, str)
        or len(value) > 2048
        or _CONTROL.search(value)
        or not (parts := urlsplit(value)).hostname
        or parts.scheme != "https"
        or parts.username
        or parts.password
    ):
        raise UploadError("upload_package_update_url")
    return value


def _update_url(data: dict) -> str | None:
    if data.get("update_url") is None:
        return None
    return check_update_url(data["update_url"])


def parse_manifest(text: str) -> Package:
    """Return the manifest, refusing one that is not complete and well formed."""
    try:
        data = json.loads(text)
    except ValueError as error:
        raise _invalid("json") from error
    if not isinstance(data, dict):
        raise _invalid("json")

    package_format = data.get("format")
    if (
        isinstance(package_format, bool)
        or not isinstance(package_format, int)
        or package_format != PACKAGE_FORMAT
    ):
        raise UploadError("upload_package_format", format=str(package_format)[:20])

    kind = data.get("kind")
    if not isinstance(kind, str) or kind not in INSTALLABLE_KINDS:
        raise _invalid("kind")

    name = _text(
        data, "domain" if kind == "integration" else "name", MAX_TEXT, required=True
    )
    version = _text(data, "version", 64, required=True)
    title = _text(data, "title", MAX_TEXT, required=False) or name
    description = _text(data, "description", MAX_DESCRIPTION, required=False)

    files = data.get("files")
    if not isinstance(files, dict) or not files:
        raise _invalid("files")
    for path, digest in files.items():
        if (
            not isinstance(path, str)
            or not path
            or path == MANIFEST_NAME
            or not isinstance(digest, str)
            or not _SHA256.match(digest)
        ):
            raise _invalid("files")

    return Package(
        kind,
        name,
        version,
        title,
        description,
        _source(data),
        files,
        _update_url(data),
    )


def read_manifest(
    archive: zipfile.ZipFile, by_name: dict[str, zipfile.ZipInfo]
) -> Package | None:
    """Return the manifest of a package, None for a plain archive."""
    info = by_name.get(MANIFEST_NAME)
    if info is None:
        return None
    if info.is_dir() or info.file_size > MAX_MANIFEST_BYTES:
        raise _invalid("size")
    with archive.open(info) as handle:
        data = handle.read(MAX_MANIFEST_BYTES + 1)
    if len(data) > MAX_MANIFEST_BYTES:
        raise _invalid("size")
    try:
        return parse_manifest(data.decode("utf-8-sig"))
    except UnicodeDecodeError as error:
        raise _invalid("json") from error


def _digest(archive: zipfile.ZipFile, info: zipfile.ZipInfo) -> str:
    """Return the digest of what really comes out of an entry."""
    sha = hashlib.sha256()
    size = 0
    with archive.open(info) as handle:
        while chunk := handle.read(READ_CHUNK):
            size += len(chunk)
            if size > info.file_size:
                raise UploadError(
                    "upload_too_large_unpacked", limit=str(info.file_size)
                )
            sha.update(chunk)
    return sha.hexdigest()


def verify_files(
    archive: zipfile.ZipFile,
    by_name: dict[str, zipfile.ZipInfo],
    package: Package,
) -> None:
    """Check that the archive holds exactly the files the manifest lists."""
    for path, expected in package.files.items():
        info = by_name.get(path)
        if info is None or info.is_dir():
            raise UploadError("upload_package_missing", path=path[:120])
        if _digest(archive, info) != expected:
            raise UploadError("upload_package_checksum", path=path[:120])

    for name, info in by_name.items():
        if info.is_dir() or name == MANIFEST_NAME or name in package.files:
            continue
        raise UploadError("upload_package_unlisted", path=name[:120])


def check_kind(package: Package, kind: str, domain: str | None) -> None:
    """Check that what the package says it is agrees with what was detected."""
    if package.kind != kind:
        raise UploadError("upload_package_kind", declared=package.kind, found=kind)
    if kind == "integration" and package.name != domain:
        raise UploadError(
            "upload_package_kind", declared=package.name, found=domain or ""
        )
