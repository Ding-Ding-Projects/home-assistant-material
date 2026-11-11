import type { LocalizeKeys } from "../../common/translations/localize";
import type { CollapsibleStatistic } from "./collapsible-statistics-logic";

/** The counts a list page can add beside the total and shown numbers. */
export type ListStatisticKey =
  "disabled" | "unavailable" | "attention" | "turned_off" | "read_only";

export interface ListStatisticsInput {
  /** Every item the page knows about, before any search or filter. */
  total: number;
  /** The items the table shows now, after search and filters. */
  shown: number;
  /** How many rows are selected. Shown only while something is selected. */
  selected?: number;
  /** At most two page specific counts, in the order they are shown. */
  extras?: { key: ListStatisticKey; value: number }[];
}

/**
 * The numbers for the statistics strip of a list page: total, shown, up to two
 * counts that matter for that page and, while rows are selected, how many.
 * Only counts the page already has are used, so no extra request is needed.
 * The result never has more than five entries.
 */
export const buildListStatistics = (
  localize: (key: LocalizeKeys) => string,
  input: ListStatisticsInput
): CollapsibleStatistic[] => {
  const label = (key: string) =>
    localize(`ui.components.collapsible-statistics.${key}` as LocalizeKeys);
  const items: CollapsibleStatistic[] = [
    // The table can never show more than there is, so a page that cannot count
    // every row cheaply never reports a total below what is shown.
    {
      id: "total",
      label: label("total"),
      value: Math.max(input.total, input.shown),
    },
    { id: "shown", label: label("shown"), value: input.shown },
  ];
  for (const extra of (input.extras ?? []).slice(0, 2)) {
    items.push({ id: extra.key, label: label(extra.key), value: extra.value });
  }
  if (input.selected && input.selected > 0) {
    items.push({
      id: "selected",
      label: label("selected"),
      value: input.selected,
    });
  }
  return items;
};
