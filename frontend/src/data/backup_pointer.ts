import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import type { HomeAssistant } from "../types";
import type { BackupContent } from "./backup";
import { isLocalAgent } from "./backup";

/**
 * Keeping only a pointer on this disk. Once a backup is in a container
 * registry place and its copy there was read back and checked part by part,
 * the copy on this disk can be replaced by a small record: the pointer. The
 * backend holds every rule; this module reads and changes the setting and
 * turns the results into what the page shows.
 */

export type PointerCheckState = "present" | "missing" | "unknown";

export interface BackupPointer {
  backup_id: string;
  name: string;
  date: string;
  agent_id: string;
  place_name: string;
  repository: string | null;
  local_agent_id: string;
  filename: string;
  /** Size of the backup in the registry, in bytes. */
  size: number;
  /** "sha256:" and the SHA-256 of the backup file. */
  check_value: string;
  parts: number | null;
  part_size: number | null;
  made_at: string;
  /** When the registry copy was last read back in full. */
  verified_at: string;
  /** When the daily check last looked at the registry. */
  checked_at: string | null;
  check_state: PointerCheckState;
  check_reason: string | null;
  /** Bytes the pointer takes on this disk. */
  stored_size: number;
  restorable: boolean;
}

export interface PointerKept {
  reason: string;
  at: string;
  detail: string | null;
}

export interface PointerTransfer {
  backup_id: string;
  action: "bring_back" | "restore";
  state: "in_progress" | "done" | "failed";
  started: string;
  bytes_done: number;
  bytes_total: number;
  parts_done: number;
  parts_total: number;
  reason: string | null;
}

export type KeepWhole = 0 | 1 | 3;

export interface PointerSettings {
  enabled: boolean;
  keep_whole: KeepWhole;
}

export interface PointerSummary {
  whole_here: number;
  pointers: number;
  missing: number;
  saved_bytes: number;
  pointer_bytes: number;
}

export interface BackupPointerInfo {
  readable: boolean;
  /** True when a place that can be read back in full is set up and unlocked. */
  available: boolean;
  settings: PointerSettings;
  keep_whole_choices: KeepWhole[];
  summary: PointerSummary;
  pointers: Record<string, BackupPointer>;
  kept: Record<string, PointerKept>;
  transfer: PointerTransfer | null;
  places: { agent_id: string; name: string }[];
  local_agent_ids: string[];
}

export const KEEP_WHOLE_CHOICES: KeepWhole[] = [0, 1, 3];

export const fetchBackupPointerInfo = (
  hass: HomeAssistant
): Promise<BackupPointerInfo> => hass.callWS({ type: "backup/pointer/info" });

export const setBackupPointerSettings = (
  hass: HomeAssistant,
  settings: Partial<PointerSettings>
): Promise<PointerSettings> =>
  hass.callWS({ type: "backup/pointer/settings", ...settings });

export const runBackupPointerPass = (
  hass: HomeAssistant
): Promise<{ outcomes: Record<string, string> }> =>
  hass.callWS({ type: "backup/pointer/run" });

export const checkBackupPointers = (
  hass: HomeAssistant
): Promise<{ states: Record<string, PointerCheckState> }> =>
  hass.callWS({ type: "backup/pointer/check" });

export const bringBackBackup = (
  hass: HomeAssistant,
  backupId: string
): Promise<{ agent_id: string }> =>
  hass.callWS({ type: "backup/pointer/bring_back", backup_id: backupId });

export const subscribeBackupPointerTransfer = (
  hass: HomeAssistant,
  callback: (transfer: PointerTransfer | null) => void
): Promise<UnsubscribeFunc> =>
  hass.connection.subscribeMessage<{ transfer: PointerTransfer | null }>(
    (event) => callback(event.transfer),
    { type: "backup/pointer/subscribe" }
  );

/** Whole here, a pointer, a pointer whose registry copy is missing, or not checked. */
export type PointerRowState = "whole" | "pointer" | "missing" | "elsewhere";

export interface PointerRow {
  backup_id: string;
  name: string;
  date: string;
  state: PointerRowState;
  /** Size of the copy here, or of the registry copy for a pointer. */
  size: number;
  pointer?: BackupPointer;
  kept?: PointerKept;
  /** True when the backup is also in a place that can be read back in full. */
  in_registry: boolean;
}

const localSize = (backup: BackupContent): number | undefined => {
  const local = Object.entries(backup.agents).find(([id]) => isLocalAgent(id));
  return local?.[1].size;
};

/**
 * One row per backup, newest first. A pointer whose backup no place lists
 * any more still gets its row, so a missing registry copy is shown, never
 * dropped. A pointer is never counted as a copy here.
 */
export const pointerRows = (
  backups: BackupContent[],
  info: Pick<BackupPointerInfo, "pointers" | "kept" | "places">
): PointerRow[] => {
  const places = new Set(info.places.map((place) => place.agent_id));
  const rows: PointerRow[] = [];
  const seen = new Set<string>();
  for (const backup of backups) {
    seen.add(backup.backup_id);
    const pointer = info.pointers[backup.backup_id];
    const here = localSize(backup);
    const inRegistry = Object.keys(backup.agents).some((id) => places.has(id));
    let state: PointerRowState;
    if (here !== undefined) {
      state = "whole";
    } else if (pointer) {
      state = pointer.check_state === "missing" ? "missing" : "pointer";
    } else {
      state = "elsewhere";
    }
    rows.push({
      backup_id: backup.backup_id,
      name: backup.name,
      date: backup.date,
      state,
      size: here ?? pointer?.size ?? 0,
      pointer: here === undefined ? pointer : undefined,
      kept: here !== undefined ? info.kept[backup.backup_id] : undefined,
      in_registry: inRegistry,
    });
  }
  for (const pointer of Object.values(info.pointers)) {
    if (seen.has(pointer.backup_id)) {
      continue;
    }
    rows.push({
      backup_id: pointer.backup_id,
      name: pointer.name,
      date: pointer.date,
      state: "missing",
      size: pointer.size,
      pointer,
      in_registry: false,
    });
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date));
};

/** Only rows that matter on this page: whole here, or a pointer. */
export const rowsOnThisSystem = (rows: PointerRow[]): PointerRow[] =>
  rows.filter((row) => row.state !== "elsewhere");

/** A pointer can be restored only while its registry copy was last found. */
export const canRestore = (row: PointerRow): boolean =>
  row.state === "pointer" && !!row.pointer?.restorable;

/** Reasons the page has wording for; anything else reads as "unknown". */
export const KEPT_REASONS = [
  "newest_kept_whole",
  "going_back_not_finished",
  "no_registry_copy",
  "registry_copy_differs",
  "local_copy_unreadable",
  "local_copy_not_removed",
  "failed",
  "no_answer",
  "timed_out",
  "missing",
  "unknown",
] as const;

export type KeptReason = (typeof KEPT_REASONS)[number];

export const keptReason = (reason: string | undefined | null): KeptReason =>
  (KEPT_REASONS as readonly string[]).includes(reason ?? "")
    ? (reason as KeptReason)
    : "unknown";

/** True when the reason is a failed or unanswered check, not a choice. */
export const isCheckProblem = (reason: KeptReason): boolean =>
  !["newest_kept_whole", "going_back_not_finished"].includes(reason);

/** Failure reasons of a bring back the page has wording for. */
export const TRANSFER_REASONS = [
  "registry_copy_missing",
  "place_not_loaded",
  "check_failed",
  "no_answer",
  "timed_out",
  "failed",
  "disk_error",
  "not_a_pointer",
  "unknown",
] as const;

export type TransferReason = (typeof TRANSFER_REASONS)[number];

export const transferReason = (
  reason: string | undefined | null
): TransferReason =>
  (TRANSFER_REASONS as readonly string[]).includes(reason ?? "")
    ? (reason as TransferReason)
    : "unknown";

/** The reason code of a failed websocket call, for the page's wording. */
export const pointerErrorReason = (err: unknown): TransferReason =>
  transferReason(
    err && typeof err === "object" ? (err as { code?: string }).code : null
  );

/** Whole percent done, never above 100, 0 when the size is not known. */
export const transferPercent = (
  transfer: Pick<PointerTransfer, "bytes_done" | "bytes_total">
): number =>
  transfer.bytes_total > 0
    ? Math.min(
        100,
        Math.floor((transfer.bytes_done / transfer.bytes_total) * 100)
      )
    : 0;

/** Which part of the plain warning to show: none, some or only pointers. */
export const pointerRisk = (
  summary: Pick<PointerSummary, "pointers" | "whole_here">
): "none" | "some" | "all" =>
  summary.pointers === 0 ? "none" : summary.whole_here === 0 ? "all" : "some";
