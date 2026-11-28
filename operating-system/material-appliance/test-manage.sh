#!/usr/bin/env bash
# Exercise the unchanged transaction logic against fake Docker and health tools.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
testdir=$(mktemp -d)
trap 'rm -rf "$testdir"' EXIT
mkdir -p "$testdir/bin"
export FAKE_ROOT="$testdir" PATH="$testdir/bin:$PATH"
sed -e "s|^state=/mnt/data/material-appliance|state=$testdir/state|" \
    -e "s|/usr/lib/material-appliance-image|$testdir/default|" \
    -e "s|/usr/libexec/material-validate-image|$testdir/bin/validate|" \
    "$here/manage.sh" >"$testdir/manage"
cp "$here/validate-image.sh" "$testdir/bin/validate"
cat >"$testdir/bin/docker" <<'SH'
#!/bin/sh
set -eu
case "$1" in
    container) if [ -f "$FAKE_ROOT/running" ]; then echo material-appliance; fi ;;
    inspect) echo 1 ;;
    image) for last do :; done; echo "${last##*:}" ;;
    run) for last do :; done; echo "$last" >"$FAKE_ROOT/running" ;;
    stop|pull) ;;
    rm) rm "$FAKE_ROOT/running" ;;
    *) exit 2 ;;
esac
SH
cat >"$testdir/bin/curl" <<'SH'
#!/bin/sh
test "$(cat "$FAKE_ROOT/running")" != broken
SH
printf '#!/bin/sh\nexit 0\n' >"$testdir/bin/sleep"
chmod +x "$testdir/bin/"*
ref=ghcr.io/ding-ding-projects/home-assistant-material
echo "$ref:old" >"$testdir/default"
sh "$testdir/manage" start
first=$(cat "$testdir/state/active")
echo retained >"$first/config/settings"
sh "$testdir/manage" update "$ref:new"
second=$(cat "$testdir/state/active")
test "$first" != "$second"
test "$(cat "$second/config/settings")" = retained
echo migrated >"$second/config/settings"
if sh "$testdir/manage" update "$ref:broken"; then exit 1; fi
test "$(cat "$testdir/state/active")" = "$second"
test "$(cat "$testdir/running")" = new
test "$(cat "$second/config/settings")" = migrated
sh "$testdir/manage" rollback
test "$(cat "$testdir/running")" = old
test "$(cat "$testdir/state/active")" = "$first"
test "$(cat "$first/config/settings")" = retained
sh "$testdir/manage" stop
test ! -e "$testdir/running"
if sh "$here/validate-image.sh" '-v /:/host'; then exit 1; fi
echo "PASS: boot, isolated config, healthy update, unhealthy rollback, explicit rollback, stop, invalid image"
