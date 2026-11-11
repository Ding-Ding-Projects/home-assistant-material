import { redactDetails } from "../../common/activity/redact-details";

/**
 * Pure rules for showing an update install. Nothing here talks to the server:
 * it turns what the update entity and the connection report into a stage, and
 * builds the plain-text problem summary a person can copy.
 *
 * Rules kept for every caller:
 * - A percentage is shown only when the entity reports one.
 * - A stage is only claimed when a real signal says so: the backup manager
 *   reports a backup, the socket is down, the entity reports an install, or
 *   the installed version is read back after the instance returns.
 */

export type UpdateStage =
  | "backing_up"
  | "preparing"
  | "installing"
  | "waiting"
  | "checking"
  | "done"
  | "failed";

/** The steps in the order they happen, for the step list. */
export const UPDATE_STAGE_ORDER: readonly UpdateStage[] = [
  "backing_up",
  "installing",
  "waiting",
  "checking",
  "done",
];

export interface UpdateStageInput {
  /** The entity's `in_progress` attribute. */
  inProgress: boolean;
  /** The entity supports the progress feature. */
  supportsProgress: boolean;
  /** The entity's `update_percentage`, null when it reports none. */
  percentage: number | null | undefined;
  /** The person asked for a backup before the update. */
  backupRequested: boolean;
  /** The backup manager's state, when it is known. */
  backupState?: string;
  /** The websocket is down right now. */
  disconnected: boolean;
  /** The install call has been sent and has not answered yet. */
  callPending: boolean;
  /** The entity has reported `in_progress` at least once during this run. */
  seenInProgress: boolean;
  /** Raw error text of an install call that really failed. */
  callError?: string;
  installedVersion: string | null | undefined;
  /** The version the install was started for, when the entity named one. */
  targetVersion: string | null | undefined;
  /** The installed version when the install was started. */
  fromVersion: string | null | undefined;
  /** The wait for the new version to show up has run out. */
  graceExpired: boolean;
}

export interface UpdateStageResult {
  stage: UpdateStage;
  /** A whole percentage, only when the entity really reported one. */
  percent?: number;
}

/** A whole percentage from the entity, or undefined when it reports none. */
export const entityPercent = (
  supportsProgress: boolean,
  percentage: number | null | undefined
): number | undefined => {
  if (
    !supportsProgress ||
    typeof percentage !== "number" ||
    !Number.isFinite(percentage)
  ) {
    return undefined;
  }
  return Math.min(100, Math.max(0, Math.floor(percentage)));
};

/** True when the installed version shows that the update took effect. */
export const versionTookEffect = (
  installed: string | null | undefined,
  target: string | null | undefined,
  from: string | null | undefined
): boolean => {
  if (!installed) {
    return false;
  }
  if (target) {
    return installed === target;
  }
  return installed !== from;
};

export const deriveUpdateStage = (
  input: UpdateStageInput
): UpdateStageResult => {
  if (input.callError) {
    return { stage: "failed" };
  }
  if (input.disconnected) {
    return { stage: "waiting" };
  }
  if (input.inProgress) {
    if (input.backupRequested && input.backupState === "create_backup") {
      return { stage: "backing_up" };
    }
    const percent = entityPercent(input.supportsProgress, input.percentage);
    if (percent !== undefined) {
      return { stage: "installing", percent };
    }
    // The entity supports progress but has not reported any yet, for example
    // while the backup is still being made.
    if (input.supportsProgress) {
      return { stage: "preparing" };
    }
    return { stage: "installing" };
  }
  if (
    versionTookEffect(
      input.installedVersion,
      input.targetVersion,
      input.fromVersion
    )
  ) {
    return { stage: "done" };
  }
  if (input.callPending && !input.seenInProgress) {
    return { stage: "preparing" };
  }
  return { stage: input.graceExpired ? "failed" : "checking" };
};

/** The error code the websocket library gives when the socket drops. */
export const ERR_CONNECTION_LOST_CODE = 3;

/**
 * An install call can fail only because the socket dropped while the instance
 * restarted. That is not a failed install, the version is checked afterwards.
 */
export const isConnectionLostError = (err: unknown): boolean =>
  typeof err === "object" &&
  err !== null &&
  (err as { code?: unknown }).code === ERR_CONNECTION_LOST_CODE;

export const errorText = (err: unknown): string => {
  if (typeof err === "string") {
    return err;
  }
  if (typeof err === "object" && err !== null) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message) {
      return message;
    }
  }
  return String(err);
};

export interface ProblemSummaryLabels {
  heading: string;
  what: string;
  from: string;
  to: string;
  stage: string;
  error: string;
  instance: string;
  time: string;
  unknown: string;
}

export interface ProblemSummaryInput {
  title: string;
  fromVersion: string | null | undefined;
  toVersion: string | null | undefined;
  stage: string;
  error: string | undefined;
  instanceVersion: string;
  /** Already formatted, for example an ISO time. */
  time: string;
}

/**
 * Plain text for a person to paste into a bug report or hand to a helper.
 * Everything that may carry a credential goes through the same redaction as
 * the copied failure details, and nothing else about the instance is added.
 */
export const buildProblemSummary = (
  input: ProblemSummaryInput,
  labels: ProblemSummaryLabels
): string => {
  const line = (label: string, value: string | null | undefined): string =>
    `${label}: ${redactDetails(value || labels.unknown)}`;
  return [
    labels.heading,
    "",
    line(labels.what, input.title),
    line(labels.from, input.fromVersion),
    line(labels.to, input.toVersion),
    line(labels.stage, input.stage),
    line(labels.error, input.error),
    line(labels.instance, input.instanceVersion),
    line(labels.time, input.time),
  ].join("\n");
};
