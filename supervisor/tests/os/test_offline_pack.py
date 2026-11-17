"""Test the offline update pack manifest and part verification."""

import hashlib
import json
from pathlib import Path
from typing import Any

import pytest

from supervisor.os.offline_pack import (
    MANIFEST_MAX_SIZE,
    PackManifestError,
    PackPartKind,
    PackVerifyError,
    parse_manifest,
    verify_pack,
    verify_part_file,
)

OS_FILE = "haos_generic-x86-64-13.0.raucb"
OS_CONTENT = b"os-part" * 1000


def make_manifest(**overrides: Any) -> dict[str, Any]:
    """Return a valid manifest document with the given top level overrides."""
    document: dict[str, Any] = {
        "format": 1,
        "build": "123",
        "board": "generic-x86-64",
        "parts": [
            {"kind": "supervisor", "available": False, "version": "2026.1.0"},
            {"kind": "core", "available": False, "version": "2026.1.0"},
            {
                "kind": "os",
                "available": True,
                "file": OS_FILE,
                "size": len(OS_CONTENT),
                "sha256": hashlib.sha256(OS_CONTENT).hexdigest(),
                "version": "13.0",
                "board": "generic-x86-64",
                "signature": "rauc-embedded",
            },
        ],
    }
    return document | overrides


def encode(document: Any) -> bytes:
    """Encode a document as manifest bytes."""
    return json.dumps(document).encode()


def os_part(**overrides: Any) -> dict[str, Any]:
    """Return the OS part with the given overrides."""
    return make_manifest()["parts"][2] | overrides


def test_parse_manifest_valid() -> None:
    """Test a valid manifest is parsed with every part."""
    manifest = parse_manifest(encode(make_manifest()))

    assert manifest.build == "123"
    assert manifest.board == "generic-x86-64"
    assert [part.kind for part in manifest.parts] == [
        PackPartKind.SUPERVISOR,
        PackPartKind.CORE,
        PackPartKind.OS,
    ]
    assert manifest.part(PackPartKind.OS).available is True
    assert manifest.part(PackPartKind.CORE).available is False
    assert manifest.summary()["parts"][2]["file"] == OS_FILE


@pytest.mark.parametrize(
    "data",
    [
        pytest.param(b"not json", id="not-json"),
        pytest.param(b"[]", id="not-object"),
        pytest.param(encode(make_manifest(format=2)), id="format"),
        pytest.param(encode(make_manifest(build="")), id="build"),
        pytest.param(encode(make_manifest(board="Bad Board")), id="board"),
        pytest.param(encode(make_manifest(parts=[])), id="no-parts"),
        pytest.param(encode(make_manifest(parts="x")), id="parts-type"),
        pytest.param(
            encode(make_manifest(parts=[os_part(), os_part()])), id="duplicate-kind"
        ),
        pytest.param(
            encode(make_manifest(parts=[os_part(file="../" + OS_FILE)])), id="traversal"
        ),
        pytest.param(
            encode(make_manifest(parts=[os_part(file="manifest.json")])), id="reserved"
        ),
        pytest.param(encode(make_manifest(parts=[os_part(size=0)])), id="zero-size"),
        pytest.param(encode(make_manifest(parts=[os_part(size=True)])), id="bool-size"),
        pytest.param(encode(make_manifest(parts=[os_part(sha256="abc")])), id="sha"),
        pytest.param(
            encode(make_manifest(parts=[os_part(board="odroid-n2")])), id="os-board"
        ),
        pytest.param(
            encode(make_manifest(parts=[os_part(signature=None)])), id="signature"
        ),
        pytest.param(
            encode(make_manifest(parts=[os_part(file="haos_generic-x86-64-14.0.raucb")])),
            id="os-name",
        ),
        pytest.param(encode(make_manifest(parts=[{"kind": "firmware"}])), id="kind"),
        pytest.param(b" " * (MANIFEST_MAX_SIZE + 1), id="too-large"),
    ],
)
def test_parse_manifest_invalid(data: bytes) -> None:
    """Test a malformed or unsafe manifest is rejected."""
    with pytest.raises(PackManifestError):
        parse_manifest(data)


def test_verify_pack_accepts_matching_parts(tmp_path: Path) -> None:
    """Test a pack whose files match the manifest verifies, reporting progress."""
    (tmp_path / OS_FILE).write_bytes(OS_CONTENT)
    progress: list[int] = []

    verify_pack(tmp_path, parse_manifest(encode(make_manifest())), progress.append)

    assert progress[-1] == len(OS_CONTENT)


@pytest.mark.parametrize(
    ("content", "reason"),
    [
        pytest.param(None, "missing", id="missing"),
        pytest.param(OS_CONTENT + b"x", "size", id="longer"),
        pytest.param(b"X" + OS_CONTENT[1:], "checksum", id="flipped-byte"),
    ],
)
def test_verify_pack_refuses_bad_parts(
    tmp_path: Path, content: bytes | None, reason: str
) -> None:
    """Test a missing, resized or altered part fails verification."""
    if content is not None:
        (tmp_path / OS_FILE).write_bytes(content)

    with pytest.raises(PackVerifyError, match=reason):
        verify_pack(tmp_path, parse_manifest(encode(make_manifest())))


def test_verify_part_refuses_link(tmp_path: Path) -> None:
    """Test a link in place of a part file is refused."""
    target = tmp_path / "real"
    target.write_bytes(OS_CONTENT)
    (tmp_path / OS_FILE).symlink_to(target)
    part = parse_manifest(encode(make_manifest())).part(PackPartKind.OS)

    with pytest.raises(PackVerifyError, match="missing"):
        verify_part_file(tmp_path / OS_FILE, part)


def test_verify_part_refuses_unavailable_part(tmp_path: Path) -> None:
    """Test a part marked unavailable can never verify."""
    part = parse_manifest(encode(make_manifest())).part(PackPartKind.CORE)

    with pytest.raises(PackVerifyError, match="not in this pack"):
        verify_part_file(tmp_path / "x", part)
