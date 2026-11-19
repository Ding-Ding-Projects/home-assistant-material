"""The files a send writes to the repository, and when a send is allowed.

Pure: no Home Assistant imports, no input or output, no clock. The texts made
here are not yet redacted; the caller passes them through
`send_redact.redact_for_sending` before showing or sending them, so the preview
and the real send come from the same code path.
"""

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta, tzinfo
import json

SEND_INTERVAL = timedelta(hours=1)
LATEST_LIMIT = 100
DETAIL_LIMIT = 4000

STATUS_SENT = "sent"
STATUS_NOT_SENT = "not_sent"
STATUS_HELD = "held"

README = """# Problem log

This repository is written by Home Assistant Material. Each commit is one send
of the problem log of one home: the warnings and errors it recorded, so that
whoever helps with this home can read what went wrong.

Before anything is sent, passwords, tokens and keys, web addresses with
sign-ins or secrets, network addresses, host names, places and coordinates,
the names of people, and the names given to things are hidden. Things are
shown with stable labels such as "camera 2".

Home Assistant only ever writes here. Nothing in this repository is read back
or changes the home.

- `latest.md`: the newest problems first.
- `problems/<date>.md`: the problems last seen on that date.
- `problems/index.json`: every problem in this send, for tools.
- `system.md`: the build, the versions and which integrations are set up.
"""


@dataclass(frozen=True)
class Problem:
    """One recorded problem, as read from the local problem log."""

    file: str
    title: str
    logger: str
    level: str
    version: str
    first_seen: str
    last_seen: str
    count: int
    detail: str

    @classmethod
    def from_record(cls, record: Mapping[str, object]) -> Problem:
        """Build from one entry of `ProblemLog.list_problems`."""
        try:
            count = int(str(record.get("count", 1)))
        except ValueError:
            count = 1
        return cls(
            file=str(record["file"]),
            title=str(record.get("title", "")),
            logger=str(record.get("logger", "")),
            level=str(record.get("level", "")),
            version=str(record.get("version", "")),
            first_seen=str(record.get("first_seen", "")),
            last_seen=str(record.get("last_seen", "")),
            count=count,
            detail=str(record.get("detail", "")),
        )


@dataclass(frozen=True)
class SystemInfo:
    """What system.md says. Nothing here may be private."""

    build: str
    python: str
    installation: str
    operating_system: str
    architecture: str
    integrations: Sequence[str]


def integration_of(logger: str) -> str:
    """Return the integration a logger belongs to ("camera_recording")."""
    parts = logger.split(".")
    for marker in ("components", "custom_components"):
        if marker in parts:
            index = parts.index(marker)
            if index + 1 < len(parts):
                return parts[index + 1]
    if parts and parts[0] == "homeassistant" and len(parts) > 1:
        return parts[1]
    return logger or "unknown"


def status_of(problem: Problem, sent: Mapping[str, int], held: Iterable[str]) -> str:
    """Return whether a problem is sent, waiting to be sent, or held back."""
    if problem.file in set(held):
        return STATUS_HELD
    if sent.get(problem.file) == problem.count:
        return STATUS_SENT
    return STATUS_NOT_SENT


def counts(
    problems: Iterable[Problem], sent: Mapping[str, int], held: Iterable[str]
) -> dict[str, int]:
    """Return how many problems there are in each state, and in total."""
    held_set = set(held)
    result = {"all": 0, STATUS_SENT: 0, STATUS_NOT_SENT: 0, STATUS_HELD: 0}
    for problem in problems:
        result["all"] += 1
        result[status_of(problem, sent, held_set)] += 1
    return result


def next_allowed(
    last_sent: datetime | None, backoff_until: datetime | None
) -> datetime | None:
    """Return the earliest time the next send may start, or None for now."""
    candidates = []
    if last_sent is not None:
        candidates.append(last_sent + SEND_INTERVAL)
    if backoff_until is not None:
        candidates.append(backoff_until)
    return max(candidates) if candidates else None


def may_send(
    now: datetime, last_sent: datetime | None, backoff_until: datetime | None
) -> bool:
    """Return True if one more send is allowed at `now`."""
    allowed = next_allowed(last_sent, backoff_until)
    return allowed is None or now >= allowed


def _parse(value: str, zone: tzinfo) -> datetime | None:
    try:
        moment = datetime.fromisoformat(value)
    except ValueError:
        return None
    if moment.tzinfo is None:
        return moment
    return moment.astimezone(zone)


def _local(value: str, zone: tzinfo, pattern: str) -> str:
    moment = _parse(value, zone)
    return moment.strftime(pattern) if moment else value


def _date(problem: Problem, zone: tzinfo) -> str:
    moment = _parse(problem.last_seen, zone)
    return moment.strftime("%Y-%m-%d") if moment else "unknown"


def _seen(count: int) -> str:
    return "seen once" if count == 1 else f"seen {count} times"


def _section(problem: Problem, zone: tzinfo) -> str:
    detail = problem.detail.strip()
    if len(detail) > DETAIL_LIMIT:
        detail = detail[:DETAIL_LIMIT] + "\n[truncated]"
    lines = [
        f"## {_local(problem.last_seen, zone, '%Y-%m-%d %H:%M')} "
        f"{integration_of(problem.logger)}",
        "",
        problem.title or problem.logger,
        "",
        f"- {problem.level or 'WARNING'}, {_seen(problem.count)}, "
        f"first {_local(problem.first_seen, zone, '%Y-%m-%d %H:%M')}",
        f"- Logger: {problem.logger}",
        f"- Build: {problem.version}",
    ]
    if detail:
        lines += ["", "~~~~text", detail, "~~~~"]
    return "\n".join(lines) + "\n"


def build_files(
    problems: Sequence[Problem],
    held: Iterable[str],
    system: SystemInfo,
    zone: tzinfo,
) -> dict[str, str]:
    """Return the files of one send: path to text, before redaction.

    Held problems are left out. latest.md lists the newest first.
    """
    held_set = set(held)
    shown = sorted(
        (p for p in problems if p.file not in held_set),
        key=lambda p: (p.last_seen, p.file),
        reverse=True,
    )
    latest = ["# Latest problems", "", "Newest first."]
    if not shown:
        latest += ["", "No problems to show."]
    latest_text = "\n".join(latest) + "\n"
    latest_text += "".join("\n" + _section(p, zone) for p in shown[:LATEST_LIMIT])

    by_date: dict[str, list[Problem]] = {}
    for problem in shown:
        by_date.setdefault(_date(problem, zone), []).append(problem)

    files: dict[str, str] = {"README.md": README, "latest.md": latest_text}
    for date, items in sorted(by_date.items()):
        text = f"# Problems last seen on {date}\n"
        text += "".join("\n" + _section(p, zone) for p in items)
        files[f"problems/{date}.md"] = text

    index = [
        {
            "id": p.file.removesuffix(".md"),
            "date": _date(p, zone),
            "title": p.title,
            "integration": integration_of(p.logger),
            "logger": p.logger,
            "level": p.level,
            "count": p.count,
            "first_seen": p.first_seen,
            "last_seen": p.last_seen,
            "build": p.version,
        }
        for p in shown
    ]
    files["problems/index.json"] = (
        json.dumps({"problems": index}, indent=2, ensure_ascii=False) + "\n"
    )

    integrations = "\n".join(f"- {name}" for name in sorted(set(system.integrations)))
    files["system.md"] = (
        "# System\n\n"
        f"- Build: {system.build}\n"
        f"- Python: {system.python}\n"
        f"- Installation: {system.installation}\n"
        f"- Operating system: {system.operating_system}\n"
        f"- Architecture: {system.architecture}\n"
        "\n## Integrations set up\n\n"
        f"{integrations or '- none'}\n"
    )
    return files


def commit_message(count: int, moment: datetime) -> str:
    """Return the message of the one commit a send makes."""
    noun = "problem" if count == 1 else "problems"
    return f"Problem log: {count} {noun}, sent {moment.strftime('%Y-%m-%d %H:%M')}"


def parse_repository(address: str) -> tuple[str, str] | None:
    """Return (owner, name) from a GitHub address or "owner/name", or None."""
    text = address.strip()
    for prefix in ("https://github.com/", "http://github.com/", "github.com/"):
        if text.lower().startswith(prefix):
            text = text[len(prefix) :]
            break
    else:
        if "://" in text or "@" in text:
            return None
    text = text.rstrip("/").removesuffix(".git")
    parts = text.split("/")
    if len(parts) != 2:
        return None
    owner, name = parts
    if not owner or not name:
        return None
    allowed = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.")
    if not set(owner) <= allowed or not set(name) <= allowed:
        return None
    if name in {".", ".."} or owner.startswith("-"):
        return None
    return owner, name
