import type { HomeAssistant } from "../../types";

/**
 * How the Supervisor keeps the keys: with the operating system's SSH service,
 * or in a file read by the SSH server of the full hosting mode container.
 */
export type SshAccessMode = "os" | "container";

export interface SshKeysInfo {
  /** Every key as a line of an authorized_keys file. */
  keys: string[];
  mode: SshAccessMode;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const parseSshKeysInfo = (json: unknown): SshKeysInfo => {
  const data = isRecord(json) ? json : {};
  return {
    keys: Array.isArray(data.keys)
      ? data.keys.filter((key): key is string => typeof key === "string")
      : [],
    mode: data.mode === "container" ? "container" : "os",
  };
};

/** The message of a failed Supervisor call, as the Supervisor wrote it. */
export const sshErrorMessage = (error: unknown): string => {
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

/** True when the Supervisor answered that this install has no SSH to manage. */
export const isSshUnsupportedError = (error: unknown): boolean => {
  if (!isRecord(error)) {
    return false;
  }
  return error.code === "not_found" || error.status_code === 404;
};

const call = (
  hass: HomeAssistant,
  endpoint: string,
  method: "get" | "post" | "delete",
  data?: Record<string, unknown>
) =>
  hass.callWS<unknown>({
    type: "supervisor/api",
    endpoint,
    method,
    timeout: null,
    ...(data ? { data } : {}),
  });

export const fetchSshKeys = async (hass: HomeAssistant): Promise<SshKeysInfo> =>
  parseSshKeysInfo(await call(hass, "/os/ssh/authorized_keys", "get"));

export const addSshKey = async (
  hass: HomeAssistant,
  key: string
): Promise<void> => {
  await call(hass, "/os/ssh/authorized_keys", "post", { key });
};

/** The fingerprint goes in the path, in the URL-safe alphabet. */
export const removeSshKey = async (
  hass: HomeAssistant,
  pathFingerprint: string
): Promise<void> => {
  await call(
    hass,
    `/os/ssh/authorized_keys/${encodeURIComponent(pathFingerprint)}`,
    "delete"
  );
};

export const clearSshKeys = async (hass: HomeAssistant): Promise<void> => {
  await call(hass, "/os/ssh/authorized_keys", "delete");
};
