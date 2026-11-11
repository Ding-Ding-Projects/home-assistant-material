"""The Git repository that holds the permanent activity record.

Layout under the record folder:

    YYYY/MM/YYYY-MM-DD.NNN.jsonl   chunks of one UTC day, one JSON entry per line
    YYYY/MM/YYYY-MM-DD.jsonl       a first-version day file, read as chunk 0

A new chunk starts at about CHUNK_BYTES and at the day change, so a commit only
stores the active chunk again. Files are only ever appended to. Nothing is
rewritten, deleted, purged or squashed; a hand edit that removed lines is undone
from the last commit. This module does not import Home Assistant, only the Git
helpers of the automation repositories. Every method blocks; callers run it in an
executor.
"""

from collections.abc import Sequence
import json
import os
from pathlib import Path
import shutil
import subprocess
import threading
import time
from typing import Any

from homeassistant.components.automation_repos.repos import (
    GIT_TIMEOUT,
    REMOTE_RULE,
    AutomationRepositories,
    RepositoryError,
    mask_text,
)

from .const import (
    AUTHOR_EMAIL,
    AUTHOR_NAME,
    CHUNK_BYTES,
    COMMIT_TIMEOUT,
    DAYS_LIMIT,
    PUSH_STEP_COMMITS,
    PUSH_TIMEOUT,
    STALE_LOCK_SECONDS,
)
from .record_core import (
    MAX_CHUNK_INDEX,
    chunk_path,
    commit_message,
    count_lines,
    format_cursor,
    iso_utc,
    iter_lines_pos,
    iter_lines_reversed_pos,
    matches,
    parse_chunk_name,
    parse_cursor,
    parse_line,
    raw_needle,
    restored_entry,
    serialize,
    valid_day,
)

README = """# Permanent activity record

This repository keeps every entry the Activity page of Home Assistant shows.
Each UTC day is stored in chunks of about 1 MB, `YYYY/MM/YYYY-MM-DD.NNN.jsonl`,
one JSON entry per line. Files are only appended to. Nothing is ever rewritten,
deleted or purged.
"""

GITIGNORE = """# Only the record itself is tracked.
*
!/.gitignore
!/README.md
!/[0-9][0-9][0-9][0-9]/
!/[0-9][0-9][0-9][0-9]/[0-9][0-9]/
!/[0-9][0-9][0-9][0-9]/[0-9][0-9]/*.jsonl
"""

STATE_FILE = ".activity_state.json"
LOCK_FILE = ".lock"

GIT_SETTINGS = (
    ("gc.auto", "500"),
    ("pack.threads", "1"),
    ("pack.windowMemory", "32m"),
    ("core.bigFileThreshold", "1m"),
    ("repack.writeBitmaps", "false"),
)

__all__ = [
    "REMOTE_RULE",
    "ActivityRepository",
    "BusyError",
    "PartialWriteError",
    "RepositoryError",
]


class BusyError(RepositoryError):
    """Another search is still running."""


class PartialWriteError(RepositoryError):
    """Some of the lines of a batch reached the disk before a failure."""

    def __init__(self, written: int, message: str) -> None:
        """Remember how many lines, counted from the first, were written."""
        super().__init__(message)
        self.written = written


def _fsync_dir(path: Path) -> None:
    try:
        descriptor = os.open(path, os.O_RDONLY)
    except OSError:
        return
    try:
        os.fsync(descriptor)
    except OSError:
        pass
    finally:
        os.close(descriptor)


class ActivityRepository:
    """The record folder and its Git repository."""

    def __init__(self, root: Path, ssh_dir: Path | None = None) -> None:
        """Set where the record lives and where its SSH key may be put."""
        self.root = Path(root)
        self.ssh_dir = ssh_dir
        self.git = AutomationRepositories(
            self.root, AUTHOR_NAME, AUTHOR_EMAIL, ssh_dir=ssh_dir
        )
        self.uncommitted = 0
        self.locked_out = False
        self.dropped_total = 0
        self.restores: list[dict[str, Any]] = []
        self.last_push: dict[str, Any] | None = None
        self.push_progress: dict[str, Any] | None = None
        self._append_lock = threading.RLock()
        self._state_lock = threading.Lock()
        self._commit_lock = threading.Lock()
        self._push_lock = threading.Lock()
        self._search_lock = threading.Lock()
        self._counts: dict[str, tuple[int, int]] = {}
        self._counts_dirty = False
        self._active: dict[str, int] = {}
        self._touched: set[str] = set()
        self._git_children = 0
        self._lock_suspect = False
        self._lock_handle: Any = None
        self._head_cache: tuple[str, dict[str, Any]] | None = None

    def _git(
        self, *args: str, timeout: int = GIT_TIMEOUT, check: bool = True
    ) -> subprocess.CompletedProcess[str]:
        with self._state_lock:
            self._git_children += 1
        try:
            return self.git._git(  # noqa: SLF001
                self.root, *args, timeout=timeout, check=check
            )
        except RepositoryError as err:
            if "did not answer" in str(err):
                self._lock_suspect = True
            raise
        finally:
            with self._state_lock:
                self._git_children -= 1

    def _git_bytes(self, *args: str) -> bytes | None:
        """Run a read-only Git command and return its raw output."""
        env = {
            "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
            "HOME": str(self.root),
            "GIT_CONFIG_NOSYSTEM": "1",
            "GIT_CONFIG_GLOBAL": os.devnull,
        }
        try:
            result = subprocess.run(
                ["git", *args],
                cwd=self.root,
                env=env,
                capture_output=True,
                timeout=GIT_TIMEOUT,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired):
            return None
        return result.stdout if result.returncode == 0 else None

    def acquire_lock(self) -> bool:
        """Take the exclusive lock of the record folder; False when it is held."""
        if self._lock_handle is not None:
            return True
        self.root.mkdir(parents=True, exist_ok=True)
        path = self.root / LOCK_FILE
        handle = path.open("a+b")
        try:
            try:
                import fcntl  # noqa: PLC0415

                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            except ImportError:
                import msvcrt  # noqa: PLC0415

                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)  # type: ignore[attr-defined]
        except OSError:
            handle.close()
            self.locked_out = True
            return False
        self._lock_handle = handle
        self.locked_out = False
        return True

    def release_lock(self) -> None:
        """Give the lock back."""
        handle, self._lock_handle = self._lock_handle, None
        if handle is not None:
            handle.close()

    def ensure_repository(self) -> None:
        """Create the folder and its repository when they are missing."""
        with self._append_lock:
            self.git._ensure_repository(self.root)  # noqa: SLF001
            for key, value in GIT_SETTINGS:
                self._git("config", key, value)
            readme = self.root / "README.md"
            if not readme.exists():
                readme.write_text(README, encoding="utf-8")
            ignore = self.root / ".gitignore"
            if not ignore.exists() or ignore.read_text(encoding="utf-8") != GITIGNORE:
                ignore.write_text(GITIGNORE, encoding="utf-8")
            self._load_state()

    def _load_state(self) -> None:
        try:
            data = json.loads((self.root / STATE_FILE).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return
        if not isinstance(data, dict):
            return
        total = data.get("dropped_total")
        if isinstance(total, int) and total > self.dropped_total:
            self.dropped_total = total
        counts = data.get("counts")
        if isinstance(counts, dict):
            for key, value in counts.items():
                if (
                    isinstance(key, str)
                    and isinstance(value, list)
                    and len(value) == 2
                    and all(isinstance(v, int) for v in value)
                ):
                    self._counts.setdefault(key, (value[0], value[1]))

    def save_state(self, dropped_total: int | None = None) -> None:
        """Write the ignored sidecar file: drop total and counts of chunks."""
        with self._state_lock:
            if dropped_total is not None:
                self.dropped_total = max(self.dropped_total, dropped_total)
            data = {
                "dropped_total": self.dropped_total,
                "counts": {k: list(v) for k, v in self._counts.items()},
            }
            self._counts_dirty = False
        path = self.root / STATE_FILE
        temp = path.with_name(STATE_FILE + ".tmp")
        try:
            with temp.open("w", encoding="utf-8") as handle:
                json.dump(data, handle, separators=(",", ":"))
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temp, path)
        except OSError:
            self._counts_dirty = True

    def startup(self) -> str | None:
        """Take the lock, then commit whatever is on disk, for example after a crash."""
        if not self.acquire_lock():
            return None
        self.ensure_repository()
        return self.commit("Record entries found on disk at start", at_start=True)

    def stop(self) -> None:
        """Save the sidecar file and give the lock back."""
        if self._lock_handle is not None:
            self.save_state()
        self.release_lock()

    def _active_chunk(self, day: str) -> tuple[int, int]:
        """Return (index, size) of the chunk that receives new lines of a day."""
        index = self._active.get(day)
        if index is None:
            found = [i for i, _ in self._chunks_of(day)]
            index = max(found) if found else 1
            if index == 0:
                index = 1
            if len(self._active) > 16:
                self._active.clear()
            self._active[day] = index
        path = chunk_path(self.root, day, index)
        try:
            return index, path.stat().st_size
        except OSError:
            return index, 0

    def _write_block(self, path: Path, block: bytes, lines: int) -> None:
        month, year = path.parent, path.parent.parent
        new_dirs = [d for d in (year, month) if not d.exists()]
        path.parent.mkdir(parents=True, exist_ok=True)
        existed = path.exists()
        size = path.stat().st_size if existed else 0
        if size:
            with path.open("rb") as probe:
                probe.seek(size - 1)
                if probe.read(1) != b"\n":
                    block = b"\n" + block
        try:
            with path.open("ab") as handle:
                handle.write(block)
                handle.flush()
                os.fsync(handle.fileno())
        except OSError:
            try:
                os.truncate(path, size)
            except OSError:
                pass
            raise
        if not existed:
            _fsync_dir(month)
        for directory in new_dirs:
            _fsync_dir(directory.parent)
        relative = path.relative_to(self.root).as_posix()
        with self._state_lock:
            cached = self._counts.get(relative)
            if cached is not None and cached[0] == size:
                self._counts[relative] = (size + len(block), cached[1] + lines)
                self._counts_dirty = True
            self._touched.add(relative)
            self.uncommitted += lines

    def append(self, items: Sequence[tuple[str, bytes]]) -> int:
        """Append lines to their chunks and flush them; return how many were written.

        Lines are written in order, so a failure leaves a prefix on disk and
        raises PartialWriteError with its length.
        """
        if self.locked_out:
            raise RepositoryError("Another Home Assistant is recording into this folder.")
        written = 0
        with self._append_lock:
            try:
                while written < len(items):
                    day = items[written][0]
                    end = written
                    while end < len(items) and items[end][0] == day:
                        end += 1
                    index, size = self._active_chunk(day)
                    if size and size + len(items[written][1]) > CHUNK_BYTES:
                        if index < MAX_CHUNK_INDEX:
                            index, size = index + 1, 0
                    take = written
                    total = 0
                    while take < end and (
                        take == written
                        or index == MAX_CHUNK_INDEX
                        or size + total + len(items[take][1]) <= CHUNK_BYTES
                    ):
                        total += len(items[take][1])
                        take += 1
                    block = b"".join(line for _, line in items[written:take])
                    self._write_block(
                        chunk_path(self.root, day, index), block, take - written
                    )
                    self._active[day] = index
                    written = take
            except OSError as err:
                if written:
                    raise PartialWriteError(written, str(err)) from err
                raise
        return written

    def _chunks_of(self, day: str) -> list[tuple[int, Path]]:
        month = self.root / day[:4] / day[5:7]
        found: list[tuple[int, Path]] = []
        try:
            with os.scandir(month) as entries:
                for item in entries:
                    parsed = parse_chunk_name(item.name)
                    if (
                        parsed
                        and parsed[0] == day
                        and item.is_file(follow_symlinks=False)
                    ):
                        found.append((parsed[1], Path(item.path)))
        except OSError:
            return []
        found.sort()
        return found

    def _all_chunks(self) -> dict[str, list[tuple[int, Path]]]:
        found: dict[str, list[tuple[int, Path]]] = {}
        try:
            years = [
                y for y in os.scandir(self.root) if y.name.isdigit() and y.is_dir(follow_symlinks=False)
            ]
        except OSError:
            return found
        for year in years:
            try:
                months = [
                    m for m in os.scandir(year.path) if m.is_dir(follow_symlinks=False)
                ]
            except OSError:
                continue
            for month in months:
                try:
                    items = list(os.scandir(month.path))
                except OSError:
                    continue
                for item in items:
                    parsed = parse_chunk_name(item.name)
                    if (
                        parsed
                        and parsed[0][:4] == year.name
                        and parsed[0][5:7] == month.name
                        and item.is_file(follow_symlinks=False)
                    ):
                        found.setdefault(parsed[0], []).append(
                            (parsed[1], Path(item.path))
                        )
        for chunks in found.values():
            chunks.sort()
        return found

    def _count(self, path: Path) -> tuple[int, int]:
        size = path.stat().st_size
        relative = path.relative_to(self.root).as_posix()
        cached = self._counts.get(relative)
        if cached is not None and cached[0] == size:
            return cached
        count = count_lines(path)
        with self._state_lock:
            self._counts[relative] = (size, count)
            self._counts_dirty = True
        return size, count

    def _day_totals(self, chunks: list[tuple[int, Path]]) -> tuple[int, int]:
        size = count = 0
        for _, path in chunks:
            try:
                chunk_size, chunk_count = self._count(path)
            except OSError:
                continue
            size += chunk_size
            count += chunk_count
        return size, count

    def days(self, limit: int = DAYS_LIMIT, offset: int = 0) -> dict[str, Any]:
        """List the days that have a file, newest first, with entry counts."""
        found = self._all_chunks()
        ordered = sorted(found, reverse=True)
        rows = []
        for day in ordered[offset : offset + limit]:
            size, count = self._day_totals(found[day])
            rows.append(
                {"day": day, "entries": count, "bytes": size, "chunks": len(found[day])}
            )
        if self._counts_dirty and self._lock_handle is not None:
            self.save_state()
        return {"days": rows, "total": len(ordered), "offset": offset}

    def read(
        self,
        day: str,
        cursor: str | None,
        limit: int,
        newest_first: bool,
    ) -> dict[str, Any]:
        """Read the entries of one day across its chunks, from a cursor.

        The cursor names a chunk and a byte position. The record is append
        only, so a position stays valid while new entries arrive.
        """
        if valid_day(day) is None:
            raise RepositoryError("That is not a day.")
        parsed = None
        if cursor is not None:
            parsed = parse_cursor(cursor)
            if parsed is None:
                raise RepositoryError("That is not a cursor.")
        chunks = self._chunks_of(day)
        entries: list[dict[str, Any]] = []
        next_cursor: str | None = None
        has_more = False
        ordered = list(reversed(chunks)) if newest_first else chunks
        done = False
        for index, path in ordered:
            if done:
                break
            if parsed is not None:
                if (newest_first and index > parsed[0]) or (
                    not newest_first and index < parsed[0]
                ):
                    continue
            point = parsed[1] if parsed is not None and parsed[0] == index else None
            try:
                size = path.stat().st_size
                if point is not None:
                    point = min(point, size)
                lines = (
                    iter_lines_reversed_pos(path, point)
                    if newest_first
                    else iter_lines_pos(path, point or 0)
                )
                for position, line in lines:
                    if (entry := parse_line(line)) is None:
                        continue
                    if len(entries) >= limit:
                        has_more = True
                        done = True
                        break
                    entries.append(entry)
                    next_cursor = format_cursor(index, position)
            except OSError:
                continue
        _, total = self._day_totals(chunks)
        return {
            "day": day,
            "entries": entries,
            "total": total,
            "limit": limit,
            "has_more": has_more,
            "next_cursor": next_cursor if has_more else None,
        }

    def search(
        self,
        start: str | None,
        end: str | None,
        entity_id: str | None,
        text: str | None,
        limit: int,
        max_bytes: int,
        cancel: threading.Event | None = None,
    ) -> dict[str, Any]:
        """Search the days in a range, newest first, within a byte budget.

        One search runs at a time. The text is tried on the raw line first so
        that most lines are never parsed.
        """
        first = valid_day(start) if start else None
        last = valid_day(end) if end else None
        if (start and first is None) or (end and last is None):
            raise RepositoryError("That is not a day.")
        if not self._search_lock.acquire(blocking=False):
            raise BusyError("A search is already running.")
        try:
            return self._search(first, last, entity_id, text, limit, max_bytes, cancel)
        finally:
            self._search_lock.release()

    def _search(
        self,
        first: Any,
        last: Any,
        entity_id: str | None,
        text: str | None,
        limit: int,
        max_bytes: int,
        cancel: threading.Event | None,
    ) -> dict[str, Any]:
        needle = raw_needle(text)
        entries: list[dict[str, Any]] = []
        scanned = 0
        lines_seen = 0
        days = 0
        truncated = False
        reason = None
        found = self._all_chunks()
        for day in sorted(found, reverse=True):
            if (first and day < first.isoformat()) or (last and day > last.isoformat()):
                continue
            days += 1
            for _, path in reversed(found[day]):
                try:
                    for _, line in iter_lines_reversed_pos(path):
                        scanned += len(line) + 1
                        if scanned > max_bytes:
                            truncated, reason = True, "bytes"
                            break
                        lines_seen += 1
                        if lines_seen % 2000 == 0:
                            time.sleep(0.001)
                            if cancel is not None and cancel.is_set():
                                truncated, reason = True, "cancelled"
                                break
                        if needle is not None and needle not in line.lower():
                            continue
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
            if truncated:
                break
        return {
            "entries": entries,
            "truncated": truncated,
            "reason": reason,
            "scanned_bytes": min(scanned, max_bytes),
            "scanned_days": days,
        }

    def _status_entries(self, untracked: str) -> list[tuple[str, str]]:
        result = self._git(
            "status",
            "--porcelain=v1",
            "-z",
            f"--untracked-files={untracked}",
            timeout=COMMIT_TIMEOUT,
        )
        entries = []
        parts = result.stdout.split("\0")
        index = 0
        while index < len(parts):
            part = parts[index]
            index += 1
            if len(part) < 4:
                continue
            code, path = part[:2], part[3:]
            if code[0] in "RC":
                index += 1
            entries.append((code, path))
        return entries

    def _clear_stale_lock(self) -> None:
        """Remove an index.lock left behind by a Git that was killed."""
        lock = self.root / ".git" / "index.lock"
        try:
            age = time.time() - lock.stat().st_mtime
        except OSError:
            return
        with self._state_lock:
            busy = self._git_children > 0
        if busy or not (age > STALE_LOCK_SECONDS or self._lock_suspect):
            return
        try:
            lock.unlink()
        except OSError:
            return
        self._lock_suspect = False

    def _note_restore(self, path: str, what: str) -> None:
        now = time.time()
        message = (
            f"A hand edit of {path} was undone: {what}. "
            "The record is append only."
        )
        self.restores = [
            {"at": int(now), "path": path, "what": what},
            *self.restores[:19],
        ]
        entry = restored_entry(message, now)
        self.append([(iso_utc(now)[:10], serialize(entry))])

    def _guard_hand_edits(self, entries: list[tuple[str, str]]) -> None:
        """Undo a deleted day file or a removed line before anything is committed."""
        if self._git("rev-parse", "--verify", "--quiet", "HEAD", check=False).returncode:
            return
        chunks = [(c, p) for c, p in entries if self._is_chunk(p)]
        modified = []
        for code, path in chunks:
            if "D" in code and "A" not in code:
                with self._append_lock:
                    self._git("checkout", "HEAD", "--", path, timeout=COMMIT_TIMEOUT)
                    self._forget_count(path)
                self._note_restore(path, "the file had been deleted")
            elif "M" in code:
                modified.append(path)
        if not modified:
            return
        numstat = self._git("diff", "--numstat", "HEAD", timeout=COMMIT_TIMEOUT).stdout
        removed = {
            columns[2]
            for line in numstat.splitlines()
            if len(columns := line.split("\t", 2)) == 3
            and columns[1] not in ("0", "")
        }
        for path in modified:
            if path in removed:
                self._restore_modified(path)

    def _restore_modified(self, path: str) -> None:
        target = self.root / path
        with self._append_lock:
            head = self._git_bytes("show", f"HEAD:{path}")
            try:
                edited = target.read_bytes()
            except OSError:
                return
            if head is None or edited.startswith(head):
                return
            backup = target.with_name(f"{target.name}.hand-edited.{int(time.time())}")
            shutil.copyfile(target, backup)
            known = set(head.splitlines())
            tail = [
                line
                for line in edited.splitlines()
                if line.strip() and line not in known
            ]
            restored = head
            if restored and not restored.endswith(b"\n"):
                restored += b"\n"
            restored += b"".join(line + b"\n" for line in tail)
            temp = target.with_name(target.name + ".restore")
            with temp.open("wb") as handle:
                handle.write(restored)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temp, target)
            self._forget_count(path)
        self._note_restore(
            path,
            "lines had been removed or changed; the last committed lines are back "
            "and a copy of the edited file was kept beside it",
        )

    def _forget_count(self, path: str) -> None:
        with self._state_lock:
            self._counts.pop(path, None)
            self._active.clear()

    @staticmethod
    def _is_chunk(path: str) -> bool:
        parts = path.split("/")
        parsed = parse_chunk_name(parts[-1])
        return (
            len(parts) == 3
            and parsed is not None
            and parsed[0][:4] == parts[0]
            and parsed[0][5:7] == parts[1]
        )

    def commit(self, reason: str | None = None, at_start: bool = False) -> str | None:
        """Commit the day files that changed; return the new commit or None.

        Only chunk files, the README and the ignore file are added, by name, so
        a stray file is never swept in and what was staged by hand is not
        committed. The append lock is held only while files are added.
        """
        if self.locked_out:
            return None
        with self._commit_lock:
            self._clear_stale_lock()
            entries = self._status_entries("all" if at_start else "no")
            self._guard_hand_edits(entries)
            with self._state_lock:
                count = self.uncommitted
                touched = set(self._touched)
            paths = touched | {
                p for _, p in entries if self._is_chunk(p) or p in ("README.md", ".gitignore")
            }
            paths = {p for p in paths if (self.root / p).exists()}
            with self._append_lock:
                self._git("reset", "--quiet", check=False, timeout=COMMIT_TIMEOUT)
                ordered = sorted(paths)
                for index in range(0, len(ordered), 200):
                    self._git(
                        "add", "--", *ordered[index : index + 200], timeout=COMMIT_TIMEOUT
                    )
            staged = self._git("diff", "--cached", "--quiet", check=False)
            if staged.returncode == 0:
                self._finish_commit(touched, count)
                return None
            self._git(
                "commit",
                "--quiet",
                "-m",
                commit_message(count, reason),
                timeout=COMMIT_TIMEOUT,
            )
            self._finish_commit(touched, count)
            if self._counts_dirty:
                self.save_state()
            return self.git._head(self.root)  # noqa: SLF001

    def _finish_commit(self, touched: set[str], count: int) -> None:
        with self._state_lock:
            self._touched -= touched
            self.uncommitted = max(0, self.uncommitted - count)

    def _last_commit(self) -> dict[str, Any] | None:
        head = self.git._head(self.root)  # noqa: SLF001
        if head is None:
            return None
        if self._head_cache and self._head_cache[0] == head:
            return self._head_cache[1]
        result = self._git("log", "-1", "--format=%H%x1f%ct%x1f%s", check=False)
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
        with self._append_lock:
            return self.git._stored_remote(self.root)  # noqa: SLF001

    def status(self, today: str) -> dict[str, Any]:
        """Return facts about the record."""
        found = self._all_chunks()
        entries_today = 0
        total = 0
        size = 0
        files = 0
        for day, chunks in found.items():
            files += len(chunks)
            day_size, day_count = self._day_totals(chunks)
            size += day_size
            total += day_count
            if day == today:
                entries_today = day_count
        if self._counts_dirty and self._lock_handle is not None:
            self.save_state()
        address, unusable = (None, False)
        last = None
        if (self.root / ".git").exists():
            address, unusable = self.remote()
            last = self._last_commit()
        return {
            "path": str(self.root),
            "entries_today": entries_today,
            "entries_total": total,
            "files": files,
            "days": len(found),
            "bytes": size,
            "uncommitted_entries": self.uncommitted,
            "last_commit": last,
            "remote": address,
            "remote_unusable": unusable,
            "last_push": self.last_push,
            "push": dict(self.push_progress) if self.push_progress else None,
            "lock_held": self.locked_out,
            "restores": self.restores,
            "ssh_dir": str(self.ssh_dir) if self.ssh_dir else None,
        }

    def set_remote(self, url: str | None) -> None:
        """Set or remove the remote; refuse addresses that are not allowed."""
        with self._append_lock:
            self.git.set_remote(None, url)

    def push_precheck(self) -> str:
        """Return the remote address, or raise when a push cannot start."""
        address, unusable = self.remote()
        if unusable:
            raise RepositoryError(
                "The address of the Git remote cannot be used. " + REMOTE_RULE
            )
        if address is None:
            raise RepositoryError("No Git remote is set.")
        if self._push_lock.locked():
            raise RepositoryError("A push to the Git remote is still running.")
        return address

    def _remote_tip(self, address: str) -> str | None:
        result = self._git(
            "ls-remote", "origin", "refs/heads/main", check=False, timeout=PUSH_TIMEOUT
        )
        if result.returncode != 0:
            detail = (result.stderr or result.stdout).strip().splitlines()
            raise RepositoryError(
                mask_text(detail[-1] if detail else "The remote did not answer.", address)
            )
        first = result.stdout.split()
        return first[0] if first else None

    def _steps(self, tip: str | None) -> list[str]:
        """Return the commits to push one after another, ending with HEAD."""
        if tip is not None:
            ancestor = self._git(
                "merge-base", "--is-ancestor", tip, "HEAD", check=False
            )
            if ancestor.returncode != 0:
                return ["HEAD"]
            span = f"{tip}..HEAD"
        else:
            span = "HEAD"
        commits = self._git("rev-list", "--reverse", span).stdout.split()
        if not commits:
            return ["HEAD"]
        steps = commits[PUSH_STEP_COMMITS - 1 :: PUSH_STEP_COMMITS]
        if not steps or steps[-1] != commits[-1]:
            steps.append(commits[-1])
        return steps

    def push(self) -> dict[str, Any]:
        """Send the record to its remote in steps. Never forced."""
        address = self.push_precheck()
        if not self._push_lock.acquire(blocking=False):
            raise RepositoryError("A push to the Git remote is still running.")
        progress: dict[str, Any] = {
            "running": True,
            "step": 0,
            "steps": 0,
            "started_at": int(time.time()),
            "error": None,
        }
        self.push_progress = progress
        try:
            self.commit()
            steps = self._steps(self._remote_tip(address))
            progress["steps"] = len(steps)
            for number, target in enumerate(steps, start=1):
                sent = self._git(
                    "push",
                    "--quiet",
                    "origin",
                    f"{target}:refs/heads/main",
                    timeout=PUSH_TIMEOUT,
                    check=False,
                )
                if sent.returncode != 0:
                    detail = (sent.stderr or sent.stdout).strip().splitlines()
                    raise RepositoryError(detail[-1] if detail else "Push failed.")
                progress["step"] = number
        except (RepositoryError, OSError) as err:
            error = mask_text(str(err), address)[:300]
            progress.update(running=False, error=error)
            self.last_push = {"at": int(time.time()), "ok": False, "error": error}
            raise RepositoryError(error) from err
        finally:
            progress["running"] = False
            self._push_lock.release()
        now = int(time.time())
        self.last_push = {"at": now, "ok": True, "error": None}
        return {"pushed": True, "time": now}
