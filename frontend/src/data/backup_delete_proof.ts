import type { HomeAssistant } from "../types";
import type { BackupContent, BackupDeleteProofMark } from "./backup";
import { computeBackupSize } from "./backup";

/**
 * Delete proof backups. While a backup is delete proof, Home Assistant refuses
 * every way of deleting it: the Delete button, deleting several, automatic
 * cleaning up by count or by age, and the cleanup after an update. The rule is
 * held by the backend; this module only reads and changes the mark and turns
 * the results into what the pages show.
 *
 * Turning the mark on needs nothing more. Turning it off is sent with
 * `confirmed: true` only after the two keys and the slider; the backend
 * refuses a request without it.
 */

export const DELETE_PROOF_ERROR = "backup_delete_proof";
export const DELETE_PROOF_CONFIRMATION_ERROR = "confirmation_required";
export const DELETE_PROOF_UNREADABLE_ERROR = "delete_proof_records_unreadable";

export interface BackupDeleteProofInfo {
  /** False when the stored marks cannot be read; nothing can be deleted then. */
  readable: boolean;
  /** Every mark, including those whose backup is in no location any more. */
  marks: Record<string, BackupDeleteProofMark>;
}

export const fetchBackupDeleteProofInfo = (
  hass: HomeAssistant
): Promise<BackupDeleteProofInfo> =>
  hass.callWS({ type: "backup/delete_proof/info" });

export const setBackupDeleteProof = (
  hass: HomeAssistant,
  backupId: string,
  deleteProof: boolean,
  confirmed = false
): Promise<{
  backup_id: string;
  delete_proof: BackupDeleteProofMark | null;
}> =>
  hass.callWS({
    type: "backup/delete_proof/set",
    backup_id: backupId,
    delete_proof: deleteProof,
    confirmed,
  });

/**
 * Marks one backup delete proof. Needs no confirmation, so it can be offered
 * as a single tap, for example on the card shown when the backup made before
 * going back to an earlier build has finished. Resolves with the mark.
 */
export const markBackupDeleteProof = async (
  hass: HomeAssistant,
  backupId: string
): Promise<BackupDeleteProofMark | null> =>
  (await setBackupDeleteProof(hass, backupId, true)).delete_proof;

export const isDeleteProof = (backup: Pick<BackupContent, "delete_proof">) =>
  !!backup.delete_proof;

export const isDeleteProofError = (err: unknown): boolean =>
  !!err &&
  typeof err === "object" &&
  [DELETE_PROOF_ERROR, DELETE_PROOF_UNREADABLE_ERROR].includes(
    (err as { code?: string }).code ?? ""
  );

export interface DeleteProofSummary {
  /** Delete proof backups present in at least one location. */
  count: number;
  /** Their total size in bytes, each backup counted once. */
  size: number;
  /** Marks whose backup is in no location any more. */
  missingIds: string[];
}

/**
 * Counts the delete proof backups and their size. A mark whose backup no
 * location reports is listed as missing: a file removed outside Home
 * Assistant, for example in a cloud drive's own app, cannot be protected.
 */
export const summarizeDeleteProof = (
  backups: BackupContent[],
  marks?: Record<string, BackupDeleteProofMark>
): DeleteProofSummary => {
  const marked = backups.filter(isDeleteProof);
  const present = new Set(backups.map((backup) => backup.backup_id));
  return {
    count: marked.length,
    size: marked.reduce((sum, backup) => sum + computeBackupSize(backup), 0),
    missingIds: marks
      ? Object.keys(marks)
          .filter((id) => !present.has(id))
          .sort()
      : [],
  };
};

export interface BulkDeleteResultCounts {
  deleted: number;
  /** Skipped before sending, or refused by the backend, as delete proof. */
  keptDeleteProof: number;
}

/**
 * The counts for the line shown after deleting several backups, such as
 * "2 deleted. 1 kept because it is delete proof." A backup marked after the
 * list was loaded is refused by the backend, and counts as kept too.
 */
export const bulkDeleteResultCounts = (
  deletedCount: number,
  skippedDeleteProof: number,
  failedErrors: unknown[]
): BulkDeleteResultCounts => {
  const refused = failedErrors.filter(isDeleteProofError).length;
  return {
    deleted: deletedCount,
    keptDeleteProof: skippedDeleteProof + refused,
  };
};

/**
 * "18 Nov 21:58": day, short month, and the time on a 24-hour clock, in the
 * given time zone.
 */
export const formatMarkedTime = (
  iso: string,
  language: string,
  timeZone?: string
): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const day = new Intl.DateTimeFormat(language, {
    day: "2-digit",
    month: "short",
    timeZone,
  }).format(date);
  const time = new Intl.DateTimeFormat(language, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(date);
  return `${day} ${time}`;
};
