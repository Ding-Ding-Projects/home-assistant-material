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
| `frontend/src/common/regex/` (new) | Search queries that can be plain text or `/pattern/flags`: parsing, compiling with limits, static risk screening, the explainer, code generation, the worker used by the workbench, the helpers lists filter with (`filter.ts`) and the hand-written catalogue of search fields (`search-surfaces.ts`). |
| `frontend/src/components/regex/ha-regex-workbench.ts` (new) | The pattern workbench panel. |
| `frontend/src/components/input/ha-input.ts`, `ha-input-search.ts` | A hook for fixed content after the input; the search field's workbench button, loaded on first use. |
| `frontend/src/components/data-table/sort-filter-worker.ts`, `frontend/src/resources/fuseMultiTerm.ts` | Table filtering and fuzzy search accept `/pattern/flags`. `fuseSearch` replaces direct Fuse.js calls in the pickers and add dialogs. |
| `frontend/src/components/ha-filter-*.ts`, `ha-ansi-to-html.ts`, `chart/ha-network-graph.ts`, `media-player/ha-media-player-browse.ts`, `ha-page-tabs.ts` | Filter panes, log lines (with highlighting), network maps, media folders and the New tab catalog filter through the shared matcher. |
| `frontend/src/panels/config/` (apps, helpers, integrations, zha, logs, tools/state, voice-assistants, dashboard), `frontend/src/panels/lovelace/editor/` (badge and card pickers) | Their own filters go through the shared matcher or `fuseSearch`. |
| `frontend/src/common/tabs/bulk-close.ts` (new), `frontend/src/components/ha-page-tabs.ts` | Close tabs that match the catalog search, or that do not; guards for an empty search and an unusable pattern; Undo. |
| `frontend/src/panels/config/automation/condition/ha-automation-condition-row.ts`, `option/ha-automation-option-row.ts` | A visible test button on every condition, and a test button on every Choose option that checks the option's conditions. |
| `frontend/src/common/vocabulary/` (new) | Private vocabulary: the strict parser for the wording file, the whole-word replacer that leaves addresses and identifiers alone, the browser cache, file import and the confirmation overlay. |
| `frontend/src/common/translations/localize.ts`, `frontend/src/state/translations-mixin.ts` | Localized text passes through the private vocabulary; the localize function is rebuilt when the vocabulary changes. |
| `frontend/src/panels/profile/ha-personal-wording-card.ts` (new), `ha-profile-section-localization.ts` | The private vocabulary card on Profile, Localization. |
| `frontend/src/layouts/home-assistant-main.ts` | A wording file dropped anywhere in the window is loaded; a dropped file never replaces the page. |
| `frontend/src/common/appearance/` (new) | Per-element appearance: the model, storage, styles, element paths, and the page-wide session that applies stored choices. |
| `frontend/src/components/appearance/ha-appearance-tools.ts`, `ha-appearance-editor.ts` (new) | The menu on every element, the pick tool, the shortcut, and the appearance editor. |
| `frontend/src/layouts/home-assistant-main.ts`, `frontend/src/components/ha-page-tabs.ts` | The tools are created by the main layout; a paint button in the top bar starts the pick tool. |
| `core/homeassistant/components/automation_repos/` (new), `core/tests/components/automation_repos/` (new) | The integration that keeps a Git repository for each automation and a master repository. See `docs/automation-repositories.md`. |
| `core/homeassistant/components/default_config/manifest.json` | Loads `automation_repos` with the default configuration. |
| `frontend/src/data/automation_repos.ts`, `frontend/src/common/automation/version-tests.ts` (new) | Calls to the repositories integration; the logic for testing and running versions, with the guard for locks, doors and alarms. |
| `frontend/src/panels/config/automation-history/` (new), `config-sections.ts`, `ha-panel-config.ts` | The history manager page and its tab beside Automations. |
| `frontend/src/data/automation.ts` | `testAllConditions`: several conditions tested as one. |
| `frontend/src/common/page/` (new) | Search this page (ranges of matches, drawn as CSS highlights), the export of a page and its tables, and the list of help articles. |
| `frontend/src/common/locks/` (new), `frontend/src/common/util/sha256.ts` (new) | Page locks: the store, the PIN as a salted hash, the waits after wrong PINs, and a controller that tells a layout its page is locked. SHA-256 is written out because the browser only offers its own on secure origins. |
| `frontend/src/common/history/local-history.ts` (new) | The journal of local changes, and the hook the stores call after a change. |
| `frontend/src/components/page/` (new) | The page tools cluster, the tools panel (export, history, lock, help), the page footer and the locked-page line. |
| `frontend/src/layouts/hass-subpage.ts`, `hass-tabs-subpage.ts`, `hass-tabs-subpage-data-table.ts` | The shared page layouts carry the page tools and the footer, and stop input on a locked page. They are now flex columns: the header, the tab row and the footer take what they need and the content gets the rest, so the table and filter pane no longer size themselves from the window. Section tabs moved from the header into a row under it, and the page title is always shown. |
| `frontend/src/components/data-table/ha-data-table.ts` | `row-cards`: each row drawn as a rounded card, without changing row or column geometry. |
| `frontend/src/layouts/hass-tabs-subpage.ts`, `hass-tabs-subpage-data-table.ts`, `frontend/src/panels/config/config-sections.ts`, `ha-panel-config.ts` | A breadcrumb above the title (the panel, then the section, which the settings panel resolves from the tabs); list pages show a large title, a `summary` line and an export button, and use row cards. |
| `frontend/src/panels/config/` (devices, entities, automations, scripts, scenes, helpers), `frontend/src/panels/marketplace/dashboards/ha-marketplace-dashboard.ts` | Each passes a summary line with its own noun and count. |
| `frontend/src/layouts/home-assistant-main.ts`, `frontend/src/common/appearance/` | The tools panel is created by the main layout; local history starts there; the appearance store reports its changes and can be read again after an undo. |
| `frontend/build-scripts/check-minify-templates.mjs` (new) | Runs the production template minifier over given files, with the legacy browser targets, so a template that only breaks a production build is found before pushing. |
| `frontend/test/common/regex/` (new) | Tests for the query, explainer, code generation and filter helpers, and the guard that every search field is in the catalogue. |

## Build-time stamping (not committed)

`scripts/ci/set-versions.py` writes the build number into `core/homeassistant/const.py`,
`core/pyproject.toml` and `operating-system/buildroot-external/meta` inside the build
runner. The committed files keep the upstream version numbers.
