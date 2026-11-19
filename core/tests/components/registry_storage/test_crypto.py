"""Tests for the lock: keys, wrapping, parts, tampering and what is left readable."""

import json
import os

import pytest

from homeassistant.components.registry_storage import crypto
from homeassistant.components.registry_storage.crypto import (
    OBJECT_HEADER_SIZE,
    PART_SIZE,
    TAG_SIZE,
    KdfParams,
    derive_subkeys,
    new_object_header,
    new_vault_key,
    open_bytes,
    open_object_header,
    open_part,
    padded_length,
    part_count,
    password_matches,
    reserved_tag,
    seal_bytes,
    seal_object_header,
    seal_part,
    sealed_part_size,
    unwrap_vault_key,
    wrap_vault_key,
)
from homeassistant.components.registry_storage.errors import LockError, Reason

FAST = KdfParams(memory_kib=32768, iterations=2, lanes=1)
PASSWORD = "a few unrelated words 42"


def _seal(vault: bytes, data: bytes) -> tuple[bytes, list[bytes]]:
    return seal_bytes(vault, data)


@pytest.mark.parametrize(
    "length",
    [
        0,
        1,
        4095,
        4096,
        4097,
        PART_SIZE - 1,
        PART_SIZE,
        PART_SIZE + 1,
        2 * PART_SIZE + 17,
    ],
)
def test_round_trip(length: int) -> None:
    """Content of any size comes back exactly, whatever the padding."""
    vault = new_vault_key()
    data = os.urandom(length)
    header_blob, parts = _seal(vault, data)
    assert open_bytes(vault, header_blob, parts) == data
    assert len(header_blob) == OBJECT_HEADER_SIZE


@pytest.mark.parametrize("length", [1, 5000, 123456, 10_000_000, 987_654_321])
def test_padding_bucket(length: int) -> None:
    """Padding never shrinks and costs at most 12.5 percent beyond the minimum bucket."""
    padded = padded_length(length)
    assert padded >= max(length, 4096)
    assert padded <= max(length, 4096) * 1.125 + 1
    assert padded_length(padded) == padded


def test_padding_hides_exact_size() -> None:
    """Neighbouring lengths share one stored size."""
    sizes = {padded_length(n) for n in range(10_000_000, 10_000_000 + 50_000, 997)}
    assert len(sizes) <= 2


def test_header_is_fixed_size_whatever_the_metadata() -> None:
    """A short and a long name cannot be told apart by the sealed header's size."""
    vault = new_vault_key()
    short = seal_object_header(vault, new_object_header(10, {"n": "a"}))
    long = seal_object_header(vault, new_object_header(10, {"n": "b" * 1000}))
    assert len(short) == len(long) == OBJECT_HEADER_SIZE


def test_header_metadata_too_large() -> None:
    """Metadata beyond the fixed record is refused."""
    with pytest.raises(LockError) as err:
        seal_object_header(new_vault_key(), new_object_header(1, {"n": "x" * 2000}))
    assert err.value.reason is Reason.INVALID_REQUEST


def test_header_round_trip_and_wrong_key() -> None:
    """The header opens with its key only."""
    vault = new_vault_key()
    header = new_object_header(42, {"n": "front door", "k": "recording"})
    opened = open_object_header(vault, seal_object_header(vault, header))
    assert opened.plain_length == 42
    assert opened.meta == {"n": "front door", "k": "recording"}
    assert opened.object_key == header.object_key
    with pytest.raises(LockError) as err:
        open_object_header(new_vault_key(), seal_object_header(vault, header))
    assert err.value.reason is Reason.TAMPERED


def test_header_cut_short() -> None:
    """A header that lost bytes is reported as cut short."""
    vault = new_vault_key()
    blob = seal_object_header(vault, new_object_header(1, {}))
    with pytest.raises(LockError) as err:
        open_object_header(vault, blob[:-1])
    assert err.value.reason is Reason.TRUNCATED


def test_wrong_vault_key() -> None:
    """Content does not open with another key."""
    vault = new_vault_key()
    header_blob, parts = _seal(vault, b"hello")
    with pytest.raises(LockError):
        open_bytes(new_vault_key(), header_blob, parts)


def test_tampered_part() -> None:
    """One flipped bit in a part is caught."""
    vault = new_vault_key()
    header_blob, parts = _seal(vault, os.urandom(PART_SIZE + 10))
    damaged = bytearray(parts[1])
    damaged[3] ^= 1
    with pytest.raises(LockError) as err:
        open_bytes(vault, header_blob, [parts[0], bytes(damaged)])
    assert err.value.reason is Reason.TAMPERED


def test_swapped_parts() -> None:
    """Parts in a different order do not open."""
    vault = new_vault_key()
    header_blob, parts = _seal(vault, os.urandom(2 * PART_SIZE + 5))
    assert len(parts) == 3
    with pytest.raises(LockError) as err:
        open_bytes(vault, header_blob, [parts[1], parts[0], parts[2]])
    assert err.value.reason is Reason.TAMPERED


def test_parts_from_another_object() -> None:
    """A part cannot be moved into a different object, even one with the same key."""
    vault = new_vault_key()
    data = os.urandom(PART_SIZE + 5)
    header_a, parts_a = _seal(vault, data)
    _, parts_b = _seal(vault, data)
    with pytest.raises(LockError) as err:
        open_bytes(vault, header_a, [parts_a[0], parts_b[1]])
    assert err.value.reason is Reason.TAMPERED


def test_dropped_part() -> None:
    """An object with a part missing is reported as cut short."""
    vault = new_vault_key()
    header_blob, parts = _seal(vault, os.urandom(2 * PART_SIZE + 5))
    with pytest.raises(LockError) as err:
        open_bytes(vault, header_blob, parts[:-1])
    assert err.value.reason is Reason.TRUNCATED


def test_last_part_flag_is_bound_in() -> None:
    """The genuine last part does not open in a position that is not last."""
    header = new_object_header(2 * PART_SIZE + 100, {})
    padded = os.urandom(header.padded_length)
    sealed = [
        seal_part(header, i, padded[i * PART_SIZE : (i + 1) * PART_SIZE])
        for i in range(header.parts)
    ]
    assert header.parts == 3
    fewer = type(header)(
        header.object_id,
        header.object_key,
        header.plain_length,
        padded_length(header.plain_length) - PART_SIZE,
        {},
    )
    assert fewer.parts == 2
    with pytest.raises(LockError):
        open_part(fewer, 1, sealed[1])


def test_truncated_inside_a_part() -> None:
    """A part cut short is reported as cut short."""
    vault = new_vault_key()
    header_blob, parts = _seal(vault, os.urandom(1000))
    with pytest.raises(LockError) as err:
        open_bytes(vault, header_blob, [parts[0][:-1]])
    assert err.value.reason is Reason.TRUNCATED


def test_part_opens_on_its_own() -> None:
    """Any part can be fetched and opened alone, which makes playing from the middle possible."""
    vault = new_vault_key()
    data = os.urandom(3 * PART_SIZE + 7)
    header_blob, parts = _seal(vault, data)
    header = open_object_header(vault, header_blob)
    assert open_part(header, 2, parts[2]) == data[2 * PART_SIZE : 3 * PART_SIZE]
    assert len(parts[0]) == sealed_part_size(0, header.padded_length)
    assert len(parts[-1]) == sealed_part_size(header.parts - 1, header.padded_length)
    assert part_count(header.padded_length) == header.parts


def test_each_object_has_its_own_key() -> None:
    """Two objects never share a key or an id."""
    a = new_object_header(1, {})
    b = new_object_header(1, {})
    assert a.object_key != b.object_key
    assert a.object_id != b.object_id


def test_stored_bytes_hold_no_plaintext() -> None:
    """Names and contents are not visible in anything that gets stored."""
    vault = new_vault_key()
    index = json.dumps(
        {"entries": {"x": {"name": "front-door-2026-11-17.mp4"}}}
    ).encode()
    header_blob, parts = seal_bytes(vault, index, {"n": "front-door-2026-11-17.mp4"})
    stored = header_blob + b"".join(parts)
    assert b"front-door" not in stored
    assert b"entries" not in stored


def test_lock_header_round_trip() -> None:
    """The password opens the header to the vault key, and the header shows no secrets."""
    vault = new_vault_key()
    header = wrap_vault_key(vault, PASSWORD, FAST)
    assert unwrap_vault_key(header, PASSWORD) == vault
    text = json.dumps(header)
    assert PASSWORD not in text
    assert vault.hex() not in text
    assert password_matches(header, PASSWORD, vault)
    assert not password_matches(header, PASSWORD + "x", vault)


def test_wrong_password() -> None:
    """A wrong password is reported as such."""
    header = wrap_vault_key(new_vault_key(), PASSWORD, FAST)
    with pytest.raises(LockError) as err:
        unwrap_vault_key(header, "another password entirely")
    assert err.value.reason is Reason.WRONG_PASSWORD


def test_change_password_wraps_the_same_key() -> None:
    """A new password wraps the same vault key, so stored content stays valid."""
    vault = new_vault_key()
    old = wrap_vault_key(vault, PASSWORD, FAST)
    new = wrap_vault_key(vault, "a different long password 77", FAST)
    assert old["salt"] != new["salt"]
    assert unwrap_vault_key(new, "a different long password 77") == vault
    with pytest.raises(LockError):
        unwrap_vault_key(new, PASSWORD)
    header_blob, parts = _seal(vault, b"still here")
    assert (
        open_bytes(
            unwrap_vault_key(new, "a different long password 77"), header_blob, parts
        )
        == b"still here"
    )


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("memory_kib", 8),
        ("memory_kib", 10_000_000),
        ("iterations", 1),
        ("iterations", 500),
        ("lanes", 0),
        ("lanes", 64),
        ("version", 2),
        ("kdf", "scrypt"),
        ("salt", "not base64!"),
        ("wrapped_key", "AAAA"),
    ],
)
def test_untrusted_header_is_bounded(field: str, value: object) -> None:
    """A header read from the registry cannot set a cost outside the accepted range."""
    header = wrap_vault_key(new_vault_key(), PASSWORD, FAST)
    header[field] = value
    with pytest.raises(LockError) as err:
        unwrap_vault_key(header, PASSWORD)
    assert err.value.reason is Reason.UNSUPPORTED_FORMAT


def test_header_missing_fields() -> None:
    """A header with a field missing is not accepted."""
    with pytest.raises(LockError):
        unwrap_vault_key({"version": 1}, PASSWORD)


def test_default_cost_settings() -> None:
    """The default header carries the documented cost settings."""
    defaults = KdfParams()
    assert (defaults.memory_kib, defaults.iterations, defaults.lanes) == (262144, 8, 4)
    header = wrap_vault_key(new_vault_key(), PASSWORD, defaults)
    assert header["kdf"] == "argon2id"
    assert (header["memory_kib"], header["iterations"], header["lanes"]) == (
        262144,
        8,
        4,
    )
    assert crypto.PART_SIZE == 1024 * 1024
    assert TAG_SIZE == 16


def test_reserved_tags_look_like_any_other_and_differ() -> None:
    """Index and self-test tags are random-looking, stable and different from each other."""
    vault = new_vault_key()
    index = reserved_tag(vault, "index")
    assert index == reserved_tag(vault, "index")
    assert index != reserved_tag(vault, "selftest")
    assert index != reserved_tag(new_vault_key(), "index")
    assert len(index) == 32
    assert derive_subkeys(vault).header != derive_subkeys(vault).tag
