import type { HomeAssistant } from "../../../../../types";

/**
 * Going back to an older Core build. The Supervisor holds the rule: it makes
 * and checks a backup before it installs an older version, whatever the page
 * asks, and it only skips that backup for a single-use pass it issued itself.
 * This module talks to it and turns its answers into what the page shows.
 */

/** What the Supervisor reports about the latest going back. */
export interface DowngradeState {
  from_version: string;
  to_version: string;
  /** When it started, as an ISO time. */
  started: string;
  stage:
    | "waiting_for_backup"
    | "backing_up"
    | "checking"
    | "backup_checked"
    | "backup_skipped"
    | "installing"
    | "failed";
  backup: { slug: string; date: string; size_bytes: number } | null;
  skipped_by_pass: boolean;
  reason: string | null;
  detail: string | null;
}

export const fetchDowngradeState = async (
  hass: HomeAssistant
): Promise<DowngradeState | null> => {
  const result = await hass.callWS<{ downgrade: DowngradeState | null }>({
    type: "supervisor/api",
    endpoint: "/core/downgrade_status",
    method: "get",
  });
  return result?.downgrade ?? null;
};

/**
 * Starts going back. The backup is always asked for; the Supervisor makes it
 * for an older version anyway. With a pass, the Supervisor skips the backup
 * once. Core adds the signed-in user as the holder of the pass. The call
 * returns as soon as the request has been checked.
 */
export const startGoingBack = (
  hass: HomeAssistant,
  version: string,
  skipBackupPass?: string
): Promise<{ job_id?: string } | null> =>
  hass.callWS({
    type: "supervisor/api",
    endpoint: "/core/update",
    method: "post",
    timeout: null,
    data: {
      version,
      backup: true,
      background: true,
      ...(skipBackupPass ? { skip_backup_pass: skipBackupPass } : {}),
    },
  });

/** Asks the Supervisor for a single-use pass to go back without a backup. */
export const requestSkipPass = async (
  hass: HomeAssistant,
  version: string
): Promise<string> => {
  const result = await hass.callWS<{ skip_backup_pass: string }>({
    type: "supervisor/api",
    endpoint: "/core/downgrade_pass",
    method: "post",
    data: { version },
  });
  return result.skip_backup_pass;
};

/** Stops a going back before anything is installed. */
export const stopGoingBack = (hass: HomeAssistant): Promise<void> =>
  hass.callWS({
    type: "supervisor/api",
    endpoint: "/core/downgrade_stop",
    method: "post",
  });

/** Whether `state` belongs to the going back started after `before` was read. */
export const isNewDowngrade = (
  before: DowngradeState | null | undefined,
  state: DowngradeState | null | undefined,
  version: string
): boolean =>
  !!state &&
  state.to_version === version &&
  (!before || before.started !== state.started);

export type BackupStepView =
  "waiting" | "running" | "checking" | "done" | "skipped" | "failed";

export const FAILURE_REASONS = [
  "failed",
  "timed_out",
  "check_failed",
  "stopped",
] as const;

export type FailureReason = (typeof FAILURE_REASONS)[number] | "unknown";

export interface GoingBackView {
  backup: BackupStepView;
  /** The second step: waiting for the backup, or installing. */
  install: "waiting" | "running";
  reason?: FailureReason;
  detail?: string;
  /** When the checked backup was made, in milliseconds. */
  backupAt?: number;
  backupSize?: number;
  /** The checked backup's id, when the Supervisor reports it. */
  backupId?: string;
  /** When going back started, in milliseconds. */
  startedAt?: number;
}

const parseTime = (value: string | null | undefined): number | undefined => {
  const ms = value ? Date.parse(value) : NaN;
  return Number.isFinite(ms) ? ms : undefined;
};

/** What the two steps show for a state reported by the Supervisor. */
export const goingBackView = (
  state: DowngradeState | null | undefined
): GoingBackView => {
  if (!state) {
    return { backup: "waiting", install: "waiting" };
  }
  const startedAt = parseTime(state.started);
  const backupAt = parseTime(state.backup?.date);
  const backupSize = state.backup?.size_bytes;
  const backupId = state.backup?.slug || undefined;
  switch (state.stage) {
    case "waiting_for_backup":
      return { backup: "waiting", install: "waiting", startedAt };
    case "backing_up":
      return { backup: "running", install: "waiting", startedAt };
    case "checking":
      return { backup: "checking", install: "waiting", startedAt };
    case "backup_checked":
      return {
        backup: "done",
        install: "waiting",
        startedAt,
        backupAt,
        backupSize,
        backupId,
      };
    case "backup_skipped":
      return { backup: "skipped", install: "running", startedAt };
    case "installing":
      return state.skipped_by_pass || !state.backup
        ? { backup: "skipped", install: "running", startedAt }
        : {
            backup: "done",
            install: "running",
            startedAt,
            backupAt,
            backupSize,
            backupId,
          };
    case "failed": {
      const reason = (FAILURE_REASONS as readonly string[]).includes(
        state.reason ?? ""
      )
        ? (state.reason as FailureReason)
        : "unknown";
      return {
        backup: "failed",
        install: "waiting",
        reason,
        detail: state.detail ?? undefined,
        startedAt,
      };
    }
    default:
      return { backup: "waiting", install: "waiting", startedAt };
  }
};

/** Whether the Supervisor has moved on to installing the older build. */
export const installStarted = (view: GoingBackView): boolean =>
  view.install === "running";

/** Minutes and seconds, as "1:52". */
export const formatElapsed = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`;
};
