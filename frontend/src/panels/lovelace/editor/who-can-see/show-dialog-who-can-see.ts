import { fireEvent } from "../../../../common/dom/fire_event";
import type { VisibilityCondition } from "../../common/validate-condition";

export interface WhoCanSeeDialogParams {
  /** What is being looked at, for example the card's type or name. */
  title: string;
  /** The conditions that decide whether it is shown. */
  conditions: VisibilityCondition[];
  /** Called with the new conditions when a role is hidden or shown again. */
  apply: (conditions: VisibilityCondition[]) => void;
}

export const loadWhoCanSeeDialog = () => import("./dialog-who-can-see");

export const showWhoCanSeeDialog = (
  element: HTMLElement,
  dialogParams: WhoCanSeeDialogParams
) => {
  fireEvent(element, "show-dialog", {
    dialogTag: "dialog-who-can-see",
    dialogImport: loadWhoCanSeeDialog,
    dialogParams,
  });
};
