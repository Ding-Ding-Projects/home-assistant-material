import {
  mdiCursorDefaultClickOutline,
  mdiEyeSettingsOutline,
  mdiMonitorCellphone,
  mdiPaletteOutline,
  mdiTestTube,
  mdiViewDashboardEditOutline,
} from "@mdi/js";
import type { LocalizeKeys } from "../../../../common/translations/localize";
import { MORE_TOOLS } from "../tools/registry-more";
import type { EditingTool } from "../tools/show-dashboard-editing-dialog";
import { showDashboardEditingDialog } from "../tools/show-dashboard-editing-dialog";
import type { DashboardToolsDialogParams } from "./show-dashboard-tools-dialog";

/**
 * One entry of the dashboard tools surface. The tools dialog lists every
 * entry; choosing one closes the dialog and runs `open`. New dashboard tools
 * are added by appending an entry at the end of the array below.
 */
export interface DashboardToolEntry {
  id: string;
  /** An icon path from `@mdi/js`. */
  icon: string;
  /** The full translation key of the tool's name. */
  labelKey: LocalizeKeys;
  open: (host: HTMLElement, params: DashboardToolsDialogParams) => void;
}

const editing = (id: EditingTool, icon: string): DashboardToolEntry => ({
  id: `edit-${id}`,
  icon,
  labelKey:
    `ui.panel.lovelace.editor.dashboard_tools.editing.names.${id}` as LocalizeKeys,
  open: (host, params) => showDashboardEditingDialog(host, params, id),
});

export const DASHBOARD_TOOLS: DashboardToolEntry[] = [
  editing("screens", mdiMonitorCellphone),
  editing("layout", mdiViewDashboardEditOutline),
  editing("visibility", mdiEyeSettingsOutline),
  editing("interactions", mdiCursorDefaultClickOutline),
  editing("style", mdiPaletteOutline),
  editing("simulate", mdiTestTube),
  ...MORE_TOOLS,
];
