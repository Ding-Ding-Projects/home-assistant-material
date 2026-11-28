#!/usr/bin/env bash
set -euo pipefail
arch=$1
build=$2
scripts=$(dirname "$0")
sh "$scripts/validate-image.sh" "$HAOS_APPLIANCE_IMAGE"
case "$arch" in
    aarch64) arch=arm64 ;;
    amd64) ;;
    *) echo "Unsupported appliance architecture: $arch" >&2; exit 2 ;;
esac
mkdir -p "$build/images"
rm -f "$build/images/"*.tar
skopeo copy --override-os linux --override-arch "$arch" \
    "docker://$HAOS_APPLIANCE_IMAGE" "docker-archive:$build/images/application.tar:$HAOS_APPLIANCE_IMAGE"
skopeo inspect --config "docker-archive:$build/images/application.tar" |
    jq -e --arg arch "$arch" '.os == "linux" and .architecture == $arch' >/dev/null
install -m 755 "$scripts/import.sh" "$build/dind-import-containers.sh"
