import { regexQuery, searchMatcher } from "../regex/filter";

/**
 * The groups of the New tab catalog. Each has its own search text. Pinned and
 * pages are open or closable tabs; settings and tools are pages that can be
 * visited but are never tabs, so they only filter.
 */
export type TabGroupId = "pinned" | "pages" | "settings" | "tools";

export const TAB_GROUP_IDS: readonly TabGroupId[] = [
  "pinned",
  "pages",
  "settings",
  "tools",
];

/** The group a tab belongs to: pinned tabs sit first, the rest are pages. */
export const tabGroupOf = (pinned: boolean): "pinned" | "pages" =>
  pinned ? "pinned" : "pages";

/** True when the text is a pattern (`/pattern/flags`) that cannot be used. */
export const isGroupQueryInvalid = (query: string): boolean =>
  Boolean(regexQuery(query)?.error);

/**
 * The items of one group that match that group's search text.
 *
 * An empty search shows every item. A pattern that cannot be used also shows
 * every item, so a half-typed pattern never makes a group look empty; the
 * field itself reports the problem. Plain text and a usable pattern use the
 * same test as every other search field.
 */
export const filterGroupItems = <T>(
  items: readonly T[],
  query: string,
  getTexts: (item: T) => string[]
): T[] => {
  if (!query.trim() || isGroupQueryInvalid(query)) {
    return [...items];
  }
  const matches = searchMatcher(query);
  return items.filter((item) => matches(...getTexts(item)));
};

export interface GroupCloseTab {
  id: string;
  /** Texts the search looks at: the visible label first. */
  texts: string[];
  open: boolean;
  /** The tab the person is on. It is never closed in bulk. */
  current: boolean;
  pinned: boolean;
}

export interface GroupClosePlan {
  /** Tabs that would close, in strip order. */
  ids: string[];
  /**
   * Why nothing can close: no search text, a pattern that cannot be used,
   * pinned tabs that were not asked for, or a group that holds no tabs.
   */
  blocked?: "empty" | "invalid" | "pinned" | "not_tabs";
}

export interface GroupCloseOptions {
  /** Pinned tabs close only when this is set, and only from the pinned group. */
  includePinned?: boolean;
}

/**
 * Works out which tabs "Close matching" would close in one group.
 *
 * It looks only at the tabs of that group. Nothing closes for an empty search
 * or an unusable pattern. Pages never close a pinned tab, and the pinned group
 * closes nothing unless `includePinned` is set. Closed tabs are not counted
 * and the tab in use stays open.
 */
export const planGroupClose = (
  tabs: readonly GroupCloseTab[],
  group: TabGroupId,
  query: string,
  options: GroupCloseOptions = {}
): GroupClosePlan => {
  if (group !== "pinned" && group !== "pages") {
    return { ids: [], blocked: "not_tabs" };
  }
  if (!query.trim()) {
    return { ids: [], blocked: "empty" };
  }
  if (isGroupQueryInvalid(query)) {
    return { ids: [], blocked: "invalid" };
  }
  if (group === "pinned" && !options.includePinned) {
    return { ids: [], blocked: "pinned" };
  }
  const matches = searchMatcher(query);
  return {
    ids: tabs
      .filter(
        (tab) =>
          tabGroupOf(tab.pinned) === group &&
          tab.open &&
          !tab.current &&
          matches(...tab.texts)
      )
      .map((tab) => tab.id),
  };
};
