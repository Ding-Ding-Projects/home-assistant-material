import {
  mdiVariable,
  mdiPuzzleOutline,
  mdiHeartPulse,
  mdiCalendarWeek,
  mdiSwapHorizontal,
  mdiSourceBranch,
  mdiTimelineClockOutline,
  mdiPlayCircleOutline,
  mdiAlertOutline,
  mdiTextBoxOutline,
  mdiToggleSwitchOutline,
  mdiFlaskOutline,
  mdiGraphOutline,
} from "@mdi/js";
import type { ManualAutomationConfig } from "../../../../data/automation";
import type { HomeAssistant } from "../../../../types";

/** What a tool receives when it is opened from the editor. */
export interface AutomationToolContext {
  hass: HomeAssistant;
  /** The automation as it is on screen, including unsaved edits. */
  config: ManualAutomationConfig;
  /** The stored automation entity id, when the automation is saved. */
  entityId?: string;
  /** The stored automation id, when the automation is saved. */
  automationId?: string;
  /** Applies a changed configuration back into the editor. */
  applyConfig?: (config: ManualAutomationConfig) => void;
}

/** One entry of the editor's Tools menu or panel. */
export interface AutomationToolEntry {
  id: string;
  /** An mdi icon path. */
  icon: string;
  /** A translation key for the label. */
  labelKey: string;
  /** A translation key for a one-line description. */
  descriptionKey?: string;
  /** The tag name of the view element that renders this tool. */
  element: string;
  /** Loads the module that defines the element. */
  open: () => Promise<unknown>;
}

const TOOL_MODULES: Record<string, () => Promise<unknown>> = {
  trace: () => import("./ha-automation-tool-trace"),
  simulate: () => import("./ha-automation-tool-simulate"),
  conflicts: () => import("./ha-automation-tool-conflicts"),
  language: () => import("./ha-automation-tool-language"),
  steps: () => import("./ha-automation-tool-steps"),
};

/**
 * The tools reachable from the automation editor.
 *
 * Entries are appended at the end of this array. Each lane adds its own entries
 * after the existing ones and never reorders or edits the others.
 */
export const AUTOMATION_TOOLS: AutomationToolEntry[] = [
  {
    id: "flow",
    icon: mdiSourceBranch,
    labelKey: "ui.panel.config.automation.editor.tools.flow.title",
    descriptionKey: "ui.panel.config.automation.editor.tools.flow.description",
    element: "ha-automation-tool-flow",
    open: () => import("./ha-automation-tool-flow"),
  },
  // Entries from other lanes are appended below this line.
  {
    id: "variables",
    icon: mdiVariable,
    labelKey:
      "ui.panel.config.automation.editor.tools_more.entries.variables.title",
    descriptionKey:
      "ui.panel.config.automation.editor.tools_more.entries.variables.description",
    element: "ha-automation-tool-variables",
    open: () => import("./ha-automation-tool-variables"),
  },
  {
    id: "blueprint",
    icon: mdiPuzzleOutline,
    labelKey:
      "ui.panel.config.automation.editor.tools_more.entries.blueprint.title",
    descriptionKey:
      "ui.panel.config.automation.editor.tools_more.entries.blueprint.description",
    element: "ha-automation-tool-blueprint",
    open: () => import("./ha-automation-tool-blueprint"),
  },
  {
    id: "health",
    icon: mdiHeartPulse,
    labelKey:
      "ui.panel.config.automation.editor.tools_more.entries.health.title",
    descriptionKey:
      "ui.panel.config.automation.editor.tools_more.entries.health.description",
    element: "ha-automation-tool-health",
    open: () => import("./ha-automation-tool-health"),
  },
  {
    id: "week",
    icon: mdiCalendarWeek,
    labelKey: "ui.panel.config.automation.editor.tools_more.entries.week.title",
    descriptionKey:
      "ui.panel.config.automation.editor.tools_more.entries.week.description",
    element: "ha-automation-tool-week",
    open: () => import("./ha-automation-tool-week"),
  },
  {
    id: "swap",
    icon: mdiSwapHorizontal,
    labelKey: "ui.panel.config.automation.editor.tools_more.entries.swap.title",
    descriptionKey:
      "ui.panel.config.automation.editor.tools_more.entries.swap.description",
    element: "ha-automation-tool-swap",
    open: () => import("./ha-automation-tool-swap"),
  },
  ...[
    ["trace", mdiTimelineClockOutline],
    ["simulate", mdiPlayCircleOutline],
    ["conflicts", mdiAlertOutline],
    ["language", mdiTextBoxOutline],
    ["steps", mdiToggleSwitchOutline],
  ].map(([id, icon]): AutomationToolEntry => ({
    id,
    icon,
    labelKey: `ui.panel.config.automation.editor.tools.${id}.title`,
    descriptionKey: `ui.panel.config.automation.editor.tools.${id}.description`,
    element: `ha-automation-tool-${id}`,
    open: () => TOOL_MODULES[id](),
  })),
  {
    id: "tests",
    icon: mdiFlaskOutline,
    labelKey: "ui.panel.config.automation.editor.tools.tests.title",
    descriptionKey: "ui.panel.config.automation.editor.tools.tests.description",
    element: "ha-automation-tool-tests",
    open: () => import("./ha-automation-tool-tests"),
  },
  {
    id: "relations",
    icon: mdiGraphOutline,
    labelKey: "ui.panel.config.automation.editor.tools.relations.title",
    descriptionKey:
      "ui.panel.config.automation.editor.tools.relations.description",
    element: "ha-automation-tool-relations",
    open: () => import("./ha-automation-tool-relations"),
  },
];
