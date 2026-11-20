import { fireEvent } from "../../../../common/dom/fire_event";
import type { ConfigEntry } from "../../../../data/config_entries";

export interface EntrySettingsDialogParams {
  entry: ConfigEntry;
  /** The integration's display name. */
  integrationName: string;
}

export const showIntegrationsListExportDialog = (
  element: HTMLElement
): void => {
  fireEvent(element, "show-dialog", {
    dialogTag: "dialog-integrations-list-export",
    dialogImport: () => import("./dialog-integrations-list-export"),
    dialogParams: {},
  });
};

export const showIntegrationsListImportDialog = (
  element: HTMLElement
): void => {
  fireEvent(element, "show-dialog", {
    dialogTag: "dialog-integrations-list-import",
    dialogImport: () => import("./dialog-integrations-list-import"),
    dialogParams: {},
  });
};

export const showEntrySettingsExportDialog = (
  element: HTMLElement,
  params: EntrySettingsDialogParams
): void => {
  fireEvent(element, "show-dialog", {
    dialogTag: "dialog-entry-settings-export",
    dialogImport: () => import("./dialog-entry-settings-export"),
    dialogParams: params,
  });
};

export const showEntrySettingsImportDialog = (
  element: HTMLElement,
  params: EntrySettingsDialogParams
): void => {
  fireEvent(element, "show-dialog", {
    dialogTag: "dialog-entry-settings-import",
    dialogImport: () => import("./dialog-entry-settings-import"),
    dialogParams: params,
  });
};
