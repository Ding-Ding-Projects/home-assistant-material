import { regexQuery, searchMatcher } from "../regex/filter";
import type { TabGroup } from "./tab-groups";
import { groupOf } from "./tab-groups";
import { tabLockState } from "./tab-locks";
import type { LockStore } from "../locks/element-locks";

/**
 * The data behind the four tab searches:
 * 1. this strip (`searchStrip`),
 * 2. inside one group (`searchGroup`),
 * 3. groups by name (`searchGroupNames`),
 * 4. a master list across every strip (`searchMaster`).
 *
 * Each search has its own query, so the four never share state. Matching uses
 * the visible label only. An empty query lists everything, and an unusable
 * pattern lists everything too with `invalid` set, so a half-typed pattern
 * never makes a list look empty; the field reports the problem.
 */

export interface StripSnapshot {
  /** The strip's stable name. */
  surface: string;
  /** What the strip is called in a master list. */
  surfaceLabel?: string;
  /** Tabs in strip order. */
  tabs: { id: string; label: string; open: boolean }[];
  pinned: readonly string[];
  groups: readonly TabGroup[];
}

export interface TabSearchRow {
  surface: string;
  surfaceLabel: string;
  id: string;
  label: string;
  open: boolean;
  groupId?: string;
  groupName?: string;
  pinned: boolean;
  locked: boolean;
}

export interface SearchResult<T> {
  items: T[];
  /** True when the query is a pattern that cannot be used. */
  invalid: boolean;
}

/** One row for every tab of the strips, with its group, pinned and locked state. */
export const buildSearchRows = (
  strips: readonly StripSnapshot[],
  locks: Pick<LockStore, "locked"> = { locked: [] }
): TabSearchRow[] =>
  strips.flatMap((strip) =>
    strip.tabs.map((tab) => {
      const group = groupOf(strip.groups, tab.id);
      const pinned = strip.pinned.includes(tab.id);
      return {
        surface: strip.surface,
        surfaceLabel: strip.surfaceLabel ?? strip.surface,
        id: tab.id,
        label: tab.label,
        open: tab.open,
        ...(group && !pinned
          ? { groupId: group.id, groupName: group.name }
          : {}),
        pinned,
        locked: tabLockState(locks, strip.surface, tab.id, strip.groups).locked,
      };
    })
  );

const filter = <T>(
  items: readonly T[],
  query: string,
  texts: (item: T) => string[]
): SearchResult<T> => {
  if (!query.trim()) {
    return { items: [...items], invalid: false };
  }
  if (regexQuery(query)?.error) {
    return { items: [...items], invalid: true };
  }
  const matches = searchMatcher(query);
  return {
    items: items.filter((item) => matches(...texts(item))),
    invalid: false,
  };
};

/** Search 1: the tabs of one strip. Closed tabs are left out unless asked for. */
export const searchStrip = (
  rows: readonly TabSearchRow[],
  surface: string,
  query: string,
  options: { includeClosed?: boolean } = {}
): SearchResult<TabSearchRow> =>
  filter(
    rows.filter(
      (row) =>
        row.surface === surface && (row.open || options.includeClosed === true)
    ),
    query,
    (row) => [row.label]
  );

/** Search 2: the tabs inside one group. */
export const searchGroup = (
  rows: readonly TabSearchRow[],
  surface: string,
  groupId: string,
  query: string,
  options: { includeClosed?: boolean } = {}
): SearchResult<TabSearchRow> =>
  filter(
    rows.filter(
      (row) =>
        row.surface === surface &&
        row.groupId === groupId &&
        (row.open || options.includeClosed === true)
    ),
    query,
    (row) => [row.label]
  );

export interface GroupRow {
  id: string;
  name: string;
  colour: string;
  collapsed: boolean;
  /** Members that are open tabs. */
  openCount: number;
  memberCount: number;
  locked: boolean;
}

/** Search 3: the groups of a strip, by name. */
export const searchGroupNames = (
  groups: readonly TabGroup[],
  query: string,
  isOpen: (tabId: string) => boolean = () => true,
  isLocked: (groupId: string) => boolean = () => false
): SearchResult<GroupRow> =>
  filter(
    groups.map((group) => ({
      id: group.id,
      name: group.name,
      colour: group.colour,
      collapsed: group.collapsed,
      memberCount: group.members.length,
      openCount: group.members.filter(isOpen).length,
      locked: isLocked(group.id),
    })),
    query,
    (group) => [group.name]
  );

/**
 * Search 4: every open tab in every strip. Results keep the order of the
 * strips and of the tabs. Closed tabs are left out unless asked for.
 * Revealing a result inside a collapsed group is the caller's view-only
 * decision: the stored `collapsed` flag is not touched by a search.
 */
export const searchMaster = (
  rows: readonly TabSearchRow[],
  query: string,
  options: { includeClosed?: boolean } = {}
): SearchResult<TabSearchRow> =>
  filter(
    rows.filter((row) => row.open || options.includeClosed === true),
    query,
    (row) => [row.label]
  );
