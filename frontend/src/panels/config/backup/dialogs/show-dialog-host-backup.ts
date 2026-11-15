import { fireEvent } from "../../../../common/dom/fire_event";
import type { BackupContent } from "../../../../data/backup";

export interface HostBackupDialogParams {
  backup: BackupContent;
  kind: "docker" | "appliance";
  onBusy?: (busy: boolean) => void;
}

export const showHostBackupDialog = (
  element: HTMLElement,
  params: HostBackupDialogParams
) =>
  fireEvent(element, "show-dialog", {
    dialogTag: "dialog-host-backup",
    dialogImport: () => import("./dialog-host-backup"),
    dialogParams: params,
  });
