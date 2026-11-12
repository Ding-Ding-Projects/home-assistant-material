import { fireEvent } from "../../../../common/dom/fire_event";

export interface AppJobProgressDialogParams {
  /** The slug of the app whose install, update or removal is shown. */
  slug: string;
}

export const showAppJobProgressDialog = (
  element: HTMLElement,
  dialogParams: AppJobProgressDialogParams
): void => {
  fireEvent(element, "show-dialog", {
    dialogTag: "dialog-app-job-progress",
    dialogImport: () => import("./dialog-app-job-progress"),
    dialogParams,
  });
};
