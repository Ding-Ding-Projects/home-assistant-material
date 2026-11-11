# Builds the frontend wheel inside a container, so the host needs only Docker.
# Usage: docker build -f build/frontend.Dockerfile --output type=local,dest=core frontend
FROM node:24.22.1-bookworm AS build
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv git \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable
WORKDIR /src
COPY . .
ENV HUSKY=0 \
    CI=1 \
    NODE_OPTIONS=--max_old_space_size=6144 \
    SKIP_FETCH_NIGHTLY_TRANSLATIONS=1
RUN pnpm install --frozen-lockfile
# The compile is held to a few processors. Left alone it starts one worker per
# processor, which on a large machine needs more memory than Docker usually has
# and ends in a crash part way through. If it still fails, it runs once more on
# two processors before giving up.
ARG BUILD_WORKERS=4
RUN set -e;     build() {       n="$(nproc)"; w="$1"; if [ "$n" -lt "$w" ]; then w="$n"; fi;       echo "Compiling on $w of $n processors";       HA_BUILD_WORKERS="$w" taskset -c "0-$((w - 1))" ./node_modules/.bin/gulp build-app;     };     build "${BUILD_WORKERS}" || { echo "The compile failed. Trying once more on two processors."; build 2; }
RUN python3 -m venv /venv \
    && /venv/bin/pip install --no-cache-dir build \
    && rm -rf dist home_assistant_frontend.egg-info \
    && /venv/bin/python -m build -q --wheel

FROM scratch
COPY --from=build /src/dist/ /
