/**
 * Testing and running versions of automations.
 *
 * A test never changes anything in the house: it asks the server whether the
 * version loads, and whether its conditions pass at this moment. Running a
 * version performs its actions for real, so versions that touch locks,
 * doors or alarms can be left out of a run of many.
 */

/** A version of an automation, or its current uncommitted state. */
export interface VersionRef {
  automationId: string;
  alias: string;
  /** The commit, or `working` for changes that are not committed yet. */
  sha: string;
}

export const WORKING = "working";

export const versionKey = (ref: Pick<VersionRef, "automationId" | "sha">) =>
  `${ref.automationId}@${ref.sha}`;

export type CheckState = "pass" | "fail" | "none";

export interface VersionTestResult {
  /** Whether triggers, conditions and actions are valid. */
  loads: CheckState;
  /** Whether the conditions pass right now. `none` when there are none. */
  conditions: CheckState;
  /** Why it failed, when it did. */
  detail?: string;
  /** Milliseconds since 1970. */
  testedAt: number;
}

export const isFailing = (result: VersionTestResult | undefined): boolean =>
  result?.loads === "fail" || result?.conditions === "fail";

/**
 * Domains whose actions should not run unattended: a wrong version could
 * unlock a door or disarm an alarm.
 */
export const GUARDED_DOMAINS = [
  "lock",
  "cover",
  "alarm_control_panel",
  "valve",
  "siren",
] as const;

const ACTION_KEYS = ["action", "service"];

/**
 * The guarded domains a list of actions touches, however deeply the action
 * is nested (inside a choose, a repeat, an if, a parallel block).
 */
export const guardedDomains = (actions: unknown): string[] => {
  const found = new Set<string>();
  const visit = (node: unknown, depth: number) => {
    if (depth > 40 || node === null || typeof node !== "object") {
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item) => visit(item, depth + 1));
      return;
    }
    const record = node as Record<string, unknown>;
    ACTION_KEYS.forEach((key) => {
      const value = record[key];
      if (typeof value === "string") {
        const domain = value.split(".")[0];
        if ((GUARDED_DOMAINS as readonly string[]).includes(domain)) {
          found.add(domain);
        }
      }
    });
    // An action that targets a guarded entity directly, whatever its name.
    const target = record.target ?? record.entity_id;
    const ids =
      typeof target === "string"
        ? [target]
        : Array.isArray(target)
          ? target
          : target && typeof target === "object"
            ? [(target as Record<string, unknown>).entity_id].flat()
            : [];
    ids.forEach((id) => {
      if (typeof id === "string") {
        const domain = id.split(".")[0];
        if ((GUARDED_DOMAINS as readonly string[]).includes(domain)) {
          found.add(domain);
        }
      }
    });
    Object.values(record).forEach((value) => visit(value, depth + 1));
  };
  visit(actions, 0);
  return [...found].sort();
};

export interface BulkSummary {
  total: number;
  done: number;
  passed: number;
  failed: number;
}

export const summarizeResults = (
  refs: readonly VersionRef[],
  results: Readonly<Record<string, VersionTestResult | undefined>>
): BulkSummary => {
  const summary: BulkSummary = {
    total: refs.length,
    done: 0,
    passed: 0,
    failed: 0,
  };
  refs.forEach((ref) => {
    const result = results[versionKey(ref)];
    if (!result) {
      return;
    }
    summary.done++;
    if (isFailing(result)) {
      summary.failed++;
    } else {
      summary.passed++;
    }
  });
  return summary;
};

/**
 * Runs a job for each item, a few at a time, and stops handing out new
 * items once `shouldStop` says so. Jobs already started are left to finish.
 */
export const runLimited = async <T>(
  items: readonly T[],
  limit: number,
  job: (item: T) => Promise<void>,
  shouldStop: () => boolean = () => false
): Promise<void> => {
  let next = 0;
  const worker = async () => {
    while (next < items.length && !shouldStop()) {
      const item = items[next++];
      // One at a time within a worker is the point of the limit.
      // eslint-disable-next-line no-await-in-loop
      await job(item);
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker)
  );
};
