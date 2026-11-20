import type { HomeAssistant } from "../types";

/** How a recorded problem stands towards the repository. */
export type ProblemSendStatus = "sent" | "not_sent" | "held";

export type ProblemSendMode = "by_hand" | "hourly";

export type DeviceSignInState =
  | "pending"
  | "slow_down"
  | "approved"
  | "expired"
  | "denied"
  | "cancelled"
  | "failed";

export interface DeviceSignIn {
  state: DeviceSignInState;
  /** The short code the owner types on the host's device page. */
  user_code: string;
  verification_uri: string;
  expires_at: string | null;
  interval: number;
}

export interface ProblemSendCheck {
  ok: boolean;
  /** A plain code such as "repository_public", or null when the check passed. */
  error: string | null;
  private?: boolean;
  can_push?: boolean;
  at: string;
}

export interface ProblemSendError {
  code: string;
  at: string;
  /** How many problems were waiting when the send failed. */
  waiting: number;
}

/**
 * The state of sending the problem log. The sign-in itself is never part of
 * it: the backend only says whether one is stored.
 */
export interface ProblemSendState {
  enabled: boolean;
  mode: ProblemSendMode;
  repository: string;
  keep_names: boolean;
  client_id: string;
  device_sign_in_available: boolean;
  /** "" for the root of the repository, or "problem-log/" beside other files. */
  folder: string;
  /** Whether the owner's wording is kept for what is sent. Never the wording itself. */
  wording_in_use: boolean;
  signed_in: boolean;
  sign_in_method: "device" | "token" | null;
  last_sent: string | null;
  next_allowed: string | null;
  backoff_until: string | null;
  last_error: ProblemSendError | null;
  last_check: ProblemSendCheck | null;
  last_commit: string | null;
  device: DeviceSignIn | null;
  /** By problem file name. */
  statuses: Record<string, ProblemSendStatus>;
  counts: { all: number; sent: number; not_sent: number; held: number };
}

export interface ProblemSendSettings {
  enabled?: boolean;
  mode?: ProblemSendMode;
  repository?: string;
  keep_names?: boolean;
  client_id?: string;
}

export const fetchProblemSendState = (hass: HomeAssistant) =>
  hass.callWS<ProblemSendState>({ type: "problem_log/send/state" });

export const updateProblemSendSettings = (
  hass: HomeAssistant,
  settings: ProblemSendSettings
) =>
  hass.callWS<ProblemSendState>({
    type: "problem_log/send/update",
    ...settings,
  });

export const setProblemSendToken = (hass: HomeAssistant, token: string) =>
  hass.callWS<ProblemSendState>({ type: "problem_log/send/set_token", token });

export const signOutProblemSend = (hass: HomeAssistant) =>
  hass.callWS<ProblemSendState>({ type: "problem_log/send/sign_out" });

export const startProblemSendDeviceSignIn = (hass: HomeAssistant) =>
  hass.callWS<DeviceSignIn>({ type: "problem_log/send/device_start" });

export const cancelProblemSendDeviceSignIn = (hass: HomeAssistant) =>
  hass.callWS<ProblemSendState>({ type: "problem_log/send/device_cancel" });

export const holdProblem = (hass: HomeAssistant, file: string, held: boolean) =>
  hass.callWS<ProblemSendState>({
    type: "problem_log/send/hold",
    file,
    held,
  });

export const previewProblemSend = (hass: HomeAssistant) =>
  hass.callWS<{ files: Record<string, string> }>({
    type: "problem_log/send/preview",
  });

export const testProblemSend = (hass: HomeAssistant) =>
  hass.callWS<ProblemSendCheck>({ type: "problem_log/send/test" });

export const sendProblemLogNow = (hass: HomeAssistant) =>
  hass.callWS<{ sent: number; commit: string; at: string }>({
    type: "problem_log/send/send_now",
  });

/** One of the owner's repositories, as the sign-in sees it. */
export interface ProblemSendRepository {
  full_name: string;
  owner: string;
  name: string;
  /** Only a private repository can be chosen; the server refuses any other. */
  private: boolean;
  visibility: string;
  can_push: boolean;
  /** Whether it already holds files; the log then goes in its own folder. */
  has_files: boolean;
  pushed_at: string | null;
  selected: boolean;
}

export interface ProblemSendRepositoryList {
  repositories: ProblemSendRepository[];
  /** How many repositories were read in all, before the search. */
  total: number;
  /** Organizations seen in the list, where a new repository can be made. */
  organizations: string[];
  /** True when there were more repositories than are read. */
  truncated: boolean;
  /** The permission the sign-in lacks to see private repositories, or null. */
  missing_scope: string | null;
}

export const listProblemSendRepositories = (
  hass: HomeAssistant,
  query: string,
  refresh = false
) =>
  hass.callWS<ProblemSendRepositoryList>({
    type: "problem_log/send/repositories",
    query,
    refresh,
  });

export const chooseProblemSendRepository = (
  hass: HomeAssistant,
  repository: string
) =>
  hass.callWS<ProblemSendState>({
    type: "problem_log/send/choose",
    repository,
  });

export const createProblemSendRepository = (
  hass: HomeAssistant,
  name: string,
  organization: string | null
) =>
  hass.callWS<ProblemSendState>({
    type: "problem_log/send/create",
    name,
    organization,
  });

/**
 * Keeps the owner's checked wording on the server for what is sent, or
 * deletes the kept copy when given null.
 */
export const setProblemSendWording = (
  hass: HomeAssistant,
  entries: Record<string, string> | null
) =>
  hass.callWS<ProblemSendState>({
    type: "problem_log/send/wording",
    entries,
  });
