import type {
  CloudHostInfo,
  CloudHostState,
} from "../../../data/hassio/cloud-host";

/** The server's own wording when a tunnel client is not wired up yet. */
export const RUNNER_NOT_INSTALLED = "tunnel runner not installed";

/** How often the page asks while it waits for the sign-in to finish. */
export const SIGN_IN_POLL_MS = 5000;

// Same rule as the Supervisor: letters, digits and inner hyphens in each label,
// two or more labels, the last label starting with a letter.
const RE_HOSTNAME =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** The lowercase name without a trailing dot, or undefined when it is not a plain DNS name. */
export const normalizeHostname = (value: string): string | undefined => {
  const name = value.trim().toLowerCase().replace(/\.$/, "");
  return RE_HOSTNAME.test(name) ? name : undefined;
};

export type HostnameProblem = "empty" | "invalid";

/** Why a typed address cannot be used, or undefined when it can. */
export const hostnameProblem = (value: string): HostnameProblem | undefined => {
  if (!value.trim()) {
    return "empty";
  }
  return normalizeHostname(value) ? undefined : "invalid";
};

export type StepId =
  "service" | "sign_in" | "address" | "proxy" | "outside_check";

export const STEP_IDS: readonly StepId[] = [
  "service",
  "sign_in",
  "address",
  "proxy",
  "outside_check",
];

export type StepStatus = "done" | "current" | "pending" | "failed";

export interface Step {
  id: StepId;
  status: StepStatus;
}

/**
 * The live list of what set up does, from the real state. Nothing is marked
 * done that the Supervisor has not reported: the trusted proxy step is a
 * setting in the core configuration that this page cannot read, so it stays
 * pending until the outside check has answered.
 */
export const buildSteps = (info: CloudHostInfo | undefined): Step[] => {
  const state: CloudHostState = info?.state ?? "not_set_up";
  const checked = info?.last_check?.ok === true;
  const statuses: Record<StepId, StepStatus> = {
    service: "pending",
    sign_in: "pending",
    address: "pending",
    proxy: "pending",
    outside_check: "pending",
  };
  switch (state) {
    case "not_set_up":
      statuses.service = "current";
      break;
    case "waiting_for_sign_in":
      statuses.service = "done";
      statuses.address = "done";
      statuses.sign_in = "current";
      break;
    case "running":
    case "paused":
      statuses.service = "done";
      statuses.sign_in = "done";
      statuses.address = "done";
      statuses.proxy = checked ? "done" : "current";
      statuses.outside_check = checked ? "done" : "current";
      break;
    case "error":
      if (info?.error === RUNNER_NOT_INSTALLED) {
        statuses.service = "failed";
      } else if (info?.hostname) {
        statuses.service = "done";
        statuses.address = "done";
        statuses.sign_in = "failed";
      } else {
        statuses.service = "failed";
      }
      break;
  }
  return STEP_IDS.map((id) => ({ id, status: statuses[id] }));
};

export type CloudHostAction =
  "setup" | "open_sign_in" | "pause" | "resume" | "remove" | "check";

/** Which buttons make sense in a state; mirrors what the Supervisor accepts. */
export const allowedActions = (
  state: CloudHostState,
  hasHostname: boolean
): CloudHostAction[] => {
  switch (state) {
    case "not_set_up":
      return ["setup"];
    case "waiting_for_sign_in":
      return ["open_sign_in", "remove"];
    case "running":
      return ["check", "pause", "remove"];
    case "paused":
      return ["resume", "remove"];
    default:
      return hasHostname ? ["resume", "remove"] : ["setup"];
  }
};

/** The page asks again by itself only while it waits for the sign-in. */
export const shouldPoll = (state: CloudHostState | undefined): boolean =>
  state === "waiting_for_sign_in";

/** The sign-in address may only be opened when it is a plain https address. */
export const isSafeSignInUrl = (value: string | null | undefined): boolean => {
  if (!value) {
    return false;
  }
  try {
    return new URL(value).protocol === "https:";
  } catch (_err) {
    return false;
  }
};
