"""A polite client for the standard container registry HTTP interface.

Only what this integration needs: version check, the token challenge and bearer token
flow (Docker Hub and GitHub style), basic authentication for a plain registry, blobs,
manifests, tags and delete. Registry error text, tokens and addresses with credentials
are never logged or put into exceptions: every failure is a reason code.
"""

import asyncio
import base64
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
import hashlib
import ipaddress
import json
import logging
import re
import time
from typing import Any, Final
from urllib.parse import quote, urljoin, urlsplit

import aiohttp

from .const import DEFAULT_REGISTRY_TIMEOUT, LOCK_TAG, USER_AGENT
from .errors import Reason, RegistryError

_LOGGER = logging.getLogger(__name__)

OCI_MANIFEST: Final = "application/vnd.oci.image.manifest.v1+json"
OCI_CONFIG: Final = "application/vnd.oci.image.config.v1+json"
OCI_LAYER: Final = "application/vnd.oci.image.layer.v1.tar+gzip"
_ACCEPT: Final = f"{OCI_MANIFEST}, application/vnd.docker.distribution.manifest.v2+json"
_REDIRECTS: Final = {301, 302, 303, 307, 308}
_RETRY_STATUS: Final = {429, 502, 503, 504}
_MAX_ATTEMPTS: Final = 4
_MAX_WAIT: Final = 30.0
_REPOSITORY = re.compile(
    r"^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:/[a-z0-9]+(?:[._-][a-z0-9]+)*)*$"
)
_CHALLENGE_PART = re.compile(r'(\w+)="([^"]*)"')


def digest_of(data: bytes) -> str:
    """Return the registry digest of some bytes."""
    return "sha256:" + hashlib.sha256(data).hexdigest()


def valid_repository(name: str) -> bool:
    """Return whether a repository name is acceptable to a registry."""
    return len(name) <= 255 and bool(_REPOSITORY.match(name))


def _is_local_host(host: str) -> bool:
    if host == "localhost" or host.endswith((".local", ".lan", ".internal")):
        return True
    if "." not in host and ":" not in host:
        return True
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return False
    return address.is_private or address.is_loopback or address.is_link_local


def normalize_address(address: str) -> str:
    """Return a base address without a trailing slash, or raise a reason code.

    Plain http is accepted only for a host that is on the local network, since the
    token would travel unprotected.
    """
    text = address.strip()
    if "://" not in text:
        text = "https://" + text
    parts = urlsplit(text)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise RegistryError(Reason.INVALID_ADDRESS)
    if parts.username or parts.password or parts.query or parts.fragment:
        raise RegistryError(Reason.INVALID_ADDRESS)
    if parts.path not in ("", "/"):
        raise RegistryError(Reason.INVALID_ADDRESS)
    if parts.scheme == "http" and not _is_local_host(parts.hostname):
        raise RegistryError(Reason.INSECURE_ADDRESS)
    return f"{parts.scheme}://{parts.netloc}"


@dataclass(frozen=True, slots=True)
class Response:
    """What came back: no registry text is kept apart from the body bytes."""

    status: int
    headers: dict[str, str]
    body: bytes


@dataclass(frozen=True, slots=True)
class CredentialCheck:
    """Whether the account and token were accepted and what they may do."""

    ok: bool
    can_push: bool | None


def _error_for(status: int) -> RegistryError:
    if status == 401:
        return RegistryError(Reason.AUTH_FAILED, status=status)
    if status == 403:
        return RegistryError(Reason.DENIED, status=status)
    if status == 404:
        return RegistryError(Reason.NOT_FOUND, status=status)
    if status == 429:
        return RegistryError(Reason.RATE_LIMITED, status=status)
    if status >= 500:
        return RegistryError(Reason.UNAVAILABLE, status=status)
    return RegistryError(Reason.REJECTED, status=status)


def _parse_challenge(header: str) -> tuple[str, dict[str, str]]:
    scheme, _, rest = header.strip().partition(" ")
    return scheme.lower(), dict(_CHALLENGE_PART.findall(rest))


def _same_site(host: str, base_host: str) -> bool:
    """Whether the sign-in service of a registry belongs to the registry's own domain.

    The account name and token are sent to it, so a registry that names a stranger's
    address in its challenge must not receive them.
    """
    host, base_host = host.lower().rstrip("."), base_host.lower().rstrip(".")
    if host == base_host:
        return True
    try:
        ipaddress.ip_address(host)
        ipaddress.ip_address(base_host)
    except ValueError:
        pass
    else:
        return False
    return host.split(".")[-2:] == base_host.split(".")[-2:] and "." in host


def _jwt_actions(token: str, repository: str) -> set[str] | None:
    """Read the granted actions from a token's payload (it is not verified or logged)."""
    parts = token.split(".")
    if len(parts) != 3:
        return None
    try:
        payload = json.loads(
            base64.urlsafe_b64decode(parts[1] + "=" * (-len(parts[1]) % 4))
        )
        access = payload["access"]
    except KeyError, ValueError, TypeError:
        return None
    granted: set[str] = set()
    for item in access:
        if isinstance(item, dict) and item.get("name") == repository:
            granted.update(item.get("actions") or [])
    return granted


class RegistryClient:
    """Talk to one registry with one account."""

    def __init__(
        self,
        session: aiohttp.ClientSession,
        base_url: str,
        username: str | None,
        token: str | None,
        *,
        timeout: float = DEFAULT_REGISTRY_TIMEOUT,
        concurrency: int = 4,
        sleep: Callable[[float], Awaitable[Any]] = asyncio.sleep,
    ) -> None:
        """Set up the client; nothing is sent yet."""
        self._session = session
        self.base_url = normalize_address(base_url)
        self._username = username
        self._token = token
        self._timeout = aiohttp.ClientTimeout(total=timeout)
        self._semaphore = asyncio.Semaphore(concurrency)
        self._sleep = sleep
        self._challenge: tuple[str, dict[str, str]] | None = None
        self._tokens: dict[tuple[str, bool], tuple[str, float]] = {}
        self.rate_limit_remaining: int | None = None

    @property
    def _host(self) -> str:
        return urlsplit(self.base_url).netloc

    def _basic(self) -> str | None:
        if not self._username or not self._token:
            return None
        raw = f"{self._username}:{self._token}".encode()
        return "Basic " + base64.b64encode(raw).decode("ascii")

    async def _fetch_token(
        self, params: dict[str, str], scope: str, anonymous: bool
    ) -> tuple[str, str | None]:
        realm = params.get("realm", "")
        parts = urlsplit(realm)
        if parts.scheme not in ("https", "http") or not parts.hostname:
            raise RegistryError(Reason.INVALID_RESPONSE)
        if parts.scheme == "http" and not self.base_url.startswith("http://"):
            raise RegistryError(Reason.INSECURE_ADDRESS)
        if not _same_site(parts.hostname, urlsplit(self.base_url).hostname or ""):
            raise RegistryError(Reason.INVALID_RESPONSE)
        query = f"scope={quote(scope, safe=':/')}"
        if service := params.get("service"):
            query += f"&service={quote(service, safe='')}"
        url = f"{realm}{'&' if parts.query else '?'}{query}"
        headers = {"User-Agent": USER_AGENT}
        if not anonymous and (basic := self._basic()):
            headers["Authorization"] = basic
        response = await self._raw("GET", url, headers=headers)
        if response.status != 200:
            raise _error_for(response.status)
        try:
            payload = json.loads(response.body)
            token = payload.get("token") or payload["access_token"]
            expires_in = int(payload.get("expires_in") or 60)
        except KeyError, ValueError, TypeError, AttributeError:
            raise RegistryError(Reason.INVALID_RESPONSE) from None
        if not isinstance(token, str):
            raise RegistryError(Reason.INVALID_RESPONSE)
        self._tokens[(scope, anonymous)] = (
            token,
            time.monotonic() + max(expires_in - 10, 5),
        )
        return token, None

    def _cached_header(self, scope: str, anonymous: bool) -> str | None:
        if self._challenge is None:
            return None
        scheme = self._challenge[0]
        if scheme == "basic":
            return None if anonymous else self._basic()
        cached = self._tokens.get((scope, anonymous))
        if cached and cached[1] > time.monotonic():
            return f"Bearer {cached[0]}"
        return None

    async def _authorization(
        self, challenge: tuple[str, dict[str, str]], scope: str, anonymous: bool
    ) -> str | None:
        self._challenge = challenge
        scheme, params = challenge
        if scheme == "basic":
            return None if anonymous else self._basic()
        if scheme != "bearer":
            raise RegistryError(Reason.INVALID_RESPONSE)
        token, _ = await self._fetch_token(params, scope, anonymous)
        return f"Bearer {token}"

    async def _raw(
        self,
        method: str,
        url: str,
        *,
        headers: dict[str, str],
        data: bytes | None = None,
    ) -> Response:
        """Send one request with backoff on rate limits and transient failures."""
        last: RegistryError | None = None
        for attempt in range(_MAX_ATTEMPTS):
            try:
                async with (
                    self._semaphore,
                    self._session.request(
                        method,
                        url,
                        headers=headers,
                        data=data,
                        allow_redirects=False,
                        timeout=self._timeout,
                    ) as resp,
                ):
                    body = await resp.read() if method != "HEAD" else b""
                    response = Response(
                        resp.status,
                        {k.lower(): v for k, v in resp.headers.items()},
                        body,
                    )
            except TimeoutError:
                last = RegistryError(Reason.TIMEOUT)
            except aiohttp.ClientError:
                last = RegistryError(Reason.UNAVAILABLE)
            else:
                self._note_rate_limit(response)
                if response.status not in _RETRY_STATUS:
                    return response
                last = _error_for(response.status)
                if attempt + 1 < _MAX_ATTEMPTS:
                    await self._sleep(self._wait(response, attempt))
                    continue
                return response
            if attempt + 1 < _MAX_ATTEMPTS:
                await self._sleep(min(2.0**attempt, _MAX_WAIT))
        assert last is not None
        raise last

    def _wait(self, response: Response, attempt: int) -> float:
        retry_after = response.headers.get("retry-after", "")
        if retry_after.isdigit():
            return min(float(retry_after), _MAX_WAIT)
        return min(2.0**attempt, _MAX_WAIT)

    def _note_rate_limit(self, response: Response) -> None:
        value = response.headers.get("ratelimit-remaining") or response.headers.get(
            "x-ratelimit-remaining"
        )
        if value:
            head = value.split(";")[0].strip()
            if head.isdigit():
                self.rate_limit_remaining = int(head)

    async def _send(
        self,
        method: str,
        url: str,
        repository: str,
        actions: str,
        *,
        headers: dict[str, str] | None = None,
        data: bytes | None = None,
        anonymous: bool = False,
    ) -> Response:
        """Send an authenticated request, answering one token challenge if it comes."""
        scope = f"repository:{repository}:{actions}"
        base_headers = {"User-Agent": USER_AGENT, **(headers or {})}
        auth = self._cached_header(scope, anonymous)
        request_headers = dict(base_headers)
        if auth:
            request_headers["Authorization"] = auth
        response = await self._raw(method, url, headers=request_headers, data=data)
        if response.status != 401:
            return response
        header = response.headers.get("www-authenticate")
        if not header:
            return response
        auth = await self._authorization(_parse_challenge(header), scope, anonymous)
        request_headers = dict(base_headers)
        if auth:
            request_headers["Authorization"] = auth
        return await self._raw(method, url, headers=request_headers, data=data)

    def _url(self, repository: str, tail: str) -> str:
        if not valid_repository(repository):
            raise RegistryError(Reason.INVALID_REPOSITORY)
        return f"{self.base_url}/v2/{repository}/{tail}"

    def _same_host(self, url: str) -> str:
        absolute = urljoin(self.base_url + "/", url)
        if urlsplit(absolute).netloc != self._host:
            raise RegistryError(Reason.INVALID_RESPONSE)
        return absolute

    async def async_check_version(self) -> None:
        """Make sure the address speaks the registry interface."""
        response = await self._raw(
            "GET", f"{self.base_url}/v2/", headers={"User-Agent": USER_AGENT}
        )
        if response.status == 200:
            return
        if response.status == 401 and response.headers.get("www-authenticate"):
            return
        raise _error_for(response.status)

    async def async_check_credentials(self, repository: str) -> CredentialCheck:
        """Check the account and token and report whether they can write."""
        scope = f"repository:{repository}:pull,push"
        if not valid_repository(repository):
            raise RegistryError(Reason.INVALID_ADDRESS)
        response = await self._raw(
            "GET", f"{self.base_url}/v2/", headers={"User-Agent": USER_AGENT}
        )
        if response.status == 200:
            return CredentialCheck(True, None)
        if response.status != 401 or not response.headers.get("www-authenticate"):
            raise _error_for(response.status)
        challenge = _parse_challenge(response.headers["www-authenticate"])
        if challenge[0] == "basic":
            self._challenge = challenge
            basic = self._basic()
            if basic is None:
                raise RegistryError(Reason.AUTH_FAILED)
            probe = await self._raw(
                "GET",
                f"{self.base_url}/v2/",
                headers={"User-Agent": USER_AGENT, "Authorization": basic},
            )
            if probe.status != 200:
                raise _error_for(probe.status)
            return CredentialCheck(True, None)
        if not self._basic():
            raise RegistryError(Reason.AUTH_FAILED)
        token, _ = await self._fetch_token(challenge[1], scope, False)
        self._challenge = challenge
        granted = _jwt_actions(token, repository)
        return CredentialCheck(True, None if granted is None else "push" in granted)

    async def async_is_public(self, repository: str) -> bool:
        """Return whether anyone, without signing in, can read the repository's lock."""

        response = await self._send(
            "HEAD",
            self._url(repository, f"manifests/{LOCK_TAG}"),
            repository,
            "pull",
            headers={"Accept": _ACCEPT},
            anonymous=True,
        )
        if response.status in _RETRY_STATUS:
            raise _error_for(response.status)
        return response.status == 200

    async def async_blob_size(self, repository: str, digest: str) -> int | None:
        """Return the size of a blob, or None when the registry does not have it."""
        response = await self._send(
            "HEAD", self._url(repository, f"blobs/{digest}"), repository, "pull,push"
        )
        if response.status == 404:
            return None
        if response.status != 200:
            raise _error_for(response.status)
        length = response.headers.get("content-length", "")
        return int(length) if length.isdigit() else -1

    async def async_upload_blob(self, repository: str, data: bytes) -> str:
        """Upload one blob unless the registry already has it; return its digest."""
        digest = digest_of(data)
        if await self.async_blob_size(repository, digest) is not None:
            return digest
        start = await self._send(
            "POST", self._url(repository, "blobs/uploads/"), repository, "pull,push"
        )
        if start.status != 202:
            raise _error_for(start.status)
        location = start.headers.get("location")
        if not location:
            raise RegistryError(Reason.INVALID_RESPONSE)
        target = self._same_host(location)
        separator = "&" if "?" in target else "?"
        done = await self._send(
            "PUT",
            f"{target}{separator}digest={quote(digest, safe='')}",
            repository,
            "pull,push",
            headers={
                "Content-Type": "application/octet-stream",
                "Content-Length": str(len(data)),
            },
            data=data,
        )
        if done.status not in (200, 201):
            raise _error_for(done.status)
        return digest

    async def async_get_blob(
        self,
        repository: str,
        digest: str,
        byte_range: tuple[int, int] | None = None,
    ) -> bytes:
        """Download a blob, or an inclusive byte range of it."""
        headers: dict[str, str] = {}
        if byte_range is not None:
            headers["Range"] = f"bytes={byte_range[0]}-{byte_range[1]}"
        response = await self._send(
            "GET",
            self._url(repository, f"blobs/{digest}"),
            repository,
            "pull",
            headers=headers,
        )
        hops = 0
        while response.status in _REDIRECTS and hops < 3:
            location = response.headers.get("location")
            if not location:
                raise RegistryError(Reason.INVALID_RESPONSE)
            target = urljoin(self.base_url + "/", location)
            if urlsplit(target).scheme != urlsplit(self.base_url).scheme:
                raise RegistryError(Reason.INSECURE_ADDRESS)
            response = await self._raw(
                "GET", target, headers={"User-Agent": USER_AGENT, **headers}
            )
            hops += 1
        if response.status not in (200, 206):
            raise _error_for(response.status)
        return response.body

    async def async_put_manifest(
        self, repository: str, tag: str, manifest: bytes, media_type: str = OCI_MANIFEST
    ) -> str:
        """Publish a manifest under a tag; return its digest."""
        response = await self._send(
            "PUT",
            self._url(repository, f"manifests/{quote(tag, safe='')}"),
            repository,
            "pull,push",
            headers={"Content-Type": media_type},
            data=manifest,
        )
        if response.status not in (200, 201):
            raise _error_for(response.status)
        return digest_of(manifest)

    async def async_get_manifest(
        self, repository: str, reference: str
    ) -> tuple[dict[str, Any], str] | None:
        """Return the parsed manifest and its digest, or None when there is none."""
        response = await self._send(
            "GET",
            self._url(repository, f"manifests/{quote(reference, safe=':')}"),
            repository,
            "pull",
            headers={"Accept": _ACCEPT},
        )
        if response.status == 404:
            return None
        if response.status != 200:
            raise _error_for(response.status)
        try:
            manifest = json.loads(response.body)
        except ValueError:
            raise RegistryError(Reason.INVALID_RESPONSE) from None
        if not isinstance(manifest, dict):
            raise RegistryError(Reason.INVALID_RESPONSE)
        return manifest, digest_of(response.body)

    async def async_head_manifest(self, repository: str, reference: str) -> str | None:
        """Return the digest a tag points at, or None."""
        response = await self._send(
            "HEAD",
            self._url(repository, f"manifests/{quote(reference, safe=':')}"),
            repository,
            "pull",
            headers={"Accept": _ACCEPT},
        )
        if response.status == 404:
            return None
        if response.status != 200:
            raise _error_for(response.status)
        return response.headers.get("docker-content-digest")

    async def async_list_tags(self, repository: str) -> list[str]:
        """List every tag in a repository, following pagination."""
        tags: list[str] = []
        url: str | None = self._url(repository, "tags/list") + "?n=1000"
        for _ in range(100):
            if url is None:
                break
            response = await self._send("GET", url, repository, "pull")
            if response.status == 404:
                return tags
            if response.status != 200:
                raise _error_for(response.status)
            try:
                payload = json.loads(response.body)
                tags.extend(payload.get("tags") or [])
            except ValueError, AttributeError, TypeError:
                raise RegistryError(Reason.INVALID_RESPONSE) from None
            match = re.search(
                r"<([^>]+)>\s*;\s*rel=\"?next\"?", response.headers.get("link", "")
            )
            url = self._same_host(match.group(1)) if match else None
        return tags

    async def async_delete_manifest(self, repository: str, digest: str) -> bool:
        """Ask the registry to delete a manifest; False when it does not allow that."""
        response = await self._send(
            "DELETE",
            self._url(repository, f"manifests/{digest}"),
            repository,
            "pull,push,delete",
        )
        if response.status in (200, 202):
            return True
        if response.status in (401, 403, 404, 405):
            return False
        raise _error_for(response.status)
