import type { BulkPreviewItem } from "../../../components/bulk/bulk-selection";
import type { BackupContent } from "../../../data/backup";
import { computeBackupSize } from "../../../data/backup";

/**
 * The rules behind deleting several backups at once, kept free of any element
 * so they can be checked on their own. A deleted backup cannot be brought
 * back, so the preview names what each deletion costs: the most recent backup,
 * and a backup that is the only copy because it sits in one location.
 *
 * Nothing here reads, shows or sends an encryption key. Only the id, name,
 * date, size and the locations of a backup are used.
 */

export type BackupSkipReason = "locked" | "creating" | "missing";

/** What the page knows about backups that must not be deleted right now. */
export interface BackupBulkState {
  /** Backups the instance reports as locked. */
  lockedIds?: ReadonlySet<string>;
  /** Backups that are still being created. */
  creatingIds?: ReadonlySet<string>;
}

export interface BackupDeleteEntry {
  backupId: string;
  name: string;
  date: string;
  size: number;
  agentIds: string[];
  /** The most recent backup of all the backups, not only of the selection. */
  newest: boolean;
  /** The backup exists in one location only, so deleting it loses the data. */
  onlyCopy: boolean;
}

export interface BackupSkipEntry {
  backupId: string;
  name: string;
  reason: BackupSkipReason;
}

export interface BackupDeletePlan {
  /** Backups that will be deleted, most recent first. */
  deletable: BackupDeleteEntry[];
  /** Selected backups that are left alone, with the reason. */
  skipped: BackupSkipEntry[];
}

const timeOf = (backup: Pick<BackupContent, "date">): number => {
  const time = new Date(backup.date).getTime();
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
};

/** The id of the most recent backup in the whole list, if there is one. */
export const newestBackupId = (
  backups: BackupContent[]
): string | undefined => {
  let newest: BackupContent | undefined;
  backups.forEach((backup) => {
    if (!newest || timeOf(backup) > timeOf(newest)) {
      newest = backup;
    }
  });
  return newest?.backup_id;
};

/** A backup stored in exactly one location has no other copy. */
export const isOnlyCopy = (backup: Pick<BackupContent, "agents">): boolean =>
  Object.keys(backup.agents).length === 1;

/**
 * Sorts the selection into the backups to delete and the ones to skip.
 *
 * `allBackups` is every backup the instance has, not only the rows the table
 * shows, so a selected backup that a search or filter hides is handled like any
 * other and the most recent backup is found among all of them.
 */
export const planBackupDelete = (
  selectedIds: string[],
  allBackups: BackupContent[],
  state: BackupBulkState = {}
): BackupDeletePlan => {
  const byId = new Map(allBackups.map((backup) => [backup.backup_id, backup]));
  const newestId = newestBackupId(allBackups);
  const deletable: BackupDeleteEntry[] = [];
  const skipped: BackupSkipEntry[] = [];

  [...new Set(selectedIds)].forEach((id) => {
    const backup = byId.get(id);
    if (!backup) {
      skipped.push({ backupId: id, name: id, reason: "missing" });
      return;
    }
    if (state.creatingIds?.has(id)) {
      skipped.push({
        backupId: id,
        name: backup.name,
        reason: "creating",
      });
      return;
    }
    if (state.lockedIds?.has(id)) {
      skipped.push({ backupId: id, name: backup.name, reason: "locked" });
      return;
    }
    deletable.push({
      backupId: id,
      name: backup.name,
      date: backup.date,
      size: computeBackupSize(backup),
      agentIds: Object.keys(backup.agents),
      newest: id === newestId,
      onlyCopy: isOnlyCopy(backup),
    });
  });

  deletable.sort((a, b) => timeOf(b) - timeOf(a));
  return { deletable, skipped };
};

/**
 * The preview lines of one backup that will be deleted: a line for the backup
 * itself, then a separate warning for each cost that cannot be undone (it is
 * the most recent backup, it is the only copy). The warnings are their own
 * lines so that they are drawn as warnings and never as a safe line.
 */
export const backupPreviewItems = (
  entry: Pick<BackupDeleteEntry, "newest" | "onlyCopy">,
  text: { entry: string; newest: string; onlyCopy: string }
): BulkPreviewItem[] => {
  const items: BulkPreviewItem[] = [{ kind: "change", text: text.entry }];
  if (entry.newest) {
    items.push({ kind: "warning", text: text.newest });
  }
  if (entry.onlyCopy) {
    items.push({ kind: "warning", text: text.onlyCopy });
  }
  return items;
};

export interface BackupDeleteOutcome {
  deleted: string[];
  failed: { backupId: string; error: unknown }[];
}

/**
 * Pairs the ids that were sent with the results of `Promise.allSettled`, so a
 * partly failed delete says exactly which backups are gone and which are not.
 */
export const summarizeBackupDelete = (
  ids: string[],
  results: PromiseSettledResult<unknown>[]
): BackupDeleteOutcome => {
  const outcome: BackupDeleteOutcome = { deleted: [], failed: [] };
  ids.forEach((backupId, index) => {
    const result = results[index];
    if (result?.status === "fulfilled") {
      outcome.deleted.push(backupId);
    } else {
      outcome.failed.push({ backupId, error: result?.reason });
    }
  });
  return outcome;
};
