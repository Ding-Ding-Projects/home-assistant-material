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

/** The first line of a commit message, trimmed. */
export const firstLine = (message: unknown): string =>
  typeof message === "string"
    ? (message.split(/\r?\n/, 1)[0] ?? "").trim()
    : "";

/**
 * The title to show for a run. A run started by hand has the name of the
 * workflow as its display title, which says nothing about the change, so the
 * title of the commit it built is used instead. A title that equals the
 * workflow name and has no commit to fall back on is left empty.
 */
export const pickRunTitle = (
  displayTitle: string,
  workflowName: string,
  commitMessage: unknown
): string => {
  const display = displayTitle.trim();
  const isWorkflowName =
    !!workflowName &&
    display.toLowerCase() === workflowName.trim().toLowerCase();
  if (display && !isWorkflowName) {
    return display;
  }
  return firstLine(commitMessage);
};

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
      title: pickRunTitle(
        text(entry.display_title),
        text(entry.name),
        isRecord(entry.head_commit) ? entry.head_commit.message : undefined
      ),
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

/** How a build compares with the build that is installed. */
export type BuildRelation = "newer" | "same" | "older" | "unknown";

/**
 * Whether a build is newer than, the same as, or older than the installed
 * build. Only a newer build is something to wait for or install; the same or an
 * older one is already part of what is installed. "unknown" when the installed
 * build number cannot be read.
 */
export const buildRelation = (
  installed: number | undefined,
  build: number
): BuildRelation => {
  if (installed === undefined || !Number.isFinite(installed)) {
    return "unknown";
  }
  if (build > installed) {
    return "newer";
  }
  return build === installed ? "same" : "older";
};

/** True when the installed build already has everything this build holds. */
export const alreadyInstalled = (relation: BuildRelation): boolean =>
  relation === "same" || relation === "older";

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

/**
 * Runs that were cancelled or skipped because a newer build took their place:
 * newer than the installed build and older than the chosen run, newest first.
 */
export const replacedRuns = (
  runs: BuildRun[],
  chosen: BuildRun | undefined,
  installedBuild: number | undefined
): BuildRun[] =>
  chosen
    ? newestFirst(runs).filter(
        (run) =>
          run.status === "completed" &&
          (run.conclusion === "cancelled" || run.conclusion === "skipped") &&
          run.runNumber < chosen.runNumber &&
          (installedBuild === undefined || run.runNumber > installedBuild)
      )
    : [];

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

interface JobNamePattern {
  pattern: RegExp;
  key: string;
  // Names the captured groups in order, for example the architecture.
  values?: string[];
}

// The names the public build data gives its jobs, with the translation key
// for each. Board and architecture identifiers are kept as they are.
const JOB_NAMES: JobNamePattern[] = [
  { pattern: /^work out versions/i, key: "work_out_versions" },
  { pattern: /^build the frontend/i, key: "build_frontend" },
  {
    pattern: /^collect integration translations/i,
    key: "collect_translations",
  },
  { pattern: /^stage the deploy assistant/i, key: "stage_deploy_assistant" },
  {
    pattern: /^build (aarch64|amd64) core images/i,
    key: "build_core_images",
    values: ["arch"],
  },
  {
    pattern: /^build (aarch64|amd64) supervisor image/i,
    key: "build_supervisor_image",
    values: ["arch"],
  },
  { pattern: /^publish the container image/i, key: "publish_container_image" },
  {
    pattern: /^build the full hosting mode image/i,
    key: "build_full_hosting_image",
  },
  {
    pattern: /^move the update feed for core and supervisor/i,
    key: "move_update_feed",
  },
  {
    pattern: /^build the (.+?) operating system image/i,
    key: "build_os_image",
    values: ["board"],
  },
  { pattern: /^publish the release/i, key: "publish_release" },
];

/**
 * The translation key and values for a known job name, with whatever follows
 * the known part of the name (a suffix such as a matrix label) kept as
 * written. Undefined for a job name that is not known: show it as it is.
 */
export const jobNameKey = (
  name: string
):
  { key: string; values: Record<string, string>; rest: string } | undefined => {
  const trimmed = name.trim();
  for (const entry of JOB_NAMES) {
    const match = entry.pattern.exec(trimmed);
    if (match) {
      const values: Record<string, string> = {};
      (entry.values ?? []).forEach((valueName, index) => {
        values[valueName] = match[index + 1];
      });
      return {
        key: `ui.panel.config.updates.coming_soon.job.${entry.key}`,
        values,
        rest: trimmed.slice(match[0].length),
      };
    }
  }
  return undefined;
};

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

/**
 * Minutes until Core can be installed, as an estimate: 0 once the update has
 * been offered, "overdue" when the offering step is already past its typical
 * time, undefined when the build has no such step to wait for.
 */
export const estimateCore = (
  stages: StageSummary[],
  startedAt: string,
  now: number
): number | "overdue" | undefined => {
  const offer = stages.find((stage) => stage.id === "offer");
  const started = toMs(startedAt);
  if (!offer || started === undefined) {
    return undefined;
  }
  if (offer.state === "done") {
    return 0;
  }
  const end = STAGES.find((stage) => stage.id === "offer")!.typicalEnd;
  const remaining = end - (now - started) / 60000;
  return remaining <= 0 ? "overdue" : Math.max(1, Math.round(remaining));
};

/** A number of minutes as whole hours and the minutes left over. */
export const splitMinutes = (
  minutes: number
): { hours: number; minutes: number } => ({
  hours: Math.floor(minutes / 60),
  minutes: minutes % 60,
});

export interface StageCount {
  done: number;
  total: number;
}

/** Jobs finished out of jobs in a stage; skipped jobs are not counted. */
export const stageCount = (stage: StageSummary): StageCount => {
  const counted = stage.jobs.filter((job) => job.state !== "skipped");
  return {
    done: counted.filter((job) => job.state === "done").length,
    total: counted.length,
  };
};

/** How many jobs are running and how many failed, for a screen reader. */
export const jobStateCounts = (
  jobs: BuildJob[]
): { running: number; failed: number } => {
  const states = jobs.map(jobState);
  return {
    running: states.filter((state) => state === "running").length,
    failed: states.filter((state) => state === "failed").length,
  };
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
  /** Newer builds than the one installed that a later build replaced. */
  replaced?: BuildRun[];
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
  const runs = parseRuns(runsResult.data);
  const choice = chooseRun(runs, installedBuild);
  const replaced = replacedRuns(
    runs,
    choice.kind === "none" ? undefined : choice.run,
    installedBuild
  );
  if (choice.kind === "none" || choice.kind === "waiting") {
    return {
      ok: true,
      data: { fetchedAt: Date.now(), choice, jobs: [], replaced },
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
      replaced,
    },
  };
};
