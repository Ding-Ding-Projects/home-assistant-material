import type { HomeAssistant } from "../types";

/** How a linked file is fetched: every time it is used, or kept for ten minutes. */
export type LinkedFetchRule = "each_time" | "keep";

export type LinkedKind = "audio" | "video" | "image";

/** The plain reasons the server gives when a linked file cannot be fetched. */
export type LinkedFailureReason =
  | "not_found"
  | "http_error"
  | "timeout"
  | "cannot_connect"
  | "too_large"
  | "unsupported_type"
  | "playlist_not_supported"
  | "too_many_redirects"
  | "internal_address"
  | "blocked_address"
  | "invalid_address"
  | "live_stream"
  | "live_no_position";

export interface LinkedFileStatus {
  in_use: boolean;
  readers: number;
  fetched_at: string | null;
  /** The media player that asked for the file, while it is being used. */
  playing_on: string | null;
  /** Bytes of this file on this system right now; 0 means nothing is stored. */
  stored_bytes: number;
  kept_until_reuse: boolean;
  files_handed_out: number;
}

export interface LinkedFile {
  id: string;
  name: string;
  /** Only the host of the web address. */
  host: string;
  kind: LinkedKind;
  content_type: string;
  fetch: LinkedFetchRule;
  max_size_mb: number;
  home_network: boolean;
  /** A sound with no length, such as internet radio: streamed, never stored. */
  live: boolean;
  created_at: string;
  last_used_at: string | null;
  /** A media player entity ID, "action" or "player". */
  last_used_by: string | null;
  last_failure_at: string | null;
  last_failure_reason: LinkedFailureReason | null;
  last_failure_status: number | null;
  last_checked_at: string | null;
  reachable: boolean | null;
  status: LinkedFileStatus;
  /** Admins only: the address, with everything after the host hidden when it holds a sign-in or key. */
  address?: string;
  address_hidden?: boolean;
}

export interface LinkedCheck {
  reachable: boolean;
  kind?: LinkedKind;
  content_type?: string;
  size?: number | null;
  elapsed_ms?: number;
  live?: boolean;
  reason?: LinkedFailureReason;
  status?: number | null;
  file?: LinkedFile;
}

export interface LinkedAddResult {
  added: boolean;
  check: LinkedCheck;
  file?: LinkedFile;
}

export interface LinkedFileSettings {
  name?: string;
  fetch?: LinkedFetchRule;
  max_size_mb?: number;
  home_network?: boolean;
}

export const DEFAULT_LINKED_MAX_SIZE_MB = 200;

export const fetchLinkedFiles = (hass: HomeAssistant) =>
  hass.callWS<{ files: LinkedFile[] }>({ type: "linked_media/list" });

export const fetchLinkedFileStatus = (hass: HomeAssistant, fileId: string) =>
  hass.callWS<LinkedFile>({ type: "linked_media/status", file_id: fileId });

export const checkLinkedAddress = (
  hass: HomeAssistant,
  address: string,
  homeNetwork: boolean,
  maxSizeMb: number
) =>
  hass.callWS<LinkedCheck>({
    type: "linked_media/check",
    address,
    home_network: homeNetwork,
    max_size_mb: maxSizeMb,
  });

export const checkLinkedFile = (hass: HomeAssistant, fileId: string) =>
  hass.callWS<LinkedCheck>({ type: "linked_media/check", file_id: fileId });

export const addLinkedFile = (
  hass: HomeAssistant,
  data: {
    name: string;
    address: string;
    fetch: LinkedFetchRule;
    max_size_mb: number;
    home_network: boolean;
  }
) => hass.callWS<LinkedAddResult>({ type: "linked_media/add", ...data });

export const updateLinkedFile = (
  hass: HomeAssistant,
  fileId: string,
  settings: LinkedFileSettings
) =>
  hass.callWS<LinkedFile>({
    type: "linked_media/update",
    file_id: fileId,
    ...settings,
  });

export const removeLinkedFile = (hass: HomeAssistant, fileId: string) =>
  hass.callWS<null>({ type: "linked_media/remove", file_id: fileId });
