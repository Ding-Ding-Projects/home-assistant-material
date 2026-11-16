import type { PublicFetchResult } from "./public-json";
import { fetchPublicJson } from "./public-json";

/**
 * The state of the build pipeline for the next build, read from the public
 * GitHub pages of the project.
 *
 * Everything that decides what the "Update coming soon" card shows is a pure
 * function in this file, so it can be tested without a network.
 */

/** The one place that names the project's public repository. */
export const BUILD_REPOSITORY = "Ding-Ding-Projects/home-assistant-material";

/** How often a visible card refreshes while a build is active. */
export const REFRESH_INTERVAL_MS = 180_000;

/** How long the Refresh button stays disabled after a fetch. */
export const REFRESH_COOLDOWN_MS = 20_000;

const API = "https://api.github.com/repos";

export interface BuildRun {
  id: number;
  runNumber: number;
  status: string;
  conclusion: string | null;
  event: string;
  headSha: string;
  createdAt: string;
  startedAt: string;
  updatedAt: string;
  url: string;
  title: string;
}

export interface BuildJob {
  name: string;
  status: string;
  conclusion: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const text = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

const textOrNull = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

/** Reads the run list of the workflow. Entries that are not runs are ignored. */
export const parseRuns = (json: unknown): BuildRun[] => {
  if (!isRecord(json) || !Array.isArray(json.workflow_runs)) {
    return [];
  }
  const runs: BuildRun[] = [];
  for (const entry of json.workflow_runs) {
    if (
      !isRecord(entry) ||
      typeof entry.id !== "number" ||
      typeof entry.run_number !== "number" ||
      typeof entry.status !== "string"
    ) {
      continue;
    }
    runs.push({
      id: entry.id,
      runNumber: entry.run_number,
      status: entry.status,
      conclusion: textOrNull(entry.conclusion),
      event: text(entry.event),
      headSha: text(entry.head_sha),
      createdAt: text(entry.created_at),
      startedAt: text(entry.run_started_at, text(entry.created_at)),
      updatedAt: text(entry.updated_at),
      url: text(entry.html_url),
      title: text(entry.display_title),
    });
  }
  return runs;
};

/** Reads the job list of one run. Entries that are not jobs are ignored. */
export const parseJobs = (json: unknown): BuildJob[] => {
  if (!isRecord(json) || !Array.isArray(json.jobs)) {
    return [];
  }
  const jobs: BuildJob[] = [];
  for (const entry of json.jobs) {
    if (
      !isRecord(entry) ||
      typeof entry.name !== "string" ||
      typeof entry.status !== "string"
    ) {
      continue;
    }
    jobs.push({
      name: entry.name,
      status: entry.status,
      conclusion: textOrNull(entry.conclusion),
      startedAt: textOrNull(entry.started_at),
      completedAt: textOrNull(entry.completed_at),
    });
  }
  return jobs;
};

// ---------------------------------------------------------------- versions

const BUILD_PART = /^\d+$/;

/**
 * The build number at the end of a four part version such as
 * "2026.11.1.457". A version with fewer parts has no build number.
 */
export const parseBuildNumber = (
  version: string | null | undefined
): number | undefined => {
  const parts = (version ?? "").trim().split(".");
  if (parts.length < 4) {
    return undefined;
  }
  const last = parts[parts.length - 1];
  return BUILD_PART.test(last) ? Number(last) : undefined;
};

/** The version without its build number: "2026.11.1.457" gives "2026.11.1". */
export const coreBase = (
  version: string | null | undefined
): string | undefined => {
  if (parseBuildNumber(version) === undefined) {
    return undefined;
  }
  return (version as string).trim().split(".").slice(0, -1).join(".");
};

/** The Core version a build number turns into. */
export const coreVersionFor = (
  base: string | undefined,
  runNumber: number
): string | undefined => (base ? `${base}.${runNumber}` : undefined);

// ------------------------------------------------------------------- runs

const QUEUED = ["queued", "pending", "waiting", "requested"];

export const isQueuedStatus = (status: string): boolean =>
  QUEUED.includes(status);

export type RunChoice =
  | { kind: "active"; run: BuildRun; next?: BuildRun }
  | { kind: "waiting"; run: BuildRun }
  | { kind: "ready"; run: BuildRun }
  | { kind: "failed"; run: BuildRun }
  | { kind: "none" };

const newestFirst = (runs: BuildRun[]): BuildRun[] =>
  [...runs].sort((a, b) => b.runNumber - a.runNumber);

/**
 * Picks the run the card is about.
 *
 * 1. The newest run that is building. A run waiting behind it is returned as
 *    `next`.
 * 2. Otherwise the newest run that is waiting for its turn.
 * 3. Otherwise the newest finished run, when it is newer than the installed
 *    build: a good one is ready, a failed one is reported as failed. A
 *    cancelled run is never chosen, because a newer build replaced it.
 * 4. Otherwise nothing is on the way.
 */
export const chooseRun = (
  runs: BuildRun[],
  installedBuild: number | undefined
): RunChoice => {
  const sorted = newestFirst(runs);
  const active = sorted.find((run) => run.status === "in_progress");
  const queued = sorted.find((run) => isQueuedStatus(run.status));
  if (active) {
    return { kind: "active", run: active, next: queued };
  }
  if (queued) {
    return { kind: "waiting", run: queued };
  }
  const finished = sorted.find(
    (run) =>
      run.status === "completed" &&
      run.conclusion !== "cancelled" &&
      run.conclusion !== "skipped"
  );
  if (finished && installedBuild !== undefined) {
    if (finished.runNumber > installedBuild) {
      return finished.conclusion === "success"
        ? { kind: "ready", run: finished }
        : { kind: "failed", run: finished };
    }
  }
  return { kind: "none" };
};

export type StartedBy = "push" | "manual" | "other";

/** How the run was started, in the terms the card uses. */
export const startedBy = (event: string): StartedBy =>
  event === "push"
    ? "push"
    : event === "workflow_dispatch"
      ? "manual"
      : "other";

// ------------------------------------------------------------------- jobs

export type JobState =
  "waiting" | "running" | "done" | "failed" | "cancelled" | "skipped";

/** The state of one job in plain terms. */
export const jobState = (job: BuildJob): JobState => {
  if (job.status === "completed") {
    switch (job.conclusion) {
      case "success":
      case "neutral":
        return "done";
      case "skipped":
        return "skipped";
      case "cancelled":
        return "cancelled";
      default:
        return "failed";
    }
  }
  return job.status === "in_progress" ? "running" : "waiting";
};

export type StageId =
  | "prepare"
  | "interface"
  | "images"
  | "publish"
  | "offer"
  | "system"
  | "release"
  | "other";

interface StageDefinition {
  id: Exclude<StageId, "other">;
  matches: (name: string) => boolean;
  // Typical minutes from the start of a run until the stage is finished.
  typicalEnd: number;
}

const startsWithAny =
  (...prefixes: string[]) =>
  (name: string) =>
    prefixes.some((prefix) => name.startsWith(prefix));

/** The stages of a build, in the order they happen. */
export const STAGES: StageDefinition[] = [
  {
    id: "prepare",
    matches: startsWithAny("work out versions"),
    typicalEnd: 2,
  },
  {
    id: "interface",
    matches: startsWithAny(
      "build the frontend",
      "collect integration translations",
      "stage the deploy assistant"
    ),
    typicalEnd: 12,
  },
  {
    id: "images",
    matches: (name) =>
      /^build (aarch64|amd64) (core images|supervisor image)/.test(name),
    typicalEnd: 22,
  },
  {
    id: "publish",
    matches: startsWithAny(
      "publish the container image",
      "build the full hosting mode image"
    ),
    typicalEnd: 25,
  },
  {
    id: "offer",
    matches: startsWithAny("move the update feed for core and supervisor"),
    typicalEnd: 27,
  },
  {
    id: "system",
    matches: (name) => /^build the .+ operating system image/.test(name),
    typicalEnd: 120,
  },
  {
    id: "release",
    matches: startsWithAny("publish the release"),
    typicalEnd: 125,
  },
];

/** The stage a job belongs to, matched by its name. */
export const stageOfJob = (name: string): StageId => {
  const normal = name.trim().toLowerCase();
  return STAGES.find((stage) => stage.matches(normal))?.id ?? "other";
};

export interface StageJob {
  name: string;
  state: JobState;
  startedAt: string | null;
  durationSeconds: number | undefined;
}

export interface StageSummary {
  id: StageId;
  state: JobState;
  jobs: StageJob[];
}

const toMs = (value: string | null | undefined): number | undefined => {
  if (!value) {
    return undefined;
  }
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? undefined : ms;
};

/** Seconds between two times; a job that has not finished runs until `now`. */
export const durationSeconds = (
  start: string | null | undefined,
  end: string | null | undefined,
  now: number
): number | undefined => {
  const from = toMs(start);
  if (from === undefined) {
    return undefined;
  }
  const to = toMs(end) ?? now;
  return Math.max(0, Math.round((to - from) / 1000));
};

const stageState = (states: JobState[]): JobState => {
  if (!states.length) {
    return "waiting";
  }
  if (states.includes("failed")) {
    return "failed";
  }
  if (states.includes("cancelled")) {
    return "cancelled";
  }
  const counted = states.filter((state) => state !== "skipped");
  if (!counted.length) {
    return "skipped";
  }
  if (counted.every((state) => state === "done")) {
    return "done";
  }
  return counted.some((state) => state === "running" || state === "done")
    ? "running"
    : "waiting";
};

/**
 * Groups the jobs of a run into stages.
 *
 * A stage whose jobs do not exist yet is shown as waiting while the run is
 * still going, and left out once the run has finished. The "Publish the
 * release" stage only belongs to runs that were started by hand, so it is
 * left out when it is absent or every one of its jobs was skipped.
 */
export const buildStages = (
  jobs: BuildJob[],
  run: Pick<BuildRun, "status" | "event">,
  now: number
): StageSummary[] => {
  const grouped = new Map<StageId, StageJob[]>();
  for (const job of jobs) {
    const id = stageOfJob(job.name);
    const list = grouped.get(id) ?? [];
    list.push({
      name: job.name,
      state: jobState(job),
      startedAt: job.startedAt,
      durationSeconds: durationSeconds(job.startedAt, job.completedAt, now),
    });
    grouped.set(id, list);
  }
  const finished = run.status === "completed";
  const result: StageSummary[] = [];
  for (const stage of STAGES) {
    const stageJobs = grouped.get(stage.id) ?? [];
    const state = stageState(stageJobs.map((job) => job.state));
    if (!stageJobs.length && finished) {
      continue;
    }
    if (stage.id === "release") {
      const planned = stageJobs.length
        ? state !== "skipped"
        : run.event === "workflow_dispatch";
      if (!planned) {
        continue;
      }
    }
    result.push({ id: stage.id, state, jobs: stageJobs });
  }
  const other = grouped.get("other");
  if (other?.length) {
    result.push({
      id: "other",
      state: stageState(other.map((job) => job.state)),
      jobs: other,
    });
  }
  return result;
};

export interface BuildProgress {
  done: number;
  total: number;
  percent: number;
}

/**
 * Jobs finished out of jobs total. Skipped jobs are not counted. The figure
 * stays at 99 until every job has finished, so a bar never shows a finished
 * look for a build that is not.
 */
export const computeProgress = (jobs: BuildJob[]): BuildProgress => {
  const states = jobs.map(jobState).filter((state) => state !== "skipped");
  const total = states.length;
  const done = states.filter((state) => state === "done").length;
  if (!total) {
    return { done: 0, total: 0, percent: 0 };
  }
  const percent =
    done === total ? 100 : Math.min(99, Math.round((done / total) * 100));
  return { done, total, percent };
};

/**
 * The stage to name as the current one: a failed stage first, then one that
 * is running, then the first one still waiting.
 */
export const currentStage = (
  stages: StageSummary[]
): StageSummary | undefined =>
  stages.find((stage) => stage.state === "failed") ??
  stages.find((stage) => stage.state === "running") ??
  stages.find((stage) => stage.state === "waiting");

/** True when the Core and Supervisor update has been offered by this build. */
export const coreUpdateOffered = (stages: StageSummary[]): boolean =>
  stages.find((stage) => stage.id === "offer")?.state === "done";

/**
 * Minutes left, as an estimate from typical durations: about two hours for a
 * whole run. Returns "overdue" when the run has already taken longer than
 * that, and undefined when there is nothing to estimate.
 */
export const estimateRemaining = (
  stages: StageSummary[],
  startedAt: string,
  now: number
): number | "overdue" | undefined => {
  const started = toMs(startedAt);
  if (started === undefined) {
    return undefined;
  }
  const included = new Set(stages.map((stage) => stage.id));
  const last = [...STAGES].reverse().find((stage) => included.has(stage.id));
  if (!last) {
    return undefined;
  }
  const elapsed = (now - started) / 60000;
  const remaining = last.typicalEnd - elapsed;
  return remaining <= 0 ? "overdue" : Math.max(1, Math.round(remaining));
};

/** "1:05:09" or "5:09": a plain elapsed time that needs no translation. */
export const formatElapsed = (seconds: number | undefined): string => {
  if (seconds === undefined) {
    return "";
  }
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours
    ? `${hours}:${pad(minutes)}:${pad(rest)}`
    : `${minutes}:${pad(rest)}`;
};

// ---------------------------------------------------------------- network

export interface BuildSnapshot {
  fetchedAt: number;
  choice: RunChoice;
  jobs: BuildJob[];
}

/**
 * Reads the runs and, for the chosen run, its jobs: at most two requests.
 * A run that is only waiting has no jobs yet, so it needs one request.
 */
export const fetchBuildSnapshot = async (
  repository: string,
  installedBuild: number | undefined,
  signal?: AbortSignal
): Promise<PublicFetchResult<BuildSnapshot>> => {
  const runsResult = await fetchPublicJson(
    `${API}/${repository}/actions/workflows/release.yml/runs?per_page=6`,
    signal
  );
  if (!runsResult.ok) {
    return runsResult;
  }
  const choice = chooseRun(parseRuns(runsResult.data), installedBuild);
  if (choice.kind === "none" || choice.kind === "waiting") {
    return {
      ok: true,
      data: { fetchedAt: Date.now(), choice, jobs: [] },
    };
  }
  const jobsResult = await fetchPublicJson(
    `${API}/${repository}/actions/runs/${choice.run.id}/jobs?per_page=50`,
    signal
  );
  if (!jobsResult.ok) {
    return jobsResult;
  }
  return {
    ok: true,
    data: {
      fetchedAt: Date.now(),
      choice,
      jobs: parseJobs(jobsResult.data),
    },
  };
};
