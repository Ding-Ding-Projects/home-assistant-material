#!/bin/sh
set -eu
for attempt in $(seq 1 60); do
    if docker info >/dev/null 2>&1; then
        exec docker load --input /build/images/application.tar
    fi
    sleep 1
done
echo "Container engine did not become available for preload" >&2
exit 1
