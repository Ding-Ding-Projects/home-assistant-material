import type { HomeAssistant } from "../types";

export const INTEGRATIONS_LIST_KIND =
  "home-assistant-material/integrations-list";
export const INTEGRATION_SETTINGS_KIND =
  "home-assistant-material/integration-settings";
export const TRANSFER_FILE_FORMAT = 1;

/** A file larger than this is refused whole. */
export const MAX_TRANSFER_FILE_BYTES = 1024 * 1024;

export interface IntegrationsListRow {
  domain: string;
  name: string;
  source: "built_in" | "custom";
  version: string | null;
  entries: number;
  titles?: string[];
  entity_kinds: string[];
  entity_counts?: Record<string, number>;
  devices?: number;
}

export interface IntegrationsList {
  kind: typeof INTEGRATIONS_LIST_KIND;
  format: typeof TRANSFER_FILE_FORMAT;
  build: string;
  made_at: string;
  names_included: boolean;
  counts_included: boolean;
  integrations: IntegrationsListRow[];
}

export interface DomainHere {
  known: boolean;
  built_in: boolean;
  config_flow: boolean;
  entries: number;
}

export interface SettingsExport {
  kind: string;
  format: number;
  domain: string;
  entry_version: number;
  entry_minor_version: number;
  build: string;
  made_at: string;
  signins_included: boolean;
  left_out?: string[];
  options?: Record<string, unknown>;
  data?: Record<string, unknown>;
  locked?: boolean;
}

export interface SettingsChange {
  part: "option" | "setting" | "kept";
  name: string;
  signin: boolean;
  change: "changed" | "added" | "removed" | "kept";
  old?: unknown;
  new?: unknown;
}

export interface UndoInfo {
  available: boolean;
  saved_at: string | null;
}

export interface SettingsPreview {
  domain: string;
  changes: SettingsChange[];
  signins_in_file: string[];
  undo: UndoInfo;
}

export const fetchIntegrationsList = (
  hass: HomeAssistant,
  titles: boolean,
  counts: boolean
) =>
  hass.callWS<IntegrationsList>({
    type: "integration_transfer/list",
    titles,
    counts,
  });

export const compareIntegrationDomains = (
  hass: HomeAssistant,
  domains: string[]
) =>
  hass.callWS<{ domains: Record<string, DomainHere> }>({
    type: "integration_transfer/compare",
    domains,
  });

export const exportEntrySettings = (hass: HomeAssistant, entryId: string) =>
  hass.callWS<SettingsExport>({
    type: "integration_transfer/settings/export",
    entry_id: entryId,
  });

export const exportEntrySettingsLocked = (
  hass: HomeAssistant,
  entryId: string,
  password: string,
  passwordConfirm: string
) =>
  hass.callWS<SettingsExport>({
    type: "integration_transfer/settings/export_locked",
    entry_id: entryId,
    password,
    password_confirm: passwordConfirm,
    confirmed: true,
  });

export const previewEntrySettings = (
  hass: HomeAssistant,
  entryId: string,
  content: string,
  password?: string
) =>
  hass.callWS<SettingsPreview>({
    type: "integration_transfer/settings/preview",
    entry_id: entryId,
    content,
    ...(password ? { password } : {}),
  });

export const applyEntrySettings = (
  hass: HomeAssistant,
  entryId: string,
  content: string,
  password?: string
) =>
  hass.callWS<{ changed: number; undo: UndoInfo }>({
    type: "integration_transfer/settings/apply",
    entry_id: entryId,
    content,
    confirmed: true,
    ...(password ? { password } : {}),
  });

export const undoEntrySettings = (hass: HomeAssistant, entryId: string) =>
  hass.callWS<{ undo: UndoInfo }>({
    type: "integration_transfer/settings/undo",
    entry_id: entryId,
  });

export const fetchEntrySettingsUndo = (hass: HomeAssistant, entryId: string) =>
  hass.callWS<UndoInfo>({
    type: "integration_transfer/settings/undo_info",
    entry_id: entryId,
  });
