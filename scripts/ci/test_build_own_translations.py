"""Tests for build-own-translations.py (run with pytest)."""

import importlib.util
import json
from pathlib import Path

import pytest

SCRIPT = Path(__file__).with_name("build-own-translations.py")
spec = importlib.util.spec_from_file_location("build_own_translations", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def write(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data), encoding="utf-8")


@pytest.fixture
def ha(tmp_path: Path) -> Path:
    root = tmp_path / "homeassistant"
    write(root / "strings.json", {"common": {"config_flow": {"abort": {"done": "Done"}}}})
    return root


def en(ha: Path, name: str) -> dict:
    return json.loads((ha / "components" / name / "translations" / "en.json").read_text())


def test_missing_file_is_created(ha: Path) -> None:
    write(ha / "components" / "mine" / "strings.json", {"title": "Mine"})
    created, changed = module.build(ha)
    assert created == ["mine"] and changed == []
    assert en(ha, "mine") == {"title": "Mine"}


def test_merge_keeps_upstream_only_keys_and_fork_wins(ha: Path) -> None:
    write(ha / "components" / "x" / "strings.json", {"title": "New", "added": "Added"})
    write(
        ha / "components" / "x" / "translations" / "en.json",
        {"title": "Old", "upstream_only": "Keep"},
    )
    created, changed = module.build(ha)
    assert created == [] and changed == ["x"]
    assert en(ha, "x") == {"title": "New", "added": "Added", "upstream_only": "Keep"}


def test_identical_file_is_not_reported(ha: Path) -> None:
    write(ha / "components" / "x" / "strings.json", {"title": "Same"})
    write(ha / "components" / "x" / "translations" / "en.json", {"title": "Same"})
    assert module.build(ha) == ([], [])


def test_references_are_resolved_across_integrations(ha: Path) -> None:
    write(ha / "components" / "base" / "strings.json", {"title": "Base"})
    write(
        ha / "components" / "mine" / "strings.json",
        {
            "a": "[%key:common::config_flow::abort::done%]",
            "b": "[%key:component::base::title%] x",
        },
    )
    module.build(ha)
    assert en(ha, "mine") == {"a": "Done", "b": "Base x"}


def test_unresolvable_reference_fails_and_names_it(ha: Path) -> None:
    write(ha / "components" / "mine" / "strings.json", {"a": "[%key:component::nope::title%]"})
    with pytest.raises(SystemExit) as err:
        module.build(ha)
    assert "component::nope::title" in str(err.value)


def test_other_languages_untouched(ha: Path) -> None:
    write(ha / "components" / "x" / "strings.json", {"title": "New"})
    de = ha / "components" / "x" / "translations" / "de.json"
    write(de, {"title": "Alt"})
    before = de.read_text()
    module.build(ha)
    assert de.read_text() == before


def test_platform_block_and_empty_branches_are_dropped(ha: Path) -> None:
    write(
        ha / "components" / "x" / "strings.json",
        {"platform": {"a": "b"}, "title": "T", "empty": {}},
    )
    module.build(ha)
    assert en(ha, "x") == {"title": "T"}
