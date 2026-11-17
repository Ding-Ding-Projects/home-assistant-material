import { parseBuildNumber } from "../../../../data/build-progress";
import type { HomeAssistant } from "../../../../types";

/**
 * The rules behind the "Update history" card: which Core versions this browser
 * has seen installed, how long each one ran, and which older ones may be
 * installed again. Plain functions, so they can be tested without a page.
 */

/** How many installed versions are kept. */
export const HISTORY_LIMIT = 20;

export interface HistoryEntry {
  /** The Core version. */
  version: string;
  /** When this version was first seen installed, in milliseconds. */
  firstSeen: number;
}

export interface HistoryRow {
  version: string;
  build?: number;
  installedAt: number;
  /** How long it ran before the next version; absent for the current one. */
  ranFor?: number;
  isCurrent: boolean;
}

/**
 * Notes that `version` is installed. The list is newest first. The same
 * version seen again straight away changes nothing; a version that comes back
 * after another one starts a new run.
 */
export const recordVersion = (
  history: readonly HistoryEntry[],
  version: string | null | undefined,
  now: number
): HistoryEntry[] => {
  const clean = (version ?? "").trim();
  if (!clean) {
    return [...history];
  }
  if (history[0]?.version === clean) {
    return [...history];
  }
  return [{ version: clean, firstSeen: now }, ...history].slice(
    0,
    HISTORY_LIMIT
  );
};

/** The time a run lasted: from its start to the start of the next one. */
export const runDuration = (
  history: readonly HistoryEntry[],
  index: number
): number | undefined => {
  const newer = history[index - 1];
  const entry = history[index];
  if (!newer || !entry) {
    return undefined;
  }
  return Math.max(0, newer.firstSeen - entry.firstSeen);
};

export const historyRows = (
  history: readonly HistoryEntry[],
  currentVersion: string | null | undefined
): HistoryRow[] =>
  history.map((entry, index) => ({
    version: entry.version,
    build: parseBuildNumber(entry.version),
    installedAt: entry.firstSeen,
    ranFor: runDuration(history, index),
    isCurrent: index === 0 && entry.version === currentVersion,
  }));

/**
 * Versions that were really installed here and are older than the current
 * one, newest first, each listed once. Versions without a readable build
 * number are never offered, because their order cannot be told.
 */
export const rollbackTargets = (
  history: readonly HistoryEntry[],
  currentVersion: string | null | undefined
): string[] => {
  const currentBuild = parseBuildNumber(currentVersion);
  if (currentBuild === undefined) {
    return [];
  }
  const seen = new Set<string>();
  const targets: { version: string; build: number }[] = [];
  for (const entry of history) {
    const build = parseBuildNumber(entry.version);
    if (
      build === undefined ||
      build >= currentBuild ||
      seen.has(entry.version)
    ) {
      continue;
    }
    seen.add(entry.version);
    targets.push({ version: entry.version, build });
  }
  return targets.sort((a, b) => b.build - a.build).map((t) => t.version);
};

export interface Duration {
  days: number;
  hours: number;
  minutes: number;
}

export const splitDuration = (ms: number): Duration => {
  const total = Math.max(0, Math.round(ms / 60000));
  return {
    days: Math.floor(total / 1440),
    hours: Math.floor((total % 1440) / 60),
    minutes: total % 60,
  };
};

export type RollbackBlock =
  | "not_admin"
  | "no_supervisor"
  | "queue_running"
  | "update_running"
  | "rollback_running";

export interface RollbackContext {
  isAdmin: boolean;
  /** The Supervisor is there, so the Core update call exists. */
  supervisorAvailable: boolean;
  queueActive: boolean;
  /** Another update, or the update from USB storage, is running. */
  updateRunning: boolean;
  rollbackRunning: boolean;
}

/** Why going back cannot be started now, or undefined when it can. */
export const rollbackBlockReason = (
  context: RollbackContext
): RollbackBlock | undefined => {
  if (!context.isAdmin) {
    return "not_admin";
  }
  if (!context.supervisorAvailable) {
    return "no_supervisor";
  }
  if (context.rollbackRunning) {
    return "rollback_running";
  }
  if (context.queueActive) {
    return "queue_running";
  }
  if (context.updateRunning) {
    return "update_running";
  }
  return undefined;
};

/** Whether any update entity reports that it is installing. */
export const anyUpdateInProgress = (
  states: Record<string, { attributes?: Record<string, unknown> }>
): boolean =>
  Object.entries(states).some(
    ([entityId, state]) =>
      entityId.startsWith("update.") && !!state.attributes?.in_progress
  );

const STORAGE_KEY = "ha-update-history";

/** Reads a stored history; anything unexpected is dropped. */
export const parseStoredHistory = (raw: string | null): HistoryEntry[] => {
  if (!raw) {
    return [];
  }
  try {
    const data = JSON.parse(raw);
    if (!data || data.version !== 1 || !Array.isArray(data.entries)) {
      return [];
    }
    const entries: HistoryEntry[] = [];
    for (const item of data.entries) {
      if (
        typeof item?.version !== "string" ||
        !item.version.trim() ||
        item.version.length > 64 ||
        typeof item.firstSeen !== "number" ||
        !Number.isFinite(item.firstSeen)
      ) {
        continue;
      }
      entries.push({ version: item.version, firstSeen: item.firstSeen });
    }
    return entries.slice(0, HISTORY_LIMIT);
  } catch (_err) {
    return [];
  }
};

export const loadHistory = (): HistoryEntry[] => {
  try {
    return parseStoredHistory(window.localStorage.getItem(STORAGE_KEY));
  } catch (_err) {
    return [];
  }
};

export const storeHistory = (history: readonly HistoryEntry[]): void => {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, entries: history })
    );
  } catch (_err) {
    // The history then only lasts as long as this page.
  }
};

/**
 * Installs a given Core version through the Supervisor's `POST /core/update`.
 * The Supervisor reads the keys `version`, `backup` and `background` (default
 * false) and does not compare the version with the installed one, so an older
 * version is accepted; only the installed version itself is refused. Without
 * `background` the call returns when the update has finished, and a failed
 * image pull comes back as the error, so the page shows the real reason.
 */
export const installCoreVersion = (
  hass: HomeAssistant,
  version: string,
  backup: boolean
): Promise<void> =>
  hass.callWS({
    type: "supervisor/api",
    endpoint: "/core/update",
    method: "post",
    timeout: null,
    data: { version, backup },
  });
