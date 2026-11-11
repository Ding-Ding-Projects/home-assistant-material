import type { HomeAssistant } from "../types";

/**
 * The permanent record of the Activity page, kept in a Git repository inside
 * the configuration folder. See docs/features/activity-record/README.md.
 */

export interface ActivityRecordEntry {
  /** ISO time in UTC. */
  when: string;
  kind: "state_change" | "logbook" | "dropped" | "unwritable" | "restored";
  name?: string;
  message?: string;
  entity_id?: string;
  domain?: string;
  state?: string;
  context_id?: string | null;
  context_parent_id?: string | null;
  context_user_id?: string | null;
  context_entity_id?: string;
  context_entity_id_name?: string;
  context_domain?: string;
  context_service?: string;
  context_name?: string;
  context_message?: string;
  context_source?: string;
  count?: number;
  first_at?: string;
  last_at?: string;
  /** Set when text or details of the entry were cut for length. */
  cut?: boolean;
  when_raw?: string;
}

export interface ActivityRecordStatus {
  path: string;
  recording: boolean;
  entries_today: number;
  entries_total: number;
  files: number;
  bytes: number;
  uncommitted_entries: number;
  queue_depth: number;
  dropped_total: number;
  commit_interval: number;
  last_error: string | null;
  last_error_at: number | null;
  /** True while a failed write waits to be tried again. */
  retrying: boolean;
  /** True when another Home Assistant holds the record folder. */
  lock_held: boolean;
  days: number;
  restores: ActivityRecordRestore[];
  push: ActivityRecordPushProgress | null;
  /** Folder outside the record that holds the SSH key and known hosts. */
  ssh_dir: string | null;
  last_commit: {
    sha: string;
    short: string;
    timestamp: number;
    message: string;
  } | null;
  remote: string | null;
  remote_unusable: boolean;
  last_push: { at: number; ok: boolean; error: string | null } | null;
}

export interface ActivityRecordRestore {
  at: number;
  path: string;
  what: string;
}

export interface ActivityRecordPushProgress {
  running: boolean;
  step: number;
  steps: number;
  error: string | null;
}

export interface ActivityRecordDay {
  day: string;
  entries: number;
  bytes: number;
  chunks: number;
}

export interface ActivityRecordDays {
  days: ActivityRecordDay[];
  total: number;
  offset: number;
}

export interface ActivityRecordPage {
  day: string;
  entries: ActivityRecordEntry[];
  total: number;
  limit: number;
  has_more: boolean;
  /** Position to continue from, or null when there is nothing older. */
  next_cursor: string | null;
}

export interface ActivityRecordSearchParams {
  start?: string;
  end?: string;
  entity_id?: string;
  text?: string;
  limit?: number;
  max_bytes?: number;
}

export interface ActivityRecordSearchResult {
  entries: ActivityRecordEntry[];
  truncated: boolean;
  reason: "rows" | "bytes" | "cancelled" | null;
  scanned_bytes: number;
  scanned_days: number;
}

/** Entries fetched for one page of a day. */
export const ACTIVITY_RECORD_PAGE_SIZE = 200;

export const fetchActivityRecordStatus = (hass: HomeAssistant) =>
  hass.callWS<ActivityRecordStatus>({ type: "activity_record/status" });

export const fetchActivityRecordDays = (hass: HomeAssistant) =>
  hass.callWS<ActivityRecordDays>({ type: "activity_record/days" });

export const fetchActivityRecordDay = (
  hass: HomeAssistant,
  day: string,
  cursor?: string | null,
  limit = ACTIVITY_RECORD_PAGE_SIZE
) =>
  hass.callWS<ActivityRecordPage>({
    type: "activity_record/read",
    day,
    ...(cursor ? { cursor } : {}),
    limit,
    newest_first: true,
  });

export const searchActivityRecord = (
  hass: HomeAssistant,
  params: ActivityRecordSearchParams
) =>
  hass.callWS<ActivityRecordSearchResult>({
    type: "activity_record/search",
    ...params,
  });

export const setActivityRecordRemote = (
  hass: HomeAssistant,
  url: string | null
) =>
  hass.callWS<undefined>({
    type: "activity_record/set_remote",
    url,
  });

/** Starts the push in the background; progress is on the status. */
export const pushActivityRecord = (hass: HomeAssistant) =>
  hass.callWS<{ started: boolean }>({
    type: "activity_record/push",
  });

/** The code of a WebSocket error, when it has one. */
export const activityRecordErrorCode = (err: unknown): string | undefined => {
  const code = (err as { code?: unknown } | undefined)?.code;
  return typeof code === "string" ? code : undefined;
};

/** The day (YYYY-MM-DD) of an entry, in UTC, as the record files it. */
export const activityRecordDay = (entry: ActivityRecordEntry): string =>
  entry.when.slice(0, 10);

/** True for YYYY-MM-DD. */
export const isActivityRecordDay = (day: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(day);

/** Bytes as a short human text; the unit is kept in English letters. */
export const formatRecordSize = (bytes: number): string => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
};
