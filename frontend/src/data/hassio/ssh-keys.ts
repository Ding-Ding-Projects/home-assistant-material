import type { HomeAssistant } from "../../types";

/**
 * How the Supervisor keeps the keys: with the operating system's SSH service,
 * or in a file read by the SSH server of the full hosting mode container. It
 * says "unsupported" when this install has no SSH server to manage; that is an
 * answer, not an error, because the websocket relay drops error status codes.
 */
export type SshAccessMode = "os" | "container" | "unsupported";

const DEFAULT_PORT = 22222;

export interface SshKeysInfo {
  /** Every key as a line of an authorized_keys file. */
  keys: string[];
  mode: SshAccessMode;
  /** The port to connect to: the published one in the full hosting mode. */
  port: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const parseSshKeysInfo = (json: unknown): SshKeysInfo => {
  const data = isRecord(json) ? json : {};
  return {
    keys: Array.isArray(data.keys)
      ? data.keys.filter((key): key is string => typeof key === "string")
      : [],
    mode:
      data.mode === "container" || data.mode === "unsupported"
        ? data.mode
        : "os",
    port:
      typeof data.port === "number" &&
      Number.isInteger(data.port) &&
      data.port > 0 &&
      data.port < 65536
        ? data.port
        : DEFAULT_PORT,
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
