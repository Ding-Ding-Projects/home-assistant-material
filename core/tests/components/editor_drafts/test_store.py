"""Tests for the temporary Git repository behind editor drafts.

These use real Git in a temporary folder. They protect the promises the draft
feature is built on: every changed autosave is one commit, identical content is
not committed again, a draft is removed on discard and after a long time, the
repository stays within its limits, a damaged repository is re-created, and
nothing outside the repository folder is ever written.
"""

import json
from pathlib import Path
import subprocess

import pytest

from homeassistant.components.editor_drafts.store import (
    EXPIRY,
    MAX_COMMITS_PER_DRAFT,
    MAX_DRAFT_BYTES,
    DraftError,
    DraftRepository,
)

LIGHTS = {"alias": "Evening lights", "triggers": [{"trigger": "sun"}], "actions": []}


class Clock:
    """A clock the test moves by hand."""

    def __init__(self) -> None:
        """Start at a fixed time."""
        self.now = 1_800_000_000.0

    def __call__(self) -> float:
        """Return the current time."""
        return self.now

    def advance(self, seconds: float) -> None:
        """Move on."""
        self.now += seconds


@pytest.fixture
def clock() -> Clock:
    """Return a clock."""
    return Clock()


@pytest.fixture
def repo(tmp_path: Path, clock: Clock) -> DraftRepository:
    """Return a repository in a temporary folder."""
    return DraftRepository(tmp_path / "drafts", clock)


def _commits(repo: DraftRepository) -> int:
    result = subprocess.run(
        ["git", "rev-list", "--count", "HEAD"],
        cwd=repo.root,
        capture_output=True,
        text=True,
        check=False,
    )
    return int(result.stdout.strip() or "0")


def test_save_get_and_list(repo: DraftRepository, clock: Clock) -> None:
    """A saved draft is read back exactly and appears in the list."""
    result = repo.save("automation", "one", LIGHTS, "abc")
    assert result["saved"] is True
    assert repo.get("automation", "one")["config"] == LIGHTS
    assert repo.get("automation", "one")["base_hash"] == "abc"
    assert repo.get("automation", "missing") is None
    rows = repo.list()
    assert [(row["kind"], row["item_id"], row["alias"]) for row in rows] == [
        ("automation", "one", "Evening lights")
    ]


def test_identical_content_makes_no_commit(
    repo: DraftRepository, clock: Clock
) -> None:
    """Saving the same state again does not add a commit."""
    repo.save("script", "s1", LIGHTS, None)
    clock.advance(5)
    again = repo.save("script", "s1", LIGHTS, None)
    assert again["saved"] is True
    assert again["changed"] is False
    assert _commits(repo) == 1
    clock.advance(5)
    repo.save("script", "s1", {**LIGHTS, "alias": "Changed"}, None)
    assert _commits(repo) == 2


def test_minimum_interval_skips_a_quick_second_save(
    repo: DraftRepository, clock: Clock
) -> None:
    """A second save within the minimum interval is skipped."""
    repo.save("scene", "x", LIGHTS, None)
    clock.advance(0.2)
    skipped = repo.save("scene", "x", {**LIGHTS, "alias": "B"}, None)
    assert skipped == {"saved": False, "reason": "too_soon"}
    assert repo.get("scene", "x")["config"]["alias"] == "Evening lights"


def test_history_and_restore_version(repo: DraftRepository, clock: Clock) -> None:
    """Autosaves are listed newest first and one can be made current again."""
    for alias in ("A", "B", "C"):
        repo.save("automation", "h", {"alias": alias}, "base")
        clock.advance(5)
    history = repo.history("automation", "h")
    assert len(history) == 3
    restored = repo.restore_version("automation", "h", history[-1]["sha"])
    assert restored["config"] == {"alias": "A"}
    assert repo.get("automation", "h")["config"] == {"alias": "A"}


def test_restore_unknown_version_is_refused(repo: DraftRepository) -> None:
    """A version that does not exist is refused."""
    repo.save("automation", "h", {"alias": "A"}, None)
    with pytest.raises(DraftError) as err:
        repo.restore_version("automation", "h", "deadbeef")
    assert err.value.code == "not_found"


def test_discard_removes_the_draft_and_its_history(
    repo: DraftRepository, clock: Clock
) -> None:
    """Discarding the last draft leaves nothing behind, history included."""
    repo.save("automation", "d", LIGHTS, None)
    assert repo.discard("automation", "d") is True
    assert repo.get("automation", "d") is None
    assert repo.list() == []
    assert repo.history("automation", "d") == []
    assert repo.discard("automation", "d") is False


def test_expired_drafts_are_removed(repo: DraftRepository, clock: Clock) -> None:
    """A draft nobody touched for thirty days is removed; a fresh one stays."""
    repo.save("automation", "old", LIGHTS, None)
    clock.advance(EXPIRY.total_seconds() - 100)
    repo.save("automation", "fresh", LIGHTS, None)
    clock.advance(200)
    assert repo.purge_expired() == 1
    assert [row["item_id"] for row in repo.list()] == ["fresh"]


def test_too_large_draft_is_refused(repo: DraftRepository) -> None:
    """A draft above the size cap is refused and nothing is written."""
    big = {"alias": "x" * (MAX_DRAFT_BYTES + 1)}
    with pytest.raises(DraftError) as err:
        repo.save("automation", "big", big, None)
    assert err.value.code == "too_large"
    assert not repo.root.exists() or repo.list() == []


def test_history_is_compacted_when_a_draft_has_too_many_commits(
    repo: DraftRepository, clock: Clock
) -> None:
    """Past the cap the repository is re-created from the current drafts."""
    repo.save("script", "other", {"alias": "keep"}, None)
    for number in range(MAX_COMMITS_PER_DRAFT + 2):
        clock.advance(2)
        repo.save("automation", "busy", {"alias": str(number)}, None)
    assert _commits(repo) < MAX_COMMITS_PER_DRAFT
    assert repo.get("script", "other")["config"] == {"alias": "keep"}
    assert repo.get("automation", "busy")["config"] == {
        "alias": str(MAX_COMMITS_PER_DRAFT + 1)
    }


def test_damaged_repository_is_re_created(
    repo: DraftRepository, clock: Clock, caplog: pytest.LogCaptureFixture
) -> None:
    """A damaged repository is re-created empty and reported once."""
    repo.save("automation", "a", LIGHTS, None)
    (repo.root / ".git" / "HEAD").write_text("garbage")
    clock.advance(5)
    assert repo.list() == []
    repo.save("automation", "a", LIGHTS, None)
    assert repo.get("automation", "a")["config"] == LIGHTS
    assert caplog.text.count("was damaged and was re-created") == 1


@pytest.mark.parametrize(
    ("kind", "item_id"),
    [
        ("blueprint", "one"),
        ("automation", "../escape"),
        ("automation", "a/b"),
        ("automation", ".hidden"),
        ("automation", ""),
        ("automation", "a" * 65),
        ("automation", "x..y"),
    ],
)
def test_unsafe_targets_are_refused(
    repo: DraftRepository, kind: str, item_id: str
) -> None:
    """Nothing but a plain id can reach the repository folder."""
    with pytest.raises(DraftError) as err:
        repo.save(kind, item_id, LIGHTS, None)
    assert err.value.code == "invalid_format"


def test_nothing_is_written_outside_the_repository(
    tmp_path: Path, clock: Clock
) -> None:
    """Saving, restoring and discarding touch only the repository folder."""
    live = tmp_path / "config"
    live.mkdir()
    (live / "automations.yaml").write_text("[]\n")
    before = sorted(path.name for path in live.iterdir())
    repo = DraftRepository(tmp_path / "config_drafts", clock)
    repo.save("automation", "one", LIGHTS, None)
    clock.advance(5)
    repo.save("automation", "one", {"alias": "B"}, None)
    repo.discard("automation", "one")
    assert sorted(path.name for path in live.iterdir()) == before
    assert (live / "automations.yaml").read_text() == "[]\n"
    assert sorted(path.name for path in tmp_path.iterdir()) == [
        "config",
        "config_drafts",
    ]


def test_draft_file_holds_the_config(repo: DraftRepository) -> None:
    """The stored file is plain JSON with the base hash beside the config."""
    repo.save("automation", "j", LIGHTS, "h1")
    data = json.loads((repo.root / "automation" / "j.json").read_text())
    assert data == {"base_hash": "h1", "config": LIGHTS}


def test_meta_is_kept_with_the_draft(repo: DraftRepository) -> None:
    """Extra details such as an import marker are stored and returned."""
    repo.save("automation", "m", LIGHTS, None, {"imported": True})
    assert repo.get("automation", "m")["meta"] == {"imported": True}
    repo.save("automation", "n", LIGHTS, None)
    assert repo.get("automation", "n")["meta"] == {}
