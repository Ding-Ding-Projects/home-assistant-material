"""SSH authorized key helpers.

Used by the SSH access page of the interface. On Home Assistant OS the keys live
in OS Agent's care; in the full hosting mode (one outer container with its own
Docker engine) they live in a file in the Supervisor's data folder, which the SSH
server of the outer container reads.
"""

import base64
import binascii
from dataclasses import dataclass
import hashlib
import os
from pathlib import Path
import re
import tempfile

# The public key types an authorized_keys line can carry.
RE_KEY_LINE = re.compile(
    r"(?:^|\s)"
    r"(?P<algo>ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp(?:256|384|521)"
    r"|sk-ssh-ed25519@openssh\.com|sk-ecdsa-sha2-nistp256@openssh\.com)"
    r"\s+(?P<blob>[A-Za-z0-9+/]{16,}={0,2})"
    r"(?:\s+(?P<comment>.*))?$"
)

# A fingerprint as OpenSSH prints it, with or without the prefix, and also in the
# URL-safe alphabet so that it can travel in a path.
RE_FINGERPRINT = re.compile(r"^(?:SHA256:)?(?P<digest>[A-Za-z0-9+/_-]{43})=?$")

FINGERPRINT_PREFIX = "SHA256:"


@dataclass(frozen=True, slots=True)
class ParsedKey:
    """A public key line, taken apart."""

    algo: str
    fingerprint: str
    comment: str


def parse_key(line: str) -> ParsedKey | None:
    """Take a public key line apart, or return None when it is not one."""
    match = RE_KEY_LINE.search(line.strip())
    if not match:
        return None
    try:
        raw = base64.b64decode(match["blob"] + "=" * (-len(match["blob"]) % 4))
    except (binascii.Error, ValueError):
        return None
    if not raw:
        return None
    digest = base64.b64encode(hashlib.sha256(raw).digest()).decode().rstrip("=")
    return ParsedKey(
        algo=match["algo"],
        fingerprint=FINGERPRINT_PREFIX + digest,
        comment=(match["comment"] or "").strip(),
    )


def key_fingerprint(line: str) -> str | None:
    """Return the SHA256 fingerprint of a public key line, as OpenSSH prints it."""
    parsed = parse_key(line)
    return parsed.fingerprint if parsed else None


def normalise_fingerprint(value: str) -> str | None:
    """Return a fingerprint in OpenSSH form, or None when it is not one.

    Accepts the form with or without the SHA256: prefix and the URL-safe
    alphabet, so that the value can be sent as one path segment.
    """
    match = RE_FINGERPRINT.match(value.strip())
    if not match:
        return None
    digest = match["digest"].replace("-", "+").replace("_", "/")
    return FINGERPRINT_PREFIX + digest


class ContainerAuthorizedKeys:
    """The authorized keys of a container host, kept in one file.

    Writes go through a temporary file in the same folder and an atomic rename,
    so the SSH server never reads a half-written file. The folder is private
    to root (mode 700) and so is the file (mode 600), which is what the SSH
    server requires before it trusts the file.
    """

    def __init__(self, path: Path) -> None:
        """Initialize with the path of the authorized_keys file."""
        self._path = path

    @property
    def path(self) -> Path:
        """Return the path of the file."""
        return self._path

    def list(self) -> list[str]:
        """Return the key lines, without blank lines and comments."""
        try:
            text = self._path.read_text(encoding="utf-8")
        except FileNotFoundError:
            return []
        return [
            line.strip()
            for line in text.splitlines()
            if line.strip() and not line.lstrip().startswith("#")
        ]

    def add(self, key: str) -> bool:
        """Add a key. Return False when a key with that fingerprint is listed."""
        fingerprint = key_fingerprint(key)
        keys = self.list()
        if fingerprint and any(key_fingerprint(line) == fingerprint for line in keys):
            return False
        keys.append(key.strip())
        self._write(keys)
        return True

    def remove(self, fingerprint: str) -> bool:
        """Remove the key with that fingerprint. Return False when none matches."""
        keys = self.list()
        remaining = [line for line in keys if key_fingerprint(line) != fingerprint]
        if len(remaining) == len(keys):
            return False
        self._write(remaining)
        return True

    def clear(self) -> None:
        """Remove every key."""
        self._write([])

    def _write(self, keys: list[str]) -> None:
        folder = self._path.parent
        folder.mkdir(mode=0o700, parents=True, exist_ok=True)
        try:
            folder.chmod(0o700)
        except OSError:
            # A folder somebody else owns; the write below reports the real problem.
            pass
        fd, temp = tempfile.mkstemp(dir=folder, prefix=".authorized_keys.")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                handle.write("".join(f"{line}\n" for line in keys))
                handle.flush()
                os.fsync(handle.fileno())
            os.chmod(temp, 0o600)
            os.replace(temp, self._path)
        except BaseException:
            try:
                os.unlink(temp)
            except OSError:
                pass
            raise
