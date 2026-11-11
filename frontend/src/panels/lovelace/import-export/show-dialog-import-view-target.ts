import { fireEvent } from "../../../common/dom/fire_event";

export interface ImportViewTargetDialogParams {
  /** The address of the dashboard on screen, chosen first when editable. */
  currentUrlPath?: string;
  onSelected: (urlPath: string) => void;
}

export const showImportViewTargetDialog = (
  element: HTMLElement,
  params: ImportViewTargetDialogParams
): void => {
  fireEvent(element, "show-dialog", {
    dialogTag: "dialog-import-view-target",
    dialogImport: () => import("./dialog-import-view-target"),
    dialogParams: params,
  });
};
