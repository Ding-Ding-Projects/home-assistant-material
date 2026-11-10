# Copies the integration translations out of the upstream image for the pinned core release.
# Upstream downloads them from its translation service with a private token; the same files
# ship inside its published image.
# Usage: docker build -f build/translations.Dockerfile --build-arg CORE_BASE=<version> --output type=local,dest=<dir> build
ARG CORE_BASE
FROM ghcr.io/home-assistant/amd64-homeassistant:${CORE_BASE} AS upstream
RUN cd /usr/src/homeassistant/homeassistant \
    && find components -path '*/translations/*.json' | tar cf /translations.tar -T -

FROM scratch
COPY --from=upstream /translations.tar /
