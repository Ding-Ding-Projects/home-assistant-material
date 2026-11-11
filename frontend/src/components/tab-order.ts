/**
 * Puts the tabs in the order the person chose: pinned tabs first, then the
 * rest. Inside each group the saved order wins, and a tab that was never
 * placed (a page added by an update) keeps its natural position after those
 * that were.
 */
export const applyTabOrder = <T extends { urlPath: string }>(
  tabs: readonly T[],
  order: readonly string[],
  pinned: readonly string[]
): T[] => {
  const rank = (tab: T, natural: number) => {
    const index = order.indexOf(tab.urlPath);
    return index === -1 ? order.length + natural : index;
  };
  return tabs
    .map((tab, natural) => ({
      tab,
      natural,
      pinned: pinned.includes(tab.urlPath),
      rank: rank(tab, natural),
    }))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.rank - b.rank)
    .map((entry) => entry.tab);
};

/**
 * Moves one id next to another in a list of ids. Returns the list unchanged
 * when either id is missing or both are the same.
 */
export const moveTabId = (
  ids: readonly string[],
  from: string,
  to: string,
  after: boolean
): string[] => {
  if (from === to || !ids.includes(from) || !ids.includes(to)) {
    return [...ids];
  }
  const rest = ids.filter((id) => id !== from);
  const target = rest.indexOf(to);
  rest.splice(after ? target + 1 : target, 0, from);
  return rest;
};
