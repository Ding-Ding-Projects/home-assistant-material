#!/usr/bin/env python3
"""Generate English integration translations from the fork's own strings.json files.

Home Assistant keeps ``homeassistant/components/<name>/translations/`` out of
version control. The release workflow copies those files out of the upstream
image, which knows nothing about integrations added by this fork and carries the
upstream wording for integrations whose ``strings.json`` this fork edited.

This script reproduces what ``python -m script.translations develop --all`` does
for English, using only the standard library:

* read ``homeassistant/strings.json`` and every ``components/*/strings.json``;
* resolve ``[%key:...%]`` references across integrations and the common strings;
* drop the legacy ``platform`` block, empty branches and empty integrations;
* write ``translations/en.json`` for each integration.

When an ``en.json`` already exists it is deep-merged: every key generated from the
fork's ``strings.json`` wins, keys that only the existing file has are kept. Other
languages are never touched.

Usage: build-own-translations.py [path to the homeassistant package directory]
"""

from __future__ import annotations

import json
from pathlib import Path
import re
import sys
from typing import Any

REFERENCE_RE = re.compile(r"\[\%key:([a-z0-9_]+(?:::(?:[a-z0-9-_])+)+)\%\]")


class MissingReference(Exception):
    """A [%key:...%] reference that cannot be resolved."""


def load_json(path: Path) -> Any:
    """Load a JSON file, naming the file on failure."""
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as err:
        raise SystemExit(f"error: invalid JSON in {path}: {err}") from err


def flatten(translations: dict[str, Any]) -> dict[str, str]:
    """Flatten nested string data into ``a::b::c`` keys."""
    flat: dict[str, str] = {}

    def walk(node: dict[str, Any], prefix: tuple[str, ...]) -> None:
        for key, value in node.items():
            if isinstance(value, dict):
                walk(value, (*prefix, key))
            elif isinstance(value, str):
                flat["::".join((*prefix, key))] = value

    walk(translations, ())
    return flat


def substitute_reference(value: str, flat: dict[str, str]) -> str:
    """Resolve the references in one string, following chains of references."""
    result = value
    for key in REFERENCE_RE.findall(value):
        if key not in flat:
            raise MissingReference(key)
        result = result.replace(f"[%key:{key}%]", substitute_reference(flat[key], flat))
    return result


def substitute_references(node: dict[str, Any], flat: dict[str, str], where: str) -> dict[str, Any]:
    """Resolve references in a nested structure, dropping empty branches."""
    result: dict[str, Any] = {}
    for key, value in node.items():
        if isinstance(value, dict):
            sub = substitute_references(value, flat, where)
            if sub:
                result[key] = sub
        elif isinstance(value, str):
            try:
                result[key] = substitute_reference(value, flat)
            except MissingReference as err:
                raise SystemExit(
                    f"error: unresolvable reference '{err}' in {where} (key '{key}')"
                ) from err
    return result


def deep_merge(existing: dict[str, Any], generated: dict[str, Any]) -> dict[str, Any]:
    """Return existing with every generated value laid over it."""
    merged = dict(existing)
    for key, value in generated.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def dump(data: dict[str, Any]) -> str:
    """Serialise the way Home Assistant's own generator does."""
    return json.dumps(data, sort_keys=True, indent=4)


def build(homeassistant_dir: Path) -> tuple[list[str], list[str]]:
    """Generate the files. Returns (created, changed) integration names."""
    components_dir = homeassistant_dir / "components"
    translations = load_json(homeassistant_dir / "strings.json")
    translations["component"] = {
        path.parent.name: load_json(path)
        for path in sorted(components_dir.glob("*/strings.json"))
    }
    flat = flatten(translations)

    created: list[str] = []
    changed: list[str] = []
    for name, strings in translations["component"].items():
        generated = substitute_references(strings, flat, f"component '{name}'")
        generated.pop("platform", None)
        if not generated:
            continue
        target = components_dir / name / "translations" / "en.json"
        if target.exists():
            existing = load_json(target)
            merged = deep_merge(existing, generated)
            if merged == existing:
                continue
            changed.append(name)
        else:
            merged = generated
            created.append(name)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(dump(merged), encoding="utf-8")
    return created, changed


def main(argv: list[str]) -> int:
    """Run the script."""
    if len(argv) > 2:
        print(__doc__, file=sys.stderr)
        return 2
    homeassistant_dir = Path(argv[1] if len(argv) == 2 else "core/homeassistant")
    if not (homeassistant_dir / "strings.json").is_file():
        print(f"error: {homeassistant_dir}/strings.json not found", file=sys.stderr)
        return 2
    created, changed = build(homeassistant_dir)
    print(f"integrations with no English file that got one: {len(created)}")
    for name in created:
        print(f"  created {name}")
    print(f"integrations with keys added or changed: {len(changed)}")
    for name in changed:
        print(f"  updated {name}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
