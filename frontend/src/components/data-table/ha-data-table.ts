import type {
  LitVirtualizer,
  VisibilityChangedEvent,
} from "@lit-labs/virtualizer";
import type { ContextType } from "@lit/context";
import {
  mdiArrowDown,
  mdiArrowUp,
  mdiChevronUp,
  mdiFilterVariantRemove,
  mdiInboxOutline,
} from "@mdi/js";
import deepClone from "deep-clone-simple";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { LitElement, css, html, nothing } from "lit";
import {
  customElement,
  eventOptions,
  property,
  query,
  state,
} from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { ifDefined } from "lit/directives/if-defined";
import { join } from "lit/directives/join";
import { keyed } from "lit/directives/keyed";
import { styleMap } from "lit/directives/style-map";
import memoizeOne from "memoize-one";
import { consume } from "../../common/decorators/consume";
import { STRINGS_SEPARATOR_DOT } from "../../common/const";
import { restoreScroll } from "../../common/decorators/restore-scroll";
import { deepActiveElement } from "../../common/dom/deep-active-element";
import type {
  HASSDomCurrentTargetEvent,
  HASSDomTargetEvent,
} from "../../common/dom/fire_event";
import { fireEvent } from "../../common/dom/fire_event";
import { stringCompare } from "../../common/string/compare";
import type { LocalizeFunc } from "../../common/translations/localize";
import { debounce } from "../../common/util/debounce";
import { groupBy } from "../../common/util/group-by";
import { nextRender } from "../../common/util/render-status";
import { internationalizationContext } from "../../data/context";
import type { FrontendLocaleData } from "../../data/translation";
import { haStyleScrollbar } from "../../resources/styles";
import { loadVirtualizer } from "../../resources/virtualizer";
import "../animation/ha-fade-in";
import "../ha-alert";
import "../ha-button";
import "../ha-checkbox";
import type { HaCheckbox } from "../ha-checkbox";
import "../skeleton/ha-skeleton-icon";
import "../skeleton/ha-skeleton-text";
import "../ha-svg-icon";
import "../ha-empty-state";
import { emptyTone } from "../empty-state-logic";
import "../input/ha-input-search";
import { tablePatternSamples } from "./pattern-samples";
import { filterData, sortData } from "./sort-filter";
import { LanguageModeController } from "../../common/language-mode/language-mode-controller";

export interface RowClickedEvent {
  id: string;
}

export interface SelectionChangedEvent {
  value: string[];
}

export interface CollapsedChangedEvent {
  value: string[];
}

export interface SortingChangedEvent {
  column: string;
  direction: SortingDirection;
  // Set when a link sorted the table, not the user
  link?: boolean;
}

export type SortingDirection = "desc" | "asc" | null;

export type DataTableColumnContainer<T = any> = Record<
  string,
  DataTableColumnData<T>
>;

export interface DataTableSortColumnData {
  sortable?: boolean;
  filterable?: boolean;
  filterKey?: string;
  valueColumn?: string;
  direction?: SortingDirection;
  groupable?: boolean;
  // Name in the `sort` and `group` URL params, grouping is only kept with one
  urlName?: string;
  moveable?: boolean;
  hideable?: boolean;
  defaultHidden?: boolean;
  showNarrow?: boolean;
}

export interface DataTableColumnData<T = any> extends DataTableSortColumnData {
  // In clickable tables the main value is rendered inside a button, so its
  // template must not contain interactive elements
  main?: boolean;
  title: TemplateResult | string;
  label?: TemplateResult | string;
  type?:
    | "numeric"
    | "ip"
    | "icon"
    | "icon-button"
    | "overflow"
    | "overflow-menu"
    | "flex";
  template?: (row: T) => TemplateResult | string | typeof nothing;
  extraTemplate?: (row: T) => TemplateResult | string | typeof nothing;
  minWidth?: string;
  maxWidth?: string;
  flex?: number;
  forceLTR?: boolean;
  hidden?: boolean;
  lastFixed?: boolean;
}

export type ClonedDataTableColumnData = Omit<DataTableColumnData, "title"> & {
  title?: TemplateResult | string;
};

export interface DataTableRowData {
  [key: string]: any;
  selectable?: boolean;
}

export type SortableColumnContainer = Record<string, ClonedDataTableColumnData>;

// Renders the actions at the end of a group's header, they don't toggle the
// group. Return `ha-icon-button`s with a label. They get the rows' icon
// colour and size by default, which `--data-table-group-actions-color`,
// `--data-table-group-actions-button-size` and
// `--data-table-group-actions-icon-size` change for all of them; style a
// button itself for its own colour or size. Not a slot per group, as WebKit
// is slow to add and remove slots while the rows scroll.
export type DataTableGroupActions = (
  group: string
) => TemplateResult | typeof nothing;

const UNDEFINED_GROUP_KEY = "zzzzz_undefined";

// The group a row's value of the group column puts it in. Rows without a value
// share a reserved group, sorted to the bottom.
const dataTableGroupKey = (
  value: string | number | boolean | null | undefined
) => {
  const key = String(value);

  return key === "undefined" ? UNDEFINED_GROUP_KEY : key;
};
const AUTO_FOCUS_ALLOWED_ACTIVE_TAGS = ["BODY", "HTML", "HOME-ASSISTANT"];

// Default row height, used to fill the viewport with skeleton rows.
const ROW_HEIGHT = 52;

/**
 * The selection after the header checkbox changes. With `keepHidden`, only
 * the shown rows are added or removed and hidden ticked rows survive; without
 * it, ticking selects exactly the shown rows and unticking clears everything.
 */
export const headerCheckboxSelection = (
  current: readonly string[],
  shownIds: readonly string[],
  checked: boolean,
  keepHidden: boolean
): string[] => {
  if (!keepHidden) {
    return checked ? [...shownIds] : [];
  }
  if (checked) {
    return [...new Set([...current, ...shownIds])];
  }
  const shown = new Set(shownIds);
  return current.filter((id) => !shown.has(id));
};

@customElement("ha-data-table")
export class HaDataTable extends LitElement {
  @state()
  @consume({ context: internationalizationContext, subscribe: true })
  private _i18n?: ContextType<typeof internationalizationContext>;

  // Draws the table again when the language mode changes.
  private _lang = new LanguageModeController(this);

  // The table's own strings in the chosen language mode.
  private get _modeLocalize(): LocalizeFunc | undefined {
    const localize = this._i18n?.localize;
    return localize ? this._lang.cachedLocalizer(localize) : undefined;
  }

  @property({ type: Boolean, reflect: true }) public narrow = false;

  /** Draws each row as a rounded card with space between rows. */
  @property({ type: Boolean, reflect: true, attribute: "row-cards" })
  public rowCards = false;

  @property({ type: Object }) public columns: DataTableColumnContainer = {};

  @property({ type: Array }) public data: DataTableRowData[] = [];

  @property({ type: Boolean }) public loading = false;

  @property({ type: Boolean }) public selectable = false;

  /**
   * Set by pages that show how many selected rows are hidden. The header
   * checkbox then only adds or removes the shown rows; without it, ticking
   * replaces the selection and unticking clears all of it, so a bulk action
   * never reaches rows the person cannot see.
   */
  @property({ type: Boolean, attribute: "keep-hidden-selection" })
  public keepHiddenSelection = false;

  @property({ type: Boolean }) public clickable = false;

  /**
   * Add an extra row at the bottom of the data table
   * @type {TemplateResult}
   */
  @property({ attribute: false }) public appendRow?;

  @property({ type: Boolean, attribute: "auto-height" })
  public autoHeight = false;

  // eslint-disable-next-line lit/no-native-attributes
  @property({ type: String }) public id = "id";

  /**
   * The id of every row is an entity id. Each row then says so, so that the
   * element menu can offer the entity's own entries when it is opened on a row.
   */
  @property({ type: Boolean, attribute: "entity-rows" })
  public entityRows = false;

  @property({ attribute: false }) public noDataText?: string;

  /**
   * Whether the page has filters switched on beside the search text. Used to
   * tell a list that hides everything from one that has nothing.
   */
  @property({ attribute: "filters-active", type: Boolean })
  public filtersActive = false;

  /**
   * The slotted tool row of a phone has nothing in it, so the row is not drawn
   * and takes no height.
   */
  @property({ attribute: "header-row-empty", type: Boolean, reflect: true })
  public headerRowEmpty = false;

  /**
   * Error to show below the column headings, with a retry action, when loading the table's data failed.
   * Pass `true` to show the default message.
   */
  @property({ attribute: false }) public loadError?: boolean | string;

  @property({ attribute: false }) public searchLabel?: string;

  @property({ type: String }) public filter = "";

  @property({ attribute: false }) public groupColumn?: string;

  @property({ attribute: false }) public groupOrder?: string[];

  @property({ attribute: false })
  public renderGroupActions?: DataTableGroupActions;

  @property({ attribute: false }) public sortColumn?: string;

  @property({ attribute: false }) public sortDirection: SortingDirection = null;

  @property({ attribute: false }) public initialCollapsedGroups?: string[];

  @property({ attribute: false }) public hiddenColumns?: string[];

  @property({ attribute: false }) public columnOrder?: string[];

  @state() private _filterable = false;

  @state() private _filter = "";

  @state() private _filteredData?: DataTableRowData[];

  // Row count of the data that _filteredData was computed from
  @state() private _filteredDataSourceLength = 0;

  @query(".mdc-data-table__header-row") private _headerRow?: HTMLDivElement;

  @query("lit-virtualizer")
  private _scroller?: LitVirtualizer<DataTableRowData>;

  @query(".sticky-group-header") private _stickyGroupHeader?: HTMLElement;

  @query(".sticky-group-header .group-header")
  private _stickyGroupHeaderCell?: HTMLElement;

  @query(".sticky-group-header .group-actions")
  private _stickyGroupActions?: HTMLElement;

  // Group pinned to the top of the scroller while its own header is scrolled out of view
  @state() private _stickyGroup?: string;

  // Position and width of the sticky group header, applied directly on scroll
  // to avoid re-rendering the table on every frame
  private _stickyGroupPosition = { top: 0, width: 0, scrollLeft: 0 };

  private _stickyGroupFrame?: number;

  // Resizing doesn't scroll, but changes the width of the sticky group header
  private _resizeObserver = new ResizeObserver(() =>
    this._scheduleStickyGroupUpdate()
  );

  private _firstVisibleIndex = 0;

  private _rowsEntered = false;

  @state() private _collapsedGroups: string[] = [];

  @state() private _lastSelectedRowId: string | null = null;

  // Counts how often the search and filters produced a new set of rows, so
  // the ids derived from them are computed once per change.
  private _filteredVersion = 0;

  private _checkedRows: string[] = [];

  private _sortColumns: SortableColumnContainer = {};

  private _curRequest = 0;

  private _lastUpdate = 0;

  // @ts-ignore
  @restoreScroll(".scroller") private _savedScrollPos?: number;

  private _debounceSearch = debounce(
    (value: string) => {
      this._filter = value;
    },
    100,
    false
  );

  /**
   * The identifiers of the rows that are ticked now, in the order they were
   * ticked. Returns a copy, so the caller cannot change the selection.
   */
  public getCheckedRowIds(): string[] {
    return [...this._checkedRows];
  }

  public clearSelection(): void {
    this._checkedRows = [];
    this._lastSelectedRowId = null;
    this._checkedRowsChanged();
  }

  /**
   * How many rows the search and filters leave in the table now, not counting
   * rows inside collapsed groups.
   */
  public get filteredRowCount(): number {
    return this._shownRows(
      this._filteredVersion,
      this._collapsedGroups,
      this.groupColumn,
      this.id
    ).count;
  }

  /**
   * How many rows match the search and filters, whether or not their group is
   * collapsed. The appended row is not counted.
   */
  public get matchingRowCount(): number {
    return (this._filteredData || []).filter((row) => !row.append).length;
  }

  /**
   * The identifiers of the selectable rows the table shows now. Rows inside
   * collapsed groups are left out, as the person cannot see them. The list is
   * computed once per change of the filtered rows or the collapsed groups.
   */
  public getFilteredRowIds(): string[] {
    return this._shownRows(
      this._filteredVersion,
      this._collapsedGroups,
      this.groupColumn,
      this.id
    ).ids;
  }

  private _shownRows = memoizeOne(
    (
      _version: number,
      collapsedGroups: string[],
      groupColumn: string | undefined,
      idKey: string
    ) => {
      const collapsed = new Set(collapsedGroups);
      const rows = (this._filteredData || []).filter(
        (row) =>
          !row.append &&
          !(groupColumn && collapsed.has(dataTableGroupKey(row[groupColumn])))
      );
      const ids = rows
        .filter((row) => row.selectable !== false)
        .map((row) => String(row[idKey]));
      return { count: rows.length, ids, idSet: new Set(ids) };
    }
  );

  /** Replaces the ticked rows with exactly these identifiers. */
  public setCheckedRowIds(ids: string[]): void {
    this._checkedRows = [...ids];
    this._lastSelectedRowId = null;
    this._checkedRowsChanged();
  }

  public selectAll(extraFilter?: (row: DataTableRowData) => boolean): void {
    this._checkedRows = (this._filteredData || [])
      .filter(
        (data) =>
          data.selectable !== false && (!extraFilter || extraFilter(data))
      )
      .map((data) => data[this.id]);
    this._lastSelectedRowId = null;
    this._checkedRowsChanged();
  }

  public connectedCallback() {
    super.connectedCallback();
    this._resizeObserver.observe(this);
    if (this._filteredData?.length) {
      // Force update of location of rows
      this._filteredData = [...this._filteredData];
    }
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    this._resizeObserver.disconnect();
    if (this._stickyGroupFrame !== undefined) {
      cancelAnimationFrame(this._stickyGroupFrame);
      this._stickyGroupFrame = undefined;
    }
  }

  protected updated(changedProps: PropertyValues<this>) {
    // The sticky group header may have just been rendered, and the items may
    // have changed (filter, sort, collapse) without the visible range changing
    this._positionStickyGroupHeader();
    this._scheduleStickyGroupUpdate();

    // The first rows rise in once, when the list first has rows to show
    if (!this._rowsEntered && this._filteredData?.length) {
      this._rowsEntered = true;
      this.toggleAttribute("row-enter", true);
      window.setTimeout(() => this.toggleAttribute("row-enter", false), 900);
    }

    if (!this._headerRow) {
      return;
    }

    // A phone's rows are stacked cards as wide as the screen: the sideways
    // scrolling tool row above them never makes them wider.
    if (
      !this.narrow &&
      this._headerRow.scrollWidth > this._headerRow.clientWidth
    ) {
      this.style.setProperty(
        "--table-row-width",
        `${this._headerRow.scrollWidth}px`
      );
    } else {
      this.style.removeProperty("--table-row-width");
    }

    const activeElement = deepActiveElement();

    if (
      changedProps.has("selectable") ||
      (!this.autoHeight &&
        activeElement &&
        AUTO_FOCUS_ALLOWED_ACTIVE_TAGS.includes(activeElement.tagName))
    ) {
      this._focusScroller();
    }
  }

  public willUpdate(properties: PropertyValues) {
    super.willUpdate(properties);

    if (!this.hasUpdated) {
      loadVirtualizer();
    }

    if (properties.has("columns")) {
      this._filterable = Object.values(this.columns).some(
        (column) => column.filterable
      );

      if (!this.sortColumn) {
        for (const columnId in this.columns) {
          if (this.columns[columnId].direction) {
            this.sortDirection = this.columns[columnId].direction!;
            this.sortColumn = columnId;
            this._lastSelectedRowId = null;

            fireEvent(this, "sorting-changed", {
              column: columnId,
              direction: this.sortDirection,
            });

            break;
          }
        }
      }

      const clonedColumns: DataTableColumnContainer = deepClone(this.columns);
      Object.values(clonedColumns).forEach(
        (column: ClonedDataTableColumnData) => {
          delete column.title;
          delete column.template;
          delete column.extraTemplate;
        }
      );

      this._sortColumns = clonedColumns;
    }

    if (properties.has("filter")) {
      if (!this.hasUpdated) {
        // A restored search must apply before the first filter pass, so the
        // unfiltered rows are never shown
        this._filter = this.filter;
      } else {
        this._debounceSearch(this.filter);
      }
      this._lastSelectedRowId = null;
    }

    if (properties.has("data")) {
      // Clean up checked rows that no longer exist in the data
      if (this._checkedRows.length) {
        const validIds = new Set(this.data.map((row) => String(row[this.id])));
        const validCheckedRows = this._checkedRows.filter((id) =>
          validIds.has(id)
        );
        if (validCheckedRows.length !== this._checkedRows.length) {
          this._checkedRows = validCheckedRows;
          this._checkedRowsChanged();
        }
      }
    }

    if (!this.hasUpdated && this.initialCollapsedGroups) {
      this._collapsedGroups = this.initialCollapsedGroups;
      this._lastSelectedRowId = null;
      fireEvent(this, "collapsed-changed", { value: this._collapsedGroups });
    } else if (properties.has("groupColumn")) {
      this._collapsedGroups = [];
      this._stickyGroup = undefined;
      this._lastSelectedRowId = null;
      fireEvent(this, "collapsed-changed", { value: this._collapsedGroups });
    }

    if (
      properties.has("data") ||
      properties.has("columns") ||
      properties.has("_filter") ||
      properties.has("sortColumn") ||
      properties.has("sortDirection")
    ) {
      this._sortFilterData();
    }

    if (
      properties.has("_filter") ||
      properties.has("sortColumn") ||
      properties.has("sortDirection")
    ) {
      this._lastSelectedRowId = null;
    }

    if (
      this._filteredData &&
      (properties.has("selectable") || properties.has("hiddenColumns"))
    ) {
      this._filteredData = [...this._filteredData];
    }
  }

  private _patternSamples = memoizeOne(tablePatternSamples);

  private _memRenderRow = memoizeOne(
    (columns: DataTableColumnContainer, narrow: boolean) =>
      (row: DataTableRowData, index: number) =>
        this._renderRow(columns, narrow, row, index)
  );

  private _sortedColumns = memoizeOne(
    (columns: DataTableColumnContainer, columnOrder?: string[]) => {
      if (!columnOrder || !columnOrder.length) {
        return columns;
      }

      return Object.keys(columns)
        .sort((a, b) => {
          const orderA = columnOrder!.indexOf(a);
          const orderB = columnOrder!.indexOf(b);
          const fixedA = Boolean(columns[a].lastFixed);
          const fixedB = Boolean(columns[b].lastFixed);
          if (fixedA !== fixedB) {
            return fixedA ? 1 : -1;
          }
          if (orderA !== orderB) {
            if (orderA === -1) {
              return 1;
            }
            if (orderB === -1) {
              return -1;
            }
          }
          return orderA - orderB;
        })
        .reduce((obj, key) => {
          obj[key] = columns[key];
          return obj;
        }, {}) as DataTableColumnContainer;
    }
  );

  protected render() {
    const columns = this._sortedColumns(this.columns, this.columnOrder);

    const renderRow = this._memRenderRow(columns, this.narrow);

    const filteredDataLength = this._filteredData?.length || 0;

    // The empty state stands alone: no column header row above it.
    const emptyStateShown =
      !filteredDataLength &&
      !this.loading &&
      !!this._filteredData &&
      !this.loadError &&
      !(this.data.length && !this._filteredDataSourceLength);

    const items = this._filteredData
      ? this._groupData(
          this._filteredData,
          this._modeLocalize,
          this._i18n?.locale,
          this.appendRow,
          this.groupColumn,
          this.groupOrder,
          this._collapsedGroups,
          this.sortColumn,
          this.sortDirection,
          this.renderGroupActions
        )
      : [];

    // The header checkbox covers the rows the table shows, like the bulk bar
    const headerCheckState = this._headerCheckState();

    // The pinned group header is the same row as its group's header
    const stickyGroupIndex =
      this._stickyGroup === undefined
        ? -1
        : items.findIndex(
            (item) => item.append && item.groupHeader === this._stickyGroup
          );

    return html`
      <div class="mdc-data-table">
        <slot name="header">
          ${
            this._filterable
              ? html`
                  <div class="table-header">
                    <ha-input-search
                      appearance="outlined"
                      @input=${this._handleSearchChange}
                      .placeholder=${this.searchLabel}
                      .patternSamples=${this._patternSamples(
                        this.data,
                        this.columns
                      )}
                    ></ha-input-search>
                  </div>
                `
              : ""
          }
        </slot>
        <div
          class="mdc-data-table__table ${classMap({
            "auto-height": this.autoHeight,
          })}"
          role="table"
          aria-rowcount=${this._countRows(items) + (this.loadError ? 2 : 1)}
          style=${styleMap({
            height: this.autoHeight
              ? `${(filteredDataLength || 1) * 53 + 53}px`
              : undefined,
          })}
        >
          <div
            class="mdc-data-table__header-row ${classMap({
              "empty-state-shown": emptyStateShown,
            })}"
            role="row"
            aria-rowindex="1"
            @scroll=${this._scrollContent}
          >
            <slot name="header-row">
              ${
                this.selectable
                  ? html`
                      <div
                        class="mdc-data-table__header-cell mdc-data-table__header-cell--checkbox"
                        role="columnheader"
                      >
                        <ha-checkbox
                          class="mdc-data-table__row-checkbox"
                          @change=${this._handleHeaderRowCheckboxClick}
                          .indeterminate=${
                            headerCheckState.some && !headerCheckState.all
                          }
                          .checked=${headerCheckState.all}
                        >
                        </ha-checkbox>
                      </div>
                    `
                  : ""
              }
              ${Object.entries(columns).map(([key, column]) => {
                if (!this._isColumnVisible(key, column)) {
                  return nothing;
                }
                const sorted = key === this.sortColumn;
                const classes = {
                  "mdc-data-table__header-cell--numeric":
                    column.type === "numeric",
                  "mdc-data-table__header-cell--icon": column.type === "icon",
                  "mdc-data-table__header-cell--icon-button":
                    column.type === "icon-button",
                  "mdc-data-table__header-cell--overflow-menu":
                    column.type === "overflow-menu",
                  "mdc-data-table__header-cell--overflow":
                    column.type === "overflow",
                  sortable: Boolean(column.sortable),
                  "not-sorted": Boolean(column.sortable && !sorted),
                };
                return html`
                  <div
                    aria-label=${ifDefined(column.label)}
                    class="mdc-data-table__header-cell ${classMap(classes)}"
                    style=${styleMap({
                      minWidth: column.minWidth,
                      maxWidth: column.maxWidth,
                      flex: column.flex || 1,
                    })}
                    role="columnheader"
                    aria-sort=${ifDefined(
                      sorted
                        ? this.sortDirection === "desc"
                          ? "descending"
                          : "ascending"
                        : undefined
                    )}
                    @click=${this._handleHeaderClick}
                    .columnId=${key}
                    title=${ifDefined(column.title)}
                  >
                    ${
                      column.sortable
                        ? html`<button type="button" class="sort-button">
                            <ha-svg-icon
                              .path=${
                                sorted && this.sortDirection === "desc"
                                  ? mdiArrowDown
                                  : mdiArrowUp
                              }
                            ></ha-svg-icon>
                            <span>${column.title}</span>
                          </button>`
                        : html`<span>${column.title}</span>`
                    }
                  </div>
                `;
              })}
            </slot>
          </div>
          ${
            this.loadError
              ? html`<div class="load-error" role="row" aria-rowindex="2">
                  <div role="cell">
                    <ha-alert alert-type="error">
                      ${
                        typeof this.loadError === "string"
                          ? this.loadError
                          : this._modeLocalize?.(
                              "ui.components.data-table.load_error"
                            ) || "Failed to load data"
                      }
                      <ha-button
                        slot="action"
                        appearance="plain"
                        .loading=${this.loading}
                        @click=${this._retryLoad}
                      >
                        ${
                          this._modeLocalize?.(
                            "ui.components.data-table.retry"
                          ) || "Retry"
                        }
                      </ha-button>
                    </ha-alert>
                  </div>
                </div>`
              : nothing
          }
          ${
            !this._filteredData?.length
              ? this.loading ||
                !this._filteredData ||
                (this.data.length && !this._filteredDataSourceLength)
                ? html`
                    <div class="mdc-data-table__content" role="row">
                      <ha-fade-in .duration=${300} easing="ease-in">
                        <div role="cell">
                          <div
                            role="progressbar"
                            aria-label=${
                              this._modeLocalize?.("ui.common.loading") ||
                              "Loading"
                            }
                          >
                            ${Array.from(
                              {
                                length: this.autoHeight
                                  ? 1
                                  : Math.ceil(window.innerHeight / ROW_HEIGHT),
                              },
                              () => html`
                                <div class="mdc-data-table__row">
                                  ${
                                    this.selectable
                                      ? html`<div
                                          class="mdc-data-table__cell mdc-data-table__cell--checkbox"
                                        ></div>`
                                      : nothing
                                  }
                                  ${Object.entries(columns).map(
                                    ([key, column]) =>
                                      (this.narrow &&
                                        !column.main &&
                                        !column.showNarrow) ||
                                      !this._isColumnVisible(key, column)
                                        ? nothing
                                        : html`
                                            <div
                                              class="mdc-data-table__cell ${classMap(
                                                this._cellClasses(column)
                                              )}"
                                              style=${styleMap(this._cellStyles(column))}
                                            >
                                              ${
                                                column.type === "icon"
                                                  ? html`<ha-skeleton-icon></ha-skeleton-icon>`
                                                  : column.type ===
                                                        "icon-button" ||
                                                      column.type ===
                                                        "overflow-menu"
                                                    ? nothing
                                                    : html`<ha-skeleton-text></ha-skeleton-text>`
                                              }
                                            </div>
                                          `
                                  )}
                                </div>
                              `
                            )}
                          </div>
                        </div>
                      </ha-fade-in>
                    </div>
                  `
                : this.loadError
                  ? nothing
                  : html`
                      <div class="mdc-data-table__content">
                        <div
                          class="mdc-data-table__row empty-state-row"
                          role="row"
                        >
                          <div
                            class="mdc-data-table__cell grows center"
                            role="cell"
                          >
                            ${this._renderEmptyState()}
                          </div>
                        </div>
                      </div>
                    `
              : html`
                  ${
                    this.groupColumn &&
                    !this.autoHeight &&
                    this._stickyGroup !== undefined
                      ? html`<div
                          class="mdc-data-table__row sticky-group-header"
                          role="row"
                          aria-rowindex=${ifDefined(
                            stickyGroupIndex === -1
                              ? undefined
                              : stickyGroupIndex + (this.loadError ? 3 : 2)
                          )}
                          .group=${this._stickyGroup}
                          @click=${this._collapseStickyGroup}
                        >
                          ${keyed(
                            this._stickyGroup,
                            this._renderGroupHeader(
                              this._stickyGroup,
                              this._collapsedGroups.includes(this._stickyGroup),
                              this._modeLocalize,
                              this.renderGroupActions,
                              true
                            )
                          )}
                        </div>`
                      : nothing
                  }
                  <lit-virtualizer
                    scroller
                    class="mdc-data-table__content scroller ha-scrollbar ${classMap(
                      { grouped: Boolean(this.groupColumn) && !this.autoHeight }
                    )}"
                    tabindex=${ifDefined(!this.autoHeight ? "0" : undefined)}
                    @scroll=${this._saveScrollPos}
                    @visibilityChanged=${this._handleVisibilityChanged}
                    .items=${items}
                    .keyFunction=${this._keyFunction}
                    .renderItem=${renderRow}
                  ></lit-virtualizer>
                `
          }
        </div>
      </div>
    `;
  }

  // Group headers are keyed by their group, so they keep their actions' state
  // when the data changes. The prefixes keep them apart from row ids.
  private _keyFunction = (row: DataTableRowData) =>
    row?.[this.id]
      ? `row-${row[this.id]}`
      : row?.groupHeader !== undefined
        ? `group-${row.groupHeader}`
        : row;

  private _renderMainValue(value: unknown) {
    return this.clickable
      ? html`<button
          type="button"
          class="row-button"
          @mouseover=${this._setTitle}
          @focus=${this._setTitle}
        >
          ${value}
        </button>`
      : value;
  }

  private _countRows = memoizeOne(
    (items: DataTableRowData[]) =>
      items.filter(
        (item) =>
          !item.empty && (!item.append || item.groupHeader !== undefined)
      ).length
  );

  private _renderRow = (
    columns: DataTableColumnContainer,
    narrow: boolean,
    row: DataTableRowData,
    index: number
  ) => {
    // not sure how this happens...
    if (!row) {
      return nothing;
    }
    if (row.append) {
      const isGroupHeader = row.groupHeader !== undefined;
      return html`<div
        role=${ifDefined(isGroupHeader ? "row" : undefined)}
        aria-rowindex=${ifDefined(
          isGroupHeader ? index + (this.loadError ? 3 : 2) : undefined
        )}
        class="mdc-data-table__row ${classMap({
          "group-header-row": isGroupHeader,
          "append-row": !isGroupHeader,
        })}"
        .group=${row.groupHeader}
      >
        ${row.content}
      </div>`;
    }
    if (row.empty) {
      return html`<div class="mdc-data-table__row empty-row"></div>`;
    }
    return html`
      <div
        aria-rowindex=${index + (this.loadError ? 3 : 2)}
        role="row"
        .rowId=${row[this.id]}
        data-entity-id=${ifDefined(
          this.entityRows ? String(row[this.id]) : undefined
        )}
        @click=${this._handleRowClick}
        class="mdc-data-table__row ${classMap({
          "mdc-data-table__row--selected": this._checkedRows.includes(
            String(row[this.id])
          ),
          clickable: this.clickable,
        })}"
        aria-selected=${ifDefined(
          this._checkedRows.includes(String(row[this.id])) ? true : undefined
        )}
        .selectable=${row.selectable !== false}
      >
        ${
          this.selectable
            ? html`
                <div
                  class="mdc-data-table__cell mdc-data-table__cell--checkbox"
                  role="cell"
                >
                  <ha-checkbox
                    class="mdc-data-table__row-checkbox"
                    @click=${this._handleRowCheckboxClicked}
                    .rowId=${row[this.id]}
                    .disabled=${row.selectable === false}
                    .checked=${this._checkedRows.includes(String(row[this.id]))}
                  >
                  </ha-checkbox>
                </div>
              `
            : ""
        }
        ${Object.entries(columns).map(([key, column]) => {
          if (
            (narrow && !column.main && !column.showNarrow) ||
            !this._isColumnVisible(key, column)
          ) {
            return nothing;
          }
          const templated =
            column.template && !column.main ? column.template(row) : undefined;
          // On a phone a cell with nothing in it still took its width
          // and showed as an empty box (or a lone dash) at the end of the row.
          if (
            narrow &&
            column.template &&
            !column.main &&
            !this._hasCellValue(templated)
          ) {
            return nothing;
          }
          return html`
            <div
              @mouseover=${this._setTitle}
              @focus=${this._setTitle}
              role=${column.main ? "rowheader" : "cell"}
              class="mdc-data-table__cell ${classMap(this._cellClasses(column))}"
              style=${styleMap(this._cellStyles(column))}
            >
              ${
                column.template
                  ? column.main
                    ? this._renderMainValue(column.template(row))
                    : templated
                  : narrow && column.main
                    ? html`<div class="primary">
                          ${this._renderMainValue(row[key])}
                        </div>
                        <div class="secondary">
                          ${join(
                            Object.entries(columns)
                              .filter(([key2, column2]) =>
                                this._isSecondaryColumnVisible(key2, column2)
                              )
                              .map(([key2, column2]) =>
                                column2.template
                                  ? column2.template(row)
                                  : row[key2]
                              )
                              .filter(this._hasCellValue),
                            STRINGS_SEPARATOR_DOT
                          )}
                        </div>
                        ${
                          column.extraTemplate
                            ? column.extraTemplate(row)
                            : nothing
                        }`
                    : html`${
                        column.main ? this._renderMainValue(row[key]) : row[key]
                      }${
                        column.extraTemplate
                          ? column.extraTemplate(row)
                          : nothing
                      }`
              }
            </div>
          `;
        })}
      </div>
    `;
  };

  private _isColumnVisible(key: string, column: DataTableColumnData): boolean {
    if (column.hidden) {
      return false;
    }
    if (!this.columnOrder?.includes(key)) {
      return !column.defaultHidden;
    }
    return !(this.hiddenColumns?.includes(key) ?? column.defaultHidden);
  }

  private _isSecondaryColumnVisible(
    key: string,
    column: DataTableColumnData
  ): boolean {
    // The grouped value is already shown in the sticky group header, which
    // isn't available for auto-height tables
    if (
      column.main ||
      column.showNarrow ||
      (!this.autoHeight && key === this.groupColumn)
    ) {
      return false;
    }
    return this._isColumnVisible(key, column);
  }

  private _hasCellValue = (value: unknown): boolean =>
    value !== undefined &&
    value !== null &&
    value !== "" &&
    // A lone dash is a placeholder for nothing: it only costs the second line width.
    value !== "—" &&
    value !== nothing;

  private _cellClasses = (column: DataTableColumnData) => ({
    "mdc-data-table__cell--flex": column.type === "flex",
    "mdc-data-table__cell--numeric": column.type === "numeric",
    "mdc-data-table__cell--icon": column.type === "icon",
    "mdc-data-table__cell--icon-button": column.type === "icon-button",
    "mdc-data-table__cell--overflow-menu": column.type === "overflow-menu",
    "mdc-data-table__cell--overflow": column.type === "overflow",
    forceLTR: Boolean(column.forceLTR),
  });

  private _cellStyles = (column: DataTableColumnData) => ({
    minWidth: column.minWidth,
    maxWidth: column.maxWidth,
    flex: column.flex || 1,
  });

  private async _sortFilterData() {
    const startTime = new Date().getTime();
    const timeBetweenUpdate = startTime - this._lastUpdate;
    const timeBetweenRequest = startTime - this._curRequest;
    this._curRequest = startTime;

    const forceUpdate =
      !this._lastUpdate ||
      (timeBetweenUpdate > 500 && timeBetweenRequest < 500);

    const sourceData = this.data;
    let filteredData = sourceData;
    if (this._filter) {
      filteredData = await this._memFilterData(
        sourceData,
        this._sortColumns,
        this._filter.trim()
      );
    }

    if (!forceUpdate && this._curRequest !== startTime) {
      return;
    }

    const prom =
      this.sortColumn && this._sortColumns[this.sortColumn]
        ? sortData(
            filteredData,
            this._sortColumns[this.sortColumn],
            this.sortDirection,
            this.sortColumn,
            this._i18n?.locale?.language
          )
        : filteredData;

    const [data] = await Promise.all([prom, nextRender]);

    const curTime = new Date().getTime();
    const elapsed = curTime - startTime;

    if (elapsed < 100) {
      await new Promise((resolve) => {
        setTimeout(resolve, 100 - elapsed);
      });
    }

    if (!forceUpdate && this._curRequest !== startTime) {
      return;
    }

    if (startTime < this._lastUpdate) {
      return;
    }

    this._lastUpdate = startTime;
    this._filteredData = data;
    this._filteredVersion += 1;
    this._filteredDataSourceLength = sourceData.length;
    fireEvent(this, "filtered-rows-changed");
  }

  private _groupData = memoizeOne(
    (
      data: DataTableRowData[],
      localize: LocalizeFunc | undefined,
      locale: FrontendLocaleData | undefined,
      appendRow,
      groupColumn: string | undefined,
      groupOrder: string[] | undefined,
      collapsedGroups: string[],
      sortColumn: string | undefined,
      sortDirection: SortingDirection,
      renderGroupActions: DataTableGroupActions | undefined
    ) => {
      if (appendRow || groupColumn) {
        let items = [...data];

        if (groupColumn) {
          const isGroupSortColumn = sortColumn === groupColumn;

          const grouped = groupBy(items, (item) =>
            dataTableGroupKey(item[groupColumn])
          );
          const sortedEntries: [string, DataTableRowData[]][] = Object.keys(
            grouped
          )
            .sort((a, b) => {
              if (!groupOrder && isGroupSortColumn) {
                const comparison = stringCompare(a, b, locale?.language);
                if (sortDirection === "asc") {
                  return comparison;
                }
                return comparison * -1;
              }

              const orderA = groupOrder?.indexOf(a) ?? -1;
              const orderB = groupOrder?.indexOf(b) ?? -1;
              if (orderA !== orderB) {
                if (orderA === -1) {
                  return 1;
                }
                if (orderB === -1) {
                  return -1;
                }
                return orderA - orderB;
              }
              return stringCompare(
                ["", "-", "—"].includes(a) ? "zzz" : a,
                ["", "-", "—"].includes(b) ? "zzz" : b,
                locale?.language
              );
            })
            .reduce(
              (entries, key) => {
                const entry: [string, DataTableRowData[]] = [key, grouped[key]];

                entries.push(entry);
                return entries;
              },
              [] as [string, DataTableRowData[]][]
            );

          const groupedItems: DataTableRowData[] = [];
          sortedEntries.forEach(([groupName, rows]) => {
            groupedItems.push({
              append: true,
              selectable: false,
              groupHeader: groupName,
              content: this._renderGroupHeader(
                groupName,
                collapsedGroups.includes(groupName),
                localize,
                renderGroupActions
              ),
            });
            if (!collapsedGroups.includes(groupName)) {
              groupedItems.push(...rows);
            }
          });
          items = groupedItems;
        }

        if (appendRow) {
          items.push({ append: true, selectable: false, content: appendRow });
        }

        items.push({ empty: true });

        return items;
      }
      return [...data, { empty: true }];
    }
  );

  private _renderEmptyState(): TemplateResult {
    const localize = this._modeLocalize;
    const tone = emptyTone({
      dataCount: this.data.length,
      searchActive: this._filter.trim() !== "",
      filtersActive: this.filtersActive,
    });
    if (tone === "filtered") {
      return html`<ha-empty-state
        tone="filtered"
        .heading=${
          localize?.("ui.components.empty-state.filtered_heading") ||
          "No matches"
        }
        .description=${
          localize?.("ui.components.data-table.no_match_filter") ||
          "No rows matching current filters"
        }
      >
        <ha-svg-icon slot="icon" .path=${mdiFilterVariantRemove}></ha-svg-icon>
        <ha-button
          slot="actions"
          appearance="filled"
          @click=${this._clearSearchAndFilters}
        >
          ${
            localize?.("ui.components.empty-state.clear_all") ||
            "Clear search and filters"
          }
        </ha-button>
      </ha-empty-state>`;
    }
    return html`<ha-empty-state
      tone="start"
      .heading=${
        this.noDataText ||
        localize?.("ui.components.data-table.no-data") ||
        "No data"
      }
    >
      <ha-svg-icon slot="icon" .path=${mdiInboxOutline}></ha-svg-icon>
      <slot name="empty-action" slot="actions"></slot>
    </ha-empty-state>`;
  }

  private _clearSearchAndFilters() {
    fireEvent(this, "clear-search-and-filters");
  }

  private _renderGroupHeader(
    groupName: string,
    collapsed: boolean,
    localize: LocalizeFunc | undefined,
    renderGroupActions: DataTableGroupActions | undefined,
    sticky = false
  ) {
    // The sticky copy's button and name are hidden from assistive technology,
    // and its button is made inert. It handles clicks on its whole row
    // instead, as its cell shifts with horizontal scrolling. The group's
    // actions show in the sticky copy while it is pinned, so they stay
    // available there.
    return html`<div
      class="mdc-data-table__cell group-header"
      role="cell"
      .group=${groupName}
      @click=${sticky ? nothing : this._collapseGroup}
    >
      <ha-icon-button
        .path=${mdiChevronUp}
        .label=${
          localize?.(
            `ui.components.data-table.${collapsed ? "expand" : "collapse"}`
          ) || (collapsed ? "Expand" : "Collapse")
        }
        class=${collapsed ? "collapsed" : ""}
        ?inert=${sticky}
      >
      </ha-icon-button>
      <span
        class="group-name"
        aria-hidden=${ifDefined(sticky ? "true" : undefined)}
      >
        ${
          groupName === UNDEFINED_GROUP_KEY
            ? localize?.("ui.components.data-table.ungrouped") || "Ungrouped"
            : groupName || ""
        }
      </span>
      <div class="group-actions" @click=${this._stopGroupToggle}>
        ${renderGroupActions?.(groupName)}
      </div>
    </div>`;
  }

  // Actions don't toggle the group their header belongs to
  private _stopGroupToggle(ev: Event) {
    ev.stopPropagation();
  }

  private _memFilterData = memoizeOne(
    (
      data: DataTableRowData[],
      columns: SortableColumnContainer,
      filter: string
    ): Promise<DataTableRowData[]> => filterData(data, columns, filter)
  );

  private _handleHeaderClick(
    ev: HASSDomCurrentTargetEvent<HTMLElement & { columnId: string }> &
      MouseEvent
  ) {
    const columnId = ev.currentTarget.columnId;
    if (!this.columns[columnId].sortable) {
      return;
    }
    if (!this.sortDirection || this.sortColumn !== columnId) {
      this.sortDirection = "asc";
    } else if (this.sortDirection === "asc") {
      this.sortDirection = "desc";
    } else {
      this.sortDirection = "asc";
    }

    this.sortColumn = columnId;

    fireEvent(this, "sorting-changed", {
      column: columnId,
      direction: this.sortDirection,
    });

    // A keyboard click has no detail, keep focus on the sort button then
    if (ev.detail !== 0) {
      this._focusScroller();
    }
  }

  /** Whether none, some or all of the shown rows are ticked. */
  private _headerCheckState(): { some: boolean; all: boolean } {
    if (!this.selectable || !this._checkedRows.length) {
      return { some: false, all: false };
    }
    const { ids, idSet } = this._shownRows(
      this._filteredVersion,
      this._collapsedGroups,
      this.groupColumn,
      this.id
    );
    if (!ids.length) {
      return { some: false, all: false };
    }
    const ticked = this._checkedRows.filter((id) => idSet.has(id)).length;
    return { some: ticked > 0, all: ticked === ids.length };
  }

  private _handleHeaderRowCheckboxClick(ev: HASSDomTargetEvent<HaCheckbox>) {
    const { ids } = this._shownRows(
      this._filteredVersion,
      this._collapsedGroups,
      this.groupColumn,
      this.id
    );
    this._checkedRows = headerCheckboxSelection(
      this._checkedRows,
      ids,
      ev.target.checked,
      this.keepHiddenSelection
    );
    this._lastSelectedRowId = null;
    this._checkedRowsChanged();
  }

  private _handleRowCheckboxClicked = (ev: MouseEvent) => {
    // ha-checkbox label dispatches synthetic click on input, so handle the input click only
    if (!(ev.composedPath()[0] instanceof HTMLInputElement) && !ev.shiftKey) {
      return;
    }

    // In range select mode, use label click for Firefox since it doesn't fire input click events
    if (ev.composedPath()[0] instanceof HTMLInputElement && ev.shiftKey) {
      ev.preventDefault();
    }

    const checkboxElement = ev.currentTarget as HaCheckbox & { rowId: string };

    const rowId = checkboxElement.rowId;

    const groupedData = this._groupData(
      this._filteredData || [],
      this._modeLocalize,
      this._i18n?.locale,
      this.appendRow,
      this.groupColumn,
      this.groupOrder,
      this._collapsedGroups,
      this.sortColumn,
      this.sortDirection,
      this.renderGroupActions
    );

    if (
      groupedData.find((data) => data[this.id] === rowId)?.selectable === false
    ) {
      return;
    }

    const rowIndex = groupedData.findIndex((data) => data[this.id] === rowId);

    if (
      ev instanceof MouseEvent &&
      ev.shiftKey &&
      this._lastSelectedRowId !== null
    ) {
      const lastSelectedRowIndex = groupedData.findIndex(
        (data) => data[this.id] === this._lastSelectedRowId
      );

      if (lastSelectedRowIndex > -1 && rowIndex > -1) {
        this._checkedRows = [
          ...this._checkedRows,
          ...this._selectRange(groupedData, lastSelectedRowIndex, rowIndex),
        ];
      }
    } else if (checkboxElement.checked) {
      if (!this._checkedRows.includes(rowId)) {
        this._checkedRows = [...this._checkedRows, rowId];
      }
    } else {
      this._checkedRows = this._checkedRows.filter((row) => row !== rowId);
    }

    if (rowIndex > -1) {
      this._lastSelectedRowId = rowId;
    }
    this._checkedRowsChanged();
  };

  private _selectRange(
    groupedData: DataTableRowData[],
    startIndex: number,
    endIndex: number
  ) {
    const start = Math.min(startIndex, endIndex);
    const end = Math.max(startIndex, endIndex);

    const checkedRows: string[] = [];

    for (let i = start; i <= end; i++) {
      const row = groupedData[i];
      if (
        row &&
        row.selectable !== false &&
        !this._checkedRows.includes(row[this.id])
      ) {
        checkedRows.push(row[this.id]);
      }
    }

    return checkedRows;
  }

  private _handleRowClick = (
    ev: HASSDomCurrentTargetEvent<HTMLElement & { rowId: string }>
  ) => {
    if (
      ev
        .composedPath()
        .find((el) =>
          [
            "ha-checkbox",
            "ha-button",
            "ha-button",
            "ha-icon-button",
            "ha-assist-chip",
          ].includes((el as HTMLElement).localName)
        )
    ) {
      return;
    }
    const rowId = ev.currentTarget.rowId;
    fireEvent(this, "row-click", { id: rowId }, { bubbles: false });
  };

  private _setTitle(ev: HASSDomCurrentTargetEvent<HTMLElement>) {
    if (ev.currentTarget.scrollWidth > ev.currentTarget.offsetWidth) {
      ev.currentTarget.setAttribute("title", ev.currentTarget.innerText);
    }
  }

  private _checkedRowsChanged() {
    // force scroller to update, change it's items
    if (this._filteredData?.length) {
      this._filteredData = [...this._filteredData];
    }
    fireEvent(this, "selection-changed", {
      value: this._checkedRows,
    });
  }

  private _handleSearchChange(ev: InputEvent): void {
    if (this.filter) {
      return;
    }
    this._lastSelectedRowId = null;
    this._debounceSearch((ev.target as HTMLInputElement).value);
  }

  private _focusScroller(): void {
    this._scroller?.focus({
      preventScroll: true,
    });
  }

  private _retryLoad() {
    fireEvent(this, "retry-load");
  }

  @eventOptions({ passive: true })
  private _saveScrollPos(e: HASSDomTargetEvent<HTMLDivElement>) {
    this._savedScrollPos = e.target.scrollTop;

    // Only write when it differs: a write invalidates layout on every scroll.
    if (this._headerRow && this._headerRow.scrollLeft !== e.target.scrollLeft) {
      this._headerRow.scrollLeft = e.target.scrollLeft;
    }

    this._scheduleStickyGroupUpdate();
  }

  private _handleVisibilityChanged(ev: VisibilityChangedEvent) {
    this._firstVisibleIndex = ev.first;
    // Fired before the virtualizer positions its children, so measure later
    this._scheduleStickyGroupUpdate();
  }

  private _scheduleStickyGroupUpdate() {
    if (!this.groupColumn) {
      this._stickyGroup = undefined;
      return;
    }
    if (this._stickyGroupFrame !== undefined) {
      return;
    }
    this._stickyGroupFrame = requestAnimationFrame(() => {
      this._stickyGroupFrame = undefined;
      this._updateStickyGroup();
    });
  }

  /**
   * The virtualizer positions rows absolutely, so `position: sticky` can't be
   * used. Instead, an overlay copy of the current group header is shown at the
   * top of the scroller, and the next group header slides under it. The
   * overlay doesn't move with the scroll, as browsers scroll off the main
   * thread and it would lag behind the rows.
   */
  private _updateStickyGroup() {
    const scroller = this._scroller;
    if (
      !scroller ||
      !this.groupColumn ||
      this.autoHeight ||
      scroller.scrollTop <= 0
    ) {
      this._stickyGroup = undefined;
      return;
    }

    // Read the rows' own positions from their inline transform (the
    // virtualizer writes `translate(x, y)` in content space) so no layout is
    // forced per header on every frame; fall back to measuring only when a row
    // carries no readable position.
    const scrollTop = scroller.scrollTop;
    let scrollerTop: number | undefined;
    let group: string | undefined;
    let currentTop = -Infinity;

    scroller
      .querySelectorAll<HTMLElement & { group: string }>(".group-header-row")
      .forEach((row) => {
        const match = /translate\(\s*[-\d.]+px,\s*([-\d.]+)px\s*\)/.exec(
          row.style.transform
        );
        let top: number;
        if (match) {
          top = Number(match[1]) - scrollTop;
        } else {
          scrollerTop ??= scroller.getBoundingClientRect().top;
          top = row.getBoundingClientRect().top - scrollerTop;
        }
        // Rows can sit at fractional positions, so a header less than a
        // pixel below the top counts as reached
        if (top < 1 && top > currentTop) {
          currentTop = top;
          group = row.group;
        }
      });

    if (group === undefined) {
      // The current group header is not rendered, find it from the first visible row
      const items = scroller.items;
      for (
        let i = Math.min(this._firstVisibleIndex, items.length - 1);
        i >= 0;
        i--
      ) {
        if (items[i]?.append && items[i].groupHeader !== undefined) {
          group = items[i].groupHeader;
          break;
        }
      }
    }

    this._stickyGroup = group;
    this._stickyGroupPosition = {
      top: scroller.offsetTop,
      width: scroller.clientWidth,
      scrollLeft: scroller.scrollLeft,
    };
    this._positionStickyGroupHeader();
  }

  // What was last written to the pinned header, so a frame that changes
  // nothing writes nothing
  private _stickyGroupApplied: {
    element?: HTMLElement;
    width: string;
    transform: string;
    cell: string;
    actions: string;
  } = { width: "", transform: "", cell: "", actions: "" };

  private _positionStickyGroupHeader() {
    const header = this._stickyGroupHeader;
    if (!header) {
      return;
    }
    // A header element that was rendered anew starts without these styles
    if (this._stickyGroupApplied.element !== header) {
      this._stickyGroupApplied = {
        element: header,
        width: "",
        transform: "",
        cell: "",
        actions: "",
      };
    }
    const { top, width, scrollLeft } = this._stickyGroupPosition;
    const applied = this._stickyGroupApplied;
    const widthValue = `${width}px`;
    if (applied.width !== widthValue) {
      header.style.width = widthValue;
      applied.width = widthValue;
    }
    const transformValue = `translateY(${top}px)`;
    if (applied.transform !== transformValue) {
      header.style.transform = transformValue;
      applied.transform = transformValue;
    }
    // Follow the horizontal scroll of the group header rows it covers
    if (this._stickyGroupHeaderCell) {
      const cellValue = `translateX(${-scrollLeft}px)`;
      if (applied.cell !== cellValue) {
        this._stickyGroupHeaderCell.style.transform = cellValue;
        applied.cell = cellValue;
      }
    }

    // Its actions stay at the end of the visible row, like the rows' own
    if (this._stickyGroupActions) {
      const actionsValue = `translateX(${scrollLeft}px)`;
      if (applied.actions !== actionsValue) {
        this._stickyGroupActions.style.transform = actionsValue;
        applied.actions = actionsValue;
      }
    }
  }

  @eventOptions({ passive: true })
  private _scrollContent(e: HASSDomTargetEvent<HTMLDivElement>) {
    if (!this._scroller) {
      return;
    }

    this._scroller.scrollLeft = e.target.scrollLeft;
  }

  private _collapseStickyGroup = async (
    ev: HASSDomCurrentTargetEvent<HTMLElement & { group: string }>
  ) => {
    const groupName = ev.currentTarget.group;
    this._collapseGroup(ev);
    await this.updateComplete;
    const scroller = this._scroller;
    if (!scroller) {
      return;
    }
    // Keep the toggled group in view, its rows may have been above the viewport.
    // Scroll a rendered header to the very top ourselves, as scrollIntoView
    // would leave room for the sticky header (scroll-padding-top).
    const row = Array.from(
      scroller.querySelectorAll<HTMLElement & { group: string }>(
        ".group-header-row"
      )
    ).find((headerRow) => headerRow.group === groupName);
    if (row) {
      scroller.scrollTop +=
        row.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
      return;
    }
    const index = scroller.items.findIndex(
      (item) => item?.append && item.groupHeader === groupName
    );
    if (index !== -1) {
      // The header isn't rendered, but element() still returns a proxy for
      // any index in the items: its scrollIntoView() pins that index in the
      // virtualizer's layout, which renders it and aligns it to the top
      scroller.element(index)?.scrollIntoView({ block: "start" });
    }
  };

  private _collapseGroup = (
    ev: HASSDomCurrentTargetEvent<HTMLElement & { group: string }>
  ) => {
    const groupName = ev.currentTarget.group;
    // Where the toggled header sits in the scroller, so it can stay there
    const scroller = this._scroller;
    const anchorTop =
      scroller && !ev.currentTarget.closest(".sticky-group-header")
        ? ev.currentTarget.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top
        : undefined;
    if (this._collapsedGroups.includes(groupName)) {
      this._collapsedGroups = this._collapsedGroups.filter(
        (grp) => grp !== groupName
      );
    } else {
      this._collapsedGroups = [...this._collapsedGroups, groupName];
    }
    this._lastSelectedRowId = null;
    fireEvent(this, "collapsed-changed", { value: this._collapsedGroups });
    if (anchorTop !== undefined && scroller) {
      // Removing or adding rows must not move the header under the finger
      this.updateComplete.then(() =>
        requestAnimationFrame(() => {
          const row = Array.from(
            scroller.querySelectorAll<HTMLElement & { group: string }>(
              ".group-header-row"
            )
          ).find((headerRow) => headerRow.group === groupName);
          if (row) {
            scroller.scrollTop +=
              row.getBoundingClientRect().top -
              scroller.getBoundingClientRect().top -
              anchorTop;
          }
        })
      );
    }
  };

  public expandAllGroups() {
    this._collapsedGroups = [];
    this._lastSelectedRowId = null;
    fireEvent(this, "collapsed-changed", { value: this._collapsedGroups });
  }

  public collapseAllGroups() {
    const groupColumn = this.groupColumn;

    if (!groupColumn || !this.data.some((item) => item[groupColumn])) {
      return;
    }

    const grouped = groupBy(this.data, (item) =>
      dataTableGroupKey(item[groupColumn])
    );
    this._collapsedGroups = Object.keys(grouped);
    this._lastSelectedRowId = null;
    fireEvent(this, "collapsed-changed", { value: this._collapsedGroups });
  }

  static get styles(): CSSResultGroup {
    return [
      haStyleScrollbar,
      css`
        /* default mdc styles, colors changed, without checkbox styles */
        :host {
          height: 100%;
          --_cell-padding-inline: 16px;
          --_inset-left: var(--data-table-inset-left, 0px);
          --_inset-right: var(--data-table-inset-right, 0px);
        }

        :host([narrow]) {
          --_cell-padding-inline: 8px;
        }
        .mdc-data-table__content {
          font-family: var(--ha-font-family-body);
          -moz-osx-font-smoothing: var(--ha-moz-osx-font-smoothing);
          -webkit-font-smoothing: var(--ha-font-smoothing);
          font-size: 0.875rem;
          line-height: var(--ha-line-height-condensed);
          font-weight: var(--ha-font-weight-normal);
          letter-spacing: 0.0178571429em;
          text-decoration: inherit;
          text-transform: inherit;
        }

        .mdc-data-table {
          background: var(
            --ha-data-table-background,
            var(--data-table-background-color)
          );
          border-radius: var(--ha-border-radius-xl);
          border-width: 1px;
          border-style: solid;
          border-color: var(--divider-color);
          display: inline-flex;
          flex-direction: column;
          box-sizing: border-box;
          overflow: hidden;
        }

        .mdc-data-table__row--selected {
          background-color: var(
            --ha-color-primary-container,
            rgba(var(--rgb-primary-color), 0.04)
          );
        }

        .mdc-data-table__row {
          display: flex;
          box-sizing: border-box;
          height: var(--data-table-row-height, 52px);
          width: var(--table-row-width, 100%);
        }

        .mdc-data-table__row.empty-state-row {
          height: auto;
          min-height: var(--data-table-row-height, 52px);
        }
        .mdc-data-table__row.empty-state-row .mdc-data-table__cell {
          height: auto;
          overflow: visible;
          white-space: normal;
        }
        .mdc-data-table__header-row.empty-state-shown {
          display: none;
        }

        .mdc-data-table__row.empty-row {
          height: var(
            --data-table-empty-row-height,
            var(--safe-area-inset-bottom, 0px)
          );
        }

        /* A divider above every row but the first. No sibling or position
           selector here: one makes the browser restyle every row each time the
           virtualizer adds or removes one while scrolling. */
        .mdc-data-table__row {
          border-top: 1px solid var(--divider-color);
        }

        .mdc-data-table__row[aria-rowindex="2"] {
          border-top: none;
        }

        .mdc-data-table__row.clickable:not(
            .mdc-data-table__row--selected
          ):hover {
          background-color: rgba(var(--rgb-primary-text-color), 0.04);
        }

        .mdc-data-table__header-cell {
          color: var(--primary-text-color);
        }

        .mdc-data-table__cell {
          color: var(--primary-text-color);
        }

        .mdc-data-table__header-row {
          height: 56px;
          flex-shrink: 0;
          display: flex;
          border-bottom: 1px solid var(--divider-color);
          overflow: auto;
        }

        .mdc-data-table {
          width: calc(100% + var(--_inset-left) + var(--_inset-right));
          margin-left: calc(-1 * var(--_inset-left));
          margin-right: calc(-1 * var(--_inset-right));
        }

        /* Hide scrollbar for Chrome, Safari and Opera */
        .mdc-data-table__header-row::-webkit-scrollbar {
          display: none;
        }

        .mdc-data-table__header-row {
          scrollbar-width: none;
        }

        .mdc-data-table__cell,
        .mdc-data-table__header-cell {
          padding-inline: var(--_cell-padding-inline);
          min-width: 150px;
          align-self: center;
          overflow: hidden;
          text-overflow: ellipsis;
          flex-shrink: 0;
          box-sizing: border-box;
        }

        .mdc-data-table__cell.mdc-data-table__cell--flex {
          display: flex;
          overflow: initial;
        }

        .mdc-data-table__cell.mdc-data-table__cell--icon {
          overflow: initial;
        }

        .mdc-data-table__header-cell--checkbox,
        .mdc-data-table__cell--checkbox {
          padding-inline-start: var(--_cell-padding-inline);
          padding-inline-end: 0;
          width: 60px;
          min-width: 60px;
          /* The checkbox's invisible 44 px hit area is taller than the cell
             (the checkbox itself is 28 px): do not clip it. */
          overflow: visible;
        }

        .mdc-data-table__table {
          display: flex;
          flex-direction: column;
          flex: 1 1 auto;
          min-height: 0;
          width: 100%;
          border: 0;
          white-space: nowrap;
          position: relative;
        }

        .load-error {
          flex-shrink: 0;
          padding: var(--ha-space-2) var(--ha-space-4);
          padding-left: calc(var(--ha-space-4) + var(--_inset-left));
          padding-right: calc(var(--ha-space-4) + var(--_inset-right));
          white-space: normal;
        }

        .load-error ha-alert {
          display: block;
        }

        .mdc-data-table__cell {
          font-family: var(--ha-font-family-body);
          -moz-osx-font-smoothing: var(--ha-moz-osx-font-smoothing);
          -webkit-font-smoothing: var(--ha-font-smoothing);
          font-size: 0.875rem;
          line-height: var(--ha-line-height-condensed);
          font-weight: var(--ha-font-weight-normal);
          letter-spacing: 0.0178571429em;
          text-decoration: inherit;
          text-transform: inherit;
          flex-grow: 0;
          flex-shrink: 0;
        }

        .mdc-data-table__cell a {
          color: inherit;
          text-decoration: none;
        }

        .row-button {
          max-width: 100%;
          padding: 0;
          border: none;
          background: none;
          font: inherit;
          letter-spacing: inherit;
          color: inherit;
          text-align: inherit;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          cursor: pointer;
        }

        .row-button:focus-visible,
        .sort-button:focus-visible {
          outline: var(--ha-border-width-md) solid var(--primary-color);
          outline-offset: calc(-1 * var(--ha-border-width-md));
          border-radius: var(--ha-border-radius-sm);
        }

        @supports selector(:has(*)) {
          .row-button:focus-visible {
            outline: none;
          }

          .mdc-data-table__row:has(.row-button:focus-visible) {
            outline: var(--ha-border-width-md) solid var(--primary-color);
            outline-offset: calc(-1 * var(--ha-border-width-md));
          }
        }

        .sort-button {
          display: block;
          width: calc(100% + 2 * var(--ha-space-2));
          margin-inline: calc(-1 * var(--ha-space-2));
          padding: var(--ha-space-1) var(--ha-space-2);
          border: none;
          background: none;
          font: inherit;
          letter-spacing: inherit;
          color: inherit;
          text-align: inherit;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          cursor: pointer;
        }

        .mdc-data-table__cell--numeric {
          text-align: var(--float-end);
          direction: ltr;
        }

        .mdc-data-table__cell--icon {
          color: var(--secondary-text-color);
          text-align: center;
        }

        .mdc-data-table__header-cell--icon,
        .mdc-data-table__cell--icon {
          min-width: 64px;
          flex: 0 0 64px !important;
        }

        .mdc-data-table__cell--icon img {
          width: 24px;
          height: 24px;
        }

        .mdc-data-table__header-cell.mdc-data-table__header-cell--icon {
          text-align: center;
        }

        .mdc-data-table__header-cell.sortable.mdc-data-table__header-cell--icon:hover,
        .mdc-data-table__header-cell.sortable.mdc-data-table__header-cell--icon:focus-within,
        .mdc-data-table__header-cell.sortable.mdc-data-table__header-cell--icon:not(
            .not-sorted
          ) {
          text-align: var(--float-start);
        }

        .mdc-data-table__cell--icon:first-child img,
        .mdc-data-table__cell--icon:first-child ha-icon,
        .mdc-data-table__cell--icon:first-child ha-svg-icon,
        .mdc-data-table__cell--icon:first-child ha-state-icon,
        .mdc-data-table__cell--icon:first-child ha-domain-icon,
        .mdc-data-table__cell--icon:first-child ha-service-icon,
        .mdc-data-table__cell--icon:first-child ha-skeleton-icon {
          margin-left: 8px;
          margin-inline-start: 8px;
          margin-inline-end: initial;
        }

        .mdc-data-table__cell--icon:first-child state-badge {
          margin-right: -8px;
          margin-inline-end: -8px;
          margin-inline-start: initial;
        }

        .mdc-data-table__cell--overflow-menu,
        .mdc-data-table__header-cell--overflow-menu,
        .mdc-data-table__header-cell--icon-button,
        .mdc-data-table__cell--icon-button {
          min-width: 64px;
          flex: 0 0 64px !important;
          padding: 8px;
        }

        .mdc-data-table__header-cell--icon-button,
        .mdc-data-table__cell--icon-button {
          min-width: 56px;
          width: 56px;
        }

        .mdc-data-table__cell--overflow-menu,
        .mdc-data-table__cell--icon-button {
          color: var(--secondary-text-color);
          text-overflow: clip;
        }

        .mdc-data-table__header-cell--icon-button:first-child,
        .mdc-data-table__cell--icon-button:first-child,
        .mdc-data-table__header-cell--icon-button:last-child,
        .mdc-data-table__cell--icon-button:last-child {
          width: 64px;
        }

        .mdc-data-table__cell--overflow-menu:first-child,
        .mdc-data-table__header-cell--overflow-menu:first-child,
        .mdc-data-table__header-cell--icon-button:first-child,
        .mdc-data-table__cell--icon-button:first-child {
          padding-inline-start: var(--_cell-padding-inline);
          padding-inline-end: initial;
        }

        .mdc-data-table__cell--overflow-menu:last-child,
        .mdc-data-table__header-cell--overflow-menu:last-child,
        .mdc-data-table__header-cell--icon-button:last-child,
        .mdc-data-table__cell--icon-button:last-child {
          padding-inline-end: var(--_cell-padding-inline);
          padding-inline-start: initial;
        }
        .mdc-data-table__cell--overflow-menu,
        .mdc-data-table__cell--overflow,
        .mdc-data-table__header-cell--overflow-menu,
        .mdc-data-table__header-cell--overflow {
          overflow: initial;
        }
        .mdc-data-table__cell--icon-button a {
          color: var(--secondary-text-color);
        }

        .mdc-data-table__header-cell {
          font-family: var(--ha-font-family-body);
          -moz-osx-font-smoothing: var(--ha-moz-osx-font-smoothing);
          -webkit-font-smoothing: var(--ha-font-smoothing);
          font-size: var(--ha-font-size-s);
          line-height: var(--ha-line-height-normal);
          font-weight: var(--ha-font-weight-medium);
          letter-spacing: 0.0071428571em;
          text-decoration: inherit;
          text-transform: inherit;
          text-align: var(--float-start);
        }

        .mdc-data-table__header-cell--numeric {
          text-align: var(--float-end);
        }

        /* custom from here */

        /* A row a page appends (a note, a card) is as tall as its content,
           never shorter than a normal row. */
        .mdc-data-table__row.append-row {
          height: auto;
          min-height: var(--data-table-row-height, 52px);
        }

        .group-header {
          padding-top: 12px;
          height: var(--data-table-row-height, 52px);
          padding-left: 12px;
          padding-inline-start: 12px;
          padding-inline-end: initial;
          width: 100%;
          font-weight: var(--ha-font-weight-medium);
          display: flex;
          align-items: center;
          cursor: pointer;
          /* Clipping would make the cell the actions' sticky scroll container,
             and cut off the pinned header's actions */
          overflow: visible;
        }

        .group-name {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .group-header ha-icon-button {
          transition: transform 0.2s ease;
        }

        .group-header ha-icon-button.collapsed {
          transform: rotate(180deg);
        }

        .group-actions {
          display: flex;
          align-items: center;
          gap: var(--ha-space-2);
          /* Centre in the row, not below the header's top padding */
          align-self: stretch;
          margin-top: -12px;
          margin-inline-start: auto;
          /* The rows' icon button size, inherited by the actions */
          --_button-size: var(--data-table-group-actions-button-size, 48px);
          --ha-icon-button-size: var(--_button-size);
          --mdc-icon-size: var(--data-table-group-actions-icon-size, 24px);
          /* Centre the last action over the row's last cell, such as an
             overflow menu, which is a 48px icon button */
          padding-inline-end: calc(
            var(--ha-space-4) + (48px - var(--_button-size)) / 2
          );
          /* Stay in view when the rows scroll horizontally */
          position: sticky;
          inset-inline-end: 0;
          cursor: default;
          /* Don't pass the group name's weight on to the actions */
          font-weight: var(--ha-font-weight-normal);
          /* Inherited by the actions, like the rows' icon cells */
          color: var(
            --data-table-group-actions-color,
            var(--secondary-text-color)
          );
        }

        .sticky-group-header {
          position: absolute;
          top: 0;
          inset-inline-start: 0;
          z-index: 1;
          /* Match the top border of the group header rows it covers */
          border-top: 1px solid transparent;
          border-bottom: 1px solid var(--divider-color);
          background-color: var(--primary-background-color);
          will-change: transform;
        }

        .sticky-group-header .group-header {
          /* Don't paint over the bottom divider */
          background-color: transparent;
        }

        /* Keep focused rows clear of the sticky group header */
        lit-virtualizer.grouped {
          scroll-padding-top: var(--data-table-row-height, 52px);
        }

        :host {
          display: block;
        }

        /* The header takes the height it needs and the table takes the rest, so
           the list never grows past the page and the page keeps one scroller. */
        .mdc-data-table {
          display: flex;
          flex-direction: column;
          border-width: var(--data-table-border-width, 1px);
          height: 100%;
        }
        .mdc-data-table__header-cell {
          overflow: hidden;
          position: relative;
        }
        .mdc-data-table__header-cell span {
          position: relative;
          left: 0px;
          inset-inline-start: 0px;
          inset-inline-end: initial;
        }

        .mdc-data-table__header-cell.sortable {
          cursor: pointer;
        }
        .mdc-data-table__header-cell span,
        .mdc-data-table__header-cell ha-svg-icon {
          transition: var(--float-start) 0.2s ease;
        }
        .mdc-data-table__header-cell--numeric ha-svg-icon {
          transition: var(--float-end) 0.2s ease;
        }
        .mdc-data-table__header-cell ha-svg-icon {
          top: calc(var(--ha-space-1) - 3px);
          position: absolute;
        }
        .mdc-data-table__header-cell.not-sorted ha-svg-icon {
          left: -20px;
          inset-inline-start: -20px;
          inset-inline-end: initial;
        }
        .mdc-data-table__header-cell.sortable:not(.not-sorted) span,
        .mdc-data-table__header-cell.sortable.not-sorted:hover span,
        .mdc-data-table__header-cell.sortable.not-sorted:focus-within span {
          left: 24px;
          inset-inline-start: 24px;
          inset-inline-end: initial;
        }
        .mdc-data-table__header-cell.sortable:not(.not-sorted) ha-svg-icon,
        .mdc-data-table__header-cell.sortable:hover.not-sorted ha-svg-icon,
        .mdc-data-table__header-cell.sortable:focus-within.not-sorted
          ha-svg-icon {
          left: 12px;
          inset-inline-start: 12px;
          inset-inline-end: initial;
        }
        .mdc-data-table__header-cell--numeric.not-sorted ha-svg-icon {
          right: -20px;
          inset-inline-end: -20px;
          inset-inline-start: initial;
        }
        .mdc-data-table__header-cell--numeric.sortable:not(.not-sorted)
          ha-svg-icon,
        .mdc-data-table__header-cell--numeric.sortable:hover.not-sorted
          ha-svg-icon,
        .mdc-data-table__header-cell--numeric.sortable:focus-within.not-sorted
          ha-svg-icon {
          right: 12px;
          inset-inline-end: 12px;
          inset-inline-start: initial;
        }
        .mdc-data-table__header-cell--numeric.sortable:not(.not-sorted) span,
        .mdc-data-table__header-cell--numeric.sortable:hover.not-sorted span,
        .mdc-data-table__header-cell--numeric.sortable:focus-within.not-sorted
          span {
          left: -24px;
          inset-inline-start: -24px;
          inset-inline-end: initial;
        }
        .table-header {
          border-bottom: 1px solid var(--divider-color);
        }
        ha-input-search {
          flex: 1;
          padding: var(--ha-space-3);
        }
        @media (min-width: 871px) {
          ha-input-search {
            --ha-input-search-height: 32px;
            --ha-input-search-border-radius: 10px;
          }
        }
        slot[name="header"] {
          display: block;
          flex: none;
        }
        .mdc-data-table__table.auto-height {
          flex: none;
        }
        .center {
          text-align: center;
        }
        .primary {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .secondary {
          color: var(--secondary-text-color);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-top: 2px;
        }
        /* On a phone the second line may take two lines before it is cut */
        :host([narrow]) .secondary {
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
          white-space: normal;
          overflow-wrap: anywhere;
        }
        /* Row cards: the second line takes the width of the row and, when it is
           still too long, a second line, before it is cut */
        :host([row-cards][narrow]) .secondary {
          display: -webkit-box;
          -webkit-line-clamp: 1;
          white-space: normal;
          overflow-wrap: anywhere;
        }
        /* The row's text takes the width the row has: its own cell grows to
           fill the row, and the cells beside it (status marks, a trailing
           value) are only as wide as their content. A cell that shared the
           width equally cut the second line short. */
        :host([row-cards][narrow]) .mdc-data-table__cell[role="rowheader"] {
          flex: 1 1 0% !important;
          min-width: 0;
          max-width: none !important;
        }
        :host([row-cards][narrow])
          .mdc-data-table__cell[role="cell"]:not(
            .mdc-data-table__cell--icon
          ):not(.mdc-data-table__cell--checkbox) {
          flex: 0 1 auto !important;
          white-space: nowrap;
        }
        /* The empty state is one cell as wide as the screen whose message
           wraps; the rule above would keep it on one line and let it run off
           both sides. */
        :host([narrow])
          .mdc-data-table__content
          .mdc-data-table__row.empty-state-row {
          width: 100%;
        }
        :host([narrow])
          .mdc-data-table__content
          .mdc-data-table__row.empty-state-row
          .mdc-data-table__cell[role="cell"] {
          flex: 1 1 100% !important;
          min-width: 0;
          max-width: 100% !important;
          white-space: normal;
        }
        :host([row-cards][narrow]) .primary {
          font-size: var(--ha-list-row-title-size, var(--ha-font-size-m));
          font-weight: var(--ha-list-row-title-weight, 600);
        }
        .secondary ha-svg-icon {
          --mdc-icon-size: 16px;
          vertical-align: text-bottom;
          margin-inline-end: 2px;
        }
        .scroller {
          flex: 1;
          min-height: 0;
          overflow: overlay !important;
        }
        /* A phone list scrolls up and down only: a cell that is a few pixels
           too wide must not add a sideways scroll to the page. */
        :host([narrow]) .scroller {
          overflow-x: hidden !important;
        }
        :host([narrow])
          .mdc-data-table__cell:not(.mdc-data-table__cell--icon):not(
            .mdc-data-table__cell--icon-button
          ):not(.mdc-data-table__cell--overflow-menu):not(
            .mdc-data-table__cell--checkbox
          ) {
          min-width: 0;
        }

        .mdc-data-table__row,
        :host(:not([narrow])) .mdc-data-table__header-row {
          padding-left: var(--_inset-left);
          padding-right: var(--_inset-right);
        }

        .mdc-data-table__row.group-header-row,
        .mdc-data-table__row.sticky-group-header {
          background: var(
            --ha-data-table-background,
            var(--primary-background-color)
          );
        }

        /* Rows as cards. The card is drawn behind the row, so the row keeps
           its size and the columns keep their places. */
        :host([row-cards]) .mdc-data-table {
          background: var(
            --ha-data-table-background,
            var(--primary-background-color)
          );
        }
        :host([row-cards]) .mdc-data-table__header-row {
          border-bottom: none;
          height: var(--ha-space-10);
        }
        /* The tool row of a phone page holds 44 px chips on a touch screen: it
           grows past 40 px instead of clipping them. */
        :host([row-cards][narrow]) .mdc-data-table__header-row {
          height: auto;
          min-height: var(--ha-space-10);
        }
        /* Row cards keep 16 px to each side of the screen on a phone. */
        :host([row-cards][narrow]) .mdc-data-table__row {
          margin-inline: var(--ha-space-4);
          width: calc(100% - var(--ha-space-8));
        }
        :host([header-row-empty]) .mdc-data-table__header-row {
          display: none;
        }
        /* The column header is quiet: small capitals, no bar */
        :host([row-cards]) .mdc-data-table__header-cell {
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-xs, 11px);
          font-weight: var(--ha-font-weight-bold, 700);
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        :host([row-cards]) {
          /* Compact by default: a row is 52 px tall and never more than 60,
             whatever a page asks for. "Comfortable" density (set on the
             document by the personal preference) gives the taller rows. */
          --_row-h: clamp(
            var(--ha-list-row-min, 52px),
            var(--data-table-row-height, 52px),
            var(--ha-list-row-max, 60px)
          );
          --_row-gap: var(--ha-list-row-gap, 6px);
          --_row-radius: var(--ha-list-row-radius, 16px);
          /* The row surface: the theme's tonal container, or the page's text
             colour mixed into the card colour so it always stands out from
             the page behind it. */
          --_row-surface: var(
            --md-sys-color-surface-container,
            color-mix(
              in srgb,
              var(--primary-text-color) 7%,
              var(--card-background-color)
            )
          );
        }
        :host([row-cards]) .mdc-data-table__row {
          border-top: none;
        }
        /* On a phone a row holds its columns stacked, so it grows with them
           instead of letting a second line spill into the next row. */
        :host([narrow])
          .mdc-data-table__row[aria-rowindex]:not(.group-header-row):not(
            .sticky-group-header
          ) {
          height: auto;
          min-height: var(--data-table-row-height, 52px);
        }
        :host([narrow][row-cards])
          .mdc-data-table__row[aria-rowindex]:not(.group-header-row):not(
            .sticky-group-header
          ) {
          height: auto;
          min-height: calc(var(--_row-h) + var(--_row-gap));
          /* A row that grew past one line keeps its text off the card's top edge. */
          padding-top: var(--ha-space-2);
          padding-bottom: calc(var(--ha-space-2) * 2);
        }
        :host([row-cards])
          .mdc-data-table__row[aria-rowindex]:not(.group-header-row):not(
            .sticky-group-header
          ) {
          position: relative;
          isolation: isolate;
          height: calc(var(--_row-h) + var(--_row-gap));
          padding-bottom: var(--_row-gap);
          background: none;
        }
        :host([row-cards])
          .mdc-data-table__row[aria-rowindex]:not(.group-header-row):not(
            .sticky-group-header
          )::before {
          content: "";
          position: absolute;
          inset: 0 0 var(--_row-gap);
          z-index: -1;
          border-radius: var(--_row-radius);
          background: var(--_row-surface);
        }
        /* Row-card lists stay tight: narrower icon and checkbox columns,
           40 px group headers and 12 px cell padding on a phone. */
        :host([row-cards][narrow]) {
          --_cell-padding-inline: 12px;
        }
        :host([row-cards]) .mdc-data-table__header-cell--icon,
        :host([row-cards]) .mdc-data-table__cell--icon {
          min-width: 52px;
          flex: 0 0 52px !important;
        }
        :host([row-cards]) .mdc-data-table__header-cell--checkbox,
        :host([row-cards]) .mdc-data-table__cell--checkbox {
          width: 48px;
          min-width: 48px;
        }
        :host([row-cards]) .group-header {
          height: 40px;
          padding-top: 0;
        }
        /* A row card holds one line of name and one of secondary text, so a
           long name with a status chip never grows past 60 px. */
        :host([row-cards][narrow]) .primary {
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 1;
          white-space: normal;
          overflow-wrap: anywhere;
        }
        /* Rows rise in once, when the list first shows. Only the first eight
           follow each other; a row the virtualizer recycles on scroll never
           animates, and reduced motion shows the final state. */
        @media (prefers-reduced-motion: no-preference) {
          /* Rows are picked by their row index and never by their position
             among siblings: a position selector makes the browser restyle
             every row whenever the virtualizer adds or removes one. */
          :host([row-enter])
            .mdc-data-table__row[aria-rowindex]:not(.group-header-row):not(
              .sticky-group-header
            ):not(.empty-row):is(
              [aria-rowindex="2"],
              [aria-rowindex="3"],
              [aria-rowindex="4"],
              [aria-rowindex="5"],
              [aria-rowindex="6"],
              [aria-rowindex="7"],
              [aria-rowindex="8"],
              [aria-rowindex="9"]
            ) {
            animation: list-row-rise 0.5s cubic-bezier(0.2, 1.5, 0.3, 1) both;
            animation-delay: calc((var(--_row-index, 1) - 1) * 45ms);
          }
          :host([row-enter]) .mdc-data-table__row[aria-rowindex="2"] {
            --_row-index: 1;
          }
          :host([row-enter]) .mdc-data-table__row[aria-rowindex="3"] {
            --_row-index: 2;
          }
          :host([row-enter]) .mdc-data-table__row[aria-rowindex="4"] {
            --_row-index: 3;
          }
          :host([row-enter]) .mdc-data-table__row[aria-rowindex="5"] {
            --_row-index: 4;
          }
          :host([row-enter]) .mdc-data-table__row[aria-rowindex="6"] {
            --_row-index: 5;
          }
          :host([row-enter]) .mdc-data-table__row[aria-rowindex="7"] {
            --_row-index: 6;
          }
          :host([row-enter]) .mdc-data-table__row[aria-rowindex="8"] {
            --_row-index: 7;
          }
          :host([row-enter]) .mdc-data-table__row[aria-rowindex="9"] {
            --_row-index: 8;
          }
        }
        /* The virtualizer places rows with transform, so the rise uses the
           separate translate property */
        @keyframes list-row-rise {
          from {
            opacity: 0;
            translate: 0 12px;
          }
          to {
            opacity: 1;
            translate: 0 0;
          }
        }
        :host([row-cards])
          .mdc-data-table__row.mdc-data-table__row--selected::before {
          background: color-mix(
            in srgb,
            var(--primary-color) 14%,
            var(--card-background-color)
          );
        }
        :host([row-cards])
          .mdc-data-table__row.clickable:not(
            .mdc-data-table__row--selected
          ):hover {
          background: none;
        }
        :host([row-cards])
          .mdc-data-table__row.clickable:not(
            .mdc-data-table__row--selected
          ):hover::before {
          background: color-mix(
            in srgb,
            var(--primary-text-color) 8%,
            var(--_row-surface)
          );
        }
        :host([row-cards]) .mdc-data-table__row.group-header-row,
        :host([row-cards]) .mdc-data-table__row.sticky-group-header {
          background: var(--primary-background-color);
        }
        /* The icon of a row sits on a small tile. */
        :host([row-cards]) .mdc-data-table__cell--icon {
          position: relative;
          color: var(--primary-text-color);
        }
        :host([row-cards]) .mdc-data-table__cell--icon::before {
          content: "";
          position: absolute;
          top: 50%;
          left: 50%;
          width: var(--ha-list-row-icon-tile, 34px);
          height: var(--ha-list-row-icon-tile, 34px);
          transform: translate(-50%, -50%);
          z-index: -1;
          border-radius: var(--ha-border-radius-lg);
          background: var(--primary-background-color);
        }

        /* On a phone a row is a card, and its select mark is round. */
        :host([row-cards][narrow]) .mdc-data-table__row-checkbox {
          --ha-checkbox-border-radius: var(--ha-border-radius-circle, 50%);
        }

        .mdc-data-table__table.auto-height .scroller {
          overflow-y: hidden !important;
        }

        .mdc-data-table__table.auto-height lit-virtualizer {
          overscroll-behavior-y: auto;
        }

        .grows {
          flex-grow: 1;
          flex-shrink: 1;
        }
        .forceLTR {
          direction: ltr;
        }
        .clickable {
          cursor: pointer;
        }
        lit-virtualizer {
          contain: size layout !important;
          overscroll-behavior: contain;
        }

        lit-virtualizer:focus,
        lit-virtualizer:focus-visible {
          outline: none;
        }

        ha-checkbox {
          padding: var(--ha-space-1);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-data-table": HaDataTable;
  }

  // for fire event
  interface HASSDomEvents {
    "retry-load": undefined;
    "clear-search-and-filters": undefined;
    "filtered-rows-changed": undefined;
    "selection-changed": SelectionChangedEvent;
    "row-click": RowClickedEvent;
    "sorting-changed": SortingChangedEvent;
    "collapsed-changed": CollapsedChangedEvent;
  }
}
