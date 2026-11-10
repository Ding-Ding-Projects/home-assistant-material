"""Record logged problems as Markdown files in a local Git repository."""

from dataclasses import dataclass
from datetime import datetime
import logging
import os
from pathlib import Path
import shutil
import subprocess
from typing import Any

from homeassistant.const import __version__
from homeassistant.core import CALLBACK_TYPE, HomeAssistant, callback
from homeassistant.helpers.event import async_call_later
from homeassistant.util import dt as dt_util

from .const import COMMIT_INTERVAL, GIT_TIMEOUT, MAX_FILES, MAX_PENDING, REPO_DIR
from .problem_core import (
    commit_message,
    files_to_prune,
    merge_problem,
    parse_problem,
    problem_filename,
    redact,
)

_LOGGER = logging.getLogger(__name__)
_OWN_LOGGER_PREFIX = __name__.rsplit(".", 1)[0]

_GIT_IDENTITY = [
    "-c",
    "user.name=Home Assistant Problem Log",
    "-c",
    "user.email=problem-log@localhost",
    "-c",
    "commit.gpgsign=false",
]


@dataclass
class PendingProblem:
    """One distinct problem waiting to be written."""

    filename: str
    logger: str
    level: str
    message: str
    traceback: str
    seen_at: str
    occurrences: int = 1


class ProblemLogHandler(logging.Handler):
    """Hand warnings and errors to the log from any thread."""

    def __init__(self, log: "ProblemLog") -> None:
        """Initialize the handler."""
        super().__init__(logging.WARNING)
        self._log = log

    def emit(self, record: logging.LogRecord) -> None:
        """Queue the record; never log from here."""
        if record.name.startswith(_OWN_LOGGER_PREFIX):
            return
        try:
            message = record.getMessage()
            trace = ""
            if record.exc_info:
                trace = logging.Formatter().formatException(record.exc_info)
            elif record.exc_text:
                trace = record.exc_text
            self._log.hass.loop.call_soon_threadsafe(
                self._log.async_add_problem,
                record.name,
                record.levelname,
                message,
                trace,
            )
        except Exception:  # noqa: BLE001
            return


class ProblemLog:
    """Write distinct problems to files and commit them on a debounce."""

    def __init__(self, hass: HomeAssistant) -> None:
        """Initialize."""
        self.hass = hass
        self.path = Path(hass.config.path(REPO_DIR))
        self.git = shutil.which("git")
        self._pending: dict[str, PendingProblem] = {}
        self._timer: CALLBACK_TYPE | None = None
        self._secrets: list[str] = []
        self._warned_no_git = False
        self._warned_push = False
        self.handler = ProblemLogHandler(self)

    @callback
    def async_add_problem(
        self, logger: str, level: str, message: str, traceback: str
    ) -> None:
        """Record one sighting in memory and schedule a write."""
        filename = problem_filename(logger, message, self._secrets)
        seen_at = dt_util.utcnow().isoformat(timespec="seconds")
        if (pending := self._pending.get(filename)) is not None:
            pending.occurrences += 1
            pending.seen_at = seen_at
        elif len(self._pending) < MAX_PENDING:
            self._pending[filename] = PendingProblem(
                filename,
                logger,
                level,
                redact(message, self._secrets),
                redact(traceback, self._secrets),
                seen_at,
            )
        if self._timer is None:
            self._timer = async_call_later(
                self.hass, COMMIT_INTERVAL, self._async_flush_timer
            )

    async def _async_flush_timer(self, _: datetime) -> None:
        self._timer = None
        await self.async_flush()

    @callback
    def async_stop(self) -> None:
        """Cancel the timer."""
        if self._timer is not None:
            self._timer()
            self._timer = None

    async def async_flush(self) -> None:
        """Write everything pending and commit it."""
        if not self._pending:
            return
        pending = list(self._pending.values())
        self._pending = {}
        try:
            self._secrets = await self.hass.async_add_executor_job(self._load_secrets)
            await self.hass.async_add_executor_job(self._write_and_commit, pending)
        except (OSError, subprocess.SubprocessError) as err:
            _LOGGER.warning("Could not write the problem log: %s", err)

    def _load_secrets(self) -> list[str]:
        """Read exact values from secrets.yaml so they are never written."""
        path = Path(self.hass.config.path("secrets.yaml"))
        try:
            import yaml  # noqa: PLC0415

            data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        except Exception:  # noqa: BLE001
            return []
        if not isinstance(data, dict):
            return []
        return [str(v) for v in data.values() if isinstance(v, str | int | float)]

    def _run_git(self, *args: str) -> subprocess.CompletedProcess[str]:
        if self.git is None:
            raise OSError("git is not available")
        env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}
        return subprocess.run(
            [self.git, *_GIT_IDENTITY, *args],
            cwd=self.path,
            capture_output=True,
            text=True,
            timeout=GIT_TIMEOUT,
            check=False,
            env=env,
        )

    def _write_and_commit(self, pending: list[PendingProblem]) -> None:
        self.path.mkdir(parents=True, exist_ok=True)
        if self.git is None and not self._warned_no_git:
            self._warned_no_git = True
            _LOGGER.warning(
                "The git program was not found; problems are written to %s without commits",
                self.path,
            )
        if self.git is not None and not (self.path / ".git").exists():
            self._run_git("init")
        for item in pending:
            target = self.path / item.filename
            existing = target.read_text(encoding="utf-8") if target.exists() else None
            text = merge_problem(
                existing,
                logger=item.logger,
                level=item.level,
                version=__version__,
                message=item.message,
                traceback=item.traceback,
                seen_at=item.seen_at,
                occurrences=item.occurrences,
                secrets=self._secrets,
            )
            target.write_text(text, encoding="utf-8")
        self._prune()
        if self.git is None:
            return
        self._run_git("add", "-A")
        if not self._run_git("status", "--porcelain").stdout.strip():
            return
        self._run_git("commit", "-m", commit_message(len(pending)))
        if "origin" in self._run_git("remote").stdout.split():
            result = self._run_git("push", "origin", "HEAD")
            if result.returncode != 0 and not self._warned_push:
                self._warned_push = True
                _LOGGER.warning("Could not push the problem log to origin")

    def _entries(self) -> list[tuple[str, str]]:
        entries = []
        for item in self.path.glob("*.md"):
            parsed = parse_problem(item.read_text(encoding="utf-8"))
            entries.append((item.name, str(parsed["last_seen"]) if parsed else ""))
        return entries

    def _prune(self) -> None:
        if sum(1 for _ in self.path.glob("*.md")) <= MAX_FILES:
            return
        for name in files_to_prune(self._entries(), MAX_FILES):
            (self.path / name).unlink(missing_ok=True)

    def list_problems(self) -> dict[str, Any]:
        """Return the recorded problems (call in an executor)."""
        problems = []
        if self.path.exists():
            for item in sorted(self.path.glob("*.md")):
                parsed = parse_problem(item.read_text(encoding="utf-8"))
                if parsed is None:
                    continue
                body = str(parsed.pop("body"))
                parsed["file"] = item.name
                parsed["detail"] = body[:6000]
                problems.append(parsed)
        problems.sort(key=lambda p: str(p["last_seen"]), reverse=True)
        has_remote = False
        if self.git and (self.path / ".git").exists():
            has_remote = "origin" in self._run_git("remote").stdout.split()
        return {
            "path": str(self.path),
            "git_available": self.git is not None,
            "has_remote": has_remote,
            "problems": problems,
        }
