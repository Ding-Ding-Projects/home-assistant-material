import { fireEvent } from "../../../../common/dom/fire_event";
import type { Lovelace } from "../../types";

export type PreviewWidth = "phone" | "tablet" | "desktop" | undefined;

export interface DashboardToolsDialogParams {
  /** The dashboard as it is now; it changes after every save. */
  lovelace: () => Lovelace | undefined;
  /** Opens a view by its index. */
  openView: (view: number) => void;
  previewWidth: PreviewWidth;
  setPreviewWidth: (width: PreviewWidth) => void;
}

export const showDashboardToolsDialog = (
  element: HTMLElement,
  params: DashboardToolsDialogParams
): void => {
  fireEvent(element, "show-dialog", {
    dialogTag: "hui-dialog-dashboard-tools",
    dialogImport: () => import("./hui-dialog-dashboard-tools"),
    dialogParams: params,
  });
};
