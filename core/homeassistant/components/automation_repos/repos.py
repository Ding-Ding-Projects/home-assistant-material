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

from collections.abc import Mapping
from dataclasses import dataclass, field
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
from typing import Any

import yaml

GIT_TIMEOUT = 30
REMOTE_TIMEOUT = 60
HISTORY_LIMIT = 500
DIFF_LIMIT = 200_000
MESSAGE_LIMIT = 500

AUTOMATION_FILE = "automation.yaml"
MANIFEST_FILE = "manifest.json"

_SAFE_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
_SHA = re.compile(r"^[0-9a-f]{7,40}$")
_REMOTE = re.compile(
    r"^(https://[^\s@]+|ssh://[^\s]+|git@[A-Za-z0-9.-]+:[^\s]+|/[^\s]+)$"
)


class RepositoryError(Exception):
    """A Git operation failed. The message is safe to show."""


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
    if _SAFE_NAME.match(automation_id):
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


def load_automation(text: str) -> dict[str, Any]:
    """Read an automation back from YAML."""
    data = yaml.safe_load(text)
    if not isinstance(data, dict):
        raise RepositoryError("That version does not hold an automation.")
    return data


def clean_message(message: str | None, fallback: str) -> str:
    """Return a commit message of one sane line."""
    text = " ".join((message or "").split())
    return (text or fallback)[:MESSAGE_LIMIT]


class AutomationRepositories:
    """All automation repositories and their master."""

    def __init__(
        self,
        root: Path,
        author_name: str = "Home Assistant",
        author_email: str = "homeassistant@localhost",
    ) -> None:
        """Set where the repositories live and who commits."""
        self.root = Path(root)
        self._author_name = author_name
        self._author_email = author_email

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
            "GIT_SSH_COMMAND": "ssh -o BatchMode=yes -o ConnectTimeout=15",
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
        if not _SHA.match(sha):
            raise RepositoryError("That is not a commit.")
        return sha

    def is_dirty(self, automation_id: str, config: dict[str, Any]) -> bool:
        """Return True when the automation differs from its last commit."""
        path = self._path(automation_id)
        head = self._head(path)
        if head is None:
            return True
        committed = self._git(
            path, "show", f"{head}:{AUTOMATION_FILE}", check=False
        ).stdout
        return committed != dump_automation(config)

    def snapshot(
        self, automation_id: str, config: dict[str, Any], message: str | None = None
    ) -> str | None:
        """Commit an automation if it changed. Return the new commit."""
        path = self._path(automation_id)
        self._ensure_repository(path)
        fallback = self._describe_change(path, config, automation_id)
        (path / AUTOMATION_FILE).write_text(dump_automation(config), encoding="utf-8")
        return self._commit_if_changed(path, clean_message(message, fallback))

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
        return load_automation(result.stdout)

    def diff(self, automation_id: str, old: str, new: str | None = None) -> str:
        """Return the difference between two commits, or a commit and now."""
        path = self._path(automation_id)
        args = ["diff", "--no-color", self._check_sha(old)]
        if new is not None:
            args.append(self._check_sha(new))
        args += ["--", AUTOMATION_FILE]
        return self._git(path, *args).stdout[:DIFF_LIMIT]

    def status(self, configs: dict[str, dict[str, Any]]) -> dict[str, Any]:
        """Describe every automation repository and the master."""
        automations = []
        for automation_id, config in configs.items():
            path = self._path(automation_id)
            head = self._head(path)
            count = 0
            if head is not None:
                count = int(self._git(path, "rev-list", "--count", "HEAD").stdout or 0)
            automations.append(
                {
                    "id": automation_id,
                    "alias": str(config.get("alias") or automation_id),
                    "repository": f"automations/{repository_name(automation_id)}",
                    "head": head,
                    "commits": count,
                    "dirty": self.is_dirty(automation_id, config),
                    "remote": self._remote(path),
                }
            )
        master_head = self._head(self.root)
        last = None
        if master_head is not None:
            last = int(self._git(self.root, "log", "-1", "--format=%at").stdout or 0)
        return {
            "automations": automations,
            "master": {
                "head": master_head,
                "last_commit": last,
                "remote": self._remote(self.root),
            },
        }

    def push_all(
        self,
        configs: dict[str, dict[str, Any]],
        message: str | None = None,
        only: list[str] | None = None,
        invalid: dict[str, str] | None = None,
    ) -> PushResult:
        """Commit every changed automation, then the master, then send them.

        `invalid` names automations that did not load, with the reason. They
        are left out and reported, so one broken automation never blocks the
        rest. `only` limits the push to some automations; the master is
        always committed.
        """
        result = PushResult()
        self._ensure_repository(self.root)
        (self.root / ".gitignore").write_text("automations/\n", encoding="utf-8")
        snapshots = self.root / "snapshots"
        snapshots.mkdir(exist_ok=True)
        for automation_id, reason in (invalid or {}).items():
            result.skipped.append({"id": automation_id, "reason": reason})
        for automation_id, config in configs.items():
            if only is not None and automation_id not in only:
                continue
            if invalid and automation_id in invalid:
                continue
            commit = self.snapshot(automation_id, config)
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

        # Send to remotes where one is set. Never forced.
        targets = [
            (automation_id, self._path(automation_id)) for automation_id in configs
        ] + [("master", self.root)]
        for label, path in targets:
            if self._remote(path) is None or self._head(path) is None:
                continue
            sent = self._git(
                path,
                "push",
                "--quiet",
                "origin",
                "HEAD:refs/heads/main",
                timeout=REMOTE_TIMEOUT,
                check=False,
            )
            if sent.returncode == 0:
                result.pushed.append(label)
            else:
                detail = (sent.stderr or sent.stdout).strip().splitlines()
                result.push_errors.append(
                    {"id": label, "error": detail[-1] if detail else "Push failed."}
                )
        return result

    def _remote(self, path: Path) -> str | None:
        if not (path / ".git").exists():
            return None
        result = self._git(path, "remote", "get-url", "origin", check=False)
        url = result.stdout.strip()
        if result.returncode != 0 or not url:
            return None
        # Never hand back anything that could hold a password.
        return re.sub(r"//[^/@]+@", "//", url)

    def set_remote(self, automation_id: str | None, url: str | None) -> None:
        """Set or remove the remote of one automation, or of the master."""
        path = self.root if automation_id is None else self._path(automation_id)
        self._ensure_repository(path)
        has_remote = (
            self._git(path, "remote", "get-url", "origin", check=False).returncode == 0
        )
        if not url:
            if has_remote:
                self._git(path, "remote", "remove", "origin")
            return
        url = url.strip()
        if not _REMOTE.match(url) or url.startswith("-"):
            raise RepositoryError(
                "Use an address that starts with https://, ssh://, git@ or /, "
                "without a user name or password in it."
            )
        self._git(path, "remote", "set-url" if has_remote else "add", "origin", url)
