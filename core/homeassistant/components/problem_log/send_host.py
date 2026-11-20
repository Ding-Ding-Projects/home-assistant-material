"""Talk to the Git host (GitHub) for sending the problem log.

Only what a send needs: the device sign-in, the repository's visibility and
write permission, the current revision of the branch, and one new commit.
Nothing that the repository contains is read. The sign-in is never put into
an exception, a log line or a return value.
"""

import base64
from dataclasses import dataclass
import time
from typing import Any

import aiohttp

from .send_files import is_problem_log_readme

API = "https://api.github.com"
WEB = "https://github.com"
DEVICE_SCOPE = "repo"
TIMEOUT = aiohttp.ClientTimeout(total=30)
USER_AGENT = "HomeAssistantMaterial-ProblemLog"

ERROR_TOKEN_REFUSED = "token_refused"
ERROR_REPOSITORY_MISSING = "repository_missing"
ERROR_NO_WRITE = "no_write"
ERROR_UNREACHABLE = "unreachable"
ERROR_RATE_LIMITED = "rate_limited"
ERROR_HOST = "host_error"
ERROR_MISSING_SCOPE = "missing_scope"
ERROR_NAME_TAKEN = "name_taken"

# Repositories read for the list the owner chooses from, at most.
LIST_LIMIT = 500
LIST_PAGE = 100
# A README larger than this is not read when looking for the marker.
README_LIMIT = 65536
# Where the files go in a repository that already holds other files.
FOLDER = "problem-log/"

DEVICE_PENDING = "pending"
DEVICE_SLOW_DOWN = "slow_down"
DEVICE_EXPIRED = "expired"
DEVICE_DENIED = "denied"
DEVICE_APPROVED = "approved"


class HostError(Exception):
    """The host refused or could not be reached. Carries a code, never a secret."""

    def __init__(self, code: str, retry_after: float | None = None) -> None:
        """Initialize with a plain code."""
        super().__init__(code)
        self.code = code
        self.retry_after = retry_after


@dataclass(frozen=True)
class RepositoryInfo:
    """What the host says about a repository."""

    private: bool
    visibility: str
    can_push: bool
    default_branch: str


@dataclass(frozen=True)
class RepositoryEntry:
    """One repository in the list the owner chooses from."""

    owner: str
    name: str
    private: bool
    visibility: str
    can_push: bool
    has_files: bool
    owner_is_organization: bool
    pushed_at: str | None

    @property
    def full_name(self) -> str:
        """Return "owner/name"."""
        return f"{self.owner}/{self.name}"


@dataclass(frozen=True)
class RepositoryList:
    """The owner's repositories, and whether the list was cut short."""

    entries: list[RepositoryEntry]
    truncated: bool
    missing_scope: bool


@dataclass(frozen=True)
class DeviceCode:
    """The start of a device sign-in."""

    device_code: str
    user_code: str
    verification_uri: str
    expires_in: int
    interval: int


@dataclass(frozen=True)
class DevicePoll:
    """One answer while waiting for the owner to approve."""

    state: str
    token: str | None = None
    interval: int | None = None


def _retry_after(response: aiohttp.ClientResponse) -> float | None:
    if (value := response.headers.get("Retry-After")) is not None:
        try:
            return max(float(value), 1.0)
        except ValueError:
            return 60.0
    if response.headers.get("X-RateLimit-Remaining") == "0":
        try:
            return max(float(response.headers["X-RateLimit-Reset"]) - time.time(), 1.0)
        except KeyError, ValueError:
            return 60.0
    return None


def _entry(item: object) -> RepositoryEntry | None:
    """Read one repository from the host's list, or None if it is malformed."""
    if not isinstance(item, dict):
        return None
    owner = item.get("owner")
    if (
        not isinstance(owner, dict)
        or not isinstance(owner.get("login"), str)
        or not isinstance(item.get("name"), str)
        or not isinstance(item.get("private"), bool)
    ):
        return None
    permissions = item.get("permissions")
    pushed = item.get("pushed_at")
    return RepositoryEntry(
        owner=owner["login"],
        name=item["name"],
        private=item["private"],
        visibility=str(item.get("visibility", "")),
        can_push=isinstance(permissions, dict) and bool(permissions.get("push")),
        has_files=bool(item.get("size")),
        owner_is_organization=owner.get("type") == "Organization",
        pushed_at=pushed if isinstance(pushed, str) else None,
    )


def _says_name_taken(body: object) -> bool:
    """Return True if a refusal says the repository name is in use."""
    if not isinstance(body, dict):
        return False
    errors = body.get("errors")
    texts = [str(body.get("message", ""))]
    if isinstance(errors, list):
        texts.extend(
            str(error.get("message", "")) for error in errors if isinstance(error, dict)
        )
    return any("already exists" in text for text in texts)


class GitHubHost:
    """A small GitHub client. Tests replace it with a pretend host."""

    def __init__(
        self, session: aiohttp.ClientSession, api: str = API, web: str = WEB
    ) -> None:
        """Initialize."""
        self._session = session
        self._api = api
        self._web = web
        # The scopes a classic token or code sign-in reported on its last
        # answer; None when the host did not say (as for fine-grained tokens).
        self.scopes: set[str] | None = None

    async def _request(
        self,
        method: str,
        url: str,
        token: str | None,
        payload: dict[str, Any] | None = None,
        form: dict[str, str] | None = None,
    ) -> tuple[int, Any]:
        headers = {
            "Accept": "application/vnd.github+json"
            if form is None
            else "application/json",
            "User-Agent": USER_AGENT,
            "X-GitHub-Api-Version": "2022-11-28",
        }
        if token:
            headers["Authorization"] = f"Bearer {token}"
        try:
            async with self._session.request(
                method,
                url,
                headers=headers,
                json=payload,
                data=form,
                timeout=TIMEOUT,
                allow_redirects=False,
            ) as response:
                status = response.status
                if token and (scopes := response.headers.get("X-OAuth-Scopes")) is not None:
                    self.scopes = {
                        part.strip() for part in scopes.split(",") if part.strip()
                    }
                retry = _retry_after(response) if status in (403, 429) else None
                try:
                    body = await response.json(content_type=None)
                except ValueError:
                    body = None
        except aiohttp.ClientError, TimeoutError:
            raise HostError(ERROR_UNREACHABLE) from None
        if retry is not None or status == 429:
            raise HostError(ERROR_RATE_LIMITED, retry or 60.0)
        return status, body

    @staticmethod
    def _raise_for(status: int, missing: str = ERROR_REPOSITORY_MISSING) -> None:
        if status == 401:
            raise HostError(ERROR_TOKEN_REFUSED)
        if status == 403:
            raise HostError(ERROR_NO_WRITE)
        if status == 404:
            raise HostError(missing)
        if status >= 500:
            raise HostError(ERROR_UNREACHABLE)
        if status >= 400:
            raise HostError(ERROR_HOST)

    async def device_code(self, client_id: str) -> DeviceCode:
        """Start a device sign-in."""
        status, body = await self._request(
            "POST",
            f"{self._web}/login/device/code",
            None,
            form={"client_id": client_id, "scope": DEVICE_SCOPE},
        )
        self._raise_for(status, ERROR_HOST)
        if not isinstance(body, dict) or "device_code" not in body:
            raise HostError(ERROR_HOST)
        return DeviceCode(
            device_code=str(body["device_code"]),
            user_code=str(body["user_code"]),
            verification_uri=str(
                body.get("verification_uri", f"{self._web}/login/device")
            ),
            expires_in=int(body.get("expires_in", 900)),
            interval=int(body.get("interval", 5)),
        )

    async def device_poll(self, client_id: str, device_code: str) -> DevicePoll:
        """Ask once whether the owner approved the device sign-in."""
        status, body = await self._request(
            "POST",
            f"{self._web}/login/oauth/access_token",
            None,
            form={
                "client_id": client_id,
                "device_code": device_code,
                "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
            },
        )
        self._raise_for(status, ERROR_HOST)
        if not isinstance(body, dict):
            raise HostError(ERROR_HOST)
        if token := body.get("access_token"):
            return DevicePoll(DEVICE_APPROVED, token=str(token))
        error = body.get("error")
        if error == "authorization_pending":
            return DevicePoll(DEVICE_PENDING)
        if error == "slow_down":
            interval = body.get("interval")
            return DevicePoll(
                DEVICE_SLOW_DOWN, interval=int(interval) if interval else None
            )
        if error == "expired_token":
            return DevicePoll(DEVICE_EXPIRED)
        if error == "access_denied":
            return DevicePoll(DEVICE_DENIED)
        raise HostError(ERROR_HOST)

    async def repository(self, owner: str, name: str, token: str) -> RepositoryInfo:
        """Read the repository's visibility and whether this sign-in can write."""
        status, body = await self._request(
            "GET", f"{self._api}/repos/{owner}/{name}", token
        )
        self._raise_for(status)
        if not isinstance(body, dict) or not isinstance(body.get("private"), bool):
            raise HostError(ERROR_HOST)
        permissions = body.get("permissions")
        can_push = isinstance(permissions, dict) and bool(permissions.get("push"))
        return RepositoryInfo(
            private=body["private"],
            visibility=str(body.get("visibility", "")),
            can_push=can_push,
            default_branch=str(body.get("default_branch") or "main"),
        )

    def missing_repo_scope(self) -> bool:
        """Return True if the host said this sign-in lacks the "repo" scope."""
        return self.scopes is not None and "repo" not in self.scopes

    async def list_repositories(self, token: str) -> RepositoryList:
        """Read the repositories this sign-in owns or reaches as an organization member."""
        entries: list[RepositoryEntry] = []
        truncated = False
        page = 1
        while True:
            status, body = await self._request(
                "GET",
                f"{self._api}/user/repos?affiliation=owner,organization_member"
                f"&sort=pushed&per_page={LIST_PAGE}&page={page}",
                token,
            )
            self._raise_for(status, ERROR_HOST)
            if not isinstance(body, list):
                raise HostError(ERROR_HOST)
            for item in body:
                if (entry := _entry(item)) is not None:
                    entries.append(entry)
            if len(body) < LIST_PAGE:
                break
            if len(entries) >= LIST_LIMIT:
                truncated = True
                break
            page += 1
        return RepositoryList(
            entries[:LIST_LIMIT],
            truncated or len(entries) > LIST_LIMIT,
            self.missing_repo_scope(),
        )

    async def create_repository(
        self, token: str, name: str, description: str, organization: str | None
    ) -> str:
        """Make a new private repository with no files; return its owner."""
        url = (
            f"{self._api}/orgs/{organization}/repos"
            if organization
            else f"{self._api}/user/repos"
        )
        status, body = await self._request(
            "POST",
            url,
            token,
            payload={
                "name": name,
                "private": True,
                "description": description,
                "auto_init": False,
                "has_issues": False,
                "has_wiki": False,
                "has_projects": False,
            },
        )
        if status == 422 and _says_name_taken(body):
            raise HostError(ERROR_NAME_TAKEN)
        if status == 401:
            raise HostError(ERROR_TOKEN_REFUSED)
        if status in (403, 404) or (status >= 400 and self.missing_repo_scope()):
            raise HostError(ERROR_MISSING_SCOPE)
        self._raise_for(status, ERROR_HOST)
        try:
            return str(body["owner"]["login"])
        except KeyError, TypeError:
            raise HostError(ERROR_HOST) from None

    async def layout(self, owner: str, name: str, token: str, branch: str) -> str:
        """Return where the files go: the root, or a folder of their own.

        An empty repository, or one whose README was written by this feature,
        gets the files at its root. Any other repository keeps its own files
        and gets the problem log in `FOLDER`. The README is only searched for
        the marker; nothing it says is acted on.
        """
        if await self._head(owner, name, token, branch) is None:
            return ""
        status, body = await self._request(
            "GET",
            f"{self._api}/repos/{owner}/{name}/contents/README.md?ref={branch}",
            token,
        )
        if status == 404:
            return FOLDER
        self._raise_for(status)
        if (
            isinstance(body, dict)
            and body.get("encoding") == "base64"
            and isinstance(body.get("content"), str)
            and int(body.get("size") or 0) <= README_LIMIT
        ):
            try:
                text = base64.b64decode(body["content"]).decode("utf-8", "replace")
            except ValueError:
                return FOLDER
            if is_problem_log_readme(text):
                return ""
        return FOLDER

    async def _head(self, owner: str, name: str, token: str, branch: str) -> str | None:
        status, body = await self._request(
            "GET", f"{self._api}/repos/{owner}/{name}/git/ref/heads/{branch}", token
        )
        if status in (404, 409):
            return None
        self._raise_for(status)
        try:
            return str(body["object"]["sha"])
        except KeyError, TypeError:
            raise HostError(ERROR_HOST) from None

    async def commit(
        self,
        owner: str,
        name: str,
        token: str,
        branch: str,
        files: dict[str, str],
        message: str,
    ) -> str:
        """Write the files as one commit on the branch and return its id."""
        base = f"{self._api}/repos/{owner}/{name}"
        head = await self._head(owner, name, token, branch)
        if head is None:
            # An empty repository has no branch to build on; the contents
            # endpoint makes its first commit, the rest follows as usual.
            readme = min(
                (path for path in files if path.endswith("README.md")), key=len
            )
            status, _ = await self._request(
                "PUT",
                f"{base}/contents/{readme}",
                token,
                payload={
                    "message": "Start the problem log",
                    "content": base64.b64encode(files[readme].encode()).decode(),
                    "branch": branch,
                },
            )
            self._raise_for(status)
            head = await self._head(owner, name, token, branch)
            if head is None:
                raise HostError(ERROR_HOST)
        status, body = await self._request("GET", f"{base}/git/commits/{head}", token)
        self._raise_for(status)
        try:
            base_tree = str(body["tree"]["sha"])
        except KeyError, TypeError:
            raise HostError(ERROR_HOST) from None
        tree = [
            {"path": path, "mode": "100644", "type": "blob", "content": text}
            for path, text in sorted(files.items())
        ]
        status, body = await self._request(
            "POST",
            f"{base}/git/trees",
            token,
            payload={"base_tree": base_tree, "tree": tree},
        )
        self._raise_for(status)
        tree_sha = str((body or {}).get("sha", ""))
        status, body = await self._request(
            "POST",
            f"{base}/git/commits",
            token,
            payload={"message": message, "tree": tree_sha, "parents": [head]},
        )
        self._raise_for(status)
        commit_sha = str((body or {}).get("sha", ""))
        status, _ = await self._request(
            "PATCH",
            f"{base}/git/refs/heads/{branch}",
            token,
            payload={"sha": commit_sha, "force": False},
        )
        self._raise_for(status)
        return commit_sha
