#!/usr/bin/env python3
"""Write the change list that the Updates page reads to compare versions.

Usage: make-changes-json.py <build-number> <output.json> [--head <commit>]

The list is rebuilt from the repository history on every run, so it needs no
previous copy: every release tag of the form v<core>.<build> is one entry, and
the build being published is the newest entry even before it has a tag. Each
entry holds the commits since the entry before it, with the subject line and the
explanation from the commit message. A message may carry a second explanation in
Cantonese; it is kept apart so the page can show the language the reader chose.

Needs full commit history and tags (a blobless clone is enough).
"""
import argparse
import datetime
import json
import pathlib
import re
import subprocess

root = pathlib.Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument("build")
parser.add_argument("output")
parser.add_argument("--head", default="HEAD")
args = parser.parse_args()

MAX_RELEASES = 30
MAX_CHANGES = 500
MAX_TEXT = 1200

versions = json.loads((root / "versions.json").read_text())
core_base = versions["core"]
build = int(args.build)


def git(*command: str) -> str:
    return subprocess.run(
        ["git", "-C", str(root), *command],
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    ).stdout


CJK = re.compile(r"[㐀-鿿]")
TRAILER = re.compile(r"^[A-Za-z-]+: .+$")

# The part of the product a commit touched, from the top-level folders it changed.
AREAS = (
    ("frontend/", "interface"),
    ("core/", "core"),
    ("supervisor/", "supervisor"),
    ("operating-system/", "os"),
    ("deploy-assistant/", "deploy"),
    ("landingpage/", "interface"),
    ("docs/", "docs"),
    ("design/", "design"),
    (".github/", "build"),
    ("scripts/", "build"),
)


def areas_for(paths: list[str]) -> list[str]:
    found: list[str] = []
    for path in paths:
        area = "docs" if "/" not in path and path.endswith(".md") else None
        for prefix, name in AREAS:
            if path.startswith(prefix):
                area = name
                break
        if area and area not in found:
            found.append(area)
    return found or ["build"]


def split_body(body: str) -> tuple[str, str]:
    english: list[str] = []
    cantonese: list[str] = []
    for paragraph in re.split(r"\n\s*\n", body.strip()):
        lines = [line for line in paragraph.splitlines() if line.strip()]
        if not lines or all(TRAILER.match(line) for line in lines):
            continue
        text = " ".join(line.strip() for line in lines)
        (cantonese if CJK.search(text) else english).append(text)
    return ("\n\n".join(english)[:MAX_TEXT], "\n\n".join(cantonese)[:MAX_TEXT])


def commits(older: str | None, newer: str) -> list[dict]:
    span = newer if older is None else f"{older}..{newer}"
    raw = git(
        "log",
        "--no-merges",
        "--name-only",
        "--format=%x1e%H%x1f%cI%x1f%s%x1f%b%x1f",
        span,
    )
    found = []
    for record in raw.split("\x1e")[1:]:
        sha, date, subject, body, files = record.split("\x1f", 4)
        english, cantonese = split_body(body)
        change = {
            "sha": sha[:9],
            "date": date,
            "title": subject.strip(),
            "areas": areas_for([f for f in files.splitlines() if f.strip()]),
        }
        if english:
            change["detail"] = english
        if cantonese:
            change["detail_yue"] = cantonese
        found.append(change)
    return found


tag_pattern = re.compile(rf"^v{re.escape(core_base)}\.(\d+)$")
tagged: list[tuple[int, str]] = []
for tag in git("tag", "--list", f"v{core_base}.*").split():
    match = tag_pattern.match(tag)
    if match and int(match.group(1)) < build:
        tagged.append((int(match.group(1)), tag))
tagged.sort()

head = git("rev-parse", args.head).strip()
points: list[tuple[int, str, str | None]] = [(number, tag, tag) for number, tag in tagged]
points.append((build, head, None))

releases = []
budget = MAX_CHANGES
for index in range(len(points) - 1, -1, -1):
    number, ref, tag = points[index]
    if len(releases) >= MAX_RELEASES or budget <= 0:
        break
    older = points[index - 1][1] if index else None
    if older is None:
        # The oldest entry would list the whole history; it only marks the start.
        changes: list[dict] = []
    else:
        changes = commits(older, ref)
    truncated = len(changes) > budget
    changes = changes[:budget]
    budget -= len(changes)
    entry = {
        "build": number,
        "core": f"{core_base}.{number}",
        "supervisor": f"{versions['supervisor']}.{number}",
        "os": f"{versions['os']}.{number}",
        "tag": tag,
        "source": git("rev-parse", ref + "^{commit}").strip()[:9],
        "date": git("log", "-1", "--format=%cI", ref).strip(),
        "previous_build": points[index - 1][0] if index else None,
        "changes": changes,
    }
    if truncated:
        entry["truncated"] = True
    releases.append(entry)

feed = {
    "format": 1,
    "generated": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "repository": versions["repository"],
    "newest_build": build,
    "releases": releases,
}
pathlib.Path(args.output).write_text(
    json.dumps(feed, indent=1, ensure_ascii=False) + "\n", encoding="utf-8"
)
print(json.dumps({"releases": len(releases), "changes": MAX_CHANGES - budget}))
