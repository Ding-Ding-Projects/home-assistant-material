import {
  mdiArrowDown,
  mdiArrowLeft,
  mdiArrowRight,
  mdiArrowUp,
  mdiCloseBoxMultiple,
  mdiCloseCircleMultiple,
  mdiClose,
  mdiDockBottom,
  mdiDockWindow,
  mdiChevronDoubleLeft,
  mdiChevronDoubleRight,
  mdiDockLeft,
  mdiDockRight,
  mdiDockTop,
  mdiFolderMove,
  mdiFolderPlus,
  mdiFolderRemove,
  mdiFormatPaint,
  mdiLock,
  mdiLockOpenVariant,
  mdiPageFirst,
  mdiPageLast,
  mdiPin,
  mdiPinOff,
  mdiRestore,
  mdiTabPlus,
  mdiTabRemove,
  mdiTextSearch,
} from "@mdi/js";
import type { DockEdge } from "../../common/tabs/tab-dock";
import { isVerticalDock } from "../../common/tabs/tab-dock";
import { moveWithinRegion } from "../../common/tabs/tab-pins";
import { mergeVisible } from "./tab-strip-moves";

/**
 * The entries of the tab menu, as plain data. The element turns each entry into
 * a row; the actions live in `tab-menu-actions.ts`. Nothing here touches the
 * page, so every state of the menu can be tested alone.
 */

export type TabMenuEntryId =
  | "pin"
  | "unpin"
  | "close"
  | "close_others"
  | "close_to_start"
  | "close_to_end"
  | "close_containing"
  | "close_not_containing"
  | "open_every"
  | "move_into_group"
  | "remove_from_group"
  | "new_group"
  | "move_earlier"
  | "move_later"
  | "move_start"
  | "move_end"
  | "edit_appearance"
  | "reset_appearance"
  | "lock"
  | "unlock"
  | "dock_left"
  | "dock_right"
  | "dock_top"
  | "dock_bottom"
  | "dock_float"
  | "collapse_strip"
  | "expand_strip"
  | "new_tab"
  | "edit_strip_appearance";

export interface TabMenuEntry {
  id: TabMenuEntryId;
  /** The key of the words, under `ui.page_tabs.menu`. */
  labelKey: string;
  /** An icon path. */
  icon: string;
  enabled: boolean;
  /** Closes tabs. A locked tab offers none of these. */
  destructive: boolean;
  /** The current choice in a group of choices, such as the dock edge. */
  checked?: boolean;
  /** A line is drawn above this entry. */
  separatorBefore?: boolean;
}

/** Where a tab moves, for the four move entries. */
export type TabMoveKind = "earlier" | "later" | "start" | "end";

export interface TabMenuInput {
  tabId: string;
  /** The open tabs in strip order. */
  openIds: readonly string[];
  /** The pinned tabs. */
  pinnedIds: readonly string[];
  /** The tab has its own lock, or its group is locked. */
  locked: boolean;
  /** The tab is locked only because its group is. */
  lockedByGroup?: boolean;
  grouped: boolean;
  /** At least one tab is closed. */
  hasClosed: boolean;
  /** The tab has a changed look. */
  customised: boolean;
  /** The strip runs left to right or top to bottom? Defaults to the dock. */
  dock: DockEdge;
  /** The page reads right to left. */
  rtl?: boolean;
  /** Which moves would change something, from the strip's own planner. */
  moves?: Partial<Record<TabMoveKind, boolean>>;
}

const PREFIX = "ui.page_tabs.menu.";

const key = (name: string): string => `${PREFIX}${name}`;

/** The index a move would put a tab on, or undefined when it cannot move. */
export const moveTarget = (
  openIds: readonly string[],
  pinnedIds: readonly string[],
  tabId: string,
  kind: TabMoveKind
): number | undefined => {
  const index = openIds.indexOf(tabId);
  if (index === -1) {
    return undefined;
  }
  const pinnedCount = openIds.filter((id) => pinnedIds.includes(id)).length;
  const isPinned = pinnedIds.includes(tabId);
  const target =
    kind === "earlier"
      ? index - 1
      : kind === "later"
        ? index + 1
        : kind === "start"
          ? isPinned
            ? 0
            : pinnedCount
          : isPinned
            ? pinnedCount - 1
            : openIds.length - 1;
  if (target === index) {
    return undefined;
  }
  return moveWithinRegion(openIds, pinnedIds, tabId, target).ok
    ? target
    : undefined;
};

/**
 * The saved order after moving a tab among the open tabs. Closed tabs keep
 * their places: the open tabs take the open slots in their new order.
 */
export const applyOpenOrder = (
  fullOrder: readonly string[],
  openIds: readonly string[],
  nextOpen: readonly string[]
): string[] => mergeVisible(fullOrder, openIds, nextOpen);

/**
 * The new saved order for a move, or undefined when the tab cannot move. A
 * pinned tab sits in the pinned list, not in the page order, so its move also
 * says what the pinned list becomes (as a drag on the strip does).
 */
export const planMove = (
  fullOrder: readonly string[],
  openIds: readonly string[],
  pinnedIds: readonly string[],
  tabId: string,
  kind: TabMoveKind
): { order: string[]; position: number; pinned?: string[] } | undefined => {
  const target = moveTarget(openIds, pinnedIds, tabId, kind);
  if (target === undefined) {
    return undefined;
  }
  const { ids } = moveWithinRegion(openIds, pinnedIds, tabId, target);
  const plan: { order: string[]; position: number; pinned?: string[] } = {
    order: applyOpenOrder(fullOrder, openIds, ids),
    position: target,
  };
  if (pinnedIds.includes(tabId)) {
    plan.pinned = mergeVisible(
      pinnedIds,
      openIds.filter((id) => pinnedIds.includes(id)),
      ids.filter((id) => pinnedIds.includes(id))
    );
  }
  return plan;
};

/** The words for closing toward one end, worded for the strip's direction. */
export const closeEndKey = (
  end: "start" | "end",
  vertical: boolean,
  rtl: boolean
): string => {
  if (vertical) {
    return key(end === "start" ? "close_above" : "close_below");
  }
  const left = (end === "start") !== rtl;
  return key(left ? "close_left" : "close_right");
};

/** The words for moving one step, worded for the strip's direction. */
export const moveStepKey = (
  step: "earlier" | "later",
  vertical: boolean,
  rtl: boolean
): string => {
  if (vertical) {
    return key(step === "earlier" ? "move_up" : "move_down");
  }
  const left = (step === "earlier") !== rtl;
  return key(left ? "move_left" : "move_right");
};

const endIcon = (
  end: "start" | "end",
  vertical: boolean,
  rtl: boolean
): string => {
  if (vertical) {
    return end === "start" ? mdiArrowUp : mdiArrowDown;
  }
  return (end === "start") !== rtl ? mdiArrowLeft : mdiArrowRight;
};

/** The entries of the menu of one tab, in order. */
export const tabMenuEntries = (input: TabMenuInput): TabMenuEntry[] => {
  const vertical = isVerticalDock(input.dock);
  const rtl = Boolean(input.rtl);
  const index = input.openIds.indexOf(input.tabId);
  const count = input.openIds.length;
  const pinned = input.pinnedIds.includes(input.tabId);
  const others = Math.max(0, count - 1);
  // The owner reads `moves` from the strip's own move planner, which knows
  // about groups; without it the flat order decides.
  const can = (kind: TabMoveKind) =>
    input.moves?.[kind] ??
    moveTarget(input.openIds, input.pinnedIds, input.tabId, kind) !== undefined;

  const entries: TabMenuEntry[] = [
    {
      id: pinned ? "unpin" : "pin",
      labelKey: key(pinned ? "unpin_tab" : "pin_tab"),
      icon: pinned ? mdiPinOff : mdiPin,
      enabled: true,
      destructive: false,
    },
    {
      id: "close",
      labelKey: key("close_tab"),
      icon: mdiClose,
      // A pinned tab is unpinned first, as the close button on the strip does.
      enabled: index !== -1 && !pinned,
      destructive: true,
      separatorBefore: true,
    },
    {
      id: "close_others",
      labelKey: key("close_others"),
      icon: mdiCloseCircleMultiple,
      enabled: others > 0,
      destructive: true,
    },
    {
      id: "close_to_start",
      labelKey: closeEndKey("start", vertical, rtl),
      icon: endIcon("start", vertical, rtl),
      enabled: index > 0,
      destructive: true,
    },
    {
      id: "close_to_end",
      labelKey: closeEndKey("end", vertical, rtl),
      icon: endIcon("end", vertical, rtl),
      enabled: index !== -1 && index < count - 1,
      destructive: true,
    },
    {
      id: "close_containing",
      labelKey: key("close_containing"),
      icon: mdiTabRemove,
      enabled: count > 0,
      destructive: true,
    },
    {
      id: "close_not_containing",
      labelKey: key("close_not_containing"),
      icon: mdiCloseBoxMultiple,
      enabled: count > 0,
      destructive: true,
    },
  ];

  if (input.hasClosed) {
    entries.push({
      id: "open_every",
      labelKey: key("open_every_tab"),
      icon: mdiTabPlus,
      enabled: true,
      destructive: false,
    });
  }

  entries.push({
    id: "move_into_group",
    labelKey: key("move_into_group"),
    icon: mdiFolderMove,
    // A pinned tab never joins a group.
    enabled: !pinned,
    destructive: false,
    separatorBefore: true,
  });
  if (input.grouped) {
    entries.push({
      id: "remove_from_group",
      labelKey: key("remove_from_group"),
      icon: mdiFolderRemove,
      enabled: true,
      destructive: false,
    });
  }
  entries.push(
    {
      id: "new_group",
      labelKey: key("new_group"),
      icon: mdiFolderPlus,
      enabled: !pinned,
      destructive: false,
    },
    {
      id: "move_earlier",
      labelKey: moveStepKey("earlier", vertical, rtl),
      icon: endIcon("start", vertical, rtl),
      enabled: can("earlier"),
      destructive: false,
      separatorBefore: true,
    },
    {
      id: "move_later",
      labelKey: moveStepKey("later", vertical, rtl),
      icon: endIcon("end", vertical, rtl),
      enabled: can("later"),
      destructive: false,
    },
    {
      id: "move_start",
      // Inside a group the move stays inside it, and the words say so.
      labelKey: key(input.grouped ? "move_to_group_start" : "move_to_start"),
      icon: mdiPageFirst,
      enabled: can("start"),
      destructive: false,
    },
    {
      id: "move_end",
      labelKey: key(input.grouped ? "move_to_group_end" : "move_to_end"),
      icon: mdiPageLast,
      enabled: can("end"),
      destructive: false,
    },
    {
      id: "edit_appearance",
      labelKey: key("edit_appearance"),
      icon: mdiFormatPaint,
      enabled: true,
      destructive: false,
      separatorBefore: true,
    }
  );
  if (input.customised) {
    entries.push({
      id: "reset_appearance",
      labelKey: key("reset_appearance"),
      icon: mdiRestore,
      enabled: true,
      destructive: false,
    });
  }
  // The lock sits beside the appearance entry. A tab locked only by its group
  // is unlocked through the group's own lock.
  entries.push(
    input.locked
      ? {
          id: "unlock",
          labelKey: key(input.lockedByGroup ? "unlock_group" : "unlock_tab"),
          icon: mdiLockOpenVariant,
          enabled: true,
          destructive: false,
        }
      : {
          id: "lock",
          labelKey: key("lock_tab"),
          icon: mdiLock,
          enabled: true,
          destructive: false,
        }
  );

  // A locked tab offers only the unlock and what changes no tab for good.
  return input.locked ? entries.filter((entry) => !entry.destructive) : entries;
};

export interface StripMenuInput {
  dock: DockEdge;
  /** The strip shows its tabs' icons only. */
  collapsed?: boolean;
  hasClosed: boolean;
  /** At least one tab is open. */
  hasOpen?: boolean;
}

const DOCKS: [DockEdge, TabMenuEntryId, string, string][] = [
  ["left", "dock_left", "dock_left", mdiDockLeft],
  ["right", "dock_right", "dock_right", mdiDockRight],
  ["top", "dock_top", "dock_top", mdiDockTop],
  ["bottom", "dock_bottom", "dock_bottom", mdiDockBottom],
  ["float", "dock_float", "dock_float", mdiDockWindow],
];

/** The entries of the menu of the empty space of the strip. */
export const stripMenuEntries = (input: StripMenuInput): TabMenuEntry[] => {
  const entries: TabMenuEntry[] = DOCKS.map(([edge, id, name, icon]) => ({
    id,
    labelKey: key(name),
    icon,
    enabled: true,
    destructive: false,
    checked: input.dock === edge,
  }));
  entries.push(
    input.collapsed
      ? {
          id: "expand_strip",
          labelKey: key("expand_strip"),
          icon: mdiChevronDoubleRight,
          enabled: true,
          destructive: false,
          separatorBefore: true,
        }
      : {
          id: "collapse_strip",
          labelKey: key("collapse_strip"),
          icon: mdiChevronDoubleLeft,
          enabled: true,
          destructive: false,
          separatorBefore: true,
        }
  );
  entries.push(
    {
      id: "new_tab",
      labelKey: key("new_tab"),
      icon: mdiTabPlus,
      enabled: true,
      destructive: false,
      separatorBefore: true,
    },
    {
      id: "new_group",
      labelKey: key("new_group"),
      icon: mdiFolderPlus,
      enabled: true,
      destructive: false,
    }
  );
  if (input.hasClosed) {
    entries.push({
      id: "open_every",
      labelKey: key("open_every_tab"),
      icon: mdiTabPlus,
      enabled: true,
      destructive: false,
    });
  }
  entries.push(
    {
      id: "close_containing",
      labelKey: key("close_containing"),
      icon: mdiTextSearch,
      enabled: input.hasOpen !== false,
      destructive: true,
      separatorBefore: true,
    },
    {
      id: "close_not_containing",
      labelKey: key("close_not_containing"),
      icon: mdiCloseBoxMultiple,
      enabled: input.hasOpen !== false,
      destructive: true,
    },
    {
      id: "edit_strip_appearance",
      labelKey: key("edit_strip_appearance"),
      icon: mdiFormatPaint,
      enabled: true,
      destructive: false,
      separatorBefore: true,
    }
  );
  return entries;
};
