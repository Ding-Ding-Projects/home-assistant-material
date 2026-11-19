"""Tests for the store: put, get, ranges, tampering, the index and changing the password."""

import asyncio
import json
import os
from pathlib import Path

from freezegun.api import FrozenDateTimeFactory
import pytest

from homeassistant.components.registry_storage.client import RegistryClient
from homeassistant.components.registry_storage.crypto import (
    PART_SIZE,
    padded_length,
    unwrap_vault_key,
)
from homeassistant.components.registry_storage.errors import (
    LockError,
    Reason,
    RegistryError,
    RegistryStorageError,
)
from homeassistant.components.registry_storage.store import (
    RegistryStore,
    StorageSettings,
    async_read_lock,
)
from homeassistant.core import HomeAssistant

from .common import BASE, TOKEN, USER, FakeRegistry, sha
from .conftest import PASSWORD, REPOSITORY

SECRET_NAME = "front-door-doorbell-2026-11-17-secret.mp4"


async def _put(store: RegistryStore, data: bytes, **kwargs):
    return await store.async_put_bytes(
        data,
        kind=kwargs.pop("kind", "recording"),
        name=kwargs.pop("name", SECRET_NAME),
        **kwargs,
    )


async def test_put_list_get_file(
    hass: HomeAssistant, store: RegistryStore, tmp_path: Path
) -> None:
    """A file goes up locked and comes back exactly, with progress."""
    data = os.urandom(2 * PART_SIZE + 4321)
    source = tmp_path / "clip.mp4"
    source.write_bytes(data)
    seen: list[tuple[int, int]] = []
    stored = await store.async_put_file(
        str(source),
        kind="recording",
        camera="camera.front_door",
        keep_days=7,
        progress=lambda done, total: seen.append((done, total)),
    )
    assert stored.name == "clip.mp4"
    assert stored.plain_size == len(data)
    assert stored.camera == "camera.front_door"
    assert seen[-1] == (len(data), len(data))
    assert source.read_bytes() == data

    listed = await store.async_list()
    assert [item.id for item in listed] == [stored.id]
    assert listed[0].keep_until is not None

    destination = tmp_path / "back.mp4"
    progress: list[int] = []
    size = await store.async_get_file(
        stored.id, str(destination), progress=lambda d, t: progress.append(d)
    )
    assert size == len(data)
    assert destination.read_bytes() == data
    assert progress[-1] == len(data)
    assert not (tmp_path / "back.mp4.part").exists()


async def test_empty_file(store: RegistryStore, tmp_path: Path) -> None:
    """An empty file round-trips."""
    stored = await _put(store, b"")
    destination = tmp_path / "empty"
    assert await store.async_get_file(stored.id, str(destination)) == 0
    assert destination.read_bytes() == b""


async def test_a_stranger_learns_little(
    registry: FakeRegistry, store: RegistryStore
) -> None:
    """Names, kinds and contents are absent from everything the registry holds."""
    plain = b"VERY-RECOGNISABLE-VIDEO-BYTES" * 1000
    await _put(store, plain, camera="camera.front_door", meta={"event": "person"})
    stored = registry.stored_bytes()
    for secret in (
        SECRET_NAME,
        "front-door",
        "camera.front_door",
        "recording",
        "person",
        "VERY-RECOGNISABLE",
    ):
        assert secret.encode() not in stored
    tags = set(registry.manifests[REPOSITORY]) - {
        k for k in registry.manifests[REPOSITORY] if k.startswith("sha256:")
    }
    assert len(tags) == 3
    assert "lock" in tags
    assert all(len(t) == 32 for t in tags - {"lock"})


async def test_sizes_fall_into_buckets(
    registry: FakeRegistry, store: RegistryStore
) -> None:
    """Two files of different length in the same bucket are stored at the same size."""
    first = await _put(store, os.urandom(1_000_001), name="a")
    second = await _put(store, os.urandom(1_000_900), name="b")
    assert padded_length(1_000_001) == padded_length(1_000_900)
    assert first.stored_size == second.stored_size
    assert first.plain_size != second.plain_size


async def test_range_across_parts(store: RegistryStore) -> None:
    """A range opens only the parts it needs and returns exactly those bytes."""
    data = os.urandom(3 * PART_SIZE + 100)
    stored = await _put(store, data)
    start, end = PART_SIZE - 50, 2 * PART_SIZE + 50
    assert await store.async_get_range(stored.id, start, end) == data[start:end]
    assert await store.async_get_range(stored.id, 5, 5) == b""
    assert (
        await store.async_get_range(stored.id, len(data) - 10, len(data) + 5000)
        == data[-10:]
    )
    with pytest.raises(RegistryStorageError) as err:
        await store.async_get_range(stored.id, 10, 5)
    assert err.value.reason is Reason.INVALID_REQUEST


async def test_range_fetches_only_needed_parts(
    registry: FakeRegistry, store: RegistryStore
) -> None:
    """Playing from the middle fetches part blobs from there, not the whole object."""
    stored = await _put(store, os.urandom(5 * PART_SIZE))
    before = len(
        [r for r in registry.requests if r[0] == "GET" and "/blobs/sha256" in r[1]]
    )
    await store.async_get_range(stored.id, 4 * PART_SIZE + 1, 4 * PART_SIZE + 100)
    after = len(
        [r for r in registry.requests if r[0] == "GET" and "/blobs/sha256" in r[1]]
    )
    assert after - before <= 2


async def test_stream_starts_before_everything_arrived(
    registry: FakeRegistry, store: RegistryStore
) -> None:
    """The first bytes are available after fetching a part or two, with one part read ahead."""
    data = os.urandom(6 * PART_SIZE)
    stored = await _put(store, data)
    before = len(
        [r for r in registry.requests if r[0] == "GET" and "/blobs/sha256" in r[1]]
    )
    stream = store.async_stream(stored.id)
    first = await anext(stream)
    after = len(
        [r for r in registry.requests if r[0] == "GET" and "/blobs/sha256" in r[1]]
    )
    assert first == data[:PART_SIZE]
    assert after - before <= 4
    await stream.aclose()


async def test_tampered_blob(
    registry: FakeRegistry, store: RegistryStore, tmp_path: Path
) -> None:
    """A part altered in the registry is detected and leaves no file behind."""
    stored = await _put(store, os.urandom(PART_SIZE + 100))
    manifest = json.loads(registry.manifests[REPOSITORY][stored.id])
    digest = manifest["layers"][1]["digest"]
    blobs = registry.blobs[REPOSITORY]
    damaged = bytearray(blobs[digest])
    damaged[10] ^= 1
    blobs[digest] = bytes(damaged)
    destination = tmp_path / "out"
    with pytest.raises(LockError) as err:
        await store.async_get_file(stored.id, str(destination))
    assert err.value.reason is Reason.TAMPERED
    assert not destination.exists()
    assert not (tmp_path / "out.part").exists()


async def test_swapped_layers(registry: FakeRegistry, make_store) -> None:
    """Two parts exchanged in the manifest do not open."""
    store = make_store()
    stored = await _put(store, os.urandom(2 * PART_SIZE + 10))
    manifest = json.loads(registry.manifests[REPOSITORY][stored.id])
    layers = manifest["layers"]
    layers[1], layers[2] = layers[2], layers[1]
    registry.manifests[REPOSITORY][stored.id] = json.dumps(manifest).encode()
    fresh = make_store()
    with pytest.raises(LockError):
        await fresh.async_get_range(stored.id, 0, 100)


async def test_dropped_layer(registry: FakeRegistry, make_store) -> None:
    """An object whose last part was dropped is reported as cut short."""
    store = make_store()
    stored = await _put(store, os.urandom(2 * PART_SIZE + 10))
    manifest = json.loads(registry.manifests[REPOSITORY][stored.id])
    manifest["layers"].pop()
    registry.manifests[REPOSITORY][stored.id] = json.dumps(manifest).encode()
    fresh = make_store()
    with pytest.raises(LockError) as err:
        await fresh.async_get_range(stored.id, 0, 10)
    assert err.value.reason is Reason.TRUNCATED


async def test_wrong_key_cannot_open(
    hass: HomeAssistant, registry: FakeRegistry, store: RegistryStore, sleeps
) -> None:
    """A store with another vault key sees no index and cannot open an object."""
    stored = await _put(store, b"secret bytes")
    other = RegistryStore(
        hass,
        RegistryClient(registry, BASE, USER, TOKEN, sleep=sleeps),  # type: ignore[arg-type]
        os.urandom(32),
        {},
        StorageSettings(REPOSITORY),
    )
    assert await other.async_list(refresh=True) == []
    with pytest.raises(LockError) as err:
        await other._open_object(REPOSITORY, stored.id)  # noqa: SLF001
    assert err.value.reason is Reason.TAMPERED


async def test_second_instance_with_same_password(
    hass: HomeAssistant, registry: FakeRegistry, store: RegistryStore, sleeps
) -> None:
    """Another instance opens the public lock with the password and reads everything."""
    stored = await _put(store, b"shared bytes", meta={"x": 1})
    client = RegistryClient(registry, BASE, USER, TOKEN, sleep=sleeps)  # type: ignore[arg-type]
    header = await async_read_lock(client, REPOSITORY)
    assert header is not None
    vault = unwrap_vault_key(header, PASSWORD)
    other = RegistryStore(hass, client, vault, header, StorageSettings(REPOSITORY))
    listed = await other.async_list()
    assert [item.id for item in listed] == [stored.id]
    assert await other.async_get_range(stored.id, 0, 12) == b"shared bytes"


async def test_missing_index_is_rebuilt_from_headers(
    hass: HomeAssistant, registry: FakeRegistry, store: RegistryStore, make_store
) -> None:
    """If the index is lost, what is stored is found again from the objects' own headers."""
    first = await _put(store, b"one", name="one.mp4", kind="recording")
    second = await _put(store, b"two", name="two.zip", kind="backup")
    index_tag = store._index_tag  # noqa: SLF001
    for key in [
        k
        for k, v in registry.manifests[REPOSITORY].items()
        if v == registry.manifests[REPOSITORY][index_tag]
    ]:
        del registry.manifests[REPOSITORY][key]
    fresh = make_store()
    listed = {item.id: item for item in await fresh.async_list(refresh=True)}
    assert set(listed) == {first.id, second.id}
    assert listed[second.id].name == "two.zip"
    assert listed[second.id].kind == "backup"


async def test_lost_update_is_repaired(store: RegistryStore, make_store) -> None:
    """An entry lost from the index by a racing writer is added back on refresh."""
    kept = await _put(store, b"kept", name="kept")
    lost = await _put(store, b"lost", name="lost")

    def _drop(data: dict) -> bool:
        data["entries"].pop(lost.id)
        return True

    await store._update_index(REPOSITORY, _drop)  # noqa: SLF001
    fresh = make_store()
    names = {item.name for item in await fresh.async_list(refresh=True)}
    assert names == {"kept", "lost"}
    assert kept.id != lost.id


async def test_concurrent_writers_lose_nothing(make_store) -> None:
    """Two stores writing at the same time both end up in the list."""
    a, b = make_store(), make_store()
    await asyncio.gather(
        *(_put(a, os.urandom(100), name=f"a{i}") for i in range(3)),
        *(_put(b, os.urandom(100), name=f"b{i}") for i in range(3)),
    )
    names = {item.name for item in await make_store().async_list(refresh=True)}
    assert names == {f"a{i}" for i in range(3)} | {f"b{i}" for i in range(3)}


async def test_delete(registry: FakeRegistry, store: RegistryStore) -> None:
    """A deleted object leaves the list; the registry may or may not agree to remove it."""
    stored = await _put(store, b"bye")
    result = await store.async_delete(stored.id)
    assert result.removed_from_index is True
    assert result.removed_from_registry is False
    assert await store.async_list(refresh=True) == []
    again = await store.async_list(refresh=True)
    assert again == []

    registry.allow_delete = True
    other = await _put(store, b"bye again")
    result = await store.async_delete(other.id)
    assert result.removed_from_registry is True
    with pytest.raises(RegistryError) as err:
        await store.async_get_object(other.id)
    assert err.value.reason is Reason.OBJECT_NOT_FOUND


async def test_keep_days_and_purge(
    store: RegistryStore, freezer: FrozenDateTimeFactory
) -> None:
    """An object kept for N days is purged after that, and keep time can be changed."""
    short = await _put(store, b"short", name="short", keep_days=2)
    forever = await _put(store, b"forever", name="forever")
    longer = await _put(store, b"longer", name="longer", keep_days=2)
    await store.async_set_keep_days(longer.id, 10)
    freezer.tick(3 * 86400)
    assert await store.async_purge_expired() == [short.id]
    assert {item.id for item in await store.async_list()} == {forever.id, longer.id}
    cleared = await store.async_set_keep_days(longer.id, None)
    assert cleared.keep_until is None


async def test_used_size_and_kinds(store: RegistryStore) -> None:
    """The used size adds up what is stored and the list can be filtered."""
    one = await _put(store, os.urandom(10_000), kind="recording")
    two = await _put(store, os.urandom(PART_SIZE), kind="backup")
    assert await store.async_used_size() == one.stored_size + two.stored_size
    assert [item.id for item in await store.async_list(kind="backup")] == [two.id]


async def test_self_test(store: RegistryStore, registry: FakeRegistry) -> None:
    """The self test uploads a small object, opens it again and leaves nothing in the list."""
    result = await store.async_self_test()
    assert result.ok is True
    assert result.reason is None
    assert await store.async_list(refresh=True) == []
    again = await store.async_self_test()
    assert again.ok is True


async def test_self_test_reports_a_denied_upload(
    registry: FakeRegistry, store: RegistryStore
) -> None:
    """A registry that refuses writes makes the self test fail with the reason."""
    await store.async_ensure_lock(REPOSITORY)
    registry.can_push = False
    store.client._tokens.clear()  # noqa: SLF001
    result = await store.async_self_test()
    assert result.ok is False
    assert result.reason is Reason.AUTH_FAILED


async def test_verify_object(store: RegistryStore) -> None:
    """A full check opens every part."""
    stored = await _put(store, os.urandom(2 * PART_SIZE))
    assert await store.async_verify(stored.id) is True


async def test_repository_lookup(make_store) -> None:
    """A camera's own repository wins, backups have theirs, everything else uses the default."""
    store = make_store(
        StorageSettings(
            REPOSITORY,
            {"camera.front_door": "tester/front-door"},
            "tester/backups",
        )
    )
    assert store.repository_for(camera="camera.front_door") == "tester/front-door"
    assert store.repository_for(camera="camera.driveway") == REPOSITORY
    assert store.repository_for(kind="backup") == "tester/backups"
    assert (
        store.repository_for(camera="camera.front_door", kind="backup")
        == "tester/front-door"
    )
    assert store.repository_for() == REPOSITORY
    assert store.settings.repositories() == [
        REPOSITORY,
        "tester/front-door",
        "tester/backups",
    ]


async def test_per_camera_repository_is_used(
    registry: FakeRegistry, make_store
) -> None:
    """An object for a camera with its own repository lands there, with its own lock."""
    store = make_store(
        StorageSettings(REPOSITORY, {"camera.front_door": "tester/front-door"})
    )
    stored = await _put(store, b"door", camera="camera.front_door")
    assert stored.repository == "tester/front-door"
    assert "lock" in registry.manifests["tester/front-door"]
    assert stored.id not in registry.manifests.get(REPOSITORY, {})
    other = await _put(store, b"drive", camera="camera.driveway")
    assert other.repository == REPOSITORY
    assert {item.id for item in await store.async_list()} == {stored.id, other.id}


async def test_invalid_repository(store: RegistryStore) -> None:
    """A malformed repository name is refused before anything is sent."""
    with pytest.raises(RegistryError) as err:
        await _put(store, b"x", repository="Not Valid")
    assert err.value.reason is Reason.INVALID_REPOSITORY


async def test_file_that_shrinks_is_refused(
    store: RegistryStore, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A file shorter than when it was measured is an error, not a silently padded upload."""
    source = tmp_path / "grows.bin"
    source.write_bytes(os.urandom(5000))
    monkeypatch.setattr("os.path.getsize", lambda _path: 9000)
    with pytest.raises(RegistryStorageError) as err:
        await store.async_put_file(str(source), kind="recording")
    assert err.value.reason is Reason.INVALID_REQUEST


async def test_change_password(
    registry: FakeRegistry,
    store: RegistryStore,
    make_store,
    sleeps,
    hass: HomeAssistant,
) -> None:
    """A new password wraps the same key everywhere, without sending the content again."""
    stored = await _put(store, os.urandom(PART_SIZE + 5), name="keep-me")
    blobs_before = dict(registry.blobs[REPOSITORY])
    old_header = await async_read_lock(store.client, REPOSITORY)
    new_password = "another long password 98"
    await store.async_change_password(PASSWORD, new_password, new_password)
    new_header = await async_read_lock(store.client, REPOSITORY)
    assert new_header != old_header
    assert new_header is not None
    assert unwrap_vault_key(new_header, new_password) == store._vault_key  # noqa: SLF001
    with pytest.raises(LockError):
        unwrap_vault_key(new_header, PASSWORD)
    lock_blob_digests = {sha(b"{}")}
    new_blobs = set(registry.blobs[REPOSITORY]) - set(blobs_before)
    assert len(new_blobs - lock_blob_digests) <= 1
    assert await store.async_get_range(stored.id, 0, 10) is not None


@pytest.mark.parametrize(
    ("old", "new", "confirm", "reason"),
    [
        (
            "not the password",
            "another long password 98",
            "another long password 98",
            Reason.WRONG_PASSWORD,
        ),
        (PASSWORD, "another long password 98", "different", Reason.PASSWORD_MISMATCH),
        (PASSWORD, "short", "short", Reason.PASSWORD_TOO_WEAK),
    ],
)
async def test_change_password_refused(
    store: RegistryStore, old: str, new: str, confirm: str, reason: Reason
) -> None:
    """Wrong old password, mismatch and weak new password are refused with a reason code."""
    with pytest.raises(LockError) as err:
        await store.async_change_password(old, new, confirm)
    assert err.value.reason is reason
