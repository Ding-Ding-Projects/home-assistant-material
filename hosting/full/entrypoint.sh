#!/bin/sh
# Full hosting mode: one outer container that runs a small Docker engine of its own. Inside that
# engine the Supervisor starts, and the Supervisor starts the core and every app as
# sub-containers, exactly as it does on the operating system image. This script is the
# equivalent of the operating system's haos-supervisor service.
#
# Nothing here touches the computer that hosts the outer container: the inner engine has its own
# sockets, storage, network and process space.
set -u

DATA="${HA_FULL_DATA:-/var/lib/ha-material}"
FEED="${HA_FULL_FEED:-https://raw.githubusercontent.com/Ding-Ding-Projects/home-assistant-material/channel/stable.json}"
REGISTRY="${HA_FULL_REGISTRY:-ghcr.io/ding-ding-projects}"
SUPERVISOR_DATA="${DATA}/supervisor"
SUPERVISOR_CIDFILE="${SUPERVISOR_DATA}/hassio_supervisor.cid"
STOP_FILE=/run/ha-full-stopping

log() { printf '[ha-full] %s\n' "$*"; }

case "$(uname -m)" in
  x86_64 | amd64) ARCH=amd64; MACHINE="${SUPERVISOR_MACHINE:-generic-x86-64}" ;;
  aarch64 | arm64) ARCH=aarch64; MACHINE="${SUPERVISOR_MACHINE:-qemuarm-64}" ;;
  *) log "Unsupported processor architecture: $(uname -m)"; exit 1 ;;
esac
SUPERVISOR_IMAGE="${REGISTRY}/${ARCH}-hassio-supervisor"

mkdir -p "${DATA}/docker" "${SUPERVISOR_DATA}" /run/supervisor /run/dbus /run/udev /run/systemd/journal
rm -f "${STOP_FILE}"

# A stable machine id, kept with the data, so the instance keeps its identity across restarts.
if [ ! -s "${DATA}/machine-id" ]; then
  tr -d '-' < /proc/sys/kernel/random/uuid > "${DATA}/machine-id"
fi
cp "${DATA}/machine-id" /etc/machine-id

# ---------------------------------------------------------------------------------------------
# The inner Docker engine. Its storage lives on the data volume, which must be a Linux
# filesystem (a named volume, not a Windows or macOS folder).
# ---------------------------------------------------------------------------------------------
DOCKERD_PID=
start_engine() {
  log "Starting the inner Docker engine."
  dockerd-entrypoint.sh dockerd \
    --host=unix:///run/docker.sock \
    --data-root="${DATA}/docker" \
    --storage-driver=overlay2 \
    >/var/log/dockerd.log 2>&1 &
  DOCKERD_PID=$!
  tries=0
  until docker -H unix:///run/docker.sock info >/dev/null 2>&1; do
    tries=$((tries + 1))
    if [ "${tries}" -ge 120 ] || ! kill -0 "${DOCKERD_PID}" 2>/dev/null; then
      log "The inner Docker engine did not start. Last lines of its log:"
      tail -n 40 /var/log/dockerd.log
      exit 1
    fi
    sleep 1
  done
  export DOCKER_HOST=unix:///run/docker.sock
  log "The inner Docker engine is up: $(docker version --format '{{.Server.Version}}')."
}

# ---------------------------------------------------------------------------------------------
# Orderly shutdown: ask the Supervisor to stop (it stops the core and the apps), then stop
# anything left, then the engine. `docker stop` on the outer container sends SIGTERM here.
# ---------------------------------------------------------------------------------------------
stop_all() {
  [ -f "${STOP_FILE}" ] && return
  : > "${STOP_FILE}"
  log "Stopping."
  docker container stop --time 120 hassio_supervisor >/dev/null 2>&1 || true
  others="$(docker ps --quiet 2>/dev/null)"
  # shellcheck disable=SC2086
  [ -n "${others}" ] && docker stop --time 30 ${others} >/dev/null 2>&1
  if [ -n "${DOCKERD_PID}" ]; then
    kill -TERM "${DOCKERD_PID}" 2>/dev/null
    wait "${DOCKERD_PID}" 2>/dev/null
  fi
  log "Stopped. Data is kept on the data volume."
  exit 0
}
trap 'stop_all' TERM INT

start_engine

# The Supervisor normally asks systemd to protect its bridge gateway from outside traffic. There
# is no systemd here, so the same rules are applied directly, in this container's own network
# namespace, which is where the bridge lives. Without them the Supervisor would mark itself
# unhealthy and refuse installs, updates and backups.
protect_gateway() {
  for cmd in iptables ip6tables; do
    case "${cmd}" in iptables) gw=172.30.32.1 ;; *) gw=fd0c:ac1e:2100::1 ;; esac
    "${cmd}" -t raw -C PREROUTING ! -i hassio -d "${gw}" -j DROP 2>/dev/null \
      || "${cmd}" -t raw -I PREROUTING ! -i hassio -d "${gw}" -j DROP 2>/dev/null \
      || log "Could not add the ${cmd} gateway rule."
    "${cmd}" -t raw -C PREROUTING -i lo -d "${gw}" -j ACCEPT 2>/dev/null \
      || "${cmd}" -t raw -I PREROUTING -i lo -d "${gw}" -j ACCEPT 2>/dev/null \
      || log "Could not add the ${cmd} loopback rule."
  done
}
protect_gateway

# ---------------------------------------------------------------------------------------------
# Pick the Supervisor version the way the operating system service does: the one the update
# feed names, unless one is pinned. An existing image is reused, so a restart needs no network.
# ---------------------------------------------------------------------------------------------
ensure_supervisor_image() {
  have="$(docker images --no-trunc --filter "reference=${SUPERVISOR_IMAGE}:latest" --format '{{.ID}}')"
  [ -n "${have}" ] && return 0
  version="${HA_SUPERVISOR_VERSION:-}"
  if [ -z "${version}" ] && [ -s "${SUPERVISOR_DATA}/updater.json" ]; then
    version="$(jq -r '.supervisor // empty' "${SUPERVISOR_DATA}/updater.json" 2>/dev/null)"
  fi
  if [ -z "${version}" ]; then
    version="$(curl -fsS --retry 5 --retry-delay 5 --retry-all-errors --max-time 30 --location "${FEED}" | jq -er '.supervisor')" \
      || { log "The update feed could not be read: ${FEED}"; return 1; }
  fi
  log "Downloading the Supervisor ${version}."
  if docker pull "${SUPERVISOR_IMAGE}:${version}"; then
    docker tag "${SUPERVISOR_IMAGE}:${version}" "${SUPERVISOR_IMAGE}:latest"
  else
    log "The Supervisor image could not be downloaded."
    rm -f "${SUPERVISOR_DATA}/updater.json"
    return 1
  fi
}

create_supervisor() {
  image_id="$(docker image inspect --format '{{.Id}}' "${SUPERVISOR_IMAGE}:latest")"
  current="$(docker inspect --format '{{.Image}}' hassio_supervisor 2>/dev/null || true)"
  if [ -n "${current}" ] && [ "${current}" = "${image_id}" ]; then
    return 0
  fi
  [ -n "${current}" ] && { log "The Supervisor image changed; replacing its container."; docker container rm --force hassio_supervisor >/dev/null 2>&1; }
  rm -f "${SUPERVISOR_CIDFILE}"
  log "Creating the Supervisor container."
  # Same arguments as the operating system service, minus what only a real host has
  # (the AppArmor profile, the systemd journal gateway and the containerd socket of the host).
  docker container create \
    --name hassio_supervisor \
    --privileged \
    --oom-score-adj=-300 \
    --cidfile "${SUPERVISOR_CIDFILE}" \
    --mount "type=bind,src=${SUPERVISOR_CIDFILE},dst=/run/cid,readonly" \
    -v /run/docker.sock:/run/docker.sock:rw \
    -v /run/dbus:/run/dbus:ro \
    -v /run/supervisor:/run/os:rw \
    -v /run/udev:/run/udev:ro \
    -v /etc/machine-id:/etc/machine-id:ro \
    -v "${SUPERVISOR_DATA}:/data:rw,slave" \
    -e "SUPERVISOR_SHARE=${SUPERVISOR_DATA}" \
    -e SUPERVISOR_NAME=hassio_supervisor \
    -e SUPERVISOR_FIREWALL_EXTERNAL=1 \
    -e "SUPERVISOR_MACHINE=${MACHINE}" \
    "${SUPERVISOR_IMAGE}:latest" >/dev/null
}

# Starting this container is a boot of the system. The Supervisor decides between "the system
# booted" and "only the Supervisor restarted" by comparing the host's boot time with the one it
# stored. A container does not change the host's boot time, so forget the stored one: the
# Supervisor then starts the core and the apps, as it does after a real boot. Restarts of the
# Supervisor inside one run (after an update) keep it, and leave the core running.
if [ -s "${SUPERVISOR_DATA}/config.json" ]; then
  jq 'del(.last_boot)' "${SUPERVISOR_DATA}/config.json" > "${SUPERVISOR_DATA}/config.json.new" \
    && mv "${SUPERVISOR_DATA}/config.json.new" "${SUPERVISOR_DATA}/config.json"
fi

# The supervision loop. The Supervisor restarts itself after an update by exiting, expecting its
# parent to start the new image, as systemd does on the operating system image.
while [ ! -f "${STOP_FILE}" ]; do
  if ! ensure_supervisor_image || ! create_supervisor; then
    log "Retrying in 30 seconds."
    sleep 30 &
    wait $!
    continue
  fi
  log "Starting the Supervisor."
  docker container start hassio_supervisor >/dev/null
  docker container wait hassio_supervisor >/dev/null 2>&1 &
  wait $!
  [ -f "${STOP_FILE}" ] && break
  log "The Supervisor stopped; starting it again in 5 seconds."
  sleep 5 &
  wait $!
done
stop_all
