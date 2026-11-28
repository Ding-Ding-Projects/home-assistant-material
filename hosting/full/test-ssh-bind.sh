#!/bin/sh
# Run against an already-built full hosting image. Both containers are disposable
# and unprivileged. Neither exposes a host port or receives a host credential.
set -eu
image="${1:?Pass the local full hosting image tag or digest}"
network="$(docker network create --internal "full-ssh-test-$$")"
trap 'docker network rm "$network" >/dev/null' EXIT

for mode in none "$network"; do
  docker run --rm -i --network "$mode" --entrypoint sh "$image" -eus -- "$mode" <<'INNER'
# Run the shipped watcher in isolation before the entrypoint starts its inner engine.
sed '/^# The inner Docker engine\./,$d' /usr/local/bin/ha-material-full >/tmp/watcher
. /tmp/watcher
ssh-keygen -q -t ed25519 -N '' -f /tmp/client
! pgrep -x dropbear >/dev/null || exit 1
cat /tmp/client.pub >"$SSH_KEYS"
if [ "$1" = none ]; then
  # Run one synchronous pass so the assertion cannot beat the background poll.
  ssh_sync
  ! pgrep -x dropbear >/dev/null || exit 1
  echo 'No outer IPv4, no listener.'
  exit 0
fi
addr="$(ip -4 -o addr show dev eth0 | awk '{split($4,a,"/"); print a[1]; exit}')"
test -n "$addr"
attempt=0
until ssh -o ConnectTimeout=1 -o StrictHostKeyChecking=accept-new -o BatchMode=yes \
    -o IdentitiesOnly=yes -i /tmp/client -p 22222 "root@$addr" true; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 10 ] || exit 1
  sleep 1
done
# Verify the actual listening socket is bound to that specific address only.
netstat -lnt | awk -v wanted="$addr:22222" '$4 ~ /:22222$/ {total++; if ($4 == wanted) scoped++} END {exit !(total == 1 && scoped == 1)}'
if ssh -v -o BatchMode=yes -o PubkeyAuthentication=no -o PreferredAuthentications=password \
    -p 22222 "root@$addr" true 2>/tmp/auth-methods; then exit 1; fi
tr -d '\r' </tmp/auth-methods | grep -q 'Authentications that can continue: publickey$'
: >"$SSH_KEYS"
attempt=0
while pgrep -x dropbear >/dev/null; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 10 ] || exit 1
  sleep 1
done
echo 'Public key accepted on outer IPv4 only, password unavailable, removal stopped SSH.'
INNER
done
