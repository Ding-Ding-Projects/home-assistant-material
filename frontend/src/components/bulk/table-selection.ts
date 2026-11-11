import type { HaTabsSubpageDataTable } from "../../layouts/hass-tabs-subpage-data-table";
import type { HaDataTable } from "../data-table/ha-data-table";

/**
 * Lets a page that shows its list in `hass-tabs-subpage-data-table` drive the
 * selection of the table inside it, for the shared bulk bar. The page layout
 * only offers `clearSelection`, so the table inside is found by its tag.
 */
const innerTable = (
  layout: HaTabsSubpageDataTable | undefined
): HaDataTable | undefined =>
  layout?.shadowRoot?.querySelector("ha-data-table") ?? undefined;

/** Ticks every row the table shows after its search and filters. */
export const selectAllTableRows = (
  layout: HaTabsSubpageDataTable | undefined
): void => innerTable(layout)?.selectAll();

/** Ticks the rows that are not ticked and unticks the ones that are. */
export const invertTableRows = (
  layout: HaTabsSubpageDataTable | undefined,
  selected: string[],
  idKey: string
): void => {
  const current = new Set(selected);
  innerTable(layout)?.selectAll((row) => !current.has(String(row[idKey])));
};
