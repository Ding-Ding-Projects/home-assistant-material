import type { LocalizeKeys } from "../../../common/translations/localize";

export interface ToolsTab {
  panel: string;
  translationKey: LocalizeKeys;
  descriptionKey: string;
  /** Only listed when this integration is loaded. */
  component?: string;
}

export const TOOLS_TABS: readonly ToolsTab[] = [
  {
    panel: "yaml",
    translationKey: "ui.panel.config.tools.tabs.yaml.title",
    descriptionKey: "ui.panel.config.tools.nav.description.yaml",
  },
  {
    panel: "state",
    translationKey: "ui.panel.config.tools.tabs.states.title",
    descriptionKey: "ui.panel.config.tools.nav.description.state",
  },
  {
    panel: "action",
    translationKey: "ui.panel.config.tools.tabs.actions.title",
    descriptionKey: "ui.panel.config.tools.nav.description.action",
  },
  {
    panel: "action-history",
    translationKey: "ui.panel.config.tools.tabs.action_history.title",
    descriptionKey: "ui.panel.config.tools.nav.description.action_history",
    component: "logbook",
  },
  {
    panel: "template",
    translationKey: "ui.panel.config.tools.tabs.templates.title",
    descriptionKey: "ui.panel.config.tools.nav.description.template",
  },
  {
    panel: "event",
    translationKey: "ui.panel.config.tools.tabs.events.title",
    descriptionKey: "ui.panel.config.tools.nav.description.event",
  },
  {
    panel: "debug-console",
    translationKey: "ui.panel.config.tools.tabs.debug_console.title",
    descriptionKey: "ui.panel.config.tools.nav.description.debug_console",
    // Only loaded when enabled in YAML.
    component: "debug_console",
  },
  {
    panel: "statistics",
    translationKey: "ui.panel.config.tools.tabs.statistics.title",
    descriptionKey: "ui.panel.config.tools.nav.description.statistics",
  },
  {
    panel: "assist",
    translationKey: "ui.panel.config.tools.tabs.assist.tab",
    descriptionKey: "ui.panel.config.tools.nav.description.assist",
  },
  {
    panel: "base64",
    translationKey: "ui.panel.config.tools.tabs.base64.title",
    descriptionKey: "ui.panel.config.tools.nav.description.base64",
  },
  {
    panel: "colour",
    translationKey: "ui.panel.config.tools.tabs.colour.title",
    descriptionKey: "ui.panel.config.tools.nav.description.colour",
  },
  {
    panel: "converter",
    translationKey: "ui.panel.config.tools.tabs.converter.title",
    descriptionKey: "ui.panel.config.tools.nav.description.converter",
  },
  {
    panel: "drawing",
    translationKey: "ui.panel.config.tools.tabs.drawing.title",
    descriptionKey: "ui.panel.config.tools.nav.description.drawing",
  },
];

/** The tools shown as pills, in display order. */
export const MAIN_TOOL_PANELS: readonly string[] = [
  "state",
  "action",
  "template",
  "event",
  "yaml",
  "statistics",
];

/** Route names that show another tool's page. */
const PANEL_ALIASES: Record<string, string> = { service: "action" };

export const resolveToolPanel = (page: string): string =>
  PANEL_ALIASES[page] ?? page;

export interface ToolsNavigation {
  main: ToolsTab[];
  more: ToolsTab[];
}

/**
 * Split the available tools into the pills and the "More tools" menu.
 * Every tool lands in exactly one of the two.
 */
export const partitionTools = (
  isAvailable: (tab: ToolsTab) => boolean
): ToolsNavigation => {
  const available = TOOLS_TABS.filter(isAvailable);
  const main = MAIN_TOOL_PANELS.map((panel) =>
    available.find((tab) => tab.panel === panel)
  ).filter((tab): tab is ToolsTab => tab !== undefined);
  const more = available.filter((tab) => !MAIN_TOOL_PANELS.includes(tab.panel));
  return { main, more };
};
