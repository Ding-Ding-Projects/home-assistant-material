#!/usr/bin/env bash
# Runs inside the operating system build container. Used by build-installer.bat, where the
# Windows checkout cannot be built in place: the build needs symbolic links and a
# case-sensitive file system. It clones the committed source into a container volume,
# builds one board there and copies the images to /out.
set -euo pipefail
defconfig="$1"
sudo chown "$(id -u):$(id -g)" /work /out
git config --global --add safe.directory '*'
rm -rf /work/src
git clone --quiet --depth 1 file:///repo /work/src
cd /work/src/operating-system
mkdir -p /work/output
ln -sfn /work/output output
make "${defconfig}"
cp output/images/haos_* /out/
ls -l /out
