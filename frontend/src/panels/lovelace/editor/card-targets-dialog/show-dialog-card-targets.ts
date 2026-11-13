import { fireEvent } from "../../../../common/dom/fire_event";
import type { Lovelace } from "../../types";
import type { LovelacePath } from "../lovelace-path";

export interface CardTargetsDialogParams {
  /** Paste puts copied cards in a view; move takes the selected cards to one. */
  mode: "paste" | "move";
  /** The dashboard as it is now; it changes after every save. */
  lovelace: () => Lovelace | undefined;
  /** The view to offer first. */
  viewIndex?: number;
  /** The selected cards, for moving them. */
  paths?: LovelacePath[];
  onDone?: () => void;
}

export const showCardTargetsDialog = (
  element: HTMLElement,
  params: CardTargetsDialogParams
): void => {
  fireEvent(element, "show-dialog", {
    dialogTag: "hui-dialog-card-targets",
    dialogImport: () => import("./hui-dialog-card-targets"),
    dialogParams: params,
  });
};

export interface CardsStyleDialogParams {
  lovelace: () => Lovelace | undefined;
  /** The selected cards the style is applied to. */
  paths: LovelacePath[];
  onDone?: () => void;
}

export const showCardsStyleDialog = (
  element: HTMLElement,
  params: CardsStyleDialogParams
): void => {
  fireEvent(element, "show-dialog", {
    dialogTag: "hui-dialog-cards-style",
    dialogImport: () => import("./hui-dialog-cards-style"),
    dialogParams: params,
  });
};
