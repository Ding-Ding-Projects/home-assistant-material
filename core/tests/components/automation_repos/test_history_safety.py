"""Tests for the safety of automation history.

They protect what a history manager must never do: lose every automation's
history because a file was briefly empty or cut short, start a Git process
for an automation that did not change, push a repository nobody selected, or
hold the commit lock while a slow remote answers.
"""

from pathlib import Path
import subprocess
from unittest.mock import patch

import pytest

from homeassistant.components.automation_repos import repos as repos_module
from homeassistant.components.automation_repos.repos import (
    ArchiveGuard,
    AutomationRepositories,
    RepositoryError,
    file_signature,
)

LIGHTS = {
    "id": "evening_lights",
    "alias": "Evening lights",
    "triggers": [{"trigger": "sun", "event": "sunset"}],
    "actions": [{"action": "light.turn_on", "target": {"area_id": "living_room"}}],
}
FAN = {
    "id": "1699999999999",
    "alias": "Bathroom fan",
    "triggers": [
        {"trigger": "numeric_state", "entity_id": "sensor.humidity", "above": 60}
    ],
    "actions": [{"action": "fan.turn_on", "target": {"entity_id": "fan.bathroom"}}],
}
REMOTE = "https://example.com/x.git"


@pytest.fixture
def repos(tmp_path: Path) -> AutomationRepositories:
    """Return repositories in an empty folder."""
    return AutomationRepositories(tmp_path / "automation_repos")


def _configs() -> dict[str, dict]:
    return {LIGHTS["id"]: dict(LIGHTS), FAN["id"]: dict(FAN)}


@pytest.mark.parametrize(
    "signature",
    [
        pytest.param(None, id="missing"),
        pytest.param((0, 5), id="empty"),
        pytest.param((14, 9), id="comment-only"),
    ],
)
def test_a_file_listing_nothing_archives_no_history_until_it_stays_so(
    repos: AutomationRepositories, signature: tuple[int, int] | None
) -> None:
    """A briefly empty file never costs every automation its history."""
    repos.snapshot(LIGHTS["id"], LIGHTS)
    repos.snapshot(FAN["id"], FAN)
    guard = ArchiveGuard(settle=10)

    assert repos.archive_pass({}, set(), guard, signature, 0.0) is None
    assert repos.archive_pass({}, set(), guard, signature, 5.0) is None
    assert len(repos.known_automations()) == 2
    assert not (repos.root / "_removed").exists()

    moved = repos.archive_pass({}, set(), guard, signature, 10.5)
    assert moved is not None
    assert len(moved) == 1
    assert repos.deferred_archives == 1


def test_a_real_file_state_is_read_as_a_signature(tmp_path: Path) -> None:
    """Missing, empty and filled files give three different readings."""
    path = tmp_path / "automations.yaml"
    assert file_signature(path) is None
    path.write_text("", encoding="utf-8")
    empty = file_signature(path)
    path.write_text("- id: a\n", encoding="utf-8")
    assert empty is not None
    assert file_signature(path) != empty


def test_a_file_that_changes_again_restarts_the_wait(
    repos: AutomationRepositories,
) -> None:
    """The same empty state must be seen unchanged, not just seen twice."""
    repos.snapshot(LIGHTS["id"], LIGHTS)
    guard = ArchiveGuard(settle=10)
    assert repos.archive_pass({}, set(), guard, (0, 1), 0.0) is None
    assert repos.archive_pass({}, set(), guard, (0, 2), 11.0) is None
    assert repos.archive_pass({}, set(), guard, (0, 2), 15.0) is None
    assert repos.known_automations() == [LIGHTS["id"]]
    assert repos.archive_pass({}, set(), guard, (0, 2), 21.5) is not None


def test_a_file_with_content_again_forgets_the_earlier_doubt(
    repos: AutomationRepositories,
) -> None:
    """After a good reading the wait starts over for the next empty one."""
    repos.snapshot(LIGHTS["id"], LIGHTS)
    guard = ArchiveGuard(settle=10)
    assert repos.archive_pass({}, set(), guard, (0, 1), 0.0) is None
    assert repos.archive_pass({LIGHTS["id"]: LIGHTS}, set(), guard, (9, 2), 6.0) == []
    assert repos.archive_pass({}, set(), guard, (0, 1), 12.0) is None


def test_a_truncated_file_cannot_archive_automations_that_are_loaded(
    repos: AutomationRepositories,
) -> None:
    """A valid but cut-short file keeps every automation that is still loaded."""
    repos.snapshot(LIGHTS["id"], LIGHTS)
    repos.snapshot(FAN["id"], FAN)
    guard = ArchiveGuard(settle=10)
    truncated = {LIGHTS["id"]: LIGHTS}

    moved = repos.archive_pass(truncated, {FAN["id"]}, guard, (50, 1), 0.0)
    assert moved == []
    assert len(repos.known_automations()) == 2
    assert len(repos.history(FAN["id"])) == 1


def test_a_confirmed_deletion_still_archives_the_history(
    repos: AutomationRepositories,
) -> None:
    """Really deleting an automation sets its history aside."""
    repos.snapshot(LIGHTS["id"], LIGHTS)
    repos.snapshot(FAN["id"], FAN)
    guard = ArchiveGuard(settle=10)

    moved = repos.archive_pass({FAN["id"]: FAN}, set(), guard, (80, 1), 0.0)
    assert moved is not None
    assert len(moved) == 1
    assert moved[0].startswith(LIGHTS["id"] + "-")
    assert repos.history(LIGHTS["id"]) == []
    assert len(repos.history(FAN["id"])) == 1

    # Deleting the very last automation is confirmed once the empty file holds.
    assert repos.archive_pass({}, set(), guard, (2, 3), 100.0) is None
    final = repos.archive_pass({}, set(), guard, (2, 3), 111.0)
    assert final is not None
    assert len(final) == 1
    assert repos.known_automations() == []


def test_one_pass_archives_at_most_half_of_the_known_repositories(
    repos: AutomationRepositories,
) -> None:
    """A wrong list loses nothing at once; the rest follows pass by pass."""
    for automation_id in ("a1", "a2", "a3", "a4"):
        repos.snapshot(automation_id, {"id": automation_id, "alias": automation_id})
    assert len(repos.archive_unlisted({})) == 2
    assert repos.deferred_archives == 2
    assert len(repos.known_automations()) == 2
    repos.archive_unlisted({})
    repos.archive_unlisted({})
    assert repos.known_automations() == []
    assert repos.deferred_archives == 0


def test_archived_histories_are_listed_and_brought_back(
    repos: AutomationRepositories,
) -> None:
    """A set-aside history can be restored, and never over a live one."""
    repos.snapshot(LIGHTS["id"], LIGHTS)
    repos.snapshot(FAN["id"], FAN)
    repos.archive_unlisted({FAN["id"]: FAN})
    archives = repos.list_archived_histories()
    assert [item["automation"] for item in archives] == [LIGHTS["id"]]
    name = archives[0]["name"]

    repos.snapshot(LIGHTS["id"], {**LIGHTS, "mode": "single"})
    with pytest.raises(RepositoryError):
        repos.restore_archived_history(name)

    repos.forget(LIGHTS["id"])
    assert repos.restore_archived_history(name) == LIGHTS["id"]
    assert len(repos.history(LIGHTS["id"])) == 1
    assert repos.list_archived_histories() == []
    for bad in ("../x", "nothing-20260101T000000", "a/b"):
        with pytest.raises(RepositoryError):
            repos.restore_archived_history(bad)


def test_forget_sets_the_folder_aside_before_deleting(
    repos: AutomationRepositories,
) -> None:
    """A removal that stops partway never leaves a half repository under its name."""
    repos.snapshot(LIGHTS["id"], LIGHTS)
    with (
        patch(
            "homeassistant.components.automation_repos.repos.shutil.rmtree",
            side_effect=OSError("busy"),
        ),
        pytest.raises(RepositoryError),
    ):
        repos.forget(LIGHTS["id"])
    assert not (repos.root / "automations" / LIGHTS["id"]).exists()
    assert repos.history(LIGHTS["id"]) == []
    repos.snapshot(LIGHTS["id"], LIGHTS)
    assert repos.forget(LIGHTS["id"]) is True
    assert not [
        item for item in repos.root.iterdir() if item.name.startswith(".forgetting-")
    ]


def _count_git(
    repos: AutomationRepositories, monkeypatch: pytest.MonkeyPatch
) -> list[tuple[str, ...]]:
    calls: list[tuple[str, ...]] = []
    original = repos._git

    def counting(cwd: Path, *args: str, **kwargs: object) -> object:
        calls.append(args)
        return original(cwd, *args, **kwargs)

    monkeypatch.setattr(repos, "_git", counting)
    return calls


def test_unchanged_automations_start_no_git_process(
    repos: AutomationRepositories, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A reload that changed nothing costs no Git work."""
    configs = _configs()
    for automation_id, config in configs.items():
        repos.snapshot(automation_id, config)
    calls = _count_git(repos, monkeypatch)
    for automation_id, config in configs.items():
        assert repos.snapshot(automation_id, dict(config)) is None
    assert calls == []

    configs[FAN["id"]]["alias"] = "Quieter fan"
    assert repos.snapshot(FAN["id"], configs[FAN["id"]]) is not None
    assert calls


def test_status_starts_no_git_process_once_it_has_looked(
    repos: AutomationRepositories, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The status page reads files and remembers counts instead of asking Git."""
    configs = _configs()
    for automation_id, config in configs.items():
        repos.snapshot(automation_id, config)
    first = repos.status(configs)
    calls = _count_git(repos, monkeypatch)
    again = repos.status(configs, {LIGHTS["id"]: "Git did not answer."})
    assert calls == []
    assert [item["commits"] for item in again["automations"]] == [1, 1]
    assert [item["dirty"] for item in again["automations"]] == [False, False]
    assert [item["head"] for item in first["automations"]] == [
        item["head"] for item in again["automations"]
    ]
    errors = {item["id"]: item["error"] for item in again["automations"]}
    assert errors == {LIGHTS["id"]: "Git did not answer.", FAN["id"]: None}

    repos.snapshot(FAN["id"], {**FAN, "alias": "Quieter fan"})
    after = {item["id"]: item for item in repos.status(configs)["automations"]}
    assert after[FAN["id"]]["commits"] == 2


def test_a_push_of_one_automation_sends_only_that_repository(
    repos: AutomationRepositories, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Ticking one automation never pushes the others, only it and the master."""
    monkeypatch.setattr(repos, "_stored_remote", lambda path: (REMOTE, False))
    pushed: list[Path] = []
    original = repos._git

    def fake(cwd: Path, *args: str, **kwargs: object) -> object:
        if args and args[0] == "push":
            pushed.append(cwd)
            return subprocess.CompletedProcess(args, 0, "", "")
        return original(cwd, *args, **kwargs)

    monkeypatch.setattr(repos, "_git", fake)
    result = repos.push_all(_configs(), only=[LIGHTS["id"]])
    assert result.pushed == [LIGHTS["id"], "master"]
    assert pushed == [repos._path(LIGHTS["id"]), repos.root]


def test_committing_and_sending_are_separate_and_time_limited(
    repos: AutomationRepositories, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Committing finishes first; sending stops once the time is used up."""
    monkeypatch.setattr(repos, "_stored_remote", lambda path: (REMOTE, False))
    result = repos.commit_all(_configs())
    assert result.master_commit is not None
    assert result.pushed == []

    repos.push_remotes(result, _configs(), total_limit=0)
    assert result.pushed == []
    assert {item["id"] for item in result.push_errors} == {
        LIGHTS["id"],
        FAN["id"],
        "master",
    }
    assert all("ran out" in item["error"] for item in result.push_errors)


def test_a_remote_that_is_already_being_pushed_is_not_pushed_twice(
    repos: AutomationRepositories, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Each remote has its own lock."""
    monkeypatch.setattr(repos, "_stored_remote", lambda path: (REMOTE, False))
    monkeypatch.setattr(repos_module, "REMOTE_TIMEOUT", 0.05)
    result = repos.commit_all({LIGHTS["id"]: dict(LIGHTS)})
    with repos._remote_lock(LIGHTS["id"]):
        repos.push_remotes(result, {LIGHTS["id"]: LIGHTS}, only=[LIGHTS["id"]])
    busy = [item["id"] for item in result.push_errors if "still running" in item["error"]]
    assert busy == [LIGHTS["id"]]


def test_the_remote_is_read_again_when_it_changes(
    repos: AutomationRepositories,
) -> None:
    """The remembered remote follows set_remote."""
    repos.snapshot(LIGHTS["id"], LIGHTS)
    one = {LIGHTS["id"]: LIGHTS}
    assert repos.status(one)["automations"][0]["remote"] is None
    repos.set_remote(LIGHTS["id"], "https://example.com/a.git")
    assert repos.status(one)["automations"][0]["remote"] == "https://example.com/a.git"
    repos.set_remote(LIGHTS["id"], "https://example.com/b.git")
    assert repos.status(one)["automations"][0]["remote"] == "https://example.com/b.git"
