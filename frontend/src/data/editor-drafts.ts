import type { HomeAssistant } from "../types";

export type EditorDraftKind = "automation" | "script" | "scene";

export interface EditorDraft<T = Record<string, any>> {
  kind: EditorDraftKind;
  item_id: string;
  config: T;
  /** Hash of the live item the draft was edited from; null for a new item. */
  base_hash: string | null;
  /** Extra details, such as {imported: true} for an imported item. */
  meta?: { imported?: boolean };
  /** When the newest autosave was stored, as an ISO time. */
  updated: string | null;
}

export interface EditorDraftSummary {
  kind: EditorDraftKind;
  item_id: string;
  alias: string | null;
  base_hash: string | null;
  updated: string | null;
}

export interface EditorDraftVersion {
  sha: string;
  time: string;
}

export interface EditorDraftSaveResult {
  saved: boolean;
  changed?: boolean;
  updated?: string;
  reason?: string;
}

export const saveEditorDraft = (
  hass: HomeAssistant,
  kind: EditorDraftKind,
  itemId: string,
  config: Record<string, any>,
  baseHash: string | null,
  meta?: { imported?: boolean }
) =>
  hass.callWS<EditorDraftSaveResult>({
    type: "editor_drafts/save",
    kind,
    item_id: itemId,
    config,
    base_hash: baseHash,
    ...(meta ? { meta } : {}),
  });

export const getEditorDraft = <T = Record<string, any>>(
  hass: HomeAssistant,
  kind: EditorDraftKind,
  itemId: string
) =>
  hass.callWS<EditorDraft<T> | null>({
    type: "editor_drafts/get",
    kind,
    item_id: itemId,
  });

export const listEditorDrafts = (hass: HomeAssistant) =>
  hass.callWS<EditorDraftSummary[]>({ type: "editor_drafts/list" });

export const fetchEditorDraftHistory = (
  hass: HomeAssistant,
  kind: EditorDraftKind,
  itemId: string
) =>
  hass.callWS<EditorDraftVersion[]>({
    type: "editor_drafts/history",
    kind,
    item_id: itemId,
  });

export const restoreEditorDraftVersion = <T = Record<string, any>>(
  hass: HomeAssistant,
  kind: EditorDraftKind,
  itemId: string,
  sha: string
) =>
  hass.callWS<{ config: T; base_hash: string | null }>({
    type: "editor_drafts/restore_version",
    kind,
    item_id: itemId,
    sha,
  });

export const discardEditorDraft = (
  hass: HomeAssistant,
  kind: EditorDraftKind,
  itemId: string
) =>
  hass.callWS<boolean>({
    type: "editor_drafts/discard",
    kind,
    item_id: itemId,
  });
