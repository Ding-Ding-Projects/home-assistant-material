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

/** How long a started way back may take before it counts as not finished. */
export const GO_BACK_LIMIT_MS = 15 * 60 * 1000;

/** A way back that was started and has not been reported on yet. */
export interface PendingGoBack {
  /** The version the person went back to. */
  version: string;
  startedAt: number;
  /** The version that was installed when going back started. */
  fromVersion?: string;
  /** The target was seen installed, so the way back is known to be finished. */
  done?: boolean;
  /** When the target was seen installed. */
  finishedAt?: number;
}

/** How long a record of a way back is kept when nothing settles it. */
export const GO_BACK_KEEP_MS = 24 * 60 * 60 * 1000;

const PENDING_KEY = "ha-update-go-back";

export const parsePendingGoBack = (
  raw: string | null
): PendingGoBack | undefined => {
  if (!raw) {
    return undefined;
  }
  try {
    const data = JSON.parse(raw);
    if (
      typeof data?.version !== "string" ||
      !data.version.trim() ||
      data.version.length > 64 ||
      typeof data.startedAt !== "number" ||
      !Number.isFinite(data.startedAt)
    ) {
      return undefined;
    }
    const pending: PendingGoBack = {
      version: data.version,
      startedAt: data.startedAt,
    };
    if (typeof data.fromVersion === "string" && data.fromVersion.length <= 64) {
      pending.fromVersion = data.fromVersion;
    }
    if (data.done === true) {
      pending.done = true;
      if (Number.isFinite(data.finishedAt)) {
        pending.finishedAt = data.finishedAt;
      }
    }
    return pending;
  } catch (_err) {
    return undefined;
  }
};

export const loadPendingGoBack = (): PendingGoBack | undefined => {
  try {
    return parsePendingGoBack(window.localStorage.getItem(PENDING_KEY));
  } catch (_err) {
    return undefined;
  }
};

export const storePendingGoBack = (
  pending: PendingGoBack | undefined
): void => {
  try {
    if (pending) {
      window.localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    } else {
      window.localStorage.removeItem(PENDING_KEY);
    }
  } catch (_err) {
    // The result is then simply not reported after a reload.
  }
};

/** What a stored way back has come to, decided from evidence. */
export type GoBackVerdict =
  /** Nothing is known yet; keep the record and say nothing. */
  | { kind: "pending" }
  /** The target was installed; `time` is when it was first seen. */
  | { kind: "done"; time: number }
  /** Time has passed and the original version is still installed. */
  | { kind: "failed" }
  /** Forget the record without saying anything. */
  | { kind: "clear" };

/**
 * What became of a stored way back. It is decided by evidence and never by a
 * timer alone:
 * 1. a record marked done is proof (the page saw the target installed);
 * 2. a history entry for the target first seen after the start is proof;
 * 3. the installed version being the target is proof;
 * 4. only when the time limit has passed AND the version the way back started
 *    from is still installed does it count as not finished;
 * 5. anything else stays silent, and the record is dropped after a day.
 */
export const resolvePendingGoBack = (
  pending: PendingGoBack,
  history: readonly HistoryEntry[],
  currentVersion: string | null | undefined,
  now: number
): GoBackVerdict => {
  if (pending.done) {
    return { kind: "done", time: pending.finishedAt ?? pending.startedAt };
  }
  const seen = history.find(
    (entry) =>
      entry.version === pending.version && entry.firstSeen >= pending.startedAt
  );
  if (seen) {
    return { kind: "done", time: seen.firstSeen };
  }
  if (currentVersion === pending.version) {
    return { kind: "done", time: now };
  }
  const elapsed = now - pending.startedAt;
  if (elapsed > GO_BACK_KEEP_MS) {
    return { kind: "clear" };
  }
  if (
    elapsed > GO_BACK_LIMIT_MS &&
    !!pending.fromVersion &&
    currentVersion === pending.fromVersion
  ) {
    return { kind: "failed" };
  }
  return { kind: "pending" };
};

/** The one-time line about a way back, as the history card shows it. */
export interface GoBackNotice {
  kind: "done" | "failed";
  /** The build number, or the whole version when it has none. */
  build: string;
  time: number;
}

/**
 * What the page says when it loads. Reads the stored way back, decides it
 * from the history and the installed version, forgets the record when it is
 * settled and returns the line to show, once. A page that loads on the target
 * build itself reports it as done; a record that is still undecided stays
 * stored and says nothing.
 */
export const takeGoBackNotice = (
  history: readonly HistoryEntry[],
  currentVersion: string | null | undefined,
  now: number
): GoBackNotice | undefined => {
  const pending = loadPendingGoBack();
  if (!pending || !currentVersion) {
    return undefined;
  }
  const verdict = resolvePendingGoBack(pending, history, currentVersion, now);
  if (verdict.kind === "pending") {
    return undefined;
  }
  storePendingGoBack(undefined);
  if (verdict.kind === "clear") {
    return undefined;
  }
  const build = parseBuildNumber(pending.version);
  return {
    kind: verdict.kind,
    build: build !== undefined ? String(build) : pending.version,
    time: verdict.kind === "done" ? verdict.time : now,
  };
};
