"""Tests for the Git repositories behind automations.

These use real Git in a temporary folder. They protect the promises the
history manager is built on: every save is a commit, an unchanged automation
is not committed again, any version can be read back exactly, one push
commits every automation and then the master, and nothing a caller passes
can reach outside the storage folder or into Git's options.
"""

import json
from pathlib import Path
import subprocess

import pytest

from homeassistant.components.automation_repos.repos import (
    SIZE_LIMIT,
    AutomationRepositories,
    RepositoryError,
    check_remote,
    clean_message,
    dump_automation,
    mask_text,
    repository_name,
)

LIGHTS = {
    "id": "evening_lights",
    "alias": "Evening lights",
    "triggers": [{"trigger": "sun", "event": "sunset"}],
    "conditions": [],
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


@pytest.fixture
def repos(tmp_path: Path) -> AutomationRepositories:
    """Return repositories in an empty folder."""
    return AutomationRepositories(tmp_path / "automation_repos")


def _configs() -> dict[str, dict]:
    return {LIGHTS["id"]: dict(LIGHTS), FAN["id"]: dict(FAN)}


def test_repository_name_keeps_plain_ids_and_hashes_the_rest() -> None:
    """An id can never name a folder outside the storage folder."""
    assert repository_name("evening_lights") == "evening_lights"
    assert repository_name("1699999999999") == "1699999999999"
    for unsafe in ("../../etc", "a/b", ".git", "-rf", "", "x" * 80, "naïve"):
        name = repository_name(unsafe)
        assert name.startswith("id-")
        assert "/" not in name and ".." not in name


def test_snapshot_commits_once_per_change(repos: AutomationRepositories) -> None:
    """Saving twice without a change makes one commit, not two."""
    first = repos.snapshot("evening_lights", LIGHTS, "Created")
    assert first is not None
    assert repos.snapshot("evening_lights", LIGHTS) is None

    changed = {**LIGHTS, "alias": "Evening lights, dimmed"}
    second = repos.snapshot("evening_lights", changed)
    assert second is not None and second != first

    history = repos.history("evening_lights")
    assert [commit.sha for commit in history] == [second, first]
    assert history[1].message == "Created"
    assert history[0].message == "Evening lights, dimmed: change alias"


def test_a_commit_without_a_message_names_what_changed(
    repos: AutomationRepositories,
) -> None:
    """The history can be read without opening every version."""
    repos.snapshot("evening_lights", LIGHTS)
    repos.snapshot("evening_lights", {**LIGHTS, "mode": "restart", "conditions": [1]})
    messages = [commit.message for commit in repos.history("evening_lights")]
    assert messages == [
        "Evening lights: change conditions, mode",
        "Create Evening lights",
    ]


def test_each_automation_has_its_own_repository(
    repos: AutomationRepositories,
) -> None:
    """Commits to one automation do not appear in another."""
    repos.snapshot(LIGHTS["id"], LIGHTS)
    repos.snapshot(FAN["id"], FAN)
    repos.snapshot(FAN["id"], {**FAN, "alias": "Fan"})
    assert len(repos.history(LIGHTS["id"])) == 1
    assert len(repos.history(FAN["id"])) == 2
    assert (repos.root / "automations" / "evening_lights" / ".git").is_dir()
    assert (repos.root / "automations" / "1699999999999" / ".git").is_dir()


def test_a_version_reads_back_exactly(repos: AutomationRepositories) -> None:
    """Any version can be restored as it was saved."""
    first = repos.snapshot(LIGHTS["id"], LIGHTS)
    repos.snapshot(LIGHTS["id"], {**LIGHTS, "mode": "restart"})
    assert first is not None
    assert repos.version(LIGHTS["id"], first) == LIGHTS
    assert "mode: restart" in repos.diff(LIGHTS["id"], first)


def test_history_of_an_unknown_automation_is_empty(
    repos: AutomationRepositories,
) -> None:
    """Asking about an automation that was never saved creates nothing."""
    assert repos.history("never_saved") == []
    assert not (repos.root / "automations" / "never_saved").exists()


def test_push_commits_every_automation_then_the_master(
    repos: AutomationRepositories,
) -> None:
    """One push commits each changed automation and records them all."""
    result = repos.push_all(_configs(), "First push")
    assert {item["id"] for item in result.committed} == {LIGHTS["id"], FAN["id"]}
    assert result.unchanged == 0
    assert result.master_commit is not None

    manifest = json.loads((repos.root / "manifest.json").read_text())
    for item in result.committed:
        assert manifest["automations"][item["id"]]["commit"] == item["commit"]
    assert (repos.root / "snapshots" / "evening_lights.yaml").read_text() == (
        dump_automation(LIGHTS)
    )
    # The master holds the record, not the automation repositories themselves.
    tracked = subprocess.run(
        ["git", "ls-files"], cwd=repos.root, capture_output=True, text=True, check=True
    ).stdout.split()
    assert "manifest.json" in tracked
    assert not any(path.startswith("automations/") for path in tracked)


def test_a_second_push_only_commits_what_changed(
    repos: AutomationRepositories,
) -> None:
    """Nothing is committed twice, and the master follows the change."""
    repos.push_all(_configs())
    again = repos.push_all(_configs())
    assert again.committed == []
    assert again.unchanged == 2
    assert again.master_commit is None

    configs = _configs()
    configs[FAN["id"]]["alias"] = "Bathroom fan, quieter"
    third = repos.push_all(configs)
    assert [item["id"] for item in third.committed] == [FAN["id"]]
    assert third.unchanged == 1
    assert third.master_commit is not None


def test_a_broken_automation_is_left_out_and_named(
    repos: AutomationRepositories,
) -> None:
    """One automation that does not load never blocks the others."""
    result = repos.push_all(_configs(), invalid={FAN["id"]: "Unknown action"})
    assert [item["id"] for item in result.committed] == [LIGHTS["id"]]
    assert result.skipped == [{"id": FAN["id"], "reason": "Unknown action"}]
    assert repos.history(FAN["id"]) == []


def test_a_removed_automation_leaves_the_master_record(
    repos: AutomationRepositories,
) -> None:
    """Deleting an automation removes its copy; its repository stays."""
    repos.push_all(_configs())
    result = repos.push_all({LIGHTS["id"]: dict(LIGHTS)})
    assert result.master_commit is not None
    manifest = json.loads((repos.root / "manifest.json").read_text())
    assert list(manifest["automations"]) == [LIGHTS["id"]]
    assert not (repos.root / "snapshots" / "1699999999999.yaml").exists()
    assert len(repos.history(FAN["id"])) == 1


def test_status_reports_changes_waiting(repos: AutomationRepositories) -> None:
    """The status says which automations differ from their last commit."""
    configs = _configs()
    before = repos.status(configs)
    assert all(item["dirty"] for item in before["automations"])
    assert before["master"]["head"] is None

    repos.push_all(configs)
    configs[LIGHTS["id"]]["mode"] = "single"
    after = {item["id"]: item for item in repos.status(configs)["automations"]}
    assert after[LIGHTS["id"]]["dirty"] is True
    assert after[FAN["id"]]["dirty"] is False
    assert after[FAN["id"]]["commits"] == 1


def test_push_sends_to_a_remote_and_reports_a_failure(
    repos: AutomationRepositories, tmp_path: Path
) -> None:
    """A remote that works receives the commits; one that does not is named."""
    bare = tmp_path / "remote.git"
    subprocess.run(
        ["git", "init", "--bare", "--quiet", "--initial-branch=main", str(bare)],
        check=True,
    )
    repos.push_all(_configs())
    _git(repos.root, "remote", "add", "origin", str(bare))
    fan = repos.root / "automations" / FAN["id"]
    _git(fan, "remote", "add", "origin", str(tmp_path / "missing.git"))

    configs = _configs()
    configs[LIGHTS["id"]]["mode"] = "queued"
    result = repos.push_all(configs)
    assert result.pushed == ["master"]
    assert [item["id"] for item in result.push_errors] == [FAN["id"]]
    assert str(tmp_path) not in result.push_errors[0]["error"]
    remote_head = subprocess.run(
        ["git", "rev-parse", "refs/heads/main"],
        cwd=bare,
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()
    assert remote_head == result.master_commit


def _git(cwd: Path, *args: str) -> None:
    subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True)


@pytest.mark.parametrize(
    "url",
    [
        "--upload-pack=touch /tmp/x",
        "https://user:secret@example.com/repo.git",
        "ssh://user:pw@host/x",
        "ssh://user@host/x",
        "https://h/x?token=abc",
        "https://h/x#frag",
        "/just/a/local/path",
        "https://127.0.0.1/x.git",
        "ssh://localhost/x.git",
        "https://169.254.169.254/latest",
        "https://2130706433/x",
        "https://0.0.0.0/x",
        "ext::sh -c 'touch /tmp/x'",
        "file with spaces",
        "https://h/x\nssh://evil/x",
        "https://h/x\x00",
        "git@host:x\ny",
        "https://" + "h" * 600 + "/x",
    ],
)
def test_unsafe_remote_addresses_are_refused(
    repos: AutomationRepositories, url: str
) -> None:
    """A remote cannot carry an option, a command, a password or a token."""
    with pytest.raises(RepositoryError):
        check_remote(url)
    with pytest.raises(RepositoryError):
        repos.set_remote(None, url)
    assert repos.status({})["master"]["remote"] is None


@pytest.mark.parametrize(
    "address",
    [
        "https://example.com/me/repo.git",
        "ssh://example.com:2222/me/repo.git",
        "git@example.com:me/repo.git",
    ],
)
def test_plain_remote_addresses_are_kept(
    repos: AutomationRepositories, address: str
) -> None:
    """A clean address is stored, shown and removable."""
    repos.set_remote(None, address)
    master = repos.status({})["master"]
    assert master["remote"] == address
    assert master["remote_unsafe"] is False
    repos.set_remote(None, "")
    assert repos.status({})["master"]["remote"] is None


def test_stored_remote_with_credentials_is_hidden_and_not_pushed(
    repos: AutomationRepositories,
) -> None:
    """An address stored earlier that breaks the rule is never returned."""
    repos.push_all(_configs())
    _git(repos.root, "remote", "add", "origin", "https://user:secret@h/x.git")
    master = repos.status({})["master"]
    assert master["remote"] is None
    assert master["remote_unsafe"] is True
    result = repos.push_all(_configs())
    assert result.pushed == []
    assert [item["id"] for item in result.push_errors] == ["master"]
    assert "secret" not in str(result.push_errors)


def test_push_failure_never_returns_the_address(
    repos: AutomationRepositories,
) -> None:
    """The error of a failed push holds no address and no user info."""
    repos.push_all(_configs())
    address = "https://unreachable.invalid/me/repo.git"
    repos.set_remote(None, address)
    result = repos.push_all(_configs())
    assert result.pushed == []
    error = result.push_errors[0]["error"]
    assert address not in error
    assert len(error) <= 300


def test_masking_removes_credentials_from_messages() -> None:
    """User info and the address itself never survive in a message."""
    assert "secret" not in mask_text("fatal: https://u:secret@h/x.git denied")
    assert "h/x.git" not in mask_text(
        "fatal: https://h/x.git denied", "https://h/x.git"
    )
    assert mask_text("fatal: ssh://tok@h/x refused") == "fatal: ssh://h/x refused"


def test_trailing_newline_is_not_a_name_or_a_commit(
    repos: AutomationRepositories,
) -> None:
    """A newline after a plain id is not plain."""
    assert repository_name("evening_lights\n").startswith("id-")
    repos.snapshot(LIGHTS["id"], LIGHTS)
    sha = repos.history(LIGHTS["id"])[0].sha
    with pytest.raises(RepositoryError):
        repos.version(LIGHTS["id"], sha + "\n")


def test_oversized_automation_records_nothing_and_does_not_stop_a_push(
    repos: AutomationRepositories,
) -> None:
    """One automation too large to keep is named; the rest are still committed."""
    huge = {**FAN, "description": "x" * (SIZE_LIMIT + 1)}
    with pytest.raises(RepositoryError):
        repos.snapshot(FAN["id"], huge)
    assert not (repos.root / "automations" / FAN["id"]).exists()

    result = repos.push_all({LIGHTS["id"]: dict(LIGHTS), FAN["id"]: huge})
    assert [item["id"] for item in result.committed] == [LIGHTS["id"]]
    assert [item["id"] for item in result.skipped] == [FAN["id"]]
    status = repos.status({FAN["id"]: huge})
    assert status["automations"][0]["dirty"] is True


def test_deleted_automation_history_is_not_adopted(
    repos: AutomationRepositories,
) -> None:
    """A new automation with a deleted one's id starts with no history."""
    repos.snapshot(LIGHTS["id"], LIGHTS)
    repos.snapshot(FAN["id"], FAN)
    moved = repos.archive_unlisted({FAN["id"]: FAN})
    assert len(moved) == 1
    assert moved[0].startswith(LIGHTS["id"] + "-")
    assert (repos.root / "_removed" / moved[0]).is_dir()
    assert repos.history(LIGHTS["id"]) == []
    assert len(repos.history(FAN["id"])) == 1

    repos.snapshot(LIGHTS["id"], LIGHTS)
    assert len(repos.history(LIGHTS["id"])) == 1
    assert repos.archive_unlisted({LIGHTS["id"]: LIGHTS, FAN["id"]: FAN}) == []


def test_archived_repositories_stay_out_of_the_master(
    repos: AutomationRepositories,
) -> None:
    """The master never tracks an archived repository."""
    repos.snapshot(LIGHTS["id"], LIGHTS)
    repos.archive_unlisted({})
    repos.push_all({FAN["id"]: dict(FAN)})
    tracked = subprocess.run(
        ["git", "ls-files"], cwd=repos.root, capture_output=True, text=True, check=True
    ).stdout.split()
    assert not any(path.startswith("_removed/") for path in tracked)


def test_forget_deletes_the_history_and_starts_again(
    repos: AutomationRepositories,
) -> None:
    """Forgetting removes every old version; the next save is a first one."""
    repos.snapshot(LIGHTS["id"], LIGHTS)
    repos.snapshot(LIGHTS["id"], {**LIGHTS, "mode": "restart"})
    assert repos.forget(LIGHTS["id"]) is True
    assert repos.forget(LIGHTS["id"]) is False
    assert repos.history(LIGHTS["id"]) == []
    repos.snapshot(LIGHTS["id"], LIGHTS)
    assert len(repos.history(LIGHTS["id"])) == 1


def test_a_version_is_returned_as_plain_data(repos: AutomationRepositories) -> None:
    """Dates and other YAML types are written out as text, not left as objects."""
    repos.snapshot(LIGHTS["id"], LIGHTS)
    path = repos.root / "automations" / LIGHTS["id"]
    (path / "automation.yaml").write_text(
        "id: a\nwhen: 2026-01-02\n", encoding="utf-8"
    )
    _git(path, "add", "--all")
    _git(path, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "x")
    newest = repos.history(LIGHTS["id"])[0].sha
    assert repos.version(LIGHTS["id"], newest)["when"] == "2026-01-02"


def test_only_commit_ids_are_accepted(repos: AutomationRepositories) -> None:
    """A version is named by a commit id, nothing else."""
    repos.snapshot(LIGHTS["id"], LIGHTS)
    for bad in ("HEAD", "--output=/tmp/x", "main; rm -rf /", "../x", ""):
        with pytest.raises(RepositoryError):
            repos.version(LIGHTS["id"], bad)
        with pytest.raises(RepositoryError):
            repos.diff(LIGHTS["id"], bad)


class _Text(str):
    """Text that carries more than its characters, as loaded configuration does."""

    __slots__ = ("line",)


class _Mapping(dict):
    """A mapping subclass, as loaded configuration uses."""


def test_loaded_configuration_is_written_as_plain_values(
    repos: AutomationRepositories,
) -> None:
    """Configuration read from disk commits the same as plain data."""
    loaded = _Mapping(
        {
            _Text("id"): _Text("evening_lights"),
            _Text("alias"): _Text("Evening lights"),
            _Text("triggers"): [_Mapping({_Text("trigger"): _Text("sun")})],
            _Text("enabled"): True,
            _Text("limit"): 3,
        }
    )
    assert dump_automation(loaded) == dump_automation(
        {
            "id": "evening_lights",
            "alias": "Evening lights",
            "triggers": [{"trigger": "sun"}],
            "enabled": True,
            "limit": 3,
        }
    )
    commit = repos.snapshot("evening_lights", loaded)
    assert commit is not None
    assert repos.version("evening_lights", commit)["enabled"] is True


def test_clean_message() -> None:
    """A commit message is one line of bounded length."""
    assert clean_message("  two\nlines\t here ", "x") == "two lines here"
    assert clean_message("", "Fallback") == "Fallback"
    assert len(clean_message("m" * 2000, "x")) == 500
