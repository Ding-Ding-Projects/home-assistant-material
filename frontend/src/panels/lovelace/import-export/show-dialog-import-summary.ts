import { fireEvent } from "../../../common/dom/fire_event";
import type { ImportVisibility } from "./dashboard-actions";
import type { ImportSummary } from "./dashboard-file";

export interface ImportSummaryDialogParams {
  summary: ImportSummary;
  /** Called once, after the dialog has closed, only when the person confirms. */
  onConfirm: (visibility: ImportVisibility) => void;
}

export const showImportSummaryDialog = (
  element: HTMLElement,
  params: ImportSummaryDialogParams
): void => {
  fireEvent(element, "show-dialog", {
    dialogTag: "dialog-import-summary",
    dialogImport: () => import("./dialog-import-summary"),
    dialogParams: params,
  });
};
