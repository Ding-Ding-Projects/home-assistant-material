import { fireEvent } from "../../../../common/dom/fire_event";
import type { ManualAutomationConfig } from "../../../../data/automation";

export interface AutomationDryRunDialogParams {
  /** The automation as it is on screen, saved or not. */
  config: ManualAutomationConfig;
}

export const loadAutomationDryRunDialog = () =>
  import("./dialog-automation-dry-run");

export const showAutomationDryRunDialog = (
  element: HTMLElement,
  dialogParams: AutomationDryRunDialogParams
): void => {
  fireEvent(element, "show-dialog", {
    dialogTag: "ha-dialog-automation-dry-run",
    dialogImport: loadAutomationDryRunDialog,
    dialogParams,
  });
};
