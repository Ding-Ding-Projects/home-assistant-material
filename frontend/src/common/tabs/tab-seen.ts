import { getStorage } from "../decorators/storage";
import {
  cleanIds,
  cleanSurface,
  isSafeKey,
  surfaceEntries,
  LIST_LIMIT,
} from "./tab-validate";

/**
 * Remembers every tab a strip has ever offered.
 *
 * Only tabs the person closed are stored in `pageTabsClosed`. That alone
 * cannot tell "a page that arrived with an update" from "a page that was
 * always there", so this store keeps the tabs that were already offered.
 * After an update only a never-offered tab opens, once. A tab the person
 * closed stays closed, also when its page disappears and comes back.
 */

export const SEEN_TABS_STORAGE_KEY = "pageTabsSeen";

/** Most tab ids remembered per strip. */
export const SEEN_LIMIT = 2000;

/** Stored shape: strip name to the ids ever offered on it. */
export type SeenStore = Record<string, string[]>;

export const normalizeSeenStore = (raw: unknown): SeenStore => {
  const store: SeenStore = {};
  surfaceEntries(raw).forEach(([surface, ids]) => {
    const list = cleanIds(ids, SEEN_LIMIT);
    if (list.length) {
      store[surface] = list;
    }
  });
  return store;
};

export interface SeenReconcile {
  /** The store to save. */
  seen: string[];
  /** Tabs offered for the first time: they open once. */
  newlyOffered: string[];
  /** True when nothing was remembered yet: every tab counts as already offered. */
  firstRun: boolean;
}

/**
 * Compares the tabs on offer now with the tabs remembered.
 *
 * On the very first run nothing is remembered, so nothing is "new": the
 * strip keeps today's behaviour (everything open except what was closed).
 * Afterwards `newlyOffered` lists the tabs never offered before, in page
 * order. Remembered tabs that are not on offer now stay remembered, so a
 * returning page is never mistaken for a new one.
 */
export const reconcileSeen = (
  available: readonly string[],
  seen: readonly string[]
): SeenReconcile => {
  const known = new Set(cleanIds([...seen], SEEN_LIMIT));
  const ids = cleanIds([...available], LIST_LIMIT);
  const firstRun = known.size === 0;
  const newlyOffered = firstRun ? [] : ids.filter((id) => !known.has(id));
  const next = [...known];
  ids.forEach((id) => {
    if (!known.has(id)) {
      next.push(id);
    }
  });
  return {
    // The oldest are dropped when the limit is reached, never the new ones.
    seen: next.slice(-SEEN_LIMIT),
    newlyOffered,
    firstRun,
  };
};

export interface OpenState {
  /** Ids of the closed tabs after the change. */
  closed: string[];
  /** The tabs that opened again, in page order. */
  reopened: string[];
}

/**
 * "Open every tab": clears the closed state of every tab on offer. Page
 * order is kept for the result; pins, groups and the active tab are not
 * part of this and so are never changed. Closed ids of pages that are not
 * on offer stay closed, so they remain closed if the page returns.
 */
export const openEveryTab = (
  available: readonly string[],
  closed: readonly string[]
): OpenState => {
  const closedSet = new Set(cleanIds([...closed]));
  const reopened = cleanIds([...available]).filter((id) => closedSet.has(id));
  const gone = new Set(reopened);
  return {
    closed: [...closedSet].filter((id) => !gone.has(id)),
    reopened,
  };
};

/** Closes one tab: remembered as closed, once. */
export const closeTab = (closed: readonly string[], id: string): string[] =>
  isSafeKey(id) ? [...new Set([...cleanIds([...closed]), id])] : [...closed];

/** Opens one tab again. */
export const openTab = (closed: readonly string[], id: string): string[] =>
  cleanIds([...closed]).filter((item) => item !== id);

/** Whether a tab on offer is open. */
export const isTabOpen = (closed: readonly string[], id: string): boolean =>
  !closed.includes(id);

export const readSeen = (surface?: string): string[] =>
  normalizeSeenStore(getStorage().getValue(SEEN_TABS_STORAGE_KEY))[
    cleanSurface(surface)
  ] ?? [];

export const writeSeen = (surface: string | undefined, ids: string[]): void => {
  const store = normalizeSeenStore(
    getStorage().getValue(SEEN_TABS_STORAGE_KEY)
  );
  const key = cleanSurface(surface);
  const list = cleanIds(ids, SEEN_LIMIT);
  if (list.length) {
    store[key] = list;
  } else {
    delete store[key];
  }
  getStorage().setValue(SEEN_TABS_STORAGE_KEY, store);
};
