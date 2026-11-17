/**
 * Pure rules for the collapsible statistics strip: which numbers are shown,
 * how the kept open or closed choice is read back, and the one-line summary.
 * Nothing here touches the page, so the rules can be tested on their own.
 */

/** The strip shows at most this many numbers. */
export const MAX_STATISTICS = 5;

/** The longest label that is kept; a longer one is cut. */
export const MAX_LABEL_LENGTH = 40;

export interface CollapsibleStatistic {
  /** Optional stable identifier, used to key the rendered item. */
  id?: string;
  /** What the number counts, for example "Total". */
  label: string;
  /** The number, or text that is already formatted. */
  value: number | string;
  /**
   * Makes the item a button that picks a filter on the page. The page decides
   * what the key means. The key {@link STATISTIC_CLEAR_KEY} clears every
   * filter instead. Without a key the item is plain text.
   */
  filterKey?: string;
}

/** The filter key of the item that clears everything, normally "Total". */
export const STATISTIC_CLEAR_KEY = "all";

/** The meaning of an item, which decides its tonal background. */
export type StatisticTone = "neutral" | "primary" | "warning" | "quiet";

const STATISTIC_TONES: Record<string, StatisticTone> = {
  total: "neutral",
  shown: "primary",
  selected: "primary",
  attention: "warning",
  unavailable: "warning",
  disabled: "quiet",
  turned_off: "quiet",
  read_only: "quiet",
};

/** The tone for an item id; an unknown id is neutral. */
export const statisticTone = (id: string | undefined): StatisticTone =>
  (id && STATISTIC_TONES[id]) || "neutral";

/**
 * The key to hold after an item was pressed: pressing the one that is already
 * held lets go of it, and the clear key never holds.
 */
export const nextStatisticSelection = (
  current: string | undefined,
  pressed: string
): string | undefined => {
  if (pressed === STATISTIC_CLEAR_KEY || pressed === current) {
    return undefined;
  }
  return pressed;
};

/**
 * Gives the items named in `filterable` a filter key equal to their id, and
 * the item with the id "total" the clear key. Items not named stay text.
 */
export const withFilterKeys = (
  items: CollapsibleStatistic[],
  filterable: string[]
): CollapsibleStatistic[] =>
  items.map((item) => {
    if (item.id === "total") {
      return { ...item, filterKey: STATISTIC_CLEAR_KEY };
    }
    return item.id && filterable.includes(item.id)
      ? { ...item, filterKey: item.id }
      : item;
  });

/**
 * The numbers for the "Showing N of M" line, only while an item is held and
 * the strip has both a shown and a total number.
 */
export const showingCounts = (
  items: CollapsibleStatistic[],
  activeKey: string | undefined
): { shown: number; total: number } | undefined => {
  if (!activeKey) {
    return undefined;
  }
  const shown = items.find((item) => item.id === "shown")?.value;
  const total = items.find((item) => item.id === "total")?.value;
  return typeof shown === "number" && typeof total === "number"
    ? { shown, total }
    : undefined;
};

export type StatisticsStoredState = "expanded" | "collapsed";

/** Separator between the items of the one-line summary. */
export const SUMMARY_SEPARATOR = " · ";

const isUsable = (item: unknown): item is CollapsibleStatistic => {
  if (!item || typeof item !== "object") {
    return false;
  }
  const { label, value } = item as Record<string, unknown>;
  if (typeof label !== "string" || label.trim() === "") {
    return false;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  return typeof value === "string";
};

/**
 * The statistics a page supplied, cleaned up: anything that is not a labelled
 * number is dropped and no more than five are kept, in the order given.
 */
export const limitStatistics = (raw: unknown): CollapsibleStatistic[] => {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter(isUsable)
    .slice(0, MAX_STATISTICS)
    .map((item) => ({
      id: item.id,
      label: item.label.trim().slice(0, MAX_LABEL_LENGTH),
      value: item.value,
      filterKey:
        typeof item.filterKey === "string" && item.filterKey !== ""
          ? item.filterKey
          : undefined,
    }));
};

/**
 * Whether a kept choice means the strip is collapsed. The strip is expanded by
 * default: a missing, damaged or unknown value never hides the numbers.
 */
export const parseStoredCollapsed = (raw: unknown): boolean =>
  raw === "collapsed" || raw === true;

/** The value to keep for a choice. */
export const toStoredState = (collapsed: boolean): StatisticsStoredState =>
  collapsed ? "collapsed" : "expanded";

/**
 * The storage key for one page, or undefined when the page is unknown and the
 * choice cannot be kept. Each page has its own key.
 */
export const statisticsStorageKey = (
  pagePrefix: string | undefined | null
): string | undefined => {
  if (typeof pagePrefix !== "string" || pagePrefix.trim() === "") {
    return undefined;
  }
  return `list-statistics:${pagePrefix}`;
};

/** One value as text, with digit grouping for numbers. */
export const formatStatisticValue = (
  value: number | string,
  locale?: string
): string => {
  if (typeof value === "string") {
    return value;
  }
  try {
    return new Intl.NumberFormat(locale).format(value);
  } catch (_err) {
    return String(value);
  }
};

/** The one line shown when the strip is collapsed: "Total 12 · Shown 4". */
export const summaryLine = (
  statistics: CollapsibleStatistic[],
  locale?: string
): string =>
  statistics
    .map((item) => `${item.label} ${formatStatisticValue(item.value, locale)}`)
    .join(SUMMARY_SEPARATOR);
