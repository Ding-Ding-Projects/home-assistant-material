#!/usr/bin/env bash
# One-command build for Linux, macOS and WSL. The only requirement is Docker.
#
#   ./build.sh                 build the container image home-assistant-material:local
#   ./build.sh --run           build, then start it on http://localhost:8123
#   ./build.sh os <board>      build an operating system image (rpi5-64, rpi4-64, rpi3-64, ova)
#
# Every phase reports its real result and the script stops at the first failure.
set -euo pipefail
cd "$(dirname "$0")"

run=false
target=container
board=ova
for arg in "$@"; do
  case "${arg}" in
    --run) run=true ;;
    os) target=os ;;
    container) target=container ;;
    rpi5-64|rpi4-64|rpi3-64|ova) board="${arg}" ;;
    -h|--help) sed -n 2,9p "$0"; exit 0 ;;
    *) echo "Unknown argument: ${arg}" >&2; exit 2 ;;
  esac
done

phase() { printf '\n[%s] %s\n' "$1" "$2"; }
value() { sed -n "s/.*\"$1\": *\"\([^\"]*\)\".*/\1/p" versions.json | head -1; }

phase 1 "Checking for Docker"
if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed. Run ./download-dependencies.sh, then run this script again." >&2
  exit 3
fi
docker version --format 'Docker {{.Server.Version}}' || { echo "Docker is installed but not running." >&2; exit 3; }

core_base="$(value core)"
base_image="$(value core_base_image)"
case "$(uname -m)" in
  x86_64|amd64) arch=amd64 ;;
  aarch64|arm64) arch=aarch64 ;;
  *) echo "Unsupported processor: $(uname -m)" >&2; exit 4 ;;
esac

if [ "${target}" = "os" ]; then
  defconfig="${board//-/_}"
  phase 2 "Building the operating system build container"
  docker build --tag haos-builder operating-system
  phase 3 "Building the ${board} operating system image (this takes hours on the first run)"
  mkdir -p operating-system/output .cache/haos
  docker run --rm --privileged \
    -e BUILDER_UID="$(id -u)" -e BUILDER_GID="$(id -g)" \
    -v "$(pwd)/operating-system:/build" -v "$(pwd)/.cache/haos:/cache" \
    haos-builder make "${defconfig}"
  phase 4 "Result"
  ls -l operating-system/output/images/haos_*
  ( cd operating-system/output/images && sha256sum haos_* )
  exit 0
fi

phase 2 "Building the frontend wheel (English only; release builds add all languages)"
rm -f core/home_assistant_frontend-*.whl
docker build -f build/frontend.Dockerfile --output type=local,dest=core frontend
ls core/home_assistant_frontend-*.whl

phase 3 "Collecting integration translations for core ${core_base}"
tmp="$(mktemp -d)"
docker build -f build/translations.Dockerfile --build-arg "CORE_BASE=${core_base}" --output "type=local,dest=${tmp}" build
tar xf "${tmp}/translations.tar" -C core/homeassistant
rm -rf "${tmp}"

phase 4 "Building the container image home-assistant-material:local"
echo "local;$(git rev-parse HEAD 2>/dev/null || echo unknown);build.sh;${USER:-unknown}" > core/rootfs/OFFICIAL_IMAGE
docker build core \
  --build-arg "BUILD_FROM=ghcr.io/home-assistant/${arch}-homeassistant-base:${base_image}" \
  --label "io.hass.arch=${arch}" \
  --label "io.hass.version=${core_base}" \
  --tag home-assistant-material:local
git checkout -- core/rootfs/OFFICIAL_IMAGE 2>/dev/null || rm -f core/rootfs/OFFICIAL_IMAGE

phase 5 "Result"
docker image inspect home-assistant-material:local --format 'Built {{.Id}}'
if [ "${run}" = true ]; then
  mkdir -p config
  docker rm -f home-assistant-material >/dev/null 2>&1 || true
  docker run -d --name home-assistant-material -p 8123:8123 -v "$(pwd)/config:/config" home-assistant-material:local
  echo "Waiting for http://localhost:8123 ..."
  for _ in $(seq 1 90); do
    if curl -fsS -o /dev/null http://localhost:8123/manifest.json 2>/dev/null; then
      echo "Home Assistant Material is running at http://localhost:8123"
      exit 0
    fi
    sleep 2
  done
  echo "The container started but did not answer within 3 minutes. See: docker logs home-assistant-material" >&2
  exit 5
fi
