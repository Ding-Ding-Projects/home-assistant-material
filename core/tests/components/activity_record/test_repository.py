"""Tests for the Git repository of the activity record.

These use real Git in a temporary folder. They protect the promises of the
record: lines are only ever appended, a commit batches many entries, a crash
loses nothing that reached the disk, and reads and searches stay bounded.
"""

from pathlib import Path
import subprocess

import pytest

from homeassistant.components.activity_record.record_core import serialize
from homeassistant.components.activity_record.repository import (
    ActivityRepository,
    RepositoryError,
)

DAY = "2026-11-10"
NEXT = "2026-11-11"


def _line(day: str, n: int, **over: object) -> tuple[str, bytes]:
    entry = {
        "when": f"{day}T10:00:{n % 60:02d}.{n:06d}+00:00",
        "kind": "state_change",
        "name": f"Thing {n}",
        "entity_id": "light.a" if n % 2 else "switch.b",
        "state": "on",
    }
    entry.update(over)
    return day, serialize(entry)


@pytest.fixture
def repo(tmp_path: Path) -> ActivityRepository:
    """Return a record in a temporary folder."""
    repository = ActivityRepository(tmp_path / "record")
    repository.ensure_repository()
    return repository


def _commits(repo: ActivityRepository) -> int:
    result = subprocess.run(
        ["git", "rev-list", "--count", "HEAD"],
        cwd=repo.root,
        capture_output=True,
        text=True,
        check=False,
    )
    return int(result.stdout.strip() or 0)


def test_many_entries_make_one_commit(repo: ActivityRepository) -> None:
    """A batch of entries is one commit, not one per entry."""
    repo.commit()
    before = _commits(repo)
    repo.append([_line(DAY, n) for n in range(50)])
    repo.append([_line(DAY, n) for n in range(50, 80)])
    assert repo.commit() is not None
    assert _commits(repo) == before + 1
    assert repo.commit() is None
    assert repo.uncommitted == 0


def test_layout_is_one_file_per_day(repo: ActivityRepository) -> None:
    """Each UTC day has its own file under year and month."""
    repo.append([_line(DAY, 1), _line(NEXT, 2)])
    assert (repo.root / "2026" / "11" / f"{DAY}.jsonl").is_file()
    assert (repo.root / "2026" / "11" / f"{NEXT}.jsonl").is_file()


def test_lines_are_only_appended(repo: ActivityRepository) -> None:
    """Earlier lines stay byte for byte as they were."""
    repo.append([_line(DAY, n) for n in range(5)])
    path = repo.root / "2026" / "11" / f"{DAY}.jsonl"
    first = path.read_bytes()
    repo.commit()
    repo.append([_line(DAY, n) for n in range(5, 9)])
    repo.commit()
    assert path.read_bytes().startswith(first)
    assert path.read_bytes().count(b"\n") == 9


def test_unfinished_last_line_is_not_glued_to_the_next(
    repo: ActivityRepository,
) -> None:
    """A line cut off by a crash does not swallow the next entry."""
    repo.append([_line(DAY, 1)])
    path = repo.root / "2026" / "11" / f"{DAY}.jsonl"
    with path.open("ab") as handle:
        handle.write(b'{"when": "2026-11-10T10')
    repo.append([_line(DAY, 2)])
    result = repo.read(DAY, 0, 10, False)
    assert [e["name"] for e in result["entries"]] == ["Thing 1", "Thing 2"]


def test_startup_commits_what_is_on_disk(tmp_path: Path) -> None:
    """After a crash the next start commits the lines already written."""
    first = ActivityRepository(tmp_path / "r")
    first.ensure_repository()
    first.append([_line(DAY, n) for n in range(3)])
    second = ActivityRepository(tmp_path / "r")
    assert second.startup() is not None
    assert second.commit() is None
    assert _commits(second) >= 1


def test_read_newest_first_with_offset_and_limit(repo: ActivityRepository) -> None:
    """Paging works in both directions and reports whether more is left."""
    repo.append([_line(DAY, n) for n in range(10)])
    newest = repo.read(DAY, 0, 3, True)
    assert [e["name"] for e in newest["entries"]] == ["Thing 9", "Thing 8", "Thing 7"]
    assert newest["has_more"] is True
    assert newest["total"] == 10
    page = repo.read(DAY, 8, 5, True)
    assert [e["name"] for e in page["entries"]] == ["Thing 1", "Thing 0"]
    assert page["has_more"] is False
    oldest = repo.read(DAY, 0, 2, False)
    assert [e["name"] for e in oldest["entries"]] == ["Thing 0", "Thing 1"]


def test_read_of_a_missing_or_bad_day(repo: ActivityRepository) -> None:
    """A day without a file is empty; a bad day is refused."""
    assert repo.read("2020-01-01", 0, 5, True)["entries"] == []
    with pytest.raises(RepositoryError):
        repo.read("../../etc", 0, 5, True)


def test_days_list_with_counts_newest_first(repo: ActivityRepository) -> None:
    """Days are listed newest first with the number of entries."""
    repo.append([_line(DAY, n) for n in range(4)] + [_line(NEXT, 1)])
    result = repo.days()
    assert [(d["day"], d["entries"]) for d in result["days"]] == [(NEXT, 1), (DAY, 4)]
    repo.append([_line(DAY, 9)])
    assert repo.days()["days"][1]["entries"] == 5
    assert repo.days(limit=1, offset=1)["days"][0]["day"] == DAY


def test_status_counts(repo: ActivityRepository) -> None:
    """The status reports counts, the last commit and no remote."""
    repo.append([_line(NEXT, n) for n in range(3)] + [_line(DAY, 1)])
    repo.commit()
    status = repo.status(NEXT)
    assert status["entries_today"] == 3
    assert status["entries_total"] == 4
    assert status["files"] == 2
    assert status["remote"] is None
    assert status["uncommitted_entries"] == 0
    assert status["last_commit"]["message"] == "Record 4 activity entries"


def test_search_filters_and_range(repo: ActivityRepository) -> None:
    """Search matches an entity, a text and a range of days."""
    repo.append([_line(DAY, n) for n in range(6)] + [_line(NEXT, n) for n in range(6)])
    by_entity = repo.search(None, None, "light.a", None, 100, 10**7)
    assert len(by_entity["entries"]) == 6
    assert by_entity["entries"][0]["when"].startswith(NEXT)
    by_text = repo.search(None, None, None, "thing 3", 100, 10**7)
    assert len(by_text["entries"]) == 2
    one_day = repo.search(DAY, DAY, None, None, 100, 10**7)
    assert len(one_day["entries"]) == 6
    assert one_day["scanned_days"] == 1
    with pytest.raises(RepositoryError):
        repo.search("nope", None, None, None, 10, 1000)


def test_search_stops_at_the_row_and_byte_caps(repo: ActivityRepository) -> None:
    """Search never returns more rows or scans more bytes than it was given."""
    repo.append([_line(DAY, n) for n in range(100)])
    rows = repo.search(None, None, None, None, 5, 10**7)
    assert len(rows["entries"]) == 5
    assert rows["truncated"] is True
    assert rows["reason"] == "rows"
    scanned = repo.search(None, None, None, "zzz", 10, 2048)
    assert scanned["truncated"] is True
    assert scanned["reason"] == "bytes"
    assert scanned["scanned_bytes"] <= 2048


@pytest.mark.parametrize(
    "url",
    [
        "https://user:pw@example.com/r.git",
        "https://localhost/r.git",
        "https://127.0.0.1/r.git",
        "https://169.254.169.254/latest",
        "ftp://example.com/r.git",
        "https://example.com/r.git?token=1",
        "/tmp/some/path",
    ],
)
def test_remote_rules_are_the_same_as_the_other_repositories(
    repo: ActivityRepository, url: str
) -> None:
    """Addresses with credentials, loopback or odd schemes are refused."""
    with pytest.raises(RepositoryError):
        repo.set_remote(url)
    assert repo.remote() == (None, False)


def test_remote_can_be_set_and_removed(repo: ActivityRepository) -> None:
    """A good address is stored and can be removed again."""
    repo.set_remote("https://example.com/me/record.git")
    assert repo.remote() == ("https://example.com/me/record.git", False)
    assert repo.status(DAY)["remote"] == "https://example.com/me/record.git"
    repo.set_remote(None)
    assert repo.remote() == (None, False)


def test_push_without_a_remote_is_refused(repo: ActivityRepository) -> None:
    """There is nothing to send to until a person sets a remote."""
    with pytest.raises(RepositoryError):
        repo.push()


def test_push_sends_the_record(repo: ActivityRepository, tmp_path: Path) -> None:
    """A push puts the history in the remote and notes it."""
    bare = tmp_path / "bare.git"
    subprocess.run(["git", "init", "--bare", str(bare)], check=True, capture_output=True)
    repo.append([_line(DAY, 1)])
    repo.commit()
    subprocess.run(
        ["git", "remote", "add", "origin", str(bare)],
        cwd=repo.root,
        check=True,
        capture_output=True,
    )
    assert repo.push()["pushed"] is True
    assert repo.status(DAY)["last_push"]["ok"] is True
    heads = subprocess.run(
        ["git", "rev-parse", "refs/heads/main"],
        cwd=bare,
        capture_output=True,
        text=True,
        check=True,
    )
    assert heads.stdout.strip() == repo.status(DAY)["last_commit"]["sha"]


def test_size_per_thousand_entries(repo: ActivityRepository) -> None:
    """A typical entry is a few hundred bytes, which the docs rely on."""
    repo.append([_line(DAY, n, message="Kitchen light turned on by Anna") for n in range(1000)])
    size = repo.days()["days"][0]["bytes"]
    assert 100_000 < size < 400_000
