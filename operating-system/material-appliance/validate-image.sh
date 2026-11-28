#!/bin/sh
# Accept a fully qualified, explicitly tagged OCI image. No implicit latest.
set -eu
[ "$#" -eq 1 ] && [ "${#1}" -le 255 ] || exit 2
case "$1" in
    *[!a-zA-Z0-9._:/-]*) exit 2 ;;
esac
printf '%s\n' "$1" | grep -Eq '^[a-z0-9]+([.-][a-z0-9]+)+(:[0-9]+)?/([a-z0-9]+([._-][a-z0-9]+)*/)*[a-z0-9]+([._-][a-z0-9]+)*:[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,127}$'
