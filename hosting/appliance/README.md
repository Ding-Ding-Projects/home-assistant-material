# Single-application operating system and add-on catalog

## Build the appliance

In the existing Linux OS builder, set `HAOS_APPLIANCE_IMAGE` to an explicit
image tag before running the board build. For example:

```sh
HAOS_APPLIANCE_IMAGE=ghcr.io/ding-ding-projects/home-assistant-material:2026.11.1.53 make generic_x86_64 O=output-material-generic
```

Start with a fresh output directory for each board, mode and image. With the
variable unset the regular Supervisor image is built. The standalone variant
preloads only the chosen application for the board architecture and masks the
Supervisor boot service. LAN port 8123 reaches the application after boot.
Keep it on a trusted LAN and complete the application's own first-run sign-in.
Custom images must accept persistent data at `/config`, listen on container
port 8123, provide a successful `/manifest.json` readiness endpoint, and
implement their own authentication.

## Update or restore an application generation

From the appliance console run `material-appliance update REGISTRY/NAME:TAG`.
The updater pulls the image first, stops the old application, copies its
quiescent configuration into a new generation and verifies the new service. A
successful readiness probe commits the switch. A failed change restores the
previous image and data, verifies health and exits unsuccessfully. If interrupted,
the next service start selects the last committed generation. Use
`material-appliance rollback` to select the previous image and its matching
data snapshot. Writes made after an update remain in the newer generation.
Allow storage for a complete data copy and schedule a maintenance window.
These commands manage the application; OS updates remain a separate operation.

## Export the add-on catalog

In the Supervisor store, add the source repository URL:
`https://github.com/Ding-Ding-Projects/home-assistant-material`. Supervisor reads
the root catalog and discovers Home Assistant Material under `addons/`. The
Supervisor tests assemble their fixture manifests only in temporary folders.
To stage a separate, minimal copy of the catalog, run
`python hosting/appliance/export-catalog.py OUTPUT` with a new destination.
The exporter performs no publication.
