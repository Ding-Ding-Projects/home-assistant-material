"""Tests that backups carry every automation repository and its history.

The automation repositories live in ``<config>/automation_repos/``. A backup
must contain every file below that folder, including every ``.git`` folder, and
a restore must give Git the same commit ids back.
"""

from __future__ import annotations

import os
from pathlib import Path, PurePath
import shutil
import subprocess
import tarfile
from unittest.mock import MagicMock

import pytest

from homeassistant.components.backup.const import (
    EXCLUDE_DATABASE_FROM_BACKUP,
    EXCLUDE_FROM_BACKUP,
)
from homeassistant.components.backup.manager import CoreBackupReaderWriter

GIT = shutil.which("git")
pytestmark = pytest.mark.skipif(GIT is None, reason="git is not installed")

REPO_FOLDER = "automation_repos"
AUTOMATION_NAMES = ["porch_light", "night_mode"]
LARGE_OBJECT_SIZE = 96 * 1024 * 1024


def _git(cwd: Path, *args: str) -> str:
    """Run a real Git command in a repository and return its output."""
    env = {
        **os.environ,
        "GIT_CONFIG_GLOBAL": os.devnull,
        "GIT_CONFIG_SYSTEM": os.devnull,
        "GIT_AUTHOR_NAME": "Test",
        "GIT_AUTHOR_EMAIL": "test@example.invalid",
        "GIT_COMMITTER_NAME": "Test",
        "GIT_COMMITTER_EMAIL": "test@example.invalid",
    }
    assert GIT is not None
    result = subprocess.run(  # noqa: S603
        [GIT, *args],
        cwd=cwd,
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def _make_repo(path: Path, commits: int) -> None:
    """Create a repository with real commits."""
    path.mkdir(parents=True, exist_ok=True)
    _git(path, "init", "--quiet")
    for number in range(commits):
        (path / "automation.yaml").write_text(
            f"alias: version {number}\n", encoding="utf-8"
        )
        _git(path, "add", "automation.yaml")
        _git(path, "commit", "--quiet", "-m", f"version {number}")


def _build_config(config_dir: Path) -> dict[str, str]:
    """Build the real layout and return the commit id of every repository."""
    root = config_dir / REPO_FOLDER
    _make_repo(root, 2)
    (root / "manifest.json").write_text('{"version": 1}', encoding="utf-8")
    snapshots = root / "snapshots"
    snapshots.mkdir()
    (snapshots / "first.json").write_text("{}", encoding="utf-8")
    heads = {REPO_FOLDER: _git(root, "rev-parse", "HEAD")}
    for index, name in enumerate(AUTOMATION_NAMES):
        repo = root / "automations" / name
        _make_repo(repo, index + 2)
        heads[f"{REPO_FOLDER}/automations/{name}"] = _git(repo, "rev-parse", "HEAD")
    # Files elsewhere in the configuration folder that really are excluded.
    (config_dir / "configuration.yaml").write_text("default_config:\n")
    (config_dir / "home-assistant.log").write_text("noise")
    return heads


def _all_files(base: Path) -> set[str]:
    """Return every file and folder below base as posix relative paths."""
    return {p.relative_to(base).as_posix() for p in base.rglob("*")}


def _excluded(path: PurePath, excludes: list[str]) -> bool:
    """Apply the same matching rule the backup writer uses."""
    return any(path.full_match(f"data/{exclude}") for exclude in excludes)


def _create_archive(
    config_dir: Path, tar_path: Path, *, database_included: bool = True
) -> None:
    """Run the backup writer's real archive code path."""
    hass = MagicMock()
    hass.config.path = lambda *parts: str(config_dir.joinpath(*parts))
    writer = CoreBackupReaderWriter(hass)
    writer._mkdir_and_generate_backup_contents(
        {"slug": "abc123", "version": 2},
        database_included,
        None,
        tar_path,
    )


def _extract(tar_path: Path, target: Path) -> None:
    """Extract the core archive from the outer backup archive."""
    with tarfile.open(tar_path, "r:") as outer:
        core_io = outer.extractfile("homeassistant.tar.gz")
        assert core_io is not None
        with tarfile.open(fileobj=core_io, mode="r:gz") as core:
            core.extractall(target, filter="fully_trusted")


@pytest.fixture
def config_dir(tmp_path: Path) -> Path:
    """Return a throwaway configuration folder."""
    folder = tmp_path / "config"
    folder.mkdir()
    return folder


def test_no_exclude_pattern_matches_automation_repos(config_dir: Path) -> None:
    """Nothing under automation_repos matches any exclude pattern."""
    _build_config(config_dir)
    root = config_dir / REPO_FOLDER
    for excludes in (
        EXCLUDE_FROM_BACKUP,
        EXCLUDE_FROM_BACKUP + EXCLUDE_DATABASE_FROM_BACKUP,
    ):
        for path in root.rglob("*"):
            arc_path = PurePath("data") / path.relative_to(config_dir)
            assert not _excluded(arc_path, excludes), arc_path
    assert not any(
        pattern.startswith((REPO_FOLDER, "**/.git", ".git")) for pattern in EXCLUDE_FROM_BACKUP
    )


def test_exclude_rule_still_works_for_other_files(config_dir: Path) -> None:
    """The matcher used above really excludes something, so it is not inert."""
    assert _excluded(PurePath("data/home-assistant.log"), EXCLUDE_FROM_BACKUP)
    assert not _excluded(PurePath("data/configuration.yaml"), EXCLUDE_FROM_BACKUP)


def test_backup_includes_every_file_and_git_folder(config_dir: Path) -> None:
    """Every file and every .git folder below automation_repos is archived."""
    _build_config(config_dir)
    tar_path = config_dir.parent / "backup.tar"
    _create_archive(config_dir, tar_path)
    restored = config_dir.parent / "restored"
    _extract(tar_path, restored)

    expected = {
        p for p in _all_files(config_dir) if p.startswith(REPO_FOLDER)
    }
    actual = {
        p for p in _all_files(restored / "data") if p.startswith(REPO_FOLDER)
    }
    assert expected, "the test layout is empty"
    assert actual == expected
    for git_folder in (
        REPO_FOLDER + "/.git",
        *(f"{REPO_FOLDER}/automations/{n}/.git" for n in AUTOMATION_NAMES),
    ):
        assert git_folder + "/HEAD" in actual
        assert git_folder + "/objects" in actual
    assert f"{REPO_FOLDER}/manifest.json" in actual
    assert f"{REPO_FOLDER}/snapshots/first.json" in actual
    # Contents match byte for byte, not only names.
    for name in expected:
        source = config_dir / name
        if source.is_file():
            assert (restored / "data" / name).read_bytes() == source.read_bytes()
    # The control: the excluded log really is left out.
    assert not (restored / "data" / "home-assistant.log").exists()
    assert (restored / "data" / "configuration.yaml").exists()


def test_restored_repositories_report_the_same_commit_ids(config_dir: Path) -> None:
    """After extraction Git reports the same commit ids and a sound history."""
    heads = _build_config(config_dir)
    tar_path = config_dir.parent / "backup.tar"
    _create_archive(config_dir, tar_path)
    restored = config_dir.parent / "restored"
    _extract(tar_path, restored)

    for relative, head in heads.items():
        repo = restored / "data" / relative
        assert _git(repo, "rev-parse", "HEAD") == head
        original = config_dir / relative
        assert _git(repo, "rev-list", "--all") == _git(original, "rev-list", "--all")
        _git(repo, "fsck", "--full", "--strict")
        assert _git(repo, "status", "--porcelain") == ""


def test_large_git_object_folder_is_not_skipped(config_dir: Path) -> None:
    """A very large object inside a .git folder is not dropped by a size rule."""
    _build_config(config_dir)
    pack_dir = (
        config_dir / REPO_FOLDER / "automations" / AUTOMATION_NAMES[0] / ".git"
        / "objects" / "pack"
    )
    pack_dir.mkdir(parents=True, exist_ok=True)
    large = pack_dir / "pack-large.pack"
    with large.open("wb") as handle:
        handle.truncate(LARGE_OBJECT_SIZE)

    tar_path = config_dir.parent / "backup.tar"
    _create_archive(config_dir, tar_path)
    restored = config_dir.parent / "restored"
    _extract(tar_path, restored)

    restored_large = (
        restored / "data" / large.relative_to(config_dir)
    )
    assert restored_large.is_file()
    assert restored_large.stat().st_size == LARGE_OBJECT_SIZE
