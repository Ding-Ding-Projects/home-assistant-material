/**
 * Local history: a journal of the changes a person made to how this
 * browser shows the interface, with the choice before and after, so any of
 * them can be put back.
 *
 * It covers what is kept in this browser: appearance choices,
 * accessibility choices, closed tabs, the order of the tabs and pinned tabs. A change to the private
 * vocabulary is listed, but its text is never copied here, so clearing the
 * vocabulary leaves no copy behind. A change to a lock is listed as a fact
 * only; its stored text holds credentials and is never copied, so history
 * cannot be a way around a lock.
 */

export const HISTORY_STORAGE_KEY = "localHistory";

/** Most entries kept; the oldest are dropped after this. */
export const HISTORY_LIMIT = 100;

/** Longest stored choice that is kept, in characters. */
export const HISTORY_VALUE_LIMIT = 64 * 1024;

/** Changes this close together on one page count as one, in milliseconds. */
export const HISTORY_MERGE_MS = 4000;

export const HISTORY_SUBJECTS = {
  appearance: { key: "elementAppearance", keep: true },
  accessibility: { key: "accessibilityTools", keep: true },
  tabs: { key: "pageTabsClosed", keep: true },
  tabOrder: { key: "pageTabsOrder", keep: true },
  tabPins: { key: "pageTabsPinned", keep: true },
  tabGroups: { key: "pageTabsGroups", keep: false },
  tabDock: { key: "pageTabsDock", keep: false },
  tabAppearance: { key: "pageTabsAppearance", keep: false },
  // That a lock (including a tab or group lock) changed. Only the fact is
  // listed: the stored text holds credentials, so it is never copied here.
  tabLocks: { key: "elementLocks", keep: false },
  wording: { key: "personalVocabulary", keep: false },
} as const;

export type HistorySubject = keyof typeof HISTORY_SUBJECTS;

export interface HistoryEntry {
  id: string;
  /** Epoch milliseconds. */
  at: number;
  subject: HistorySubject;
  /** The page the change was made on. */
  page: string;
  /** Whether the choice before and after was kept, so it can be put back. */
  kept: boolean;
  before?: string | null;
  after?: string | null;
}

const isSubject = (value: unknown): value is HistorySubject =>
  typeof value === "string" && value in HISTORY_SUBJECTS;

const isValue = (value: unknown): value is string | null | undefined =>
  value === null ||
  value === undefined ||
  (typeof value === "string" && value.length <= HISTORY_VALUE_LIMIT);

export const normalizeHistory = (raw: unknown): HistoryEntry[] => {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter(
      (entry): entry is HistoryEntry =>
        !!entry &&
        typeof entry === "object" &&
        typeof entry.id === "string" &&
        Number.isFinite(entry.at) &&
        isSubject(entry.subject) &&
        typeof entry.page === "string" &&
        typeof entry.kept === "boolean" &&
        isValue(entry.before) &&
        isValue(entry.after)
    )
    .slice(-HISTORY_LIMIT);
};

/**
 * Adds a change to the journal. A change that leaves the choice as it was
 * is not added. A burst of changes to one thing on one page (a slider
 * being dragged) becomes one entry, from the first choice to the last.
 */
export const addHistoryEntry = (
  entries: HistoryEntry[],
  change: {
    subject: HistorySubject;
    page: string;
    before: string | null;
    after: string | null;
    at: number;
  }
): HistoryEntry[] => {
  if (change.before === change.after) {
    return entries;
  }
  const keep =
    HISTORY_SUBJECTS[change.subject].keep &&
    (change.before?.length ?? 0) <= HISTORY_VALUE_LIMIT &&
    (change.after?.length ?? 0) <= HISTORY_VALUE_LIMIT;
  const last = entries[entries.length - 1];
  if (
    last &&
    last.subject === change.subject &&
    last.page === change.page &&
    last.kept === keep &&
    change.at - last.at >= 0 &&
    change.at - last.at < HISTORY_MERGE_MS
  ) {
    if (keep && last.before === change.after) {
      // The burst ended where it started: nothing changed.
      return entries.slice(0, -1);
    }
    return [
      ...entries.slice(0, -1),
      { ...last, at: change.at, ...(keep ? { after: change.after } : {}) },
    ];
  }
  const entry: HistoryEntry = {
    id: `${change.at.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    at: change.at,
    subject: change.subject,
    page: change.page,
    kept: keep,
  };
  if (keep) {
    entry.before = change.before;
    entry.after = change.after;
  }
  return [...entries, entry].slice(-HISTORY_LIMIT);
};

export const readHistory = (): HistoryEntry[] => {
  try {
    return normalizeHistory(
      JSON.parse(window.localStorage.getItem(HISTORY_STORAGE_KEY) || "null")
    );
  } catch (_err) {
    return [];
  }
};

const announce = () =>
  window.dispatchEvent(new CustomEvent("local-history-changed"));

const writeHistory = (entries: HistoryEntry[]): void => {
  try {
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(entries));
  } catch (_err) {
    // Storage is full or unavailable: the journal stops growing, nothing
    // else is affected.
  }
  announce();
};

export const clearHistory = (): void => {
  try {
    window.localStorage.removeItem(HISTORY_STORAGE_KEY);
  } catch (_err) {
    // Nothing was stored.
  }
  announce();
};

const snapshots = new Map<HistorySubject, string | null>();

const rawValue = (subject: HistorySubject): string | null => {
  try {
    return window.localStorage.getItem(HISTORY_SUBJECTS[subject].key);
  } catch (_err) {
    return null;
  }
};

/** Remembers how every listed choice is now, to compare against later. */
export const startLocalHistory = (): void => {
  (Object.keys(HISTORY_SUBJECTS) as HistorySubject[]).forEach((subject) => {
    if (!snapshots.has(subject)) {
      snapshots.set(subject, rawValue(subject));
    }
  });
};

/** Called after a listed choice was stored; adds the change to the journal. */
export const noteLocalChange = (subject: HistorySubject): void => {
  const after = rawValue(subject);
  if (!snapshots.has(subject)) {
    snapshots.set(subject, after);
    return;
  }
  const before = snapshots.get(subject) ?? null;
  if (before === after) {
    return;
  }
  snapshots.set(subject, after);
  // Before the person has touched the page, a stored choice can only have
  // been set up by the interface itself. That is not a change of theirs.
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) {
    return;
  }
  const entries = readHistory();
  const next = addHistoryEntry(entries, {
    subject,
    page: window.location.pathname,
    before,
    after,
    at: Date.now(),
  });
  if (next !== entries) {
    writeHistory(next);
  }
};
