"""Store and fetch locked objects in container registry repositories.

One object is one standard image manifest. Layer 0 is the sealed object header (fixed
size), the layers after it are the sealed parts. Tags are random, so nothing readable
is in the repository except the public lock header.

The list of what is stored lives in an encrypted index, one per repository. Every
object's own sealed header also carries its name, kind and date, so an index that lost
an update (two writers at the same moment) is repaired from the tag list.
"""

import asyncio
from collections import OrderedDict
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass, field
import json
import logging
import os
from typing import Any, BinaryIO, Final, Protocol

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .client import (
    OCI_CONFIG,
    OCI_LAYER,
    OCI_MANIFEST,
    RegistryClient,
    digest_of,
    valid_repository,
)
from .const import LOCK_TAG, STORAGE_KEY_PREFIX, STORAGE_VERSION
from .crypto import (
    OBJECT_HEADER_SIZE,
    PART_SIZE,
    TAG_SIZE,
    ObjectHeader,
    new_object_header,
    open_bytes,
    open_object_header,
    open_part,
    password_matches,
    reserved_tag,
    seal_bytes,
    seal_object_header,
    seal_part,
    sealed_part_size,
    wrap_vault_key,
)
from .errors import LockError, Reason, RegistryError, RegistryStorageError
from .passwords import require_password

_LOGGER = logging.getLogger(__name__)

ANNOTATION_VERSION: Final = "io.homeassistant.registry-storage.version"
ANNOTATION_LOCK: Final = "io.homeassistant.registry-storage.lock"
UPLOAD_CONCURRENCY: Final = 3
_INDEX_TRIES: Final = 5
_RECONCILE_SECONDS: Final = 60.0
_OPEN_CACHE: Final = 8
_EMPTY_LAYER: Final = b"{}"
_OBJECT_TAG_LENGTH: Final = 32

ProgressCallback = Callable[[int, int], None]


@dataclass(frozen=True, slots=True)
class StoredObject:
    """One stored recording bundle, backup or other file."""

    id: str
    repository: str
    name: str
    kind: str
    camera: str | None
    created: float
    keep_until: float | None
    plain_size: int
    stored_size: int
    digest: str
    meta: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_entry(
        cls, object_id: str, repository: str, entry: dict[str, Any]
    ) -> StoredObject:
        """Build from an index entry."""
        return cls(
            id=object_id,
            repository=repository,
            name=entry["name"],
            kind=entry["kind"],
            camera=entry.get("camera"),
            created=entry["created"],
            keep_until=entry.get("keep_until"),
            plain_size=entry["plain_size"],
            stored_size=entry["stored_size"],
            digest=entry["digest"],
            meta=entry.get("meta") or {},
        )


@dataclass(frozen=True, slots=True)
class DeleteResult:
    """What a delete did."""

    removed_from_index: bool
    removed_from_registry: bool


@dataclass(frozen=True, slots=True)
class SelfTestResult:
    """Whether a small object went up, came back and matched."""

    ok: bool
    reason: Reason | None
    seconds: float


@dataclass(frozen=True, slots=True)
class StorageSettings:
    """Which repository holds what."""

    default_repository: str
    camera_repositories: dict[str, str] = field(default_factory=dict)
    backups_repository: str | None = None

    def repositories(self) -> list[str]:
        """Return every repository in use, the default first."""
        found = [self.default_repository]
        for repository in (*self.camera_repositories.values(), self.backups_repository):
            if repository and repository not in found:
                found.append(repository)
        return found


class KeyStore:
    """The vault key and the lock header for one entry, kept in .storage."""

    def __init__(self, hass: HomeAssistant, key_ref: str) -> None:
        """Set up the storage file for a key reference."""
        self._store: Store[dict[str, Any]] = Store(
            hass, STORAGE_VERSION, f"{STORAGE_KEY_PREFIX}.{key_ref}", private=True
        )

    async def async_load(self) -> tuple[bytes, dict[str, Any]] | None:
        """Return the vault key and header, or None when nothing is saved."""
        data = await self._store.async_load()
        if not data:
            return None
        try:
            return bytes.fromhex(data["vault_key"]), data["header"]
        except KeyError, ValueError, TypeError:
            return None

    async def async_save(self, vault_key: bytes, header: dict[str, Any]) -> None:
        """Save the vault key and header."""
        await self._store.async_save({"vault_key": vault_key.hex(), "header": header})

    async def async_remove(self) -> None:
        """Delete the saved key."""
        await self._store.async_remove()


def _lock_manifest(header: dict[str, Any]) -> tuple[bytes, bytes, bytes]:
    """Return the manifest, config and empty layer of a lock tag."""
    layer_digest = digest_of(_EMPTY_LAYER)
    config = json.dumps(
        {
            "architecture": "amd64",
            "os": "linux",
            "config": {},
            "rootfs": {"type": "layers", "diff_ids": [layer_digest]},
        },
        separators=(",", ":"),
    ).encode()
    manifest = json.dumps(
        {
            "schemaVersion": 2,
            "mediaType": OCI_MANIFEST,
            "config": {
                "mediaType": OCI_CONFIG,
                "digest": digest_of(config),
                "size": len(config),
            },
            "layers": [
                {
                    "mediaType": OCI_LAYER,
                    "digest": layer_digest,
                    "size": len(_EMPTY_LAYER),
                }
            ],
            "annotations": {
                ANNOTATION_VERSION: "1",
                ANNOTATION_LOCK: json.dumps(
                    header, separators=(",", ":"), sort_keys=True
                ),
            },
        },
        separators=(",", ":"),
        sort_keys=True,
    ).encode()
    return manifest, config, _EMPTY_LAYER


async def async_publish_lock(
    client: RegistryClient, repository: str, header: dict[str, Any]
) -> None:
    """Write the public lock header into a repository (this also creates it)."""
    manifest, config, layer = _lock_manifest(header)
    await client.async_upload_blob(repository, layer)
    await client.async_upload_blob(repository, config)
    await client.async_put_manifest(repository, LOCK_TAG, manifest)


async def async_read_lock(
    client: RegistryClient, repository: str
) -> dict[str, Any] | None:
    """Return the public lock header of a repository, or None when it has none."""
    found = await client.async_get_manifest(repository, LOCK_TAG)
    if found is None:
        return None
    annotations = found[0].get("annotations")
    if not isinstance(annotations, dict) or ANNOTATION_LOCK not in annotations:
        raise LockError(Reason.NOT_LOCKED)
    try:
        header = json.loads(annotations[ANNOTATION_LOCK])
    except ValueError, TypeError:
        raise LockError(Reason.UNSUPPORTED_FORMAT) from None
    if not isinstance(header, dict):
        raise LockError(Reason.UNSUPPORTED_FORMAT)
    return header


def _object_manifest(layers: list[tuple[str, int]]) -> tuple[bytes, bytes]:
    config = json.dumps(
        {
            "architecture": "amd64",
            "os": "linux",
            "config": {},
            "rootfs": {"type": "layers", "diff_ids": [d for d, _ in layers]},
        },
        separators=(",", ":"),
    ).encode()
    manifest = json.dumps(
        {
            "schemaVersion": 2,
            "mediaType": OCI_MANIFEST,
            "config": {
                "mediaType": OCI_CONFIG,
                "digest": digest_of(config),
                "size": len(config),
            },
            "layers": [
                {"mediaType": OCI_LAYER, "digest": d, "size": s} for d, s in layers
            ],
            "annotations": {ANNOTATION_VERSION: "1"},
        },
        separators=(",", ":"),
        sort_keys=True,
    ).encode()
    return manifest, config


class _Source(Protocol):
    async def read(self, size: int) -> bytes: ...
    async def close(self) -> None: ...


class _FileSource:
    def __init__(self, hass: HomeAssistant, handle: BinaryIO) -> None:
        self._hass = hass
        self._handle = handle

    async def read(self, size: int) -> bytes:
        return await self._hass.async_add_executor_job(self._handle.read, size)

    async def close(self) -> None:
        await self._hass.async_add_executor_job(self._handle.close)


class _BytesSource:
    def __init__(self, data: bytes) -> None:
        self._data = data
        self._offset = 0

    async def read(self, size: int) -> bytes:
        chunk = self._data[self._offset : self._offset + size]
        self._offset += len(chunk)
        return chunk

    async def close(self) -> None:
        return None


class _StreamSource:
    def __init__(self, stream: AsyncIterator[bytes]) -> None:
        self._stream = stream
        self._buffer = bytearray()
        self._done = False

    async def read(self, size: int) -> bytes:
        while len(self._buffer) < size and not self._done:
            try:
                self._buffer += await anext(self._stream)
            except StopAsyncIteration:
                self._done = True
        chunk = bytes(self._buffer[:size])
        del self._buffer[:size]
        return chunk

    async def close(self) -> None:
        if (aclose := getattr(self._stream, "aclose", None)) is not None:
            await aclose()


class RegistryStore:
    """Put, get, list and delete locked objects across the configured repositories."""

    def __init__(
        self,
        hass: HomeAssistant,
        client: RegistryClient,
        vault_key: bytes,
        header: dict[str, Any],
        settings: StorageSettings,
        key_store: KeyStore | None = None,
    ) -> None:
        """Set up the store. Nothing is sent to the registry yet."""
        self._hass = hass
        self.client = client
        self._vault_key = vault_key
        self._header = header
        self.settings = settings
        self._key_store = key_store
        self._locks: dict[str, asyncio.Lock] = {}
        self._indexes: dict[str, tuple[str | None, dict[str, Any]]] = {}
        self._locked: set[str] = set()
        self._foreign: dict[str, set[str]] = {}
        self._reconciled: dict[str, float] = {}
        self._rev_seen: dict[str, int] = {}
        self._open: OrderedDict[
            tuple[str, str], tuple[dict[str, Any], ObjectHeader, str]
        ] = OrderedDict()

    def repository_for(
        self, *, camera: str | None = None, kind: str | None = None
    ) -> str:
        """Return where something goes: the camera's own repository, the backups one, else the default."""
        if camera and (repository := self.settings.camera_repositories.get(camera)):
            return repository
        if kind == "backup" and self.settings.backups_repository:
            return self.settings.backups_repository
        return self.settings.default_repository

    @property
    def _index_tag(self) -> str:
        return reserved_tag(self._vault_key, "index")

    @property
    def _selftest_tag(self) -> str:
        return reserved_tag(self._vault_key, "selftest")

    def _reserved(self) -> set[str]:
        return {LOCK_TAG, self._index_tag, self._selftest_tag}

    async def async_ensure_lock(self, repository: str) -> None:
        """Make sure the repository carries the public lock header."""
        if repository in self._locked:
            return
        if not valid_repository(repository):
            raise RegistryError(Reason.INVALID_REPOSITORY)
        existing = await async_read_lock(self.client, repository)
        if existing is None:
            await async_publish_lock(self.client, repository, self._header)
        self._locked.add(repository)

    async def _fetch_layers(
        self, repository: str, manifest: dict[str, Any]
    ) -> list[dict[str, Any]]:
        layers = manifest.get("layers")
        if not isinstance(layers, list) or not layers:
            raise LockError(Reason.UNSUPPORTED_FORMAT)
        return layers

    async def _open_object(
        self, repository: str, tag: str, *, cache: bool = True
    ) -> tuple[dict[str, Any], ObjectHeader, str]:
        key = (repository, tag)
        if cache and key in self._open:
            self._open.move_to_end(key)
            return self._open[key]
        found = await self.client.async_get_manifest(repository, tag)
        if found is None:
            raise RegistryError(Reason.OBJECT_NOT_FOUND)
        manifest, digest = found
        layers = await self._fetch_layers(repository, manifest)
        header = open_object_header(
            self._vault_key,
            await self._get_layer(repository, layers[0], OBJECT_HEADER_SIZE),
        )
        if len(layers) != 1 + header.parts:
            raise LockError(Reason.TRUNCATED)
        if cache:
            self._open[key] = (manifest, header, digest)
            while len(self._open) > _OPEN_CACHE:
                self._open.popitem(last=False)
        return manifest, header, digest

    async def _get_layer(
        self, repository: str, layer: dict[str, Any], size: int | None = None
    ) -> bytes:
        digest = layer.get("digest")
        if not isinstance(digest, str):
            raise LockError(Reason.UNSUPPORTED_FORMAT)
        data = await self.client.async_get_blob(repository, digest)
        if digest_of(data) != digest or (size is not None and len(data) != size):
            raise LockError(Reason.TAMPERED)
        return data

    async def _load_index(self, repository: str, *, fresh: bool) -> dict[str, Any]:
        """Return the decrypted index, reading it again when the registry has a newer one."""
        tag = self._index_tag
        digest = await self.client.async_head_manifest(repository, tag)
        cached = self._indexes.get(repository)
        if cached is not None and cached[0] == digest and not fresh:
            return cached[1]
        if digest is None:
            data: dict[str, Any] = {"rev": 0, "entries": {}, "deleted": {}}
            self._indexes[repository] = (None, data)
            return data
        found = await self.client.async_get_manifest(repository, tag)
        if found is None:
            return await self._load_index(repository, fresh=fresh)
        manifest, digest = found
        layers = await self._fetch_layers(repository, manifest)
        header_blob = await self._get_layer(repository, layers[0], OBJECT_HEADER_SIZE)
        parts = [await self._get_layer(repository, layer) for layer in layers[1:]]
        plain = await self._hass.async_add_executor_job(
            open_bytes, self._vault_key, header_blob, parts
        )
        try:
            data = json.loads(plain)
            data["entries"], data["deleted"], data["rev"]
        except ValueError, KeyError, TypeError:
            raise LockError(Reason.TAMPERED) from None
        if not isinstance(data["rev"], int) or data["rev"] < self._rev_seen.get(
            repository, 0
        ):
            raise LockError(Reason.TAMPERED)
        self._rev_seen[repository] = data["rev"]
        self._indexes[repository] = (digest, data)
        return data

    async def _upload_sealed(
        self, repository: str, header_blob: bytes, parts: list[bytes], tag: str
    ) -> str:
        layers = [
            (
                await self.client.async_upload_blob(repository, header_blob),
                len(header_blob),
            )
        ]
        layers.extend(
            [
                (await self.client.async_upload_blob(repository, part), len(part))
                for part in parts
            ]
        )
        manifest, config = _object_manifest(layers)
        await self.client.async_upload_blob(repository, config)
        return await self.client.async_put_manifest(repository, tag, manifest)

    async def _update_index(
        self, repository: str, mutate: Callable[[dict[str, Any]], bool]
    ) -> None:
        """Apply a change to the index, re-reading and retrying when another writer got in."""
        lock = self._locks.setdefault(repository, asyncio.Lock())
        async with lock:
            await self.async_ensure_lock(repository)
            for _ in range(_INDEX_TRIES):
                data = await self._load_index(repository, fresh=True)
                data = json.loads(json.dumps(data))
                if not mutate(data):
                    return
                data["rev"] += 1
                plain = json.dumps(data, separators=(",", ":"), sort_keys=True).encode()
                header_blob, parts = await self._hass.async_add_executor_job(
                    seal_bytes, self._vault_key, plain
                )
                digest = await self._upload_sealed(
                    repository, header_blob, parts, self._index_tag
                )
                if (
                    await self.client.async_head_manifest(repository, self._index_tag)
                    == digest
                ):
                    self._indexes[repository] = (digest, data)
                    self._rev_seen[repository] = data["rev"]
                    return
            raise RegistryError(Reason.UNAVAILABLE)

    def _entry(
        self,
        header: ObjectHeader,
        manifest: dict[str, Any],
        digest: str,
        keep_until: float | None = None,
    ) -> dict[str, Any]:
        stored = sum(int(layer.get("size", 0)) for layer in manifest["layers"])
        meta = header.meta
        return {
            "name": meta.get("n", ""),
            "kind": meta.get("k", ""),
            "camera": meta.get("c"),
            "created": meta.get("t", 0),
            "keep_until": keep_until if keep_until is not None else meta.get("u"),
            "plain_size": header.plain_length,
            "stored_size": stored,
            "digest": digest,
            "meta": meta.get("x") or {},
        }

    async def async_put_file(
        self,
        path: str,
        *,
        kind: str,
        name: str | None = None,
        repository: str | None = None,
        camera: str | None = None,
        keep_days: float | None = None,
        meta: dict[str, Any] | None = None,
        progress: ProgressCallback | None = None,
    ) -> StoredObject:
        """Lock and upload a local file. The local file is never touched afterwards.

        Returns only after the registry accepted the manifest and answers for it, so a
        caller may delete its local copy once this returns.
        """
        size = await self._hass.async_add_executor_job(os.path.getsize, path)
        handle = await self._hass.async_add_executor_job(open, path, "rb")
        return await self._put(
            _FileSource(self._hass, handle),
            size,
            kind=kind,
            name=name or os.path.basename(path),
            repository=repository,
            camera=camera,
            keep_days=keep_days,
            meta=meta,
            progress=progress,
        )

    async def async_put_bytes(
        self,
        data: bytes,
        *,
        kind: str,
        name: str,
        repository: str | None = None,
        camera: str | None = None,
        keep_days: float | None = None,
        meta: dict[str, Any] | None = None,
    ) -> StoredObject:
        """Lock and upload some bytes that are already in memory."""
        return await self._put(
            _BytesSource(data),
            len(data),
            kind=kind,
            name=name,
            repository=repository,
            camera=camera,
            keep_days=keep_days,
            meta=meta,
            progress=None,
        )

    async def async_put_stream(
        self,
        stream: AsyncIterator[bytes],
        size: int,
        *,
        kind: str,
        name: str,
        repository: str | None = None,
        camera: str | None = None,
        keep_days: float | None = None,
        meta: dict[str, Any] | None = None,
        progress: ProgressCallback | None = None,
    ) -> StoredObject:
        """Lock and upload a stream of exactly size bytes without a local file.

        A stream that ends early is refused (`invalid_request`). Returns only after the
        registry accepted the manifest and answers for it, like the other put calls.
        """
        return await self._put(
            _StreamSource(stream),
            size,
            kind=kind,
            name=name,
            repository=repository,
            camera=camera,
            keep_days=keep_days,
            meta=meta,
            progress=progress,
        )

    async def _put(
        self,
        source: _Source,
        size: int,
        *,
        kind: str,
        name: str,
        repository: str | None,
        camera: str | None,
        keep_days: float | None,
        meta: dict[str, Any] | None,
        progress: ProgressCallback | None,
        tag: str | None = None,
        indexed: bool = True,
    ) -> StoredObject:
        repository = repository or self.repository_for(camera=camera, kind=kind)
        created = dt_util.utcnow().timestamp()
        keep_until = created + keep_days * 86400 if keep_days else None
        header = new_object_header(
            size,
            {
                "n": name,
                "k": kind,
                "c": camera,
                "t": created,
                "u": keep_until,
                "x": meta or {},
            },
        )
        try:
            header_blob = seal_object_header(self._vault_key, header)
            await self.async_ensure_lock(repository)
            layers: list[tuple[str, int]] = [
                (
                    await self.client.async_upload_blob(repository, header_blob),
                    len(header_blob),
                )
            ]
            layers.extend(
                await self._upload_parts(source, header, repository, size, progress)
            )
        finally:
            await source.close()
        manifest, config = _object_manifest(layers)
        await self.client.async_upload_blob(repository, config)
        object_tag = tag or header.object_id.hex()
        digest = await self.client.async_put_manifest(repository, object_tag, manifest)
        if await self.client.async_head_manifest(repository, object_tag) != digest:
            raise RegistryError(Reason.UNAVAILABLE)
        manifest_obj = json.loads(manifest)
        entry = self._entry(header, manifest_obj, digest)
        if indexed:

            def _add(data: dict[str, Any]) -> bool:
                data["entries"][object_tag] = entry
                data["deleted"].pop(object_tag, None)
                return True

            await self._update_index(repository, _add)
            self._open.pop((repository, object_tag), None)
        return StoredObject.from_entry(object_tag, repository, entry)

    async def _upload_parts(
        self,
        source: _Source,
        header: ObjectHeader,
        repository: str,
        size: int,
        progress: ProgressCallback | None,
    ) -> list[tuple[str, int]]:
        results: list[tuple[str, int] | None] = [None] * header.parts
        semaphore = asyncio.Semaphore(UPLOAD_CONCURRENCY)
        done = 0

        async def _upload(index: int, sealed: bytes, consumed: int) -> None:
            nonlocal done
            try:
                digest = await self.client.async_upload_blob(repository, sealed)
                results[index] = (digest, len(sealed))
                done += consumed
                if progress is not None:
                    progress(min(done, size), size)
            finally:
                semaphore.release()

        offset = 0
        try:
            async with asyncio.TaskGroup() as group:
                for index in range(header.parts):
                    want = sealed_part_size(index, header.padded_length) - TAG_SIZE
                    want_plain = max(0, min(want, size - offset))
                    chunk = await source.read(want_plain) if want_plain else b""
                    _check_read(chunk, want_plain)
                    offset += want_plain
                    sealed = seal_part(header, index, chunk.ljust(want, b"\0"))
                    await semaphore.acquire()
                    group.create_task(_upload(index, sealed, want_plain))
        except* RegistryStorageError as group_error:
            raise group_error.exceptions[0] from None
        return [item for item in results if item is not None]

    async def _repositories(self, repository: str | None) -> list[str]:
        return [repository] if repository else self.settings.repositories()

    async def _reconcile(self, repository: str) -> None:
        """Repair the index from the tag list: add what is missing, drop what is gone."""
        tags = set(await self.client.async_list_tags(repository))
        data = await self._load_index(repository, fresh=False)
        foreign = self._foreign.setdefault(repository, set())
        candidates = {
            tag
            for tag in tags - self._reserved() - foreign
            if len(tag) == _OBJECT_TAG_LENGTH and tag not in data["deleted"]
        }
        missing = candidates - set(data["entries"])
        gone = set(data["entries"]) - tags
        found: dict[str, dict[str, Any]] = {}
        for tag in sorted(missing):
            try:
                manifest, header, digest = await self._open_object(
                    repository, tag, cache=False
                )
            except LockError, RegistryError:
                foreign.add(tag)
                continue
            found[tag] = self._entry(header, manifest, digest)
        if found or gone:

            def _repair(index: dict[str, Any]) -> bool:
                for tag, entry in found.items():
                    index["entries"].setdefault(tag, entry)
                for tag in gone:
                    index["entries"].pop(tag, None)
                return True

            await self._update_index(repository, _repair)
        self._reconciled[repository] = dt_util.utcnow().timestamp()

    async def async_list(
        self,
        repository: str | None = None,
        *,
        kind: str | None = None,
        refresh: bool = False,
    ) -> list[StoredObject]:
        """List what is stored, newest first, from the encrypted index."""
        now = dt_util.utcnow().timestamp()
        found: list[StoredObject] = []
        for repo in await self._repositories(repository):
            await self.async_ensure_lock(repo)
            if refresh or now - self._reconciled.get(repo, 0) > _RECONCILE_SECONDS:
                await self._reconcile(repo)
            data = await self._load_index(repo, fresh=refresh)
            found.extend(
                StoredObject.from_entry(object_id, repo, entry)
                for object_id, entry in data["entries"].items()
                if kind is None or entry["kind"] == kind
            )
        return sorted(found, key=lambda item: item.created, reverse=True)

    async def async_used_size(self, repository: str | None = None) -> int:
        """Return the bytes the stored objects take in the registry (index and lock are tiny and not counted)."""
        return sum(item.stored_size for item in await self.async_list(repository))

    async def async_get_object(self, object_id: str) -> StoredObject:
        """Return one stored object's details."""
        for item in await self.async_list():
            if item.id == object_id:
                return item
        for item in await self.async_list(refresh=True):
            if item.id == object_id:
                return item
        raise RegistryError(Reason.OBJECT_NOT_FOUND)

    async def async_delete(self, object_id: str) -> DeleteResult:
        """Forget an object and ask the registry to delete it (it may refuse)."""
        item = await self.async_get_object(object_id)

        def _remove(data: dict[str, Any]) -> bool:
            removed = data["entries"].pop(object_id, None) is not None
            data["deleted"][object_id] = dt_util.utcnow().timestamp()
            return removed

        await self._update_index(item.repository, _remove)
        self._open.pop((item.repository, object_id), None)
        removed = await self.client.async_delete_manifest(item.repository, item.digest)
        return DeleteResult(True, removed)

    async def async_set_keep_days(
        self, object_id: str, days: float | None
    ) -> StoredObject:
        """Change how long an object is kept; None keeps it until deleted."""
        item = await self.async_get_object(object_id)
        keep_until = dt_util.utcnow().timestamp() + days * 86400 if days else None

        def _set(data: dict[str, Any]) -> bool:
            if object_id not in data["entries"]:
                return False
            data["entries"][object_id]["keep_until"] = keep_until
            return True

        await self._update_index(item.repository, _set)
        return await self.async_get_object(object_id)

    async def async_purge_expired(self) -> list[str]:
        """Delete every object whose keep time has passed; return their ids."""
        now = dt_util.utcnow().timestamp()
        expired = [
            item.id
            for item in await self.async_list()
            if item.keep_until is not None and item.keep_until <= now
        ]
        for object_id in expired:
            await self.async_delete(object_id)
        return expired

    async def _stream_parts(
        self, item: StoredObject, start: int, end: int
    ) -> AsyncIterator[tuple[int, bytes]]:
        manifest, header, _ = await self._open_object(item.repository, item.id)
        end = min(end, header.plain_length)
        if start >= end:
            return
        layers = manifest["layers"]
        first, last = start // PART_SIZE, (end - 1) // PART_SIZE

        async def _fetch(index: int) -> bytes:
            sealed = await self._get_layer(item.repository, layers[1 + index])
            return await self._hass.async_add_executor_job(
                open_part, header, index, sealed
            )

        pending = asyncio.ensure_future(_fetch(first))
        try:
            for index in range(first, last + 1):
                plain = await pending
                pending = None  # type: ignore[assignment]
                if index < last:
                    pending = asyncio.ensure_future(_fetch(index + 1))
                base = index * PART_SIZE
                yield (
                    base,
                    plain[max(start, base) - base : min(end, base + len(plain)) - base],
                )
        finally:
            if pending is not None:
                pending.cancel()

    async def async_stream(
        self, object_id: str, start: int = 0, end: int | None = None
    ) -> AsyncIterator[bytes]:
        """Yield the plain bytes from start up to end part by part, fetching one part ahead."""
        item = await self.async_get_object(object_id)
        async for _, chunk in self._stream_parts(
            item, start, end if end is not None else item.plain_size
        ):
            yield chunk

    async def async_get_range(self, object_id: str, start: int, end: int) -> bytes:
        """Return the plain bytes from start up to (not including) end."""
        if start < 0 or end < start:
            raise RegistryStorageError(Reason.INVALID_REQUEST)
        return b"".join(
            [chunk async for chunk in self.async_stream(object_id, start, end)]
        )

    async def async_get_file(
        self,
        object_id: str,
        destination: str,
        *,
        progress: ProgressCallback | None = None,
    ) -> int:
        """Download and unlock an object into a local file; return its size.

        The file is written beside the destination and moved into place only when every
        part opened, so a failure never leaves half a file under the final name.
        """
        item = await self.async_get_object(object_id)
        partial = f"{destination}.part"
        handle = await self._hass.async_add_executor_job(open, partial, "wb")
        written = 0
        try:
            async for chunk in self.async_stream(object_id):
                await self._hass.async_add_executor_job(handle.write, chunk)
                written += len(chunk)
                if progress is not None:
                    progress(written, item.plain_size)
        except BaseException:
            await self._hass.async_add_executor_job(handle.close)
            await self._hass.async_add_executor_job(_remove_quietly, partial)
            raise
        await self._hass.async_add_executor_job(handle.close)
        if written != item.plain_size:
            await self._hass.async_add_executor_job(_remove_quietly, partial)
            raise LockError(Reason.TRUNCATED)
        await self._hass.async_add_executor_job(os.replace, partial, destination)
        return written

    async def async_verify(self, object_id: str) -> bool:
        """Open every part of an object; True when all of it unlocks."""
        item = await self.async_get_object(object_id)
        count = 0
        async for chunk in self.async_stream(object_id):
            count += len(chunk)
        return count == item.plain_size

    async def async_self_test(self, repository: str | None = None) -> SelfTestResult:
        """Upload a small two-part object, read it back and compare it."""
        started = dt_util.utcnow().timestamp()
        repository = repository or self.settings.default_repository
        payload = os.urandom(PART_SIZE + 1234)
        try:
            item = await self._put(
                _BytesSource(payload),
                len(payload),
                kind="self_test",
                name="self test",
                repository=repository,
                camera=None,
                keep_days=None,
                meta=None,
                progress=None,
                tag=self._selftest_tag,
                indexed=False,
            )
            data = b"".join(
                [
                    chunk
                    async for _, chunk in self._stream_parts_uncached(
                        repository, item.id
                    )
                ]
            )
        except RegistryStorageError as err:
            return SelfTestResult(
                False, err.reason, dt_util.utcnow().timestamp() - started
            )
        ok = data == payload
        return SelfTestResult(
            ok,
            None if ok else Reason.SELF_TEST_FAILED,
            dt_util.utcnow().timestamp() - started,
        )

    async def _stream_parts_uncached(
        self, repository: str, tag: str
    ) -> AsyncIterator[tuple[int, bytes]]:
        self._open.pop((repository, tag), None)
        manifest, header, _ = await self._open_object(repository, tag, cache=False)
        for index in range(header.parts):
            sealed = await self._get_layer(repository, manifest["layers"][1 + index])
            plain = open_part(header, index, sealed)
            base = index * PART_SIZE
            yield base, plain[: max(0, header.plain_length - base)]

    async def async_change_password(
        self, old_password: str, new_password: str, confirmation: str
    ) -> None:
        """Wrap the same vault key with a new password. Stored content is not touched.

        Anyone who kept a copy of the old header can still open stored content with the
        old password: this changes who can open what is stored from now on, it does not
        take back what was already copied.
        """
        require_password(new_password, confirmation)
        loop = self._hass
        if not await loop.async_add_executor_job(
            password_matches, self._header, old_password, self._vault_key
        ):
            raise LockError(Reason.WRONG_PASSWORD)
        header = await loop.async_add_executor_job(
            wrap_vault_key, self._vault_key, new_password
        )
        for repository in self.settings.repositories():
            await async_publish_lock(self.client, repository, header)
        self._header = header
        if self._key_store is not None:
            await self._key_store.async_save(self._vault_key, header)


def _check_read(chunk: bytes, wanted: int) -> None:
    if len(chunk) != wanted:
        raise RegistryStorageError(Reason.INVALID_REQUEST)


def _remove_quietly(path: str) -> None:
    try:
        os.remove(path)
    except OSError:
        _LOGGER.debug("Could not remove a partial download")
