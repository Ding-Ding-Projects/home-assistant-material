import { fireEvent } from "../../common/dom/fire_event";
import type { HomeAssistant } from "../../types";
import { closeDialog } from "../make-dialog-manager";

export type QuickBarSection =
  "entity" | "device" | "area" | "navigate" | "command" | "setting";

export interface QuickBarParams {
  entityFilter?: string;
  mode?: QuickBarSection;
  showHint?: boolean;
  /** Text to start the search with, plain or written as /pattern/flags. */
  search?: string;
}

/** Non-admin users cannot scope the bar to command, device, or area (those sections are admin-only). */
export const effectiveQuickBarMode = (
  user: HomeAssistant["user"],
  mode?: QuickBarSection
): QuickBarSection | undefined => {
  if (mode && user?.is_admin) {
    return mode;
  }
  if (mode === "command" || mode === "device" || mode === "area") {
    return undefined;
  }
  return mode;
};

export const loadQuickBar = () => import("./ha-quick-bar");

export const showQuickBar = (
  element: HTMLElement,
  dialogParams: QuickBarParams
): void => {
  fireEvent(element, "show-dialog", {
    dialogTag: "ha-quick-bar",
    dialogImport: loadQuickBar,
    dialogParams,
    addHistory: false,
  });
};

export const closeQuickBar = (): void => {
  closeDialog("ha-quick-bar");
};
