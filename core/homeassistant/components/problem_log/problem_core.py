"""Pure helpers for the problem log: naming, counting, redaction and pruning.

Nothing in this module imports Home Assistant, performs input or output, or
reads the clock, so every function can be tested on its own.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
import hashlib
import re

REMOVED = "[removed]"

MAX_MESSAGE_CHARS = 4000
MAX_TRACEBACK_CHARS = 12000
MAX_SLUG_CHARS = 60
HASH_CHARS = 8

# A URL that carries credentials: scheme://user:password@host
_URL_CREDENTIALS = re.compile(r"(?P<scheme>[A-Za-z][A-Za-z0-9+.-]*://)[^\s/@]+@")

# An authorization header value.
_BEARER = re.compile(r"(?i)\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{6,}")

# key=value or key: value where the key names a confidential value.
_SENSITIVE_PAIR = re.compile(
    r"(?i)(?P<key>[\w.-]*(?:password|passwd|passphrase|pwd|secret|token|api[_-]?key"
    r"|apikey|access[_-]?key|private[_-]?key|authorization|auth[_-]?key|credential"
    r"|signature|session[_-]?id|webhook[_-]?id)[\w.-]*)"
    r"(?P<sep>[\"']?\s*[:=]\s*)(?P<quote>[\"']?)(?P<value>[^\s\"',;&})\]]+)"
)

_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}")

_JWT = re.compile(r"\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*")

_LONG_HEX = re.compile(r"\b[0-9a-fA-F]{32,}\b")

_LONG_RUN = re.compile(r"[A-Za-z0-9+/_=-]{32,}")

_DIGITS = re.compile(r"\d+")
_SLUG_UNSAFE = re.compile(r"[^a-z0-9._-]+")


def _redact_long_run(match: re.Match[str]) -> str:
    """Remove a long base64-like run, but keep ordinary long paths and words."""
    run = match.group(0)
    has_upper = any(c.isupper() for c in run)
    has_lower = any(c.islower() for c in run)
    has_digit = any(c.isdigit() for c in run)
    if has_upper and has_lower and has_digit:
        return REMOVED
    return run


def _redact_pair(match: re.Match[str]) -> str:
    """Keep the key, remove the value."""
    value = match.group("value")
    if value == REMOVED or value.startswith("[removed]"):
        return match.group(0)
    return f"{match.group('key')}{match.group('sep')}{match.group('quote')}{REMOVED}"


def redact(text: str, secrets: Iterable[str] = ()) -> str:
    """Replace anything that looks confidential with "[removed]".

    `secrets` are exact values (for example read from secrets.yaml) that are
    removed wherever they appear, whatever surrounds them.
    """
    for secret in sorted({s for s in secrets if s and len(s) >= 4}, key=len, reverse=True):
        text = text.replace(secret, REMOVED)
    text = _URL_CREDENTIALS.sub(lambda m: f"{m.group('scheme')}{REMOVED}@", text)
    text = _BEARER.sub(lambda m: f"{m.group(1)} {REMOVED}", text)
    text = _SENSITIVE_PAIR.sub(_redact_pair, text)
    text = _JWT.sub(REMOVED, text)
    text = _EMAIL.sub(REMOVED, text)
    text = _LONG_HEX.sub(REMOVED, text)
    return _LONG_RUN.sub(_redact_long_run, text)


def first_line(message: str) -> str:
    """Return the first non-empty line of a message."""
    for line in message.splitlines():
        if line.strip():
            return line.strip()
    return ""


def _slug(name: str) -> str:
    slug = _SLUG_UNSAFE.sub("-", name.lower()).strip("-._")
    return slug[:MAX_SLUG_CHARS].strip("-._") or "unknown"


def problem_filename(logger: str, message: str, secrets: Iterable[str] = ()) -> str:
    """Return the stable file name for one distinct problem.

    The name is the logger name plus a short hash of the redacted first line of
    the message. Digit runs are collapsed before hashing so that a counter, a
    port or a duration inside the line does not create a new file each time.
    """
    line = _DIGITS.sub("#", redact(first_line(message), secrets))
    digest = hashlib.sha256(line.encode("utf-8")).hexdigest()[:HASH_CHARS]
    return f"{_slug(logger)}-{digest}.md"


def _truncate(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    return text[:limit] + "\n[truncated]"


def render_problem(
    *,
    logger: str,
    level: str,
    version: str,
    message: str,
    traceback: str,
    first_seen: str,
    last_seen: str,
    count: int,
    secrets: Iterable[str] = (),
) -> str:
    """Render one problem as a Markdown document (message and traceback redacted)."""
    message = _truncate(redact(message, secrets), MAX_MESSAGE_CHARS)
    traceback = _truncate(redact(traceback, secrets), MAX_TRACEBACK_CHARS)
    summary = first_line(message)[:200]
    lines = [
        f"# {summary or logger}",
        "",
        f"- First seen: {first_seen}",
        f"- Last seen: {last_seen}",
        f"- Count: {count}",
        f"- Version: {version}",
        f"- Logger: {logger}",
        f"- Level: {level}",
        "",
        "## Message",
        "",
        "~~~~text",
        message,
        "~~~~",
    ]
    if traceback.strip():
        lines += ["", "## Traceback", "", "~~~~text", traceback.rstrip(), "~~~~"]
    return "\n".join(lines) + "\n"


_META_FIELDS = {
    "First seen": "first_seen",
    "Last seen": "last_seen",
    "Count": "count",
    "Version": "version",
    "Logger": "logger",
    "Level": "level",
}
_META_LINE = re.compile(r"^- (?P<name>[A-Za-z ]+): (?P<value>.*)$")


def parse_problem(text: str) -> dict[str, str | int] | None:
    """Read the header of a problem document, or return None if it is not one."""
    result: dict[str, str | int] = {}
    lines = text.splitlines()
    if not lines or not lines[0].startswith("# "):
        return None
    result["title"] = lines[0][2:]
    for line in lines[1:]:
        if line.startswith("## "):
            break
        match = _META_LINE.match(line)
        if match and match.group("name") in _META_FIELDS:
            result[_META_FIELDS[match.group("name")]] = match.group("value")
    if not {"first_seen", "last_seen", "count"} <= result.keys():
        return None
    try:
        result["count"] = int(result["count"])
    except ValueError:
        return None
    body_start = text.find("\n## ")
    result["body"] = text[body_start + 1 :] if body_start != -1 else ""
    return result


def merge_problem(
    existing: str | None,
    *,
    logger: str,
    level: str,
    version: str,
    message: str,
    traceback: str,
    seen_at: str,
    occurrences: int = 1,
    secrets: Iterable[str] = (),
) -> str:
    """Return the document after another sighting.

    A new problem starts with its first and last seen both set to `seen_at`.
    An existing one keeps its first seen and message, and gets a new last seen,
    the latest version and a larger count.
    """
    parsed = parse_problem(existing) if existing else None
    if parsed is None:
        return render_problem(
            logger=logger,
            level=level,
            version=version,
            message=message,
            traceback=traceback,
            first_seen=seen_at,
            last_seen=seen_at,
            count=occurrences,
            secrets=secrets,
        )
    assert existing is not None
    lines = existing.splitlines()
    out: list[str] = []
    in_header = True
    for line in lines:
        if in_header and line.startswith("## "):
            in_header = False
        if in_header and line.startswith("- Last seen: "):
            line = f"- Last seen: {seen_at}"
        elif in_header and line.startswith("- Count: "):
            line = f"- Count: {int(parsed['count']) + occurrences}"
        elif in_header and line.startswith("- Version: "):
            line = f"- Version: {version}"
        out.append(line)
    return "\n".join(out) + "\n"


def files_to_prune(entries: Sequence[tuple[str, str]], limit: int) -> list[str]:
    """Return the file names to delete so that at most `limit` remain.

    `entries` are (file name, last seen) pairs; the oldest last seen go first,
    with the file name as a stable tie-breaker.
    """
    if limit < 0:
        raise ValueError("limit must not be negative")
    excess = len(entries) - limit
    if excess <= 0:
        return []
    ordered = sorted(entries, key=lambda entry: (entry[1], entry[0]))
    return [name for name, _ in ordered[:excess]]


def commit_message(count: int) -> str:
    """Return the plain message for a commit that records `count` problems."""
    return f"Record {count} problem" + ("" if count == 1 else "s")
