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
  /** A short technical name of a failure, such as "EACCES". */
  detail?: string | null;
}

/** A pass that turns backups into pointers: due, running, or the last one. */
export interface PointerPass {
  running: boolean;
  /** When a pass that is waiting will start, as an ISO time. */
  due: string | null;
  started: string | null;
  finished: string | null;
  /** How many backups the last pass made pointers. */
  made: number;
  /** How many backups ended with each outcome at the last pass. */
  outcomes: Record<string, number>;
}

/** What the subscription sends whenever a bring back or a pass changes. */
export interface PointerEvent {
  transfer: PointerTransfer | null;
  pass?: PointerPass;
  /** Goes up whenever the pointers or the setting change. */
  revision?: number;
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
  pass?: PointerPass;
  revision?: number;
  places: { agent_id: string; name: string }[];
  local_agent_ids: string[];
  /**
   * Places that did not answer when the backups were listed, or did not answer
   * in time. A pointer whose backup is not listed is then unknown, not missing.
   */
  unreachable?: string[];
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

/** Hears every change of a bring back, of a pass and of the pointers. */
export const subscribeBackupPointerTransfer = (
  hass: HomeAssistant,
  callback: (event: PointerEvent) => void
): Promise<UnsubscribeFunc> =>
  hass.connection.subscribeMessage<PointerEvent>(callback, {
    type: "backup/pointer/subscribe",
  });

/** One part of the result of a pass: an outcome and how many backups had it. */
export interface PassResultPart {
  reason: KeptReason;
  count: number;
}

/**
 * The result of a pass for the page's result line: how many backups became
 * pointers, and for the rest, why, most common first. Outcomes the page has
 * no words for are counted as "unknown".
 */
export const passResult = (
  outcomes: Record<string, number | string>
): { made: number; kept: PassResultPart[] } => {
  const counts = new Map<KeptReason, number>();
  let made = 0;
  for (const [key, value] of Object.entries(outcomes)) {
    // A pass run from the page returns one outcome per backup; the
    // subscription sends counts per outcome.
    const [outcome, count] =
      typeof value === "number" ? [key, value] : [value, 1];
    if (outcome === "pointer") {
      made += count;
      continue;
    }
    const reason = keptReason(outcome);
    counts.set(reason, (counts.get(reason) ?? 0) + count);
  }
  const kept = [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
  return { made, kept };
};

/**
 * Whole here, a pointer, a pointer whose registry copy is missing, a pointer
 * whose registry could not be reached just now, or a backup not on this system.
 */
export type PointerRowState =
  "whole" | "pointer" | "missing" | "unknown" | "elsewhere";

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
 * dropped. When its registry is not loaded or did not answer, the row is
 * unknown rather than missing: the copy may well still be there. A pointer is
 * never counted as a copy here.
 */
export const pointerRows = (
  backups: BackupContent[],
  info: Pick<BackupPointerInfo, "pointers" | "kept" | "places"> &
    Partial<Pick<BackupPointerInfo, "unreachable">>
): PointerRow[] => {
  const places = new Set(info.places.map((place) => place.agent_id));
  const unreachable = new Set(info.unreachable ?? []);
  const reached = (agentId: string): boolean =>
    places.has(agentId) && !unreachable.has(agentId);
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
      state:
        pointer.check_state === "missing" || reached(pointer.agent_id)
          ? "missing"
          : "unknown",
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

/**
 * A pointer can be restored unless its registry copy was found missing. When
 * the registry could not be reached, trying again is still offered.
 */
export const canRestore = (row: PointerRow): boolean =>
  (row.state === "pointer" || row.state === "unknown") &&
  !!row.pointer?.restorable;

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
  "registry_refused",
  "check_failed",
  "no_answer",
  "timed_out",
  "failed",
  "disk_full",
  "disk_refused",
  "disk_error",
  "not_a_pointer",
  "not_local",
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
