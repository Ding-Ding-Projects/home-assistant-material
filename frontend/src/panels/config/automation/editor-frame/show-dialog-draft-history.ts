import { fireEvent } from "../../../../common/dom/fire_event";
import type { EditorDraftKind } from "../../../../data/editor-drafts";

export interface DraftHistoryDialogParams {
  kind: EditorDraftKind;
  itemId: string;
  /** Called with the restored config, to be put in the editor unsaved. */
  onRestore: (config: Record<string, any>) => void;
}

export const showDraftHistoryDialog = (
  element: HTMLElement,
  params: DraftHistoryDialogParams
): void => {
  fireEvent(element, "show-dialog", {
    dialogTag: "ha-dialog-draft-history",
    dialogImport: () => import("./dialog-draft-history"),
    dialogParams: params,
  });
};
