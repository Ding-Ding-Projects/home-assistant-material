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
}

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
