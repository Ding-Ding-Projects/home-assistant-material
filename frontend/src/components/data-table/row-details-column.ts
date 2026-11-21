import { html } from "lit";
import type { DetailFact } from "../../data/entity-details";
import type { HomeAssistant } from "../../types";
import "../entity/ha-more-details-facts";
import type { DataTableColumnData, DataTableRowData } from "./ha-data-table";
import "./ha-row-details-toggle";

/**
 * A table column with the "Show more details" button for rows that are not
 * entities. The table must also set `renderRowDetails`, for example with
 * `factsRowDetails`. `host.hass` is read when a row is drawn.
 */
export const rowDetailsColumn = <T>(
  label: string,
  host: { hass: HomeAssistant },
  rowIdOf: (row: T) => string,
  nameOf: (row: T) => string
): DataTableColumnData<T> => ({
  title: "",
  label,
  type: "icon-button",
  sortable: false,
  hideable: true,
  moveable: true,
  showNarrow: true,
  template: (row) =>
    html`<ha-row-details-toggle
      .hass=${host.hass}
      .rowId=${rowIdOf(row)}
      .name=${nameOf(row)}
    ></ha-row-details-toggle>`,
});

/** Row details that list a row's facts, open, with a copy button per line. */
export const factsRowDetails =
  (factsOf: (row: DataTableRowData) => DetailFact[]) =>
  (row: DataTableRowData) =>
    html`<ha-more-details-facts
      open
      no-toggle
      .facts=${factsOf(row)}
    ></ha-more-details-facts>`;
