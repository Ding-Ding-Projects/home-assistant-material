"""The lock: key derivation, key wrapping and authenticated, part by part encryption.

Nothing here touches the network or the disk. Format version 1.

Keys
    A random 256-bit vault key encrypts everything. The vault key is wrapped by a key
    made from the owner's password with Argon2id and a random salt. The wrapped key and
    the cost settings form the public lock header. Changing the password wraps the same
    vault key again; stored content is never re-encrypted.

Objects
    Each stored object has its own random 256-bit key, kept inside a fixed-size sealed
    object header together with the real length and a small metadata record. Content is
    padded to a size bucket (Padme) and cut into parts of 1 MiB. Every part is sealed with
    AES-256-GCM. The part number and a last-part flag are bound into each part, so parts
    cannot be reordered, dropped, swapped between objects or cut short unnoticed, and any
    part can be opened on its own.
"""

import base64
from dataclasses import dataclass
import hmac
import json
import os
import struct
from typing import Any, Final

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.argon2 import Argon2id
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from .errors import LockError, Reason

FORMAT_VERSION: Final = 1
PART_SIZE: Final = 1024 * 1024
TAG_SIZE: Final = 16
NONCE_SIZE: Final = 12
KEY_SIZE: Final = 32
OBJECT_HEADER_SIZE: Final = 2048
MIN_PADDED_SIZE: Final = 4096
MAX_META_BYTES: Final = 1900

# Argon2id cost: 256 MiB, 8 passes, 4 lanes (about 0.6 s on a current desktop CPU).
KDF_MEMORY_KIB: Final = 262144
KDF_ITERATIONS: Final = 8
KDF_LANES: Final = 4

# What a header read from the registry must stay within (it is not trusted).
KDF_MIN_MEMORY_KIB: Final = 32768
KDF_MAX_MEMORY_KIB: Final = 524288
KDF_MIN_ITERATIONS: Final = 2
KDF_MAX_ITERATIONS: Final = 16
KDF_MAX_LANES: Final = 8

MIN_PASSWORD_LENGTH: Final = 14

_HEADER_AAD: Final = b"registry-storage/lock/v1"
_OBJECT_HEADER_AAD: Final = b"registry-storage/object-header/v1"
_PART_AAD: Final = b"registry-storage/part/v1"
_FIXED = struct.Struct(">16s32sQQIH")
_HEADER_PLAIN_SIZE = OBJECT_HEADER_SIZE - NONCE_SIZE - TAG_SIZE


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def _unb64(text: Any) -> bytes:
    if not isinstance(text, str):
        raise LockError(Reason.UNSUPPORTED_FORMAT)
    try:
        return base64.b64decode(text.encode("ascii"), validate=True)
    except ValueError, UnicodeEncodeError:
        raise LockError(Reason.UNSUPPORTED_FORMAT) from None


@dataclass(frozen=True, slots=True)
class KdfParams:
    """Argon2id cost settings."""

    memory_kib: int = KDF_MEMORY_KIB
    iterations: int = KDF_ITERATIONS
    lanes: int = KDF_LANES


@dataclass(frozen=True, slots=True)
class Subkeys:
    """Keys derived from the vault key for separate jobs."""

    header: bytes
    tag: bytes


def derive_password_key(password: str, salt: bytes, params: KdfParams) -> bytes:
    """Make the key-wrapping key from the password. Slow on purpose; run in an executor."""
    return Argon2id(
        salt=salt,
        length=KEY_SIZE,
        iterations=params.iterations,
        lanes=params.lanes,
        memory_cost=params.memory_kib,
    ).derive(password.encode("utf-8"))


def _check_params(params: KdfParams) -> None:
    if (
        not KDF_MIN_MEMORY_KIB <= params.memory_kib <= KDF_MAX_MEMORY_KIB
        or not KDF_MIN_ITERATIONS <= params.iterations <= KDF_MAX_ITERATIONS
        or not 1 <= params.lanes <= KDF_MAX_LANES
    ):
        raise LockError(Reason.UNSUPPORTED_FORMAT)


def new_vault_key() -> bytes:
    """Return a fresh random vault key."""
    return os.urandom(KEY_SIZE)


def wrap_vault_key(
    vault_key: bytes, password: str, params: KdfParams | None = None
) -> dict[str, Any]:
    """Return the public lock header that holds the vault key behind the password."""
    params = params or KdfParams(KDF_MEMORY_KIB, KDF_ITERATIONS, KDF_LANES)
    _check_params(params)
    salt = os.urandom(16)
    kek = derive_password_key(password, salt, params)
    nonce = os.urandom(NONCE_SIZE)
    wrapped = nonce + AESGCM(kek).encrypt(nonce, vault_key, _HEADER_AAD)
    return {
        "version": FORMAT_VERSION,
        "kdf": "argon2id",
        "salt": _b64(salt),
        "memory_kib": params.memory_kib,
        "iterations": params.iterations,
        "lanes": params.lanes,
        "wrapped_key": _b64(wrapped),
    }


def unwrap_vault_key(header: dict[str, Any], password: str) -> bytes:
    """Open a lock header with the password. The wrapped key's tag is the check value."""
    try:
        version = header["version"]
        kdf = header["kdf"]
        params = KdfParams(
            int(header["memory_kib"]), int(header["iterations"]), int(header["lanes"])
        )
    except KeyError, TypeError, ValueError:
        raise LockError(Reason.UNSUPPORTED_FORMAT) from None
    if version != FORMAT_VERSION or kdf != "argon2id":
        raise LockError(Reason.UNSUPPORTED_FORMAT)
    _check_params(params)
    salt = _unb64(header.get("salt"))
    wrapped = _unb64(header.get("wrapped_key"))
    if len(salt) != 16 or len(wrapped) != NONCE_SIZE + KEY_SIZE + TAG_SIZE:
        raise LockError(Reason.UNSUPPORTED_FORMAT)
    kek = derive_password_key(password, salt, params)
    try:
        return AESGCM(kek).decrypt(
            wrapped[:NONCE_SIZE], wrapped[NONCE_SIZE:], _HEADER_AAD
        )
    except InvalidTag:
        raise LockError(Reason.WRONG_PASSWORD) from None


def password_matches(header: dict[str, Any], password: str, vault_key: bytes) -> bool:
    """Return whether the password opens the header to exactly this vault key."""
    try:
        return hmac.compare_digest(unwrap_vault_key(header, password), vault_key)
    except LockError:
        return False


def derive_subkeys(vault_key: bytes) -> Subkeys:
    """Split the vault key into the key for object headers and the key for tag names."""

    def _derive(info: bytes) -> bytes:
        return HKDF(
            algorithm=hashes.SHA256(), length=KEY_SIZE, salt=None, info=info
        ).derive(vault_key)

    return Subkeys(
        header=_derive(b"registry-storage/header-key/v1"),
        tag=_derive(b"registry-storage/tag-key/v1"),
    )


def reserved_tag(vault_key: bytes, name: str) -> str:
    """Return a tag for a reserved place (index, self test) that looks like any other."""
    mac = hmac.new(derive_subkeys(vault_key).tag, name.encode(), "sha256")
    return mac.hexdigest()[:32]


def padded_length(length: int) -> int:
    """Return the size bucket for a length (Padme: at most 12 percent larger)."""
    length = max(length, MIN_PADDED_SIZE)
    exponent = length.bit_length() - 1
    last_bits = exponent.bit_length()
    mask = (1 << (exponent - last_bits)) - 1
    return (length + mask) & ~mask


def part_count(padded: int) -> int:
    """Return how many parts a padded length is cut into."""
    return -(-padded // PART_SIZE)


def sealed_part_size(index: int, padded: int) -> int:
    """Return the stored size of one part, tag included."""
    count = part_count(padded)
    plain = PART_SIZE if index < count - 1 else padded - PART_SIZE * (count - 1)
    return plain + TAG_SIZE


@dataclass(frozen=True, slots=True)
class ObjectHeader:
    """What the sealed object header carries."""

    object_id: bytes
    object_key: bytes
    plain_length: int
    padded_length: int
    meta: dict[str, Any]

    @property
    def parts(self) -> int:
        """Return the number of parts."""
        return part_count(self.padded_length)


def new_object_header(plain_length: int, meta: dict[str, Any]) -> ObjectHeader:
    """Return a header with a fresh object id and key."""
    return ObjectHeader(
        os.urandom(16),
        os.urandom(KEY_SIZE),
        plain_length,
        padded_length(plain_length),
        meta,
    )


def seal_object_header(vault_key: bytes, header: ObjectHeader) -> bytes:
    """Return the fixed-size sealed header (2048 bytes whatever the content)."""
    meta = json.dumps(header.meta, separators=(",", ":"), sort_keys=True).encode()
    if len(meta) > MAX_META_BYTES:
        raise LockError(Reason.INVALID_REQUEST)
    fixed = _FIXED.pack(
        header.object_id,
        header.object_key,
        header.plain_length,
        header.padded_length,
        PART_SIZE,
        len(meta),
    )
    plain = (fixed + meta).ljust(_HEADER_PLAIN_SIZE, b"\0")
    nonce = os.urandom(NONCE_SIZE)
    key = derive_subkeys(vault_key).header
    return nonce + AESGCM(key).encrypt(nonce, plain, _OBJECT_HEADER_AAD)


def open_object_header(vault_key: bytes, blob: bytes) -> ObjectHeader:
    """Open a sealed object header."""
    if len(blob) != OBJECT_HEADER_SIZE:
        raise LockError(Reason.TRUNCATED)
    key = derive_subkeys(vault_key).header
    try:
        plain = AESGCM(key).decrypt(
            blob[:NONCE_SIZE], blob[NONCE_SIZE:], _OBJECT_HEADER_AAD
        )
    except InvalidTag:
        raise LockError(Reason.TAMPERED) from None
    object_id, object_key, plain_len, padded_len, part_size, meta_len = (
        _FIXED.unpack_from(plain)
    )
    if (
        part_size != PART_SIZE
        or meta_len > MAX_META_BYTES
        or padded_len != padded_length(plain_len)
    ):
        raise LockError(Reason.UNSUPPORTED_FORMAT)
    raw = plain[_FIXED.size : _FIXED.size + meta_len]
    try:
        meta = json.loads(raw) if raw else {}
    except ValueError:
        raise LockError(Reason.TAMPERED) from None
    if not isinstance(meta, dict):
        raise LockError(Reason.TAMPERED)
    return ObjectHeader(object_id, object_key, plain_len, padded_len, meta)


def _part_nonce(index: int) -> bytes:
    return index.to_bytes(NONCE_SIZE, "big")


def _part_aad(header: ObjectHeader, index: int) -> bytes:
    last = index == header.parts - 1
    return (
        _PART_AAD
        + header.object_id
        + index.to_bytes(8, "big")
        + (b"\1" if last else b"\0")
    )


def seal_part(header: ObjectHeader, index: int, plain: bytes) -> bytes:
    """Seal one part. The plain part is PART_SIZE long, or the remainder for the last one."""
    if (
        not 0 <= index < header.parts
        or len(plain) != sealed_part_size(index, header.padded_length) - TAG_SIZE
    ):
        raise LockError(Reason.INVALID_REQUEST)
    return AESGCM(header.object_key).encrypt(
        _part_nonce(index), plain, _part_aad(header, index)
    )


def open_part(header: ObjectHeader, index: int, sealed: bytes) -> bytes:
    """Open one part on its own. Wrong place, wrong object, cut or altered fails."""
    if not 0 <= index < header.parts:
        raise LockError(Reason.INVALID_REQUEST)
    if len(sealed) != sealed_part_size(index, header.padded_length):
        raise LockError(Reason.TRUNCATED)
    try:
        return AESGCM(header.object_key).decrypt(
            _part_nonce(index), sealed, _part_aad(header, index)
        )
    except InvalidTag:
        raise LockError(Reason.TAMPERED) from None


def seal_bytes(
    vault_key: bytes, data: bytes, meta: dict[str, Any] | None = None
) -> tuple[bytes, list[bytes]]:
    """Seal a small value as a header and its parts (used for the encrypted index)."""
    header = new_object_header(len(data), meta or {})
    padded = data.ljust(header.padded_length, b"\0")
    parts = [
        seal_part(header, i, padded[i * PART_SIZE : (i + 1) * PART_SIZE])
        for i in range(header.parts)
    ]
    return seal_object_header(vault_key, header), parts


def open_bytes(vault_key: bytes, header_blob: bytes, parts: list[bytes]) -> bytes:
    """Open what seal_bytes made."""
    header = open_object_header(vault_key, header_blob)
    if len(parts) != header.parts:
        raise LockError(Reason.TRUNCATED)
    plain = b"".join(open_part(header, i, part) for i, part in enumerate(parts))
    return plain[: header.plain_length]
