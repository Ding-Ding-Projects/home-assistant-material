import { getStorage } from "../decorators/storage";
import { cleanDestinationPath, parseDestinationId } from "./tab-destinations";
import {
  cleanIds,
  cleanSurface,
  isSafeKey,
  surfaceEntries,
} from "./tab-validate";

/**
 * The settings pages and tools the person opened as tabs, per strip.
 *
 * Pages that exist in the sidebar are tabs on their own (and closed ones are
 * remembered in `pageTabsClosed`). A settings page or a tool becomes a tab only
 * when the person chooses it in the New tab catalog, so the strip never fills
 * with every possible destination. This list holds the ids of the destinations
 * chosen so far, in the order they were chosen. A tab the person closes stays
 * in the list and is remembered as closed, like any other tab; the order, the
 * pins, the groups, the look and the locks of a destination tab are kept under
 * the same keys as those of every other tab.
 */

export const DESTINATIONS_STORAGE_KEY = "pageTabsDestinations";

/** Most destinations remembered per strip. */
export const DESTINATIONS_LIMIT = 100;

/** Stored shape: strip name to the destination ids opened on it. */
export type DestinationStore = Record<string, string[]>;

/** True for the id of a settings page or tool; page ids are not stored here. */
export const isDestinationTabId = (id: unknown): id is string => {
  if (!isSafeKey(id)) {
    return false;
  }
  const { kind, path } = parseDestinationId(id);
  return kind !== "page" && cleanDestinationPath(path) === path && !!path;
};

export const normalizeDestinationList = (raw: unknown): string[] =>
  cleanIds(raw, DESTINATIONS_LIMIT * 4)
    .filter(isDestinationTabId)
    .slice(0, DESTINATIONS_LIMIT);

export const normalizeDestinationStore = (raw: unknown): DestinationStore => {
  const store: DestinationStore = {};
  surfaceEntries(raw).forEach(([surface, ids]) => {
    const list = normalizeDestinationList(ids);
    if (list.length) {
      store[surface] = list;
    }
  });
  return store;
};

/**
 * The list after the person chose a destination. An id that is already there
 * is not added again, so no destination ever owns two tabs. A full list refuses
 * a new one and says so.
 */
export const withDestination = (
  list: readonly string[],
  id: string
): { list: string[]; added: boolean; full: boolean } => {
  const current = normalizeDestinationList([...list]);
  if (!isDestinationTabId(id) || current.includes(id)) {
    return { list: current, added: false, full: false };
  }
  if (current.length >= DESTINATIONS_LIMIT) {
    return { list: current, added: false, full: true };
  }
  return { list: [...current, id], added: true, full: false };
};

export const readDestinations = (surface?: string): string[] =>
  normalizeDestinationStore(getStorage().getValue(DESTINATIONS_STORAGE_KEY))[
    cleanSurface(surface)
  ] ?? [];

export const writeDestinations = (
  surface: string | undefined,
  ids: readonly string[]
): void => {
  const store = normalizeDestinationStore(
    getStorage().getValue(DESTINATIONS_STORAGE_KEY)
  );
  const key = cleanSurface(surface);
  const list = normalizeDestinationList([...ids]);
  if (list.length) {
    store[key] = list;
  } else {
    delete store[key];
  }
  getStorage().setValue(DESTINATIONS_STORAGE_KEY, store);
};
