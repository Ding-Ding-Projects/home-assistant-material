import { showAlertDialog } from "../dialogs/generic/show-dialog-box";
import { showToast } from "./toast";

/**
 * Shows an error that stays until it is dismissed. The message says in plain
 * words what failed; the technical message, when there is one, sits behind a
 * Details action that opens it in a dialog.
 */
export const showErrorToast = (
  element: HTMLElement,
  message: string,
  details?: string
) => {
  const detailsText = details?.trim();
  showToast(element, {
    message,
    duration: -1,
    dismissable: true,
    action: detailsText
      ? {
          text: { translationKey: "ui.replaced_dialogs.details" },
          action: () => {
            showAlertDialog(element, {
              title: message,
              text: detailsText,
            });
          },
        }
      : undefined,
  });
};
