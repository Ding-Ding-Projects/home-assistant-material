import {
  mdiCardsOutline,
  mdiCompareHorizontal,
  mdiFormatListBulleted,
  mdiSpeedometer,
  mdiTabletCellphone,
  mdiTabletDashboard,
  mdiWheelchairAccessibility,
} from "@mdi/js";
import type { LocalizeKeys } from "../../../../common/translations/localize";
import type { DashboardToolEntry } from "../dashboard-tools-dialog/registry";
import type { MoreTool } from "./show-more-tools-dialog";
import { showMoreToolsDialog } from "./show-more-tools-dialog";

const more = (id: MoreTool, icon: string): DashboardToolEntry => ({
  id: `more-${id}`,
  icon,
  labelKey:
    `ui.panel.lovelace.editor.dashboard_tools.more.${id}.title` as LocalizeKeys,
  open: (host, params) => showMoreToolsDialog(host, params, id),
});

/** Entity inspector, accessibility checker, wall panel, card library, performance meter and checkpoint diff. */
export const MORE_TOOLS: DashboardToolEntry[] = [
  more("entities", mdiFormatListBulleted),
  more("a11y", mdiWheelchairAccessibility),
  more("wall", mdiTabletDashboard),
  more("tablets", mdiTabletCellphone),
  more("library", mdiCardsOutline),
  more("perf", mdiSpeedometer),
  more("diff", mdiCompareHorizontal),
];
