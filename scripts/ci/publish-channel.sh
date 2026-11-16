#!/usr/bin/env bash
# Publish the update feed to the "channel" branch.
# Usage: publish-channel.sh <build-number> [--os <release-tag>]
# Needs GH_TOKEN with contents:write and GITHUB_REPOSITORY in the environment.
set -euo pipefail

build="$1"; shift
here="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"
remote="https://x-access-token:${GH_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"

# The change list the Updates page uses to compare versions. It is rebuilt from
# the commit history, which a shallow checkout does not have, so the history and
# the release tags are fetched first (commits only, no file contents). A failure
# here never holds back the update feed: the previous change list stays in place.
repo_root="$(cd "${here}/../.." && pwd)"
public="https://github.com/${GITHUB_REPOSITORY}.git"
changes=""
if git -C "${repo_root}" fetch --quiet --filter=blob:none --unshallow "${public}" '+refs/tags/*:refs/tags/*' 2>/dev/null ||
  git -C "${repo_root}" fetch --quiet --filter=blob:none "${public}" '+refs/tags/*:refs/tags/*'; then
  if python3 "${here}/make-changes-json.py" "${build}" "${work}/changes.json"; then
    changes="${work}/changes.json"
  else
    echo "::warning::The change list could not be built. The previous one is kept."
  fi
else
  echo "::warning::History could not be fetched for the change list. The previous one is kept."
fi

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
  if [ -n "${changes}" ]; then
    # An older run finishing late must not replace a newer build's change list.
    listed="$(jq -r '.newest_build // 0' "${work}/channel/changes.json" 2>/dev/null || echo 0)"
    if [ "${build}" -ge "${listed}" ]; then
      cp "${changes}" "${work}/channel/changes.json"
    fi
  fi
  cat > "${work}/channel/README.md" <<'TXT'
# Update feed

This branch holds the update feed for Home Assistant Material. The supervisor reads
`stable.json` (or `beta.json` / `dev.json`, which carry the same content) to learn which
versions are current and where their container images live. `changes.json` lists what
changed in each build, for the page that compares versions. The release workflow on
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
