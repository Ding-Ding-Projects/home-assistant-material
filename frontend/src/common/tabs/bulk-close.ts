import { regexQuery, searchMatcher } from "../regex/filter";

export interface BulkCloseTab {
  id: string;
  /** Texts the search looks at: the visible label first. */
  texts: string[];
  open: boolean;
  /** The tab the person is on. It is never closed in bulk. */
  current: boolean;
}

export type BulkCloseMode = "matching" | "not_matching";

export interface BulkClosePlan {
  /** Tabs that would close, in strip order. */
  ids: string[];
  /** Why nothing can close: no search text, or a pattern that cannot be used. */
  blocked?: "empty" | "invalid";
}

/**
 * Works out which tabs "Close tabs containing text" and "Close tabs not
 * containing text" would close. Both use the same test as the search field,
 * so the list under the field is the preview.
 *
 * Nothing closes for an empty search or an unusable pattern: an empty
 * "not containing" search would otherwise close every tab. Closed tabs are
 * not counted, and the current tab stays open.
 */
export const planBulkClose = (
  tabs: readonly BulkCloseTab[],
  query: string,
  mode: BulkCloseMode
): BulkClosePlan => {
  if (!query.trim()) {
    return { ids: [], blocked: "empty" };
  }
  if (regexQuery(query)?.error) {
    return { ids: [], blocked: "invalid" };
  }
  const matches = searchMatcher(query);
  return {
    ids: tabs
      .filter(
        (tab) =>
          tab.open &&
          !tab.current &&
          matches(...tab.texts) === (mode === "matching")
      )
      .map((tab) => tab.id),
  };
};
