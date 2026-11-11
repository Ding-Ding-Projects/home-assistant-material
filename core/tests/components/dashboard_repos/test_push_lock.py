"""Tests for how a dashboard push shares its repository with saves."""

from pathlib import Path

import pytest

from homeassistant.components.dashboard_repos import repos as repos_module
from homeassistant.components.dashboard_repos.repos import (
    DashboardRepositories,
    RepositoryError,
)

CONFIG = {"title": "Home", "views": [{"title": "Main", "path": "main", "cards": []}]}


def test_a_dashboard_is_not_pushed_twice_at_once(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A second push waits for the first, then reports that it is still running."""
    repos = DashboardRepositories(tmp_path / "dashboard_repos")
    repos.snapshot_dashboard("main", CONFIG, None)
    monkeypatch.setattr(
        repos, "_stored_remote", lambda path: ("https://example.com/x.git", False)
    )
    monkeypatch.setattr(repos_module, "REMOTE_TIMEOUT", 0.05)

    with repos._remote_lock("main"), pytest.raises(RepositoryError, match="still running"):
        repos.push_dashboard("main")
    assert repos.errors == {}


def test_the_remembered_remote_follows_a_change(tmp_path: Path) -> None:
    """Setting a remote is seen at once by the next status."""
    repos = DashboardRepositories(tmp_path / "dashboard_repos")
    repos.snapshot_dashboard("main", CONFIG, None)
    item = {"id": "main", "url_path": None, "title": "Home"}
    assert repos.dashboard_status(item)["remote"] is None
    repos.set_dashboard_remote("main", "https://example.com/a.git")
    assert repos.dashboard_status(item)["remote"] == "https://example.com/a.git"
    repos.set_dashboard_remote("main", None)
    assert repos.dashboard_status(item)["remote"] is None
