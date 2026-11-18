import type { SupervisorJobData } from "../../../../common/app-jobs/app-job-logic";
import type { ProgressKind } from "./update-progress-model";
import { jobNameMatches } from "./update-progress-model";

/**
 * A job as `/jobs/info` returns it: the tree is nested in `child_jobs` and the
 * children carry no `parent_id`. The `job` events carry `parent_id` and no
 * nesting. Both shapes have to be read the same way.
 */
export interface JobNode extends SupervisorJobData {
  child_jobs?: JobNode[];
}

/**
 * Adds every job of a nested tree to `into`, giving each child the id of its
 * parent so the tree can also be walked through `parent_id`, which is how the
 * events describe it.
 */
export const flattenJobTree = (
  jobs: readonly JobNode[],
  into: Map<string, JobNode>
): void => {
  const queue: JobNode[] = [...jobs];
  while (queue.length) {
    const job = queue.shift()!;
    const children = job.child_jobs ?? [];
    for (const child of children) {
      if (!child.parent_id) {
        child.parent_id = job.uuid;
      }
    }
    into.set(job.uuid, job);
    queue.push(...children);
  }
};

const isBackupJob = (job: SupervisorJobData): boolean =>
  (job.name ?? "").toLowerCase().includes("backup");

/** What the jobs of one update say. */
export interface UpdateJobFacts {
  /** The job of this update, the running one first. */
  root?: JobNode;
  /** The newest running job below it, preferring one that reports a stage. */
  leaf?: JobNode;
  /** A backup job below the update job is running right now. */
  backupRunning: boolean;
  /** A backup job exists below the update job: one was made for this update. */
  backupSeen: boolean;
  /**
   * When the update began, as the Supervisor reports it: the creation time of
   * the update job, or the earliest job below it when that is missing.
   */
  created?: string;
}

const earliest = (times: (string | null | undefined)[]): string | undefined => {
  let best: string | undefined;
  let bestMs = Infinity;
  for (const time of times) {
    const ms = time ? Date.parse(time) : NaN;
    if (Number.isFinite(ms) && ms < bestMs) {
      bestMs = ms;
      best = time!;
    }
  }
  return best;
};

/** The job tree of the update of this kind and what can be read from it. */
export const updateJobFacts = (
  jobs: ReadonlyMap<string, JobNode>,
  kind: ProgressKind,
  slug: string | undefined
): UpdateJobFacts => {
  let root: JobNode | undefined;
  for (const job of jobs.values()) {
    if (!jobNameMatches(kind, job.name)) {
      continue;
    }
    if (kind === "app" && slug && job.reference !== slug) {
      continue;
    }
    if (
      !root ||
      (root.done && !job.done) ||
      (!!root.done === !!job.done && (job.created ?? "") > (root.created ?? ""))
    ) {
      root = job;
    }
  }
  if (!root) {
    return { backupRunning: false, backupSeen: false };
  }
  const below: JobNode[] = [];
  const seen = new Set<string>([root.uuid]);
  const walk = (parent: string) => {
    for (const job of jobs.values()) {
      if (job.parent_id === parent && !seen.has(job.uuid)) {
        seen.add(job.uuid);
        below.push(job);
        walk(job.uuid);
      }
    }
  };
  walk(root.uuid);
  const running = below.filter((job) => !job.done);
  const leaf =
    [...running].reverse().find((job) => !!job.stage) ??
    running[running.length - 1];
  return {
    root,
    leaf,
    backupRunning: running.some(isBackupJob),
    backupSeen: below.some(isBackupJob),
    created: earliest([root.created, ...below.map((job) => job.created)]),
  };
};
