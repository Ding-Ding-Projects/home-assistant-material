import type { HomeAssistant } from "../../types";

/**
 * The cloud host: a tunnel that makes this home reachable from outside the
 * home network. It is managed by the Supervisor and called through the same
 * `supervisor/api` websocket proxy as every other Supervisor call. The sign-in
 * address is only ever held in memory by the page that asked for it.
 */

export type CloudHostState =
  "not_set_up" | "waiting_for_sign_in" | "running" | "paused" | "error";

export interface CloudHostCheck {
  /** ISO time of the last outside check. */
  time: string;
  /** True only when the address answered with status 200. */
  ok: boolean;
  status: number | null;
  /** The name of the failure when the address did not answer. */
  reason: string | null;
}

export interface CloudHostInfo {
  state: CloudHostState;
  hostname: string | null;
  error: string | null;
  last_check: CloudHostCheck | null;
  /** The address of the tunnel container, present only while running. */
  trusted_proxy: string | null;
}

const STATES: readonly CloudHostState[] = [
  "not_set_up",
  "waiting_for_sign_in",
  "running",
  "paused",
  "error",
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const textOrNull = (value: unknown): string | null =>
  typeof value === "string" && value ? value : null;

/** A dotted IPv4 address, or null for anything else. */
export const parseIPv4 = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const parts = value.split(".");
  if (
    parts.length !== 4 ||
    !parts.every(
      (part) => /^(0|[1-9][0-9]{0,2})$/.test(part) && Number(part) <= 255
    )
  ) {
    return null;
  }
  return value;
};

const parseCheck = (value: unknown): CloudHostCheck | null => {
  if (!isRecord(value) || typeof value.time !== "string") {
    return null;
  }
  return {
    time: value.time,
    ok: value.ok === true,
    status:
      typeof value.status === "number" && Number.isFinite(value.status)
        ? value.status
        : null,
    reason: textOrNull(value.reason),
  };
};

/** Reads the state the Supervisor sends. An unknown state is read as an error. */
export const parseCloudHostInfo = (json: unknown): CloudHostInfo => {
  const data = isRecord(json) ? json : {};
  const state = STATES.includes(data.state as CloudHostState)
    ? (data.state as CloudHostState)
    : "error";
  return {
    state,
    hostname: textOrNull(data.hostname),
    error:
      state === "error"
        ? (textOrNull(data.error) ?? "unknown")
        : textOrNull(data.error),
    last_check: parseCheck(data.last_check),
    trusted_proxy: state === "running" ? parseIPv4(data.trusted_proxy) : null,
  };
};

/** The message of a failed Supervisor call, as the Supervisor wrote it. */
export const cloudHostErrorMessage = (error: unknown): string => {
  if (isRecord(error)) {
    if (typeof error.message === "string" && error.message) {
      return error.message;
    }
    if (isRecord(error.body) && typeof error.body.message === "string") {
      return error.body.message;
    }
  }
  return typeof error === "string" ? error : "";
};

const call = (
  hass: HomeAssistant,
  endpoint: string,
  method: "get" | "post",
  data?: Record<string, unknown>
) =>
  hass.callWS<unknown>({
    type: "supervisor/api",
    endpoint,
    method,
    timeout: null,
    ...(data ? { data } : {}),
  });

export const fetchCloudHostInfo = async (
  hass: HomeAssistant
): Promise<CloudHostInfo> =>
  parseCloudHostInfo(await call(hass, "/cloud_host/info", "get"));

/** The pending sign-in address, or null. Held in memory only. */
export const fetchCloudHostSignIn = async (
  hass: HomeAssistant
): Promise<string | null> => {
  const json = await call(hass, "/cloud_host/sign_in", "get");
  return isRecord(json) ? textOrNull(json.sign_in_url) : null;
};

export interface CloudHostSetupResult {
  info: CloudHostInfo;
  signInUrl: string | null;
}

export const setupCloudHost = async (
  hass: HomeAssistant,
  hostname: string
): Promise<CloudHostSetupResult> => {
  const json = await call(hass, "/cloud_host/setup", "post", { hostname });
  return {
    info: parseCloudHostInfo(json),
    signInUrl:
      isRecord(json) && typeof json.sign_in_url === "string"
        ? textOrNull(json.sign_in_url)
        : null,
  };
};

export const pauseCloudHost = async (
  hass: HomeAssistant
): Promise<CloudHostInfo> =>
  parseCloudHostInfo(await call(hass, "/cloud_host/pause", "post"));

export const resumeCloudHost = async (
  hass: HomeAssistant
): Promise<CloudHostInfo> =>
  parseCloudHostInfo(await call(hass, "/cloud_host/resume", "post"));

export const removeCloudHost = async (
  hass: HomeAssistant
): Promise<CloudHostInfo> =>
  parseCloudHostInfo(await call(hass, "/cloud_host/remove", "post"));

export const checkCloudHost = async (
  hass: HomeAssistant
): Promise<CloudHostInfo> =>
  parseCloudHostInfo(await call(hass, "/cloud_host/check", "post"));
