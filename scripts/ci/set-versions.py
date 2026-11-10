#!/usr/bin/env python3
"""Stamp the build number into the vendored sources before an image build.

Usage: set-versions.py <build-number>

Every build gets a version that sorts above the previous one, so the updater on a
running system sees it as an update:
  core        <core>.<build>        for example 2026.11.1.42
  supervisor  <supervisor>.<build>  passed to the image build as BUILD_VERSION
  os          <os>.<build>          written to buildroot-external/meta
"""
import json
import pathlib
import re
import sys

root = pathlib.Path(__file__).resolve().parents[2]
build = sys.argv[1]
if not build.isdigit():
    sys.exit("build number must be digits")
versions = json.loads((root / "versions.json").read_text())

core = versions["core"]
major, minor, patch = core.split(".")
const = root / "core/homeassistant/const.py"
text = const.read_text()
text, count = re.subn(r'^PATCH_VERSION: Final = ".*"$', f'PATCH_VERSION: Final = "{patch}.{build}"', text, flags=re.M)
if count != 1:
    sys.exit("could not set PATCH_VERSION in core/homeassistant/const.py")
const.write_text(text)

pyproject = root / "core/pyproject.toml"
text = pyproject.read_text()
text, count = re.subn(r'^version\s*=\s*".*"$', f'version = "{core}.{build}"', text, count=1, flags=re.M)
if count != 1:
    sys.exit("could not set version in core/pyproject.toml")
pyproject.write_text(text)

meta = root / "operating-system/buildroot-external/meta"
text = meta.read_text()
text, count = re.subn(r'^VERSION_SUFFIX=".*"$', f'VERSION_SUFFIX="{build}"', text, flags=re.M)
if count != 1:
    sys.exit("could not set VERSION_SUFFIX in operating-system/buildroot-external/meta")
meta.write_text(text)

print(f"core={core}.{build}")
print(f"supervisor={versions['supervisor']}.{build}")
print(f"os={versions['os']}.{build}")
