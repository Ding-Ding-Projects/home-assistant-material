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
| `frontend/src/components/ha-tab-group.ts`, `ha-tab-group-tab.ts` | Tabs are pills: the active tab is filled and there is no underline track. |
| `frontend/src/panels/lovelace/hui-root.ts` | Header title weight; view tabs centred in the header. |
| `frontend/src/resources/google-sans-flex.ts`, `theme/theme.ts`, `theme/typography.globals.ts` | Google Sans Flex is the interface typeface, loaded from vendored files; Roboto remains the fallback. Headings use the medium weight. |
| `frontend/public/static/fonts/google-sans-flex/` | Vendored font files, licence and checksums, written by `scripts/vendor-fonts.sh`. |
| `frontend/.gitattributes` | Font files are marked binary, so line-ending conversion cannot alter them. |
| `frontend/build-scripts/bundle.cjs`, `frontend/src/types.ts` | Build-time constants `__MATERIAL_BUILD__` and `__BUILD_TIME__`. |
| `frontend/src/components/ha-sidebar.ts`, `frontend/src/translations/en.json` | Version and build time shown at the foot of the rail on the first screen. |
| `frontend/src/state/quick-bar-mixin.ts`, `frontend/src/dialogs/shortcuts/dialog-shortcuts.ts` | The quick bar opens with Ctrl+Shift+F instead of Ctrl+K. |
| `frontend/src/components/ha-page-tabs.ts` (new) | The bar of open pages: every page open by default, close buttons, the New tab catalog with search, and Open every tab. Only the closed list is stored, in the browser. |
| `frontend/src/layouts/home-assistant-main.ts`, `frontend/src/translations/en.json` | The bar is placed at the top of the pane on wide screens and its height is reported to pages as safe area; its strings. |
| `frontend/src/common/accessibility/accessibility-tools.ts` (new) | Accessibility choices: storage, the stylesheet that turns them into theme variables, the focus ring that follows the focused control through components and dialogs, and reading a page aloud. |
| `frontend/src/components/ha-accessibility-tools.ts` (new) | The accessibility tools panel. |
| `frontend/src/components/ha-page-tabs.ts` | Search button (opens the command search) and accessibility button at the end of the bar. |
| `frontend/src/layouts/home-assistant-main.ts` | Applies the accessibility choices, hosts the panel, handles Alt+A, and keeps the rail at the top of the window. |
| `frontend/src/components/ha-sidebar.ts` | The rail grows with the text size. |

## Build-time stamping (not committed)

`scripts/ci/set-versions.py` writes the build number into `core/homeassistant/const.py`,
`core/pyproject.toml` and `operating-system/buildroot-external/meta` inside the build
runner. The committed files keep the upstream version numbers.
