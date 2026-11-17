import {
  mdiClipboardTextOutline,
  mdiDownload,
  mdiFileImportOutline,
  mdiHistory,
} from "@mdi/js";
import { html } from "lit";
import "../../../../components/ha-dropdown-item";
import "../../../../components/ha-svg-icon";
import type { HomeAssistant } from "../../../../types";
import { draftText } from "./draft-strings";
import { showImportConfigDialog } from "./show-dialog-import-config";
import { exportConfigs } from "./transfer-actions";
import type { TransferKind } from "./transfer-logic";

export const TRANSFER_MENU_ACTIONS = [
  "draft_history",
  "export_download",
  "export_copy",
  "import_yaml",
] as const;

export type TransferMenuAction = (typeof TRANSFER_MENU_ACTIONS)[number];

export const isTransferMenuAction = (
  value: string
): value is TransferMenuAction =>
  (TRANSFER_MENU_ACTIONS as readonly string[]).includes(value);

/** The menu items every editor adds for drafts, export and import. */
export const renderTransferMenuItems = (hass: HomeAssistant) => html`
  <ha-dropdown-item value="draft_history">
    ${draftText(hass, "history")}
    <ha-svg-icon slot="icon" .path=${mdiHistory}></ha-svg-icon>
  </ha-dropdown-item>
  <ha-dropdown-item value="export_download">
    ${draftText(hass, "export_download")}
    <ha-svg-icon slot="icon" .path=${mdiDownload}></ha-svg-icon>
  </ha-dropdown-item>
  <ha-dropdown-item value="export_copy">
    ${draftText(hass, "export_copy")}
    <ha-svg-icon slot="icon" .path=${mdiClipboardTextOutline}></ha-svg-icon>
  </ha-dropdown-item>
  <ha-dropdown-item value="import_yaml">
    ${draftText(hass, "import_title")}
    <ha-svg-icon slot="icon" .path=${mdiFileImportOutline}></ha-svg-icon>
  </ha-dropdown-item>
`;

/** Run an export or import menu action; draft history is the editor's own. */
export const runTransferMenuAction = (
  element: HTMLElement,
  hass: HomeAssistant,
  kind: TransferKind,
  action: Exclude<TransferMenuAction, "draft_history">,
  config: Record<string, any> | undefined
): void => {
  if (action === "import_yaml") {
    showImportConfigDialog(element, { kind });
    return;
  }
  if (config) {
    void exportConfigs(
      element,
      hass,
      kind,
      [config],
      action === "export_copy" ? "copy" : "download"
    );
  }
};
