"""Tests for the Git repository of the activity record.

These use real Git in a temporary folder. They protect the promises of the
record: lines are only ever appended, a commit batches many entries and only
the active chunk, a crash loses nothing that reached the disk, a hand edit never
reaches a commit, and reads and searches stay bounded.
"""

import os
from pathlib import Path
import subprocess
import threading
import time
from unittest.mock import patch

import pytest

from homeassistant.components.activity_record import repository as repository_module
from homeassistant.components.activity_record.const import (
    COMMIT_TIMEOUT,
    SEARCH_BYTES_DEFAULT,
    SEARCH_BYTES_MAX,
)
from homeassistant.components.activity_record.record_core import serialize
from homeassistant.components.activity_record.repository import (
    ActivityRepository,
    BusyError,
    PartialWriteError,
    RepositoryError,
)
from homeassistant.components.automation_repos.repos import AutomationRepositories

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


def _chunk(repo: ActivityRepository, day: str, index: int = 1) -> Path:
    suffix = "" if index == 0 else f".{index:03d}"
    return repo.root / day[:4] / day[5:7] / f"{day}{suffix}.jsonl"


def _git(repo: ActivityRepository, *args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=repo.root, capture_output=True, text=True, check=True
    ).stdout


def _tracked(repo: ActivityRepository) -> list[str]:
    return _git(repo, "ls-files").split()


@pytest.fixture
def repo(tmp_path: Path) -> ActivityRepository:
    """Return a record in a temporary folder."""
    repository = ActivityRepository(tmp_path / "record")
    repository.startup()
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


def test_layout_is_chunks_per_day(repo: ActivityRepository) -> None:
    """Each UTC day has its own chunk files under year and month."""
    repo.append([_line(DAY, 1), _line(NEXT, 2)])
    assert _chunk(repo, DAY).is_file()
    assert _chunk(repo, NEXT).is_file()


def test_lines_are_only_appended(repo: ActivityRepository) -> None:
    """Earlier lines stay byte for byte as they were."""
    repo.append([_line(DAY, n) for n in range(5)])
    path = _chunk(repo, DAY)
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
    with _chunk(repo, DAY).open("ab") as handle:
        handle.write(b'{"when": "2026-11-10T10')
    repo.append([_line(DAY, 2)])
    result = repo.read(DAY, None, 10, False)
    assert [e["name"] for e in result["entries"]] == ["Thing 1", "Thing 2"]


def test_startup_commits_what_is_on_disk(tmp_path: Path) -> None:
    """After a crash the next start commits the lines already written."""
    first = ActivityRepository(tmp_path / "r")
    first.startup()
    first.append([_line(DAY, n) for n in range(3)])
    first.stop()
    second = ActivityRepository(tmp_path / "r")
    assert second.startup() is not None
    assert second.commit() is None
    assert any(name.endswith(f"{DAY}.001.jsonl") for name in _tracked(second))


def test_git_settings_are_applied_on_every_start(tmp_path: Path) -> None:
    """The cost settings are set again at each start, not only when created."""
    first = ActivityRepository(tmp_path / "r")
    first.startup()
    first.stop()
    _git(first, "config", "pack.threads", "8")
    second = ActivityRepository(tmp_path / "r")
    second.startup()
    for key, value in (
        ("gc.auto", "500"),
        ("pack.threads", "1"),
        ("pack.windowMemory", "32m"),
        ("core.bigFileThreshold", "1m"),
        ("repack.writeBitmaps", "false"),
    ):
        assert _git(second, "config", "--get", key).strip() == value


def test_read_newest_first_with_a_cursor(repo: ActivityRepository) -> None:
    """Paging works in both directions and reports whether more is left."""
    repo.append([_line(DAY, n) for n in range(10)])
    newest = repo.read(DAY, None, 3, True)
    assert [e["name"] for e in newest["entries"]] == ["Thing 9", "Thing 8", "Thing 7"]
    assert newest["has_more"] is True
    assert newest["total"] == 10
    page = repo.read(DAY, newest["next_cursor"], 10, True)
    assert [e["name"] for e in page["entries"]] == [f"Thing {n}" for n in range(6, -1, -1)]
    assert page["has_more"] is False
    assert page["next_cursor"] is None
    oldest = repo.read(DAY, None, 2, False)
    assert [e["name"] for e in oldest["entries"]] == ["Thing 0", "Thing 1"]
    more = repo.read(DAY, oldest["next_cursor"], 2, False)
    assert [e["name"] for e in more["entries"]] == ["Thing 2", "Thing 3"]


def test_cursor_paging_shows_no_duplicates_while_new_entries_arrive(
    repo: ActivityRepository,
) -> None:
    """A cursor is a position in an append-only file, so new entries do not shift it."""
    repo.append([_line(DAY, n) for n in range(10)])
    first = repo.read(DAY, None, 4, True)
    repo.append([_line(DAY, n) for n in range(10, 15)])
    second = repo.read(DAY, first["next_cursor"], 4, True)
    names = [e["name"] for e in first["entries"] + second["entries"]]
    assert names == [f"Thing {n}" for n in (9, 8, 7, 6, 5, 4, 3, 2)]
    assert len(set(names)) == len(names)


def test_read_of_a_missing_or_bad_day_or_cursor(repo: ActivityRepository) -> None:
    """A day without a file is empty; a bad day or cursor is refused."""
    assert repo.read("2020-01-01", None, 5, True)["entries"] == []
    for bad in ("../../etc", "2026-11-11/../x", "2026-11-1", "2026-11-11\n"):
        with pytest.raises(RepositoryError):
            repo.read(bad, None, 5, True)
    repo.append([_line(DAY, 1)])
    for bad_cursor in ("../x", "1:", "a:b", "1:2:3"):
        with pytest.raises(RepositoryError):
            repo.read(DAY, bad_cursor, 5, True)


def test_chunk_rolls_over_and_reads_across_chunks(
    repo: ActivityRepository,
) -> None:
    """A new chunk starts at the size limit; reading and counting group chunks by day."""
    with patch.object(repository_module, "CHUNK_BYTES", 700):
        for start in range(0, 30, 5):
            repo.append([_line(DAY, n) for n in range(start, start + 5)])
    chunks = sorted(_chunk(repo, DAY).parent.glob(f"{DAY}.*.jsonl"))
    assert len(chunks) >= 3
    assert all(path.stat().st_size <= 700 + 300 for path in chunks)
    result = repo.read(DAY, None, 100, True)
    assert [e["name"] for e in result["entries"]] == [
        f"Thing {n}" for n in range(29, -1, -1)
    ]
    assert result["total"] == 30
    paged: list[str] = []
    cursor = None
    while True:
        page = repo.read(DAY, cursor, 4, True)
        paged += [e["name"] for e in page["entries"]]
        cursor = page["next_cursor"]
        if not page["has_more"]:
            break
    assert paged == [f"Thing {n}" for n in range(29, -1, -1)]
    day = repo.days()["days"][0]
    assert (day["day"], day["entries"], day["chunks"]) == (DAY, 30, len(chunks))
    assert repo.status(DAY)["files"] == len(chunks)
    assert len(repo.search(None, None, None, None, 100, 10**7)["entries"]) == 30


def test_only_the_active_chunk_changes(repo: ActivityRepository) -> None:
    """A finished chunk is never touched again, so a commit stores only the active one."""
    with patch.object(repository_module, "CHUNK_BYTES", 500):
        repo.append([_line(DAY, n) for n in range(10)])
        repo.commit()
        finished = sorted(_chunk(repo, DAY).parent.glob(f"{DAY}.*.jsonl"))[0]
        before = finished.read_bytes()
        repo.append([_line(DAY, n) for n in range(10, 14)])
    assert finished.read_bytes() == before
    repo.commit()
    changed = _git(repo, "show", "--name-only", "--format=", "HEAD").split()
    assert finished.relative_to(repo.root).as_posix() not in changed


def test_an_old_day_file_is_chunk_zero_and_never_rewritten(
    tmp_path: Path,
) -> None:
    """A first-version day file is read first and new lines go to a new chunk."""
    root = tmp_path / "r"
    legacy = root / "2026" / "11" / f"{DAY}.jsonl"
    legacy.parent.mkdir(parents=True)
    old = b"".join(_line(DAY, n)[1] for n in range(3))
    legacy.write_bytes(old)
    repo = ActivityRepository(root)
    repo.startup()
    repo.append([_line(DAY, n) for n in range(3, 5)])
    repo.commit()
    assert legacy.read_bytes() == old
    assert _chunk(repo, DAY, 1).is_file()
    oldest = repo.read(DAY, None, 100, False)
    assert [e["name"] for e in oldest["entries"]] == [f"Thing {n}" for n in range(5)]
    assert repo.days()["days"][0]["entries"] == 5
    newest = repo.read(DAY, None, 100, True)
    assert newest["entries"][0]["name"] == "Thing 4"


def test_a_new_day_starts_a_new_chunk(repo: ActivityRepository) -> None:
    """The day change closes the chunk of the day before."""
    repo.append([_line(DAY, 1), _line(NEXT, 2), _line(NEXT, 3)])
    assert _chunk(repo, DAY, 1).read_bytes().count(b"\n") == 1
    assert _chunk(repo, NEXT, 1).read_bytes().count(b"\n") == 2


def test_a_partial_multi_day_write_reports_what_reached_the_disk(
    repo: ActivityRepository,
) -> None:
    """When the second day fails, the first is on disk and the error says how many."""
    _chunk(repo, NEXT).parent.mkdir(parents=True, exist_ok=True)
    _chunk(repo, NEXT).mkdir()
    items = [_line(DAY, 1), _line(DAY, 2), _line(NEXT, 3)]
    with pytest.raises(PartialWriteError) as info:
        repo.append(items)
    assert info.value.written == 2
    assert _chunk(repo, DAY).read_bytes().count(b"\n") == 2
    _chunk(repo, NEXT).rmdir()
    assert repo.append(items[2:]) == 1
    assert [e["name"] for e in repo.read(NEXT, None, 5, True)["entries"]] == ["Thing 3"]


def test_a_failed_write_leaves_no_half_line(repo: ActivityRepository) -> None:
    """A write that fails is cut back so the retry does not leave junk or duplicates."""
    repo.append([_line(DAY, 1)])
    path = _chunk(repo, DAY)

    def failing(descriptor: int) -> None:
        raise OSError("disk full")

    with patch.object(repository_module.os, "fsync", failing), pytest.raises(OSError):
        repo.append([_line(DAY, 2), _line(DAY, 3)])
    assert path.read_bytes().count(b"\n") == 1
    repo.append([_line(DAY, 2), _line(DAY, 3)])
    assert [e["name"] for e in repo.read(DAY, None, 10, False)["entries"]] == [
        "Thing 1",
        "Thing 2",
        "Thing 3",
    ]


def test_parent_folders_are_flushed_when_a_file_is_created(
    repo: ActivityRepository,
) -> None:
    """Creating a day file or its folders flushes the folder that holds them."""
    flushed: list[Path] = []
    with patch.object(repository_module, "_fsync_dir", flushed.append):
        repo.append([_line("2027-01-05", 1)])
        count = len(flushed)
        repo.append([_line("2027-01-05", 2)])
    assert repo.root / "2027" / "01" in flushed
    assert repo.root / "2027" in flushed
    assert repo.root in flushed
    assert len(flushed) == count


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
    assert status["days"] == 2
    assert status["remote"] is None
    assert status["uncommitted_entries"] == 0
    assert status["lock_held"] is False
    assert status["last_commit"]["message"] == "Record 4 activity entries"


def test_counts_of_finished_chunks_come_from_the_sidecar_after_a_restart(
    tmp_path: Path,
) -> None:
    """A restart does not read the whole record again to count it."""
    first = ActivityRepository(tmp_path / "r")
    first.startup()
    first.append([_line(DAY, n) for n in range(20)])
    assert first.status(DAY)["entries_total"] == 20
    first.stop()
    second = ActivityRepository(tmp_path / "r")
    second.startup()
    with patch.object(repository_module, "count_lines", side_effect=AssertionError):
        assert second.status(DAY)["entries_total"] == 20


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


def test_search_text_is_only_tried_on_the_fields_it_names(
    repo: ActivityRepository,
) -> None:
    """A word that is only in another field (an id) is found by the raw test but not returned."""
    repo.append(
        [
            _line(DAY, 1, context_id="needle123"),
            _line(DAY, 2, name="has needle123"),
            _line(DAY, 3, name="Ärger mit Käse"),
        ]
    )
    assert [e["name"] for e in repo.search(None, None, None, "needle123", 10, 10**6)["entries"]] == ["has needle123"]
    assert len(repo.search(None, None, None, "ärger", 10, 10**6)["entries"]) == 1


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


def test_search_limits_are_smaller_on_a_small_machine() -> None:
    """Default 16 MB, at most 64 MB."""
    assert SEARCH_BYTES_DEFAULT == 16 * 1024 * 1024
    assert SEARCH_BYTES_MAX == 64 * 1024 * 1024


def test_only_one_search_runs_at_a_time(repo: ActivityRepository) -> None:
    """A second search while one runs is refused as busy."""
    repo.append([_line(DAY, 1)])
    with repo._search_lock, pytest.raises(BusyError):
        repo.search(None, None, None, None, 10, 10**6)
    assert len(repo.search(None, None, None, None, 10, 10**6)["entries"]) == 1


def test_search_stops_when_the_client_leaves(repo: ActivityRepository) -> None:
    """A set cancel event ends a long search at the next yield."""
    repo.append([_line(DAY, n % 50) for n in range(2500)])
    cancel = threading.Event()
    cancel.set()
    result = repo.search(None, None, None, "zzz", 10, 10**8, cancel)
    assert result["reason"] == "cancelled"
    assert result["scanned_bytes"] < 2500 * 150


def _tracked_day_files(repo: ActivityRepository) -> list[str]:
    return [name for name in _tracked(repo) if name.endswith(".jsonl")]


def test_a_hand_deleted_day_file_is_restored_and_not_committed(
    repo: ActivityRepository,
) -> None:
    """A deleted day file comes back from the last commit and the status says so."""
    repo.append([_line(DAY, n) for n in range(3)])
    repo.commit()
    before = _chunk(repo, DAY).read_bytes()
    _chunk(repo, DAY).unlink()
    repo.append([_line(NEXT, 1)])
    repo.commit()
    assert _chunk(repo, DAY).read_bytes() == before
    assert {f"2026/11/{DAY}.001.jsonl", f"2026/11/{NEXT}.001.jsonl"} <= set(
        _tracked_day_files(repo)
    )
    assert _git(repo, "show", f"HEAD:2026/11/{DAY}.001.jsonl").encode() == before
    restores = repo.status(NEXT)["restores"]
    assert restores[0]["path"] == f"2026/11/{DAY}.001.jsonl"
    notices = repo.search(None, None, None, "hand edit", 10, 10**7)["entries"]
    assert [e["kind"] for e in notices] == ["restored"]


def test_a_hand_edited_day_file_is_restored_and_keeps_new_lines(
    repo: ActivityRepository,
) -> None:
    """Removed lines come back; lines added since the commit stay; the edit is kept aside."""
    repo.append([_line(DAY, n) for n in range(3)])
    repo.commit()
    path = _chunk(repo, DAY)
    lines = path.read_bytes().splitlines(keepends=True)
    path.write_bytes(lines[0] + lines[2])
    repo.append([_line(DAY, 7)])
    repo.commit()
    names = [
        e["name"]
        for e in repo.read(DAY, None, 20, False)["entries"]
        if e["name"].startswith("Thing")
    ]
    assert names == ["Thing 0", "Thing 1", "Thing 2", "Thing 7"]
    shown = _git(repo, "show", f"HEAD:2026/11/{DAY}.001.jsonl")
    assert shown.count("Thing") == 4
    assert list(path.parent.glob(f"{DAY}.001.jsonl.hand-edited.*"))
    assert not any("hand-edited" in name for name in _tracked(repo))
    assert repo.status(DAY)["restores"][0]["what"].startswith("lines had been removed")


def test_a_changed_line_is_undone_too(repo: ActivityRepository) -> None:
    """A line changed in place counts as a removed line."""
    repo.append([_line(DAY, 1)])
    repo.commit()
    path = _chunk(repo, DAY)
    path.write_bytes(path.read_bytes().replace(b"Thing 1", b"Changed"))
    repo.commit()
    shown = _git(repo, "show", f"HEAD:2026/11/{DAY}.001.jsonl")
    assert "Thing 1" in shown


def test_added_lines_alone_are_committed_normally(repo: ActivityRepository) -> None:
    """Only removals count as an edit; an unfinished line at a commit does not."""
    repo.append([_line(DAY, 1)])
    with _chunk(repo, DAY).open("ab") as handle:
        handle.write(b'{"when": "2026-11-10T10')
    repo.commit()
    repo.append([_line(DAY, 2)])
    repo.commit()
    assert repo.status(DAY)["restores"] == []


def test_stray_and_hand_staged_files_are_not_committed(
    repo: ActivityRepository,
) -> None:
    """Only chunk files are added by name; a key or a note dropped in is left alone."""
    (repo.root / "stray.txt").write_text("note")
    (repo.root / ".ssh").mkdir()
    (repo.root / ".ssh" / "id_ed25519").write_text("KEY")
    (repo.root / "2026").mkdir(exist_ok=True)
    (repo.root / "2026" / "notes.txt").write_text("x")
    forced = repo.root / "forced.txt"
    forced.write_text("hand staged")
    _git(repo, "add", "-f", "forced.txt")
    repo.append([_line(DAY, 1)])
    repo.commit()
    tracked = _tracked(repo)
    assert "stray.txt" not in tracked
    assert ".ssh/id_ed25519" not in tracked
    assert "2026/notes.txt" not in tracked
    assert "forced.txt" not in tracked
    assert ".gitignore" in tracked
    assert "README.md" in tracked


def test_the_ignore_file_allows_only_the_record(repo: ActivityRepository) -> None:
    """Everything but the readme, the ignore file and the chunk files is ignored."""
    (repo.root / ".ssh").mkdir()
    (repo.root / ".ssh" / "id_rsa").write_text("KEY")
    (repo.root / "id_rsa").write_text("KEY")
    (repo.root / ".lock").touch()
    repo.save_state()
    ignored = _git(repo, "status", "--porcelain", "--ignored", "--untracked-files=all")
    assert "!! .ssh/" in ignored
    assert "!! id_rsa" in ignored
    assert "!! .activity_state.json" in ignored
    assert "!! .lock" in ignored


def test_a_stale_index_lock_is_cleared(repo: ActivityRepository) -> None:
    """A lock left by a killed Git is removed once it is old; a fresh one is respected."""
    lock = repo.root / ".git" / "index.lock"
    repo.append([_line(DAY, 1)])
    lock.write_text("")
    with pytest.raises(RepositoryError):
        repo.commit()
    assert lock.exists()
    old = time.time() - 3600
    os.utime(lock, (old, old))
    assert repo.commit() is not None
    assert not lock.exists()


def test_a_lock_left_by_a_timed_out_git_is_cleared_at_once(
    repo: ActivityRepository,
) -> None:
    """After our own Git was killed by the time limit its lock is not waited out."""
    repo.append([_line(DAY, 1)])
    real = repo.git._git

    def slow(*args: object, **kwargs: object) -> object:
        if "commit" in args:
            (repo.root / ".git" / "index.lock").write_text("")
            raise RepositoryError("Git did not answer within 180 seconds.")
        return real(*args, **kwargs)

    with patch.object(repo.git, "_git", slow), pytest.raises(RepositoryError):
        repo.commit()
    assert repo.commit() is not None


def test_commits_use_a_longer_time_limit() -> None:
    """A commit may take longer than the shared 30 second limit."""
    assert COMMIT_TIMEOUT > 30


def test_a_second_instance_on_the_folder_is_refused(tmp_path: Path) -> None:
    """The folder has one writer; the second says it does not record."""
    first = ActivityRepository(tmp_path / "r")
    first.startup()
    second = ActivityRepository(tmp_path / "r")
    assert second.startup() is None
    assert second.locked_out is True
    assert second.status(DAY)["lock_held"] is True
    with pytest.raises(RepositoryError):
        second.append([_line(DAY, 1)])
    assert second.commit() is None
    first.stop()
    third = ActivityRepository(tmp_path / "r")
    third.startup()
    assert third.locked_out is False


def test_ssh_key_and_known_hosts_live_outside_the_repository(tmp_path: Path) -> None:
    """Git is pointed at a folder beside the record, never inside it."""
    ssh = tmp_path / ".activity_record_ssh"
    ssh.mkdir()
    (ssh / "id_ed25519").write_text("KEY")
    repo = ActivityRepository(tmp_path / "record", ssh)
    command = repo.git._ssh_command()
    assert f"-i {ssh / 'id_ed25519'}" in command
    assert "IdentitiesOnly=yes" in command
    assert f"UserKnownHostsFile={ssh / 'known_hosts'}" in command
    assert "StrictHostKeyChecking=yes" in command
    assert str(repo.root) not in command


def test_other_repositories_keep_their_ssh_command(tmp_path: Path) -> None:
    """Without an ssh folder the shared helper behaves exactly as before."""
    assert (
        AutomationRepositories(tmp_path)._ssh_command()
        == "ssh -o BatchMode=yes -o ConnectTimeout=15"
    )


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


def _bare(tmp_path: Path) -> Path:
    bare = tmp_path / "bare.git"
    subprocess.run(["git", "init", "--bare", str(bare)], check=True, capture_output=True)
    return bare


def _add_remote(repo: ActivityRepository, bare: Path) -> None:
    subprocess.run(
        ["git", "remote", "add", "origin", str(bare)],
        cwd=repo.root,
        check=True,
        capture_output=True,
    )


def test_push_sends_the_record(repo: ActivityRepository, tmp_path: Path) -> None:
    """A push puts the history in the remote and notes it."""
    bare = _bare(tmp_path)
    repo.append([_line(DAY, 1)])
    repo.commit()
    _add_remote(repo, bare)
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


def test_a_long_history_is_pushed_in_steps(
    repo: ActivityRepository, tmp_path: Path
) -> None:
    """The commits go in bounded steps, progress is shown, and a later push resumes."""
    bare = _bare(tmp_path)
    for n in range(5):
        repo.append([_line(DAY, n)])
        repo.commit()
    _add_remote(repo, bare)
    with patch.object(repository_module, "PUSH_STEP_COMMITS", 2):
        assert repo.push()["pushed"] is True
        progress = repo.status(DAY)["push"]
        assert progress["running"] is False
        assert (progress["step"], progress["steps"]) == (3, 3)
        repo.append([_line(DAY, 9)])
        repo.commit()
        repo.push()
        assert repo.status(DAY)["push"]["steps"] == 1
    tip = subprocess.run(
        ["git", "rev-parse", "refs/heads/main"],
        cwd=bare,
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()
    assert tip == _git(repo, "rev-parse", "HEAD").strip()


def test_a_failed_push_step_is_reported_with_progress(
    repo: ActivityRepository, tmp_path: Path
) -> None:
    """A step that fails stops the push and the error is on the status, masked."""
    repo.append([_line(DAY, 1)])
    repo.commit()
    _add_remote(repo, tmp_path / "missing.git")
    with pytest.raises(RepositoryError):
        repo.push()
    status = repo.status(DAY)
    assert status["last_push"]["ok"] is False
    assert status["push"]["running"] is False
    assert status["push"]["error"]


def test_size_per_thousand_entries(repo: ActivityRepository) -> None:
    """A typical entry is a few hundred bytes, which the docs rely on."""
    repo.append([_line(DAY, n, message="Kitchen light turned on by Anna") for n in range(1000)])
    size = repo.days()["days"][0]["bytes"]
    assert 100_000 < size < 400_000
