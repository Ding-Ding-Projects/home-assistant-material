import type { RepairsIssue } from "../../data/repairs";

/** How a repair that did not go through is described to the person. */
export type RepairFailureKind = "failed" | "failed_broke";

/** A stable name for one issue, as the instance reports it. */
export const issueKey = (
  issue: Pick<RepairsIssue, "domain" | "issue_id">
): string => `${issue.domain}:${issue.issue_id}`;

/**
 * Decides which sentence a failed repair gets. A repair "broke something"
 * when issues exist after the attempt that did not exist before it started:
 * the repair did not fix its own issue and the instance now reports more.
 * Without a list from before, or when the lists cannot be compared, it is a
 * plain failure: the stronger sentence is never guessed.
 */
export const classifyRepairFailure = (
  before: readonly string[] | undefined,
  after: readonly string[] | undefined
): RepairFailureKind => {
  if (!before || !after) {
    return "failed";
  }
  const known = new Set(before);
  return after.some((key) => !known.has(key)) ? "failed_broke" : "failed";
};
