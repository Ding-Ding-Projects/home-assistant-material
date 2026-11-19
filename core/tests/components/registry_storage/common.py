"""A small in-memory container registry used by the tests.

It speaks the same HTTP interface the client uses, including the bearer token challenge,
basic authentication, uploads, ranges, manifests, tags with pagination and delete, so the
real client and store run against it unchanged.
"""

import base64
import hashlib
import json
import re
from types import TracebackType
from typing import Any
from urllib.parse import parse_qs, quote, unquote, urlsplit
import uuid

REALM = "https://auth.registry.test/token"
SERVICE = "registry.test"
USER = "tester"
TOKEN = "correct-token-value"
BASE = "https://registry.test"

_BLOB = re.compile(r"^/v2/(?P<repo>.+)/blobs/(?P<digest>sha256:[0-9a-f]{64})$")
_UPLOADS = re.compile(r"^/v2/(?P<repo>.+)/blobs/uploads/(?P<id>[0-9a-f-]*)$")
_MANIFEST = re.compile(r"^/v2/(?P<repo>.+)/manifests/(?P<ref>.+)$")
_TAGS = re.compile(r"^/v2/(?P<repo>.+)/tags/list$")


def sha(data: bytes) -> str:
    """Return the registry digest."""
    return "sha256:" + hashlib.sha256(data).hexdigest()


class FakeResponse:
    """A response as the client reads it."""

    def __init__(
        self, status: int, headers: dict[str, str] | None = None, body: bytes = b""
    ) -> None:
        """Set the parts."""
        self.status = status
        self.headers = headers or {}
        self._body = body

    async def read(self) -> bytes:
        """Return the body."""
        return self._body


class _Context:
    def __init__(self, response: FakeResponse) -> None:
        self._response = response

    async def __aenter__(self) -> FakeResponse:
        return self._response

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        return None


class FakeRegistry:
    """The registry and the session that talks to it."""

    def __init__(
        self,
        *,
        mode: str = "bearer",
        public: bool = True,
        allow_delete: bool = False,
        page_size: int = 1000,
        can_push: bool = True,
    ) -> None:
        """Create an empty registry. mode is bearer, basic or open."""
        self.mode = mode
        self.public = public
        self.allow_delete = allow_delete
        self.page_size = page_size
        self.can_push = can_push
        self.blobs: dict[str, dict[str, bytes]] = {}
        self.manifests: dict[str, dict[str, bytes]] = {}
        self.uploads: set[str] = set()
        self.requests: list[tuple[str, str, str]] = []
        self.faults: list[tuple[str, int, dict[str, str], bytes]] = []
        self.token_requests: list[dict[str, list[str]]] = []
        self.tokens: dict[str, tuple[str, list[str]]] = {}
        self._host = "registry.test"

    def repo_blobs(self, repo: str) -> dict[str, bytes]:
        """Return a repository's blobs."""
        return self.blobs.setdefault(repo, {})

    def repo_manifests(self, repo: str) -> dict[str, bytes]:
        """Return a repository's tags and digests."""
        return self.manifests.setdefault(repo, {})

    def fail(self, method: str, status: int, body: bytes = b"", **headers: str) -> None:
        """Make the next request with this method answer with a status."""
        self.faults.append((method, status, headers, body))

    def stored_bytes(self) -> bytes:
        """Return everything the registry holds, to search it for plaintext."""
        out = b""
        for repo in self.blobs.values():
            out += b"".join(repo.values())
        for repo_manifests in self.manifests.values():
            out += b"".join(repo_manifests.values())
        return out

    def request(
        self,
        method: str,
        url: str,
        *,
        headers: dict[str, str] | None = None,
        data: bytes | None = None,
        allow_redirects: bool = False,
        timeout: Any = None,
    ) -> _Context:
        """Answer one request like a registry."""
        headers = {k.lower(): v for k, v in (headers or {}).items()}
        parts = urlsplit(url)
        if not parts.netloc.startswith("auth."):
            self._host = parts.netloc
        auth = headers.get("authorization", "")
        kind = auth.split(" ")[0].lower() if auth else "none"
        self.requests.append((method, parts.path, kind))
        for index, (fault_method, status, fault_headers, fault_body) in enumerate(
            self.faults
        ):
            if fault_method == method:
                del self.faults[index]
                return _Context(FakeResponse(status, fault_headers, fault_body))
        return _Context(self._handle(method, parts, headers, data or b""))

    def _jwt(self, repo: str, actions: list[str]) -> str:
        payload = {"access": [{"type": "repository", "name": repo, "actions": actions}]}
        body = (
            base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
        )
        token = f"eyJhbGciOiJub25lIn0.{body}.sig{uuid.uuid4().hex}"
        self.tokens[token] = (repo, actions)
        return token

    def _token(self, parts: Any, headers: dict[str, str]) -> FakeResponse:
        query = parse_qs(parts.query)
        self.token_requests.append(query)
        scope = (query.get("scope") or [""])[0]
        _, _, rest = scope.partition(":")
        repo, _, actions_text = rest.rpartition(":")
        wanted = [a for a in actions_text.split(",") if a]
        auth = headers.get("authorization", "")
        if auth:
            raw = base64.b64decode(auth.split(" ", 1)[1]).decode()
            if raw != f"{USER}:{TOKEN}":
                return FakeResponse(401)
            granted = [a for a in wanted if a == "pull" or self.can_push]
        else:
            granted = ["pull"] if self.public and "pull" in wanted else []
        token = self._jwt(repo, granted)
        return FakeResponse(
            200, body=json.dumps({"token": token, "expires_in": 300}).encode()
        )

    def _allowed(self, headers: dict[str, str], repo: str, action: str) -> bool:
        if self.mode == "open":
            return True
        auth = headers.get("authorization", "")
        if self.mode == "basic":
            if auth == "Basic " + base64.b64encode(f"{USER}:{TOKEN}".encode()).decode():
                return True
            return action == "pull" and self.public
        if auth.startswith("Bearer "):
            granted = self.tokens.get(auth[7:])
            return bool(granted and granted[0] == repo and action in granted[1])
        return False

    def _challenge(self, repo: str | None, actions: str) -> FakeResponse:
        if self.mode == "basic":
            return FakeResponse(401, {"www-authenticate": 'Basic realm="registry"'})
        domain = ".".join(self._host.split(".")[-2:])
        header = f'Bearer realm="https://auth.{domain}/token",service="{SERVICE}"'
        if repo:
            header += f',scope="repository:{repo}:{actions}"'
        return FakeResponse(401, {"www-authenticate": header})

    def _handle(
        self, method: str, parts: Any, headers: dict[str, str], data: bytes
    ) -> FakeResponse:
        path = unquote(parts.path)
        if parts.netloc.startswith("auth.") and parts.path == "/token":
            return self._token(parts, headers)
        if path == "/v2/":
            if self.mode == "open":
                return FakeResponse(200)
            if self.mode == "basic":
                if self._allowed(headers, "", "push"):
                    return FakeResponse(200)
                return self._challenge(None, "")
            return self._challenge(None, "")
        if match := _UPLOADS.match(path):
            return self._uploads(method, match, parts, headers, data)
        if match := _BLOB.match(path):
            return self._blob(method, match, headers)
        if match := _MANIFEST.match(path):
            return self._manifest(method, match, headers, data)
        if match := _TAGS.match(path):
            return self._tags(match, parts, headers)
        return FakeResponse(404)

    def _need(
        self, headers: dict[str, str], repo: str, actions: str
    ) -> FakeResponse | None:
        if all(self._allowed(headers, repo, action) for action in actions.split(",")):
            return None
        return self._challenge(repo, actions)

    def _uploads(
        self, method: str, match: Any, parts: Any, headers: dict[str, str], data: bytes
    ) -> FakeResponse:
        repo = match["repo"]
        if denied := self._need(headers, repo, "pull,push"):
            return denied
        if method == "POST":
            upload = uuid.uuid4().hex
            self.uploads.add(upload)
            return FakeResponse(202, {"location": f"/v2/{repo}/blobs/uploads/{upload}"})
        if method == "PUT" and match["id"] in self.uploads:
            digest = parse_qs(parts.query).get("digest", [""])[0]
            if sha(data) != digest:
                return FakeResponse(400)
            self.repo_blobs(repo)[digest] = data
            self.uploads.discard(match["id"])
            return FakeResponse(201)
        return FakeResponse(404)

    def _blob(self, method: str, match: Any, headers: dict[str, str]) -> FakeResponse:
        repo, digest = match["repo"], match["digest"]
        if denied := self._need(headers, repo, "pull"):
            return denied
        blob = self.repo_blobs(repo).get(digest)
        if blob is None:
            return FakeResponse(404)
        if method == "HEAD":
            return FakeResponse(200, {"content-length": str(len(blob))})
        wanted = re.match(r"bytes=(\d+)-(\d+)", headers.get("range", ""))
        if wanted:
            first, last = int(wanted[1]), int(wanted[2])
            return FakeResponse(206, body=blob[first : last + 1])
        return FakeResponse(200, body=blob)

    def _manifest(
        self, method: str, match: Any, headers: dict[str, str], data: bytes
    ) -> FakeResponse:
        repo, ref = match["repo"], match["ref"]
        manifests = self.repo_manifests(repo)
        if method == "PUT":
            if denied := self._need(headers, repo, "pull,push"):
                return denied
            body = json.loads(data)
            needed = [
                body["config"]["digest"],
                *(item["digest"] for item in body["layers"]),
            ]
            if any(digest not in self.repo_blobs(repo) for digest in needed):
                return FakeResponse(400)
            manifests[ref] = data
            manifests[sha(data)] = data
            return FakeResponse(201, {"docker-content-digest": sha(data)})
        if method == "DELETE":
            if denied := self._need(headers, repo, "pull,push"):
                return denied
            if not self.allow_delete:
                return FakeResponse(405)
            body_bytes = manifests.get(ref)
            if body_bytes is None:
                return FakeResponse(404)
            for key in [k for k, v in manifests.items() if v == body_bytes]:
                del manifests[key]
            return FakeResponse(202)
        if denied := self._need(headers, repo, "pull"):
            return denied
        stored = manifests.get(ref)
        if stored is None:
            return FakeResponse(404)
        response_headers = {"docker-content-digest": sha(stored)}
        return FakeResponse(200, response_headers, b"" if method == "HEAD" else stored)

    def _tags(self, match: Any, parts: Any, headers: dict[str, str]) -> FakeResponse:
        repo = match["repo"]
        if denied := self._need(headers, repo, "pull"):
            return denied
        tags = sorted(
            k for k in self.repo_manifests(repo) if not k.startswith("sha256:")
        )
        query = parse_qs(parts.query)
        start = int((query.get("last") or ["0"])[0])
        page = tags[start : start + self.page_size]
        response_headers: dict[str, str] = {}
        if start + self.page_size < len(tags):
            nxt = f"/v2/{quote(repo)}/tags/list?n={self.page_size}&last={start + self.page_size}"
            response_headers["link"] = f'<{nxt}>; rel="next"'
        return FakeResponse(
            200, response_headers, json.dumps({"name": repo, "tags": page}).encode()
        )
