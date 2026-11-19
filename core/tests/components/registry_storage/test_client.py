"""Tests for the registry client against the in-memory registry."""

from unittest.mock import AsyncMock

import pytest

from homeassistant.components.registry_storage.client import (
    CredentialCheck,
    RegistryClient,
    digest_of,
    normalize_address,
    valid_repository,
)
from homeassistant.components.registry_storage.errors import Reason, RegistryError

from .common import BASE, TOKEN, USER, FakeRegistry, sha

REPO = "tester/vault"


async def test_version_check_in_every_mode(
    registry: FakeRegistry, client: RegistryClient
) -> None:
    """The address is accepted when it answers like a registry."""
    await client.async_check_version()
    registry.mode = "basic"
    await client.async_check_version()
    registry.mode = "open"
    await client.async_check_version()


async def test_version_check_not_a_registry(
    registry: FakeRegistry, client: RegistryClient
) -> None:
    """A server that is not a registry is refused."""
    registry.fail("GET", 404)
    with pytest.raises(RegistryError) as err:
        await client.async_check_version()
    assert err.value.reason is Reason.NOT_FOUND


async def test_check_credentials_bearer(
    registry: FakeRegistry, client: RegistryClient
) -> None:
    """A good token is accepted and reported as able to write."""
    assert await client.async_check_credentials(REPO) == CredentialCheck(True, True)


async def test_check_credentials_read_only(
    registry: FakeRegistry, client: RegistryClient
) -> None:
    """A token that can only read is reported."""
    registry.can_push = False
    assert await client.async_check_credentials(REPO) == CredentialCheck(True, False)


async def test_check_credentials_wrong_token(
    registry: FakeRegistry, sleeps: AsyncMock
) -> None:
    """A wrong token is reported as an authentication failure."""
    bad = RegistryClient(registry, BASE, USER, "wrong", sleep=sleeps)  # type: ignore[arg-type]
    with pytest.raises(RegistryError) as err:
        await bad.async_check_credentials(REPO)
    assert err.value.reason is Reason.AUTH_FAILED


async def test_check_credentials_without_account(
    registry: FakeRegistry, sleeps: AsyncMock
) -> None:
    """No account and token is an authentication failure, not a crash."""
    bare = RegistryClient(registry, BASE, None, None, sleep=sleeps)  # type: ignore[arg-type]
    with pytest.raises(RegistryError) as err:
        await bare.async_check_credentials(REPO)
    assert err.value.reason is Reason.AUTH_FAILED


async def test_check_credentials_basic_and_open(
    registry: FakeRegistry, client: RegistryClient
) -> None:
    """A plain registry with basic authentication, and one with none."""
    registry.mode = "basic"
    assert await client.async_check_credentials(REPO) == CredentialCheck(True, None)
    registry.mode = "open"
    assert await client.async_check_credentials(REPO) == CredentialCheck(True, None)


async def test_basic_credentials_wrong(
    registry: FakeRegistry, sleeps: AsyncMock
) -> None:
    """Wrong basic credentials are an authentication failure."""
    registry.mode = "basic"
    bad = RegistryClient(registry, BASE, USER, "wrong", sleep=sleeps)  # type: ignore[arg-type]
    with pytest.raises(RegistryError) as err:
        await bad.async_check_credentials(REPO)
    assert err.value.reason is Reason.AUTH_FAILED


async def test_blob_round_trip_and_skip(
    registry: FakeRegistry, client: RegistryClient
) -> None:
    """A blob is uploaded once; a second upload of the same bytes sends nothing (resume)."""
    data = b"x" * 5000
    digest = await client.async_upload_blob(REPO, data)
    assert digest == sha(data) == digest_of(data)
    posts = [r for r in registry.requests if r[0] == "POST"]
    assert len(posts) == 1
    assert await client.async_upload_blob(REPO, data) == digest
    assert len([r for r in registry.requests if r[0] == "POST"]) == 1
    assert await client.async_blob_size(REPO, digest) == 5000
    assert await client.async_blob_size(REPO, sha(b"other")) is None
    assert await client.async_get_blob(REPO, digest) == data


async def test_ranged_download(registry: FakeRegistry, client: RegistryClient) -> None:
    """A byte range of a blob can be fetched on its own."""
    data = bytes(range(256)) * 10
    digest = await client.async_upload_blob(REPO, data)
    assert await client.async_get_blob(REPO, digest, (100, 199)) == data[100:200]


async def test_token_is_reused(registry: FakeRegistry, client: RegistryClient) -> None:
    """One token serves many requests for the same scope."""
    await client.async_upload_blob(REPO, b"one")
    await client.async_upload_blob(REPO, b"two")
    await client.async_upload_blob(REPO, b"three")
    assert len(registry.token_requests) == 1


async def test_manifest_tags_and_delete(
    registry: FakeRegistry, client: RegistryClient
) -> None:
    """Manifests are published under tags, listed with pagination and may be deleted."""
    registry.page_size = 2
    layer = await client.async_upload_blob(REPO, b"layer")
    config = await client.async_upload_blob(REPO, b"{}")
    manifest = (
        b'{"schemaVersion":2,"config":{"mediaType":"x","digest":"%s","size":2},'
        b'"layers":[{"mediaType":"y","digest":"%s","size":5}]}'
        % (config.encode(), layer.encode())
    )
    digests = [
        await client.async_put_manifest(REPO, tag, manifest)
        for tag in ("a", "b", "c", "d", "e")
    ]
    assert set(digests) == {digest_of(manifest)}
    assert await client.async_list_tags(REPO) == ["a", "b", "c", "d", "e"]
    found = await client.async_get_manifest(REPO, "c")
    assert found is not None
    assert found[1] == digest_of(manifest)
    assert await client.async_head_manifest(REPO, "c") == digest_of(manifest)
    assert await client.async_head_manifest(REPO, "zzz") is None
    assert await client.async_get_manifest(REPO, "zzz") is None
    assert await client.async_delete_manifest(REPO, digest_of(manifest)) is False
    registry.allow_delete = True
    assert await client.async_delete_manifest(REPO, digest_of(manifest)) is True
    assert await client.async_list_tags(REPO) == []


async def test_manifest_with_missing_blob_is_rejected(
    registry: FakeRegistry, client: RegistryClient
) -> None:
    """The registry refuses a manifest whose blobs are not there; that is a reason code."""
    manifest = (
        b'{"schemaVersion":2,"config":{"mediaType":"x","digest":"sha256:%s","size":2},"layers":[]}'
        % (b"0" * 64)
    )
    with pytest.raises(RegistryError) as err:
        await client.async_put_manifest(REPO, "a", manifest)
    assert err.value.reason is Reason.REJECTED


async def test_public_and_private(
    registry: FakeRegistry, client: RegistryClient
) -> None:
    """Public means an anonymous pull of the lock works."""
    layer = await client.async_upload_blob(REPO, b"{}")
    manifest = (
        b'{"schemaVersion":2,"config":{"mediaType":"x","digest":"%s","size":2},"layers":[]}'
        % layer.encode()
    )
    await client.async_put_manifest(REPO, "lock", manifest)
    assert await client.async_is_public(REPO) is True
    registry.public = False
    registry.tokens.clear()
    fresh = RegistryClient(registry, BASE, USER, TOKEN)  # type: ignore[arg-type]
    assert await fresh.async_is_public(REPO) is False


async def test_public_check_busy_registry_is_not_private(
    registry: FakeRegistry, client: RegistryClient, sleeps: AsyncMock
) -> None:
    """A busy registry gives a reason code, never the answer "not public"."""
    for _ in range(10):
        registry.fail("HEAD", 429)
    with pytest.raises(RegistryError) as err:
        await client.async_is_public(REPO)
    assert err.value.reason is Reason.RATE_LIMITED


@pytest.mark.parametrize(
    ("method", "status", "reason"),
    [
        ("HEAD", 403, Reason.DENIED),
        ("HEAD", 404, None),
        ("GET", 500, Reason.UNAVAILABLE),
        ("GET", 400, Reason.REJECTED),
    ],
)
async def test_status_to_reason(
    registry: FakeRegistry,
    client: RegistryClient,
    sleeps: AsyncMock,
    method: str,
    status: int,
    reason: Reason | None,
) -> None:
    """Statuses become reason codes; a missing blob is just None."""
    digest = sha(b"nothing")
    for _ in range(4):
        registry.fail(method, status)
    if method == "HEAD":
        if reason is None:
            assert await client.async_blob_size(REPO, digest) is None
            return
        with pytest.raises(RegistryError) as err:
            await client.async_blob_size(REPO, digest)
    else:
        with pytest.raises(RegistryError) as err:
            await client.async_get_blob(REPO, digest)
    assert err.value.reason is reason


async def test_rate_limit_backoff(
    registry: FakeRegistry, client: RegistryClient, sleeps: AsyncMock
) -> None:
    """A rate limit is waited out using the registry's own delay, then the call succeeds."""
    registry.fail(
        "HEAD", 429, **{"retry-after": "7", "ratelimit-remaining": "0;w=21600"}
    )
    assert await client.async_blob_size(REPO, sha(b"nothing")) is None
    sleeps.assert_awaited_once_with(7.0)
    assert client.rate_limit_remaining == 0


async def test_rate_limit_gives_up(
    registry: FakeRegistry, client: RegistryClient, sleeps: AsyncMock
) -> None:
    """Endless rate limiting ends as a reason code after bounded retries."""
    for _ in range(10):
        registry.fail("HEAD", 429)
    with pytest.raises(RegistryError) as err:
        await client.async_blob_size(REPO, sha(b"nothing"))
    assert err.value.reason is Reason.RATE_LIMITED
    assert sleeps.await_count == 3


async def test_timeout_and_connection_errors(
    registry: FakeRegistry, client: RegistryClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Timeouts and connection failures become reason codes after bounded retries."""
    import aiohttp  # noqa: PLC0415

    def _raise(exc: BaseException):
        def _request(*args: object, **kwargs: object) -> None:
            raise exc

        return _request

    monkeypatch.setattr(registry, "request", _raise(TimeoutError()))
    with pytest.raises(RegistryError) as timeout:
        await client.async_check_version()
    assert timeout.value.reason is Reason.TIMEOUT
    monkeypatch.setattr(registry, "request", _raise(aiohttp.ClientConnectionError()))
    with pytest.raises(RegistryError) as down:
        await client.async_check_version()
    assert down.value.reason is Reason.UNAVAILABLE


async def test_upload_location_on_another_host_is_refused(
    registry: FakeRegistry, client: RegistryClient
) -> None:
    """The token is never sent to a different host named in an upload location."""
    registry.fail("POST", 202, location="https://evil.test/upload")
    with pytest.raises(RegistryError) as err:
        await client.async_upload_blob(REPO, b"data")
    assert err.value.reason is Reason.INVALID_RESPONSE


async def test_blob_redirect_carries_no_credentials(
    registry: FakeRegistry, client: RegistryClient
) -> None:
    """A redirect to a download host is followed without the Authorization header."""
    digest = await client.async_upload_blob(REPO, b"payload")
    registry.fail("GET", 307, location="https://cdn.registry.test/blob")
    registry.fail("GET", 200, body=b"payload")
    assert await client.async_get_blob(REPO, digest) == b"payload"
    assert registry.requests[-1] == ("GET", "/blob", "none")


async def test_no_secrets_in_errors_or_logs(
    registry: FakeRegistry, client: RegistryClient, caplog: pytest.LogCaptureFixture
) -> None:
    """Neither the token nor the account name reaches an exception text or a log line."""
    registry.fail("HEAD", 403)
    with pytest.raises(RegistryError) as err:
        await client.async_blob_size(REPO, sha(b"x"))
    assert TOKEN not in str(err.value)
    assert USER not in str(err.value)
    assert str(err.value) == "denied"
    assert TOKEN not in caplog.text


@pytest.mark.parametrize(
    ("address", "expected"),
    [
        ("registry.example.com", "https://registry.example.com"),
        ("https://registry.example.com/", "https://registry.example.com"),
        ("http://192.168.1.5:5000", "http://192.168.1.5:5000"),
        ("http://my-registry:5000", "http://my-registry:5000"),
        ("http://localhost:5000", "http://localhost:5000"),
    ],
)
def test_normalize_address(address: str, expected: str) -> None:
    """Addresses are normalized and plain http is allowed on the local network."""
    assert normalize_address(address) == expected


@pytest.mark.parametrize(
    ("address", "reason"),
    [
        ("http://registry.example.com", Reason.INSECURE_ADDRESS),
        ("http://8.8.8.8", Reason.INSECURE_ADDRESS),
        ("ftp://registry.example.com", Reason.INVALID_ADDRESS),
        ("https://user:pass@registry.example.com", Reason.INVALID_ADDRESS),
        ("https://registry.example.com/path", Reason.INVALID_ADDRESS),
        ("https://registry.example.com/?a=b", Reason.INVALID_ADDRESS),
        ("", Reason.INVALID_ADDRESS),
    ],
)
def test_normalize_address_refused(address: str, reason: Reason) -> None:
    """Unsafe or malformed addresses are refused with a reason code."""
    with pytest.raises(RegistryError) as err:
        normalize_address(address)
    assert err.value.reason is reason


@pytest.mark.parametrize(
    ("name", "valid"),
    [
        ("account/name", True),
        ("account/home-vault", True),
        ("a.b/c_d/e", True),
        ("Account/Name", False),
        ("../etc", False),
        ("account//name", False),
        ("", False),
        ("a" * 300, False),
    ],
)
def test_valid_repository(name: str, valid: bool) -> None:
    """Repository names follow the registry rules."""
    assert valid_repository(name) is valid
