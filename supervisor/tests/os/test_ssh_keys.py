"""Test SSH authorized key helpers."""

import base64
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import stat
import struct

import pytest

from supervisor.os.ssh_keys import (
    ContainerAuthorizedKeys,
    key_fingerprint,
    normalise_fingerprint,
    parse_key,
)

ED25519 = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDXD8u9KB94/l1YukYflKOsO7KzoSEQD4dNNlWY9zaQP test@example.com"
ED25519_FINGERPRINT = "SHA256:XtqCfiQl+C/yppPd4+0+mdScwPJe3sqxe1TozjBSA20"
ECDSA = "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBIOixE/C4G8nvrwWVvN6ru4PFCKt7Ktq5otWPgLSZFII2iwhMVEcxkBJLDLoi08D0SAZMuJphT9BW9ItvBzFgNM= second@example"
ECDSA_FINGERPRINT = "SHA256:uqOm7IdgiJrNcZ5UzDzboIQmCOkT1yVarnj8XzzAqlc"


@pytest.mark.parametrize(
    ("line", "fingerprint", "comment"),
    [
        (ED25519, ED25519_FINGERPRINT, "test@example.com"),
        (ECDSA, ECDSA_FINGERPRINT, "second@example"),
        (ED25519.rsplit(" ", 1)[0], ED25519_FINGERPRINT, ""),
        (f'no-pty,command="/bin/true" {ED25519}', ED25519_FINGERPRINT, "test@example.com"),
    ],
    ids=["ed25519", "ecdsa", "no comment", "with options"],
)
def test_parse_key(line: str, fingerprint: str, comment: str) -> None:
    """Test the fingerprint matches what OpenSSH prints."""
    parsed = parse_key(line)
    assert parsed is not None
    assert parsed.fingerprint == fingerprint
    assert parsed.comment == comment


@pytest.mark.parametrize(
    "line",
    [
        "",
        "hello world",
        "-----BEGIN OPENSSH PRIVATE KEY-----",
        "ssh-ed25519",
        "ssh-ed25519 short",
        "ssh-ed25519 !!!!!!!!!!!!!!!!!!!!!!!!!!!!",
    ],
)
def test_parse_key_rejects(line: str) -> None:
    """Test text that is not a public key."""
    assert key_fingerprint(line) is None


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (ED25519_FINGERPRINT, ED25519_FINGERPRINT),
        (ED25519_FINGERPRINT.removeprefix("SHA256:"), ED25519_FINGERPRINT),
        # URL-safe alphabet, so the value fits in one path segment
        ("XtqCfiQl-C_yppPd4-0-mdScwPJe3sqxe1TozjBSA20", ED25519_FINGERPRINT),
        ("too short", None),
        ("../" * 20, None),
    ],
)
def test_normalise_fingerprint(value: str, expected: str | None) -> None:
    """Test fingerprints are accepted in OpenSSH and URL-safe form."""
    assert normalise_fingerprint(value) == expected


def test_container_keys_add_list_remove_clear(tmp_path: Path) -> None:
    """Test the file keeps one line per key and stays private."""
    keys = ContainerAuthorizedKeys(tmp_path / "ssh" / "authorized_keys")
    assert keys.list() == []

    assert keys.add(ED25519 + "\n") is True
    assert keys.add(ECDSA) is True
    # The same key again is not written twice
    assert keys.add(ED25519) is False
    assert keys.list() == [ED25519, ECDSA]
    assert stat.S_IMODE(keys.path.stat().st_mode) == 0o600
    assert stat.S_IMODE(keys.path.parent.stat().st_mode) == 0o700

    assert keys.remove(ED25519_FINGERPRINT) is True
    assert keys.remove(ED25519_FINGERPRINT) is False
    assert keys.list() == [ECDSA]

    keys.clear()
    assert keys.list() == []
    assert keys.path.read_text() == ""
    assert [path.name for path in keys.path.parent.iterdir()] == ["authorized_keys"]


def test_container_keys_ignore_comments(tmp_path: Path) -> None:
    """Test blank lines and comments are not keys."""
    path = tmp_path / "authorized_keys"
    path.write_text(f"# note\n\n{ED25519}\n")
    assert ContainerAuthorizedKeys(path).list() == [ED25519]


def make_ed25519(seed: int) -> str:
    """Build a valid ed25519 public key line from a seed byte."""
    raw = (
        struct.pack(">I", 11)
        + b"ssh-ed25519"
        + struct.pack(">I", 32)
        + bytes([seed]) * 32
    )
    return f"ssh-ed25519 {base64.b64encode(raw).decode()} key{seed}"


def test_parse_key_uses_the_key_the_server_uses() -> None:
    """Test a decoy key hidden in the options does not set the fingerprint."""
    decoy = f'command="exec sh # {make_ed25519(1)}" {make_ed25519(2)}'
    parsed = parse_key(decoy)
    assert parsed is not None
    assert parsed.fingerprint == key_fingerprint(make_ed25519(2))
    assert parsed.fingerprint != key_fingerprint(make_ed25519(1))
    assert parsed.options.startswith("command=")
    assert parse_key(decoy, allow_options=False) is None


@pytest.mark.parametrize(
    "line",
    [
        ED25519.rsplit(" ", 1)[0][:-12],
        "ssh-ed25519 AAAAAAAAAAAAAAAAAAAAAAAA t",
        ED25519.replace("ssh-ed25519", "ssh-rsa", 1),
    ],
    ids=["truncated", "junk body", "mismatched type"],
)
def test_parse_key_checks_the_key_body(line: str) -> None:
    """Test a key body must be a whole key of the declared type."""
    assert parse_key(line) is None


@pytest.mark.parametrize("separator", ["\u2028", "\u2029", "\x85", "\r", "\n"])
def test_parse_key_rejects_line_separators(separator: str) -> None:
    """Test a separator the server does not split on is not part of a key."""
    assert parse_key(f"{make_ed25519(1)}{separator}{make_ed25519(2)}") is None


def test_container_keys_read_lines_like_the_server(tmp_path: Path) -> None:
    """Test only a line feed splits lines, so the list matches what is authorized."""
    path = tmp_path / "authorized_keys"
    line = f"{make_ed25519(1)}\u2028{make_ed25519(2)}"
    path.write_text(f"{line}\n", encoding="utf-8", newline="")
    assert ContainerAuthorizedKeys(path).list() == [line]


def test_container_keys_keep_comments_on_rewrite(tmp_path: Path) -> None:
    """Test a rewrite keeps lines that are not keys."""
    path = tmp_path / "authorized_keys"
    path.write_text(f"# by hand\n{ED25519}\n", encoding="utf-8", newline="")
    keys = ContainerAuthorizedKeys(path)
    assert keys.add(ECDSA) is True
    assert keys.remove(ED25519_FINGERPRINT) is True
    assert path.read_text(encoding="utf-8") == f"# by hand\n{ECDSA}\n"
    keys.clear()
    assert path.read_text(encoding="utf-8") == "# by hand\n"


def test_container_keys_serialize_changes(tmp_path: Path) -> None:
    """Test requests that overlap do not lose a key or bring back a removed one."""
    keys = ContainerAuthorizedKeys(tmp_path / "authorized_keys")
    lines = [make_ed25519(seed) for seed in range(1, 25)]
    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(keys.add, lines))
    assert sorted(keys.list()) == sorted(lines)

    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(lambda line: keys.remove(key_fingerprint(line)), lines[:12]))
    assert sorted(keys.list()) == sorted(lines[12:])
