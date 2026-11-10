#!/usr/bin/env bash
# Installs the one build dependency, Docker, on Linux. Asks for sudo in the normal way.
set -euo pipefail
if command -v docker >/dev/null 2>&1; then
  docker --version
  echo "Docker is already installed."
  exit 0
fi
if [ "$(uname -s)" != "Linux" ]; then
  echo "Install Docker Desktop from https://www.docker.com/products/docker-desktop/ and run this again." >&2
  exit 3
fi
script="$(mktemp)"
curl -fsSL https://get.docker.com -o "${script}"
echo "Running Docker's official install script (from https://get.docker.com)."
sudo sh "${script}"
rm -f "${script}"
sudo usermod -aG docker "${USER}"
docker --version
echo "Docker is installed. Sign out and in again so your user can run it without sudo."
