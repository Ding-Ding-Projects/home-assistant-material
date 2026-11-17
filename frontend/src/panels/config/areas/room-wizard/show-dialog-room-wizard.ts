import { fireEvent } from "../../../../common/dom/fire_event";

export const loadRoomWizardDialog = () => import("./dialog-room-wizard");

export const showRoomWizardDialog = (element: HTMLElement): void => {
  fireEvent(element, "show-dialog", {
    dialogTag: "dialog-room-wizard",
    dialogImport: loadRoomWizardDialog,
    dialogParams: {},
  });
};
