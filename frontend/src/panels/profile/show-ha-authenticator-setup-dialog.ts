import { fireEvent } from "../../common/dom/fire_event";

export interface AuthenticatorSetupDialogParams {
  /** Called when the dialog closes; `done` is true when the setup finished. */
  dialogClosedCallback: (params: { done: boolean }) => void;
}

export const loadAuthenticatorSetupDialog = () =>
  import("./dialog-ha-authenticator-setup");

export const showAuthenticatorSetupDialog = (
  element: HTMLElement,
  dialogParams: AuthenticatorSetupDialogParams
): void => {
  fireEvent(element, "show-dialog", {
    dialogTag: "ha-authenticator-setup-dialog",
    dialogImport: loadAuthenticatorSetupDialog,
    dialogParams,
  });
};
