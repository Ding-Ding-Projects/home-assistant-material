import { html, nothing } from "lit";
import type {
  DataTableColumnData,
  DataTableRowData,
} from "../data-table/ha-data-table";
import type { HomeAssistant } from "../../types";
import "./ha-entity-quick-controls";
import "./ha-entity-quick-row-actions";

/**
 * A table column with "Run a quick action" and "Show more details" for the
 * row's entity. The details open in the table's detail row, so the table
 * must also set `renderRowDetails`. Rows without a current entity show
 * nothing. `host.hass` and `host.narrow` are read when a row is drawn, so
 * they stay current.
 *
 * The row keeps both buttons on every width. On a phone the column may move
 * to a line of its own under the name (`narrowWrap`), so the name never gets
 * narrower than the table allows. The details, which the page draws with
 * `entityRowDetailsRenderer(hass, entityIdOf, narrow)`, also offer
 * "Run a quick action" on a phone.
 */
export const entityQuickActionsColumn = <T>(
  title: string,
  host: { hass: HomeAssistant; narrow?: boolean },
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
  narrowWrap: true,
  minWidth: "96px",
  maxWidth: "96px",
  template: (row) => {
    const entityId = entityIdOf(row);
    return entityId && host.hass.states[entityId]
      ? html`<ha-entity-quick-row-actions
          compact
          details="row"
          buttons=${quickRowButtons(Boolean(host.narrow))}
          .hass=${host.hass}
          .entityId=${entityId}
          .rowId=${rowIdOf(row) ?? entityId}
        ></ha-entity-quick-row-actions>`
      : nothing;
  },
});

/**
 * Which row buttons a table row shows. Both, on every width: "Run a quick
 * action" stays one press away on a phone, as it was before the row learned
 * to wrap. The cell moves to a line of its own when it does not fit beside
 * the name, so the name keeps its width either way.
 */
export const quickRowButtons = (_narrow: boolean): "details" | "both" => "both";

/**
 * The details of an entity's table row, for `renderRowDetails`: the same
 * "Show more details" panel that opens in place everywhere else. The element
 * is loaded by `ha-entity-quick-row-actions` before the row opens. Pages call
 * this once per `hass` (through memoizeOne), so open details stay current.
 *
 * With `controls` (a phone list, whose row keeps only its main control and
 * the details button) the details start with the rest of the entity's
 * controls: its slider, its colour button and "Run a quick action".
 */
export const entityRowDetailsRenderer =
  (
    hass: HomeAssistant,
    entityIdOf: (row: DataTableRowData) => string | undefined = (row) =>
      row.entity_id,
    controls = false
  ) =>
  (row: DataTableRowData) => {
    const entityId = entityIdOf(row);
    if (!entityId) {
      return nothing;
    }
    const details = html`<ha-entity-more-details
      .hass=${hass}
      .entityId=${entityId}
    ></ha-entity-more-details>`;
    if (!controls || !hass.states[entityId]) {
      return details;
    }
    return html`<div
        style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding-block: 4px 8px"
      >
        <ha-entity-quick-controls
          section="level"
          style="flex: 1 1 200px; min-width: 0"
          .hass=${hass}
          .entityId=${entityId}
        ></ha-entity-quick-controls>
        <ha-entity-quick-row-actions
          buttons="action"
          .hass=${hass}
          .entityId=${entityId}
        ></ha-entity-quick-row-actions>
      </div>
      ${details}`;
  };
