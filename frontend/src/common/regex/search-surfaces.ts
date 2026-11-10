/**
 * Every place in the interface that has a search field, written by hand.
 *
 * A search field offers the pattern workbench, and the list it filters must
 * understand a regular expression written as `/pattern/flags`. This file
 * records, for each field, where that understanding lives.
 * `test/common/regex/search-surfaces.test.ts` fails when a search field is
 * added without an entry here, when an entry no longer has a field, or when
 * the file named in `matcher` stops calling a pattern-aware function.
 *
 * To add a search field: use `ha-input-search`, filter with `searchMatcher`,
 * `filterByRegexQuery` or `fuseSearch`, and add an entry below.
 */
export interface SearchSurface {
  /** The file that renders the search field, relative to `src/`. */
  file: string;
  /** What the field searches, for people reading this list. */
  searches: string;
  /**
   * The file where the search text meets a pattern-aware function, relative
   * to `src/`. Left out when it is the same file.
   */
  matcher?: string;
  /**
   * Set when the text is sent somewhere that does its own searching. The
   * field then leaves the workbench button out.
   */
  external?: string;
}

const TABLE_WORKER = "components/data-table/sort-filter-worker.ts";
const FUZZY = "resources/fuseMultiTerm.ts";
const LOG_LINES = "components/ha-ansi-to-html.ts";
const GRAPH = "components/chart/ha-network-graph.ts";

export const SEARCH_SURFACES: SearchSurface[] = [
  {
    file: "components/data-table/ha-data-table.ts",
    searches: "The rows of any table that shows its own search field",
    matcher: TABLE_WORKER,
  },
  {
    file: "layouts/hass-tabs-subpage-data-table.ts",
    searches:
      "The rows of every settings list: devices, entities, automations, scenes, scripts, helpers, areas, labels, backups and the rest",
    matcher: TABLE_WORKER,
  },
  {
    file: "components/ha-filter-devices.ts",
    searches: "Devices in the filter pane of a list",
  },
  {
    file: "components/ha-filter-domains.ts",
    searches: "Domains in the filter pane of a list",
  },
  {
    file: "components/ha-filter-entities.ts",
    searches: "Entities in the filter pane of a list",
  },
  {
    file: "components/ha-filter-entity-types.ts",
    searches: "Entity types in the filter pane of a list",
  },
  {
    file: "components/ha-filter-integrations.ts",
    searches: "Integrations in the filter pane of a list",
  },
  {
    file: "components/ha-filter-labels.ts",
    searches: "Labels in the filter pane of a list",
  },
  {
    file: "components/ha-picker-combo-box.ts",
    searches:
      "The choices of every picker: entities, devices, areas, floors, labels, icons, languages and the rest. Pickers with sections search through the function their owner gives them",
    matcher: FUZZY,
  },
  {
    file: "components/appearance/ha-appearance-tools.ts",
    searches: "Entries of the menu that opens on any element",
  },
  {
    file: "components/ha-page-tabs.ts",
    searches: "Pages in the New tab catalog",
  },
  {
    file: "components/dialog/ha-dialog-tools.ts",
    searches: "The text of the dialog it is in, marked where it is found",
    matcher: "common/page/find-in-page.ts",
  },
  {
    file: "components/page/ha-page-tools.ts",
    searches: "The text of the page it is on, marked where it is found",
    matcher: "common/page/find-in-page.ts",
  },
  {
    file: "components/page/ha-page-tool-panel.ts",
    searches:
      "The page from the tools panel on a small screen, the local history, and the help articles",
  },
  {
    file: "components/media-player/ha-media-player-browse.ts",
    searches:
      "Titles in a media folder. The second field on this page sends its text to the media source",
    external: "The media source searches its own library",
  },
  {
    file: "panels/config/apps/app-view/log/supervisor-app-log-tab.ts",
    searches: "Lines of an app's log",
    matcher: LOG_LINES,
  },
  {
    file: "panels/config/apps/ha-config-apps-available.ts",
    searches: "Apps in the app store",
    matcher: "panels/config/apps/components/supervisor-apps-filter.ts",
  },
  {
    file: "panels/config/apps/ha-config-apps-installed.ts",
    searches: "Installed apps",
  },
  {
    file: "panels/config/changelog/ha-config-changelog.ts",
    searches: "Entries of What changed, by text, commit and day",
  },
  {
    file: "panels/config/notifications/ha-config-notifications.ts",
    searches: "Notifications, by title, text and id",
  },
  {
    file: "panels/config/dashboard/ha-config-dashboard.ts",
    searches: "The sections on the settings home page",
    matcher: "panels/config/dashboard/ha-config-navigation.ts",
  },
  {
    file: "panels/config/automation-history/ha-config-automation-history.ts",
    searches: "Versions of automations, by name, message, commit and author",
  },
  {
    file: "panels/config/automation/add-automation-element-dialog.ts",
    searches: "Triggers, conditions and actions to add to an automation",
    matcher: FUZZY,
  },
  {
    file: "panels/config/automation/dialog-new-automation.ts",
    searches: "Blueprints to start an automation or script from",
    matcher: FUZZY,
  },
  {
    file: "panels/config/dashboard/dialog-new-dashboard.ts",
    searches: "Dashboard starting points",
  },
  {
    file: "panels/config/helpers/dialog-helper-detail.ts",
    searches: "Helper types",
  },
  {
    file: "panels/config/integrations/dialog-add-integration.ts",
    searches: "Integrations and brands to add",
  },
  {
    file: "panels/config/integrations/dialog-live-log.ts",
    searches: "Lines of an integration's live log",
    matcher: LOG_LINES,
  },
  {
    file: "panels/config/integrations/ha-config-integration-page.ts",
    searches: "Entries and devices of one integration",
  },
  {
    file: "panels/config/integrations/ha-config-integrations-dashboard.ts",
    searches: "Configured and discovered integrations",
  },
  {
    file: "panels/config/integrations/integration-panels/bluetooth/bluetooth-network-visualization.ts",
    searches: "Devices on the Bluetooth map",
    matcher: GRAPH,
  },
  {
    file: "panels/config/integrations/integration-panels/lorawan/lorawan-topology.ts",
    searches: "Gateways and devices on the LoRaWAN map",
    matcher: GRAPH,
  },
  {
    file: "panels/config/integrations/integration-panels/matter/matter-network-visualization.ts",
    searches: "Devices on the Matter map",
    matcher: GRAPH,
  },
  {
    file: "panels/config/integrations/integration-panels/zha/dialog-zha-add-group-members.ts",
    searches: "Zigbee devices to add to a group",
  },
  {
    file: "panels/config/integrations/integration-panels/zha/zha-device-endpoint-list.ts",
    searches: "Zigbee device endpoints",
  },
  {
    file: "panels/config/integrations/integration-panels/zha/zha-network-visualization-page.ts",
    searches: "Devices on the Zigbee map",
    matcher: GRAPH,
  },
  {
    file: "panels/config/integrations/integration-panels/zwave_js/zwave_js-network-visualization.ts",
    searches: "Devices on the Z-Wave map",
    matcher: GRAPH,
  },
  {
    file: "panels/config/logs/dialog-logs.ts",
    searches: "Lines of a system log shown in a dialog",
  },
  {
    file: "panels/config/logs/ha-config-logs.ts",
    searches: "Logged errors and the lines of the full log",
    matcher: "panels/config/logs/system-log-card.ts",
  },
  {
    file: "panels/config/tools/action_history/tools-action-history.ts",
    searches: "Past actions",
    matcher: TABLE_WORKER,
  },
  {
    file: "panels/config/tools/state/tools-state.ts",
    searches:
      "Entities by name, state, device, area and attribute, one field each",
  },
  {
    file: "panels/config/tools/statistics/tools-statistics.ts",
    searches: "Statistics",
    matcher: TABLE_WORKER,
  },
  {
    file: "panels/config/voice-assistants/dialog-expose-entity.ts",
    searches: "Entities to expose to a voice assistant",
  },
  {
    file: "panels/lovelace/editor/badge-editor/hui-badge-picker.ts",
    searches: "Badge types",
  },
  {
    file: "panels/lovelace/editor/card-editor/hui-card-picker.ts",
    searches: "Card types",
  },
  {
    file: "panels/lovelace/editor/card-editor/hui-suggestion-entity-tree.ts",
    searches: "Entities to suggest cards for",
    matcher: FUZZY,
  },
];

/** The functions that understand `/pattern/flags`. */
export const PATTERN_AWARE_FUNCTIONS = [
  "searchMatcher",
  "filterByRegexQuery",
  "regexQuery",
  "fuseSearch",
  "multiTermSearch",
  "multiTermSortedSearch",
];
