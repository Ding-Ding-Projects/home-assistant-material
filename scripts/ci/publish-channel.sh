#!/usr/bin/env bash
# Publish the update feed to the "channel" branch.
# Usage: publish-channel.sh <build-number> [--os <release-tag>]
# Needs GH_TOKEN with contents:write and GITHUB_REPOSITORY in the environment.
set -euo pipefail

build="$1"; shift
here="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"
remote="https://x-access-token:${GH_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"

for attempt in 1 2 3 4 5; do
  rm -rf "${work}/channel"
  if git clone --quiet --depth 1 --branch channel "${remote}" "${work}/channel" 2>/dev/null; then
    :
  else
    mkdir -p "${work}/channel"
    git -C "${work}/channel" init --quiet --initial-branch channel
    git -C "${work}/channel" remote add origin "${remote}"
  fi
  previous="${work}/channel/stable.json"
  python3 "${here}/make-channel-json.py" "${build}" "${work}/stable.json" --previous "${previous}" "$@"
  cp "${work}/stable.json" "${work}/channel/stable.json"
  cp "${work}/stable.json" "${work}/channel/beta.json"
  cp "${work}/stable.json" "${work}/channel/dev.json"
  cat > "${work}/channel/README.md" <<'TXT'
# Update feed

This branch holds the update feed for Home Assistant Material. The supervisor reads
`stable.json` (or `beta.json` / `dev.json`, which carry the same content) to learn which
versions are current and where their container images live. The release workflow on
`main` rewrites these files; do not edit them by hand.
TXT
  git -C "${work}/channel" add -A
  if git -C "${work}/channel" diff --cached --quiet; then
    echo "Update feed already current."
    exit 0
  fi
  git -C "${work}/channel" -c user.name="github-actions[bot]" \
    -c user.email="41898282+github-actions[bot]@users.noreply.github.com" \
    commit --quiet -m "Update feed for build ${build}"
  if git -C "${work}/channel" push --quiet origin channel; then
    echo "Update feed published for build ${build}."
    exit 0
  fi
  echo "Push raced with another run, retrying (${attempt})."
  sleep $((attempt * 3))
done
echo "Could not publish the update feed." >&2
exit 1
