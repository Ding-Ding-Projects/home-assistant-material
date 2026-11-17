import { fireEvent } from "../../../../common/dom/fire_event";
import type { TransferKind } from "./transfer-logic";

export interface ImportConfigDialogParams {
  kind: TransferKind;
}

export const showImportConfigDialog = (
  element: HTMLElement,
  params: ImportConfigDialogParams
): void => {
  fireEvent(element, "show-dialog", {
    dialogTag: "ha-dialog-import-config",
    dialogImport: () => import("./dialog-import-config"),
    dialogParams: params,
  });
};
