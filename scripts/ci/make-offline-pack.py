#!/usr/bin/env python3
"""Assemble an offline update pack from release files that are already built.

Usage:
  make-offline-pack.py --out <dir> --build <number> --board <board> \
      --os-bundle <haos_<board>-<version>.raucb> \
      [--supervisor-image <file> --supervisor-version <v>] \
      [--core-image <file> --core-version <v>] [--zip <file.zip>]

Writes <dir>/ham-offline-pack-<build>/ holding manifest.json and the parts. A part
whose file is not given is listed with "available": false, so a reader knows it is
not in the pack instead of finding it missing. The format is described in
docs/features/hosting/offline-update-pack.md and read by
supervisor/supervisor/os/offline_pack.py. Nothing here signs anything: the operating
system part is a Rauc bundle that carries its own signature, checked by Rauc on
the device.
"""
import argparse
import hashlib
import json
import pathlib
import re
import shutil
import sys
import zipfile

PACK_FORMAT = 1
OS_SIGNATURE = "rauc-embedded"
RE_BUNDLE = re.compile(r"^haos_(?P<board>[a-z0-9]+(?:-[a-z0-9]+)*)-(?P<version>\d[0-9A-Za-z._+-]*)\.raucb\Z")
RE_BOARD = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*\Z")
RE_VERSION = re.compile(r"^[0-9A-Za-z][0-9A-Za-z._+-]{0,63}\Z")


def sha256_of(path):
    digest = hashlib.sha256()
    with open(path, "rb") as stream:
        while chunk := stream.read(4 * 1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def fail(message):
    sys.exit(f"make-offline-pack: {message}")


def add_part(folder, kind, source, version, target_name):
    """Copy a file into the pack folder and return its manifest entry."""
    source = pathlib.Path(source)
    if not source.is_file() or source.is_symlink():
        fail(f"{kind}: {source} is not a regular file")
    if not RE_VERSION.match(version or ""):
        fail(f"{kind}: a valid version is required")
    target = folder / target_name
    shutil.copyfile(source, target)
    return {
        "kind": kind,
        "available": True,
        "file": target_name,
        "size": target.stat().st_size,
        "sha256": sha256_of(target),
        "version": version,
    }


def build_pack(args):
    if not RE_BOARD.match(args.board):
        fail("bad board name")
    if not RE_VERSION.match(args.build):
        fail("bad build number")

    bundle = pathlib.Path(args.os_bundle)
    match = RE_BUNDLE.match(bundle.name)
    if match is None or match["board"] != args.board:
        fail(f"{bundle.name} is not a haos_{args.board}-<version>.raucb file")

    folder = pathlib.Path(args.out) / f"ham-offline-pack-{args.build}"
    if folder.exists():
        fail(f"{folder} already exists")
    folder.mkdir(parents=True)

    parts = []
    for kind, image, version, name in (
        ("supervisor", args.supervisor_image, args.supervisor_version, "supervisor.tar"),
        ("core", args.core_image, args.core_version, "core.tar"),
    ):
        if image:
            parts.append(add_part(folder, kind, image, version, name))
        else:
            entry = {"kind": kind, "available": False}
            if version:
                entry["version"] = version
            parts.append(entry)

    os_part = add_part(folder, "os", bundle, match["version"], bundle.name)
    os_part["board"] = args.board
    os_part["signature"] = OS_SIGNATURE
    parts.append(os_part)

    manifest = {"format": PACK_FORMAT, "build": args.build, "board": args.board, "parts": parts}
    (folder / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    if args.zip:
        # Stored, not compressed: the parts are already compressed
        with zipfile.ZipFile(args.zip, "w", zipfile.ZIP_STORED) as archive:
            for path in sorted(folder.iterdir()):
                archive.write(path, f"{folder.name}/{path.name}")
    return folder


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", required=True)
    parser.add_argument("--build", required=True)
    parser.add_argument("--board", required=True)
    parser.add_argument("--os-bundle", required=True)
    parser.add_argument("--supervisor-image")
    parser.add_argument("--supervisor-version")
    parser.add_argument("--core-image")
    parser.add_argument("--core-version")
    parser.add_argument("--zip")
    folder = build_pack(parser.parse_args(argv))
    print(folder)


if __name__ == "__main__":
    main()
