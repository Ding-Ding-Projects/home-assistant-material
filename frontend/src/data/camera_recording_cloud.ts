import type { HomeAssistant } from "../types";

/** The cloud drives camera recordings can be sent to, each through its own integration. */
export type CloudDriveDomain = "onedrive" | "google_drive";

export type CloudSendChoice = "events" | "everything";

/** Product names are shown as they are in every language. */
export const CLOUD_DRIVE_NAMES: Record<CloudDriveDomain, string> = {
  onedrive: "OneDrive",
  google_drive: "Google Drive",
};

export const CLOUD_KEEP_DAYS_RANGE = { min: 1, max: 365, default: 30 };

export interface CloudDriveStatus {
  domain: CloudDriveDomain;
  set_up: boolean;
  loaded: boolean;
  enabled: boolean;
  send: CloudSendChoice;
  /** Null keeps files on the drive for ever. */
  keep_days: number | null;
  enabled_at: number | null;
  folder: string[];
  waiting_files: number;
  waiting_bytes: number;
  sent_files: number;
  sent_bytes: number;
  given_up: number;
  last_sent: {
    entity_id: string;
    name: string;
    kind: string;
    at: number;
  } | null;
  last_problem: { reason: string; at: number } | null;
  free_bytes: number | null;
}

export interface CloudUploadStatus {
  drives: CloudDriveStatus[];
}

export interface CloudDriveChange {
  enabled?: boolean;
  /** Required by the server whenever a drive is turned on. */
  video_leaves_home_confirmed?: boolean;
  send?: CloudSendChoice;
  keep_days?: number | null;
}

export const fetchCloudUploadStatus = (hass: Pick<HomeAssistant, "callWS">) =>
  hass.callWS<CloudUploadStatus>({ type: "camera_recording/cloud/status" });

export const setCloudDrive = (
  hass: Pick<HomeAssistant, "callWS">,
  drive: CloudDriveDomain,
  change: CloudDriveChange
) =>
  hass.callWS<CloudUploadStatus>({
    type: "camera_recording/cloud/set",
    drive,
    ...change,
  });

/** Reason codes the server reports; anything else is shown as unexpected. */
export const CLOUD_PROBLEM_REASONS = [
  "not_set_up",
  "not_loaded",
  "not_supported",
  "sign_in",
  "refused",
  "timed_out",
  "check_failed",
  "drive_error",
  "file_gone",
  "gave_up",
  "unexpected",
] as const;

export const cloudProblemKey = (reason: string): string =>
  (CLOUD_PROBLEM_REASONS as readonly string[]).includes(reason)
    ? reason
    : "unexpected";
