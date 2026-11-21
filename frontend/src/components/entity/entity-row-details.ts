import { html, nothing } from "lit";
import type {
  DataTableColumnData,
  DataTableRowData,
} from "../data-table/ha-data-table";
import type { HomeAssistant } from "../../types";
import "./ha-entity-quick-row-actions";

/**
 * A table column with "Run a quick action" and "Show more details" for the
 * row's entity. The details open in the table's detail row, so the table
 * must also set `renderRowDetails`. Rows without a current entity show
 * nothing. `host.hass` is read when a row is drawn, so it stays current.
 */
export const entityQuickActionsColumn = <T>(
  title: string,
  host: { hass: HomeAssistant },
  entityIdOf: (row: T) => string | undefined = (row) =>
    (row as { entity_id?: string }).entity_id,
  rowIdOf: (row: T) => string | undefined = entityIdOf
): DataTableColumnData<T> => ({
  title: "",
  label: title,
  type: "overflow",
  sortable: false,
  hideable: true,
  moveable: true,
  showNarrow: true,
  minWidth: "96px",
  maxWidth: "96px",
  template: (row) => {
    const entityId = entityIdOf(row);
    return entityId && host.hass.states[entityId]
      ? html`<ha-entity-quick-row-actions
          compact
          details="row"
          .hass=${host.hass}
          .entityId=${entityId}
          .rowId=${rowIdOf(row) ?? entityId}
        ></ha-entity-quick-row-actions>`
      : nothing;
  },
});

/**
 * The details of an entity's table row, for `renderRowDetails`: the same
 * "Show more details" panel that opens in place everywhere else. The element
 * is loaded by `ha-entity-quick-row-actions` before the row opens. Pages call
 * this once per `hass` (through memoizeOne), so open details stay current.
 */
export const entityRowDetailsRenderer =
  (
    hass: HomeAssistant,
    entityIdOf: (row: DataTableRowData) => string | undefined = (row) =>
      row.entity_id
  ) =>
  (row: DataTableRowData) => {
    const entityId = entityIdOf(row);
    return entityId
      ? html`<ha-entity-more-details
          .hass=${hass}
          .entityId=${entityId}
        ></ha-entity-more-details>`
      : nothing;
  };
