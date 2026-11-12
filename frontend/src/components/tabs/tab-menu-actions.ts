import { getStorage } from "../../common/decorators/storage";
import { readLocks } from "../../common/locks/element-locks";
import type { TabAppearanceStore } from "../../common/tabs/tab-appearance-store";
import { readTabAppearance } from "../../common/tabs/tab-appearance-store";
import type { ClosePlan, PlanTab } from "../../common/tabs/tab-close-plans";
import type { TabGroup } from "../../common/tabs/tab-groups";
import {
  groupOf,
  layoutStrip,
  readGroups,
  ungroupTabs,
  writeGroups,
} from "../../common/tabs/tab-groups";
import {
  tabLockKey,
  groupLockKey,
  tabLockState,
} from "../../common/tabs/tab-locks";
import {
  CLOSED_STORAGE_KEY,
  ORDER_STORAGE_KEY,
  PINNED_STORAGE_KEY,
  normalizeClosed,
  normalizeOrder,
  normalizePinned,
  pinTab,
  unpinTab,
} from "../../common/tabs/tab-pins";
import { closeTab, openEveryTab } from "../../common/tabs/tab-seen";
import { cleanIds } from "../../common/tabs/tab-validate";
import type { TabMoveKind } from "./tab-menu-entries";
import { planMove } from "./tab-menu-entries";
import {
  applyChange,
  flattenSegments,
  planKeyboardMove,
} from "./tab-strip-moves";
import type { PageTab } from "./tab-types";

/**
 * What the tab menu reads and writes. Every write goes through the model in
 * `common/tabs` and its storage keys, so the strip, which listens to those
 * keys, redraws by itself. Nothing here touches the page.
 */

export interface TabMenuState {
  surface: string;
  /** Every tab in strip order, open or closed. */
  ordered: string[];
  /** The open tabs in strip order. */
  open: string[];
  closed: string[];
  pinned: string[];
  groups: TabGroup[];
  labels: Record<string, string>;
  /** The tabs as the close plans want them, in strip order. */
  planTabs: PlanTab[];
  appearance: TabAppearanceStore;
  /** The lock state of each tab. */
  locks: Record<string, { locked: boolean; byGroup: boolean }>;
}

const store = () => getStorage();

export const readClosed = (): string[] =>
  normalizeClosed(store().getValue(CLOSED_STORAGE_KEY));

export const readOrder = (): string[] =>
  normalizeOrder(store().getValue(ORDER_STORAGE_KEY));

export const readPinnedIds = (): string[] =>
  normalizePinned(store().getValue(PINNED_STORAGE_KEY));

const writeClosed = (ids: readonly string[]): void =>
  store().setValue(CLOSED_STORAGE_KEY, cleanIds([...ids]));

const writeOrder = (ids: readonly string[]): void =>
  store().setValue(ORDER_STORAGE_KEY, cleanIds([...ids]));

const writePinnedIds = (ids: readonly string[]): void =>
  store().setValue(PINNED_STORAGE_KEY, normalizePinned([...ids]));

/** Reads the saved state of a strip. `tabs` are the pages in natural order. */
export const readMenuState = (
  surface: string,
  tabs: readonly PageTab[],
  current?: string
): TabMenuState => {
  const closed = readClosed();
  const pinned = readPinnedIds();
  const groups = readGroups(surface);
  // The strip's own layout, so the menu sees tabs in the order the strip draws
  // them: the pinned list first, and the members of a group together.
  const byId = new Map(tabs.map((tab) => [tab.urlPath, tab]));
  const ordered = flattenSegments(
    layoutStrip({
      visible: tabs.map((tab) => tab.urlPath),
      order: readOrder(),
      pinned,
      groups,
    })
  ).flatMap((id) => byId.get(id) ?? []);
  const lockStore = readLocks();
  const appearance = readTabAppearance();
  const labels: Record<string, string> = {};
  const locks: TabMenuState["locks"] = {};
  const planTabs: PlanTab[] = ordered.map((tab) => {
    const id = tab.urlPath;
    // The visible label: the one the person gave the tab, else the page title.
    const label = appearance[surface]?.[id]?.label || tab.title;
    labels[id] = label;
    const state = tabLockState(lockStore, surface, id, groups);
    locks[id] = {
      locked: state.locked,
      byGroup: state.locked && !state.reasons.includes("tab"),
    };
    return {
      id,
      label,
      open: !closed.includes(id),
      current: id === current,
      pinned: pinned.includes(id),
      locked: state.locked,
    };
  });
  return {
    surface,
    ordered: ordered.map((tab) => tab.urlPath),
    open: planTabs.filter((tab) => tab.open).map((tab) => tab.id),
    closed,
    pinned,
    groups,
    labels,
    planTabs,
    appearance,
    locks,
  };
};

/** The lock key to ask about when a tab is unlocked: its own or its group's. */
export const unlockKeyFor = (
  state: TabMenuState,
  tabId: string
): string | undefined => {
  const lock = state.locks[tabId];
  if (!lock?.locked) {
    return undefined;
  }
  if (!lock.byGroup) {
    return tabLockKey(state.surface, tabId);
  }
  const group = groupOf(state.groups, tabId);
  return group ? groupLockKey(state.surface, group.id) : undefined;
};

/**
 * Pins or unpins a tab. The shown order is saved first, so the tab stays where
 * it is inside its new region, as the pin button does. A pinned tab is never in
 * a group, so pinning takes a grouped tab out of its group.
 */
export const togglePinAction = (
  state: TabMenuState,
  tabId: string
): { pinned: boolean } => {
  const wasPinned = state.pinned.includes(tabId);
  writeOrder(state.ordered);
  if (wasPinned) {
    writePinnedIds(unpinTab(state.pinned, tabId));
    return { pinned: false };
  }
  writePinnedIds(pinTab(state.pinned, tabId));
  if (groupOf(state.groups, tabId)) {
    writeGroups(state.surface, ungroupTabs(state.groups, [tabId]));
  }
  return { pinned: true };
};

/** Closes tabs. The previous closed list is returned for Undo. */
export const closeTabsAction = (
  state: TabMenuState,
  ids: readonly string[]
): { previous: string[] } => {
  const previous = [...state.closed];
  writeClosed(ids.reduce((list, id) => closeTab(list, id), previous));
  return { previous };
};

/** Undo for a close: the tabs it closed open again, nothing else changes. */
export const undoCloseAction = (ids: readonly string[]): void => {
  const reopen = new Set(ids);
  writeClosed(readClosed().filter((id) => !reopen.has(id)));
};

/** Open every tab: only the closed list changes. */
export const openEveryAction = (
  state: TabMenuState
): { reopened: string[] } => {
  const { closed, reopened } = openEveryTab(state.ordered, state.closed);
  writeClosed(closed);
  return { reopened };
};

/** Moves a tab. Returns its new place among the open tabs, or undefined. */
export const moveAction = (
  state: TabMenuState,
  tabId: string,
  kind: TabMoveKind
): { position: number; total: number } | undefined => {
  if (kind === "earlier" || kind === "later") {
    // One step goes through the strip's own planner, so a tab moves past a
    // whole group, leaves a group at its edge and re-orders the pinned list
    // exactly as the keyboard move on the strip does.
    const segments = layoutStrip({
      visible: state.open,
      order: state.ordered,
      pinned: state.pinned,
      groups: state.groups,
    });
    const change = planKeyboardMove(
      segments,
      { groups: state.groups, pinned: state.pinned },
      tabId,
      kind === "later"
    );
    if (!change) {
      return undefined;
    }
    const result = applyChange({
      fullOrder: state.ordered,
      visibleBefore: flattenSegments(segments),
      change,
    });
    writeOrder(result.order);
    if (result.pinned) {
      writePinnedIds(result.pinned);
    }
    if (result.groups) {
      writeGroups(state.surface, result.groups);
    }
    return {
      position: change.visible.indexOf(tabId) + 1,
      total: state.open.length,
    };
  }
  const plan = planMove(state.ordered, state.open, state.pinned, tabId, kind);
  if (!plan) {
    return undefined;
  }
  writeOrder(plan.order);
  if (plan.pinned) {
    writePinnedIds(plan.pinned);
  }
  return { position: plan.position + 1, total: state.open.length };
};

/** Takes a tab out of its group. */
export const removeFromGroupAction = (
  state: TabMenuState,
  tabId: string
): void => {
  writeGroups(state.surface, ungroupTabs(state.groups, [tabId]));
};

/** The ids a plan closes, or none when the plan is blocked. */
export const planIds = (plan: ClosePlan): string[] =>
  plan.blocked ? [] : plan.ids;
