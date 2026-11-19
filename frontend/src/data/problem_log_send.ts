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
