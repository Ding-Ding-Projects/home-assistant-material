import type { SupervisorJobData } from "../../common/app-jobs/app-job-logic";
import type { HomeAssistant } from "../../types";

/**
 * Installing the operating system update from an update file on a USB stick.
 *
 * The Supervisor mounts removable drives, lists the update files it finds and
 * copies the chosen one to the device. It is called through the same
 * `supervisor/api` websocket proxy as every other Supervisor call. The copy
 * and the install run as the Supervisor job `os_manager_update_from_file`.
 */

/** Why a file on a stick can or cannot be installed. */
export type OfflineVerdict =
  | "ok"
  | "wrong_board"
  | "not_newer"
  | "too_large"
  | "no_space"
  | "unsupported"
  | "incomplete"
  | "no_os_part";

/** A single update file, or a pack folder with a manifest and several parts. */
export type OfflineKind = "bundle" | "pack";

export type OfflinePartKind = "supervisor" | "core" | "os";

/** One part a pack lists. A part that is not available has no file. */
export interface OfflinePackPart {
  kind: OfflinePartKind;
  available: boolean;
  file: string;
  size: number;
  version: string;
}

/** The summary of a pack manifest as the Supervisor sends it. */
export interface OfflinePackSummary {
  build: string;
  board: string;
  parts: OfflinePackPart[];
}

export interface OfflineCandidate {
  drive_id: string;
  vendor: string;
  model: string;
  label: string;
  filesystem: string;
  path: string;
  filename: string;
  size: number;
  board: string;
  version: string;
  verdict: OfflineVerdict;
  kind: OfflineKind;
  pack?: OfflinePackSummary;
}

export const OFFLINE_JOB_NAME = "os_manager_update_from_file";
export const OFFLINE_PACK_JOB_NAME = "os_manager_update_from_pack";

const VERDICTS: readonly OfflineVerdict[] = [
  "ok",
  "wrong_board",
  "not_newer",
  "too_large",
  "no_space",
  "unsupported",
  "incomplete",
  "no_os_part",
];

const PART_KINDS: readonly OfflinePartKind[] = ["supervisor", "core", "os"];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const str = (value: unknown): string =>
  typeof value === "string" ? value : "";

/** A verdict the Supervisor sent, or "unsupported" for one this page does not know. */
export const toVerdict = (value: unknown): OfflineVerdict =>
  VERDICTS.includes(value as OfflineVerdict)
    ? (value as OfflineVerdict)
    : "unsupported";

/** Reads the manifest summary of a pack. Parts of an unknown kind are left out. */
export const parsePackSummary = (
  value: unknown
): OfflinePackSummary | undefined => {
  if (!isRecord(value) || !Array.isArray(value.parts)) {
    return undefined;
  }
  const parts: OfflinePackPart[] = [];
  for (const entry of value.parts) {
    if (
      !isRecord(entry) ||
      !PART_KINDS.includes(entry.kind as OfflinePartKind)
    ) {
      continue;
    }
    parts.push({
      kind: entry.kind as OfflinePartKind,
      available: entry.available === true,
      file: str(entry.file),
      size:
        typeof entry.size === "number" && Number.isFinite(entry.size)
          ? entry.size
          : 0,
      version: str(entry.version),
    });
  }
  return {
    build: str(value.build),
    board: str(value.board),
    parts: PART_KINDS.flatMap((kind) =>
      parts.filter((part) => part.kind === kind)
    ),
  };
};

/** Only a file with the verdict "ok" can be installed. */
export const canInstallCandidate = (candidate: OfflineCandidate): boolean =>
  candidate.verdict === "ok";

/**
 * Reads the answer of the candidate list. An entry without a drive or a path
 * cannot be sent back to the Supervisor and is left out.
 */
export const parseCandidates = (json: unknown): OfflineCandidate[] => {
  if (!isRecord(json) || !Array.isArray(json.candidates)) {
    return [];
  }
  const result: OfflineCandidate[] = [];
  for (const entry of json.candidates) {
    if (!isRecord(entry)) {
      continue;
    }
    const driveId = str(entry.drive_id);
    const path = str(entry.path);
    if (!driveId || !path) {
      continue;
    }
    const pack = parsePackSummary(entry.pack);
    if (entry.kind === "pack" && !pack) {
      // A pack without its manifest summary cannot be shown or installed.
      continue;
    }
    const kind: OfflineKind = pack ? "pack" : "bundle";
    result.push({
      drive_id: driveId,
      vendor: str(entry.vendor),
      model: str(entry.model),
      label: str(entry.label),
      filesystem: str(entry.filesystem),
      path,
      filename: str(entry.filename) || path.split("/").pop() || path,
      size:
        typeof entry.size === "number" && Number.isFinite(entry.size)
          ? entry.size
          : 0,
      board: str(entry.board),
      version: str(entry.version),
      verdict: toVerdict(entry.verdict),
      kind,
      pack,
    });
  }
  return result;
};

/** The name of the drive for a row: its label, or vendor and model. */
export const driveName = (candidate: OfflineCandidate): string => {
  const device = [candidate.vendor, candidate.model]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
  const label = candidate.label.trim();
  return label && device ? `${device}, ${label}` : label || device;
};

/** Megabytes with one decimal below ten, otherwise whole. */
export const megabytes = (bytes: number): string => {
  const value = Math.max(0, bytes) / (1024 * 1024);
  return value < 10 ? value.toFixed(1) : String(Math.round(value));
};

/** The reasons the Supervisor gives when it refuses to start. */
export type OfflineErrorKind =
  "not_allowed" | "not_found" | "in_progress" | "other";

const ERROR_KEYS: Record<string, OfflineErrorKind> = {
  hassos_offline_update_not_allowed_error: "not_allowed",
  hassos_offline_update_not_found_error: "not_found",
  hassos_update_in_progress_error: "in_progress",
};

/** Which known error an exception from the Supervisor call is. */
export const offlineErrorKind = (error: unknown): OfflineErrorKind => {
  const body = isRecord(error) && isRecord(error.body) ? error.body : undefined;
  const key =
    (isRecord(error) && typeof error.error_key === "string"
      ? error.error_key
      : undefined) ??
    (body && typeof body.error_key === "string" ? body.error_key : undefined);
  if (key && ERROR_KEYS[key]) {
    return ERROR_KEYS[key];
  }
  const status =
    isRecord(error) && typeof error.status_code === "number"
      ? error.status_code
      : undefined;
  return status === 409 ? "in_progress" : "other";
};

// ----------------------------------------------------------------- progress

export type OfflineStage =
  "verifying" | "copying" | "installing" | "done" | "failed";

export interface OfflineProgress {
  stage: OfflineStage;
  /** 0 to 100 over the copy and the install together. */
  percent: number;
  /** The Supervisor's message when it failed. */
  message?: string;
}

/**
 * What a Supervisor job tells about the copy and the install. The copy takes
 * the first half of the progress and the install the second half. A job that
 * is done without errors is finished; one with errors has failed.
 */
export const progressFromJob = (job: SupervisorJobData): OfflineProgress => {
  const error = job.errors?.find((item) => item.message)?.message ?? undefined;
  if (job.errors?.length && (job.done || error)) {
    return { stage: "failed", percent: clamp(job.progress), message: error };
  }
  if (job.done) {
    return { stage: "done", percent: 100 };
  }
  const installing = job.stage === "installing";
  const fallback = installing ? 50 : 0;
  const raw = typeof job.progress === "number" ? job.progress : fallback;
  const percent = installing
    ? Math.max(50, clamp(raw))
    : Math.min(50, clamp(raw));
  return { stage: installing ? "installing" : "copying", percent };
};

const clamp = (value: number | null | undefined): number =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(100, Math.max(0, Math.round(value)))
    : 0;

/**
 * What the job of a pack tells. The pack job verifies every part first (0 to
 * 40), copies the operating system part (40 to 70) and installs it (70 to
 * 100), using the stage names the Supervisor sets on the job.
 */
export const progressFromPackJob = (
  job: SupervisorJobData
): OfflineProgress => {
  const error = job.errors?.find((item) => item.message)?.message ?? undefined;
  if (job.errors?.length && (job.done || error)) {
    return { stage: "failed", percent: clamp(job.progress), message: error };
  }
  if (job.done) {
    return { stage: "done", percent: 100 };
  }
  const stage: OfflineStage =
    job.stage === "installing" || job.stage === "copying"
      ? job.stage
      : "verifying";
  const [low, high] =
    stage === "installing"
      ? [70, 100]
      : stage === "copying"
        ? [40, 70]
        : [0, 40];
  const raw = typeof job.progress === "number" ? job.progress : low;
  return { stage, percent: Math.min(high, Math.max(low, clamp(raw))) };
};

/** True for the job this feature starts, found by its name. */
export const isOfflineJob = (job: SupervisorJobData): boolean =>
  job.name === OFFLINE_JOB_NAME || job.name === OFFLINE_PACK_JOB_NAME;

/** True for the job that installs a pack. */
export const isOfflinePackJob = (job: SupervisorJobData): boolean =>
  job.name === OFFLINE_PACK_JOB_NAME;

// -------------------------------------------------------------------- packs

/** What happens to one part of a pack. */
export type PackPartOutcome = "installed" | "needs_network" | "skipped";

/**
 * Only the operating system part can be installed from a file; a Supervisor or
 * Core part needs a network because both update by pulling an image. A part
 * the pack does not carry is skipped. This mirrors what the Supervisor does.
 * The Supervisor keeps the per-part result only in the reply of the job and
 * not on the job record, so this page derives it from the pack summary.
 */
export const packPartOutcome = (part: OfflinePackPart): PackPartOutcome => {
  if (!part.available) {
    return "skipped";
  }
  return part.kind === "os" ? "installed" : "needs_network";
};

/** The parts of a pack as rows: each with its version and its outcome. */
export const packRows = (
  pack: OfflinePackSummary
): { part: OfflinePackPart; outcome: PackPartOutcome }[] =>
  pack.parts.map((part) => ({ part, outcome: packPartOutcome(part) }));

/** True when some available part of the pack still needs a network. */
export const packNeedsNetwork = (pack: OfflinePackSummary): boolean =>
  pack.parts.some((part) => packPartOutcome(part) === "needs_network");

// ---------------------------------------------------------------- Supervisor

export interface OfflineUpdateSupport {
  offline_update?: boolean;
}

/** The feature is shown only when the operating system reports it. */
export const offlineUpdateSupported = (
  info: OfflineUpdateSupport | null | undefined
): boolean => info?.offline_update === true;

export const fetchOfflineUpdateCandidates = async (
  hass: HomeAssistant
): Promise<OfflineCandidate[]> =>
  parseCandidates(
    await hass.callWS({
      type: "supervisor/api",
      endpoint: "/os/offline_update/candidates",
      method: "get",
      timeout: null,
    })
  );

/** Sends the drive and path of a candidate back unchanged. */
export const startOfflineUpdate = async (
  hass: HomeAssistant,
  candidate: Pick<OfflineCandidate, "drive_id" | "path" | "kind">
): Promise<{ job_id: string }> =>
  hass.callWS({
    type: "supervisor/api",
    endpoint:
      candidate.kind === "pack"
        ? "/os/offline_update/pack"
        : "/os/offline_update",
    method: "post",
    timeout: null,
    data: { drive_id: candidate.drive_id, path: candidate.path },
  });
