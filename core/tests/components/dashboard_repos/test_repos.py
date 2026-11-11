"""Tests for the Git repositories behind dashboards and their views.

These use real Git in a temporary folder. They protect the promises the
history pages are built on: a save commits only the views that changed, a view
keeps its repository when it is renamed or moved, a deleted view keeps its
history, any version of a dashboard or a view can be read back exactly, and
nothing a caller passes can reach outside the storage folder.
"""

import asyncio
from collections.abc import Callable
import copy
from pathlib import Path
import subprocess

import pytest

from homeassistant.components.dashboard_repos.repos import (
    DashboardRepositories,
    RepositoryError,
    check_config,
    check_dashboard_id,
    check_remote,
    check_view_key,
    mask_text,
    match_views,
    place_view,
)
from homeassistant.components.dashboard_repos.snapshot_queue import SnapshotQueue

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
    _git(repos.root / "main", "remote", "add", "origin", str(remote))
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


@pytest.mark.parametrize(
    ("check", "value"),
    [
        (check_view_key, "home\n"),
        (check_view_key, "home "),
        (check_dashboard_id, "main\n"),
        (check_dashboard_id, "_default\n"),
    ],
)
def test_trailing_newline_is_not_a_name(
    check: Callable[[str], str], value: str
) -> None:
    """A name that ends in a newline is refused, not trimmed."""
    with pytest.raises(RepositoryError):
        check(value)


def test_commit_with_trailing_newline_is_refused(repos: DashboardRepositories) -> None:
    """A commit id that ends in a newline never reaches a Git argument."""
    repos.snapshot_dashboard("main", DASHBOARD)
    sha = repos.commits("main")[0].sha
    with pytest.raises(RepositoryError):
        repos.content("main", sha + "\n")


def test_view_path_with_newline_does_not_break_saving(
    repos: DashboardRepositories,
) -> None:
    """A path ending in a newline gets a generated key, and later saves still work."""
    config = {"title": "Main", "views": [{"title": "A", "path": "foo\n", "cards": []}]}
    repos.snapshot_dashboard("main", config)
    key = repos.dashboard_status({"id": "main"})["views"][0]["key"]
    assert key.startswith("view-")
    config["views"][0]["cards"] = [{"type": "entities"}]
    assert repos.snapshot_dashboard("main", config) is not None
    assert _commits(repos, key) == 2


def test_oversized_view_records_nothing(repos: DashboardRepositories) -> None:
    """One view that is too large stops the save before any view is committed."""
    repos.snapshot_dashboard("main", DASHBOARD)
    before = _commits(repos)
    huge = {"title": "Huge", "path": "huge", "cards": ["x" * 2_100_000]}
    changed = copy.deepcopy(DASHBOARD)
    changed["views"][0]["cards"] = [{"type": "entities"}]
    changed["views"].append(huge)
    with pytest.raises(RepositoryError):
        repos.snapshot_dashboard("main", changed)
    assert _commits(repos) == before
    assert _commits(repos, "home") == 1
    assert not (repos.root / "main" / "views" / "huge").exists()
    changed["views"] = changed["views"][:2]
    assert repos.snapshot_dashboard("main", changed)


def test_oversized_settings_record_nothing(repos: DashboardRepositories) -> None:
    """Settings that are too large are refused before a view is committed."""
    config = {"title": "x" * 2_100_000, "views": [HOME]}
    with pytest.raises(RepositoryError):
        repos.snapshot_dashboard("main", config)
    assert repos.commits("main") == []
    assert not (repos.root / "main" / "views").exists()


def test_deleted_dashboard_history_is_not_adopted(
    repos: DashboardRepositories,
) -> None:
    """A deleted dashboard keeps its history aside, and a new one starts fresh."""
    repos.snapshot_dashboard("main", DASHBOARD)
    moved = repos.archive_dashboard("main")
    assert moved is not None
    assert moved.startswith("main-")
    assert repos.commits("main") == []
    assert (repos.root / "_removed" / moved / ".git").exists()
    assert repos.known_dashboards() == []
    repos.snapshot_dashboard("main", {"title": "New", "views": [SENSORS]})
    assert _commits(repos) == 1
    keys = [item["key"] for item in repos.dashboard_status({"id": "main"})["views"]]
    assert keys == ["sensors"]
    assert repos.archive_dashboard("nothing-here") is None


def test_archiving_twice_in_one_second_keeps_both(
    repos: DashboardRepositories,
) -> None:
    """Two archives of the same address never overwrite each other."""
    names = set()
    for _ in range(2):
        repos.snapshot_dashboard("main", DASHBOARD)
        names.add(repos.archive_dashboard("main"))
    assert len(names) == 2
    assert len(list((repos.root / "_removed").iterdir())) == 2


def test_forget_deletes_the_history(repos: DashboardRepositories) -> None:
    """Forgetting removes every version, and the next save starts again."""
    repos.snapshot_dashboard("main", DASHBOARD)
    assert repos.forget_dashboard("main") is True
    assert not (repos.root / "main").exists()
    assert not (repos.root / "_removed").exists()
    assert repos.forget_dashboard("main") is False
    repos.snapshot_dashboard("main", DASHBOARD)
    assert _commits(repos) == 1


@pytest.mark.parametrize(
    "address",
    [
        "ssh://user:pw@host/x.git",
        "ssh://git@host/x.git",
        "https://user:pw@host/x.git",
        "https://user@host/x.git",
        "https://host/x.git?token=abc",
        "https://host/x.git#frag",
        "https://host/x.git\nssh://evil/x.git",
        "https://host/x y.git",
        "ssh://host/x.git?a=b",
        "git@host:x.git?a=b",
        "git@host:x@y.git",
        "bob@host:x.git",
        "host:x.git",
        "/srv/repository.git",
        "-oProxyCommand=x",
        "ext::sh -c x",
        "file:///srv/x.git",
        "http://host/x.git",
        "https://-host/x.git",
        "https://host/" + "a" * 600,
    ],
)
def test_hostile_remote_addresses_are_refused(
    repos: DashboardRepositories, address: str
) -> None:
    """An address with credentials, a query, a fragment or a local path is refused."""
    with pytest.raises(RepositoryError):
        check_remote(address)
    repos.snapshot_dashboard("main", DASHBOARD)
    with pytest.raises(RepositoryError):
        repos.set_dashboard_remote("main", address)
    assert repos.dashboard_status({"id": "main"})["remote"] is None


@pytest.mark.parametrize(
    "address",
    [
        "https://example.com/team/home.git",
        "ssh://example.com:2222/team/home.git",
        "git@example.com:team/home.git",
    ],
)
def test_plain_remote_addresses_are_kept(
    repos: DashboardRepositories, address: str
) -> None:
    """An address without credentials is stored and shown as it is."""
    repos.snapshot_dashboard("main", DASHBOARD)
    repos.set_dashboard_remote("main", address)
    status = repos.dashboard_status({"id": "main"})
    assert status["remote"] == address
    assert status["remote_unsafe"] is False
    repos.set_dashboard_remote("main", None)
    assert repos.dashboard_status({"id": "main"})["remote"] is None


def test_stored_remote_with_credentials_is_hidden_and_not_pushed(
    repos: DashboardRepositories,
) -> None:
    """An address set before the rules tightened is never shown or used."""
    repos.snapshot_dashboard("main", DASHBOARD)
    _git(repos.root / "main", "remote", "add", "origin", "https://user:secret@h/x.git")
    status = repos.dashboard_status({"id": "main"})
    assert status["remote"] is None
    assert status["remote_unsafe"] is True
    assert "secret" not in str(status)
    with pytest.raises(RepositoryError) as error:
        repos.push_dashboard("main")
    assert "secret" not in str(error.value)


def test_push_failure_never_returns_the_address(
    repos: DashboardRepositories,
) -> None:
    """A rejected push reports what went wrong without the address."""
    repos.snapshot_dashboard("main", DASHBOARD)
    address = "https://127.0.0.1:9/team/home.git"
    repos.set_dashboard_remote("main", address)
    result = repos.push_dashboard("main")
    assert result["pushed"] is False
    assert address not in (result["error"] or "")
    last = repos.dashboard_status({"id": "main"})["last_push"]
    assert last["ok"] is False
    assert last["time"] == result["time"]


def test_last_push_is_recorded(repos: DashboardRepositories) -> None:
    """A good push is remembered with its time."""
    repos.snapshot_dashboard("main", DASHBOARD)
    remote = repos.root / "remote.git"
    _git(repos.root, "init", "--bare", "--quiet", "--initial-branch=main", str(remote))
    _git(repos.root / "main", "remote", "add", "origin", str(remote))
    assert repos.dashboard_status({"id": "main"})["last_push"] is None
    result = repos.push_dashboard("main")
    assert result["pushed"] is True
    assert repos.dashboard_status({"id": "main"})["last_push"] == {
        "time": result["time"],
        "ok": True,
        "error": None,
    }


def test_masking_removes_credentials_from_messages() -> None:
    """Git error text loses user info and the address."""
    text = "fatal: unable to access 'https://user:pw@host/x/': 403"
    assert "pw" not in mask_text(text)
    assert "host/x" not in mask_text(text, "https://user:pw@host/x/")


def test_restore_finds_a_view_by_key_only() -> None:
    """A view goes back where its key is, never by position or title."""
    views = ["a", "b", "c"]
    assert place_view(views, ["k1", "k2", "k3"], "k2", "B2") == (
        ["a", "B2", "c"],
        False,
    )
    assert views == ["a", "b", "c"]


@pytest.mark.parametrize(
    ("keys", "key"),
    [
        (["k1", "k2", "k3"], "gone"),
        (["k1", "k2"], "k2"),
        ([], "k1"),
    ],
)
def test_restore_of_an_unknown_key_adds_a_tab(keys: list[str], key: str) -> None:
    """When no view has the key, the view is added at the end as a new tab."""
    assert place_view(["a", "b", "c"], keys, key, "X") == (["a", "b", "c", "X"], True)


def test_keys_follow_a_rename_and_reorder(repos: DashboardRepositories) -> None:
    """The recorded keys line up with the saved views after a rename and a move."""
    repos.snapshot_dashboard("main", DASHBOARD)
    first = repos.current_keys("main")
    renamed = {"title": "Main", "views": [HOME, dict(LIGHTS, title="Lamps")]}
    repos.snapshot_dashboard("main", renamed)
    moved = {"title": "Main", "views": [dict(LIGHTS, title="Lamps"), HOME]}
    repos.snapshot_dashboard("main", moved)
    assert repos.current_keys("main") == [first[1], first[0]]


def test_restored_configuration_is_checked() -> None:
    """A configuration that cannot be recorded is refused before it is saved."""
    with pytest.raises(RepositoryError):
        check_config({"views": "nope"})
    with pytest.raises(RepositoryError):
        check_config({"views": [{"cards": ["x" * 2_100_000]}]})
    assert check_config(DASHBOARD) == DASHBOARD


def test_keys_that_differ_only_by_case_do_not_collide() -> None:
    """Two views whose paths differ only by case get different folders."""
    keys = match_views([], [{"path": "Home"}, {"path": "home"}], set())
    assert len({key.lower() for key in keys}) == 2
    keys = match_views([], [{"path": "home"}], {"Home"})
    assert keys[0].startswith("view-")


async def test_a_burst_of_saves_runs_one_commit() -> None:
    """Fifty saves while a commit waits become one commit that reads the newest."""
    queue = SnapshotQueue()
    runs: list[str] = []

    async def commit() -> None:
        runs.append("run")

    async with queue.lock:
        tasks = [asyncio.create_task(queue.run("main", commit)) for _ in range(50)]
        await asyncio.sleep(0)
        assert queue.pending == {"main"}
    await asyncio.gather(*tasks)
    assert runs == ["run"]
    assert queue.pending == frozenset()


async def test_a_save_during_a_commit_queues_one_more() -> None:
    """A save that arrives while a commit runs is not lost."""
    queue = SnapshotQueue()
    started = asyncio.Event()
    release = asyncio.Event()
    runs: list[str] = []

    async def slow() -> None:
        runs.append("slow")
        started.set()
        await release.wait()

    async def next_commit() -> None:
        runs.append("next")

    first = asyncio.create_task(queue.run("main", slow))
    await started.wait()
    later = [asyncio.create_task(queue.run("main", next_commit)) for _ in range(20)]
    await asyncio.sleep(0)
    release.set()
    await asyncio.gather(first, *later)
    assert runs == ["slow", "next"]


async def test_a_failing_commit_is_not_raised() -> None:
    """The listener never raises, and the next save still runs."""
    queue = SnapshotQueue()
    runs: list[str] = []

    async def broken() -> None:
        raise ValueError("boom")

    async def fine() -> None:
        runs.append("fine")

    await queue.run("main", broken)
    await queue.run("main", fine)
    assert runs == ["fine"]


async def test_other_dashboards_do_not_merge() -> None:
    """Each dashboard keeps its own waiting commit."""
    queue = SnapshotQueue()
    runs: list[str] = []

    async def commit_a() -> None:
        runs.append("a")

    async def commit_b() -> None:
        runs.append("b")

    async with queue.lock:
        tasks = [
            asyncio.create_task(queue.run("a", commit_a)),
            asyncio.create_task(queue.run("b", commit_b)),
        ]
        await asyncio.sleep(0)
    await asyncio.gather(*tasks)
    assert sorted(runs) == ["a", "b"]
