"""Tests for the Git repositories behind dashboards and their views.

These use real Git in a temporary folder. They protect the promises the
history pages are built on: a save commits only the views that changed, a view
keeps its repository when it is renamed or moved, a deleted view keeps its
history, any version of a dashboard or a view can be read back exactly, and
nothing a caller passes can reach outside the storage folder.
"""

import copy
from pathlib import Path
import subprocess

import pytest

from homeassistant.components.dashboard_repos.repos import (
    DashboardRepositories,
    RepositoryError,
    match_views,
)

HOME = {"title": "Home", "path": "home", "cards": [{"type": "markdown"}]}
LIGHTS = {"title": "Lights", "cards": [{"type": "light", "entity": "light.a"}]}
SENSORS = {"title": "Sensors", "path": "sensors", "cards": []}
DASHBOARD = {"title": "Main", "views": [HOME, LIGHTS]}


@pytest.fixture
def repos(tmp_path: Path) -> DashboardRepositories:
    """Return repositories in a temporary folder."""
    return DashboardRepositories(tmp_path)


def _commits(repos: DashboardRepositories, view: str | None = None) -> int:
    return len(repos.commits("main", view))


def test_first_save_commits_dashboard_and_each_view(
    repos: DashboardRepositories,
) -> None:
    """The first save creates one repository per view and one for the dashboard."""
    assert repos.snapshot_dashboard("main", DASHBOARD) is not None
    assert _commits(repos) == 1
    assert _commits(repos, "home") == 1
    keys = [item["key"] for item in repos.dashboard_status({"id": "main"})["views"]]
    assert keys[0] == "home"
    assert keys[1].startswith("view-")
    assert (repos.root / "main" / "views.lock").read_text().count("\n") == 2


def test_unchanged_save_commits_nothing(repos: DashboardRepositories) -> None:
    """Saving the same configuration again is not a commit."""
    repos.snapshot_dashboard("main", DASHBOARD)
    assert repos.snapshot_dashboard("main", copy.deepcopy(DASHBOARD)) is None
    assert _commits(repos) == 1


def test_only_changed_view_gets_a_commit(repos: DashboardRepositories) -> None:
    """Changing one view commits that view and the dashboard, not the others."""
    repos.snapshot_dashboard("main", DASHBOARD)
    changed = copy.deepcopy(DASHBOARD)
    changed["views"][0]["cards"].append({"type": "entities"})
    repos.snapshot_dashboard("main", changed)
    assert _commits(repos) == 2
    assert _commits(repos, "home") == 2
    other = repos.dashboard_status({"id": "main"})["views"][1]["key"]
    assert _commits(repos, other) == 1
    assert "Home: change cards" in repos.commits("main", "home")[0].message


def test_rename_keeps_the_view_repository(repos: DashboardRepositories) -> None:
    """A view that is renamed keeps its key and its history."""
    repos.snapshot_dashboard("main", DASHBOARD)
    renamed = copy.deepcopy(DASHBOARD)
    renamed["views"][1]["title"] = "Lamps"
    repos.snapshot_dashboard("main", renamed)
    status = repos.dashboard_status({"id": "main"})
    assert len(status["views"]) == 2
    assert status["views"][1]["commits"] == 2
    assert status["views"][1]["title"] == "Lamps"


def test_reorder_keeps_keys(repos: DashboardRepositories) -> None:
    """Moving a view changes the dashboard but not any view repository."""
    repos.snapshot_dashboard("main", DASHBOARD)
    keys = [item["key"] for item in repos.dashboard_status({"id": "main"})["views"]]
    swapped = {"title": "Main", "views": [LIGHTS, HOME]}
    repos.snapshot_dashboard("main", swapped)
    after = [item["key"] for item in repos.dashboard_status({"id": "main"})["views"]]
    assert after == list(reversed(keys))
    assert "reorder" in repos.commits("main")[0].message.lower()
    assert _commits(repos, "home") == 1


def test_deleted_view_is_kept_in_removed(repos: DashboardRepositories) -> None:
    """A deleted view leaves the live list but keeps its history."""
    repos.snapshot_dashboard("main", DASHBOARD)
    repos.snapshot_dashboard("main", {"title": "Main", "views": [LIGHTS]})
    status = repos.dashboard_status({"id": "main"})
    assert [item["title"] for item in status["views"]] == ["Lights"]
    assert status["removed"] == ["home"]
    assert _commits(repos, "home") == 1
    assert "Remove view Home" in repos.commits("main")[0].message


def test_new_view_gets_its_path_as_key(repos: DashboardRepositories) -> None:
    """A new view with a safe path is kept under that path."""
    repos.snapshot_dashboard("main", DASHBOARD)
    repos.snapshot_dashboard("main", {"title": "Main", "views": [HOME, LIGHTS, SENSORS]})
    keys = [item["key"] for item in repos.dashboard_status({"id": "main"})["views"]]
    assert keys[2] == "sensors"


def test_version_reads_back_exactly(repos: DashboardRepositories) -> None:
    """Every earlier version of a dashboard and a view can be read back."""
    repos.snapshot_dashboard("main", DASHBOARD)
    first = repos.commits("main")[0].sha
    first_home = repos.commits("main", "home")[0].sha
    changed = copy.deepcopy(DASHBOARD)
    changed["title"] = "Renamed"
    changed["views"][0]["cards"] = []
    repos.snapshot_dashboard("main", changed)
    old = repos.content("main", first)["config"]
    assert old["title"] == "Main"
    assert old["views"][0] == HOME
    assert repos.content("main", first_home, "home")["config"] == HOME
    assert "title: Main" in repos.content("main", first)["yaml"]


def test_dashboard_without_views_is_kept(repos: DashboardRepositories) -> None:
    """A strategy dashboard has no views and still has a history."""
    repos.snapshot_dashboard("auto", {"strategy": {"type": "original-states"}})
    sha = repos.commits("auto")[0].sha
    assert repos.content("auto", sha)["config"] == {
        "strategy": {"type": "original-states"}
    }


def test_difference_of_dashboard_and_view(repos: DashboardRepositories) -> None:
    """The difference is text, for a dashboard and for one view."""
    repos.snapshot_dashboard("main", DASHBOARD)
    changed = copy.deepcopy(DASHBOARD)
    changed["views"][0]["cards"] = [{"type": "entities"}]
    repos.snapshot_dashboard("main", changed)
    old, new = (c.sha for c in reversed(repos.commits("main")))
    assert "+  - type: entities" in repos.difference("main", old, new)
    view_old, view_new = (c.sha for c in reversed(repos.commits("main", "home")))
    assert "+- type: entities" in repos.difference("main", view_old, view_new, "home")


def test_note_is_the_message(repos: DashboardRepositories) -> None:
    """A note replaces the generated message of every commit of the save."""
    repos.snapshot_dashboard("main", DASHBOARD)
    changed = copy.deepcopy(DASHBOARD)
    changed["views"][0]["cards"] = []
    repos.snapshot_dashboard("main", changed, "Restored to abc1234")
    assert repos.commits("main")[0].message == "Restored to abc1234"
    assert repos.commits("main", "home")[0].message == "Restored to abc1234"


@pytest.mark.parametrize(
    "dashboard_id", ["../x", "a/b", "-rf", ".hidden", "a.b", "", "x" * 65]
)
def test_unsafe_dashboard_ids_are_refused(
    repos: DashboardRepositories, dashboard_id: str
) -> None:
    """An id can never reach outside the storage folder."""
    with pytest.raises(RepositoryError):
        repos.snapshot_dashboard(dashboard_id, DASHBOARD)


@pytest.mark.parametrize("sha", ["--output=x", "HEAD", "zz", "abc"])
def test_unsafe_commits_are_refused(repos: DashboardRepositories, sha: str) -> None:
    """A commit id must look like one."""
    repos.snapshot_dashboard("main", DASHBOARD)
    with pytest.raises(RepositoryError):
        repos.content("main", sha)


def test_unsafe_view_key_is_refused(repos: DashboardRepositories) -> None:
    """A view key can never reach outside the dashboard repository."""
    repos.snapshot_dashboard("main", DASHBOARD)
    with pytest.raises(RepositoryError):
        repos.commits("main", "../x")


def test_views_that_are_not_a_list_are_refused(repos: DashboardRepositories) -> None:
    """A malformed configuration is reported, not committed."""
    with pytest.raises(RepositoryError):
        repos.snapshot_dashboard("main", {"views": "nope"})


def test_unsafe_path_is_not_used_as_key() -> None:
    """A path that is not a plain name gets a generated key."""
    keys = match_views([], [{"path": "../x"}, {"path": "ok"}], set())
    assert keys[0].startswith("view-")
    assert keys[1] == "ok"


def _git(cwd: Path, *args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=cwd, capture_output=True, text=True, check=True
    ).stdout


def test_one_clone_carries_every_view_and_its_history(
    repos: DashboardRepositories,
) -> None:
    """A clone of the dashboard repository alone holds all tabs and their history."""
    repos.snapshot_dashboard("main", DASHBOARD)
    changed = copy.deepcopy(DASHBOARD)
    changed["views"][0]["cards"] = [{"type": "entities"}]
    repos.snapshot_dashboard("main", changed)
    changed["views"] = changed["views"][:1]
    repos.snapshot_dashboard("main", changed)

    remote = repos.root / "remote.git"
    _git(repos.root, "init", "--bare", "--quiet", "--initial-branch=main", str(remote))
    repos.set_dashboard_remote("main", str(remote))
    assert repos.push_dashboard("main")["pushed"] is True

    clone = repos.root / "clone"
    _git(repos.root, "clone", "--quiet", str(remote), str(clone))
    views_lock = (clone / "views.lock").read_text().split()
    assert views_lock[0] == "home"
    assert "type: entities" in (clone / "views" / "home" / "view.yaml").read_text()
    home_history = _git(clone, "log", "--format=%s", "origin/view/home").splitlines()
    assert len(home_history) == 2
    assert _git(clone, "rev-parse", "origin/view/home").strip() == views_lock[1]
    removed = next(
        item
        for item in _git(clone, "branch", "-r", "--list", "origin/view/*").split()
        if item != "origin/view/home"
    )
    assert "Add view Lights" in _git(clone, "log", "--format=%s", removed)
    old = _git(clone, "log", "--format=%H", "main").split()[-1]
    assert "title: Lights" in _git(clone, "show", f"{old}:views/{removed.split('/')[-1]}/view.yaml")


def test_push_without_a_remote_is_refused(repos: DashboardRepositories) -> None:
    """There is no network use unless a remote was set."""
    repos.snapshot_dashboard("main", DASHBOARD)
    with pytest.raises(RepositoryError):
        repos.push_dashboard("main")
    with pytest.raises(RepositoryError):
        repos.set_dashboard_remote("main", "-oProxyCommand=x")
