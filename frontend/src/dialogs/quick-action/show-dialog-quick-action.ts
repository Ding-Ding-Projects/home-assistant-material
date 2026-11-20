import { fireEvent } from "../../common/dom/fire_event";

export interface QuickActionDialogParams {
  /** The entity the first step acts on. Without it the dialog starts empty. */
  entityId?: string;
}

export const loadQuickActionDialog = () => import("./dialog-quick-action");

/**
 * Opens "Run a quick action": a short sequence that runs once and is not
 * saved unless the person keeps it as a script.
 */
export const showQuickActionDialog = (
  element: HTMLElement,
  params: QuickActionDialogParams
): void => {
  fireEvent(element, "show-dialog", {
    dialogTag: "dialog-quick-action",
    dialogImport: loadQuickActionDialog,
    dialogParams: params,
  });
};
