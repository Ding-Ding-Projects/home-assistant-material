"""Offline update pack: a folder with a manifest and the update parts it lists.

The pack format is documented in docs/features/hosting/offline-update-pack.md.
Everything here is pure: no D-Bus, no mounts, so it can be tested on its own.
"""

from collections.abc import Callable
from dataclasses import dataclass
from enum import StrEnum
import hashlib
import json
from pathlib import Path
import re
from typing import Any, Final

PACK_FORMAT: Final = 1
MANIFEST_NAME: Final = "manifest.json"
MANIFEST_MAX_SIZE: Final = 256 * 1024
READ_CHUNK_SIZE: Final = 4 * 1024**2

# A pack folder name, so a scan never has to open unrelated folders
RE_PACK_FOLDER: Final = re.compile(r"^ham-offline-pack-[A-Za-z0-9][A-Za-z0-9._-]{0,63}\Z")
RE_PART_FILE: Final = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\Z")
RE_SHA256: Final = re.compile(r"^[0-9a-f]{64}\Z")
RE_BOARD: Final = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*\Z")
RE_VERSION: Final = re.compile(r"^[0-9A-Za-z][0-9A-Za-z._+-]{0,63}\Z")

OS_SIGNATURE_EMBEDDED: Final = "rauc-embedded"


class PackPartKind(StrEnum):
    """What a part of a pack updates."""

    SUPERVISOR = "supervisor"
    CORE = "core"
    OS = "os"


# Parts are always installed in this order, each one after the previous settled
INSTALL_ORDER: Final = (PackPartKind.SUPERVISOR, PackPartKind.CORE, PackPartKind.OS)


class PackManifestError(ValueError):
    """Raise when a manifest is not a valid offline pack manifest."""


class PackVerifyError(Exception):
    """Raise when a part of a pack does not match its manifest."""


@dataclass(slots=True, frozen=True)
class PackPart:
    """One part listed in a manifest."""

    kind: PackPartKind
    available: bool
    file: str | None
    size: int
    sha256: str | None
    version: str | None
    board: str | None
    signature: str | None

    def to_dict(self) -> dict[str, Any]:
        """Return the part as plain data."""
        return {
            "kind": self.kind.value,
            "available": self.available,
            "file": self.file,
            "size": self.size,
            "version": self.version,
        }


@dataclass(slots=True, frozen=True)
class PackManifest:
    """A parsed and validated manifest."""

    build: str
    board: str
    parts: tuple[PackPart, ...]

    def part(self, kind: PackPartKind) -> PackPart | None:
        """Return the part of a kind, if the manifest lists it."""
        return next((part for part in self.parts if part.kind == kind), None)

    def summary(self) -> dict[str, Any]:
        """Return what an interface needs to describe the pack."""
        return {
            "format": PACK_FORMAT,
            "build": self.build,
            "board": self.board,
            "parts": [part.to_dict() for part in self.parts],
        }


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise PackManifestError(message)


def _parse_part(raw: Any, board: str) -> PackPart:
    _require(isinstance(raw, dict), "a part is not an object")
    try:
        kind = PackPartKind(raw.get("kind"))
    except ValueError as err:
        raise PackManifestError("a part has an unknown kind") from err

    available = raw.get("available", True)
    _require(isinstance(available, bool), f"part {kind.value}: bad available flag")
    version = raw.get("version")
    _require(
        version is None or (isinstance(version, str) and RE_VERSION.match(version)),
        f"part {kind.value}: bad version",
    )

    if not available:
        return PackPart(kind, False, None, 0, None, version, None, None)

    name, size, digest = raw.get("file"), raw.get("size"), raw.get("sha256")
    _require(
        isinstance(name, str) and RE_PART_FILE.match(name) is not None,
        f"part {kind.value}: bad file name",
    )
    _require(name != MANIFEST_NAME, f"part {kind.value}: reserved file name")
    _require(
        isinstance(size, int) and not isinstance(size, bool) and size > 0,
        f"part {kind.value}: bad size",
    )
    _require(
        isinstance(digest, str) and RE_SHA256.match(digest) is not None,
        f"part {kind.value}: bad sha256",
    )

    part_board = None
    signature = None
    if kind is PackPartKind.OS:
        part_board = raw.get("board")
        signature = raw.get("signature")
        _require(version is not None, "the os part needs a version")
        _require(part_board == board, "the os part is for another board")
        _require(
            signature == OS_SIGNATURE_EMBEDDED, "the os part has an unknown signature"
        )
        _require(
            name == f"haos_{board}-{version}.raucb",
            "the os part file name does not match its board and version",
        )

    return PackPart(kind, True, name, size, digest, version, part_board, signature)


def parse_manifest(data: bytes) -> PackManifest:
    """Parse and validate manifest bytes, raising PackManifestError."""
    _require(len(data) <= MANIFEST_MAX_SIZE, "the manifest is too large")
    try:
        raw = json.loads(data)
    except (ValueError, UnicodeDecodeError) as err:
        raise PackManifestError("the manifest is not valid JSON") from err
    _require(isinstance(raw, dict), "the manifest is not an object")
    _require(raw.get("format") == PACK_FORMAT, "unsupported manifest format")

    build, board = raw.get("build"), raw.get("board")
    _require(
        isinstance(build, str) and RE_VERSION.match(build) is not None,
        "bad build number",
    )
    _require(isinstance(board, str) and RE_BOARD.match(board) is not None, "bad board")

    raw_parts = raw.get("parts")
    _require(
        isinstance(raw_parts, list) and 0 < len(raw_parts) <= len(PackPartKind),
        "bad parts list",
    )
    parts = tuple(_parse_part(item, board) for item in raw_parts)
    _require(
        len({part.kind for part in parts}) == len(parts), "a part kind is listed twice"
    )
    files = [part.file for part in parts if part.file]
    _require(len(set(files)) == len(files), "a file is listed twice")
    return PackManifest(build, board, parts)


def verify_part_file(
    path: Path,
    part: PackPart,
    on_progress: Callable[[int], None] | None = None,
) -> None:
    """Check size and SHA-256 of a part file, raising PackVerifyError.

    Links and anything that is not a regular file are refused.
    """
    if not part.available or part.file is None or part.sha256 is None:
        raise PackVerifyError(f"{part.kind.value}: the part is not in this pack")
    if path.is_symlink() or not path.is_file():
        raise PackVerifyError(f"{part.file}: the file is missing")
    if path.stat().st_size != part.size:
        raise PackVerifyError(f"{part.file}: the size does not match the manifest")

    digest = hashlib.sha256()
    done = 0
    try:
        with path.open("rb") as stream:
            while chunk := stream.read(READ_CHUNK_SIZE):
                digest.update(chunk)
                done += len(chunk)
                if on_progress:
                    on_progress(done)
    except OSError as err:
        raise PackVerifyError(f"{part.file}: can't be read: {err}") from err
    if done != part.size or digest.hexdigest() != part.sha256:
        raise PackVerifyError(f"{part.file}: the checksum does not match the manifest")


def verify_pack(
    folder: Path,
    manifest: PackManifest,
    on_progress: Callable[[int], None] | None = None,
) -> None:
    """Verify every available part of a pack, stopping at the first failure."""
    base = 0
    for part in manifest.parts:
        if not part.available or part.file is None:
            continue

        def report(done: int, base: int = base) -> None:
            if on_progress:
                on_progress(base + done)

        verify_part_file(folder / part.file, part, report)
        base += part.size
