import { fireEvent } from "../../../common/dom/fire_event";
import type { LovelaceCardConfig } from "../../../data/lovelace/config/card";
import type { PopupSize } from "../common/popup-action";

export interface PopupDialogParams {
  title?: string;
  cards: LovelaceCardConfig[];
  size: PopupSize;
  dismissOnOutside: boolean;
}

export const importPopupDialog = () => import("./hui-dialog-popup");

export const showPopupDialog = (
  element: HTMLElement,
  params: PopupDialogParams
): void => {
  fireEvent(element, "show-dialog", {
    dialogTag: "hui-dialog-popup",
    dialogImport: importPopupDialog,
    dialogParams: params,
  });
};
