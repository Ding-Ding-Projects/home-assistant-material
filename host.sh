#!/usr/bin/env bash
# One step hosting for Home Assistant Material on Linux and macOS.
#
#   ./host.sh             ask which mode to use
#   ./host.sh --detached  pull, start, wait until it answers, print the address, return
#   ./host.sh --logs      the same, then stay in a live status and log view
#   ./host.sh --stop      stop the container (data in ./config is kept)
#
# Add --full to any of these to use the full hosting mode instead (compose.full.yaml): one
# container that runs its own Docker engine, so apps, the app store, backups with apps and real
# updates work. See docs/features/hosting/full-mode.md. For example: ./host.sh --full --detached
#
# Add --cloud to also start the cloud host, a tunnel that reaches this instance from outside
# without opening a router port (plain mode only). It needs HA_MATERIAL_TUNNEL_TOKEN set in your
# environment or in an untracked .env file. See docs/features/hosting/cloud-host.md.
#
# Leaving the log view does not stop anything. Existing data and other containers are left alone.
set -u
cd "$(dirname "$0")"
PORT="${HA_MATERIAL_PORT:-8123}"
SERVICE=homeassistant
CONTAINER=home-assistant-material
DATA_NOTE="$(pwd)/config"
MAX_TRIES=60

FULL=0
CLOUD=0
mode=""
for arg in "$@"; do
  case "$arg" in
    --full) FULL=1 ;;
    --cloud) CLOUD=1 ;;
    *) mode="$arg" ;;
  esac
done
if [ "$FULL" = 1 ]; then
  export COMPOSE_FILE=compose.full.yaml
  SERVICE=homeassistant-full
  CONTAINER=home-assistant-material-full
  DATA_NOTE="the Docker volume ha-material-full-data"
  MAX_TRIES=240
fi

fail() { printf '\nFAILED: %s\n' "$1" >&2; exit 1; }

if [ "$CLOUD" = 1 ]; then
  [ "$FULL" = 1 ] && fail "--cloud works with the plain mode only. In the full mode, set the cloud host up in Settings."
  token_set=0
  [ -n "${HA_MATERIAL_TUNNEL_TOKEN:-}" ] && token_set=1
  if [ "$token_set" = 0 ] && [ -f .env ] && grep -Eq "^[[:space:]]*HA_MATERIAL_TUNNEL_TOKEN=[^[:space:]]" .env; then token_set=1; fi
  [ "$token_set" = 1 ] || fail "HA_MATERIAL_TUNNEL_TOKEN is empty. Create a tunnel in your provider account, then set HA_MATERIAL_TUNNEL_TOKEN in your environment or in an untracked .env file next to compose.yaml (never in a tracked file), and run this again. See docs/features/hosting/cloud-host.md."
  export COMPOSE_PROFILES=cloud
fi

command -v docker >/dev/null 2>&1 || fail "Docker is not installed. Install Docker, then run this again."
docker info >/dev/null 2>&1 || fail "Docker is installed but not running. Start Docker, then run this again."
docker compose version >/dev/null 2>&1 || fail "Docker Compose is missing. Install the Compose plugin, then run this again."

lan_address() {
  local address=""
  if command -v ip >/dev/null 2>&1; then
    address="$(ip -4 route get 1.1.1.1 2>/dev/null | sed -n 's/.* src \([0-9.]*\).*/\1/p' | head -n 1)"
  fi
  if [ -z "$address" ] && command -v ipconfig >/dev/null 2>&1; then
    address="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)"
  fi
  if [ -z "$address" ] && command -v hostname >/dev/null 2>&1; then
    address="$(hostname -I 2>/dev/null | awk '{print $1}')"
  fi
  printf '%s' "$address"
}

start() {
  echo "Pulling the published image..."
  docker compose pull || fail "The image could not be pulled. Check the network and the tag in compose.yaml."
  echo "Starting..."
  docker compose up -d || fail "The container did not start. Port $PORT may be in use; set HA_MATERIAL_PORT to another port."
  printf 'Waiting until it answers on port %s' "$PORT"
  local tries=0
  until curl --fail --silent --max-time 5 "http://127.0.0.1:$PORT/manifest.json" >/dev/null 2>&1; do
    tries=$((tries + 1))
    if [ "$tries" -ge "$MAX_TRIES" ]; then
      echo
      docker compose ps
      fail "It did not answer in time. Run ./host.sh --logs to see why (the full mode downloads several gigabytes on its first start)."
    fi
    printf '.'
    sleep 5
  done
  echo
  local address
  address="$(lan_address)"
  echo
  echo "Home Assistant Material is running."
  echo "  On this machine:   http://localhost:$PORT/"
  if [ -n "$address" ]; then
    echo "  On your network:   http://$address:$PORT/"
  else
    echo "  On your network:   the address of this machine could not be read; use its IP address with port $PORT."
  fi
  echo "  Data is kept in:   $DATA_NOTE"
  if [ "$CLOUD" = 1 ]; then
    local tunnel_address
    tunnel_address="$(docker inspect --format "{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}" home-assistant-material-cloud-tunnel 2>/dev/null | awk '{print $1}')"
    echo
    echo "Cloud host: the tunnel container is started."
    echo "  Next: add to configuration.yaml under http:  use_x_forwarded_for: true  and"
    echo "        trusted_proxies: [${tunnel_address:-the tunnel container address}]  then restart Home Assistant."
    echo "  Point the tunnel public hostname at http://homeassistant:$PORT in the provider dashboard."
    echo "  This instance is now reachable from the internet; use a strong password and two-step sign-in."
  fi
}

status_line() {
  local state health
  state="$(docker inspect --format '{{.State.Status}}' "$CONTAINER" 2>/dev/null || echo "not created")"
  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}no health check{{end}}' "$CONTAINER" 2>/dev/null || echo "")"
  printf 'Service %s: %s, %s. ' "$SERVICE" "$state" "$health"
}

log_view() {
  local follower="" key=""
  stop_follow() { [ -n "$follower" ] && kill "$follower" 2>/dev/null; follower=""; }
  trap 'stop_follow; echo; echo "Left the log view. The container keeps running."; exit 0' INT TERM
  while true; do
    echo
    status_line
    echo "Keys: [f] follow logs  [p] pause  [l] last 50 lines  [s] status  [q] leave (keeps running)"
    if ! read -r -n 1 -s key; then break; fi
    case "$key" in
      f) stop_follow; docker compose logs --follow --tail 20 "$SERVICE" & follower=$! ;;
      p) stop_follow; echo "Paused." ;;
      l) stop_follow; docker compose logs --tail 50 "$SERVICE" ;;
      s) stop_follow; docker compose ps ;;
      q) stop_follow; echo "Left the log view. The container keeps running."; return 0 ;;
    esac
  done
}

# (mode was read with the other options above)
if [ -z "$mode" ]; then
  echo "Home Assistant Material"
  echo "  1) Start in the background and return"
  echo "  2) Start and watch the live log"
  echo "  3) Stop"
  printf 'Choose 1, 2 or 3: '
  read -r choice
  case "$choice" in
    1) mode=--detached ;;
    2) mode=--logs ;;
    3) mode=--stop ;;
    *) fail "Nothing chosen." ;;
  esac
fi

case "$mode" in
  --detached) start ;;
  --logs) start; log_view ;;
  --stop) docker compose stop || fail "The container could not be stopped."; echo "Stopped. Data is kept in $DATA_NOTE." ;;
  *) fail "Unknown option $mode. Use --detached, --logs, --stop, with --full for the full hosting mode." ;;
esac
