import { fireEvent } from "../../../../common/dom/fire_event";
import type { DashboardToolsDialogParams } from "../dashboard-tools-dialog/show-dashboard-tools-dialog";

export type MoreTool =
  "entities" | "a11y" | "wall" | "tablets" | "library" | "perf" | "diff";

export interface MoreToolsDialogParams extends DashboardToolsDialogParams {
  tool: MoreTool;
}

export const showMoreToolsDialog = (
  element: HTMLElement,
  params: DashboardToolsDialogParams,
  tool: MoreTool
): void => {
  fireEvent(element, "show-dialog", {
    dialogTag: "hui-dialog-more-tools",
    dialogImport: () => import("./hui-dialog-more-tools"),
    dialogParams: { ...params, tool },
  });
};
