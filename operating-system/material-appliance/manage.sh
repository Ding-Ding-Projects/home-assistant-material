#!/bin/sh
# The active pointer names an immutable generation descriptor and its private
# writable config directory. A switch commits only after the readiness probe.
set -eu
umask 077
state=/mnt/data/material-appliance
name=material-appliance
label=org.home-assistant-material.appliance
mkdir -p "$state"
exec 9>"$state/lock"
flock -n 9 || { echo "Another appliance operation is running" >&2; exit 1; }

container_exists() {
    ids=$(docker container ls -a --filter "name=^/${name}$" --format '{{.Names}}') || return 2
    [ "$ids" = "$name" ]
}

remove_owned() {
    if container_exists; then
        owner=$(docker inspect -f "{{index .Config.Labels \"$label\"}}" "$name") || return 1
        [ "$owner" = 1 ] || { echo "Container name belongs to another service" >&2; return 1; }
        docker stop -t 120 "$name" >/dev/null && docker rm "$name" >/dev/null
    else
        [ "$?" -eq 1 ]
    fi
}

launch() {
    gen=$1
    image=$(cat "$gen/image") || return 1
    docker run -d --name "$name" --label "$label=1" --restart unless-stopped \
        -p 8123:8123 -v "$gen/config:/config" "$image" >/dev/null || return 1
    for attempt in $(seq 1 60); do
        if curl --noproxy '*' --max-time 2 --fail --silent --output /dev/null http://127.0.0.1:8123/manifest.json; then
            return 0
        fi
        sleep 2
    done
    echo "Application readiness timed out" >&2
    return 1
}

new_generation() {
    gen=$(mktemp -d "$state/gen.XXXXXXXX") || return 1
    mkdir "$gen/config" && printf '%s\n' "$1" >"$gen/image" || return 1
    printf '%s\n' "$gen"
}

activate() {
    printf '%s\n' "$1" >"$state/active.new" && mv -f "$state/active.new" "$state/active"
}

case "${1:-}" in
    start)
        if [ ! -f "$state/active" ]; then
            ref=$(cat /usr/lib/material-appliance-image)
            image=$(docker image inspect -f '{{.Id}}' "$ref")
            initial=$(new_generation "$image")
            activate "$initial"
        fi
        remove_owned
        launch "$(cat "$state/active")"
        ;;
    stop) remove_owned ;;
    update|rollback)
        previous=$(cat "$state/active")
        if [ "$1" = update ]; then
            [ "$#" -eq 2 ] || { echo "Specify a fully qualified image:tag" >&2; exit 2; }
            /usr/libexec/material-validate-image "$2"
            docker pull "$2"
            image=$(docker image inspect -f '{{.Id}}' "$2")
            [ "$(cat "$previous/image")" != "$image" ] || { echo "Image is already active"; exit 0; }
            candidate=$(new_generation "$image")
            printf '%s\n' "$previous" >"$candidate/previous"
        else
            candidate=$(cat "$previous/previous")
        fi
        remove_owned
        # First retain a quiesced copy before starting a potentially migrating
        # release. If interrupted, the next start recovers the active pointer.
        if { [ "$1" != update ] || cp -a "$previous/config/." "$candidate/config/"; } &&
           launch "$candidate" && activate "$candidate"; then
            echo "Active image: $(cat "$candidate/image")"
            exit 0
        fi
        remove_owned
        if launch "$previous"; then
            echo "Change failed. The previous image and config are healthy again." >&2
        else
            echo "Recovery failed. The previous generation is preserved at $previous." >&2
        fi
        exit 1
        ;;
    *) echo "Usage: material-appliance start|stop|update IMAGE:TAG|rollback" >&2; exit 2 ;;
esac
