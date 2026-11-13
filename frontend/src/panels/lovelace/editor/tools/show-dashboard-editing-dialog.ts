import { fireEvent } from "../../../../common/dom/fire_event";
import type { DashboardToolsDialogParams } from "../dashboard-tools-dialog/show-dashboard-tools-dialog";

export type EditingTool =
  "screens" | "layout" | "visibility" | "interactions" | "style" | "simulate";

export interface DashboardEditingDialogParams extends DashboardToolsDialogParams {
  tool: EditingTool;
}

export const showDashboardEditingDialog = (
  element: HTMLElement,
  params: DashboardToolsDialogParams,
  tool: EditingTool
): void => {
  fireEvent(element, "show-dialog", {
    dialogTag: "hui-dialog-dashboard-editing",
    dialogImport: () => import("./hui-dialog-dashboard-editing"),
    dialogParams: { ...params, tool },
  });
};
