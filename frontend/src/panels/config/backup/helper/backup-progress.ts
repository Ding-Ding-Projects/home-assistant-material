import type {
  BackupSubscriptionEvent,
  CreateBackupStage,
  ManagerStateEvent,
  ReceiveBackupStage,
  RestoreBackupStage,
  UploadBackupEvent,
} from "../../../../data/backup_manager";

/**
 * Pure model behind the backup progress card. It turns the events the backup
 * manager already sends (a stage per event, plus byte counts per location
 * while uploading) into a stage list with times, speed and estimates. Nothing
 * here is invented: a figure is only present when the server supplied the
 * numbers it is derived from.
 */

export type OperationKind = "create" | "receive" | "restore";

export type StageState = "waiting" | "running" | "done" | "failed" | "skipped";

export type RunState = "in_progress" | "completed" | "failed";

type AnyStage = CreateBackupStage | ReceiveBackupStage | RestoreBackupStage;

export interface StageDefinition {
  id: string;
  // Manager stages that belong to this row
  members: AnyStage[];
  // Only shown when the instance runs Supervisor
  hassioOnly?: boolean;
}

export const UPLOAD_ROW_ID = "upload";

// Rows are listed in the order the manager runs them.
const CREATE_ROWS: StageDefinition[] = [
  {
    id: "home_assistant",
    members: [
      "addon_repositories",
      "app_repositories",
      "docker_config",
      "home_assistant",
    ],
  },
  { id: "apps", members: ["addons", "apps"], hassioOnly: true },
  { id: "folders", members: ["folders", "finishing_file"] },
  {
    id: "await_restarts",
    members: ["await_addon_restarts", "await_app_restarts"],
    hassioOnly: true,
  },
  { id: UPLOAD_ROW_ID, members: ["upload_to_agents"] },
  { id: "cleaning_up", members: ["cleaning_up"] },
];

const RECEIVE_ROWS: StageDefinition[] = [
  { id: "receive_file", members: ["receive_file"] },
  { id: UPLOAD_ROW_ID, members: ["upload_to_agents"] },
];

const RESTORE_ROWS: StageDefinition[] = [
  { id: "download_from_agent", members: ["download_from_agent"] },
  {
    id: "repositories",
    members: ["addon_repositories", "app_repositories", "docker_config"],
  },
  { id: "home_assistant", members: ["home_assistant"] },
  {
    id: "remove_delta",
    members: ["remove_delta_addons", "remove_delta_apps"],
    hassioOnly: true,
  },
  { id: "apps", members: ["addons", "apps"], hassioOnly: true },
  { id: "folders", members: ["folders"] },
  {
    id: "await_restarts",
    members: ["await_addon_restarts", "await_app_restarts"],
    hassioOnly: true,
  },
  {
    id: "restart_check",
    members: ["await_home_assistant_restart", "check_home_assistant"],
  },
];

export const getStageDefinitions = (
  kind: OperationKind,
  isHassio: boolean
): StageDefinition[] =>
  (kind === "create"
    ? CREATE_ROWS
    : kind === "receive"
      ? RECEIVE_ROWS
      : RESTORE_ROWS
  ).filter((row) => isHassio || !row.hassioOnly);

export interface UploadSample {
  t: number;
  bytes: number;
}

export interface UploadTrack {
  uploaded: number;
  total: number;
  startedAt: number;
  finishedAt?: number;
  samples: UploadSample[];
}

export interface StageTimes {
  startedAt: number;
  endedAt?: number;
}

export interface RunSnapshot {
  kind: OperationKind;
  startedAt: number;
  // False when the page was opened while the operation was already running,
  // so earlier stages and the start time are only approximate
  observedFromStart: boolean;
  state: RunState;
  endedAt?: number;
  reason?: string | null;
  stage?: string;
  stageTimes: Record<string, StageTimes>;
  failedRowId?: string;
  uploads: Record<string, UploadTrack>;
}

const SAMPLE_WINDOW_MS = 30000;
const MAX_SAMPLES = 12;
// A speed or time estimate needs this much history to mean anything
const MIN_ESTIMATE_SPAN_MS = 5000;
const MIN_ESTIMATE_SAMPLES = 3;

const kindOf = (
  managerState: ManagerStateEvent["manager_state"]
): OperationKind | undefined => {
  switch (managerState) {
    case "create_backup":
      return "create";
    case "receive_backup":
      return "receive";
    case "restore_backup":
      return "restore";
    default:
      return undefined;
  }
};

export const findRowId = (
  kind: OperationKind,
  stage: string | null | undefined,
  isHassio = true
): string | undefined => {
  if (!stage) {
    return undefined;
  }
  return getStageDefinitions(kind, isHassio).find((row) =>
    row.members.includes(stage as AnyStage)
  )?.id;
};

/**
 * Apply one manager state event. Returns the run to keep: undefined when
 * nothing is running and nothing was running before.
 */
export const applyManagerEvent = (
  run: RunSnapshot | undefined,
  event: ManagerStateEvent,
  now: number,
  isHassio: boolean
): RunSnapshot | undefined => {
  if (event.manager_state === "idle") {
    if (run && run.state === "in_progress") {
      // The manager went idle without a final event; the outcome is unknown,
      // so it is not reported as a success.
      return { ...run, state: "completed", endedAt: now };
    }
    return run;
  }
  const kind = kindOf(event.manager_state);
  if (!kind || !("state" in event)) {
    return run;
  }

  const active =
    event.state === "in_progress" || event.state === "core_restart";
  let current = run;
  if (!current || current.kind !== kind || current.state !== "in_progress") {
    if (!active) {
      // A final event with nothing running here: a duplicate or something
      // this page never saw
      return current;
    }
    current = {
      kind,
      startedAt: now,
      observedFromStart: event.stage === null,
      state: "in_progress",
      stageTimes: {},
      uploads: {},
    };
  }

  const next: RunSnapshot = {
    ...current,
    stageTimes: { ...current.stageTimes },
  };
  const rowId = findRowId(kind, event.stage, isHassio);

  if (event.stage) {
    next.stage = event.stage;
    const previousRow = current.stage
      ? findRowId(kind, current.stage, isHassio)
      : undefined;
    if (previousRow && previousRow !== rowId) {
      const times = next.stageTimes[previousRow];
      if (times && times.endedAt === undefined) {
        next.stageTimes[previousRow] = { ...times, endedAt: now };
      }
    }
    if (rowId && !next.stageTimes[rowId]) {
      next.stageTimes[rowId] = { startedAt: now };
    }
  }

  if (active) {
    return next;
  }

  next.state = event.state === "failed" ? "failed" : "completed";
  next.endedAt = now;
  next.reason = event.reason;
  const lastRow = next.stage
    ? findRowId(kind, next.stage, isHassio)
    : undefined;
  if (lastRow) {
    const times = next.stageTimes[lastRow];
    if (times && times.endedAt === undefined) {
      next.stageTimes[lastRow] = { ...times, endedAt: now };
    }
    if (next.state === "failed") {
      next.failedRowId = lastRow;
    }
  }
  return next;
};

/** Apply one upload progress event for a location. */
export const applyUploadEvent = (
  run: RunSnapshot | undefined,
  event: UploadBackupEvent,
  now: number
): RunSnapshot | undefined => {
  if (!run || run.state !== "in_progress") {
    return run;
  }
  const previous = run.uploads[event.agent_id];
  const track: UploadTrack = previous
    ? { ...previous }
    : {
        uploaded: 0,
        total: 0,
        startedAt: now,
        samples: [],
      };
  track.uploaded = event.uploaded_bytes;
  track.total = event.total_bytes;
  const finished = track.total > 0 && track.uploaded >= track.total;
  if (finished && track.finishedAt === undefined) {
    track.finishedAt = now;
  }
  const last = track.samples[track.samples.length - 1];
  if (!last || last.bytes !== event.uploaded_bytes) {
    track.samples = [
      ...track.samples.filter((sample) => now - sample.t <= SAMPLE_WINDOW_MS),
      { t: now, bytes: event.uploaded_bytes },
    ].slice(-MAX_SAMPLES);
  }
  return { ...run, uploads: { ...run.uploads, [event.agent_id]: track } };
};

export const applyBackupEvent = (
  run: RunSnapshot | undefined,
  event: BackupSubscriptionEvent,
  now: number,
  isHassio: boolean
): RunSnapshot | undefined =>
  "agent_id" in event
    ? applyUploadEvent(run, event, now)
    : applyManagerEvent(run, event, now, isHassio);

export interface LocationRow {
  agentId: string;
  state: StageState;
  uploaded: number;
  total: number;
  // Only when the location has reported bytes; otherwise the bar is
  // indeterminate and the card says that no progress is reported
  percent?: number;
  reportsProgress: boolean;
  bytesPerSecond?: number;
  // Seconds, an estimate derived from the speed above
  etaSeconds?: number;
  startedAt: number;
  finishedAt?: number;
}

export const computeSpeed = (
  track: UploadTrack
): { bytesPerSecond?: number; etaSeconds?: number } => {
  const samples = track.samples;
  if (samples.length < MIN_ESTIMATE_SAMPLES) {
    return {};
  }
  const first = samples[0];
  const last = samples[samples.length - 1];
  const span = last.t - first.t;
  const bytes = last.bytes - first.bytes;
  if (span < MIN_ESTIMATE_SPAN_MS || bytes <= 0) {
    return {};
  }
  const bytesPerSecond = bytes / (span / 1000);
  const remaining = track.total - track.uploaded;
  return {
    bytesPerSecond,
    etaSeconds:
      track.total > 0 && remaining > 0
        ? Math.ceil(remaining / bytesPerSecond)
        : undefined,
  };
};

export const computeLocationRows = (run: RunSnapshot): LocationRow[] =>
  Object.entries(run.uploads).map(([agentId, track]) => {
    const finished = track.total > 0 && track.uploaded >= track.total;
    const reportsProgress = track.total > 0 && track.uploaded > 0;
    let state: StageState;
    if (finished) {
      state = "done";
    } else if (run.state === "in_progress") {
      state = "running";
    } else {
      // The run ended and this location never finished
      state = "failed";
    }
    const speed =
      state === "running" ? computeSpeed(track) : { bytesPerSecond: undefined };
    return {
      agentId,
      state,
      uploaded: track.uploaded,
      total: track.total,
      percent: reportsProgress
        ? finished
          ? 100
          : Math.min(99, Math.floor((track.uploaded / track.total) * 100))
        : undefined,
      reportsProgress,
      bytesPerSecond: speed.bytesPerSecond,
      etaSeconds: "etaSeconds" in speed ? speed.etaSeconds : undefined,
      startedAt: track.startedAt,
      finishedAt: track.finishedAt,
    };
  });

export interface StageRowView {
  id: string;
  state: StageState;
  startedAt?: number;
  endedAt?: number;
  // True when the start time was not seen from the beginning of the run
  approximate: boolean;
  locations: LocationRow[];
}

export const computeStageRows = (
  run: RunSnapshot,
  isHassio: boolean
): StageRowView[] => {
  const definitions = getStageDefinitions(run.kind, isHassio);
  const currentRowId = run.stage
    ? findRowId(run.kind, run.stage, isHassio)
    : undefined;
  const currentIndex = definitions.findIndex((row) => row.id === currentRowId);
  const ended = run.state !== "in_progress";

  return definitions.map((definition, index) => {
    const times = run.stageTimes[definition.id];
    let state: StageState;
    if (run.state === "failed" && run.failedRowId === definition.id) {
      state = "failed";
    } else if (!ended && index === currentIndex) {
      state = "running";
    } else if (times) {
      state = "done";
    } else if (currentIndex === -1 && !ended) {
      state = "waiting";
    } else if (ended) {
      // Rows never reached in a finished run; after a success they did not
      // apply, after a failure they never ran.
      state = run.state === "completed" ? "skipped" : "waiting";
    } else if (index < currentIndex) {
      state = run.observedFromStart ? "skipped" : "done";
    } else {
      state = "waiting";
    }
    return {
      id: definition.id,
      state,
      startedAt: times?.startedAt,
      endedAt: times?.endedAt,
      approximate: !run.observedFromStart,
      locations:
        definition.id === UPLOAD_ROW_ID && times
          ? computeLocationRows(run)
          : [],
    };
  });
};

export interface OverallProgress {
  // 1-based number of the current step, and how many steps apply
  step: number;
  steps: number;
  // Combined bytes uploaded across locations; only while uploading and only
  // when at least one location reports bytes
  uploadPercent?: number;
  elapsedMs: number;
}

export const computeOverall = (
  run: RunSnapshot,
  isHassio: boolean,
  now: number
): OverallProgress => {
  const rows = computeStageRows(run, isHassio).filter(
    (row) => row.state !== "skipped"
  );
  const runningIndex = rows.findIndex((row) => row.state === "running");
  const doneCount = rows.filter((row) => row.state === "done").length;
  const reporting = computeLocationRows(run).filter((l) => l.reportsProgress);
  const sumTotal = reporting.reduce((sum, l) => sum + l.total, 0);
  const sumUploaded = reporting.reduce((sum, l) => sum + l.uploaded, 0);
  return {
    step: runningIndex >= 0 ? runningIndex + 1 : doneCount,
    steps: rows.length,
    uploadPercent:
      run.stage === "upload_to_agents" && sumTotal > 0
        ? Math.min(99, Math.floor((sumUploaded / sumTotal) * 100))
        : undefined,
    elapsedMs: Math.max(0, (run.endedAt ?? now) - run.startedAt),
  };
};

export const hasRunningUpload = (run: RunSnapshot): boolean =>
  run.state === "in_progress" && run.stage === "upload_to_agents";

// Persistence across a page reload. The server replays its latest events on
// subscribe, which restores the current stage and bytes; this adds the times
// the page had recorded.

export const BACKUP_RUN_STORAGE_KEY = "backup-progress-run";

export const serializeRun = (run: RunSnapshot): string => JSON.stringify(run);

export const restoreRun = (
  raw: string | null | undefined
): RunSnapshot | undefined => {
  if (!raw) {
    return undefined;
  }
  try {
    const value = JSON.parse(raw) as RunSnapshot;
    if (
      !value ||
      !["create", "receive", "restore"].includes(value.kind) ||
      typeof value.startedAt !== "number" ||
      typeof value.stageTimes !== "object" ||
      typeof value.uploads !== "object"
    ) {
      return undefined;
    }
    return value;
  } catch (_err) {
    return undefined;
  }
};

/**
 * After a reload the first manager event describes the running operation.
 * Reuse the stored run only when it is the same operation, still unfinished.
 */
export const adoptStoredRun = (
  stored: RunSnapshot | undefined,
  event: ManagerStateEvent
): RunSnapshot | undefined => {
  if (!stored || stored.state !== "in_progress") {
    return undefined;
  }
  const kind = kindOf(event.manager_state);
  return kind &&
    kind === stored.kind &&
    "state" in event &&
    (event.state === "in_progress" || event.state === "core_restart")
    ? stored
    : undefined;
};

// Formatting

const pad = (value: number) => String(value).padStart(2, "0");

/** 24-hour clock time with seconds, in the given time zone when supplied. */
export const formatClock = (ms: number, timeZone?: string): string => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone,
  }).formatToParts(new Date(ms));
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${hour}:${get("minute")}:${get("second")}`;
};

/** 1:05 or 1:02:03 for a length of time. */
export const formatDuration = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
};
