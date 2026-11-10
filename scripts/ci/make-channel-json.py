#!/usr/bin/env python3
"""Write the update feed that the supervisor reads.

Usage: make-channel-json.py <build-number> <output.json> [--previous <file>] [--os <tag>]

The feed starts from the vendored upstream feed (version/stable.json) and replaces
the core and supervisor versions and image names with this repository's builds.
Operating system entries are only advanced with --os, which is passed once signed
update bundles for that release exist. Without it the previous feed's OS entries
are kept, or the upstream numbers on the very first run, so no OS update that
cannot be installed is ever offered.
"""
import argparse
import json
import pathlib

root = pathlib.Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument("build")
parser.add_argument("output")
parser.add_argument("--previous")
parser.add_argument("--os", dest="os_tag")
args = parser.parse_args()

versions = json.loads((root / "versions.json").read_text())
feed = json.loads((root / "version/stable.json").read_text())
registry = f"ghcr.io/{versions['registry_owner']}"
previous = {}
if args.previous and pathlib.Path(args.previous).is_file():
    previous = json.loads(pathlib.Path(args.previous).read_text())

build = int(args.build)
core = f"{versions['core']}.{build}"
supervisor = f"{versions['supervisor']}.{build}"

if previous.get("material", {}).get("build", 0) > build:
    # A newer run already published core and supervisor. Keep its numbers.
    core = previous["homeassistant"]["default"]
    supervisor = previous["supervisor"]
    build_for_feed = previous["material"]["build"]
else:
    build_for_feed = build

built = set(versions["machines"]["amd64"]) | set(versions["machines"]["aarch64"])
feed["supervisor"] = supervisor
feed["homeassistant"] = {
    machine: (core if machine in built or machine == "default" else value)
    for machine, value in feed["homeassistant"].items()
}
feed["images"]["core"] = f"{registry}/{{machine}}-homeassistant"
feed["images"]["supervisor"] = f"{registry}/{{arch}}-hassio-supervisor"

material = {"build": build_for_feed, "os_build": previous.get("material", {}).get("os_build", 0)}
if previous.get("hassos"):
    feed["hassos"] = previous["hassos"]
    feed["ota"] = previous.get("ota", feed["ota"])
if args.os_tag and build >= material["os_build"]:
    os_version = f"{versions['os']}.{build}"
    for board in versions["os_boards"]:
        feed["hassos"][board["id"]] = os_version
    feed["ota"] = (
        f"https://github.com/{versions['repository']}/releases/download/"
        f"{args.os_tag}/{{os_name}}_{{board}}-{{version}}.raucb"
    )
    material["os_build"] = build
feed["material"] = material

pathlib.Path(args.output).write_text(json.dumps(feed, indent=2) + "\n")
print(json.dumps({"core": core, "supervisor": supervisor, "material": material}))
