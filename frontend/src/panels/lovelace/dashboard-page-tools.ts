import type { PageTool } from "../../components/page/ha-page-tools";

/** The state a dashboard header is in, as far as page tools are concerned. */
export type DashboardPageToolsMode = "view" | "edit" | "locked";

export type DashboardPageTool =
  "find" | "appearance" | "readAloud" | "history" | "export" | "lock" | "help";

const ALL_TOOLS: readonly DashboardPageTool[] = [
  "find",
  "appearance",
  "readAloud",
  "history",
  "export",
  "lock",
  "help",
];

/** Which mode a dashboard header is in. A locked page only locks in view mode. */
export const dashboardPageToolsMode = (
  editMode: boolean,
  locked: boolean
): DashboardPageToolsMode => {
  if (editMode) {
    return "edit";
  }
  return locked ? "locked" : "view";
};

/**
 * The tools that show in a dashboard header in a mode.
 *
 * View mode shows all of them. Edit mode hides lock and read aloud. A locked
 * dashboard shows only Unlock.
 */
export const dashboardPageTools = (
  mode: DashboardPageToolsMode
): DashboardPageTool[] => {
  switch (mode) {
    case "locked":
      return ["lock"];
    case "edit":
      return ALL_TOOLS.filter(
        (tool) => tool !== "lock" && tool !== "readAloud"
      );
    default:
      return [...ALL_TOOLS];
  }
};

/**
 * Whether the shared page tools cluster can be used as it is. It always shows
 * every tool, so it only fits a mode in which every tool shows.
 */
export const usesSharedPageTools = (mode: DashboardPageToolsMode): boolean =>
  dashboardPageTools(mode).length === ALL_TOOLS.length;

export interface DashboardToolButton {
  tool: DashboardPageTool;
  /** Localize key of the button label. */
  label:
    | "ui.page_tools.appearance"
    | "ui.page_tools.history"
    | "ui.page_tools.export"
    | "ui.page_tools.unlock_hold"
    | "ui.page_tools.help"
    | "ui.page_tools.label";
  /** The tools panel entry the button opens, or undefined for appearance. */
  panelTool?: PageTool;
}

const BUTTONS: Partial<Record<DashboardPageTool, DashboardToolButton>> = {
  appearance: { tool: "appearance", label: "ui.page_tools.appearance" },
  history: {
    tool: "history",
    label: "ui.page_tools.history",
    panelTool: "history",
  },
  export: {
    tool: "export",
    label: "ui.page_tools.export",
    panelTool: "export",
  },
  lock: {
    tool: "lock",
    label: "ui.page_tools.unlock_hold",
    panelTool: "lock",
  },
  help: { tool: "help", label: "ui.page_tools.help", panelTool: "help" },
};

/** Single button that opens the tools panel, the overflow menu of a phone. */
export const OVERFLOW_BUTTON: DashboardToolButton = {
  tool: "find",
  label: "ui.page_tools.label",
  panelTool: "tools",
};

/**
 * The tools the overflow panel of a narrow header lists. It lists the same
 * tools as the wide header in that mode: every tool in view mode, and in edit
 * mode only the ones that have a button there (appearance, history, export and
 * help), so Search this page, Read aloud and Lock stay out of it.
 */
export const dashboardOverflowTools = (
  mode: DashboardPageToolsMode
): DashboardPageTool[] =>
  usesSharedPageTools(mode)
    ? dashboardPageTools(mode)
    : dashboardPageTools(mode).filter((tool) => BUTTONS[tool] !== undefined);

/**
 * Buttons the header draws itself for a mode that cannot use the shared
 * cluster. A narrow screen gets one overflow button so the title stays
 * readable.
 */
export const dashboardToolButtons = (
  mode: DashboardPageToolsMode,
  narrow: boolean
): DashboardToolButton[] => {
  if (narrow && mode !== "locked") {
    return [OVERFLOW_BUTTON];
  }
  return dashboardPageTools(mode).flatMap((tool) => {
    const button = BUTTONS[tool];
    return button ? [button] : [];
  });
};
