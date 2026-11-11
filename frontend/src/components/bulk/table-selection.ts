import type { HaTabsSubpageDataTable } from "../../layouts/hass-tabs-subpage-data-table";
import {
  hiddenSelectedCount,
  invertVisible,
  selectVisible,
} from "./bulk-selection";

/**
 * Lets a page that shows its list in `hass-tabs-subpage-data-table` drive the
 * selection of the table inside it, for the shared bulk bar. Both actions only
 * touch the rows the search and filters leave visible: a row that is selected
 * and hidden stays selected, and the bar says how many there are.
 */

/** Ticks every row the table shows after its search and filters. */
export const selectAllTableRows = (
  layout: HaTabsSubpageDataTable | undefined
): void => {
  if (!layout) {
    return;
  }
  layout.setCheckedRowIds(
    selectVisible(layout.getFilteredRowIds(), layout.getCheckedRowIds())
  );
};

/** Ticks the shown rows that are not ticked and unticks the ones that are. */
export const invertTableRows = (
  layout: HaTabsSubpageDataTable | undefined
): void => {
  if (!layout) {
    return;
  }
  layout.setCheckedRowIds(
    invertVisible(layout.getFilteredRowIds(), layout.getCheckedRowIds())
  );
};

/** How many rows the search and filters leave in the table. */
export const filteredTableCount = (
  layout: HaTabsSubpageDataTable | undefined
): number => layout?.filteredRowCount ?? 0;

/** How many ticked rows the search or filters hide right now. */
export const hiddenTableSelection = (
  layout: HaTabsSubpageDataTable | undefined
): number =>
  layout
    ? hiddenSelectedCount(layout.getFilteredRowIds(), layout.getCheckedRowIds())
    : 0;
