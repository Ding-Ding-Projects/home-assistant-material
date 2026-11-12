import { getStorage } from "../../common/decorators/storage";
import type { HomeAssistant } from "../../types";
import { readLocks } from "../../common/locks/element-locks";
import type { LockStore } from "../../common/locks/element-locks";
import type { StripSnapshot } from "../../common/tabs/tab-search";
import { GROUPS_STORAGE_KEY, readGroups } from "../../common/tabs/tab-groups";
import type { TabGroup } from "../../common/tabs/tab-groups";
import {
  CLOSED_STORAGE_KEY,
  normalizeClosed,
  normalizeOrder,
  ORDER_STORAGE_KEY,
  orderTabs,
  readPinned,
} from "../../common/tabs/tab-pins";
import { readSeen, SEEN_TABS_STORAGE_KEY } from "../../common/tabs/tab-seen";
import {
  DEFAULT_SURFACE,
  cleanSurface,
  surfaceEntries,
} from "../../common/tabs/tab-validate";
import { GROUP_APPEARANCE_STORAGE_KEY } from "./tab-group-appearance-store";
import { computeStripTabs } from "./destination-tabs";

/**
 * Reads what one strip looks like right now from storage and the panel list,
 * for the group picker, the group menu and the searches. These elements are
 * given only `hass` and a strip name, so they read the same saved lists the
 * strip reads instead of reaching into it. Nothing here writes.
 */

export interface StripTab {
  id: string;
  label: string;
  open: boolean;
}

export interface StripState {
  surface: string;
  /** Every tab on offer in strip order, open and closed. */
  tabs: StripTab[];
  /** The ids of the open tabs in strip order. */
  openIds: string[];
  pinned: string[];
  closed: string[];
  order: string[];
  groups: TabGroup[];
}

/** The pinned tabs of a strip. Only the wide strip keeps pins today. */
export const pinnedFor = (surface: string): string[] =>
  surface === DEFAULT_SURFACE ? readPinned() : [];

/** The closed tabs of a strip. Only the wide strip keeps a closed list today. */
export const closedFor = (surface: string): string[] =>
  surface === DEFAULT_SURFACE
    ? normalizeClosed(getStorage().getValue(CLOSED_STORAGE_KEY))
    : [];

/** Strip names that other code registered, so they get proper tab labels. */
const registered = new Map<string, () => StripSnapshot>();

export const readStripState = (
  hass: HomeAssistant,
  surfaceName?: string
): StripState => {
  const surface = cleanSurface(surfaceName);
  const groups = readGroups(surface);
  const pinned = pinnedFor(surface);
  const closed = closedFor(surface);
  const order = normalizeOrder(getStorage().getValue(ORDER_STORAGE_KEY));
  let labels = new Map<string, string>();
  let available: string[];
  if (surface === DEFAULT_SURFACE) {
    const pages = computeStripTabs(hass, surface);
    labels = new Map(pages.map((page) => [page.urlPath, page.title]));
    available = pages.map((page) => page.urlPath);
  } else {
    // A strip that is on screen reports its own labels. One that is not is
    // known only by its stored names, so the ids are the best label.
    const provided = registered.get(surface)?.();
    available = [
      ...new Set([
        ...(provided ? provided.tabs.map((tab) => tab.id) : []),
        ...readSeen(surface),
        ...groups.flatMap((g) => g.members),
      ]),
    ];
    if (provided) {
      labels = new Map(provided.tabs.map((tab) => [tab.id, tab.label]));
    }
  }
  const ordered =
    surface === DEFAULT_SURFACE
      ? orderTabs(available, order, pinned)
      : available;
  const tabs = ordered.map((id) => ({
    id,
    label: labels.get(id) ?? id,
    open: !closed.includes(id),
  }));
  return {
    surface,
    tabs,
    openIds: tabs.filter((tab) => tab.open).map((tab) => tab.id),
    pinned,
    closed,
    order,
    groups,
  };
};

/** The strip names found in the stored maps, the wide strip first. */
export const listSurfaces = (): string[] => {
  const storage = getStorage();
  const names = new Set<string>([DEFAULT_SURFACE]);
  [
    GROUPS_STORAGE_KEY,
    SEEN_TABS_STORAGE_KEY,
    GROUP_APPEARANCE_STORAGE_KEY,
  ].forEach((key) =>
    surfaceEntries(storage.getValue(key)).forEach(([name]) => names.add(name))
  );
  return [...names];
};

/**
 * Lets another strip (for example the sections of a settings page) appear in
 * the master search with its own tab labels. Returns the way to unregister.
 */
export const registerTabSearchSurface = (
  surface: string,
  snapshot: () => StripSnapshot
): (() => void) => {
  registered.set(surface, snapshot);
  return () => {
    if (registered.get(surface) === snapshot) {
      registered.delete(surface);
    }
  };
};

/** One snapshot for every strip the product has, for the master search. */
export const readAllStrips = (
  hass: HomeAssistant,
  surfaceLabel: (surface: string) => string
): StripSnapshot[] =>
  listSurfaces().map((surface) => {
    const provided = registered.get(surface)?.();
    if (provided) {
      return { surfaceLabel: surfaceLabel(surface), ...provided };
    }
    const state = readStripState(hass, surface);
    return {
      surface,
      surfaceLabel: surfaceLabel(surface),
      tabs: state.tabs,
      pinned: state.pinned,
      groups: state.groups,
    };
  });

export const readLockStore = (): LockStore => readLocks();
