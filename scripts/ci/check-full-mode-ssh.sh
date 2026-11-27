#!/usr/bin/env bash
# Exercise public-key enrollment and revocation on a disposable full-mode runner.
set -euo pipefail
outer=${1:?Pass the disposable outer container name}
label=$(docker inspect --format '{{index .Config.Labels "home-assistant-material.acceptance"}}' "$outer")
if [[ $label != true && $outer != ham-acceptance-* ]]; then
  echo 'Expected a disposable acceptance container' >&2
  exit 1
fi
binding=$(docker port "$outer" 22222/tcp)
if [[ ! $binding =~ ^127\.0\.0\.1:([0-9]+)$ ]]; then
  echo 'Expected one loopback SSH binding' >&2
  exit 1
fi
port=${BASH_REMATCH[1]}
umask 077
scratch=$(mktemp -d)
key_added=false
client=''

# Run inside the test Core and use its normal Supervisor identity. Only public key
# material crosses into the test container. Never copy a credential to the runner.
key_api() {
  docker exec -i "$outer" docker exec -i homeassistant python3 - "$@" <<'PY'
import json
import os
import sys
from urllib import request

method, suffix, *argument = sys.argv[1:]
url = f"http://{os.environ['SUPERVISOR']}/os/ssh/authorized_keys{suffix}"
payload = json.dumps({"key": argument[0]}).encode() if argument else None
headers = {"Authorization": "Bearer " + os.environ["SUPERVISOR_TOKEN"], "Content-Type": "application/json"}
with request.urlopen(request.Request(url, data=payload, headers=headers, method=method), timeout=10) as resp:
    body = json.load(resp)
if body.get("result") != "ok":
    sys.exit("Test Supervisor refused the key operation")
if method == "GET":
    data = body["data"]
    if data.get("mode") != "container":
        sys.exit("The full-mode SSH server is unavailable")
    print(len(data["keys"]))
PY
}
cleanup() {
  if [[ $key_added == true ]]; then key_api DELETE "/$fingerprint" || true; fi
  if [[ -n $client ]]; then kill "$client" 2>/dev/null || true; fi
  rm -r "$scratch"
}
trap cleanup EXIT
test "$(key_api GET '')" = 0
ssh-keygen -q -t ed25519 -N '' -C runner-test -f "$scratch/key"
fingerprint=$(ssh-keygen -lf "$scratch/key.pub" | awk '{print $2}' | tr '/+' '_-')
key_api POST '' "$(cat "$scratch/key.pub")"
key_added=true
test "$(key_api GET '')" = 1
ssh_args=(-i "$scratch/key" -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=3
  -o StrictHostKeyChecking=accept-new -o "UserKnownHostsFile=$scratch/known" -p "$port")
for _ in {1..15}; do
  if ssh "${ssh_args[@]}" root@127.0.0.1 true 2>/dev/null; then break; fi
  sleep 1
done
ssh "${ssh_args[@]}" root@127.0.0.1 'echo connected && sleep 60' >"$scratch/session" 2>&1 &
client=$!
for _ in {1..10}; do
  if grep -qx connected "$scratch/session"; then break; fi
  sleep 1
done
grep -qx connected "$scratch/session"
key_api DELETE "/$fingerprint"
key_added=false
test "$(key_api GET '')" = 0
for _ in {1..12}; do
  if ! kill -0 "$client" 2>/dev/null; then break; fi
  sleep 1
done
if kill -0 "$client" 2>/dev/null; then
  echo 'The established SSH session survived revocation' >&2
  exit 1
fi
wait "$client" || true
client=''
if ssh "${ssh_args[@]}" root@127.0.0.1 true 2>/dev/null; then
  echo 'The revoked key could still connect' >&2
  exit 1
fi
echo 'Verified key enrollment, SSH login, termination of the existing session and rejection of the revoked key.'
