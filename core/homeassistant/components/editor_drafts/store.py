"""A temporary Git repository that holds unsaved editor drafts.

Every autosave of an automation, script or scene being edited is one commit in
this repository. The repository lives in a folder of its own that Home
Assistant never loads as configuration, so a draft can neither run nor change
anything that is live. A draft is removed when the owner saves or discards it,
and when it has not been touched for a long time.

Layout under the root folder:

    <root>/.git
    <root>/<kind>/<item id>.json     {"base_hash": ..., "config": {...}}

This module does not import Home Assistant, so it can be tested on its own.
Every function blocks; callers run them in an executor.
"""

from collections.abc import Callable
from datetime import UTC, datetime, timedelta
import json
import logging
import os
from pathlib import Path
import re
import shutil
import subprocess
import threading
import time
from typing import Any

_LOGGER = logging.getLogger(__name__)

KINDS = ("automation", "script", "scene")

GIT_TIMEOUT = 30
# A draft above this many bytes is refused, so one runaway editor cannot fill
# the disk.
MAX_DRAFT_BYTES = 1_000_000
# A save for the same draft sooner than this after the last one is skipped; the
# editor sends the newest state again a moment later.
MIN_INTERVAL_SECONDS = 1.0
# When any of these limits is passed the history is compacted: the repository
# is re-created from the current drafts, as a single commit.
MAX_COMMITS_PER_DRAFT = 200
MAX_COMMITS_TOTAL = 1000
MAX_REPOSITORY_BYTES = 20_000_000
MAX_DRAFTS = 200
# A draft nobody touched for this long is removed.
EXPIRY = timedelta(days=30)
HISTORY_LIMIT = 100

_SAFE_ID = re.compile(r"[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}")
_SHA = re.compile(r"[0-9a-f]{7,40}")


class DraftError(Exception):
    """A draft operation failed. The message is safe to show."""

    def __init__(self, code: str, message: str) -> None:
        """Keep a short machine readable code beside the message."""
        super().__init__(message)
        self.code = code


def check_target(kind: str, item_id: str) -> tuple[str, str]:
    """Return a safe kind and id, or refuse them."""
    if kind not in KINDS:
        raise DraftError("invalid_format", "Unknown kind of draft.")
    if not isinstance(item_id, str) or not _SAFE_ID.fullmatch(item_id):
        raise DraftError("invalid_format", "That is not a usable id.")
    if item_id.endswith(".") or ".." in item_id:
        raise DraftError("invalid_format", "That is not a usable id.")
    return kind, item_id


def _iso(value: float | datetime) -> str:
    if isinstance(value, datetime):
        return value.astimezone(UTC).isoformat()
    return datetime.fromtimestamp(value, UTC).isoformat()


class DraftRepository:
    """Drafts kept as commits in one repository."""

    def __init__(
        self,
        root: Path,
        clock: Callable[[], float] = time.time,
    ) -> None:
        """Keep the repository in root, which is created when needed."""
        self.root = root
        self._clock = clock
        self._lock = threading.Lock()
        self._last_save: dict[str, float] = {}
        self._recovered_logged = False


    def _git(
        self, *args: str, check: bool = True, timeout: int = GIT_TIMEOUT
    ) -> subprocess.CompletedProcess[str]:
        env = {
            "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
            "HOME": str(self.root),
            "LANG": "C.UTF-8",
            "GIT_TERMINAL_PROMPT": "0",
            "GIT_CONFIG_NOSYSTEM": "1",
            "GIT_CONFIG_GLOBAL": os.devnull,
            "GIT_AUTHOR_DATE": f"{int(self._clock())} +0000",
            "GIT_COMMITTER_DATE": f"{int(self._clock())} +0000",
        }
        command = [
            "git",
            "-c",
            "user.name=Editor drafts",
            "-c",
            "user.email=editor-drafts@localhost",
            "-c",
            "core.hooksPath=" + os.devnull,
            "-c",
            "commit.gpgsign=false",
            "-c",
            "core.quotepath=false",
            "-c",
            "core.autocrlf=false",
            "-c",
            "gc.auto=0",
            *args,
        ]
        try:
            result = subprocess.run(
                command,
                cwd=self.root,
                env=env,
                capture_output=True,
                text=True,
                timeout=timeout,
                check=False,
            )
        except FileNotFoundError as err:
            raise DraftError("unavailable", "Git is not installed.") from err
        except subprocess.TimeoutExpired as err:
            raise DraftError("unavailable", "Git did not answer in time.") from err
        if check and result.returncode != 0:
            raise DraftError("repository_error", "Git reported an error.")
        return result

    def _init(self) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        self._git("init", "--quiet", "--initial-branch=main")

    def _healthy(self) -> bool:
        if not (self.root / ".git").exists():
            return False
        return self._git("rev-parse", "--git-dir", check=False).returncode == 0

    def _recreate(self) -> None:
        """Throw the repository away and start empty."""
        if self.root.exists():
            shutil.rmtree(self.root, ignore_errors=True)
        self._init()

    def _ensure(self) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        if (self.root / ".git").exists() and self._healthy():
            return
        if (self.root / ".git").exists():
            # Present but unreadable: re-create it empty and report it once.
            if not self._recovered_logged:
                _LOGGER.warning(
                    "The editor drafts repository was damaged and was re-created"
                )
                self._recovered_logged = True
            self._recreate()
            return
        self._init()

    def _run(self, work: Callable[[], Any]) -> Any:
        """Run work with the repository ready, recovering once from damage."""
        with self._lock:
            self._ensure()
            try:
                return work()
            except DraftError as err:
                if err.code != "repository_error":
                    raise
            # Damaged in a way that only showed while working: start empty.
            if not self._recovered_logged:
                _LOGGER.warning(
                    "The editor drafts repository was damaged and was re-created"
                )
                self._recovered_logged = True
            self._recreate()
            return work()


    def _file(self, kind: str, item_id: str) -> Path:
        return self.root / kind / f"{item_id}.json"

    @staticmethod
    def _rel(kind: str, item_id: str) -> str:
        return f"{kind}/{item_id}.json"

    def _draft_files(self) -> list[tuple[str, str]]:
        found: list[tuple[str, str]] = []
        for kind in KINDS:
            folder = self.root / kind
            if not folder.is_dir():
                continue
            found.extend(
                (kind, path.stem) for path in folder.glob("*.json") if path.is_file()
            )
        return found

    def _last_commit_time(self, rel: str) -> float | None:
        result = self._git("log", "-1", "--format=%ct", "--", rel, check=False)
        text = result.stdout.strip()
        return float(text) if text else None

    def _commit(self, message: str) -> bool:
        self._git("add", "--all")
        if self._git("status", "--porcelain").stdout.strip() == "":
            return False
        self._git("commit", "--quiet", "-m", message)
        return True

    def _commit_count(self, rel: str | None = None) -> int:
        args = ["rev-list", "--count", "HEAD"]
        if rel:
            args += ["--", rel]
        result = self._git(*args, check=False)
        try:
            return int(result.stdout.strip() or "0")
        except ValueError:
            return 0

    def _size(self) -> int:
        total = 0
        for base, _dirs, files in os.walk(self.root):
            for name in files:
                try:
                    total += (Path(base) / name).stat().st_size
                except OSError:
                    continue
        return total


    def _compact(self) -> None:
        """Re-create the repository from the current drafts as one commit."""
        saved: dict[str, bytes] = {}
        for kind, item_id in self._draft_files():
            try:
                saved[self._rel(kind, item_id)] = self._file(kind, item_id).read_bytes()
            except OSError:
                continue
        self._recreate()
        for rel, data in saved.items():
            path = self.root / rel
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        if saved:
            self._commit("Compacted history")

    def _enforce_limits(self, rel: str) -> None:
        if (
            self._commit_count(rel) > MAX_COMMITS_PER_DRAFT
            or self._commit_count() > MAX_COMMITS_TOTAL
            or self._size() > MAX_REPOSITORY_BYTES
        ):
            self._compact()


    def save(
        self,
        kind: str,
        item_id: str,
        config: dict[str, Any],
        base_hash: str | None,
        meta: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Store the newest state of a draft; identical content is not saved."""
        kind, item_id = check_target(kind, item_id)
        document: dict[str, Any] = {"base_hash": base_hash, "config": config}
        if meta:
            document["meta"] = meta
        text = json.dumps(document, indent=2, ensure_ascii=False)
        if len(text.encode()) > MAX_DRAFT_BYTES:
            raise DraftError("too_large", "This draft is too large to keep.")
        key = self._rel(kind, item_id)
        now = self._clock()
        with self._lock:
            last = self._last_save.get(key)
        if last is not None and 0 <= now - last < MIN_INTERVAL_SECONDS:
            return {"saved": False, "reason": "too_soon"}

        def work() -> dict[str, Any]:
            existing = self._draft_files()
            if (kind, item_id) not in existing and len(existing) >= MAX_DRAFTS:
                raise DraftError("too_many", "Too many drafts are kept.")
            path = self._file(kind, item_id)
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp = path.with_suffix(".tmp")
            tmp.write_text(text, encoding="utf-8")
            os.replace(tmp, path)
            committed = self._commit(f"Draft {key} {_iso(now)}")
            if committed:
                self._enforce_limits(key)
            stamp = self._last_commit_time(key)
            return {
                "saved": True,
                "changed": committed,
                "updated": _iso(stamp if stamp is not None else now),
            }

        result = self._run(work)
        with self._lock:
            self._last_save[key] = now
        return result

    def get(self, kind: str, item_id: str) -> dict[str, Any] | None:
        """Return one draft, or None when there is none."""
        kind, item_id = check_target(kind, item_id)

        def work() -> dict[str, Any] | None:
            path = self._file(kind, item_id)
            if not path.is_file():
                return None
            data = json.loads(path.read_text(encoding="utf-8"))
            stamp = self._last_commit_time(self._rel(kind, item_id))
            return {
                "kind": kind,
                "item_id": item_id,
                "config": data.get("config"),
                "base_hash": data.get("base_hash"),
                "meta": data.get("meta") or {},
                "updated": _iso(stamp) if stamp is not None else None,
            }

        try:
            return self._run(work)
        except (ValueError, OSError):
            return None

    def list(self) -> list[dict[str, Any]]:
        """Return every draft without its content, newest first."""

        def work() -> list[dict[str, Any]]:
            rows = []
            for kind, item_id in self._draft_files():
                path = self._file(kind, item_id)
                try:
                    data = json.loads(path.read_text(encoding="utf-8"))
                except (ValueError, OSError):
                    continue
                config = data.get("config") or {}
                stamp = self._last_commit_time(self._rel(kind, item_id))
                rows.append(
                    {
                        "kind": kind,
                        "item_id": item_id,
                        "alias": config.get("alias") or config.get("name"),
                        "base_hash": data.get("base_hash"),
                        "updated": _iso(stamp) if stamp is not None else None,
                    }
                )
            rows.sort(key=lambda row: row["updated"] or "", reverse=True)
            return rows

        return self._run(work)

    def history(self, kind: str, item_id: str) -> list[dict[str, Any]]:
        """Return the autosaves of one draft, newest first."""
        kind, item_id = check_target(kind, item_id)

        def work() -> list[dict[str, Any]]:
            result = self._git(
                "log",
                f"--max-count={HISTORY_LIMIT}",
                "--format=%H %ct",
                "--",
                self._rel(kind, item_id),
                check=False,
            )
            rows = []
            for line in result.stdout.splitlines():
                sha, _, stamp = line.partition(" ")
                if _SHA.fullmatch(sha) and stamp.isdigit():
                    rows.append({"sha": sha, "time": _iso(float(stamp))})
            return rows

        return self._run(work)

    def restore_version(self, kind: str, item_id: str, sha: str) -> dict[str, Any]:
        """Make an earlier autosave the current draft and return it."""
        kind, item_id = check_target(kind, item_id)
        if not _SHA.fullmatch(sha):
            raise DraftError("invalid_format", "That is not an autosave.")
        rel = self._rel(kind, item_id)

        def work() -> dict[str, Any]:
            result = self._git("show", f"{sha}:{rel}", check=False)
            if result.returncode != 0:
                raise DraftError("not_found", "That autosave no longer exists.")
            data = json.loads(result.stdout)
            path = self._file(kind, item_id)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(result.stdout, encoding="utf-8")
            self._commit(f"Restored {rel} {_iso(self._clock())}")
            return {"config": data.get("config"), "base_hash": data.get("base_hash")}

        try:
            return self._run(work)
        except ValueError as err:
            raise DraftError("not_found", "That autosave cannot be read.") from err

    def discard(self, kind: str, item_id: str) -> bool:
        """Remove a draft. Return whether there was one."""
        kind, item_id = check_target(kind, item_id)
        key = self._rel(kind, item_id)

        def work() -> bool:
            path = self._file(kind, item_id)
            if not path.is_file():
                return False
            path.unlink()
            self._commit(f"Removed {key}")
            if not self._draft_files():
                # Nothing is left to keep, so nothing of the history is either.
                self._recreate()
            return True

        found = self._run(work)
        with self._lock:
            self._last_save.pop(key, None)
        return found

    def purge_expired(self) -> int:
        """Remove drafts nobody touched for a long time. Return how many."""
        limit = self._clock() - EXPIRY.total_seconds()

        def work() -> int:
            removed = 0
            for kind, item_id in self._draft_files():
                stamp = self._last_commit_time(self._rel(kind, item_id))
                if stamp is None:
                    stamp = self._file(kind, item_id).stat().st_mtime
                if stamp < limit:
                    self._file(kind, item_id).unlink(missing_ok=True)
                    removed += 1
            if removed:
                self._commit("Removed old drafts")
                if not self._draft_files():
                    self._recreate()
            return removed

        return self._run(work)
