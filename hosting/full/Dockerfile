# Full hosting mode: one outer container with its own small Docker engine. The Supervisor, the
# core and every app run as sub-containers of that engine. See docs/features/hosting/full-mode.md.
#
# The base is the official Docker-in-Docker image, pinned by version.
FROM docker:29.4.0-dind

RUN apk add --no-cache curl jq

COPY entrypoint.sh /usr/local/bin/ha-material-full
RUN sed -i 's/\r$//' /usr/local/bin/ha-material-full && chmod +x /usr/local/bin/ha-material-full

LABEL org.opencontainers.image.title="Home Assistant Material, full hosting mode" \
      org.opencontainers.image.description="Runs the Supervisor, the core and apps inside one container that has its own Docker engine."

# The core's web interface (and the observer page) are served from this container's network.
EXPOSE 8123 4357

# Data (the inner engine's storage and the Supervisor's data) lives on this volume.
VOLUME /var/lib/ha-material

ENTRYPOINT ["/usr/local/bin/ha-material-full"]
