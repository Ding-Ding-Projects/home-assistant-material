import { getStorage } from "../../common/decorators/storage";
import {
  readLocks,
  withLock,
  writeLocks,
} from "../../common/locks/element-locks";
import {
  createGroup,
  groupOf,
  layoutStrip,
  moveTabToGroup,
  readGroups,
  removeGroup,
  reorderSegments,
  ungroupTabs,
  writeGroups,
} from "../../common/tabs/tab-groups";
import type { GroupColour, StripSegment } from "../../common/tabs/tab-groups";
import type {
  PlanTab,
  ProtectedTab,
  ProtectReason,
} from "../../common/tabs/tab-close-plans";
import { groupLockKey, tabLockKey } from "../../common/tabs/tab-locks";
import {
  CLOSED_STORAGE_KEY,
  ORDER_STORAGE_KEY,
  normalizeClosed,
  pinTab,
  unpinTab,
  writePinned,
} from "../../common/tabs/tab-pins";
import { closeTab } from "../../common/tabs/tab-seen";
import { DEFAULT_SURFACE, cleanSurface } from "../../common/tabs/tab-validate";
import {
  readGroupAppearance,
  resetGroup,
  writeGroupAppearance,
} from "./tab-group-appearance-store";
import type { StripState } from "./tab-group-state";
import { pinnedFor } from "./tab-group-state";
import { flattenSegments, mergeVisible } from "./tab-strip-moves";

/**
 * What the group picker and the group menu do to the saved state. Every
 * change goes through the group model (`common/tabs/tab-groups.ts`) and its
 * storage, never through the strip: the strip re-renders when storage
 * changes. The pure planning functions take plain data so they can be tested
 * without a page.
 */

export interface MoveResult {
  /** Tabs that are now in the chosen group (or out of every group). */
  moved: string[];
  /** Tabs the model refused: pinned tabs cannot join a group. */
  refused: string[];
}

/** Moves tabs into a group, or out of every group when `groupId` is null. */
export const moveTabsToGroup = (
  surface: string | undefined,
  tabIds: readonly string[],
  groupId: string | null
): MoveResult => {
  const key = cleanSurface(surface);
  const pinned = pinnedFor(key);
  let groups = readGroups(key);
  const refused: string[] = [];
  const moved: string[] = [];
  tabIds.forEach((id) => {
    if (groupId !== null && pinned.includes(id)) {
      refused.push(id);
      return;
    }
    groups = moveTabToGroup(groups, id, groupId, { pinned });
    moved.push(id);
  });
  if (groupId !== null && !groups.some((group) => group.id === groupId)) {
    return { moved: [], refused: [...tabIds] };
  }
  writeGroups(key, groups);
  return { moved, refused };
};

export interface CreateResult extends MoveResult {
  /** The new group's id; empty when the limit of groups is reached. */
  id: string;
}

/** Makes a group and moves the tabs into it; pinned tabs are refused. */
export const createGroupWithTabs = (
  surface: string | undefined,
  input: { name: string; colour?: GroupColour; tabIds: readonly string[] }
): CreateResult => {
  const key = cleanSurface(surface);
  const pinned = pinnedFor(key);
  const refused = input.tabIds.filter((id) => pinned.includes(id));
  const { groups, id } = createGroup(
    readGroups(key),
    { name: input.name, colour: input.colour, members: [...input.tabIds] },
    pinned
  );
  if (!id) {
    return { id: "", moved: [], refused: [...input.tabIds] };
  }
  writeGroups(key, groups);
  return {
    id,
    moved: input.tabIds.filter((tab) => !pinned.includes(tab)),
    refused,
  };
};

/** Whether a group is locked and not opened for now. */
export const isGroupLockedNow = (
  surface: string | undefined,
  groupId: string,
  isUnlocked: (key: string) => boolean
): boolean => {
  const key = groupLockKey(surface, groupId);
  return readLocks().locked.includes(key) && !isUnlocked(key);
};

/**
 * Takes a group away and keeps its tabs open. Its look and its lock go with
 * it, so no lock record or credential is left behind for a group that is gone.
 */
export const removeGroupKeepingTabs = (
  surface: string | undefined,
  groupId: string
): void => {
  const key = cleanSurface(surface);
  writeGroups(key, removeGroup(readGroups(key), groupId));
  writeGroupAppearance(resetGroup(readGroupAppearance(), key, groupId));
  const lockKey = groupLockKey(key, groupId);
  const locks = readLocks();
  if (locks.locked.includes(lockKey)) {
    writeLocks(withLock(locks, lockKey, false));
  }
};

export type ClosedReason = ProtectReason;

export interface GroupClosePlan {
  /** Open tabs of the group that would close, in strip order. */
  ids: string[];
  /** Tabs of the group that stay open, with the reasons. */
  protected: ProtectedTab[];
}

/**
 * The preview of "Close the group's tabs". The page in use and locked tabs
 * stay open (pinned tabs cannot be in a group, but stale data is still
 * guarded). `tabs` lists the group's members only.
 */
export const planGroupClose = (tabs: readonly PlanTab[]): GroupClosePlan => {
  const ids: string[] = [];
  const kept: ProtectedTab[] = [];
  tabs.forEach((tab) => {
    if (!tab.open) {
      return;
    }
    const reasons: ProtectReason[] = [];
    if (tab.current) {
      reasons.push("current");
    }
    if (tab.pinned) {
      reasons.push("pinned");
    }
    if (tab.locked) {
      reasons.push("locked");
    }
    if (reasons.length) {
      kept.push({ id: tab.id, reasons });
    } else {
      ids.push(tab.id);
    }
  });
  return { ids, protected: kept };
};

/** The members of a group as plan tabs, for the preview. */
export const groupPlanTabs = (
  state: StripState,
  groupId: string,
  current: string | undefined,
  lockedIds: readonly string[]
): PlanTab[] => {
  const group = state.groups.find((item) => item.id === groupId);
  if (!group) {
    return [];
  }
  return group.members.flatMap((id) => {
    const tab = state.tabs.find((item) => item.id === id);
    return tab
      ? [
          {
            id,
            label: tab.label,
            open: tab.open,
            current: id === current,
            pinned: state.pinned.includes(id),
            locked: lockedIds.includes(id),
          },
        ]
      : [];
  });
};

/** The ids among `ids` that are locked, by their own lock or their group's. */
export const lockedAmong = (
  state: StripState,
  ids: readonly string[],
  locked: readonly string[]
): string[] =>
  ids.filter((id) => {
    if (locked.includes(tabLockKey(state.surface, id))) {
      return true;
    }
    const group = groupOf(state.groups, id);
    return Boolean(
      group && locked.includes(groupLockKey(state.surface, group.id))
    );
  });

/** Closes tabs of a strip. Only the wide strip has a saved closed list today. */
export const closeTabs = (
  surface: string | undefined,
  ids: readonly string[]
): void => {
  if (cleanSurface(surface) !== DEFAULT_SURFACE || !ids.length) {
    return;
  }
  // The same shape the strip and the menu write: ids, once each, validated.
  const closed = normalizeClosed(getStorage().getValue(CLOSED_STORAGE_KEY));
  getStorage().setValue(
    CLOSED_STORAGE_KEY,
    ids.reduce((list, id) => closeTab(list, id), closed)
  );
};

export type GroupMove = "left" | "right" | "start" | "end";

/**
 * The saved page order after moving a group, or `undefined` when it cannot
 * move that way (already there, or not in the strip). `left` and `right`
 * are screen directions: in a right-to-left strip, left is later in the
 * order, so the caller passes `rtl`. Vertical strips map up to `left` and
 * down to `right` and pass `rtl` false.
 */
export const planGroupMove = (
  segments: readonly StripSegment[],
  groupId: string,
  move: GroupMove,
  rtl = false
): string[] | undefined => {
  const movable = segments.filter((segment) => segment.kind !== "pinned");
  const keys = movable.map((segment) =>
    segment.kind === "group" ? `group:${segment.group.id}` : `tab:${segment.id}`
  );
  const own = `group:${groupId}`;
  const at = keys.indexOf(own);
  if (at === -1) {
    return undefined;
  }
  const earlier =
    move === "start"
      ? true
      : move === "end"
        ? false
        : rtl
          ? move === "right"
          : move === "left";
  let targetIndex: number;
  if (move === "start") {
    targetIndex = 0;
  } else if (move === "end") {
    targetIndex = keys.length - 1;
  } else {
    targetIndex = at + (earlier ? -1 : 1);
  }
  if (targetIndex < 0 || targetIndex >= keys.length || targetIndex === at) {
    return undefined;
  }
  return reorderSegments(segments, own, keys[targetIndex], !earlier);
};

/** Saves a group move: the open tabs in the new order, closed ones after. */
export const moveGroup = (
  state: StripState,
  groupId: string,
  move: GroupMove,
  rtl = false
): boolean => {
  const segments = layoutStrip({
    visible: state.openIds,
    order: state.order,
    pinned: state.pinned,
    groups: state.groups,
  });
  const order = planGroupMove(segments, groupId, move, rtl);
  if (!order) {
    return false;
  }
  // Closed tabs keep their own slots, exactly as the strip's own moves do
  // (see `mergeVisible`), so a move here and a drag there agree.
  const fullOrder = flattenSegments(
    layoutStrip({
      visible: state.tabs.map((tab) => tab.id),
      order: state.order,
      pinned: state.pinned,
      groups: state.groups,
    })
  );
  getStorage().setValue(
    ORDER_STORAGE_KEY,
    mergeVisible(fullOrder, flattenSegments(segments), order)
  );
  return true;
};

/**
 * Pins or unpins a tab of the wide strip, as the pin button on the tab does:
 * the shown order is saved first so the tab keeps its place, and pinning takes
 * the tab out of its group (a pinned tab is never in a group). Other strips
 * keep no pin list, so nothing changes there. Returns the new pinned state.
 */
export const togglePinTab = (state: StripState, id: string): boolean => {
  if (state.surface !== DEFAULT_SURFACE) {
    return state.pinned.includes(id);
  }
  const pinned = state.pinned.includes(id);
  getStorage().setValue(
    ORDER_STORAGE_KEY,
    state.tabs.map((tab) => tab.id)
  );
  if (pinned) {
    writePinned(unpinTab(state.pinned, id));
  } else {
    writeGroups(state.surface, ungroupTabs(readGroups(state.surface), [id]));
    writePinned(pinTab(state.pinned, id));
  }
  return !pinned;
};
