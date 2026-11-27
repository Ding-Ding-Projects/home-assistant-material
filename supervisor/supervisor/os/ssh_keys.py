"""SSH authorized key helpers.

Used by the SSH access page of the interface. On Home Assistant OS the keys live
in OS Agent's care; in the full hosting mode (one outer container with its own
Docker engine) they live in a file in the Supervisor's data folder, which the SSH
server of the outer container reads.
"""

import base64
import binascii
import contextlib
from dataclasses import dataclass
import hashlib
import os
from pathlib import Path
import re
import tempfile
import threading

# The environment variable the outer container sets to say that it runs an SSH
# server, and on which published port the owner can reach it.
ENV_SSH_PORT = "SUPERVISOR_SSH_PORT"

# The public key types an authorized_keys line can carry, with the names of the
# length-prefixed fields that follow the type name in the key body.
_KEY_TYPES: dict[str, tuple[str, ...]] = {
    "ssh-ed25519": ("key",),
    "ssh-rsa": ("e", "n"),
    "ecdsa-sha2-nistp256": ("curve", "point"),
    "ecdsa-sha2-nistp384": ("curve", "point"),
    "ecdsa-sha2-nistp521": ("curve", "point"),
    "sk-ssh-ed25519@openssh.com": ("key", "application"),
    "sk-ecdsa-sha2-nistp256@openssh.com": ("curve", "point", "application"),
}

RE_BLOB = re.compile(r"^[A-Za-z0-9+/]{16,}={0,2}$")
RE_CURVE = re.compile(r"nistp\d+")

# A fingerprint as OpenSSH prints it, with or without the prefix, and also in the
# URL-safe alphabet so that it can travel in a path.
RE_FINGERPRINT = re.compile(r"^(?:SHA256:)?(?P<digest>[A-Za-z0-9+/_-]{43})=?$")

FINGERPRINT_PREFIX = "SHA256:"

# What may not appear in a key line. The SSH server splits lines on a line feed
# only, but other readers split on more, so every line separator is refused.
RE_LINE_BREAKS = re.compile("[\x00-\x1f\x7f\x85\u2028\u2029]")


@dataclass(frozen=True, slots=True)
class ParsedKey:
    """A public key line, taken apart."""

    algo: str
    fingerprint: str
    comment: str
    options: str = ""


def _split_options(line: str) -> tuple[str, str] | None:
    """Split the options field off a line the way the SSH server does.

    The field ends at the first space or tab outside double quotes. Return the
    options (empty when the line starts with a key type) and the rest.
    """
    if line.split(None, 1)[0] in _KEY_TYPES:
        return "", line
    in_quote = False
    escaped = False
    for index, char in enumerate(line):
        if escaped:
            escaped = False
        elif char == "\\":
            escaped = True
        elif char == '"':
            in_quote = not in_quote
        elif char in " \t" and not in_quote:
            return line[:index], line[index:].lstrip(" \t")
    return None


def _blob_is_valid(algo: str, raw: bytes) -> bool:
    """Check the key body is the wire format of that key type, with nothing extra."""
    fields: list[bytes] = []
    offset = 0
    while offset < len(raw):
        if offset + 4 > len(raw):
            return False
        length = int.from_bytes(raw[offset : offset + 4], "big")
        offset += 4
        if offset + length > len(raw):
            return False
        fields.append(raw[offset : offset + length])
        offset += length

    names = _KEY_TYPES[algo]
    if len(fields) != len(names) + 1 or fields[0] != algo.encode():
        return False
    for name, value in zip(names, fields[1:], strict=True):
        if not value:
            return False
        if name == "key" and len(value) != 32:
            return False
        if name == "curve":
            curve = RE_CURVE.search(algo)
            if curve is None or value != curve[0].encode():
                return False
    return True


def parse_key(line: str, *, allow_options: bool = True) -> ParsedKey | None:
    """Take a public key line apart, or return None when it is not one.

    The line starts with its key type, or with an options field when
    allow_options is true. The first key after the options is the one the SSH
    server uses, and its body must be a complete key of the declared type.
    """
    text = line.strip(" \t\r")
    if not text or RE_LINE_BREAKS.search(text):
        return None
    split = _split_options(text)
    if split is None:
        return None
    options, rest = split
    if options and not allow_options:
        return None
    parts = rest.split(None, 2)
    if len(parts) < 2 or parts[0] not in _KEY_TYPES or not RE_BLOB.match(parts[1]):
        return None
    try:
        raw = base64.b64decode(parts[1] + "=" * (-len(parts[1]) % 4), validate=True)
    except binascii.Error, ValueError:
        return None
    if not _blob_is_valid(parts[0], raw):
        return None
    digest = base64.b64encode(hashlib.sha256(raw).digest()).decode().rstrip("=")
    return ParsedKey(
        algo=parts[0],
        fingerprint=FINGERPRINT_PREFIX + digest,
        comment=parts[2].strip() if len(parts) > 2 else "",
        options=options,
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


def _is_key_line(line: str) -> bool:
    """Return true for a line that is neither blank nor a comment."""
    stripped = line.strip(" \t")
    return bool(stripped) and not stripped.startswith("#")


class ContainerAuthorizedKeys:
    """The authorized keys of a container host, kept in one file.

    Writes go through a temporary file in the same folder and an atomic rename,
    so the SSH server never reads a half-written file. The folder is private
    to root (mode 700) and so is the file (mode 600), which is what the SSH
    server requires before it trusts the file. Lines that are not keys, such
    as comments, are kept when the file is rewritten. A lock serializes the
    read-modify-write steps, so two requests cannot undo each other.
    """

    def __init__(self, path: Path) -> None:
        """Initialize with the path of the authorized_keys file."""
        self._path = path
        self._lock = threading.Lock()

    @property
    def path(self) -> Path:
        """Return the path of the file."""
        return self._path

    def _read_lines(self) -> list[str]:
        """Return every line as the SSH server reads them: split on a line feed."""
        try:
            text = self._path.read_text(encoding="utf-8")
        except FileNotFoundError:
            return []
        lines = text.split("\n")
        if lines and lines[-1] == "":
            lines.pop()
        return [line.removesuffix("\r") for line in lines]

    def list(self) -> list[str]:
        """Return the key lines, without blank lines and comments."""
        with self._lock:
            return [
                line.strip(" \t") for line in self._read_lines() if _is_key_line(line)
            ]

    def add(self, key: str) -> bool:
        """Add a key. Return False when a key with that fingerprint is listed."""
        fingerprint = key_fingerprint(key)
        with self._lock:
            lines = self._read_lines()
            if fingerprint and any(
                key_fingerprint(line) == fingerprint
                for line in lines
                if _is_key_line(line)
            ):
                return False
            lines.append(key.strip())
            self._write(lines)
        return True

    def remove(self, fingerprint: str) -> bool:
        """Remove the key with that fingerprint. Return False when none matches."""
        with self._lock:
            lines = self._read_lines()
            remaining = [
                line
                for line in lines
                if not (_is_key_line(line) and key_fingerprint(line) == fingerprint)
            ]
            if len(remaining) == len(lines):
                return False
            self._write(remaining)
        return True

    def clear(self) -> None:
        """Remove every key, and keep the comments."""
        with self._lock:
            self._write([line for line in self._read_lines() if not _is_key_line(line)])

    def _write(self, lines: list[str]) -> None:
        folder = self._path.parent
        folder.mkdir(mode=0o700, parents=True, exist_ok=True)
        # A folder somebody else owns: the write below reports the real problem.
        with contextlib.suppress(OSError):
            folder.chmod(0o700)
        fd, name = tempfile.mkstemp(dir=folder, prefix=".authorized_keys.")
        temp = Path(name)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                handle.write("".join(line + "\n" for line in lines))
                handle.flush()
                os.fsync(handle.fileno())
            temp.chmod(0o600)
            temp.replace(self._path)
        except BaseException:
            with contextlib.suppress(OSError):
                temp.unlink()
            raise
