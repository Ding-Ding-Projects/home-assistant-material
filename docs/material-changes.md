# Changes made to the vendored upstream sources

Every edit to a vendored subfolder is listed here so it can be re-applied when that
subfolder moves to a newer upstream release.

## Updates come from this repository

| File | Change |
| --- | --- |
| `supervisor/supervisor/const.py` | `URL_HASSIO_VERSION` reads the update feed from this repository's `channel` branch. |
| `supervisor/supervisor/supervisor.py` | The default supervisor image is `ghcr.io/ding-ding-projects/{arch}-hassio-supervisor`. |
| `supervisor/supervisor/homeassistant/module.py` | The default core image is `ghcr.io/ding-ding-projects/{machine}-homeassistant`. |
| `operating-system/buildroot-external/rootfs-overlay/usr/sbin/haos-supervisor` | The boot service starts this repository's supervisor image and falls back to this repository's feed. |
| `operating-system/buildroot-external/package/hassio/dind-import-containers.sh` | The preloaded supervisor image is tagged with this repository's image name. |
| `operating-system/buildroot-external/package/hassio/hassio.mk` | The build reads this repository's feed, or the file named by `HAOS_VERSION_JSON` when a build pins exact versions. |

The AppArmor profile URLs still point at upstream. The DNS, audio, CLI, multicast and
observer images are unchanged upstream images.

## Material Design 3 interface

| File | Change |
| --- | --- |
| `frontend/src/resources/theme/color/core.globals.ts` | Primary and neutral colour scales replaced with the design's scales. |
| `frontend/src/resources/theme/color/color.globals.ts` | Window, pane and card surface colours for light and dark; the sidebar uses the window colour and the header uses the pane colour. |
| `frontend/src/layouts/home-assistant-main.ts` | Navigation rail width; the floating pane, drawn by a frame and reported to pages as safe area. |
| `frontend/src/components/ha-sidebar.ts` | Collapsed sidebar is a navigation rail with a selection pill and labels; expanded rows use a pill selection. |
| `frontend/src/components/ha-drawer.ts` | No rule between the rail and the pane. |
| `frontend/src/components/ha-card.ts` | Cards are borderless with a 24 px radius. |

## Build-time stamping (not committed)

`scripts/ci/set-versions.py` writes the build number into `core/homeassistant/const.py`,
`core/pyproject.toml` and `operating-system/buildroot-external/meta` inside the build
runner. The committed files keep the upstream version numbers.
