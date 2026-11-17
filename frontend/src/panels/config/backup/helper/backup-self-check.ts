import type {
  BackupContent,
  BackupSelfCheck,
  BackupSelfCheckResult,
} from "../../../../data/backup";

export interface SelfCheckSummary {
  state: "passed" | "failed" | "partial";
  // Checks that apply to this backup
  total: number;
  passed: number;
  failed: BackupSelfCheckResult[];
  couldNotCheck: BackupSelfCheckResult[];
  checks: BackupSelfCheckResult[];
}

/**
 * Reduce a stored self-check to what the pages show. Checks that do not
 * apply to the backup are left out of the counts and the list.
 */
export const summarizeSelfCheck = (
  selfCheck: BackupSelfCheck | undefined
): SelfCheckSummary | undefined => {
  if (!selfCheck || !Array.isArray(selfCheck.checks)) {
    return undefined;
  }
  const checks = selfCheck.checks.filter(
    (check) => check.status !== "not_applicable"
  );
  const failed = checks.filter((check) => check.status === "failed");
  const couldNotCheck = checks.filter(
    (check) => check.status === "could_not_check"
  );
  return {
    state: failed.length
      ? "failed"
      : couldNotCheck.length
        ? "partial"
        : "passed",
    total: checks.length,
    passed: checks.filter((check) => check.status === "passed").length,
    failed,
    couldNotCheck,
    checks,
  };
};

/**
 * The most recent backup that has a self-check result, with the summary of
 * that result.
 */
export const latestSelfChecked = (
  backups: BackupContent[]
): { backup: BackupContent; summary: SelfCheckSummary } | undefined => {
  const sorted = backups
    .filter((backup) => backup.self_check)
    .sort(
      (a, b) =>
        new Date(b.self_check!.checked_at).getTime() -
        new Date(a.self_check!.checked_at).getTime()
    );
  for (const backup of sorted) {
    const summary = summarizeSelfCheck(backup.self_check);
    if (summary) {
      return { backup, summary };
    }
  }
  return undefined;
};
