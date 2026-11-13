/**
 * Pure rules for following an app install, update, rebuild or uninstall.
 * Nothing here talks to the server: it turns the Supervisor's job events into
 * the state a progress view shows.
 *
 * Where the numbers come from: the Supervisor sends a `job` event each time a
 * job changes, with its name, the app's slug as `reference`, a `progress`
 * between 0 and 100, a `stage` while an image is pulled ("Downloading",
 * "Extracting", "Pull complete"), a `done` flag and a list of `errors`. The
 * pull of the image reports its progress through the job of the install or
 * update itself. Nothing reports layers, so none are shown.
 *
 * Rules kept for every caller:
 * - A percentage is shown only when the Supervisor reported one. A job that
 *   has not said anything yet, and a job that never reports (uninstall,
 *   rebuild), shows no percentage.
 * - A progress value never goes down, so an event that arrives late cannot
 *   move the bar back.
 * - A finished run stays finished: later events change nothing.
 */

export type AppJobKind = "install" | "update" | "rebuild" | "uninstall";

export type AppJobPhase =
  "preparing" | "pulling" | "finishing" | "working" | "done" | "failed";

/** An error as the Supervisor lists it on a job. */
export interface SupervisorJobErrorData {
  type?: string | null;
  message?: string | null;
  stage?: string | null;
  error_key?: string | null;
}

/** A job as the Supervisor sends it in a `job` event. */
export interface SupervisorJobData {
  name?: string | null;
  reference?: string | null;
  uuid: string;
  progress?: number | null;
  stage?: string | null;
  done?: boolean | null;
  parent_id?: string | null;
  errors?: SupervisorJobErrorData[] | null;
  created?: string | null;
}

const MANAGER_JOB =
  /^(?:app|addon)_manager_(install|update|rebuild|uninstall)$/;

/** The kind of run a job name stands for, undefined for any other job. */
export const appJobKindOf = (
  name: string | null | undefined
): AppJobKind | undefined => {
  const match = name ? MANAGER_JOB.exec(name) : null;
  return match ? (match[1] as AppJobKind) : undefined;
};

/** Steps shown for a run that pulls an image, in the order they happen. */
export const APP_JOB_STEPS: readonly AppJobPhase[] = [
  "preparing",
  "pulling",
  "finishing",
];

const STEP_RANK: Record<string, number> = {
  preparing: 0,
  pulling: 1,
  finishing: 2,
};

/** True for the kinds that pull an image and so report a stage. */
export const kindPullsImage = (kind: AppJobKind): boolean =>
  kind === "install" || kind === "update";

export interface AppJobRun {
  slug: string;
  kind: AppJobKind;
  /** The job being followed, absent until the first event names it. */
  uuid?: string;
  startedAt: number;
  finishedAt?: number;
  /** Last progress the Supervisor reported, absent while it reported none. */
  progress?: number;
  /** The most advanced stage reported, as the Supervisor wrote it. */
  stage?: string | null;
  /** Highest step reached, so a late event cannot move the steps back. */
  rank: number;
  done: boolean;
  failed: boolean;
  /** The Supervisor's own words for a failure. */
  errorMessage?: string;
  /** The call that started this run is still waiting for an answer. */
  callPending: boolean;
  /** The error the call returned, when it really failed. */
  callError?: string;
}

export const createRun = (
  slug: string,
  kind: AppJobKind,
  now: number,
  callPending = false
): AppJobRun => ({
  slug,
  kind,
  startedAt: now,
  rank: 0,
  done: false,
  failed: false,
  callPending,
});

/** What a stage the Supervisor reports means for the steps. */
export const stageRank = (stage: string | null | undefined): number => {
  switch ((stage ?? "").toLowerCase()) {
    case "downloading":
    case "extracting":
      return STEP_RANK.pulling;
    case "pull complete":
      return STEP_RANK.finishing;
    default:
      return -1;
  }
};

/** The order the stage words come in, so a late word cannot replace a later one. */
const stageOrder = (stage: string | null | undefined): number =>
  ["downloading", "extracting", "pull complete"].indexOf(
    (stage ?? "").toLowerCase()
  ) + 1;

/**
 * How a job event relates to a run: the run's own job, a later job for the
 * same app and kind (a retry), or one that is not the run's at all.
 */
export const relateJob = (
  run: AppJobRun,
  job: SupervisorJobData
): "same" | "newer" | "other" => {
  const kind = appJobKindOf(job.name);
  if (kind !== run.kind) {
    return "other";
  }
  if (run.uuid === undefined) {
    // An uninstall has no app named on it, so the first one that shows up
    // after the call was sent is taken as the run's own.
    if (job.reference === run.slug || (!job.reference && run.callPending)) {
      return "same";
    }
    return "other";
  }
  if (job.uuid === run.uuid) {
    return "same";
  }
  return job.reference === run.slug ? "newer" : "other";
};

const errorMessageOf = (job: SupervisorJobData): string | undefined => {
  const messages = (job.errors ?? [])
    .map((error) => error.message?.trim())
    .filter((message): message is string => !!message);
  return messages[0];
};

/** True when a progress value is a real report, not the default zero. */
const reported = (job: SupervisorJobData): boolean =>
  typeof job.progress === "number" &&
  Number.isFinite(job.progress) &&
  (job.progress > 0 || !!job.stage || job.done === true);

/**
 * The run after one job event. Events can arrive late or twice: progress and
 * the stage only move forward, and a finished run is returned unchanged.
 */
export const applyJobEvent = (
  run: AppJobRun,
  job: SupervisorJobData,
  now: number
): AppJobRun => {
  if (run.done) {
    return run;
  }
  const next: AppJobRun = { ...run, uuid: run.uuid ?? job.uuid };
  if (reported(job)) {
    const value = Math.min(100, Math.max(0, job.progress as number));
    next.progress = Math.max(run.progress ?? 0, value);
  }
  let rank = stageRank(job.stage);
  // Progress of an install or update is the progress of pulling the image, so
  // a reported value means the pull has begun even when no stage was named.
  if (reported(job) && kindPullsImage(run.kind) && rank < STEP_RANK.pulling) {
    rank = Math.max(rank, STEP_RANK.pulling);
  }
  if (rank > run.rank) {
    next.rank = rank;
  }
  if (
    job.stage &&
    (!run.stage || stageOrder(job.stage) >= stageOrder(run.stage))
  ) {
    next.stage = job.stage;
  }
  const message = errorMessageOf(job);
  if (message) {
    next.errorMessage = message;
  }
  if (job.done === true) {
    next.done = true;
    next.finishedAt = now;
    next.callPending = false;
    if ((job.errors ?? []).length > 0) {
      next.failed = true;
      next.errorMessage = message ?? next.errorMessage;
    } else {
      next.progress = 100;
      next.rank = kindPullsImage(run.kind) ? STEP_RANK.finishing : next.rank;
    }
  }
  return next;
};

/**
 * The run after the call that started it answered. A call that failed ends
 * the run with the Supervisor's message; one that succeeded leaves the end to
 * the job's own `done` event, because the answer can come first.
 */
export const applyCallResult = (
  run: AppJobRun,
  error: string | undefined,
  now: number
): AppJobRun => {
  if (run.done) {
    return { ...run, callPending: false };
  }
  if (error) {
    return {
      ...run,
      callPending: false,
      callError: error,
      done: true,
      failed: true,
      finishedAt: now,
      errorMessage: run.errorMessage ?? error,
    };
  }
  return { ...run, callPending: false };
};

export type AppJobEnd = "running" | "done" | "failed";

export interface AppJobStep {
  id: AppJobPhase;
  state: "done" | "current" | "pending";
}

export interface AppJobView {
  end: AppJobEnd;
  phase: AppJobPhase;
  /** A whole percentage, only when the Supervisor reported one. */
  percent?: number;
  /** Steps for a run that pulls an image, empty for the other kinds. */
  steps: AppJobStep[];
  /** The step that was under way when a run failed, for runs with steps. */
  failedStep?: AppJobPhase;
  elapsedMs: number;
  errorMessage?: string;
  /** A stage the Supervisor named that is not one of the known ones. */
  unknownStage?: string;
}

/** The phase a run is in, from what has been reported. */
export const derivePhase = (run: AppJobRun): AppJobPhase => {
  if (run.failed) {
    return "failed";
  }
  if (run.done) {
    return "done";
  }
  if (!kindPullsImage(run.kind)) {
    return run.progress === undefined && !run.uuid ? "preparing" : "working";
  }
  if (run.rank >= STEP_RANK.finishing) {
    return "finishing";
  }
  if (run.rank === STEP_RANK.pulling) {
    return "pulling";
  }
  return "preparing";
};

export const deriveAppJobView = (run: AppJobRun, now: number): AppJobView => {
  const phase = derivePhase(run);
  const end: AppJobEnd = run.failed ? "failed" : run.done ? "done" : "running";
  const steps: AppJobStep[] = [];
  if (kindPullsImage(run.kind)) {
    const current =
      end === "failed" ? run.rank : (STEP_RANK[phase] ?? STEP_RANK.finishing);
    APP_JOB_STEPS.forEach((id, index) => {
      steps.push({
        id,
        state:
          end === "done" || index < current
            ? "done"
            : index === current && end === "running"
              ? "current"
              : "pending",
      });
    });
  }
  const unknownStage = run.stage && end === "running" ? run.stage : undefined;
  return {
    end,
    phase,
    percent: run.progress === undefined ? undefined : Math.floor(run.progress),
    steps,
    failedStep:
      end === "failed" && steps.length
        ? APP_JOB_STEPS[Math.min(run.rank, APP_JOB_STEPS.length - 1)]
        : undefined,
    elapsedMs: Math.max(0, (run.finishedAt ?? now) - run.startedAt),
    errorMessage: run.failed ? run.errorMessage : undefined,
    unknownStage,
  };
};

/** "1:05", or "1:02:03" past an hour. */
export const formatElapsed = (ms: number): string => {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const two = (value: number) => String(value).padStart(2, "0");
  return hours
    ? `${hours}:${two(minutes)}:${two(seconds)}`
    : `${minutes}:${two(seconds)}`;
};

/**
 * The text lines the job's own events add to the terminal, comparing the run
 * before and after an event. Only what changed is described.
 */
export interface JobLineText {
  level: "info" | "error";
  key: "started" | "stage" | "progress" | "finished" | "failed" | "call_failed";
  values: Record<string, string | number>;
}

export const describeRunChange = (
  before: AppJobRun,
  after: AppJobRun
): JobLineText[] => {
  const lines: JobLineText[] = [];
  if (after.stage && after.stage !== before.stage) {
    lines.push({ level: "info", key: "stage", values: { stage: after.stage } });
  }
  if (
    after.progress !== undefined &&
    !after.done &&
    Math.floor(after.progress) !== Math.floor(before.progress ?? -1)
  ) {
    lines.push({
      level: "info",
      key: "progress",
      values: { percent: Math.floor(after.progress) },
    });
  }
  if (after.done && !before.done) {
    if (after.failed) {
      lines.push({
        level: "error",
        key: after.callError && !after.uuid ? "call_failed" : "failed",
        values: { message: after.errorMessage ?? "" },
      });
    } else {
      lines.push({ level: "info", key: "finished", values: {} });
    }
  }
  return lines;
};
