#!/usr/bin/env python3
"""Check a published release against the files that were meant to be attached.

Usage: check-release.py <release-readback.json> <file-list.txt>

The readback is the output of `gh release view <tag> --json isDraft,isPrerelease,assets`.
The file list has one local path per line: the files the build jobs produced.
Exits non-zero when the release is a draft, is a prerelease, or when any expected
file is missing or has a different size. Names are compared after dropping every
character that is not a letter or digit, because GitHub rewrites unusual characters
in asset names.
"""
import json
import os
import re
import sys

readback = json.load(open(sys.argv[1], encoding="utf-8"))
paths = [line.rstrip("\n") for line in open(sys.argv[2], encoding="utf-8") if line.strip()]


def key(name):
    return re.sub(r"[^a-z0-9]", "", name.lower())


problems = []
if readback.get("isDraft"):
    problems.append("the release is a draft")
if readback.get("isPrerelease"):
    problems.append("the release is a prerelease")

remote = {}
for asset in readback.get("assets", []):
    remote[key(asset["name"])] = asset

for path in paths:
    name = os.path.basename(path)
    asset = remote.pop(key(name), None)
    if asset is None:
        problems.append(f"missing asset {name}")
    elif asset["size"] != os.path.getsize(path):
        problems.append(f"asset {name} has {asset['size']} bytes, expected {os.path.getsize(path)}")

for asset in remote.values():
    problems.append(f"unexpected asset {asset['name']}")

if problems:
    for problem in problems:
        print(f"::error::{problem}")
    sys.exit(1)
print(f"Release read back: normal release, {len(paths)} assets, all present with the expected sizes.")
