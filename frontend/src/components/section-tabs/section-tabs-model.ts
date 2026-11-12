/**
 * The decisions behind the section tabs of a settings surface, as pure
 * functions: the order with pinned tabs first, what is hidden, what overflows
 * for a given width, how a tab moves and which key does what. Nothing here
 * touches the page, so all of it is tested alone.
 */

/** What a person chose for one surface. Stored per surface route. */
export interface SectionTabsState {
  /** Section paths in the order the person put them. */
  order: string[];
  /** Section paths that sit first, in a stable region. */
  pinned: string[];
  /** Section paths taken out of the row. Their pages stay reachable. */
  hidden: string[];
}

/** Every surface's choices, keyed by the route of the surface. */
export type SectionTabsStore = Record<string, SectionTabsState>;

/** The one storage key that holds a {@link SectionTabsStore}. */
export const SECTION_TABS_STORAGE_KEY = "sectionTabs";

/** The id the tab panel carries; every tab points at it with aria-controls. */
export const SECTION_TAB_PANEL_ID = "section-panel";

const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

const unique = (list: readonly string[]): string[] => [...new Set(list)];

/** Reads one surface's state; anything malformed becomes an empty list. */
export const readSectionState = (
  store: unknown,
  surface: string
): SectionTabsState => {
  if (
    !store ||
    typeof store !== "object" ||
    !Object.prototype.hasOwnProperty.call(store, surface)
  ) {
    return { order: [], pinned: [], hidden: [] };
  }
  const raw = (store as Record<string, any>)[surface] ?? {};
  return {
    order: unique(strings(raw.order)),
    pinned: unique(strings(raw.pinned)),
    hidden: unique(strings(raw.hidden)),
  };
};

/** Returns the store with one surface's state replaced. Empty states vanish. */
export const writeSectionState = (
  store: unknown,
  surface: string,
  state: SectionTabsState
): SectionTabsStore => {
  const next: SectionTabsStore = {};
  if (store && typeof store === "object") {
    for (const key of Object.keys(store)) {
      if (key !== surface) {
        next[key] = readSectionState(store, key);
      }
    }
  }
  if (state.order.length || state.pinned.length || state.hidden.length) {
    next[surface] = {
      order: [...state.order],
      pinned: [...state.pinned],
      hidden: [...state.hidden],
    };
  }
  return next;
};

/** The DOM id of a section's tab. Injective, so two paths never collide. */
export const sectionTabDomId = (path: string): string =>
  `section-tab-${path.replace(
    /[^A-Za-z0-9-]/g,
    (char) => `_${char.charCodeAt(0).toString(16)}_`
  )}`;

/**
 * Puts the sections in the order the person chose: pinned first, then the
 * rest. A section the person never placed keeps its natural position after
 * those that were placed.
 */
export const orderSections = <T extends { path: string }>(
  items: readonly T[],
  state: SectionTabsState
): T[] => {
  const rank = (path: string, natural: number) => {
    const index = state.order.indexOf(path);
    return index === -1 ? state.order.length + natural : index;
  };
  return items
    .map((item, natural) => ({
      item,
      pinned: state.pinned.includes(item.path),
      rank: rank(item.path, natural),
    }))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.rank - b.rank)
    .map((entry) => entry.item);
};

/**
 * The sections the row shows: everything that is not hidden. The open section
 * is always shown, so the person is never looking at a page whose tab is gone.
 */
export const visibleSections = <T extends { path: string }>(
  ordered: readonly T[],
  state: SectionTabsState,
  activePath: string | undefined
): T[] =>
  ordered.filter(
    (item) => item.path === activePath || !state.hidden.includes(item.path)
  );

/** Sections taken out of the row that still exist on this page. */
export const hiddenSections = <T extends { path: string }>(
  ordered: readonly T[],
  state: SectionTabsState,
  activePath: string | undefined
): T[] =>
  ordered.filter(
    (item) => item.path !== activePath && state.hidden.includes(item.path)
  );

/**
 * Which of the tabs fit. `widths` are the tab widths, `required` marks the
 * tabs that must stay (pinned and the open one), `available` is the room,
 * `moreWidth` the room the overflow control takes when it is shown. Tabs are
 * kept in order and the first tab that does not fit ends the row, so the row
 * never has a gap in the middle. Always keeps at least one tab.
 */
export const planOverflow = (
  widths: readonly number[],
  required: readonly boolean[],
  available: number,
  moreWidth: number,
  gap = 0
): boolean[] => {
  if (widths.length === 0) {
    return [];
  }
  const total =
    widths.reduce((sum, width) => sum + width, 0) +
    gap * Math.max(0, widths.length - 1);
  if (total <= available) {
    return widths.map(() => true);
  }
  let budget = available - moreWidth;
  const visible = widths.map(() => false);
  widths.forEach((width, index) => {
    if (required[index]) {
      visible[index] = true;
      budget -= width + gap;
    }
  });
  let full = false;
  widths.forEach((width, index) => {
    if (visible[index] || full) {
      return;
    }
    if (budget >= width + gap) {
      visible[index] = true;
      budget -= width + gap;
    } else {
      full = true;
    }
  });
  if (!visible.some(Boolean)) {
    visible[0] = true;
  }
  return visible;
};

/**
 * The same decision for the phone's bottom bar, where every tab takes one
 * slot and the "More" entry takes one too.
 */
export const planSlots = (
  required: readonly boolean[],
  slots: number
): boolean[] =>
  planOverflow(
    required.map(() => 1),
    required,
    Math.max(1, slots),
    1
  );

/** How many tab slots fit in a width, never fewer than two. */
export const slotsForWidth = (width: number, slotWidth = 72): number =>
  Math.max(2, Math.floor(width / slotWidth));

export type SectionMove = "earlier" | "later" | "start" | "end";

export interface SectionMoveResult {
  state: SectionTabsState;
  /** Whether anything moved. */
  moved: boolean;
  /** Set when the move was refused because it would cross the pinned edge. */
  blocked: boolean;
}

/** The full order, pinned first, so a stored order always names every tab. */
const fullOrder = (
  paths: readonly string[],
  state: SectionTabsState
): string[] =>
  orderSections(
    paths.map((path) => ({ path })),
    state
  ).map((item) => item.path);

/**
 * Moves one section inside its own region (pinned or not). Hidden neighbours
 * are stepped over, so "earlier" always changes what the person sees.
 */
export const moveSection = (
  paths: readonly string[],
  state: SectionTabsState,
  path: string,
  move: SectionMove
): SectionMoveResult => {
  const order = fullOrder(paths, state);
  if (!order.includes(path)) {
    return { state, moved: false, blocked: false };
  }
  const pinned = state.pinned.includes(path);
  const region = order.filter((id) => state.pinned.includes(id) === pinned);
  const shown = region.filter(
    (id) => id === path || !state.hidden.includes(id)
  );
  const at = shown.indexOf(path);
  let target: number;
  if (move === "start") {
    target = 0;
  } else if (move === "end") {
    target = shown.length - 1;
  } else {
    target = at + (move === "earlier" ? -1 : 1);
  }
  if (target < 0 || target >= shown.length) {
    // Moving past the edge of the region is the pinned boundary, or the end.
    const otherRegion = order.some(
      (id) => state.pinned.includes(id) !== pinned
    );
    const blocked =
      otherRegion &&
      ((move === "earlier" && !pinned) || (move === "later" && pinned));
    return { state, moved: false, blocked };
  }
  if (target === at) {
    return { state, moved: false, blocked: false };
  }
  const neighbour = shown[target];
  const without = order.filter((id) => id !== path);
  const insertAt = without.indexOf(neighbour);
  const forward = target > at;
  without.splice(forward ? insertAt + 1 : insertAt, 0, path);
  return {
    state: { ...state, order: without },
    moved: true,
    blocked: false,
  };
};

/**
 * Drops one section next to another. Refused across the pinned boundary,
 * which is only crossed by pinning or unpinning.
 */
export const dropSection = (
  paths: readonly string[],
  state: SectionTabsState,
  from: string,
  to: string,
  after: boolean
): SectionMoveResult => {
  const order = fullOrder(paths, state);
  if (from === to || !order.includes(from) || !order.includes(to)) {
    return { state, moved: false, blocked: false };
  }
  if (state.pinned.includes(from) !== state.pinned.includes(to)) {
    return { state, moved: false, blocked: true };
  }
  const without = order.filter((id) => id !== from);
  const target = without.indexOf(to);
  without.splice(after ? target + 1 : target, 0, from);
  const changed = without.some((id, index) => id !== order[index]);
  return {
    state: changed ? { ...state, order: without } : state,
    moved: changed,
    blocked: false,
  };
};

/**
 * Pins or unpins a section. A pinned section joins the end of the pinned
 * region; an unpinned one lands at the start of the rest.
 */
export const togglePinned = (
  paths: readonly string[],
  state: SectionTabsState,
  path: string
): SectionTabsState => {
  const order = fullOrder(paths, state);
  if (!order.includes(path)) {
    return state;
  }
  const wasPinned = state.pinned.includes(path);
  const pinnedBefore = order.filter(
    (id) => state.pinned.includes(id) && id !== path
  );
  const rest = order.filter((id) => !state.pinned.includes(id) && id !== path);
  if (wasPinned) {
    return {
      ...state,
      pinned: pinnedBefore,
      order: [...pinnedBefore, path, ...rest],
    };
  }
  const pinned = [...pinnedBefore, path];
  return { ...state, pinned, order: [...pinned, ...rest] };
};

/** Takes a section out of the row. The open section cannot be hidden. */
export const hideSection = (
  state: SectionTabsState,
  path: string,
  activePath: string | undefined
): { state: SectionTabsState; hidden: boolean } =>
  path === activePath || state.hidden.includes(path)
    ? { state, hidden: false }
    : { state: { ...state, hidden: [...state.hidden, path] }, hidden: true };

/** Puts one hidden section back. */
export const showSection = (
  state: SectionTabsState,
  path: string
): SectionTabsState => ({
  ...state,
  hidden: state.hidden.filter((id) => id !== path),
});

/** Puts every hidden section back. Order and pins are kept. */
export const showEverySection = (
  state: SectionTabsState
): SectionTabsState => ({
  ...state,
  hidden: [],
});

/**
 * Where the roving focus goes for a key, or undefined when the key is not a
 * navigation key. Left and right arrows follow the reading direction.
 */
export const nextTabIndex = (
  key: string,
  index: number,
  count: number,
  rtl = false
): number | undefined => {
  if (count <= 0) {
    return undefined;
  }
  switch (key) {
    case "Home":
      return 0;
    case "End":
      return count - 1;
    case "ArrowRight":
      return (index + (rtl ? -1 : 1) + count) % count;
    case "ArrowLeft":
      return (index + (rtl ? 1 : -1) + count) % count;
    default:
      return undefined;
  }
};

interface KeyLike {
  key: string;
  code?: string;
  altKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  metaKey?: boolean;
}

/**
 * Alt with the left or right arrow moves the focused tab; Alt and Home or End
 * send it to the start or the end of its region. Shift is not part of it, so
 * it never clashes with the strip of the whole app, which uses Control or Alt
 * with Shift.
 */
export const sectionMoveForKey = (ev: KeyLike): SectionMove | undefined => {
  if (!ev.altKey || ev.ctrlKey || ev.shiftKey || ev.metaKey) {
    return undefined;
  }
  switch (ev.key) {
    case "ArrowLeft":
      return "earlier";
    case "ArrowRight":
      return "later";
    case "Home":
      return "start";
    case "End":
      return "end";
    default:
      return undefined;
  }
};

/** Alt, Shift and P pin the focused tab; Alt, Shift and H hide it. */
export const sectionShortcutForKey = (
  ev: KeyLike
): "pin" | "hide" | undefined => {
  if (!ev.altKey || !ev.shiftKey || ev.ctrlKey || ev.metaKey) {
    return undefined;
  }
  if (ev.code === "KeyP" || ev.key.toLowerCase() === "p") {
    return "pin";
  }
  if (ev.code === "KeyH" || ev.key.toLowerCase() === "h") {
    return "hide";
  }
  return undefined;
};
