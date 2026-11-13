import { fireEvent } from "../../common/dom/fire_event";

export const loadDarkCheckDialog = () => import("./dialog-dark-check");

/** Opens the dark mode readability check over the page that is shown. */
export const showDarkCheckDialog = (element: HTMLElement): void => {
  fireEvent(element, "show-dialog", {
    dialogTag: "dialog-dark-check",
    dialogImport: loadDarkCheckDialog,
    dialogParams: {},
  });
};
