import type { HomeAssistant } from "../types";

/**
 * The permanent record of the Activity page, kept in a Git repository inside
 * the configuration folder. See docs/features/activity-record/README.md.
 */

export interface ActivityRecordEntry {
  /** ISO time in UTC. */
  when: string;
  kind: "state_change" | "logbook" | "dropped";
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

export interface ActivityRecordDay {
  day: string;
  entries: number;
  bytes: number;
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
  offset: number;
  limit: number;
  has_more: boolean;
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
  reason: "rows" | "bytes" | null;
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
  offset = 0,
  limit = ACTIVITY_RECORD_PAGE_SIZE
) =>
  hass.callWS<ActivityRecordPage>({
    type: "activity_record/read",
    day,
    offset,
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

export const pushActivityRecord = (hass: HomeAssistant) =>
  hass.callWS<{ pushed: boolean; time: number }>({
    type: "activity_record/push",
  });

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
