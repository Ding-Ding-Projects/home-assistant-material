import { fireEvent } from "../../../../common/dom/fire_event";
import type { VisibilityCondition } from "../../common/validate-condition";

export interface WhoCanSeeDialogParams {
  /** What is being looked at, for example the card's type or name. */
  title: string;
  /** The conditions that decide whether it is shown. */
  conditions: VisibilityCondition[];
  /**
   * The conditions that mark the item as view only. When set (a card), each
   * role can be Hidden, View or Use; when absent only Show and Hide are offered.
   */
  viewOnly?: VisibilityCondition[];
  /**
   * Called with the new conditions (and the new view-only conditions when the
   * item supports view only) when a role is moved to another level.
   */
  apply: (
    conditions: VisibilityCondition[],
    viewOnly?: VisibilityCondition[]
  ) => void;
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
