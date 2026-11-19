"""Tests against a real local registry (the registry:2 image).

They run only when REGISTRY_TEST_URL names one, for example http://ham-reg-a-registry:5000,
on a private container network. Nothing here ever contacts a public registry.
"""

from collections.abc import AsyncGenerator, Generator
import os
from pathlib import Path
from urllib.parse import urlsplit
import uuid

import aiohttp
import pytest
from pytest_socket import socket_allow_hosts

from homeassistant.components.registry_storage.client import RegistryClient, digest_of
from homeassistant.components.registry_storage.crypto import (
    PART_SIZE,
    new_vault_key,
    unwrap_vault_key,
    wrap_vault_key,
)
from homeassistant.components.registry_storage.errors import LockError
from homeassistant.components.registry_storage.store import (
    RegistryStore,
    StorageSettings,
    async_read_lock,
)
from homeassistant.core import HomeAssistant

from .conftest import PASSWORD

URL = os.environ.get("REGISTRY_TEST_URL")

pytestmark = [
    pytest.mark.skipif(not URL, reason="REGISTRY_TEST_URL is not set"),
    pytest.mark.usefixtures("allow_registry_socket"),
]


@pytest.fixture
def allow_registry_socket(socket_enabled: None) -> Generator[None]:
    """Allow connections to the local test registry, and only to it."""
    assert URL
    address = urlsplit(URL).hostname or ""
    socket_allow_hosts(["127.0.0.1", address])
    yield
    socket_allow_hosts(["127.0.0.1"])


@pytest.fixture
async def real_client() -> AsyncGenerator[RegistryClient]:
    """Return a client for the local registry."""
    assert URL
    async with aiohttp.ClientSession() as session:
        yield RegistryClient(session, URL, None, None)


@pytest.fixture
def repository() -> str:
    """Return a repository name nobody used before."""
    return f"test/{uuid.uuid4().hex[:12]}"


async def test_real_client_basics(real_client: RegistryClient, repository: str) -> None:
    """Version, blobs with a range, manifests, tags and delete against a real registry."""
    await real_client.async_check_version()
    check = await real_client.async_check_credentials(repository)
    assert check.ok
    data = os.urandom(300_000)
    digest = await real_client.async_upload_blob(repository, data)
    assert digest == digest_of(data)
    assert await real_client.async_upload_blob(repository, data) == digest
    assert await real_client.async_blob_size(repository, digest) == len(data)
    assert await real_client.async_get_blob(repository, digest) == data
    assert (
        await real_client.async_get_blob(repository, digest, (1000, 1999))
        == data[1000:2000]
    )

    config = await real_client.async_upload_blob(repository, b"{}")
    manifest = (
        b'{"schemaVersion":2,"mediaType":"application/vnd.oci.image.manifest.v1+json",'
        b'"config":{"mediaType":"application/vnd.oci.image.config.v1+json","digest":"%s","size":2},'
        b'"layers":[{"mediaType":"application/vnd.oci.image.layer.v1.tar+gzip","digest":"%s","size":%d}]}'
        % (config.encode(), digest.encode(), len(data))
    )
    assert await real_client.async_put_manifest(
        repository, "one", manifest
    ) == digest_of(manifest)
    assert await real_client.async_list_tags(repository) == ["one"]
    found = await real_client.async_get_manifest(repository, "one")
    assert found is not None
    assert found[1] == digest_of(manifest)
    assert await real_client.async_head_manifest(repository, "one") == digest_of(
        manifest
    )
    assert await real_client.async_head_manifest(repository, "two") is None
    assert await real_client.async_is_public(repository) is False
    assert await real_client.async_delete_manifest(repository, digest_of(manifest)) in (
        True,
        False,
    )


async def test_real_store_round_trip(
    hass: HomeAssistant, real_client: RegistryClient, repository: str, tmp_path: Path
) -> None:
    """A multi-part file goes up locked, plays from the middle and comes back exactly."""
    vault = new_vault_key()
    header = wrap_vault_key(vault, PASSWORD)
    store = RegistryStore(hass, real_client, vault, header, StorageSettings(repository))
    data = os.urandom(3 * PART_SIZE + 777)
    source = tmp_path / "clip.bin"
    source.write_bytes(data)
    stored = await store.async_put_file(
        str(source), kind="recording", camera="camera.front_door"
    )
    assert (await store.async_list())[0].id == stored.id
    assert (
        await store.async_get_range(stored.id, PART_SIZE + 5, PART_SIZE + 905)
        == data[PART_SIZE + 5 : PART_SIZE + 905]
    )
    destination = tmp_path / "back.bin"
    assert await store.async_get_file(stored.id, str(destination)) == len(data)
    assert destination.read_bytes() == data
    assert (await store.async_self_test()).ok

    other_header = await async_read_lock(real_client, repository)
    assert other_header is not None
    other = RegistryStore(
        hass,
        real_client,
        unwrap_vault_key(other_header, PASSWORD),
        other_header,
        StorageSettings(repository),
    )
    assert [item.id for item in await other.async_list(refresh=True)] == [stored.id]
    wrong = RegistryStore(
        hass, real_client, new_vault_key(), {}, StorageSettings(repository)
    )
    with pytest.raises(LockError):
        await wrong._open_object(repository, stored.id)  # noqa: SLF001
    result = await store.async_delete(stored.id)
    assert result.removed_from_index
    assert await store.async_list(refresh=True) == []
