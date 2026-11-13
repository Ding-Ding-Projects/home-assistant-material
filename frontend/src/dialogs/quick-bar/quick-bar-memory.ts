import { getStorage } from "../../common/decorators/storage";

/**
 * What the quick bar remembers for each person: pinned results, which lead its
 * empty state, and the last results that were used. Both lists are stored in
 * this browser under one key and are saved on the instance with the rest of
 * the person's settings, so they follow the person to another browser.
 *
 * An entry holds the result's stable key and the title it had when it was
 * pinned or used, so the settings page can still show it when the result is
 * gone (for example a deleted device).
 */

export const QUICK_BAR_MEMORY_STORAGE_KEY = "quickBarMemory";

/** Most results that can be pinned. */
export const PINS_LIMIT = 30;

/** Most recent results kept. */
export const RECENT_LIMIT = 10;

export const KEY_LIMIT = 200;
export const TITLE_LIMIT = 120;

export interface QuickBarMemoryEntry {
  key: string;
  title: string;
}

export interface QuickBarMemory {
  pinned: QuickBarMemoryEntry[];
  recent: QuickBarMemoryEntry[];
}

export const EMPTY_QUICK_BAR_MEMORY: QuickBarMemory = {
  pinned: [],
  recent: [],
};

/** The parts of a quick bar result that decide its stable key. */
export interface KeyedResult {
  id: string;
  primary?: string;
  path?: string;
  action?: string;
  domain?: string;
  settingId?: string;
  placeId?: string;
  assistPrompt?: string;
  stateObj?: { entity_id: string };
}

const SEPARATOR = "________";

/**
 * A key for a result that stays the same between openings of the quick bar.
 * The ids the list uses carry a position for some results, which changes when
 * the list changes, so the key is built from what the result is. Results that
 * cannot be found again (the Assist prompt) have no key.
 */
export const quickBarResultKey = (item: KeyedResult): string | undefined => {
  if (item.assistPrompt !== undefined) {
    return undefined;
  }
  if (item.stateObj?.entity_id) {
    return `entity:${item.stateObj.entity_id}`;
  }
  if (item.settingId) {
    return `setting:${item.settingId}`;
  }
  if (item.placeId) {
    return `place:${item.placeId}`;
  }
  if (item.id.startsWith(`device${SEPARATOR}`)) {
    return `device:${item.id.split(SEPARATOR)[1]}`;
  }
  if (item.id.startsWith(`area${SEPARATOR}`)) {
    return `area:${item.id.split(SEPARATOR)[1]}`;
  }
  if (item.action) {
    return `action:${item.domain ?? ""}.${item.action}`;
  }
  if (item.path) {
    return `path:${item.path}`;
  }
  return undefined;
};

const cleanEntry = (raw: unknown): QuickBarMemoryEntry | undefined => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }
  const { key, title } = raw as Record<string, unknown>;
  if (
    typeof key !== "string" ||
    !key ||
    key.length > KEY_LIMIT ||
    typeof title !== "string"
  ) {
    return undefined;
  }
  return { key, title: title.slice(0, TITLE_LIMIT) };
};

const cleanList = (raw: unknown, limit: number): QuickBarMemoryEntry[] => {
  if (!Array.isArray(raw)) {
    return [];
  }
  const seen = new Set<string>();
  const result: QuickBarMemoryEntry[] = [];
  for (const item of raw) {
    const entry = cleanEntry(item);
    if (entry && !seen.has(entry.key)) {
      seen.add(entry.key);
      result.push(entry);
      if (result.length >= limit) {
        break;
      }
    }
  }
  return result;
};

/** Stored text can come from the instance, so it is checked before use. */
export const normalizeQuickBarMemory = (raw: unknown): QuickBarMemory => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { pinned: [], recent: [] };
  }
  const { pinned, recent } = raw as Record<string, unknown>;
  return {
    pinned: cleanList(pinned, PINS_LIMIT),
    recent: cleanList(recent, RECENT_LIMIT),
  };
};

export const isPinned = (memory: QuickBarMemory, key: string): boolean =>
  memory.pinned.some((entry) => entry.key === key);

/** Pins a result at the end of the pinned list, or unpins it when pinned. */
export const togglePinned = (
  memory: QuickBarMemory,
  entry: QuickBarMemoryEntry
): QuickBarMemory => {
  const clean = cleanEntry(entry);
  if (!clean) {
    return memory;
  }
  if (isPinned(memory, clean.key)) {
    return {
      ...memory,
      pinned: memory.pinned.filter((item) => item.key !== clean.key),
    };
  }
  return {
    ...memory,
    pinned: cleanList([...memory.pinned, clean], PINS_LIMIT),
  };
};

/** Notes that a result was used: it leads the recent list, which is capped. */
export const recordRecent = (
  memory: QuickBarMemory,
  entry: QuickBarMemoryEntry
): QuickBarMemory => {
  const clean = cleanEntry(entry);
  if (!clean) {
    return memory;
  }
  return {
    ...memory,
    recent: cleanList(
      [clean, ...memory.recent.filter((item) => item.key !== clean.key)],
      RECENT_LIMIT
    ),
  };
};

export const clearRecent = (memory: QuickBarMemory): QuickBarMemory => ({
  ...memory,
  recent: [],
});

export const clearPinned = (memory: QuickBarMemory): QuickBarMemory => ({
  ...memory,
  pinned: [],
});

export const removeFromMemory = (
  memory: QuickBarMemory,
  key: string
): QuickBarMemory => ({
  pinned: memory.pinned.filter((item) => item.key !== key),
  recent: memory.recent.filter((item) => item.key !== key),
});

/**
 * The results to show at the top of an empty search, in order: pinned results
 * first, then recent ones that are not pinned. Only keys that `resolve`
 * returns a result for are kept, so a result that no longer exists leaves a
 * gap rather than a dead row.
 */
export const leadingResults = <T>(
  memory: QuickBarMemory,
  resolve: (key: string) => T | undefined
): { pinned: T[]; recent: T[] } => {
  const pinned: T[] = [];
  memory.pinned.forEach((entry) => {
    const found = resolve(entry.key);
    if (found !== undefined) {
      pinned.push(found);
    }
  });
  const recent: T[] = [];
  memory.recent.forEach((entry) => {
    if (isPinned(memory, entry.key)) {
      return;
    }
    const found = resolve(entry.key);
    if (found !== undefined) {
      recent.push(found);
    }
  });
  return { pinned, recent };
};

export const readQuickBarMemory = (): QuickBarMemory => {
  try {
    return normalizeQuickBarMemory(
      getStorage().getValue(QUICK_BAR_MEMORY_STORAGE_KEY)
    );
  } catch (_err) {
    return { pinned: [], recent: [] };
  }
};

/** Saves the lists. Returns false when browser storage refused them. */
export const writeQuickBarMemory = (memory: QuickBarMemory): boolean => {
  const clean = normalizeQuickBarMemory(memory);
  try {
    getStorage().setValue(
      QUICK_BAR_MEMORY_STORAGE_KEY,
      clean.pinned.length || clean.recent.length ? clean : undefined
    );
    return true;
  } catch (_err) {
    return false;
  }
};

/** Calls back when the stored lists change, here or in another tab. */
export const subscribeQuickBarMemory = (
  callback: (memory: QuickBarMemory) => void
): (() => void) =>
  getStorage().subscribeChanges(QUICK_BAR_MEMORY_STORAGE_KEY, (_old, value) =>
    callback(normalizeQuickBarMemory(value))
  );
