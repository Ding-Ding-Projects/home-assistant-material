import { fireEvent } from "../../../../common/dom/fire_event";

export const loadDefaultDashboardDialog = () =>
  import("./dialog-default-dashboard");

export const showDefaultDashboardDialog = (element: HTMLElement) => {
  fireEvent(element, "show-dialog", {
    dialogTag: "dialog-default-dashboard",
    dialogImport: loadDefaultDashboardDialog,
    dialogParams: {},
  });
};
