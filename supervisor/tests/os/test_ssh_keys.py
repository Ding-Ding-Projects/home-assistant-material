"""Test SSH authorized key helpers."""

from pathlib import Path
import stat

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
