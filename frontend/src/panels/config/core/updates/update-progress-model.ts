import { redactDetails } from "../../../../common/activity/redact-details";
import { stripAnsi } from "../../../../common/string/ansi-segments";
import type { UpdateEntity } from "../../../../data/update";
import type { QueueState } from "./update-queue";
import { updateRole } from "./update-queue";

/**
 * The rules behind the detailed progress shown on an update row. Every
 * function here is plain: it turns what the update entity, the Supervisor's
 * jobs and the install tracker report into what the row shows, and never
 * invents a number. Where a source gives nothing, the answer is "unknown".
 */

export type ProgressKind =
  "core" | "supervisor" | "os" | "app" | "firmware" | "entity";

export type StageId =
  "backup" | "download" | "extract" | "install" | "restart" | "check";

export type StageState = "waiting" | "running" | "done" | "failed" | "skipped";

export interface StageRow {
  id: StageId;
  state: StageState;
}

/** The tracker's own stages, as the install tracker reports them. */
export type TrackerStage =
  | "backing_up"
  | "preparing"
  | "installing"
  | "waiting"
  | "checking"
  | "done"
  | "failed"
  | "restart_required"
  | "rolled_back";

/** What kind of update an entity is, from what the entity says about itself. */
export const progressKindOf = (
  entity: Pick<UpdateEntity, "entity_id" | "attributes">,
  platform?: string
): ProgressKind => {
  const role = updateRole(entity);
  if (role === "supervisor" || role === "core" || role === "os") {
    return role;
  }
  if (platform === "hassio") {
    return "app";
  }
  return entity.attributes.device_class === "firmware" ? "firmware" : "entity";
};

const APP_ICON = /\/hassio\/addons\/([^/?#]+)\/icon/;

/** The app slug of an Supervisor app update, read from its picture address. */
export const appSlugOf = (
  entity: Pick<UpdateEntity, "attributes">
): string | undefined => {
  const picture = entity.attributes.entity_picture as string | undefined;
  const match = picture ? APP_ICON.exec(picture) : null;
  return match ? decodeURIComponent(match[1]) : undefined;
};

/** The Supervisor job that carries the update of this kind. */
export const jobNameMatches = (
  kind: ProgressKind,
  jobName: string | null | undefined
): boolean => {
  switch (kind) {
    case "core":
      return jobName === "home_assistant_core_update";
    case "supervisor":
      return jobName === "supervisor_update";
    case "os":
      return jobName === "os_manager_update";
    case "app":
      return (
        jobName === "app_manager_update" || jobName === "addon_manager_update"
      );
    default:
      return false;
  }
};

/** Which log the Supervisor offers for this kind, if any. */
export const logProviderFor = (
  kind: ProgressKind,
  slug: string | undefined,
  hassioLoaded: boolean
): string | undefined => {
  switch (kind) {
    case "core":
      return hassioLoaded ? "core" : undefined;
    case "supervisor":
      return "supervisor";
    case "os":
      return "host";
    case "app":
      return slug;
    default:
      // Integration, device and firmware updates run inside Core.
      return hassioLoaded ? "core" : undefined;
  }
};

/** The steps an update of this kind goes through, in order. */
export const baseStageIdsFor = (kind: ProgressKind): StageId[] => {
  switch (kind) {
    case "core":
    case "supervisor":
      return ["backup", "download", "extract", "install", "restart", "check"];
    case "os":
      return ["backup", "download", "install", "restart", "check"];
    case "app":
      return ["backup", "download", "extract", "install", "check"];
    default:
      return ["install", "check"];
  }
};

/** The steps shown: the backup step is left out when nobody knows if one was asked for. */
export const stageIdsFor = (
  kind: ProgressKind,
  backupRequested?: boolean
): StageId[] =>
  baseStageIdsFor(kind).filter(
    (id) => id !== "backup" || backupRequested !== undefined
  );

/** What the sources say about the stage the update is in right now. */
export interface StageSignals {
  kind: ProgressKind;
  /** A backup was asked for before the update; undefined when nobody knows. */
  backupRequested?: boolean;
  /** The tracker's stage, when something is following the install. */
  tracker?: TrackerStage;
  /** The Supervisor's stage word for the image pull, e.g. "Downloading". */
  jobStage?: string | null;
  /** The Supervisor job or the update entity reported a percentage. */
  hasPercent: boolean;
  /** The update has ended: it went well or it failed. */
  end?: "done" | "failed";
  /** The stage that was current when the update failed, if it is known. */
  failedAt?: StageId;
  /** Core, Supervisor or the OS restart wait has been seen (socket lost). */
  restartSeen?: boolean;
}

const lower = (stage: string | null | undefined): string =>
  (stage ?? "").trim().toLowerCase();

/** The step that is under way, or undefined when no source says. */
export const currentStage = (signals: StageSignals): StageId | undefined => {
  const ids = stageIdsFor(signals.kind, signals.backupRequested);
  const has = (id: StageId): boolean => ids.includes(id);
  const stage = lower(signals.jobStage);
  if (signals.tracker === "backing_up" && has("backup")) {
    return "backup";
  }
  if (signals.tracker === "checking") {
    return "check";
  }
  if (signals.tracker === "waiting" || signals.tracker === "restart_required") {
    return has("restart") ? "restart" : "check";
  }
  if (stage === "downloading" && has("download")) {
    return "download";
  }
  if (stage === "extracting" && has("extract")) {
    return "extract";
  }
  if (stage === "pull complete" && has("install")) {
    return "install";
  }
  if (stage === "copying" && has("download")) {
    return "download";
  }
  if (stage === "verifying" && has("download")) {
    return "download";
  }
  if (stage === "installing" && has("install")) {
    return "install";
  }
  if (signals.hasPercent) {
    // The Supervisor's percentage is the progress of fetching the image for
    // these kinds; for the others it is the install itself.
    return has("download") ? "download" : "install";
  }
  if (signals.tracker === "installing" || signals.tracker === "preparing") {
    return has("download") && signals.tracker === "preparing"
      ? has("backup") && signals.backupRequested === true
        ? "backup"
        : "download"
      : "install";
  }
  return undefined;
};

/**
 * The state of every step. A step before the current one is done, the
 * current one is running, the rest wait. A backup that was not asked for is
 * skipped. When the run failed, the current step failed and the rest are
 * skipped.
 */
export const deriveStages = (signals: StageSignals): StageRow[] => {
  const ids = stageIdsFor(signals.kind, signals.backupRequested);
  const rows = (fill: (id: StageId, index: number) => StageState): StageRow[] =>
    ids.map((id, index) => ({ id, state: fill(id, index) }));
  const backupSkipped = (id: StageId): boolean =>
    id === "backup" && !signals.backupRequested;

  if (signals.end === "done") {
    return rows((id) => (backupSkipped(id) ? "skipped" : "done"));
  }
  const current =
    signals.end === "failed"
      ? (signals.failedAt ?? currentStage(signals))
      : currentStage(signals);
  const currentIndex = current ? ids.indexOf(current) : -1;
  return rows((id, index) => {
    if (backupSkipped(id)) {
      return "skipped";
    }
    if (currentIndex < 0) {
      return "waiting";
    }
    if (index < currentIndex) {
      return "done";
    }
    if (index === currentIndex) {
      return signals.end === "failed" ? "failed" : "running";
    }
    return signals.end === "failed" ? "skipped" : "waiting";
  });
};

/** A whole percentage between 0 and 100, or undefined when none was given. */
export const cleanPercent = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(100, Math.max(0, Math.floor(value)))
    : undefined;

/** The first and the latest reading of a percentage, with their times. */
export interface PercentSamples {
  firstAt: number;
  firstValue: number;
  lastAt: number;
  lastValue: number;
}

/** Adds a reading. A value that goes down is ignored, so the bar never moves back. */
export const addPercentSample = (
  samples: PercentSamples | undefined,
  value: number | undefined,
  now: number
): PercentSamples | undefined => {
  if (value === undefined) {
    return samples;
  }
  if (!samples) {
    return { firstAt: now, firstValue: value, lastAt: now, lastValue: value };
  }
  if (value <= samples.lastValue) {
    return samples;
  }
  return { ...samples, lastAt: now, lastValue: value };
};

/** Readings must span this long and this many points before a guess is made. */
export const ESTIMATE_MIN_SPAN_MS = 10_000;
export const ESTIMATE_MIN_GAIN = 3;

/**
 * An estimate of the time left, in milliseconds, from how fast the reported
 * percentage has moved. Undefined (no estimate at all) when there is no
 * percentage, too little movement or too short a span: a guess from no data
 * is never given.
 */
export const estimateRemainingMs = (
  samples: PercentSamples | undefined,
  now: number
): number | undefined => {
  if (!samples) {
    return undefined;
  }
  const span = samples.lastAt - samples.firstAt;
  const gain = samples.lastValue - samples.firstValue;
  if (
    span < ESTIMATE_MIN_SPAN_MS ||
    gain < ESTIMATE_MIN_GAIN ||
    samples.lastValue >= 100
  ) {
    return undefined;
  }
  const perMs = gain / span;
  const remaining = (100 - samples.lastValue) / perMs;
  // Time since the last reading has already passed.
  return Math.max(0, Math.round(remaining - Math.max(0, now - samples.lastAt)));
};

/** "19:49", always 24-hour, from a time in milliseconds. */
export const formatClock = (time: number): string => {
  const date = new Date(time);
  const two = (value: number) => String(value).padStart(2, "0");
  return `${two(date.getHours())}:${two(date.getMinutes())}`;
};

/** "about 3 min" parts: whole minutes, at least 1. */
export const minutesLeft = (ms: number): number =>
  Math.max(1, Math.ceil(ms / 60_000));

export interface QueuePosition {
  /** The 1-based place among the updates that still have to run. */
  position: number;
  total: number;
  /** The entity that runs right before this one, when there is one. */
  afterEntityId?: string;
  /** Why this update goes alone, when its kind restarts the system. */
  restartsSystem: boolean;
}

/**
 * Where a waiting update stands in the queue. `order` is the entity ids in the
 * order they run. An entity that is not in it has no position.
 */
export const queuePositionOf = (
  order: readonly string[],
  entityId: string,
  kind: ProgressKind
): QueuePosition | undefined => {
  const index = order.indexOf(entityId);
  if (index < 0) {
    return undefined;
  }
  return {
    position: index + 1,
    total: order.length,
    afterEntityId: index > 0 ? order[index - 1] : undefined,
    restartsSystem: kind === "core" || kind === "supervisor" || kind === "os",
  };
};

/** The entity ids of the steps that have not finished, in queue order. */
export const queueOrderOf = (queue: QueueState | undefined): string[] =>
  queue
    ? queue.steps
        .filter((step) => step.state === "waiting" || step.state === "updating")
        .map((step) => step.entityId)
    : [];

// ---- logs ----

/** Lines shown when the output is collapsed. */
export const OUTPUT_COLLAPSED_LINES = 3;

/** The most lines kept for one update, so a phone does not run out of memory. */
export const OUTPUT_MAX_LINES = 200;

/**
 * One log line made safe to show: colour codes removed and anything that
 * looks like a credential hidden. The logs page of the app has no hiding of
 * its own, so the shared redaction used for copied failure details is used.
 */
export const maskLogLine = (line: string): string =>
  redactDetails(stripAnsi(line)).trimEnd();

/** The newest lines of a log text, masked, with empty lines dropped. */
export const prepareLogLines = (
  text: string,
  max = OUTPUT_MAX_LINES
): string[] =>
  text
    .split(/\r?\n/)
    .map(maskLogLine)
    .filter((line) => line.trim() !== "")
    .slice(-max);

// ---- what is kept across a reload ----

export interface ProgressRecord {
  entityId: string;
  kind: ProgressKind;
  title: string;
  fromVersion: string | null;
  toVersion: string | null;
  startedAt: number;
  /**
   * True when the real start of the install is not known, for example an
   * install first seen after a reload with nothing stored about its start.
   * `startedAt` then only says when it was first noticed, so no duration is
   * ever shown from it.
   */
  startUnknown?: boolean;
  /** null when nobody knows (an install found after a reload). */
  backup: boolean | null;
  samples?: PercentSamples;
  /** The step that was current last, so a failure can name it. */
  lastStage?: StageId;
  finishedAt?: number;
  result?: "done" | "failed";
  /** Masked error text of a failure. */
  error?: string;
  /** The last lines of the log at the end, masked. */
  lastLines?: string[];
}

const STORAGE_KEY = "ha-update-progress-records";

/** A finished record is kept this long, a failed one until it is closed. */
export const RECORD_KEEP_MS = 60 * 60 * 1000;

const KINDS: ProgressKind[] = [
  "core",
  "supervisor",
  "os",
  "app",
  "firmware",
  "entity",
];

const STAGES: StageId[] = [
  "backup",
  "download",
  "extract",
  "install",
  "restart",
  "check",
];

const num = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

/** Reads stored records; anything unexpected is dropped. */
export const parseRecords = (
  raw: string | null,
  now: number
): ProgressRecord[] => {
  if (!raw) {
    return [];
  }
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) {
      return [];
    }
    const records: ProgressRecord[] = [];
    for (const item of data) {
      const startedAt = num(item?.startedAt);
      if (
        typeof item?.entityId !== "string" ||
        !item.entityId.startsWith("update.") ||
        !KINDS.includes(item.kind) ||
        startedAt === undefined
      ) {
        continue;
      }
      const finishedAt = num(item.finishedAt);
      const result =
        item.result === "done" || item.result === "failed"
          ? item.result
          : undefined;
      if (
        result === "done" &&
        (finishedAt === undefined || now - finishedAt > RECORD_KEEP_MS)
      ) {
        continue;
      }
      const s = item.samples;
      const samples =
        s &&
        num(s.firstAt) !== undefined &&
        num(s.firstValue) !== undefined &&
        num(s.lastAt) !== undefined &&
        num(s.lastValue) !== undefined
          ? {
              firstAt: s.firstAt,
              firstValue: s.firstValue,
              lastAt: s.lastAt,
              lastValue: s.lastValue,
            }
          : undefined;
      records.push({
        entityId: item.entityId,
        kind: item.kind,
        title: typeof item.title === "string" ? item.title.slice(0, 200) : "",
        fromVersion:
          typeof item.fromVersion === "string" ? item.fromVersion : null,
        toVersion: typeof item.toVersion === "string" ? item.toVersion : null,
        startedAt,
        startUnknown: item.startUnknown === true ? true : undefined,
        backup: typeof item.backup === "boolean" ? item.backup : null,
        samples,
        lastStage: STAGES.includes(item.lastStage) ? item.lastStage : undefined,
        finishedAt,
        result,
        error:
          typeof item.error === "string"
            ? redactDetails(item.error).slice(0, 1000)
            : undefined,
        lastLines: Array.isArray(item.lastLines)
          ? item.lastLines
              .filter(
                (line: unknown): line is string => typeof line === "string"
              )
              .slice(-10)
              .map(maskLogLine)
          : undefined,
      });
    }
    return records;
  } catch (_err) {
    return [];
  }
};

export const loadRecords = (now = Date.now()): ProgressRecord[] => {
  try {
    return parseRecords(window.sessionStorage.getItem(STORAGE_KEY), now);
  } catch (_err) {
    return [];
  }
};

export const storeRecords = (records: readonly ProgressRecord[]): void => {
  try {
    if (!records.length) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch (_err) {
    // The record then does not survive a reload.
  }
};

/**
 * Whether an update that stopped installing has arrived, and at which
 * version. It arrived when the entity says nothing is left to install, when
 * the version it was installing to is installed, or when the installed
 * version is no longer the one it started from: going back installs an older
 * version than the newest one, which the record could not know. A changed
 * version alone never ends a record while the entity is unavailable (a
 * restart).
 */
export const versionArrival = (
  record: Pick<ProgressRecord, "fromVersion" | "toVersion">,
  entity: { state: string; installedVersion?: string | null }
): { arrived: boolean; version?: string } => {
  const installed = entity.installedVersion ?? undefined;
  if (record.toVersion && installed === record.toVersion) {
    return { arrived: true, version: installed };
  }
  if (entity.state === "off") {
    return {
      arrived: true,
      version: installed ?? record.toVersion ?? undefined,
    };
  }
  if (entity.state === "unavailable" || entity.state === "unknown") {
    return { arrived: false };
  }
  if (record.fromVersion && installed && installed !== record.fromVersion) {
    return { arrived: true, version: installed };
  }
  return { arrived: false };
};

/** Shortens a long version text for a narrow row; the full text stays in the label. */
export const shortSystemName = (title: string): string =>
  title
    .replace(/^Home Assistant\s+/i, "")
    .replace(/\s+Update$/i, "")
    .trim() || title;
