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
  "ok" | "wrong_board" | "not_newer" | "too_large" | "no_space" | "unsupported";

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
}

export const OFFLINE_JOB_NAME = "os_manager_update_from_file";

const VERDICTS: readonly OfflineVerdict[] = [
  "ok",
  "wrong_board",
  "not_newer",
  "too_large",
  "no_space",
  "unsupported",
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const str = (value: unknown): string =>
  typeof value === "string" ? value : "";

/** A verdict the Supervisor sent, or "unsupported" for one this page does not know. */
export const toVerdict = (value: unknown): OfflineVerdict =>
  VERDICTS.includes(value as OfflineVerdict)
    ? (value as OfflineVerdict)
    : "unsupported";

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

export type OfflineStage = "copying" | "installing" | "done" | "failed";

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

/** True for the job this feature starts, found by its name. */
export const isOfflineJob = (job: SupervisorJobData): boolean =>
  job.name === OFFLINE_JOB_NAME;

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
  candidate: Pick<OfflineCandidate, "drive_id" | "path">
): Promise<{ job_id: string }> =>
  hass.callWS({
    type: "supervisor/api",
    endpoint: "/os/offline_update",
    method: "post",
    timeout: null,
    data: { drive_id: candidate.drive_id, path: candidate.path },
  });
