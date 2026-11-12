import type { TabGroup } from "../../common/tabs/tab-groups";
import { groupOf } from "../../common/tabs/tab-groups";

/**
 * Showing a search result that sits inside a collapsed group.
 *
 * The decision: a search never changes the saved `collapsed` flag of a group.
 * The result lists of the searches show every match with its group and a
 * "collapsed" note, so the match is reachable there. When a result is
 * activated, the tab is revealed in the strip for this visit only: it is
 * added to the session set below, and the strip draws a collapsed group with
 * its revealed members through `effectiveCollapsed` and `visibleMembers`.
 * Nothing here is saved, so a reload gives the person's own collapsed
 * state back.
 */

const revealed = new Map<string, Set<string>>();

const listeners = new Set<() => void>();

const changed = () => listeners.forEach((callback) => callback());

/** Calls back when the revealed set changes; returns the way to stop. */
export const subscribeReveals = (callback: () => void): (() => void) => {
  listeners.add(callback);
  return () => listeners.delete(callback);
};

/** Reveals one tab of a collapsed group for this visit. */
export const revealTabForSession = (surface: string, tabId: string): void => {
  const set = revealed.get(surface) ?? new Set<string>();
  if (set.has(tabId)) {
    return;
  }
  set.add(tabId);
  revealed.set(surface, set);
  changed();
};

/** Drops every reveal of a strip, or of all strips. */
export const clearReveals = (surface?: string): void => {
  if (surface === undefined) {
    revealed.clear();
  } else {
    revealed.delete(surface);
  }
  changed();
};

export const isRevealed = (surface: string, tabId: string): boolean =>
  revealed.get(surface)?.has(tabId) === true;

/**
 * Whether the strip should draw a group as collapsed: the saved flag, unless
 * a member was revealed by a search in this visit. The saved flag itself is
 * not modified.
 */
export const effectiveCollapsed = (surface: string, group: TabGroup): boolean =>
  group.collapsed && !group.members.some((id) => isRevealed(surface, id));

/** The members of a group that the strip draws now. */
export const visibleMembers = (surface: string, group: TabGroup): string[] =>
  group.collapsed
    ? group.members.filter((id) => isRevealed(surface, id))
    : [...group.members];

/** Whether a tab sits in a collapsed group, for a note beside a result. */
export const inCollapsedGroup = (
  groups: readonly TabGroup[],
  tabId: string
): boolean => groupOf(groups, tabId)?.collapsed === true;
