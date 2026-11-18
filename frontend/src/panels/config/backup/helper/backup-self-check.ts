import { modeText } from "../../../../common/language-mode/language-mode";
import type {
  BackupContent,
  BackupSelfCheck,
  BackupSelfCheckResult,
} from "../../../../data/backup";
import type { HomeAssistant } from "../../../../types";

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

/**
 * A readable sentence made from a reason code the interface has no wording
 * for: "some_new_reason" becomes "Some new reason." The raw code is never
 * shown to a person.
 */
export const readableReason = (code: string): string => {
  const text = code
    .replace(/[_\-\s]+/g, " ")
    .trim()
    .toLowerCase();
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}.` : "";
};

/** The wording of a self-check reason code, in the chosen language mode. */
export const selfCheckReasonText = (
  hass: Pick<HomeAssistant, "localize">,
  reason: string,
  parts = ""
): string => {
  const key = `ui.panel.config.backup.self_check.reasons.${reason}`;
  return hass.localize(key as any, { parts })
    ? modeText(hass.localize, key as any, { parts })
    : readableReason(reason);
};
