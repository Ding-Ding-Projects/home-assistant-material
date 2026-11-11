"""Git repositories for dashboards and their views.

Every stored dashboard gets its own repository. Every view of the dashboard
(a tab) gets its own repository inside it, and the dashboard repository pins
the commit each view is at.

Layout under the storage folder:

    <dashboard id>/.git                 the dashboard repository
    <dashboard id>/dashboard.yaml       the dashboard settings, and the keys of
                                        its views in order
    <dashboard id>/meta.json            key, title and path of each view
    <dashboard id>/views.lock           the commit each view repository is at
    <dashboard id>/views/<key>/view.yaml    the content of one view, tracked
    <dashboard id>/_removed/<key>/      a view that was deleted
    <dashboard id>/.views/<key>.git     the repository of one view (ignored)

A view repository uses `views/<key>/` as its working folder and keeps its Git
directory in `.views/`, so the dashboard repository tracks every view's
content as ordinary files. The history of each view is also fetched into the
dashboard repository as the branch `view/<key>`. One clone or push of the
dashboard repository therefore carries every view's content and history.
Nothing is pushed or fetched unless a remote is set and a push is asked for.

This module does not import Home Assistant, only the Git helpers of the
automation repositories, so it can be tested on its own. Every function
blocks; callers run them in an executor.
"""

from collections.abc import Mapping
import difflib
import json
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import time
from typing import Any

import yaml

from homeassistant.components.automation_repos.repos import (
    DIFF_LIMIT,
    HISTORY_LIMIT,
    REMOTE_TIMEOUT,
    AutomationRepositories,
    CommitInfo,
    RepositoryError,
    clean_message,
    dump_automation,
    plain,
)

DEFAULT_ID = "_default"

DASHBOARD_FILE = "dashboard.yaml"
VIEW_FILE = "view.yaml"
META_FILE = "meta.json"
LOCK_FILE = "views.lock"
VIEWS_DIR = "views"
REMOVED_DIR = "_removed"
VIEW_GIT_DIR = ".views"
VIEW_BRANCH = "view"
PUSH_STATE_FILE = "ha-last-push.json"

SIZE_LIMIT = 2_000_000
VIEW_LIMIT = 100

_NAME = r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}"
# Every pattern is used with fullmatch: `$` would also match before a trailing
# newline.
_DASHBOARD_ID = re.compile(rf"{DEFAULT_ID}|{_NAME}")
_VIEW_KEY = re.compile(_NAME)
_SHA = re.compile(r"[0-9a-f]{7,40}")

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


def check_dashboard_id(dashboard_id: str) -> str:
    """Return a dashboard id that is safe to use as a folder name."""
    if not _DASHBOARD_ID.fullmatch(dashboard_id):
        raise RepositoryError("That is not a dashboard.")
    return dashboard_id


def check_view_key(key: str) -> str:
    """Return a view key that is safe to use as a folder name."""
    if not _VIEW_KEY.fullmatch(key):
        raise RepositoryError("That is not a view.")
    return key


def check_remote(url: str) -> str:
    """Return a remote address that holds no credentials, or refuse it."""
    url = url.strip()
    if len(url) > REMOTE_LIMIT or not (
        _REMOTE_URL.fullmatch(url) or _REMOTE_SCP.fullmatch(url)
    ):
        raise RepositoryError(REMOTE_RULE)
    return url


def is_stored_remote_usable(url: str) -> bool:
    """Return True when an address read back from a repository may be used."""
    return len(url) <= REMOTE_LIMIT and bool(
        _REMOTE_URL.fullmatch(url)
        or _REMOTE_SCP.fullmatch(url)
        or _REMOTE_LEGACY_LOCAL.fullmatch(url)
    )


def mask_text(text: str, address: str | None = None) -> str:
    """Remove an address, and any user info before a host, from a message."""
    if address:
        text = text.replace(address, "the remote")
    return _URL_USERINFO.sub(r"\1", text)


def dump_yaml(data: Mapping[str, Any]) -> str:
    """Write data as YAML, the same way every time."""
    text = dump_automation(data)
    if len(text.encode()) > SIZE_LIMIT:
        raise RepositoryError("That configuration is too large to keep a history of.")
    return text


def load_yaml(text: str) -> dict[str, Any]:
    """Read a mapping back from YAML."""
    data = yaml.safe_load(text)
    if not isinstance(data, dict):
        raise RepositoryError("That version does not hold a configuration.")
    return data


def match_views(
    previous: list[dict[str, str]],
    views: list[Mapping[str, Any]],
    reserved: set[str],
) -> list[str]:
    """Give every view its key, keeping the key of a view that was already known.

    A view is matched to a known view by its path, then by its title (the
    nearest position first), then by position alone, which is how a rename is
    followed. A view that matches none is new: its path becomes its key when
    that is safe and free, and a generated key is used otherwise.
    """
    keys: list[str | None] = [None] * len(views)
    used: set[str] = set()

    def title(view: Mapping[str, Any]) -> str:
        return str(view.get("title") or "")

    def path(view: Mapping[str, Any]) -> str:
        return str(view.get("path") or "")

    for index, view in enumerate(views):
        if not path(view):
            continue
        for known in previous:
            if known["key"] not in used and known.get("path") == path(view):
                keys[index] = known["key"]
                used.add(known["key"])
                break

    for index, view in enumerate(views):
        if keys[index] is not None or not title(view):
            continue
        candidates = [
            (abs(position - index), position)
            for position, known in enumerate(previous)
            if known["key"] not in used and known.get("title") == title(view)
        ]
        if candidates:
            known_key = previous[min(candidates)[1]]["key"]
            keys[index] = known_key
            used.add(known_key)

    for index in range(len(views)):
        if keys[index] is None and index < len(previous):
            known_key = previous[index]["key"]
            if known_key not in used:
                keys[index] = known_key
                used.add(known_key)

    # Folders may sit on a disk that ignores case, so compare lower-cased.
    taken = {
        key.lower() for key in used | reserved | {known["key"] for known in previous}
    }
    for index, view in enumerate(views):
        if keys[index] is not None:
            continue
        key = path(view)
        if not _VIEW_KEY.fullmatch(key) or key.lower() in taken:
            key = f"view-{secrets.token_hex(4)}"
            while key.lower() in taken:
                key = f"view-{secrets.token_hex(4)}"
        keys[index] = key
        taken.add(key.lower())
        used.add(key)

    return [key for key in keys if key is not None]


def describe_view_change(before: str | None, view: Mapping[str, Any]) -> str:
    """Return a commit message that names what changed in a view."""
    title = str(view.get("title") or view.get("path") or "view")
    if before is None:
        return f"Add view {title}"
    try:
        previous = load_yaml(before)
    except (RepositoryError, yaml.YAMLError):
        return f"Update view {title}"
    changed = sorted(
        key for key in set(previous) | set(view) if previous.get(key) != view.get(key)
    )
    parts = []
    if "title" in changed:
        parts.append(f"Rename view {previous.get('title') or ''} to {title}".replace("  ", " "))
    rest = [key for key in changed if key != "title"]
    if rest:
        parts.append(f"{title}: change {', '.join(rest)}")
    return "; ".join(parts) or f"Update view {title}"


def describe_dashboard_change(
    previous_text: str | None,
    settings: Mapping[str, Any],
    previous_views: list[dict[str, str]],
    views: list[dict[str, str]],
    title: str,
    changed_keys: set[str],
) -> str:
    """Return a commit message that names what changed in a dashboard."""
    if previous_text is None:
        return f"Create dashboard {title}"
    parts = []
    known = {item["key"]: item["title"] for item in previous_views}
    current = {item["key"]: item["title"] for item in views}
    parts += [f"add view {current[key]}" for key in current if key not in known]
    parts += [f"remove view {known[key]}" for key in known if key not in current]
    old_order = [key for key in known if key in current]
    new_order = [key for key in current if key in known]
    if old_order != new_order:
        parts.append("reorder views")
    parts += [
        f"change view {current[key]}"
        for key in current
        if key in known and key in changed_keys
    ]
    try:
        previous = load_yaml(previous_text)
    except (RepositoryError, yaml.YAMLError):
        previous = {}
    changed = sorted(
        key
        for key in (set(previous) | set(settings)) - {"views"}
        if previous.get(key) != settings.get(key)
    )
    if changed:
        parts.append(f"change settings: {', '.join(changed)}")
    if not parts:
        return f"Update dashboard {title}"
    message = "; ".join(parts)
    return message[0].upper() + message[1:]


class DashboardRepositories(AutomationRepositories):
    """All dashboard repositories, each with a repository per view.

    A view repository keeps its Git directory in `.views/<key>.git` and uses
    `views/<key>/` as its working folder, with no `.git` inside it. The
    dashboard repository therefore tracks `views/<key>/view.yaml` as an
    ordinary file, and ignores `.views/`. After each save the history of every
    changed view is also fetched into the dashboard repository as the branch
    `view/<key>`, so a clone or a push of the dashboard repository carries
    every view's content and history.
    """

    def __init__(
        self,
        root: Path,
        author_name: str = "Home Assistant",
        author_email: str = "homeassistant@localhost",
    ) -> None:
        """Set where the repositories live and who commits."""
        super().__init__(root, author_name, author_email)
        self.errors: dict[str, str] = {}
        self.notes: dict[str, str] = {}

    def _dashboard(self, dashboard_id: str) -> Path:
        return self.root / check_dashboard_id(dashboard_id)

    def _view(self, dashboard_id: str, key: str) -> tuple[Path, Path]:
        """Return the Git directory and the working folder of a view."""
        base = self._dashboard(dashboard_id)
        git_dir = base / VIEW_GIT_DIR / f"{check_view_key(key)}.git"
        if not git_dir.is_dir():
            raise RepositoryError("That view has no history.")
        for folder in (VIEWS_DIR, REMOVED_DIR):
            if (base / folder / key).is_dir():
                return git_dir, base / folder / key
        raise RepositoryError("That view has no history.")

    def _vgit(
        self, view: tuple[Path, Path], *args: str, check: bool = True
    ) -> subprocess.CompletedProcess[str]:
        git_dir, work = view
        return self._git(
            work, f"--git-dir={git_dir}", f"--work-tree={work}", *args, check=check
        )

    def _vhead(self, view: tuple[Path, Path]) -> str | None:
        if not view[0].is_dir():
            return None
        result = self._vgit(view, "rev-parse", "--verify", "--quiet", "HEAD", check=False)
        return result.stdout.strip() or None

    def _vcommit(self, view: tuple[Path, Path], message: str) -> str | None:
        self._vgit(view, "add", "--all")
        if self._vgit(view, "status", "--porcelain").stdout.strip() == "":
            return None
        self._vgit(view, "commit", "--quiet", "-m", message)
        return self._vhead(view)

    @staticmethod
    def _read(path: Path, name: str) -> str | None:
        try:
            return (path / name).read_text(encoding="utf-8")
        except FileNotFoundError:
            return None

    def _meta(self, base: Path) -> dict[str, Any]:
        text = self._read(base, META_FILE)
        if text is None:
            return {"version": 1, "views": []}
        try:
            meta = json.loads(text)
        except ValueError:
            return {"version": 1, "views": []}
        views = meta.get("views") if isinstance(meta, dict) else None
        if not isinstance(views, list):
            return {"version": 1, "views": []}
        clean = [
            {
                "key": str(item["key"]),
                "title": str(item.get("title", "")),
                "path": str(item.get("path", "")),
            }
            for item in views
            if isinstance(item, dict) and _VIEW_KEY.fullmatch(str(item.get("key", "")))
        ]
        return {"version": 1, "views": clean}

    @staticmethod
    def _folders(base: Path) -> set[str]:
        names: set[str] = set()
        for folder in (VIEWS_DIR, REMOVED_DIR):
            if (base / folder).is_dir():
                names.update(item.name for item in (base / folder).iterdir())
        git_dir = base / VIEW_GIT_DIR
        if git_dir.is_dir():
            names.update(item.name.removesuffix(".git") for item in git_dir.iterdir())
        return names

    def locate_views(self, dashboard_id: str, config: Mapping[str, Any]) -> list[str]:
        """Return the key each view of a configuration would be kept under."""
        base = self._dashboard(dashboard_id)
        views = _views_of(plain(config))
        return match_views(self._meta(base)["views"], views, self._folders(base))

    def _ensure_view(self, base: Path, key: str) -> tuple[Path, Path]:
        git_dir = base / VIEW_GIT_DIR / f"{key}.git"
        work = base / VIEWS_DIR / key
        work.mkdir(parents=True, exist_ok=True)
        if not git_dir.is_dir():
            git_dir.parent.mkdir(parents=True, exist_ok=True)
            self._git(
                work,
                f"--git-dir={git_dir}",
                f"--work-tree={work}",
                "init",
                "--quiet",
                "--initial-branch=main",
            )
        return git_dir, work

    def snapshot_dashboard(
        self, dashboard_id: str, config: Mapping[str, Any], note: str | None = None
    ) -> str | None:
        """Commit a dashboard and its views where they changed.

        Each view whose content changed gets a commit in its own repository,
        its history is fetched into the dashboard repository, then the
        dashboard gets one commit. Return the dashboard commit, or None when
        nothing changed.
        """
        data = plain(config)
        has_views = "views" in data
        views = _views_of(data)
        base = self._dashboard(dashboard_id)
        previous = self._meta(base)["views"]
        keys = match_views(previous, views, self._folders(base))

        # Everything is written out and checked before anything is committed,
        # so one bad view cannot leave the dashboard half recorded.
        texts = [dump_yaml(view) for view in views]
        settings = {name: value for name, value in data.items() if name != "views"}
        if has_views:
            settings["views"] = keys
        settings_text = dump_yaml(settings)

        self._ensure_repository(base)
        (base / ".gitignore").write_text(f"{VIEW_GIT_DIR}/\n", encoding="utf-8")

        changed_keys: set[str] = set()
        for key, view, text in zip(keys, views, texts, strict=True):
            repository = self._ensure_view(base, key)
            before = self._read(repository[1], VIEW_FILE)
            (repository[1] / VIEW_FILE).write_text(text, encoding="utf-8")
            message = clean_message(note, describe_view_change(before, view))
            if self._vcommit(repository, message) is not None:
                changed_keys.add(key)

        (base / REMOVED_DIR).mkdir(exist_ok=True)
        for known in previous:
            key = known["key"]
            source = base / VIEWS_DIR / key
            if key not in keys and source.is_dir():
                shutil.move(str(source), str(base / REMOVED_DIR / key))

        current = [
            {
                "key": key,
                "title": str(view.get("title") or ""),
                "path": str(view.get("path") or ""),
            }
            for key, view in zip(keys, views, strict=True)
        ]
        previous_text = self._read(base, DASHBOARD_FILE)
        title = str(data.get("title") or dashboard_id)
        fallback = describe_dashboard_change(
            previous_text, settings, previous, current, title, changed_keys
        )
        (base / DASHBOARD_FILE).write_text(settings_text, encoding="utf-8")
        (base / META_FILE).write_text(
            json.dumps({"version": 1, "views": current}, indent=2, ensure_ascii=False)
            + "\n",
            encoding="utf-8",
        )
        lock = "".join(
            f"{key} {self._vhead(self._view(dashboard_id, key))}\n" for key in keys
        )
        (base / LOCK_FILE).write_text(lock, encoding="utf-8")
        commit = self._commit_if_changed(base, clean_message(note, fallback))
        for key in changed_keys:
            git_dir, _ = self._view(dashboard_id, key)
            self._git(
                base,
                "fetch",
                "--quiet",
                "--no-tags",
                str(git_dir),
                f"refs/heads/main:refs/heads/{VIEW_BRANCH}/{key}",
            )
        return commit

    def _log(
        self, cwd: Path, prefix: list[str], limit: int
    ) -> list[CommitInfo]:
        limit = max(1, min(limit, HISTORY_LIMIT))
        result = self._git(
            cwd,
            *prefix,
            "log",
            f"--max-count={limit}",
            "--format=%H%x1f%an%x1f%at%x1f%s%x1e",
            check=False,
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

    def commits(
        self, dashboard_id: str, view_key: str | None = None, limit: int = 100
    ) -> list[CommitInfo]:
        """Return the commits of a dashboard or one of its views, newest first."""
        base = self._dashboard(dashboard_id)
        if view_key is None:
            if not (base / ".git").exists():
                return []
            return self._log(base, [], limit)
        git_dir, work = self._view(dashboard_id, view_key)
        return self._log(work, [f"--git-dir={git_dir}", f"--work-tree={work}"], limit)

    def _check(self, sha: str) -> str:
        if not _SHA.fullmatch(sha):
            raise RepositoryError("That is not a commit.")
        return sha

    def view_at(self, dashboard_id: str, key: str, sha: str) -> dict[str, Any]:
        """Return a view as it was at a commit of its own repository."""
        view = self._view(dashboard_id, key)
        return load_yaml(
            self._vgit(view, "show", f"{self._check(sha)}:{VIEW_FILE}").stdout
        )

    def dashboard_at(self, dashboard_id: str, sha: str) -> dict[str, Any]:
        """Return a whole dashboard as it was at a commit of its repository.

        Every view's content is an ordinary file in that commit, so this needs
        nothing but the dashboard repository.
        """
        base = self._dashboard(dashboard_id)
        self._check(sha)
        settings = load_yaml(self._git(base, "show", f"{sha}:{DASHBOARD_FILE}").stdout)
        if "views" not in settings:
            return settings
        keys = settings["views"]
        if not isinstance(keys, list):
            raise RepositoryError("That version does not hold a dashboard.")
        views = [
            load_yaml(
                self._git(
                    base, "show", f"{sha}:{VIEWS_DIR}/{check_view_key(str(key))}/{VIEW_FILE}"
                ).stdout
            )
            for key in keys
        ]
        return {**settings, "views": views}

    def content(
        self, dashboard_id: str, sha: str, view_key: str | None = None
    ) -> dict[str, Any]:
        """Return the configuration at a commit, as data and as YAML."""
        config = (
            self.dashboard_at(dashboard_id, sha)
            if view_key is None
            else self.view_at(dashboard_id, view_key, sha)
        )
        return {"config": config, "yaml": dump_yaml(config)}

    def difference(
        self,
        dashboard_id: str,
        old: str,
        new: str | None = None,
        view_key: str | None = None,
    ) -> str:
        """Return what changed between two commits, or a commit and the newest."""
        if view_key is not None:
            view = self._view(dashboard_id, view_key)
            args = ["diff", "--no-color", self._check(old)]
            if new is not None:
                args.append(self._check(new))
            args += ["--", VIEW_FILE]
            return self._vgit(view, *args).stdout[:DIFF_LIMIT]
        base = self._dashboard(dashboard_id)
        if new is None:
            head = self._head(base)
            if head is None:
                raise RepositoryError("That dashboard has no history.")
            new = head
        old_text = dump_yaml(self.dashboard_at(dashboard_id, old))
        new_text = dump_yaml(self.dashboard_at(dashboard_id, new))
        lines = difflib.unified_diff(
            old_text.splitlines(),
            new_text.splitlines(),
            fromfile=old[:7],
            tofile=new[:7],
            lineterm="",
        )
        return "\n".join(lines)[:DIFF_LIMIT]

    def dashboard_status(self, dashboard: Mapping[str, Any]) -> dict[str, Any]:
        """Describe the repositories of one dashboard."""
        dashboard_id = str(dashboard["id"])
        base = self._dashboard(dashboard_id)
        head = self._head(base)
        count = 0
        if head is not None:
            count = int(self._git(base, "rev-list", "--count", "HEAD").stdout or 0)
        views = []
        for item in self._meta(base)["views"]:
            view_head = None
            view_count = 0
            try:
                view = self._view(dashboard_id, item["key"])
            except RepositoryError:
                view = None
            if view is not None:
                view_head = self._vhead(view)
            if view is not None and view_head is not None:
                view_count = int(
                    self._vgit(view, "rev-list", "--count", "HEAD").stdout or 0
                )
            views.append({**item, "head": view_head, "commits": view_count})
        removed = []
        if (base / REMOVED_DIR).is_dir():
            removed = sorted(
                item.name
                for item in (base / REMOVED_DIR).iterdir()
                if (base / VIEW_GIT_DIR / f"{item.name}.git").is_dir()
            )
        remote, unsafe = self._stored_remote(base)
        return {
            "id": dashboard_id,
            "url_path": dashboard.get("url_path"),
            "title": dashboard.get("title") or dashboard_id,
            "repository": dashboard_id,
            "head": head,
            "commits": count,
            "views": views,
            "removed": removed,
            "remote": remote,
            "remote_unsafe": unsafe,
            "last_push": self._read_push_state(base),
            "error": self.errors.get(dashboard_id),
        }

    def _stored_remote(self, base: Path) -> tuple[str | None, bool]:
        """Return the remote address to show, and whether one is set but unusable."""
        if not (base / ".git").exists():
            return None, False
        result = self._git(base, "remote", "get-url", "origin", check=False)
        url = result.stdout.strip()
        if result.returncode != 0 or not url:
            return None, False
        if is_stored_remote_usable(url):
            return url, False
        return None, True

    def _read_push_state(self, base: Path) -> dict[str, Any] | None:
        text = self._read(base / ".git", PUSH_STATE_FILE)
        if text is None:
            return None
        try:
            state = json.loads(text)
        except ValueError:
            return None
        if not isinstance(state, dict) or not isinstance(state.get("time"), int):
            return None
        return {
            "time": state["time"],
            "ok": bool(state.get("ok")),
            "error": state.get("error") if isinstance(state.get("error"), str) else None,
        }

    def set_dashboard_remote(self, dashboard_id: str, url: str | None) -> None:
        """Set or remove the remote of a dashboard repository."""
        base = self._dashboard(dashboard_id)
        url = (url or "").strip()
        if url:
            url = check_remote(url)
        self._ensure_repository(base)
        has_remote = (
            self._git(base, "remote", "get-url", "origin", check=False).returncode == 0
        )
        if not url:
            if has_remote:
                self._git(base, "remote", "remove", "origin")
            return
        self._git(base, "remote", "set-url" if has_remote else "add", "origin", url)

    def push_dashboard(self, dashboard_id: str) -> dict[str, Any]:
        """Send a dashboard repository, with every view's history, to its remote.

        The view histories are branches of the dashboard repository, so one
        push carries them. It is never forced. The message returned never
        holds the address, only what went wrong.
        """
        base = self._dashboard(dashboard_id)
        address, unsafe = self._stored_remote(base)
        if unsafe:
            raise RepositoryError(
                "The address of the remote cannot be used. " + REMOTE_RULE
            )
        if address is None or self._head(base) is None:
            raise RepositoryError("This dashboard has no remote to send to.")
        sent = self._git(
            base,
            "push",
            "--quiet",
            "origin",
            "HEAD:refs/heads/main",
            f"refs/heads/{VIEW_BRANCH}/*:refs/heads/{VIEW_BRANCH}/*",
            timeout=REMOTE_TIMEOUT,
            check=False,
        )
        error = None
        if sent.returncode != 0:
            detail = (sent.stderr or sent.stdout).strip().splitlines()
            error = mask_text(detail[-1] if detail else "Push failed.", address)[:300]
        now = int(time.time())
        state = {"time": now, "ok": error is None, "error": error}
        (base / ".git" / PUSH_STATE_FILE).write_text(
            json.dumps(state) + "\n", encoding="utf-8"
        )
        return {"pushed": error is None, "error": error, "time": now}

    def current_keys(self, dashboard_id: str) -> list[str]:
        """Return the key of each view as it was at the last recorded save."""
        return [
            item["key"] for item in self._meta(self._dashboard(dashboard_id))["views"]
        ]

    def archive_dashboard(self, dashboard_id: str) -> str | None:
        """Move the repository of a deleted dashboard out of the way.

        A new dashboard with the same address then starts with no history.
        Return the folder it was moved to, or None when there was none.
        """
        base = self._dashboard(dashboard_id)
        if not base.is_dir() or base.is_symlink():
            return None
        archive = self.root / REMOVED_DIR
        archive.mkdir(parents=True, exist_ok=True)
        stamp = time.strftime("%Y%m%dT%H%M%S", time.gmtime())
        target = archive / f"{dashboard_id}-{stamp}"
        number = 1
        while target.exists():
            number += 1
            target = archive / f"{dashboard_id}-{stamp}-{number}"
        shutil.move(str(base), str(target))
        self.errors.pop(dashboard_id, None)
        self.notes.pop(dashboard_id, None)
        return target.name

    def forget_dashboard(self, dashboard_id: str) -> bool:
        """Delete the whole history of a dashboard, for good.

        A remote that already received it is not changed. Return False when
        there was nothing to delete.
        """
        base = self._dashboard(dashboard_id)
        if not base.is_dir() or base.is_symlink():
            return False
        shutil.rmtree(base)
        self.errors.pop(dashboard_id, None)
        self.notes.pop(dashboard_id, None)
        return True

    def known_dashboards(self) -> list[str]:
        """Return the ids of the dashboards that have a repository."""
        if not self.root.is_dir():
            return []
        return sorted(
            item.name
            for item in self.root.iterdir()
            if item.is_dir()
            and not item.is_symlink()
            and _DASHBOARD_ID.fullmatch(item.name)
        )


def place_view(
    views: list[Any], keys: list[str], view_key: str, restored: Any
) -> tuple[list[Any], bool]:
    """Put a view back in a list of views, found by its key and nothing else.

    `keys` holds the key of each view in `views`, in order. When no view has
    the key any more, or the two lists do not line up, the view is added at the
    end as a new tab. Return the new list and whether a tab was added.
    """
    placed = list(views)
    if view_key in keys and len(keys) == len(placed):
        placed[keys.index(view_key)] = restored
        return placed, False
    placed.append(restored)
    return placed, True


def check_config(config: Mapping[str, Any]) -> dict[str, Any]:
    """Return a configuration that can be recorded and saved, or refuse it."""
    data = plain(config)
    if not isinstance(data, dict):
        raise RepositoryError("That version does not hold a configuration.")
    for view in _views_of(data):
        dump_yaml(view)
    dump_yaml({name: value for name, value in data.items() if name != "views"})
    return data


def _views_of(data: Mapping[str, Any]) -> list[dict[str, Any]]:
    views = data.get("views", [])
    if not isinstance(views, list) or not all(isinstance(v, dict) for v in views):
        raise RepositoryError("The views of this dashboard are not a list of views.")
    if len(views) > VIEW_LIMIT:
        raise RepositoryError("This dashboard has too many views to keep a history.")
    return views
