import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import type { HomeAssistant } from "../types";

export interface AutoUpdateResult {
  time: string;
  version: string | null;
  ok: boolean;
  error: string | null;
}

export interface AutoUpdateEntity {
  entity_id: string;
  // Whether automatic updating applies, counting the switch for everything.
  enabled: boolean;
  // The entity's own choice, or null when it follows the switch for everything.
  override: boolean | null;
  // False for the updates that restart the system.
  allowed: boolean;
  protected_reason: string | null;
  last_result: AutoUpdateResult | null;
  // Added with the backup choice; missing on an older server.
  backup_kind?: BackupKind;
  backup_app?: string | null;
  backup_supported?: boolean;
  backup_first?: boolean;
}

export type BackupKind =
  "core" | "supervisor" | "os" | "app" | "integration" | "device";

export type BackupChoiceName = "system" | "all" | "none" | "custom";

export type AutoSystemPartName = "supervisor" | "core" | "os";

export const AUTO_SYSTEM_PARTS: AutoSystemPartName[] = [
  "supervisor",
  "core",
  "os",
];

export const AUTO_SYSTEM_MAX_WAIT_DAYS = 14;

export interface AutoSystemFailure {
  version: string | null;
  error: string | null;
  time: string | null;
}

export interface AutoSystemPart {
  part: AutoSystemPartName;
  entity_id: string;
  enabled: boolean;
  available: boolean;
  installed_version: string | null;
  latest_version: string | null;
  update_available: boolean;
  skipped: boolean;
  // When the version has waited long enough; null until it has been seen.
  eligible_at: string | null;
  failed: AutoSystemFailure | null;
  last_result: AutoUpdateResult | null;
  // The Supervisor's own flag, which installs it outside these switches;
  // null when unknown or not the Supervisor. Missing on an older server.
  self_update?: boolean | null;
}

/** Whether the Supervisor still updates itself outside the owner's switches. */
export const autoSystemSupervisorSelfUpdate = (
  system: AutoSystemInfo
): boolean =>
  system.parts.some(
    (part) => part.part === "supervisor" && part.self_update === true
  );

export interface AutoSystemInfo {
  enabled: Record<AutoSystemPartName, boolean>;
  // 24-hour clock times in the home's time zone.
  window: { start: string; end: string };
  wait_days: number;
  next_window: {
    start: string;
    end: string;
    open: boolean;
    // Days from today, in the home's time zone, until the window opens.
    day_offset: number;
  };
  parts: AutoSystemPart[];
}

export interface AutoUpdateInfo {
  all: boolean;
  backup: boolean;
  // Added with the backup choice; missing on an older server.
  backup_kinds?: Record<BackupKind, boolean>;
  backup_choice?: BackupChoiceName;
  backup_apps?: string[];
  backup_apps_seen?: string[];
  backup_apps_later?: boolean;
  entities: AutoUpdateEntity[];
  // Missing on a server that predates automatic system updates.
  system?: AutoSystemInfo;
}

export const subscribeAutoUpdate = (
  hass: HomeAssistant,
  callback: (info: AutoUpdateInfo) => void
): Promise<UnsubscribeFunc> =>
  hass.connection.subscribeMessage<AutoUpdateInfo>(callback, {
    type: "auto_update/subscribe",
  });

export const setAutoUpdateAll = (
  hass: HomeAssistant,
  enabled: boolean
): Promise<void> => hass.callWS({ type: "auto_update/set_all", enabled });

export const setAutoUpdateBackup = (
  hass: HomeAssistant,
  enabled: boolean
): Promise<void> => hass.callWS({ type: "auto_update/set_backup", enabled });

export const setAutoUpdateBackupChoice = (
  hass: HomeAssistant,
  choice: Exclude<BackupChoiceName, "custom">
): Promise<void> =>
  hass.callWS({ type: "auto_update/set_backup_choice", choice });

export const setAutoUpdateBackupKind = (
  hass: HomeAssistant,
  kind: BackupKind,
  enabled: boolean
): Promise<void> =>
  hass.callWS({ type: "auto_update/set_backup_kind", kind, enabled });

export const setAutoUpdateBackupApps = (
  hass: HomeAssistant,
  apps: string[],
  installed: string[],
  later: boolean
): Promise<void> =>
  hass.callWS({ type: "auto_update/set_backup_apps", apps, installed, later });

export const setAutoUpdateEntity = (
  hass: HomeAssistant,
  entityId: string,
  enabled: boolean | null
): Promise<void> =>
  hass.callWS({
    type: "auto_update/set_entity",
    entity_id: entityId,
    enabled,
  });

export const setAutoUpdateSystem = (
  hass: HomeAssistant,
  part: AutoSystemPartName,
  enabled: boolean
): Promise<void> =>
  hass.callWS({ type: "auto_update/set_system", part, enabled });

export const setAutoUpdateSystemWindow = (
  hass: HomeAssistant,
  start: string,
  end: string
): Promise<void> =>
  hass.callWS({ type: "auto_update/set_system_window", start, end });

export const setAutoUpdateSystemWait = (
  hass: HomeAssistant,
  days: number
): Promise<void> => hass.callWS({ type: "auto_update/set_system_wait", days });

export const retryAutoUpdateSystem = (
  hass: HomeAssistant,
  part: AutoSystemPartName
): Promise<void> => hass.callWS({ type: "auto_update/retry_system", part });

/** How an "Update everything" run stands, as the shared record reports it. */
export type UpdateRunState = "running" | "done" | "failed" | "cancelled";

/**
 * The display record of an "Update everything" run. The browser that started
 * the run drives it; other browsers only show this. It never installs anything.
 */
export interface UpdateRunRecord {
  entity_ids: string[];
  /** The 1-based place of the update being worked on. */
  position: number;
  total: number;
  state: UpdateRunState;
  current: string | null;
  started: string;
  updated: string;
}

export interface UpdateRunReport {
  entity_ids: string[];
  position: number;
  state: UpdateRunState;
  current: string | null;
}

export const subscribeUpdateRun = (
  hass: HomeAssistant,
  callback: (run: UpdateRunRecord | null) => void
): Promise<UnsubscribeFunc> =>
  hass.connection.subscribeMessage<{ run: UpdateRunRecord | null }>(
    (message) => callback(message.run),
    { type: "auto_update/run/subscribe" }
  );

export const setUpdateRun = (
  hass: HomeAssistant,
  report: UpdateRunReport
): Promise<void> => hass.callWS({ type: "auto_update/run/set", ...report });

export const clearUpdateRun = (hass: HomeAssistant): Promise<void> =>
  hass.callWS({ type: "auto_update/run/clear" });

export interface AutoUpdateRowState {
  checked: boolean;
  disabled: boolean;
  // Why the switch is disabled, when it is.
  reason?: "restarts_system" | "unknown";
}

/**
 * What one row's switch shows: its own choice when it has one, otherwise the
 * switch for everything. An update that restarts the system is always off.
 */
export const autoUpdateRowState = (
  info: AutoUpdateInfo | undefined,
  entityId: string
): AutoUpdateRowState => {
  const entity = info?.entities.find((item) => item.entity_id === entityId);
  if (!info || !entity) {
    return { checked: false, disabled: true, reason: "unknown" };
  }
  if (!entity.allowed) {
    return { checked: false, disabled: true, reason: "restarts_system" };
  }
  return { checked: entity.override ?? info.all, disabled: false };
};

/** A result time as a short date and 24-hour time in the home's time zone. */
export const formatAutoUpdateDateTime = (
  iso: string,
  locale?: string,
  timeZone?: string
): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(date);
};

/** The time of the last automatic result as 24-hour hours and minutes. */
export const formatAutoUpdateTime = (iso: string, locale?: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
};

const DAY_MS = 24 * 60 * 60 * 1000;

// A window is shortest-allowed 30 minutes long; it may cross midnight.
export const AUTO_SYSTEM_MIN_WINDOW_MINUTES = 30;

const clockMinutes = (value: string): number => {
  const [hours, minutes] = value.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
};

/** The minutes a window lasts; a window that crosses midnight wraps. */
export const autoWindowMinutes = (start: string, end: string): number =>
  (clockMinutes(end) - clockMinutes(start) + 24 * 60) % (24 * 60);

export type AutoWindowKind =
  "open" | "today" | "tonight" | "tomorrow" | "later";

export interface AutoWindowSummary {
  kind: AutoWindowKind;
  start: string;
  end: string;
}

/**
 * When the next window is, in words: open now, today, tonight (an early
 * morning window that opens after tonight's midnight), tomorrow or later.
 */
export const autoWindowSummary = (
  system: AutoSystemInfo
): AutoWindowSummary => {
  const { start, end } = system.window;
  const next = system.next_window;
  let kind: AutoWindowKind;
  if (next.open) {
    kind = "open";
  } else if (next.day_offset <= 0) {
    kind = "today";
  } else if (next.day_offset === 1) {
    kind = clockMinutes(start) < 6 * 60 ? "tonight" : "tomorrow";
  } else {
    kind = "later";
  }
  return { kind, start, end };
};

/** Whole days an update still waits; 0 when it may install at the next window. */
export const autoWaitDaysLeft = (
  eligibleAt: string | null,
  now: Date
): number => {
  if (!eligibleAt) {
    return 0;
  }
  const left = new Date(eligibleAt).getTime() - now.getTime();
  return Number.isNaN(left) || left <= 0 ? 0 : Math.ceil(left / DAY_MS);
};

export interface AutoSystemPending {
  part: AutoSystemPartName;
  version: string | null;
  // Days still to wait; 0 means it goes in the next window.
  daysLeft: number;
}

/** The updates switched on that are available and will install by themselves. */
export const autoSystemPending = (
  system: AutoSystemInfo,
  now: Date
): AutoSystemPending[] =>
  system.parts
    .filter(
      (part) =>
        part.enabled && part.update_available && !part.skipped && !part.failed
    )
    .map((part) => ({
      part: part.part,
      version: part.latest_version,
      daysLeft: autoWaitDaysLeft(part.eligible_at, now),
    }));

/** The most recent automatic result of any system update. */
export const autoSystemLastResult = (
  system: AutoSystemInfo
): { part: AutoSystemPartName; result: AutoUpdateResult } | undefined => {
  let latest:
    { part: AutoSystemPartName; result: AutoUpdateResult } | undefined;
  for (const part of system.parts) {
    const result = part.last_result;
    if (
      result &&
      (!latest || new Date(result.time) > new Date(latest.result.time))
    ) {
      latest = { part: part.part, result };
    }
  }
  return latest;
};

/** The system updates whose automatic install failed and was not skipped. */
export const autoSystemFailures = (system: AutoSystemInfo): AutoSystemPart[] =>
  system.parts.filter((part) => part.failed && !part.skipped);
