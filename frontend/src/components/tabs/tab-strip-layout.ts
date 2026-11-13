import type { LockStore } from "../../common/locks/element-locks";
import type { DockEdge } from "../../common/tabs/tab-dock";
import { DEFAULT_DOCK_EDGE } from "../../common/tabs/tab-dock";
import type { TabGroup } from "../../common/tabs/tab-groups";
import { groupLockKey, tabLockKey } from "../../common/tabs/tab-locks";
import type { TabAppearance } from "../../common/tabs/tab-appearance-store";

/**
 * Small pure decisions of the tab strip: which edge a strip starts on, which
 * key does what on each axis, which tabs are out of view, when the pinned
 * region turns compact, which lock a tab is waiting on and how a stored
 * appearance becomes style properties. Nothing here touches the page, so each
 * one has a plain test.
 */

export type Orientation = "horizontal" | "vertical";

/** The strip a person never chose an edge for. */
export const MAIN_SURFACE = "main";

/**
 * The edge a strip starts on when nothing was chosen.
 *
 * Every installation starts on the left, as the side pane. Earlier builds
 * put an installation that already had tab state at the top without anyone
 * choosing it; that is no longer done, and the edge is now stored under a new
 * key so those automatic values are not read back. Nothing is decided here
 * any more; the function stays so its callers and their order do not change.
 */
export const initialDockDecision = (input: {
  /** Any of the old closed, order, pinned or seen keys was already saved. */
  legacyPresent: boolean;
  /** The strip already remembers tabs it has offered. */
  seenPresent: boolean;
  /** An edge was already chosen for this strip. */
  dockChosen: boolean;
}): DockEdge | undefined => {
  if (input.dockChosen || input.seenPresent) {
    return undefined;
  }
  return undefined;
};

/** The edge a strip uses when nothing is stored and it is a new installation. */
export const NEW_INSTALL_EDGE: DockEdge = DEFAULT_DOCK_EDGE;

export type NavIntent = "previous" | "next" | "start" | "end";

/**
 * What a plain key does in a tab list. Along the strip's axis the arrows move
 * between tabs: Left and Right on a horizontal strip (swapped when the page
 * reads right to left), Up and Down on a vertical one.
 */
export const navIntent = (
  key: string,
  orientation: Orientation,
  rtl: boolean
): NavIntent | undefined => {
  if (key === "Home") {
    return "start";
  }
  if (key === "End") {
    return "end";
  }
  if (orientation === "vertical") {
    return key === "ArrowDown"
      ? "next"
      : key === "ArrowUp"
        ? "previous"
        : undefined;
  }
  if (key === "ArrowRight") {
    return rtl ? "previous" : "next";
  }
  if (key === "ArrowLeft") {
    return rtl ? "next" : "previous";
  }
  return undefined;
};

export interface MoveKeyEvent {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey?: boolean;
}

export type MoveIntent =
  { type: "reorder"; forward: boolean } | { type: "group"; forward: boolean };

/**
 * What an arrow with Shift and Control (or Alt, for macOS) asks for. The
 * arrows along the axis move the focused tab or group along the strip. The
 * arrows across the axis move the tab into the next or previous group:
 * Up and Down on a horizontal strip, Left and Right on a vertical one.
 */
export const moveKeyIntent = (
  ev: MoveKeyEvent,
  orientation: Orientation,
  rtl: boolean
): MoveIntent | undefined => {
  if (!ev.shiftKey || ev.metaKey || ev.ctrlKey === ev.altKey) {
    return undefined;
  }
  const along = navIntent(ev.key, orientation, rtl);
  if (along === "next" || along === "previous") {
    return { type: "reorder", forward: along === "next" };
  }
  if (orientation === "horizontal") {
    if (ev.key === "ArrowDown") {
      return { type: "group", forward: true };
    }
    if (ev.key === "ArrowUp") {
      return { type: "group", forward: false };
    }
    return undefined;
  }
  if (ev.key === "ArrowRight") {
    return { type: "group", forward: !rtl };
  }
  if (ev.key === "ArrowLeft") {
    return { type: "group", forward: rtl };
  }
  return undefined;
};

/** The index to focus after a navigation key, wrapping at both ends. */
export const navTarget = (
  intent: NavIntent,
  index: number,
  count: number
): number => {
  if (count <= 0) {
    return -1;
  }
  if (intent === "start") {
    return 0;
  }
  if (intent === "end") {
    return count - 1;
  }
  const step = intent === "next" ? 1 : -1;
  return (Math.max(index, 0) + step + count) % count;
};

export interface Extent {
  id: string;
  /** Start and end along the strip's axis, in the same coordinates as `lo` and `hi`. */
  from: number;
  to: number;
}

/**
 * The ids of the tabs that are not fully inside the visible window
 * `[lo, hi]`. A tab that is only partly in view counts as out of view, so
 * the overflow list names it rather than letting a cut label pass.
 */
export const hiddenByRange = (
  items: readonly Extent[],
  lo: number,
  hi: number,
  tolerance = 1
): string[] =>
  items
    .filter((item) => item.from < lo - tolerance || item.to > hi + tolerance)
    .map((item) => item.id);

/** How far a compact pinned region must grow past its start size to open again. */
export const COMPACT_RELEASE = 120;

export interface CompactState {
  compact: boolean;
  /** The strip size at the moment it turned compact. */
  at: number;
}

/**
 * Whether the pinned region shows its compact form: icons with the full name
 * kept as the accessible name. It turns compact when the strip overflows and
 * only opens again once the strip has grown clearly past the size it turned
 * compact at, so a strip on the edge does not flip back and forth.
 */
export const nextCompact = (
  state: CompactState,
  overflowing: boolean,
  size: number
): CompactState => {
  if (!state.compact) {
    return overflowing ? { compact: true, at: size } : state;
  }
  return size > state.at + COMPACT_RELEASE && !overflowing
    ? { compact: false, at: 0 }
    : state;
};

/**
 * The lock a tab is still waiting on, or undefined when it can be used. A tab
 * is locked by its own lock and by the lock of its group; the own lock is
 * asked first. `isUnlocked` says whether a key is open for now.
 */
export const pendingLockKey = (
  store: Pick<LockStore, "locked">,
  surface: string,
  tabId: string,
  groups: readonly TabGroup[],
  isUnlocked: (key: string) => boolean
): string | undefined => {
  const keys = [tabLockKey(surface, tabId)];
  const group = groups.find((item) => item.members.includes(tabId));
  if (group) {
    keys.push(groupLockKey(surface, group.id));
  }
  return keys.find((key) => store.locked.includes(key) && !isUnlocked(key));
};

/** A density word or number as a scale of the tab height. */
export const densityScale = (value: string | undefined): number => {
  if (!value) {
    return 1;
  }
  const text = value.trim().toLowerCase();
  if (text === "compact" || text === "dense") {
    return 0.8;
  }
  if (["comfortable", "spacious", "loose", "roomy"].includes(text)) {
    return 1.2;
  }
  const number = Number.parseFloat(text);
  if (!Number.isFinite(number)) {
    return 1;
  }
  const scale = text.endsWith("%") ? number / 100 : number;
  return Math.min(1.6, Math.max(0.6, scale));
};

const cssAccepts = (property: string, value: string): boolean => {
  const supports = (
    globalThis as {
      CSS?: { supports?: (property: string, value: string) => boolean };
    }
  ).CSS?.supports;
  return typeof supports === "function" ? supports(property, value) : true;
};

/**
 * Style properties for the look stored for one tab. Each is a custom property
 * the tab's own styles read, and a value the browser does not accept for its
 * property is left out, so a stored look can never break the tab.
 */
export const tabStyle = (look: TabAppearance): Record<string, string> => {
  const style: Record<string, string> = {};
  if (look.color && cssAccepts("color", look.color)) {
    style["--tab-color"] = look.color;
  }
  if (look.background && cssAccepts("background-color", look.background)) {
    style["--tab-background"] = look.background;
  }
  if (look.borderColor && cssAccepts("border-color", look.borderColor)) {
    style["--tab-border-color"] = look.borderColor;
  }
  if (look.fontWeight && cssAccepts("font-weight", look.fontWeight)) {
    style["--tab-weight"] = look.fontWeight;
  }
  if (look.fontStyle && cssAccepts("font-style", look.fontStyle)) {
    style["--tab-font-style"] = look.fontStyle;
  }
  if (look.radius) {
    const radius = /^\d+(\.\d+)?$/.test(look.radius)
      ? `${look.radius}px`
      : look.radius;
    if (cssAccepts("border-radius", radius)) {
      style["--tab-radius"] = radius;
    }
  }
  if (look.density) {
    style["--tab-density"] = String(densityScale(look.density));
  }
  return style;
};

/** The size a vertical strip needs for its pinned region, kept out of the way of scrolling. */
export const SCROLL_CLEARANCE = 8;
