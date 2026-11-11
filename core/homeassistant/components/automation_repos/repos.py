"""Git repositories for automations.

Every automation gets its own repository. All of them sit inside one master
repository, which records the commit each automation is at. One push commits
every automation repository that changed, then the master.

Layout under the storage folder:

    automations/<name>/.git           one repository per automation
    automations/<name>/automation.yaml
    manifest.json                     which commit each automation is at
    snapshots/<name>.yaml             a copy of each automation, so the master
                                      alone can bring every automation back

This module does not import Home Assistant, so it can be tested on its own.
Every function blocks; callers run them in an executor.
"""

import calendar
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import threading
import time
from typing import Any

import yaml

GIT_TIMEOUT = 30
REMOTE_TIMEOUT = 60
PUSH_TOTAL_LIMIT = 300
ARCHIVE_SETTLE_SECONDS = 15.0
FORGETTING_PREFIX = ".forgetting-"
HISTORY_LIMIT = 500
DIFF_LIMIT = 200_000
MESSAGE_LIMIT = 500
SIZE_LIMIT = 2_000_000

AUTOMATION_FILE = "automation.yaml"
MANIFEST_FILE = "manifest.json"
REMOVED_DIR = "_removed"

# Every pattern is used with fullmatch: `$` would also match before a trailing
# newline.
_SAFE_NAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}")
_SHA = re.compile(r"[0-9a-f]{7,40}")
_FULL_SHA = re.compile(r"[0-9a-f]{40}")
_ARCHIVE_NAME = re.compile(
    r"(?P<name>[A-Za-z0-9][A-Za-z0-9_-]{0,63})-(?P<stamp>[0-9]{8}T[0-9]{6})"
    r"(?:-(?P<number>[0-9]+))?"
)

REMOTE_LIMIT = 500
_HOST = r"[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?"
_PATH = r"/[A-Za-z0-9._~%+/-]*"
_REMOTE_URL = re.compile(rf"(?:https|ssh)://{_HOST}(?::[0-9]{{1,5}})?{_PATH}")
_REMOTE_SCP = re.compile(rf"git@{_HOST}:[A-Za-z0-9._~%+/][A-Za-z0-9._~%+/-]*")
# A bare local path may only be one that was stored before the rules tightened.
_REMOTE_LEGACY_LOCAL = re.compile(r"/[A-Za-z0-9._~%+/-]+")
_URL_USERINFO = re.compile(r"([A-Za-z][A-Za-z0-9+.-]*://)[^\s/'\"]*@")

REMOTE_RULE = (
    "Use an address like https://host/path.git, ssh://host/path.git or "
    "git@host:path.git, with no user name, password, token, query or fragment "
    "in it."
)

LOCAL_RULE = (
    "That address leads to this machine or to a link-local address, such as "
    "localhost, 127.0.0.1 or 169.254.169.254. Use the address of a remote "
    "server."
)


class RepositoryError(Exception):
    """A Git operation failed. The message is safe to show."""


def _is_local_host(url: str) -> bool:
    """Return True when the host of a matched address is on this machine.

    Loopback, link-local (which holds the cloud metadata address) and
    unspecified addresses are refused, and so is `localhost`. A host made of
    digits and dots must be a plain dotted address, and a hexadecimal host is
    refused, because other spellings of the same address are still understood
    when the connection is made.
    """
    if url.startswith("git@"):
        host = url[4:].split(":", 1)[0]
    else:
        host = url.split("://", 1)[1].split("/", 1)[0].split(":", 1)[0]
    host = host.lower().rstrip(".")
    if host == "localhost" or host.endswith(".localhost"):
        return True
    if any(label.startswith("0x") for label in host.split(".")):
        return True
    if re.fullmatch(r"[0-9.]+", host):
        try:
            address = ipaddress.ip_address(host)
        except ValueError:
            return True
        return (
            address.is_loopback
            or address.is_link_local
            or address.is_unspecified
            or address.is_multicast
        )
    return False


def check_remote(url: str) -> str:
    """Return a remote address that holds no credentials, or refuse it."""
    url = url.strip()
    if len(url) > REMOTE_LIMIT or not (
        _REMOTE_URL.fullmatch(url) or _REMOTE_SCP.fullmatch(url)
    ):
        raise RepositoryError(REMOTE_RULE)
    if _is_local_host(url):
        raise RepositoryError(LOCAL_RULE)
    return url


def is_stored_remote_usable(url: str) -> bool:
    """Return True when an address read back from a repository may be used."""
    if len(url) > REMOTE_LIMIT:
        return False
    if _REMOTE_URL.fullmatch(url) or _REMOTE_SCP.fullmatch(url):
        return not _is_local_host(url)
    return bool(_REMOTE_LEGACY_LOCAL.fullmatch(url))


def mask_text(text: str, address: str | None = None) -> str:
    """Remove an address, and any user info before a host, from a message."""
    if address:
        text = text.replace(address, "the remote")
    return _URL_USERINFO.sub(r"\1", text)


@dataclass
class CommitInfo:
    """One commit of an automation."""

    sha: str
    message: str
    author: str
    timestamp: int

    def as_dict(self) -> dict[str, Any]:
        """Return the commit as plain data."""
        return {
            "sha": self.sha,
            "short": self.sha[:7],
            "message": self.message,
            "author": self.author,
            "timestamp": self.timestamp,
        }


@dataclass
class PushResult:
    """What one push did."""

    committed: list[dict[str, str]] = field(default_factory=list)
    unchanged: int = 0
    skipped: list[dict[str, str]] = field(default_factory=list)
    master_commit: str | None = None
    pushed: list[str] = field(default_factory=list)
    push_errors: list[dict[str, str]] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        """Return the result as plain data."""
        return {
            "committed": self.committed,
            "unchanged": self.unchanged,
            "skipped": self.skipped,
            "master_commit": self.master_commit,
            "pushed": self.pushed,
            "push_errors": self.push_errors,
        }


def repository_name(automation_id: str) -> str:
    """Return the folder name for an automation.

    An id made of plain characters is used as it is. Anything else becomes a
    hash, so an id can never point outside the storage folder.
    """
    if _SAFE_NAME.fullmatch(automation_id):
        return automation_id
    return "id-" + hashlib.sha256(automation_id.encode()).hexdigest()[:24]


def plain(value: Any) -> Any:
    """Return a value as plain data.

    Configuration read by Home Assistant uses its own text, list and mapping
    types, which carry where each value came from. They are written out as
    the plain values they stand for.
    """
    if isinstance(value, Mapping):
        return {plain(key): plain(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [plain(item) for item in value]
    if isinstance(value, bool) or value is None:
        return value
    if isinstance(value, str):
        return str(value)
    if isinstance(value, int):
        return int(value)
    if isinstance(value, float):
        return float(value)
    return str(value)


def dump_automation(config: Mapping[str, Any]) -> str:
    """Write an automation as YAML, the same way every time."""
    return yaml.safe_dump(
        plain(config), sort_keys=False, allow_unicode=True, default_flow_style=False
    )


def dump_checked(config: Mapping[str, Any]) -> str:
    """Write an automation as YAML, refusing one too large to keep."""
    text = dump_automation(config)
    if len(text.encode()) > SIZE_LIMIT:
        raise RepositoryError("That automation is too large to keep a history of.")
    return text


def load_automation(text: str) -> dict[str, Any]:
    """Read an automation back from YAML."""
    if len(text) > SIZE_LIMIT:
        raise RepositoryError("That version is too large to read.")
    data = yaml.safe_load(text)
    if not isinstance(data, dict):
        raise RepositoryError("That version does not hold an automation.")
    return data


def clean_message(message: str | None, fallback: str) -> str:
    """Return a commit message of one sane line."""
    text = " ".join((message or "").split())
    return (text or fallback)[:MESSAGE_LIMIT]


def _make_writable(function: Any, path: str, _error: BaseException) -> None:
    """Let a delete retry a read-only file, as Git leaves on some systems."""
    os.chmod(path, 0o700)
    function(path)


def remove_tree(path: Path, ignore_errors: bool = False) -> None:
    """Delete a folder, including the read-only files Git writes."""
    if not ignore_errors:
        shutil.rmtree(path, onexc=_make_writable)
        return

    def retry(function: Any, failed: str, error: BaseException) -> None:
        try:
            _make_writable(function, failed, error)
        except OSError:
            pass

    shutil.rmtree(path, onexc=retry)


def file_signature(path: str | Path) -> tuple[int, int] | None:
    """Return the size and modification time of a file, or None when it is missing."""
    try:
        stat = os.stat(path)
    except OSError:
        return None
    return stat.st_size, stat.st_mtime_ns


class ArchiveGuard:
    """Decide whether a file that lists nothing may archive any history.

    A missing, empty or id-less automations file usually means a save is in
    progress, not that every automation was deleted. Nothing is archived on
    that evidence until a later pass, at least `settle` seconds after the
    first, sees the same file state unchanged.
    """

    def __init__(self, settle: float = ARCHIVE_SETTLE_SECONDS) -> None:
        """Start with nothing observed."""
        self.settle = settle
        self._seen: tuple[tuple[int, int] | None, float] | None = None

    def allow(
        self, empty: bool, signature: tuple[int, int] | None, now: float
    ) -> bool:
        """Return True when archiving on this reading is safe."""
        if not empty:
            self._seen = None
            return True
        if self._seen is None or self._seen[0] != signature:
            self._seen = (signature, now)
            return False
        return now - self._seen[1] >= self.settle


class AutomationRepositories:
    """All automation repositories and their master."""

    def __init__(
        self,
        root: Path,
        author_name: str = "Home Assistant",
        author_email: str = "homeassistant@localhost",
        ssh_dir: Path | None = None,
    ) -> None:
        """Set where the repositories live and who commits.

        `ssh_dir`, when given, is a folder outside the repositories that holds
        the SSH key and known hosts used for every SSH remote.
        """
        self.root = Path(root)
        self._ssh_dir = Path(ssh_dir) if ssh_dir is not None else None
        self._author_name = author_name
        self._author_email = author_email
        self.recorded: dict[str, str] = {}
        self.deferred_archives = 0
        self._counts: dict[str, tuple[str, int]] = {}
        self._remotes: dict[str, tuple[int, tuple[str | None, bool]]] = {}
        self._remote_locks: dict[str, threading.Lock] = {}
        self._locks_guard = threading.Lock()

    def _remote_lock(self, label: str) -> threading.Lock:
        with self._locks_guard:
            return self._remote_locks.setdefault(label, threading.Lock())

    @staticmethod
    def _digest(text: str) -> str:
        return hashlib.sha256(text.encode()).hexdigest()

    @staticmethod
    def _fast_head(path: Path) -> str | None:
        """Read the current commit from the repository files, without Git."""
        git_dir = path / ".git"
        try:
            head = (git_dir / "HEAD").read_text(encoding="utf-8").strip()
            if not head.startswith("ref: "):
                return head if _FULL_SHA.fullmatch(head) else None
            ref = head[5:]
            try:
                value = (git_dir / ref).read_text(encoding="utf-8").strip()
            except FileNotFoundError:
                value = ""
                for line in (git_dir / "packed-refs").read_text(
                    encoding="utf-8"
                ).splitlines():
                    if line.endswith(" " + ref):
                        value = line.split(" ", 1)[0]
        except OSError:
            return None
        return value if _FULL_SHA.fullmatch(value) else None

    def _ssh_command(self) -> str:
        base = "ssh -o BatchMode=yes -o ConnectTimeout=15"
        if self._ssh_dir is None:
            return base
        key = next(
            (
                self._ssh_dir / name
                for name in ("id_ed25519", "id_ecdsa", "id_rsa")
                if (self._ssh_dir / name).is_file()
            ),
            self._ssh_dir / "id_ed25519",
        )
        options = [
            "-F",
            os.devnull,
            "-i",
            str(key),
            "-o",
            "IdentitiesOnly=yes",
            "-o",
            f"UserKnownHostsFile={self._ssh_dir / 'known_hosts'}",
            "-o",
            "StrictHostKeyChecking=yes",
        ]
        return base + " " + " ".join(shlex.quote(option) for option in options)

    def _git(
        self, cwd: Path, *args: str, timeout: int = GIT_TIMEOUT, check: bool = True
    ) -> subprocess.CompletedProcess[str]:
        env = {
            "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
            "HOME": str(self.root),
            "LANG": "C.UTF-8",
            # Never wait for a password, never read the machine's own settings.
            "GIT_TERMINAL_PROMPT": "0",
            "GIT_CONFIG_NOSYSTEM": "1",
            "GIT_CONFIG_GLOBAL": os.devnull,
            "GIT_SSH_COMMAND": self._ssh_command(),
        }
        command = [
            "git",
            "-c",
            f"user.name={self._author_name}",
            "-c",
            f"user.email={self._author_email}",
            "-c",
            "core.hooksPath=" + os.devnull,
            "-c",
            "commit.gpgsign=false",
            "-c",
            "core.quotepath=false",
            *args,
        ]
        try:
            result = subprocess.run(
                command,
                cwd=cwd,
                env=env,
                capture_output=True,
                text=True,
                timeout=timeout,
                check=False,
            )
        except FileNotFoundError as err:
            raise RepositoryError("Git is not installed on this system.") from err
        except subprocess.TimeoutExpired as err:
            raise RepositoryError(
                f"Git did not answer within {timeout} seconds."
            ) from err
        if check and result.returncode != 0:
            detail = (result.stderr or result.stdout).strip().splitlines()
            raise RepositoryError(detail[-1] if detail else "Git reported an error.")
        return result

    def _ensure_repository(self, path: Path) -> None:
        path.mkdir(parents=True, exist_ok=True)
        if not (path / ".git").exists():
            self._git(path, "init", "--quiet", "--initial-branch=main")

    def _head(self, path: Path) -> str | None:
        if not (path / ".git").exists():
            return None
        result = self._git(
            path, "rev-parse", "--verify", "--quiet", "HEAD", check=False
        )
        return result.stdout.strip() or None

    def _commit_if_changed(self, path: Path, message: str) -> str | None:
        self._git(path, "add", "--all")
        if self._git(path, "status", "--porcelain").stdout.strip() == "":
            return None
        self._git(path, "commit", "--quiet", "-m", message)
        return self._head(path)

    @property
    def _automations(self) -> Path:
        return self.root / "automations"

    def _path(self, automation_id: str) -> Path:
        return self._automations / repository_name(automation_id)

    def _check_sha(self, sha: str) -> str:
        if not _SHA.fullmatch(sha):
            raise RepositoryError("That is not a commit.")
        return sha

    def is_dirty(self, automation_id: str, config: dict[str, Any]) -> bool:
        """Return True when the automation differs from its last commit."""
        path = self._path(automation_id)
        name = repository_name(automation_id)
        try:
            text = dump_checked(config)
        except RepositoryError:
            return True
        digest = self._digest(text)
        if self.recorded.get(name) == digest and (path / ".git").exists():
            return False
        head = self._head(path)
        if head is None:
            return True
        committed = self._git(
            path, "show", f"{head}:{AUTOMATION_FILE}", check=False
        ).stdout
        if committed != text:
            return True
        self.recorded[name] = digest
        return False

    def snapshot(
        self,
        automation_id: str,
        config: dict[str, Any],
        message: str | None = None,
        use_cache: bool = True,
    ) -> str | None:
        """Commit an automation if it changed. Return the new commit.

        An automation whose text is the one last recorded is skipped without
        starting Git, unless `use_cache` is False.
        """
        text = dump_checked(config)
        digest = self._digest(text)
        name = repository_name(automation_id)
        path = self._path(automation_id)
        if use_cache and self.recorded.get(name) == digest and (path / ".git").exists():
            return None
        self._ensure_repository(path)
        fallback = self._describe_change(path, config, automation_id)
        (path / AUTOMATION_FILE).write_text(text, encoding="utf-8")
        commit = self._commit_if_changed(path, clean_message(message, fallback))
        self.recorded[name] = digest
        return commit

    def _describe_change(
        self, path: Path, config: Mapping[str, Any], automation_id: str
    ) -> str:
        """Return a commit message that names the parts that changed."""
        alias = str(config.get("alias") or automation_id)
        head = self._head(path)
        if head is None:
            return f"Create {alias}"
        shown = self._git(path, "show", f"{head}:{AUTOMATION_FILE}", check=False)
        try:
            previous = load_automation(shown.stdout)
        except RepositoryError, yaml.YAMLError:
            return f"Update {alias}"
        current = plain(config)
        changed = sorted(
            key
            for key in set(previous) | set(current)
            if previous.get(key) != current.get(key)
        )
        if not changed:
            return f"Update {alias}"
        return f"{alias}: change {', '.join(changed)}"

    def history(self, automation_id: str, limit: int = 100) -> list[CommitInfo]:
        """Return the commits of an automation, newest first."""
        path = self._path(automation_id)
        if self._head(path) is None:
            return []
        limit = max(1, min(limit, HISTORY_LIMIT))
        result = self._git(
            path,
            "log",
            f"--max-count={limit}",
            "--format=%H%x1f%an%x1f%at%x1f%s%x1e",
        )
        commits = []
        for record in result.stdout.split("\x1e"):
            parts = record.strip().split("\x1f")
            if len(parts) == 4:
                commits.append(
                    CommitInfo(
                        sha=parts[0],
                        author=parts[1],
                        timestamp=int(parts[2]),
                        message=parts[3],
                    )
                )
        return commits

    def version(self, automation_id: str, sha: str) -> dict[str, Any]:
        """Return the automation as it was at a commit."""
        path = self._path(automation_id)
        result = self._git(path, "show", f"{self._check_sha(sha)}:{AUTOMATION_FILE}")
        return plain(load_automation(result.stdout))

    def diff(self, automation_id: str, old: str, new: str | None = None) -> str:
        """Return the difference between two commits, or a commit and now."""
        path = self._path(automation_id)
        args = ["diff", "--no-color", self._check_sha(old)]
        if new is not None:
            args.append(self._check_sha(new))
        args += ["--", AUTOMATION_FILE]
        return self._git(path, *args).stdout[:DIFF_LIMIT]

    def _current_head(self, path: Path) -> str | None:
        return self._fast_head(path) or self._head(path)

    def _commit_count(self, path: Path, head: str | None) -> int:
        """Count the commits, asking Git only when the head moved."""
        if head is None:
            return 0
        key = str(path)
        cached = self._counts.get(key)
        if cached is not None and cached[0] == head:
            return cached[1]
        count = int(self._git(path, "rev-list", "--count", "HEAD").stdout or 0)
        self._counts[key] = (head, count)
        return count

    def status(
        self,
        configs: dict[str, dict[str, Any]],
        errors: Mapping[str, str] | None = None,
    ) -> dict[str, Any]:
        """Describe every automation repository and the master.

        Heads and remotes are read from the repository files and counts are
        remembered, so the usual call starts no Git process at all.
        """
        errors = errors or {}
        automations = []
        for automation_id, config in configs.items():
            path = self._path(automation_id)
            head = self._current_head(path)
            remote, unsafe = self._stored_remote(path)
            automations.append(
                {
                    "id": automation_id,
                    "alias": str(config.get("alias") or automation_id),
                    "repository": f"automations/{repository_name(automation_id)}",
                    "head": head,
                    "commits": self._commit_count(path, head),
                    "dirty": self.is_dirty(automation_id, config),
                    "remote": remote,
                    "remote_unsafe": unsafe,
                    "error": errors.get(automation_id),
                }
            )
        master_head = self._current_head(self.root)
        last = None
        if master_head is not None:
            last = int(self._git(self.root, "log", "-1", "--format=%at").stdout or 0)
        remote, unsafe = self._stored_remote(self.root)
        return {
            "automations": automations,
            "master": {
                "head": master_head,
                "last_commit": last,
                "remote": remote,
                "remote_unsafe": unsafe,
            },
        }

    def push_all(
        self,
        configs: dict[str, dict[str, Any]],
        message: str | None = None,
        only: list[str] | None = None,
        invalid: dict[str, str] | None = None,
    ) -> PushResult:
        """Commit every changed automation, then the master, then send them."""
        result = self.commit_all(configs, message, only, invalid)
        self.push_remotes(result, configs, only)
        return result

    def commit_all(
        self,
        configs: dict[str, dict[str, Any]],
        message: str | None = None,
        only: list[str] | None = None,
        invalid: dict[str, str] | None = None,
    ) -> PushResult:
        """Commit every changed automation, then the master.

        `invalid` names automations that did not load, with the reason. They
        are left out and reported, so one broken automation never blocks the
        rest. `only` limits the commits to some automations; the master is
        always committed.
        """
        result = PushResult()
        self._ensure_repository(self.root)
        (self.root / ".gitignore").write_text(
            f"automations/\n{REMOVED_DIR}/\n{FORGETTING_PREFIX}*/\n", encoding="utf-8"
        )
        snapshots = self.root / "snapshots"
        snapshots.mkdir(exist_ok=True)
        for automation_id, reason in (invalid or {}).items():
            result.skipped.append({"id": automation_id, "reason": reason})
        for automation_id, config in configs.items():
            if only is not None and automation_id not in only:
                continue
            if invalid and automation_id in invalid:
                continue
            try:
                commit = self.snapshot(automation_id, config, use_cache=False)
            except RepositoryError as err:
                result.skipped.append(
                    {"id": automation_id, "reason": mask_text(str(err))[:300]}
                )
                continue
            if commit is None:
                result.unchanged += 1
            else:
                result.committed.append({"id": automation_id, "commit": commit})

        manifest: dict[str, Any] = {"version": 1, "automations": {}}
        wanted = set()
        for automation_id, config in configs.items():
            name = repository_name(automation_id)
            head = self._head(self._path(automation_id))
            if head is None:
                continue
            wanted.add(f"{name}.yaml")
            manifest["automations"][automation_id] = {
                "alias": str(config.get("alias") or automation_id),
                "repository": f"automations/{name}",
                "commit": head,
            }
            committed = self._git(
                self._path(automation_id), "show", f"{head}:{AUTOMATION_FILE}"
            ).stdout
            (snapshots / f"{name}.yaml").write_text(committed, encoding="utf-8")
        for stale in snapshots.glob("*.yaml"):
            if stale.name not in wanted:
                stale.unlink()
        (self.root / MANIFEST_FILE).write_text(
            json.dumps(manifest, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        count = len(result.committed)
        fallback = (
            f"Update {count} automation{'s' if count != 1 else ''}"
            if count
            else "Record the automations"
        )
        result.master_commit = self._commit_if_changed(
            self.root, clean_message(message, fallback)
        )

        return result

    def push_remotes(
        self,
        result: PushResult,
        configs: Mapping[str, Any],
        only: list[str] | None = None,
        total_limit: float = PUSH_TOTAL_LIMIT,
    ) -> PushResult:
        """Send the selected repositories and the master to their remotes.

        Never forced. Each remote has its own lock, so a slow remote holds up
        nothing else, and the whole pass stops starting new pushes once
        `total_limit` seconds have passed.
        """
        targets = [
            (automation_id, self._path(automation_id))
            for automation_id in configs
            if only is None or automation_id in only
        ] + [("master", self.root)]
        deadline = time.monotonic() + total_limit
        for label, path in targets:
            address, unsafe = self._stored_remote(path)
            if unsafe:
                result.push_errors.append(
                    {
                        "id": label,
                        "error": "The address of the remote cannot be used. "
                        + REMOTE_RULE,
                    }
                )
                continue
            if address is None or self._head(path) is None:
                continue
            remaining = deadline - time.monotonic()
            if remaining <= 1:
                result.push_errors.append(
                    {"id": label, "error": "The time for this push ran out."}
                )
                continue
            lock = self._remote_lock(label)
            if not lock.acquire(timeout=min(remaining, REMOTE_TIMEOUT)):
                result.push_errors.append(
                    {"id": label, "error": "A push to this remote is still running."}
                )
                continue
            try:
                sent = self._git(
                    path,
                    "push",
                    "--quiet",
                    "origin",
                    "HEAD:refs/heads/main",
                    timeout=int(min(REMOTE_TIMEOUT, max(remaining, 1))),
                    check=False,
                )
            except RepositoryError as err:
                result.push_errors.append(
                    {"id": label, "error": mask_text(str(err), address)[:300]}
                )
                continue
            finally:
                lock.release()
            if sent.returncode == 0:
                result.pushed.append(label)
            else:
                detail = (sent.stderr or sent.stdout).strip().splitlines()
                result.push_errors.append(
                    {
                        "id": label,
                        "error": mask_text(
                            detail[-1] if detail else "Push failed.", address
                        )[:300],
                    }
                )
        return result

    def _stored_remote(self, path: Path) -> tuple[str | None, bool]:
        """Return the remote address to show, and whether one is set but unusable.

        The answer is remembered until the repository's configuration file
        changes, so listing repositories starts no Git process.
        """
        if not (path / ".git").exists():
            return None, False
        key = str(path)
        try:
            stamp = (path / ".git" / "config").stat().st_mtime_ns
        except OSError:
            stamp = -1
        cached = self._remotes.get(key)
        if cached is not None and cached[0] == stamp:
            return cached[1]
        result = self._git(path, "remote", "get-url", "origin", check=False)
        url = result.stdout.strip()
        if result.returncode != 0 or not url:
            answer: tuple[str | None, bool] = (None, False)
        elif is_stored_remote_usable(url):
            answer = (url, False)
        else:
            answer = (None, True)
        self._remotes[key] = (stamp, answer)
        return answer

    def set_remote(self, automation_id: str | None, url: str | None) -> None:
        """Set or remove the remote of one automation, or of the master."""
        path = self.root if automation_id is None else self._path(automation_id)
        self._remotes.pop(str(path), None)
        url = (url or "").strip()
        if url:
            url = check_remote(url)
        self._ensure_repository(path)
        has_remote = (
            self._git(path, "remote", "get-url", "origin", check=False).returncode == 0
        )
        if not url:
            if has_remote:
                self._git(path, "remote", "remove", "origin")
            return
        self._git(path, "remote", "set-url" if has_remote else "add", "origin", url)

    def known_automations(self) -> list[str]:
        """Return the folder names of the automations that have a repository."""
        if not self._automations.is_dir():
            return []
        return sorted(
            item.name
            for item in self._automations.iterdir()
            if item.is_dir() and not item.is_symlink()
        )

    def archive_unlisted(
        self, configs: Mapping[str, Any], keep: Iterable[str] = ()
    ) -> list[str]:
        """Move the repository of every automation that is gone out of the way.

        A new automation with the same id then starts with no history. An id
        in `keep` (for example one that is loaded right now) is never moved.
        One pass moves at most half of the known repositories, never fewer
        than one; what is left over is counted in `deferred_archives`. Return
        the names of the folders it moved to.
        """
        wanted = {repository_name(automation_id) for automation_id in configs}
        wanted |= {repository_name(str(automation_id)) for automation_id in keep}
        known = self.known_automations()
        missing = [name for name in known if name not in wanted]
        allowed = max(1, len(known) // 2)
        moved = []
        for name in missing[:allowed]:
            moved.append(self._archive(name))
        self.deferred_archives = max(0, len(missing) - allowed)
        return moved

    def archive_pass(
        self,
        configs: Mapping[str, Any],
        keep: Iterable[str],
        guard: ArchiveGuard,
        signature: tuple[int, int] | None,
        now: float,
    ) -> list[str] | None:
        """Set deleted automations aside, unless the file looks unreliable.

        Return None when the guard refuses (the file lists nothing and has not
        stayed that way long enough), otherwise the folders that were moved.
        """
        if not guard.allow(not configs, signature, now):
            return None
        return self.archive_unlisted(configs, keep)

    def _archive(self, name: str) -> str:
        archive = self.root / REMOVED_DIR
        archive.mkdir(parents=True, exist_ok=True)
        stamp = time.strftime("%Y%m%dT%H%M%S", time.gmtime())
        target = archive / f"{name}-{stamp}"
        number = 1
        while target.exists():
            number += 1
            target = archive / f"{name}-{stamp}-{number}"
        shutil.move(str(self._automations / name), str(target))
        self.recorded.pop(name, None)
        return target.name

    def list_archived_histories(self) -> list[dict[str, Any]]:
        """Return the histories of deleted automations that were set aside."""
        archive = self.root / REMOVED_DIR
        if not archive.is_dir():
            return []
        found = []
        for item in archive.iterdir():
            if not item.is_dir() or item.is_symlink():
                continue
            parts = _ARCHIVE_NAME.fullmatch(item.name)
            if parts is None:
                continue
            found.append(
                {
                    "name": item.name,
                    "automation": parts["name"],
                    "archived_at": calendar.timegm(
                        time.strptime(parts["stamp"], "%Y%m%dT%H%M%S")
                    ),
                }
            )
        return sorted(found, key=lambda item: item["archived_at"], reverse=True)

    def restore_archived_history(self, name: str) -> str:
        """Put a set-aside history back. Return the automation folder it is in.

        Refuses when that automation already has a history, so nothing is
        overwritten.
        """
        parts = _ARCHIVE_NAME.fullmatch(name)
        source = self.root / REMOVED_DIR / name
        if parts is None or not source.is_dir() or source.is_symlink():
            raise RepositoryError("That is not an archived history.")
        target = self._automations / parts["name"]
        if target.exists():
            raise RepositoryError(
                "That automation already has a history. Delete it first to "
                "bring the archived one back."
            )
        self._automations.mkdir(parents=True, exist_ok=True)
        source.rename(target)
        self.recorded.pop(parts["name"], None)
        return parts["name"]

    def forget(self, automation_id: str) -> bool:
        """Delete the whole history of one automation, for good.

        A remote that already received it is not changed. Return False when
        there was nothing to delete.
        """
        path = self._path(automation_id)
        if not path.is_dir() or path.is_symlink():
            return False
        self.recorded.pop(path.name, None)
        self._discard_tree(path)
        return True

    def _discard_tree(self, path: Path) -> None:
        """Delete a folder so that it is never left half deleted under its name."""
        for item in self.root.iterdir() if self.root.is_dir() else ():
            if item.name.startswith(FORGETTING_PREFIX) and not item.is_symlink():
                remove_tree(item, ignore_errors=True)
        stamp = time.strftime("%Y%m%dT%H%M%S", time.gmtime())
        aside = self.root / f"{FORGETTING_PREFIX}{path.name}-{stamp}"
        number = 1
        while aside.exists():
            number += 1
            aside = self.root / f"{FORGETTING_PREFIX}{path.name}-{stamp}-{number}"
        path.rename(aside)
        try:
            remove_tree(aside)
        except OSError as err:
            raise RepositoryError(
                "Not everything could be deleted. What is left was set aside "
                "and is deleted the next time."
            ) from err
