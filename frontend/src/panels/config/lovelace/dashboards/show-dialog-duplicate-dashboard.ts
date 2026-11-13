import { fireEvent } from "../../../../common/dom/fire_event";
import type { LovelaceDashboard } from "../../../../data/lovelace/dashboard";

export interface DuplicateDashboardDialogParams {
  dashboard: Pick<
    LovelaceDashboard,
    "title" | "url_path" | "icon" | "require_admin" | "show_in_sidebar"
  >;
  /** Addresses that are already used by a dashboard or a panel. */
  takenUrlPaths: ReadonlySet<string>;
  /** Called with the new dashboard, so the list can show it. */
  created: (dashboard: LovelaceDashboard) => void;
}

export const showDuplicateDashboardDialog = (
  element: HTMLElement,
  params: DuplicateDashboardDialogParams
): void => {
  fireEvent(element, "show-dialog", {
    dialogTag: "dialog-duplicate-dashboard",
    dialogImport: () => import("./dialog-duplicate-dashboard"),
    dialogParams: params,
  });
};
