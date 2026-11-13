import memoizeOne from "memoize-one";
import "@home-assistant/webawesome/dist/components/divider/divider";
import { ResizeController } from "@lit-labs/observers/resize-controller";
import type { ContextType } from "@lit/context";
import {
  mdiArrowDown,
  mdiArrowUp,
  mdiChevronDown,
  mdiChevronUp,
  mdiClose,
  mdiFilterVariant,
  mdiExportVariant,
  mdiFilterVariantRemove,
  mdiFormatListChecks,
  mdiMenuDown,
  mdiTableCog,
  mdiUnfoldLessHorizontal,
  mdiUnfoldMoreHorizontal,
} from "@mdi/js";
import type { PropertyValues, TemplateResult } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import { canShowPage } from "../common/config/can_show_page";
import { QueryParamsController } from "../common/controllers/query-params-controller";
import { consume } from "../common/decorators/consume";
import { fireEvent, type HASSDomTargetEvent } from "../common/dom/fire_event";
import {
  dataTableQueryParamConfig,
  dataTableQueryParamsFromState,
  dataTableQueryStateFromUrl,
} from "../common/url/data-table-query-params";
import "../components/chips/ha-assist-chip";
import { GROUP_ACTIONS_SLOT_PREFIX } from "../components/data-table/ha-data-table";
import { tablePatternSamples } from "../components/data-table/pattern-samples";
import type {
  DataTableColumnContainer,
  DataTableRowData,
  HaDataTable,
  SortingDirection,
} from "../components/data-table/ha-data-table";
import "../components/data-table/ha-data-table-select-rules";
import { showDataTableSettingsDialog } from "../components/data-table/show-dialog-data-table-settings";
import type { SelectRuleField } from "../common/select-by-rule/select-by-rule";
import "../components/ha-adaptive-dialog";
import "../components/ha-button";
import "../components/ha-dialog-footer";
import "../components/ha-dropdown";
import type { HaDropdownSelectEvent } from "../components/ha-dropdown";
import "../components/ha-dropdown-item";
import "../components/ha-filter-pane-chip";
import "../components/ha-icon-button";
import "../components/ha-svg-icon";
import "../components/input/ha-input-search";
import type { HaInputSearch } from "../components/input/ha-input-search";
import "../components/layout/ha-collapsible-statistics";
import type { CollapsibleStatistic } from "../components/layout/collapsible-statistics-logic";
import { statisticsStorageKey } from "../components/layout/collapsible-statistics-logic";
import "../components/layout/ha-split-divider";
import type { SplitDividerMoveDetail } from "../components/layout/ha-split-divider";
import {
  clampSize,
  parseStoredState,
  resolveStoredSize,
  shouldRestoreFiltersOpen,
} from "../components/layout/split-panels-logic";
import {
  safeGetStored,
  safeSetStored,
} from "../common/preferences/safe-storage";
import {
  configContext,
  entitiesContext,
  internationalizationContext,
} from "../data/context";
import { KeyboardShortcutMixin } from "../mixins/keyboard-shortcut-mixin";
import type { HomeAssistant, Route } from "../types";
import "./hass-tabs-subpage";
import type { PageNavigation } from "./hass-tabs-subpage";

// The filter pane can be dragged between these widths (pixels)
const PANE_DEFAULT_WIDTH = 250;
const PANE_MIN_WIDTH = 200;
const PANE_MAX_WIDTH = 560;

/**
 * List page layout with a heading, a search row and a data table.
 *
 * Opt-in additions (a page that sets none of them looks and behaves as before):
 *
 * Slots
 * - `heading-action`: a primary action, such as a "Create" button, shown at the
 *   end of the page heading, level with the title. Shown on wide layouts only,
 *   where the heading is shown; on narrow layouts use the `fab` slot.
 * - `filter-chips`: filter chips shown on the search row next to the search
 *   field. When it has content, the search field keeps a fixed width so the
 *   chips sit beside it and the remaining tools stay at the end of the row.
 *
 * Properties
 * - `statistics`: up to five `{ label, value }` numbers shown in a strip above
 *   the table that folds to one summary line. The choice is kept per page.
 * - `footer-text` (`footerText`): a line of text under the list, such as a
 *   count. Setting it reserves a footer row under the list.
 * - `footer-select` (`footerSelect`): adds a "Select" button at the end of the
 *   footer row that enters selection mode. Needs `selectable`.
 * - `always-show-checkboxes` (`alwaysShowCheckboxes`): show the row checkboxes
 *   all the time instead of only in selection mode. Needs `selectable`. The
 *   selection bar then appears once `selected` is above zero, or after the
 *   footer "Select" button is used, and the header selection chip is hidden.
 */
@customElement("hass-tabs-subpage-data-table")
export class HaTabsSubpageDataTable extends KeyboardShortcutMixin(LitElement) {
  // Unread, kept for callers that still pass it until they move to contexts
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state()
  @consume({ context: configContext, subscribe: true })
  private _hassConfig!: ContextType<typeof configContext>;

  @state()
  @consume({ context: entitiesContext, subscribe: true })
  private _entities!: ContextType<typeof entitiesContext>;

  @state()
  @consume({ context: internationalizationContext, subscribe: true })
  private _i18n!: ContextType<typeof internationalizationContext>;

  @property({ attribute: "is-wide", type: Boolean }) public isWide = false;

  /**
   * Set while the page shows the bulk selection bar over the bottom of the
   * list, so the last rows can scroll clear of it.
   */
  @property({ attribute: "bulk-bar", type: Boolean, reflect: true })
  public bulkBar = false;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @property({ type: Boolean, attribute: "main-page" }) public mainPage = false;

  @property({ attribute: false }) public initialCollapsedGroups: string[] = [];

  /**
   * Object with the columns.
   * @type {Object}
   */
  @property({ type: Object }) public columns: DataTableColumnContainer = {};

  /**
   * Data to show in the table.
   * @type {Array}
   */
  @property({ type: Array }) public data: DataTableRowData[] = [];

  /**
   * Should rows be selectable.
   * @type {Boolean}
   */
  @property({ type: Boolean }) public selectable = false;

  /**
   * Keep selected rows that a search or filter hides when the header checkbox
   * changes. Only for pages that show how many selected rows are hidden.
   */
  @property({ type: Boolean, attribute: "keep-hidden-selection" })
  public keepHiddenSelection = false;

  /**
   * Should rows be clickable.
   * @type {Boolean}
   */
  @property({ type: Boolean }) public clickable = false;

  /**
   * Do we need to add padding for a fab.
   * @type {Boolean}
   */
  @property({ attribute: "has-fab", type: Boolean, reflect: true })
  public hasFab = false;

  /**
   * Show tabs on top or at bottom (narrow) of the page.
   * @type {Boolean}
   */
  @property({ attribute: "show-tabs", type: Boolean, reflect: true })
  public showTabs = false;

  /**
   * Add an extra row at the bottom of the data table
   * @type {TemplateResult}
   */
  @property({ attribute: false }) public appendRow?: TemplateResult;

  /**
   * The id of every row is an entity id, so the element menu can offer the
   * entity's own entries on a row.
   * @type {Boolean}
   */
  @property({ attribute: "entity-rows", type: Boolean })
  public entityRows = false;

  /**
   * Field with a unique id per entry in data.
   * @type {String}
   */
  // eslint-disable-next-line lit/no-native-attributes
  @property({ type: String }) public id = "id";

  /**
   * String to filter the data in the data table on.
   * @type {String}
   */
  @property({ type: String }) public filter = "";

  @property({ attribute: false }) public searchLabel?: string;

  /**
   * One line under the page title that says what the list holds. Without
   * it, the line gives the number of rows.
   */
  @property({ attribute: false }) public summary?: string;

  /**
   * A line under the list, such as a count. Reserves a footer row.
   */
  @property({ attribute: "footer-text" }) public footerText?: string;

  /**
   * Add a "Select" button to the footer row that enters selection mode.
   * @type {Boolean}
   */
  @property({ attribute: "footer-select", type: Boolean })
  public footerSelect = false;

  /**
   * Show the row checkboxes all the time, not only in selection mode.
   * @type {Boolean}
   */
  @property({ attribute: "always-show-checkboxes", type: Boolean })
  public alwaysShowCheckboxes = false;

  /**
   * Up to five labelled numbers, such as total, shown and selected, shown in a
   * strip above the table that can be folded to one line. Without it no strip
   * is shown. The folded state is kept in this browser for each page.
   */
  @property({ attribute: false }) public statistics?: CollapsibleStatistic[];

  @state() private _hasFilterChips = false;

  /** How many rows the table shows after the search and the filters. */
  @state() private _matchingRows?: number;

  // The width of the filter pane and whether the summary line is folded away,
  // both kept in this browser for each page
  @state() private _paneWidth?: number;

  @state() private _summaryHidden = false;

  private _layoutKeyLoaded?: string;

  @state() private _pageTitle = "";

  @query("hass-tabs-subpage") private _page?: HTMLElement;

  /**
   * Number of active filters.
   * @type {Number}
   */
  @property({ type: Number }) public filters?;

  /**
   * Number of current selections.
   * @type {Number}
   */
  @property({ type: Number }) public selected?;

  /**
   * What path to use when the back button is pressed.
   * @type {String}
   * @attr back-path
   */
  @property({ type: String, attribute: "back-path" }) public backPath?: string;

  /**
   * Function to call when the back button is pressed.
   * @type {() => void}
   */
  @property({ attribute: false }) public backCallback?: () => void;

  /**
   * String to show when there are no records in the data table.
   * @type {String}
   */
  @property({ attribute: false }) public noDataText?: string;

  /**
   * Hides the data table and show an empty message.
   * @type {Boolean}
   */
  @property({ type: Boolean }) public empty = false;

  /**
   * Show a loading state instead of the empty message until data is ready.
   * @type {Boolean}
   */
  @property({ type: Boolean }) public loading = false;

  /**
   * Error to show below the column headings, with a retry action, when loading the table's data failed.
   * Pass `true` to show the default message.
   */
  @property({ attribute: false }) public loadError?: boolean | string;

  @property({ attribute: false }) public route!: Route;

  /**
   * Array of tabs to show on the page.
   * @type {Array}
   */
  @property({ attribute: false }) public tabs: PageNavigation[] = [];

  /**
   * Show the filter menu.
   * @type {Boolean}
   */
  @property({ attribute: "has-filters", type: Boolean })
  public hasFilters = false;

  @property({ attribute: "show-filters", type: Boolean })
  public showFilters = false;

  @property({ attribute: false }) public initialSorting?: {
    column: string;
    direction: SortingDirection;
  };

  @property({ attribute: false }) public initialGroupColumn?: string;

  @property({ attribute: false }) public groupOrder?: string[];

  @property({ attribute: false }) public columnOrder?: string[];

  @property({ attribute: false }) public hiddenColumns?: string[];

  /**
   * Extra fields "Select by rule" can use, besides what the columns and the
   * rows already offer (text columns, labels, area, integration, domain and
   * the enabled, hidden and unavailable states).
   */
  @property({ attribute: false }) public selectFields?: SelectRuleField[];

  @state() private _ruleOpen = false;

  @state() private _ruleRows: DataTableRowData[] = [];

  @state() private _ruleCurrent: string[] = [];

  /**
   * Keep search, sorting and grouping in the URL (`search`, `sort`,
   * `direction` and `group`). Params in the URL win over the initial values.
   * Opt in per page, as some pages use query params for other things.
   */
  @property({ attribute: "sync-url", type: Boolean }) public syncUrl = false;

  @state() private _sortColumn?: string;

  @state() private _sortDirection: SortingDirection = null;

  @state() private _groupColumn?: string;

  @state() private _selectMode = false;

  @query("ha-data-table", true) private _dataTable!: HaDataTable;

  @query("ha-input-search") private _searchInput!: HaInputSearch;

  protected supportedShortcuts(): SupportedShortcuts {
    return {
      f: () => this._searchInput.focus(),
    };
  }

  private _showPaneController = new ResizeController(this, {
    callback: (entries) => entries[0]?.contentRect.width > 750,
  });

  // The URL is read once the table is opted in and has its columns, and only
  // written after that, so a link isn't overwritten before it is applied
  private _urlRead = false;

  private _urlWritePending = false;

  private _typedSearch?: string;

  private _restoreInitial = false;

  private _queryParams = new QueryParamsController(
    this,
    dataTableQueryParamConfig,
    {
      enabled: () => this.syncUrl,
      navigated: () => {
        if (this._urlRead) {
          // Opened again without params, like from the sidebar
          this._restoreInitial =
            this._queryParams.searchParams()?.toString() === "";
          this._applyUrl();
        }
      },
    }
  );

  public clearSelection() {
    this._dataTable.clearSelection();
  }

  /** How many rows the search and filters leave in the table now. */
  public get filteredRowCount(): number {
    return this._dataTable?.filteredRowCount ?? 0;
  }

  /** The identifiers of the selectable rows the table shows now. */
  public getFilteredRowIds(): string[] {
    return this._dataTable?.getFilteredRowIds() ?? [];
  }

  /** The identifiers of the ticked rows. */
  public getCheckedRowIds(): string[] {
    return this._dataTable?.getCheckedRowIds() ?? [];
  }

  /** Replaces the ticked rows with exactly these identifiers. */
  public setCheckedRowIds(ids: string[]): void {
    this._dataTable?.setCheckedRowIds(ids);
  }

  private get _hasFooter(): boolean {
    return !!this.footerText || (this.footerSelect && this.selectable);
  }

  private get _rowsSelectable(): boolean {
    return this._selectMode || (this.selectable && this.alwaysShowCheckboxes);
  }

  private get _showSelectionBar(): boolean {
    return (
      this._selectMode ||
      (this.selectable && this.alwaysShowCheckboxes && !!this.selected)
    );
  }

  protected willUpdate(changedProperties: PropertyValues) {
    this.toggleAttribute("has-footer", this._hasFooter);
    this.toggleAttribute("floating-selection", this._showSelectionBar);

    this._loadLayout();

    if (
      changedProperties.has("tabs") ||
      changedProperties.has("_hassConfig") ||
      changedProperties.has("_entities")
    ) {
      this.showTabs =
        this.tabs.filter((page) =>
          canShowPage({ ...this._hassConfig, entities: this._entities }, page)
        ).length > 1;
    }

    if (!this.hasUpdated) {
      if (this.initialGroupColumn && this.columns[this.initialGroupColumn]) {
        this._setGroupColumn(this.initialGroupColumn);
      }

      if (this.initialSorting && this.columns[this.initialSorting.column]) {
        this._sortColumn = this.initialSorting.column;
        this._sortDirection = this.initialSorting.direction;
      }
    }

    // Done here, after the page has set the initial sorting and grouping it
    // stored
    if (this._restoreInitial) {
      this._restoreInitial = false;
      this._restoreInitialState();
    }

    if (this.syncUrl && !this._urlRead && Object.keys(this.columns).length) {
      this._urlRead = true;
      this._applyUrl();
    }
  }

  protected updated(changedProperties: PropertyValues) {
    this._watchChipRow();
    const typed = this.filter === this._typedSearch;
    this._typedSearch = undefined;
    if (!this.syncUrl || !this._urlRead) {
      this._urlWritePending = false;
      return;
    }
    const sortingOrGroupingChanged =
      this._urlWritePending ||
      changedProperties.has("_sortColumn") ||
      changedProperties.has("_sortDirection") ||
      changedProperties.has("_groupColumn");

    this._urlWritePending = false;
    if (sortingOrGroupingChanged || changedProperties.has("filter")) {
      // Typing is written once it pauses, a search set by the page or a link
      // straight away
      this._writeUrl(!sortingOrGroupingChanged && typed);
    }
  }

  protected render(): TemplateResult {
    const localize = this._i18n.localize;
    const showPane = this._showPaneController.value ?? !this.narrow;
    const filterButton = this.hasFilters
      ? html`<ha-filter-pane-chip
          .label=${localize("ui.components.subpage-data-table.filters")}
          .path=${mdiFilterVariant}
          .count=${this.filters}
          .active=${!!this.filters}
          @click=${this._toggleFilters}
        ></ha-filter-pane-chip>`
      : nothing;

    const selectModeBtn =
      this.selectable && !this._selectMode && !this.alwaysShowCheckboxes
        ? html`<ha-assist-chip
            class="has-dropdown select-mode-chip"
            .active=${this._selectMode}
            @click=${this._enableSelectMode}
            .title=${localize(
              "ui.components.subpage-data-table.enter_selection_mode"
            )}
          >
            <ha-svg-icon slot="icon" .path=${mdiFormatListChecks}></ha-svg-icon>
          </ha-assist-chip>`
        : nothing;

    const searchBar = html`<ha-input-search
      appearance="outlined"
      .value=${this.filter}
      @input=${this._handleSearchChange}
      @blur=${this._flushUrl}
      .placeholder=${this.searchLabel}
      .patternSamples=${this._patternSamples(this.data, this.columns)}
    >
    </ha-input-search>`;

    const sortByMenu = Object.values(this.columns).find((col) => col.sortable)
      ? html`
          <ha-dropdown @wa-select=${this._handleSortBy}>
            <ha-assist-chip
              slot="trigger"
              .label=${localize("ui.components.subpage-data-table.sort_by", {
                sortColumn:
                  this._sortColumn && this.columns[this._sortColumn]
                    ? ` ${this.columns[this._sortColumn].title || this.columns[this._sortColumn].label}`
                    : "",
              })}
            >
              <ha-svg-icon
                slot="trailing-icon"
                .path=${mdiMenuDown}
              ></ha-svg-icon>
            </ha-assist-chip>
            ${Object.entries(this.columns).map(([id, column]) =>
              column.sortable
                ? html`
                    <ha-dropdown-item
                      .value=${id}
                      class=${classMap({ selected: id === this._sortColumn })}
                    >
                      ${
                        this._sortColumn === id
                          ? html`
                              <ha-svg-icon
                                slot="end"
                                .path=${
                                  this._sortDirection === "desc"
                                    ? mdiArrowDown
                                    : mdiArrowUp
                                }
                              ></ha-svg-icon>
                            `
                          : nothing
                      }
                      ${column.title || column.label}
                    </ha-dropdown-item>
                  `
                : nothing
            )}
          </ha-dropdown>
        `
      : nothing;

    const groupByMenu = Object.values(this.columns).find((col) => col.groupable)
      ? html`
          <ha-dropdown @wa-select=${this._handleGroupBy}>
            <ha-assist-chip
              .label=${localize("ui.components.subpage-data-table.group_by", {
                groupColumn:
                  this._groupColumn && this.columns[this._groupColumn]
                    ? ` ${this.columns[this._groupColumn].title || this.columns[this._groupColumn].label}`
                    : "",
              })}
              slot="trigger"
            >
              <ha-svg-icon
                slot="trailing-icon"
                .path=${mdiMenuDown}
              ></ha-svg-icon
            ></ha-assist-chip>
            ${Object.entries(this.columns).map(([id, column]) =>
              column.groupable
                ? html`
                    <ha-dropdown-item
                      .value=${id}
                      .selected=${id === this._groupColumn}
                      class=${classMap({ selected: id === this._groupColumn })}
                    >
                      ${column.title || column.label}
                    </ha-dropdown-item>
                  `
                : nothing
            )}
            <ha-dropdown-item
              value="reset"
              class=${classMap({ selected: !this._groupColumn })}
            >
              ${localize("ui.components.subpage-data-table.dont_group_by")}
            </ha-dropdown-item>
            <wa-divider></wa-divider>
            <ha-dropdown-item
              value="collapse_all"
              .disabled=${!this._groupColumn}
            >
              <ha-svg-icon
                slot="icon"
                .path=${mdiUnfoldLessHorizontal}
              ></ha-svg-icon>
              ${localize(
                "ui.components.subpage-data-table.collapse_all_groups"
              )}
            </ha-dropdown-item>
            <ha-dropdown-item
              value="expand_all"
              .disabled=${!this._groupColumn}
            >
              <ha-svg-icon
                slot="icon"
                .path=${mdiUnfoldMoreHorizontal}
              ></ha-svg-icon>
              ${localize("ui.components.subpage-data-table.expand_all_groups")}
            </ha-dropdown-item>
          </ha-dropdown>
        `
      : nothing;

    const settingsButton = html`<ha-assist-chip
      class="has-dropdown select-mode-chip"
      @click=${this._openSettings}
      .title=${localize("ui.components.subpage-data-table.settings")}
    >
      <ha-svg-icon slot="icon" .path=${mdiTableCog}></ha-svg-icon>
    </ha-assist-chip>`;

    const exportButton = html`<ha-assist-chip
      class="has-dropdown select-mode-chip"
      @click=${this._openExport}
      .title=${localize("ui.components.subpage-data-table.export")}
    >
      <ha-svg-icon slot="icon" .path=${mdiExportVariant}></ha-svg-icon>
    </ha-assist-chip>`;

    // The page title is shown once, in the page header. The count line sits
    // right under it, in the header's `subtitle` slot.
    const summaryRow =
      this._pageTitle && !this.narrow && !(this.empty && !this.loading)
        ? html`<div class="summary-row" slot="subtitle">
            <p id="list-summary" ?hidden=${this._summaryHidden}>
              ${
                this.summary ??
                localize("ui.components.subpage-data-table.summary", {
                  count: this.data.length,
                })
              }
            </p>
            <button
              type="button"
              class="summary-toggle"
              aria-expanded=${this._summaryHidden ? "false" : "true"}
              aria-controls="list-summary"
              aria-label=${localize(
                "ui.components.subpage-data-table.summary_toggle"
              )}
              title=${localize(
                this._summaryHidden
                  ? "ui.components.subpage-data-table.show_summary"
                  : "ui.components.subpage-data-table.hide_summary"
              )}
              @click=${this._toggleSummary}
            >
              <ha-svg-icon
                .path=${this._summaryHidden ? mdiChevronDown : mdiChevronUp}
              ></ha-svg-icon>
            </button>
          </div>`
        : nothing;

    const heading = this._pageTitle
      ? html`<div class="page-heading">
          <slot name="heading-action"></slot>
        </div>`
      : nothing;

    // The page counts rows after its own filters; the search text is applied
    // inside the table, so "shown" follows what the table reports.
    const statistics = this.statistics?.map((item) =>
      item.id === "shown" && this._matchingRows !== undefined
        ? { ...item, value: this._matchingRows }
        : item
    );
    const statisticsStrip = statistics?.length
      ? html`<ha-collapsible-statistics
          .statistics=${statistics}
          .storageKey=${statisticsStorageKey(this.route?.prefix) ?? ""}
        ></ha-collapsible-statistics>`
      : nothing;

    const chipsSlot = html`<slot
      name="filter-chips"
      @slotchange=${this._chipsSlotChanged}
    ></slot>`;

    const footer = this._hasFooter
      ? html`<div class="list-footer">
          <span class="list-footer-text">${this.footerText}</span>
          ${
            this.footerSelect && this.selectable && !this._showSelectionBar
              ? html`<ha-assist-chip
                  class="footer-select"
                  .label=${localize("ui.components.subpage-data-table.select")}
                  @click=${this._enableSelectMode}
                >
                  <ha-svg-icon
                    slot="icon"
                    .path=${mdiFormatListChecks}
                  ></ha-svg-icon>
                </ha-assist-chip>`
              : nothing
          }
        </div>`
      : nothing;

    return html`
      <hass-tabs-subpage
        style=${styleMap({
          "--sidepane-width": this._paneWidth
            ? `${this._clampedPaneWidth(this._paneWidth)}px`
            : undefined,
        })}
        .isWide=${this.isWide}
        .backPath=${this.backPath}
        .backCallback=${this.backCallback}
        .route=${this.route}
        .tabs=${this.tabs}
        .mainPage=${this.mainPage}
        .pane=${showPane && this.showFilters}
        .contentHeading=${!this.narrow && !(this.empty && !this.loading)}
        @sorting-changed=${this._sortingChanged}
        @page-title-changed=${this._pageTitleChanged}
      >
        ${summaryRow}
        ${
          this.showFilters
            ? !showPane
              ? nothing
              : html`<div class="pane" slot="pane">
                  <div class="table-header">
                    <ha-filter-pane-chip
                      .label=${localize(
                        "ui.components.subpage-data-table.filters"
                      )}
                      .path=${mdiFilterVariant}
                      active
                      @click=${this._toggleFilters}
                    ></ha-filter-pane-chip>
                    ${
                      this.filters
                        ? html`<ha-icon-button
                            .path=${mdiFilterVariantRemove}
                            @click=${this._clearFilters}
                            .label=${localize(
                              "ui.components.subpage-data-table.clear_filter"
                            )}
                          ></ha-icon-button>`
                        : nothing
                    }
                  </div>
                  <div class="pane-content">
                    <slot name="filter-pane"></slot>
                  </div>
                  <ha-split-divider
                    class="pane-divider"
                    .value=${this._clampedPaneWidth(
                      this._paneWidth ?? PANE_DEFAULT_WIDTH
                    )}
                    .min=${PANE_MIN_WIDTH}
                    .max=${this._paneMaxWidth}
                    .total=${this.offsetWidth}
                    .resetText=${localize("ui.components.split_panels.reset")}
                    .defaultValue=${PANE_DEFAULT_WIDTH}
                    .label=${localize(
                      "ui.components.subpage-data-table.resize_filters"
                    )}
                    @split-divider-move=${this._paneResized}
                  ></ha-split-divider>
                </div>`
            : nothing
        }
        ${
          this.empty && !this.loading
            ? html`<div class="center">
                <slot name="empty">${this.noDataText}</slot>
              </div>`
            : html`<slot name="toolbar-icon" slot="toolbar-icon"></slot>
                ${
                  this.narrow
                    ? html`
                        <div slot="header">
                          <slot name="header">
                            <div class="search-toolbar">${searchBar}</div>
                          </slot>
                        </div>
                      `
                    : ""
                }
                <ha-data-table
                  .narrow=${this.narrow}
                  row-cards
                  .columns=${this.columns}
                  .data=${this.data}
                  .loading=${this.loading}
                  .noDataText=${this.noDataText}
                  .loadError=${this.loadError}
                  .filter=${this.filter}
                  .selectable=${this._rowsSelectable}
                  .keepHiddenSelection=${this.keepHiddenSelection}
                  .id=${this.id}
                  .entityRows=${this.entityRows}
                  .clickable=${this.clickable}
                  .appendRow=${this.appendRow}
                  .sortColumn=${this._sortColumn}
                  .sortDirection=${this._sortDirection}
                  .groupColumn=${this._groupColumn}
                  .groupOrder=${this.groupOrder}
                  .initialCollapsedGroups=${this.initialCollapsedGroups}
                  .columnOrder=${this.columnOrder}
                  .hiddenColumns=${this.hiddenColumns}
                  @filtered-rows-changed=${this._tableRowsChanged}
                >
                  ${this._groupActionsSlots.map(
                    (slot) => html`<slot name=${slot} slot=${slot}></slot>`
                  )}
                  ${
                    !this.narrow
                      ? html`
                          <div slot="header">
                            ${heading}${statisticsStrip}
                            <slot name="top-header"></slot>
                            <slot name="header">
                              <div
                                class=${classMap({
                                  "table-header": true,
                                  "with-chips": this._hasFilterChips,
                                })}
                              >
                                ${
                                  this.hasFilters && !this.showFilters
                                    ? html`${filterButton}`
                                    : nothing
                                }${selectModeBtn}${searchBar}${chipsSlot}${
                                  this._hasFilterChips
                                    ? html`<div class="chips-spacer"></div>`
                                    : nothing
                                }${groupByMenu}${sortByMenu}${settingsButton}${exportButton}
                              </div>
                            </slot>
                          </div>
                        `
                      : html`
                          <div slot="header">
                            ${statisticsStrip}
                            <slot name="top-header"></slot>
                          </div>
                          <div slot="header-row" class="narrow-header-row">
                            ${
                              this.hasFilters && !this.showFilters
                                ? html`${filterButton}`
                                : nothing
                            }
                            ${selectModeBtn}${chipsSlot}
                            <div class="flex"></div>
                            ${groupByMenu}${sortByMenu}${settingsButton}
                          </div>
                        `
                  }
                </ha-data-table>
                ${footer}`
        }
        <div slot="fab"><slot name="fab"></slot></div>
      </hass-tabs-subpage>
      ${
        this._showSelectionBar
          ? html`<div
              class="selection-bar"
              role="toolbar"
              aria-label=${localize(
                "ui.components.subpage-data-table.selected",
                { selected: this.selected || "0" }
              )}
            >
              <div class="selection-controls">
                <ha-icon-button
                  .path=${mdiClose}
                  @click=${this._disableSelectMode}
                  .label=${localize(
                    "ui.components.subpage-data-table.exit_selection_mode"
                  )}
                ></ha-icon-button>
                ${
                  this.selected !== undefined
                    ? html`<p role="status">
                        ${localize(
                          "ui.components.subpage-data-table.selected",
                          {
                            selected: this.selected || "0",
                          }
                        )}
                      </p>`
                    : nothing
                }
                <ha-dropdown @wa-select=${this._handleSelect}>
                  <ha-assist-chip
                    .label=${localize("ui.components.subpage-data-table.select")}
                    slot="trigger"
                  >
                    <ha-svg-icon
                      slot="icon"
                      .path=${mdiFormatListChecks}
                    ></ha-svg-icon>
                    <ha-svg-icon
                      slot="trailing-icon"
                      .path=${mdiMenuDown}
                    ></ha-svg-icon
                  ></ha-assist-chip>
                  <ha-dropdown-item value="all">
                    ${localize("ui.components.subpage-data-table.select_all")}
                  </ha-dropdown-item>
                  <ha-dropdown-item value="none">
                    ${localize("ui.components.subpage-data-table.select_none")}
                  </ha-dropdown-item>
                  <ha-dropdown-item value="rule">
                    ${localize("ui.components.subpage-data-table.select_by_rule")}
                  </ha-dropdown-item>
                  <wa-divider></wa-divider>
                  <ha-dropdown-item value="disable_select_mode">
                    ${localize(
                      "ui.components.subpage-data-table.exit_selection_mode"
                    )}
                  </ha-dropdown-item>
                </ha-dropdown>
              </div>
              <div class="center-vertical">
                <slot name="selection-bar"></slot>
              </div>
            </div>`
          : nothing
      }
      ${
        this._ruleOpen
          ? html`<ha-data-table-select-rules
              open
              .localize=${localize}
              .rows=${this._ruleRows}
              .columns=${this.columns}
              .hiddenColumns=${this.hiddenColumns}
              .selectFields=${this.selectFields}
              .idKey=${this.id}
              .current=${this._ruleCurrent}
              storage-key=${this.route?.prefix || "default"}
              @select-by-rule-apply=${this._ruleApplied}
              @select-by-rule-closed=${this._ruleClosed}
            ></ha-data-table-select-rules>`
          : nothing
      }
      ${
        this.showFilters && !showPane
          ? html`<ha-adaptive-dialog
              open
              flexcontent
              width="full"
              header-title=${localize("ui.components.subpage-data-table.filters")}
              @closed=${this._closeFilters}
            >
              <ha-icon-button
                slot="headerNavigationIcon"
                data-dialog="close"
                .path=${mdiClose}
                .label=${localize(
                  "ui.components.subpage-data-table.close_filter"
                )}
              ></ha-icon-button>
              ${
                this.filters
                  ? html`<ha-icon-button
                      slot="headerActionItems"
                      @click=${this._clearFilters}
                      .path=${mdiFilterVariantRemove}
                      .label=${localize(
                        "ui.components.subpage-data-table.clear_filter"
                      )}
                    ></ha-icon-button>`
                  : nothing
              }
              <div class="filter-dialog-content">
                <slot name="filter-pane"></slot>
              </div>
              <ha-dialog-footer slot="footer">
                <ha-button slot="primaryAction" data-dialog="close">
                  ${localize("ui.components.subpage-data-table.show_results", {
                    number: this.data.length,
                  })}
                </ha-button>
              </ha-dialog-footer>
            </ha-adaptive-dialog>`
          : nothing
      }
    `;
  }

  private _clearFilters() {
    fireEvent(this, "clear-filter");
  }

  // A link with table params wins over what was picked before. The page is
  // told with `link` set, so it shows it without storing it as the user's
  // choice.
  private _applyUrl() {
    const searchParams = this._queryParams.searchParams();
    const linked = searchParams
      ? dataTableQueryStateFromUrl(searchParams, this.columns)
      : undefined;

    if (linked) {
      if (linked.search !== this.filter) {
        this.filter = linked.search;
        fireEvent(this, "search-changed", { value: this.filter, link: true });
      }
      if (
        linked.sorting &&
        (linked.sorting.column !== this._sortColumn ||
          linked.sorting.direction !== this._sortDirection)
      ) {
        this._sortColumn = linked.sorting.column;
        this._sortDirection = linked.sorting.direction;
        fireEvent(this, "sorting-changed", { ...linked.sorting, link: true });
      }
      if (linked.groupColumn && linked.groupColumn !== this._groupColumn) {
        this._setGroupColumn(linked.groupColumn, true);
      }
    }

    this._urlWritePending = true;
    this.requestUpdate();
  }

  private _restoreInitialState() {
    // Without a stored sort, use the column's default like a fresh load does
    const defaultColumn = Object.keys(this.columns).find(
      (columnId) => this.columns[columnId].direction
    );

    const defaultDirection = defaultColumn
      ? this.columns[defaultColumn].direction
      : undefined;

    const sorting =
      this.initialSorting && this.columns[this.initialSorting.column]
        ? this.initialSorting
        : defaultColumn && defaultDirection
          ? { column: defaultColumn, direction: defaultDirection }
          : undefined;

    this._sortColumn = sorting?.column;
    this._sortDirection = sorting?.direction ?? null;

    const groupColumn =
      this.initialGroupColumn && this.columns[this.initialGroupColumn]
        ? this.initialGroupColumn
        : "";

    if (groupColumn !== (this._groupColumn ?? "")) {
      this._setGroupColumn(groupColumn, true);
    }
  }

  private _flushUrl() {
    this._queryParams.flush();
  }

  private _writeUrl(debounced = false) {
    this._queryParams.write(
      dataTableQueryParamsFromState(
        this.columns,
        this.filter,
        this._sortColumn,
        this._sortDirection,
        this._groupColumn
      ),
      debounced
    );
  }

  private _toggleFilters() {
    this.showFilters = !this.showFilters;
    this._storeLayout();
  }

  private _closeFilters = () => {
    this.showFilters = false;
    this._storeLayout();
  };

  private get _layoutKey(): string | undefined {
    const prefix = this.route?.prefix;
    return prefix ? `list-layout:${prefix}` : undefined;
  }

  // Applies what was kept for this page once, and again if the page changes
  private _loadLayout() {
    const key = this._layoutKey;
    if (!key || key === this._layoutKeyLoaded) {
      return;
    }
    this._layoutKeyLoaded = key;
    const stored = parseStoredState(safeGetStored<unknown>(key));
    if (stored) {
      const width = resolveStoredSize(stored, this.offsetWidth);
      this._paneWidth = width ? this._clampedPaneWidth(width) : undefined;
      // Open only where the side pane is shown; on a narrow width the
      // choice would open the full-width dialog as soon as the page loads
      this.showFilters = shouldRestoreFiltersOpen(
        stored.collapsed,
        this._showPaneController.value ?? !this.narrow
      );
    }
    this._summaryHidden = safeGetStored<unknown>(`${key}:summary`) === "hidden";
  }

  private _storeLayout() {
    const key = this._layoutKey;
    if (!key) {
      return;
    }
    safeSetStored(key, {
      size: this._paneWidth ?? PANE_DEFAULT_WIDTH,
      collapsed: this.showFilters ? "" : "start",
    });
  }

  private _toggleSummary() {
    this._summaryHidden = !this._summaryHidden;
    const key = this._layoutKey;
    if (key) {
      safeSetStored(`${key}:summary`, this._summaryHidden ? "hidden" : "shown");
    }
  }

  private _paneResized(ev: CustomEvent<SplitDividerMoveDetail>) {
    ev.stopPropagation();
    const { size, committed } = ev.detail;
    // While dragging only the CSS variable moves; the size is kept on release
    this._page?.style.setProperty("--sidepane-width", `${size}px`);
    if (committed) {
      this._paneWidth = size;
      this._storeLayout();
    }
  }

  private _clampedPaneWidth(width: number): number {
    return clampSize(width, PANE_MIN_WIDTH, this._paneMaxWidth);
  }

  private get _paneMaxWidth(): number {
    // Before the page is measured there is no honest upper limit but the fixed one
    if (!this.offsetWidth) {
      return PANE_MAX_WIDTH;
    }
    return clampSize(
      Math.floor(this.offsetWidth / 2),
      PANE_MIN_WIDTH,
      PANE_MAX_WIDTH
    );
  }

  private _sortingChanged(ev) {
    this._sortDirection = ev.detail.direction;
    this._sortColumn = this._sortDirection ? ev.detail.column : undefined;
  }

  private _handleSortBy(ev: HaDropdownSelectEvent) {
    ev.preventDefault(); // keep the dropdown open

    const columnId = ev.detail.item.value;
    if (!this._sortDirection || this._sortColumn !== columnId) {
      this._sortDirection = "asc";
    } else if (this._sortDirection === "asc") {
      this._sortDirection = "desc";
    } else {
      this._sortDirection = "asc";
    }
    this._sortColumn = columnId;

    fireEvent(this, "sorting-changed", {
      column: columnId,
      direction: this._sortDirection,
    });
  }

  private _handleGroupBy(ev: HaDropdownSelectEvent) {
    const group = ev.detail.item.value;

    if (group === "reset") {
      this._setGroupColumn("");
      return;
    }
    if (group === "collapse_all") {
      this._collapseAllGroups();
      return;
    }
    if (group === "expand_all") {
      this._expandAllGroups();
      return;
    }

    this._setGroupColumn(group);
  }

  // Slots of the group actions the page supplies, passed through to the table
  @state() private _groupActionsSlots: string[] = [];

  private _groupActionsObserver = new MutationObserver(() =>
    this._updateGroupActionsSlots()
  );

  public connectedCallback(): void {
    super.connectedCallback();
    this._updateGroupActionsSlots();
    // Subtree, so slot changes on the page's children are seen too
    this._groupActionsObserver.observe(this, {
      childList: true,
      subtree: true,
      attributeFilter: ["slot"],
    });
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._groupActionsObserver.disconnect();
    this._chipRowObserver?.disconnect();
    this._chipRow?.removeEventListener("scroll", this._updateChipRowFade);
    this._chipRow = undefined;
  }

  @query(".narrow-header-row") private _narrowHeaderRow?: HTMLElement | null;

  private _chipRow?: HTMLElement;

  private _chipRowObserver?: ResizeObserver;

  /**
   * Follows the phone chip row, which scrolls sideways, so that it fades
   * where more chips wait beyond its edge and none is sliced hard at the edge.
   * The row is replaced when the layout switches between narrow and wide.
   */
  private _watchChipRow() {
    const row = this._narrowHeaderRow ?? undefined;
    if (row === this._chipRow) {
      return;
    }
    this._chipRow?.removeEventListener("scroll", this._updateChipRowFade);
    this._chipRowObserver?.disconnect();
    this._chipRow = row;
    if (!row) {
      return;
    }
    row.addEventListener("scroll", this._updateChipRowFade, { passive: true });
    if (typeof ResizeObserver !== "undefined") {
      this._chipRowObserver ??= new ResizeObserver(this._updateChipRowFade);
      this._chipRowObserver.observe(row);
      for (const child of Array.from(row.children)) {
        this._chipRowObserver.observe(child);
      }
    }
    this._updateChipRowFade();
  }

  private _updateChipRowFade = () => {
    const row = this._chipRow;
    if (!row) {
      return;
    }
    const overflows = row.scrollWidth > row.clientWidth + 1;
    const rtl = getComputedStyle(row).direction === "rtl";
    const fromStart = Math.abs(row.scrollLeft);
    const hasStart = overflows && fromStart > 1;
    const hasEnd =
      overflows && fromStart + row.clientWidth < row.scrollWidth - 1;
    // The mask is drawn in physical directions.
    row.toggleAttribute("fade-left", rtl ? hasEnd : hasStart);
    row.toggleAttribute("fade-right", rtl ? hasStart : hasEnd);
  };

  private _updateGroupActionsSlots() {
    const slots = [
      ...new Set(
        Array.from(this.children, (child) => child.slot).filter((slot) =>
          slot.startsWith(GROUP_ACTIONS_SLOT_PREFIX)
        )
      ),
    ];

    if (
      slots.length !== this._groupActionsSlots.length ||
      slots.some((slot, index) => slot !== this._groupActionsSlots[index])
    ) {
      this._groupActionsSlots = slots;
    }
  }

  private _setGroupColumn(columnId: string, link = false) {
    this._groupColumn = columnId;
    fireEvent(this, "grouping-changed", { value: columnId, link });
  }

  private _openSettings() {
    showDataTableSettingsDialog(this, {
      columns: this.columns,
      hiddenColumns: this.hiddenColumns,
      columnOrder: this.columnOrder,
      onUpdate: (
        columnOrder: string[] | undefined,
        hiddenColumns: string[] | undefined
      ) => {
        this.columnOrder = columnOrder;
        this.hiddenColumns = hiddenColumns;
        fireEvent(this, "columns-changed", { columnOrder, hiddenColumns });
      },
    });
  }

  private _collapseAllGroups = () => {
    this._dataTable.collapseAllGroups();
  };

  private _expandAllGroups = () => {
    this._dataTable.expandAllGroups();
  };

  private _enableSelectMode() {
    this._selectMode = true;
  }

  private _tableRowsChanged() {
    this._matchingRows = this._dataTable?.matchingRowCount;
  }

  private _chipsSlotChanged(ev: Event) {
    this._hasFilterChips =
      (ev.target as HTMLSlotElement).assignedNodes({ flatten: true }).length >
      0;
  }

  private _handleSelect(ev: HaDropdownSelectEvent) {
    const action = ev.detail.item.value;

    if (!action) {
      return;
    }

    switch (action) {
      case "all":
        this._selectAll();
        break;
      case "none":
        this._selectNone();
        break;
      case "rule":
        this._openRuleDialog();
        break;
      case "disable_select_mode":
        this._disableSelectMode();
        break;
    }
  }

  private _disableSelectMode = () => {
    this._selectMode = false;
    this._dataTable.clearSelection();
  };

  private _selectAll = () => {
    this._dataTable.selectAll();
  };

  private _selectNone = () => {
    this._dataTable.clearSelection();
  };

  private _openRuleDialog() {
    // Only the rows the list shows now are offered to the rules.
    const shown = new Set(this._dataTable.getFilteredRowIds());
    this._ruleRows = this.data.filter((row) => shown.has(String(row[this.id])));
    this._ruleCurrent = this._dataTable.getCheckedRowIds();
    this._ruleOpen = true;
  }

  private _ruleApplied(ev: CustomEvent<{ ids: string[] }>) {
    this._dataTable.setCheckedRowIds(ev.detail.ids);
    this._ruleOpen = false;
  }

  private _ruleClosed() {
    this._ruleOpen = false;
  }

  private _patternSamples = memoizeOne(tablePatternSamples);

  private _handleSearchChange(
    ev: InputEvent & HASSDomTargetEvent<HaInputSearch>
  ) {
    const target = ev.target as HaInputSearch;
    if (this.filter === target.value) {
      return;
    }
    this.filter = target.value ?? "";
    this._typedSearch = this.filter;
    fireEvent(this, "search-changed", { value: this.filter });
  }

  private _pageTitleChanged(ev: CustomEvent<{ title: string }>): void {
    this._pageTitle = ev.detail.title;
  }

  private _openExport(ev: Event): void {
    if (!this._page) {
      return;
    }
    fireEvent(ev.currentTarget as HTMLElement, "hass-page-tool", {
      tool: "export",
      root: this._page,
      title: this._pageTitle || document.title,
    });
  }

  static styles = css`
    :host {
      display: block;
      height: 100%;
      position: relative;
    }

    /* The title and count line live in the page header; this row only holds
       the page's primary action and takes no height without one. */
    .page-heading {
      display: flex;
      align-items: flex-start;
      justify-content: flex-end;
      gap: var(--ha-space-4);
    }
    ::slotted([slot="heading-action"]) {
      flex-shrink: 0;
      margin: var(--ha-space-4) var(--ha-space-2) 0;
    }
    .summary-row p {
      margin: var(--ha-space-1) 0 0;
      font-size: var(--ha-font-size-l);
      line-height: var(--ha-line-height-normal);
      color: var(--secondary-text-color);
    }
    /* The list sits in from the edges of the page, like the rest of it. */
    :host(:not([narrow])) ha-data-table {
      width: calc(100% - 2 * var(--ha-space-8));
      margin-inline: var(--ha-space-8);
    }

    ha-data-table {
      width: 100%;
      height: 100%;
      --data-table-border-width: 0;
      --data-table-empty-row-height: var(--safe-area-inset-bottom, 0px);
      /* Same insets as the content padding of hass-tabs-subpage */
      --data-table-inset-right: var(--safe-area-inset-right, 0px);
    }
    :host([narrow]) ha-data-table {
      --data-table-inset-left: var(--safe-area-inset-left, 0px);
    }
    /* The layout fills the window, and its header, tabs and footer take
       what they need; the table and the filter pane get the rest. */
    :host(:not([narrow])) hass-tabs-subpage {
      height: 100vh;
      height: 100dvh;
    }
    :host(:not([narrow])) ha-data-table {
      height: 100%;
      display: block;
    }
    .pane {
      height: 100%;
      display: flex;
      flex-direction: column;
      position: relative;
    }
    /* The handle sits on the inner edge of the pane, over its border */
    .pane-divider {
      position: absolute;
      inset-block: 0;
      inset-inline-end: 0;
      --ha-split-divider-size: 10px;
    }
    .summary-row {
      display: flex;
      align-items: center;
      gap: var(--ha-space-1);
    }
    .summary-row p {
      min-width: 0;
    }
    .summary-toggle {
      position: relative;
      display: grid;
      place-items: center;
      flex-shrink: 0;
      width: 28px;
      height: 28px;
      margin-top: var(--ha-space-1);
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: none;
      color: var(--secondary-text-color);
      cursor: pointer;
      --mdc-icon-size: 20px;
    }
    /* A small button with a 44 pixel touch area */
    .summary-toggle::after {
      content: "";
      position: absolute;
      inset: -8px;
    }
    .summary-toggle:hover {
      color: var(--primary-color);
    }
    .summary-toggle:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    /* Footer row under the list, only when the page sets footer-text or
       footer-select. The list gives up the row's height. */
    :host([has-footer]) ha-data-table,
    :host([has-footer]:not([narrow])) ha-data-table {
      height: calc(100% - var(--list-footer-height, 56px));
    }
    .list-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--ha-space-4);
      box-sizing: border-box;
      height: var(--list-footer-height, 56px);
      padding-inline: var(--ha-space-4);
      font-size: var(--ha-font-size-m);
      color: var(--secondary-text-color);
    }
    :host(:not([narrow])) .list-footer {
      margin-inline: var(--ha-space-8);
      padding-inline: var(--ha-space-2);
    }
    .list-footer-text {
      min-width: 0;
    }
    .footer-select {
      flex-shrink: 0;
    }
    /* A floating action button sits over the end of the footer: keep the
       Select button clear of it. On a wide page the footer gives up room at
       its end; on a narrow page Select comes first, away from the button. */
    :host([has-fab]:not([narrow])) .list-footer {
      padding-inline-end: calc(var(--ha-space-8) + 200px);
    }
    :host([has-fab][narrow]) .footer-select {
      order: -1;
    }
    /* On a phone the floating button sits over the end of the footer row.
       The footer keeps clear of it: its lines stack at the start side, in a
       slightly taller row, and the text wraps in the room left. */
    :host([has-footer][has-fab][narrow]) {
      --list-footer-height: 76px;
    }
    :host([has-fab][narrow]) .list-footer {
      flex-direction: column;
      align-items: flex-start;
      justify-content: center;
      gap: var(--ha-space-1);
      padding-inline-end: 196px;
    }
    :host([has-fab][narrow]) .list-footer-text {
      max-width: 100%;
      overflow-wrap: anywhere;
    }
    .table-header.with-chips ha-input-search {
      flex: 0 1 320px;
      min-width: 220px;
    }
    .chips-spacer {
      flex: 1;
    }
    ::slotted([slot="filter-chips"]) {
      flex-shrink: 0;
    }
    /* Last content row should keep the same padding above the fab as the fab
       has to the bottom (16px standard fab bottom padding) + the safe-area inset. */
    :host([has-fab]) ha-data-table {
      --data-table-empty-row-height: calc(
        48px + 16px * 2 + var(--safe-area-inset-bottom, 0px)
      );
    }
    /* In narrow view with tabs shown at the bottom, the tab bar already
       accounts for safe-area-inset-bottom. No extra empty-row height is needed. */
    :host([narrow][show-tabs]:not([has-fab])) ha-data-table {
      --data-table-empty-row-height: 0px;
    }
    /* Reserve space for fab + doubled narrow-mode bottom padding (28px * 2)
       when using narrow layout with bottom tabs. */
    :host([narrow][show-tabs][has-fab]) ha-data-table {
      --data-table-empty-row-height: calc(48px + 28px * 2);
    }

    /* The bulk bar floats over the bottom of the list: leave room under the
       last row for the bar, and for the bar to wrap to more lines on a phone. */
    :host([bulk-bar]) ha-data-table {
      --data-table-empty-row-height: calc(
        112px + var(--ha-phone-bar-height, 0px) +
          var(--safe-area-inset-bottom, 0px)
      ) !important;
    }
    :host([bulk-bar][narrow]) ha-data-table {
      --data-table-empty-row-height: calc(
        176px + var(--ha-phone-bar-height, 0px) +
          var(--safe-area-inset-bottom, 0px)
      ) !important;
    }

    .pane-content {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }

    :host([narrow]) hass-tabs-subpage {
      --main-title-margin: 0;
    }
    :host([narrow]) {
      --expansion-panel-summary-padding: 0 16px;
    }
    .table-header {
      display: flex;
      align-items: center;
      --mdc-shape-small: 0;
      min-height: 56px;
      width: 100%;
      justify-content: space-between;
      /* On a wide page the toolbar wraps onto a second line instead of
         running off the edge, and keeps a margin at the inline end. */
      flex-wrap: wrap;
      padding-block: var(--ha-space-1);
      padding-inline-start: var(--data-table-inset-left, 0px);
      padding-inline-end: calc(var(--data-table-inset-right, 0px) + 4px);
      gap: var(--ha-space-2);
      box-sizing: border-box;
      background: var(
        --ha-panel-toolbar-background,
        var(--primary-background-color)
      );
    }
    ha-input-search {
      flex: 1 1 240px;
      /* Wide enough for the icon, the placeholder and the pattern button */
      min-width: 220px;
    }
    @media (min-width: 871px) {
      ha-input-search {
        --ha-input-search-height: 32px;
        --ha-input-search-border-radius: 10px;
      }
    }
    .search-toolbar {
      display: flex;
      align-items: center;
      color: var(--secondary-text-color);
    }
    .search-toolbar ha-input-search {
      min-width: 0;
    }
    .filters {
      --mdc-text-field-fill-color: var(--input-fill-color);
      --mdc-text-field-idle-line-color: var(--input-idle-line-color);
      --mdc-shape-small: 4px;
      --text-field-overflow: initial;
      display: flex;
      justify-content: flex-end;
      color: var(--primary-text-color);
    }
    .active-filters {
      color: var(--primary-text-color);
      position: relative;
      display: flex;
      align-items: center;
      padding: 2px 2px 2px 8px;
      margin-left: 4px;
      margin-inline-start: 4px;
      margin-inline-end: initial;
      font-size: var(--ha-font-size-m);
      width: max-content;
      cursor: initial;
      direction: var(--direction);
    }
    .active-filters ha-svg-icon {
      color: var(--primary-color);
    }
    .active-filters::before {
      background-color: var(--primary-color);
      opacity: 0.12;
      border-radius: var(--ha-border-radius-sm);
      position: absolute;
      top: 0;
      right: 0;
      bottom: 0;
      left: 0;
      content: "";
    }
    .center {
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      box-sizing: border-box;
      height: 100%;
      width: 100%;
      padding: 16px;
    }

    .narrow-header-row {
      display: flex;
      align-items: center;
      min-width: 100%;
      gap: var(--ha-space-4);
      padding-left: calc(16px + var(--data-table-inset-left, 0px));
      padding-right: calc(16px + var(--data-table-inset-right, 0px));
      box-sizing: border-box;
      overflow-x: scroll;
      scrollbar-width: none;
    }

    /* The row fades where more chips wait beyond its edge. */
    .narrow-header-row[fade-left],
    .narrow-header-row[fade-right] {
      --_fade-left: 0px;
      --_fade-right: 0px;
      -webkit-mask-image: linear-gradient(
        to right,
        transparent 0,
        #000 var(--_fade-left),
        #000 calc(100% - var(--_fade-right)),
        transparent 100%
      );
      mask-image: linear-gradient(
        to right,
        transparent 0,
        #000 var(--_fade-left),
        #000 calc(100% - var(--_fade-right)),
        transparent 100%
      );
    }
    .narrow-header-row[fade-left] {
      --_fade-left: 28px;
    }
    .narrow-header-row[fade-right] {
      --_fade-right: 28px;
    }

    .narrow-header-row .flex {
      flex: 1;
      margin-inline-start: -16px;
    }

    /* The chips keep their full labels: when they do not all fit, the row
       scrolls sideways instead of cutting a label short ("Group by" must not
       become "Gr…"). */
    .narrow-header-row > :not(.flex),
    .table-header > :not(ha-input-search):not(.chips-spacer) {
      flex: none;
    }
    /* The chip is as wide as its label. Its own "100% of the parent" limit
       resolves against a parent that is itself sized by the chip, which cut
       the label short. */
    .narrow-header-row ha-assist-chip,
    .narrow-header-row ha-filter-pane-chip,
    .table-header ha-assist-chip,
    .table-header ha-filter-pane-chip {
      flex: none;
      max-width: none;
      white-space: nowrap;
    }

    /* The bulk bar floats at the bottom centre of the list, a dark rounded
       pill, and rises in when rows are ticked. On a phone it spans the width
       above the phone bar. */
    .selection-bar {
      position: absolute;
      z-index: 6;
      inset-inline: 0;
      margin-inline: auto;
      width: max-content;
      max-width: calc(100% - var(--ha-space-6));
      bottom: calc(
        var(--ha-space-6) + var(--safe-area-inset-bottom, 0px) +
          var(--ha-bulk-bar-height, 0px)
      );
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: center;
      gap: var(--ha-space-2) var(--ha-space-4);
      padding: var(--ha-space-2) var(--ha-space-4);
      box-sizing: border-box;
      border-radius: var(--ha-border-radius-xl);
      background: var(--ha-color-neutral-10, #1b1b1f);
      color: var(--ha-color-on-neutral-loud, #fff);
      box-shadow: var(--ha-shadow-overlay, 0 8px 24px rgba(0, 0, 0, 0.3));
      font-size: var(--ha-font-size-m);
      --ha-assist-chip-container-color: transparent;
      --ha-button-theme-color: currentColor;
      --ha-button-outlined-text-color: var(--ha-color-on-neutral-loud, #fff);
      --wa-color-on-normal: var(--ha-color-on-neutral-loud, #fff);
      --wa-color-on-quiet: var(--ha-color-on-neutral-loud, #fff);
      --primary-text-color: var(--ha-color-on-neutral-loud, #fff);
      --secondary-text-color: var(--ha-color-on-neutral-loud, #fff);
      --mdc-icon-button-size: 40px;
      animation: selection-bar-rise var(--ha-animation-duration-enter, 250ms)
        var(--ha-motion-spring, ease-out);
    }
    @keyframes selection-bar-rise {
      from {
        opacity: 0;
        transform: translateY(24px);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .selection-bar {
        animation: none;
      }
    }
    :host([narrow]) .selection-bar {
      inset-inline: var(--ha-space-3);
      margin-inline: 0;
      width: auto;
      max-width: none;
      bottom: calc(
        var(--ha-space-3) + var(--ha-phone-bar-visible-height, 0px) +
          var(--safe-area-inset-bottom, 0px) + var(--ha-bulk-bar-height, 0px)
      );
      justify-content: space-between;
      /* On a phone the bar is a light bottom sheet above the phone bar, with
         its actions wrapping onto a second line instead of running past 320 px. */
      background: var(--card-background-color);
      color: var(--primary-text-color);
      border-radius: var(--ha-border-radius-3xl, 28px);
      --ha-button-outlined-text-color: var(--primary-text-color);
      --wa-color-on-normal: inherit;
      --wa-color-on-quiet: inherit;
      --primary-text-color: inherit;
      --secondary-text-color: inherit;
    }
    :host([narrow]) .selection-bar .center-vertical {
      flex-wrap: wrap;
      min-width: 0;
      max-width: 100%;
    }
    :host([floating-selection]) ha-data-table {
      --data-table-empty-row-height: calc(
        112px + var(--ha-phone-bar-visible-height, 0px) +
          var(--safe-area-inset-bottom, 0px)
      );
    }
    :host([floating-selection][narrow]) ha-data-table {
      --data-table-empty-row-height: calc(
        176px + var(--ha-phone-bar-visible-height, 0px) +
          var(--safe-area-inset-bottom, 0px)
      );
    }

    .selection-controls {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
    }

    .selection-controls p {
      margin: 0;
      font-weight: var(--ha-font-weight-medium);
      white-space: nowrap;
    }

    .center-vertical {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
    }

    ha-assist-chip,
    ha-filter-pane-chip {
      --ha-assist-chip-container-shape: 10px;
      --ha-assist-chip-container-color: var(--card-background-color);
    }

    .selection-bar ha-assist-chip {
      --ha-assist-chip-container-color: transparent;
    }

    .select-mode-chip {
      --ha-assist-chip-icon-label-space: 0;
      --ha-assist-chip-trailing-space: 8px;
    }

    /* Touch targets: the toolbar chips are at least 44 px on a touch screen. */
    @media (pointer: coarse) {
      ha-assist-chip,
      ha-filter-pane-chip {
        --ha-button-height: 44px;
        min-width: 44px;
      }
      /* Chips a page puts beside the search field (Filters, Domain, Area). */
      ::slotted([slot="filter-chips"]) {
        --ha-button-height: 44px;
        --ha-assist-chip-container-height: 44px;
        min-height: 44px;
      }
    }

    ha-adaptive-dialog {
      --dialog-content-padding: 0;
      /* Fixed height so the sheet does not resize while filtering. */
      --ha-bottom-sheet-height: calc(100dvh - var(--ha-space-12));
      --ha-dialog-min-height: calc(var(--safe-height) - var(--ha-space-20));
    }

    .filter-dialog-content {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      overflow-y: auto;
    }

    ha-dropdown ha-assist-chip {
      --ha-assist-chip-trailing-space: 8px;
    }

    ha-dropdown-item.selected {
      border: 1px solid var(--primary-color);
      font-weight: var(--ha-font-weight-medium);
      color: var(--primary-color);
      background-color: var(--ha-color-fill-primary-quiet-resting);
      --icon-primary-color: var(--primary-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "hass-tabs-subpage-data-table": HaTabsSubpageDataTable;
  }

  // for fire event
  interface HASSDomEvents {
    // `link` is set when a link changed it, not the user
    "search-changed": { value: string; link?: boolean };
    "grouping-changed": { value: string; link?: boolean };
    "columns-changed": {
      columnOrder: string[] | undefined;
      hiddenColumns: string[] | undefined;
    };
    "clear-filter": undefined;
  }
}
