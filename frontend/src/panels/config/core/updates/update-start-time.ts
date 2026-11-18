/**
 * Where the start time of a running update comes from. A time that is only the
 * moment a page first noticed the update is never shown as a start: a page
 * opened in the middle of an update says the start is unknown instead.
 */

export type StartSource = "run" | "job" | "queue" | "seen" | "unknown";

export interface StartSources {
  /** An install this page started itself. */
  runStartedAt?: number;
  /** When the Supervisor created the job of this update. */
  jobCreated?: string | null;
  /** The start stored with the queue step, kept across a reload. */
  queueStartedAt?: number | null;
  /** When this page saw the update turn from idle to running. */
  seenTurnedOnAt?: number;
}

export interface ResolvedStart {
  startedAt?: number;
  source: StartSource;
}

/** The Supervisor's job creation time in milliseconds, if it is a real past time. */
export const jobStartMs = (
  created: string | null | undefined,
  now: number
): number | undefined => {
  if (!created) {
    return undefined;
  }
  const time = Date.parse(created);
  return Number.isFinite(time) && time <= now + 60_000 ? time : undefined;
};

/** The best known start, in order: this page's own install, the job, the queue, what the page saw. */
export const resolveStart = (
  sources: StartSources,
  now: number
): ResolvedStart => {
  if (typeof sources.runStartedAt === "number") {
    return { startedAt: sources.runStartedAt, source: "run" };
  }
  const job = jobStartMs(sources.jobCreated, now);
  if (job !== undefined) {
    return { startedAt: job, source: "job" };
  }
  if (typeof sources.queueStartedAt === "number") {
    return { startedAt: sources.queueStartedAt, source: "queue" };
  }
  if (typeof sources.seenTurnedOnAt === "number") {
    return { startedAt: sources.seenTurnedOnAt, source: "seen" };
  }
  return { source: "unknown" };
};
