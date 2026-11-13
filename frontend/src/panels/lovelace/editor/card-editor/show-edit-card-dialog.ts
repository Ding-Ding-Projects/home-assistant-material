import { fireEvent } from "../../../../common/dom/fire_event";
import type { LovelaceCardConfig } from "../../../../data/lovelace/config/card";
import type { LovelaceSectionConfig } from "../../../../data/lovelace/config/section";
import type { LovelaceConfig } from "../../../../data/lovelace/config/types";

export interface EditCardDialogParams {
  lovelaceConfig: LovelaceConfig;
  saveCardConfig: (
    config: LovelaceCardConfig,
    guarded?: boolean
  ) => void | Promise<void>;
  /** Only existing cards with a stable dashboard/path are eligible for drafts. */
  draftScope?: { urlPath: string | null; path: readonly (string | number)[] };
  cardConfig: LovelaceCardConfig;
  sectionConfig?: LovelaceSectionConfig;
  isNew?: boolean;
}

export const importEditCardDialog = () => import("./hui-dialog-edit-card");

export const showEditCardDialog = (
  element: HTMLElement,
  editCardDialogParams: EditCardDialogParams
): void => {
  fireEvent(element, "show-dialog", {
    dialogTag: "hui-dialog-edit-card",
    dialogImport: importEditCardDialog,
    dialogParams: editCardDialogParams,
  });
};
