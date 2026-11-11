"""The Git repository that holds the permanent activity record.

Layout under the record folder:

    YYYY/MM/YYYY-MM-DD.jsonl    one file per UTC day, one JSON entry per line

Files are only ever appended to. Nothing is rewritten, deleted, purged or
squashed. This module does not import Home Assistant, only the Git helpers of
the automation repositories. Every method blocks; callers run it in an
executor.
"""

from collections.abc import Sequence
import os
from pathlib import Path
import threading
import time
from typing import Any

from homeassistant.components.automation_repos.repos import (
    REMOTE_RULE,
    AutomationRepositories,
    RepositoryError,
    mask_text,
)

from .const import AUTHOR_EMAIL, AUTHOR_NAME, DAYS_LIMIT, PUSH_TIMEOUT
from .record_core import (
    DAY_FILE,
    commit_message,
    count_lines,
    day_path,
    iter_lines,
    iter_lines_reversed,
    matches,
    parse_line,
    valid_day,
)

README = """# Permanent activity record

This repository keeps every entry the Activity page of Home Assistant shows.
One file per UTC day, `YYYY/MM/YYYY-MM-DD.jsonl`, one JSON entry per line.
Files are only appended to. Nothing is ever rewritten, deleted or purged.
"""

__all__ = ["REMOTE_RULE", "ActivityRepository", "RepositoryError"]


class ActivityRepository:
    """The record folder and its Git repository."""

    def __init__(self, root: Path) -> None:
        """Set where the record lives."""
        self.root = Path(root)
        self.git = AutomationRepositories(self.root, AUTHOR_NAME, AUTHOR_EMAIL)
        self.uncommitted = 0
        self._lock = threading.RLock()
        self._push_lock = threading.Lock()
        self._counts: dict[str, tuple[int, int]] = {}
        self._head_cache: tuple[str, dict[str, Any]] | None = None
        self.last_push: dict[str, Any] | None = None

    def ensure_repository(self) -> None:
        """Create the folder and its repository when they are missing."""
        with self._lock:
            fresh = not (self.root / ".git").exists()
            self.git._ensure_repository(self.root)  # noqa: SLF001
            if fresh:
                self.git._git(self.root, "config", "gc.auto", "500")  # noqa: SLF001
            readme = self.root / "README.md"
            if not readme.exists():
                readme.write_text(README, encoding="utf-8")

    def startup(self) -> str | None:
        """Commit whatever is on disk, for example after a crash."""
        with self._lock:
            self.ensure_repository()
            sha = self.git._commit_if_changed(  # noqa: SLF001
                self.root, "Record entries found on disk at start"
            )
            self.uncommitted = 0
            return sha

    def append(self, items: Sequence[tuple[str, bytes]]) -> None:
        """Append lines to their day files and flush them to disk."""
        by_day: dict[str, list[bytes]] = {}
        for day, line in items:
            by_day.setdefault(day, []).append(line)
        with self._lock:
            for day, lines in by_day.items():
                path = day_path(self.root, day)
                path.parent.mkdir(parents=True, exist_ok=True)
                size = path.stat().st_size if path.exists() else 0
                block = b"".join(lines)
                if size:
                    with path.open("rb") as probe:
                        probe.seek(size - 1)
                        if probe.read(1) != b"\n":
                            block = b"\n" + block
                with path.open("ab") as handle:
                    handle.write(block)
                    handle.flush()
                    os.fsync(handle.fileno())
                new_size = size + len(block)
                cached = self._counts.get(day)
                if cached is not None and cached[0] == size:
                    self._counts[day] = (new_size, cached[1] + len(lines))
            self.uncommitted += len(items)

    def commit(self, reason: str | None = None) -> str | None:
        """Commit what has been written; return the new commit or None."""
        with self._lock:
            count = self.uncommitted
            sha = self.git._commit_if_changed(  # noqa: SLF001
                self.root, commit_message(count, reason)
            )
            self.uncommitted = 0
            return sha

    def _day_files(self) -> list[tuple[str, Path]]:
        found: list[tuple[str, Path]] = []
        if not self.root.is_dir():
            return found
        for year in self.root.iterdir():
            if not (year.is_dir() and not year.is_symlink() and year.name.isdigit()):
                continue
            for month in year.iterdir():
                if not (month.is_dir() and not month.is_symlink()):
                    continue
                for item in month.iterdir():
                    if (
                        (match := DAY_FILE.fullmatch(item.name))
                        and item.is_file()
                        and not item.is_symlink()
                        and match[1] == year.name
                        and match[2] == month.name
                    ):
                        found.append((item.name[:10], item))
        found.sort(reverse=True)
        return found

    def _count(self, day: str, path: Path) -> tuple[int, int]:
        size = path.stat().st_size
        cached = self._counts.get(day)
        if cached is not None and cached[0] == size:
            return cached
        count = count_lines(path)
        self._counts[day] = (size, count)
        return size, count

    def days(self, limit: int = DAYS_LIMIT, offset: int = 0) -> dict[str, Any]:
        """List the days that have a file, newest first, with entry counts."""
        files = self._day_files()
        rows = []
        for day, path in files[offset : offset + limit]:
            try:
                size, count = self._count(day, path)
            except OSError:
                continue
            rows.append({"day": day, "entries": count, "bytes": size})
        return {"days": rows, "total": len(files), "offset": offset}

    def read(
        self, day: str, offset: int, limit: int, newest_first: bool
    ) -> dict[str, Any]:
        """Read the entries of one day."""
        if valid_day(day) is None:
            raise RepositoryError("That is not a day.")
        path = day_path(self.root, day)
        if not path.is_file() or path.is_symlink():
            return {
                "day": day,
                "entries": [],
                "total": 0,
                "offset": offset,
                "limit": limit,
                "has_more": False,
            }
        lines = iter_lines_reversed(path) if newest_first else iter_lines(path)
        entries: list[dict[str, Any]] = []
        skipped = 0
        has_more = False
        for line in lines:
            if (entry := parse_line(line)) is None:
                continue
            if skipped < offset:
                skipped += 1
                continue
            if len(entries) >= limit:
                has_more = True
                break
            entries.append(entry)
        _, total = self._count(day, path)
        return {
            "day": day,
            "entries": entries,
            "total": total,
            "offset": offset,
            "limit": limit,
            "has_more": has_more,
        }

    def search(
        self,
        start: str | None,
        end: str | None,
        entity_id: str | None,
        text: str | None,
        limit: int,
        max_bytes: int,
    ) -> dict[str, Any]:
        """Search the days in a range, newest first, within a byte budget."""
        first = valid_day(start) if start else None
        last = valid_day(end) if end else None
        if (start and first is None) or (end and last is None):
            raise RepositoryError("That is not a day.")
        entries: list[dict[str, Any]] = []
        scanned = 0
        days = 0
        truncated = False
        reason = None
        for day, path in self._day_files():
            if (first and day < first.isoformat()) or (
                last and day > last.isoformat()
            ):
                continue
            days += 1
            try:
                for line in iter_lines_reversed(path):
                    scanned += len(line) + 1
                    if scanned > max_bytes:
                        truncated, reason = True, "bytes"
                        break
                    if (entry := parse_line(line)) is None or not matches(
                        entry, entity_id, text
                    ):
                        continue
                    if len(entries) >= limit:
                        truncated, reason = True, "rows"
                        break
                    entries.append(entry)
            except OSError:
                continue
            if truncated:
                break
        return {
            "entries": entries,
            "truncated": truncated,
            "reason": reason,
            "scanned_bytes": min(scanned, max_bytes),
            "scanned_days": days,
        }

    def _last_commit(self) -> dict[str, Any] | None:
        head = self.git._head(self.root)  # noqa: SLF001
        if head is None:
            return None
        if self._head_cache and self._head_cache[0] == head:
            return self._head_cache[1]
        result = self.git._git(  # noqa: SLF001
            self.root, "log", "-1", "--format=%H%x1f%ct%x1f%s", check=False
        )
        parts = result.stdout.strip().split("\x1f")
        if len(parts) != 3:
            return None
        info = {
            "sha": parts[0],
            "short": parts[0][:7],
            "timestamp": int(parts[1]),
            "message": parts[2],
        }
        self._head_cache = (head, info)
        return info

    def remote(self) -> tuple[str | None, bool]:
        """Return the remote address and whether a stored one is unusable."""
        with self._lock:
            return self.git._stored_remote(self.root)  # noqa: SLF001

    def status(self, today: str) -> dict[str, Any]:
        """Return facts about the record."""
        files = self._day_files()
        entries_today = 0
        total = 0
        size = 0
        for day, path in files:
            try:
                file_size, count = self._count(day, path)
            except OSError:
                continue
            size += file_size
            total += count
            if day == today:
                entries_today = count
        address, unusable = (None, False)
        last = None
        if (self.root / ".git").exists():
            address, unusable = self.remote()
            last = self._last_commit()
        return {
            "path": str(self.root),
            "entries_today": entries_today,
            "entries_total": total,
            "files": len(files),
            "bytes": size,
            "uncommitted_entries": self.uncommitted,
            "last_commit": last,
            "remote": address,
            "remote_unusable": unusable,
            "last_push": self.last_push,
        }

    def set_remote(self, url: str | None) -> None:
        """Set or remove the remote; refuse addresses that are not allowed."""
        with self._lock:
            self.git.set_remote(None, url)

    def push(self) -> dict[str, Any]:
        """Send the record to its remote. Never forced."""
        address, unusable = self.remote()
        if unusable:
            raise RepositoryError(
                "The address of the Git remote cannot be used. " + REMOTE_RULE
            )
        if address is None:
            raise RepositoryError("No Git remote is set.")
        if not self._push_lock.acquire(blocking=False):
            raise RepositoryError("A push to the Git remote is still running.")
        try:
            sent = self.git._git(  # noqa: SLF001
                self.root,
                "push",
                "--quiet",
                "origin",
                "HEAD:refs/heads/main",
                timeout=PUSH_TIMEOUT,
                check=False,
            )
        except RepositoryError as err:
            error = mask_text(str(err), address)[:300]
            self.last_push = {"at": int(time.time()), "ok": False, "error": error}
            raise RepositoryError(error) from err
        finally:
            self._push_lock.release()
        if sent.returncode == 0:
            now = int(time.time())
            self.last_push = {"at": now, "ok": True, "error": None}
            return {"pushed": True, "time": now}
        detail = (sent.stderr or sent.stdout).strip().splitlines()
        error = mask_text(detail[-1] if detail else "Push failed.", address)[:300]
        self.last_push = {"at": int(time.time()), "ok": False, "error": error}
        raise RepositoryError(error)
