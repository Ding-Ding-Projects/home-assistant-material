import {
  mdiArrowDown,
  mdiArrowUp,
  mdiDeleteClock,
  mdiInformationOutline,
  mdiMenuDown,
  mdiSlopeUphill,
  mdiUnfoldLessHorizontal,
  mdiUnfoldMoreHorizontal,
} from "@mdi/js";

import "@home-assistant/webawesome/dist/components/divider/divider";
import type { HassEntity } from "home-assistant-js-websocket";
import type { ContextType } from "@lit/context";
import {
  css,
  type CSSResultGroup,
  html,
  LitElement,
  nothing,
  type PropertyValues,
} from "lit";
import { customElement, property, query, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { consume } from "../../../../common/decorators/consume";
import { QueryParamsController } from "../../../../common/controllers/query-params-controller";
import { transform } from "../../../../common/decorators/transform";
import type {
  HASSDomCurrentTargetEvent,
  HASSDomTargetEvent,
} from "../../../../common/dom/fire_event";
import { fireEvent } from "../../../../common/dom/fire_event";
import { computeAreaName } from "../../../../common/entity/compute_area_name";
import {
  computeDeviceName,
  getDuplicatedDeviceNames,
} from "../../../../common/entity/compute_device_name";
import { computeEntityEntryName } from "../../../../common/entity/compute_entity_name_display";
import { searchMatcher } from "../../../../common/regex/filter";
import { stringCompare } from "../../../../common/string/compare";
import type { LocalizeFunc } from "../../../../common/translations/localize";
import {
  dataTableQueryParamConfig,
  dataTableQueryParamsFromState,
  dataTableQueryStateFromUrl,
} from "../../../../common/url/data-table-query-params";
import "../../../../components/chips/ha-assist-chip";
import type {
  DataTableColumnContainer,
  SortingDirection,
} from "../../../../components/data-table/ha-data-table";
import "../../../../components/chips/ha-filter-chip";
import type { HaFilterChip } from "../../../../components/chips/ha-filter-chip";
import "../../../../components/ha-alert";
import "../../../../components/ha-button";
import "../../../../components/ha-checkbox";
import "../../../../components/ha-dropdown";
import type { HaDropdownSelectEvent } from "../../../../components/ha-dropdown";
import "../../../../components/ha-dropdown-item";
import "../../../../components/ha-icon-button";
import "../../../../components/ha-spinner";
import "../../../../components/ha-svg-icon";
import "../../../../components/input/ha-input-search";
import type { HaInputSearch } from "../../../../components/input/ha-input-search";
import type {
  StatisticsMetaData,
  StatisticsValidationResult,
} from "../../../../data/recorder";
import {
  clearStatistics,
  StatisticMeanType,
  updateStatisticsIssues,
  validateStatistics,
} from "../../../../data/recorder";
import { getStatisticIds } from "../../../../data/recorder_statistic_ids";
import {
  apiContext,
  formattersContext,
  internationalizationContext,
  registriesContext,
  statesContext,
} from "../../../../data/context";
import { KeyboardShortcutMixin } from "../../../../mixins/keyboard-shortcut-mixin";
import { haStyle } from "../../../../resources/styles";
import type {
  HomeAssistantFormatters,
  HomeAssistantRegistries,
} from "../../../../types";
import { showConfirmationDialog } from "../../../../dialogs/generic/show-dialog-box";
import { fixStatisticsIssue } from "./fix-statistics";
import { showStatisticsAdjustSumDialog } from "./show-dialog-statistics-adjust-sum";
import { showStatisticsClearRangeDialog } from "./show-dialog-statistics-clear-range";

const FIX_ISSUES_ORDER: Record<StatisticsValidationResult["type"], number> = {
  no_state: 0,
  entity_no_longer_recorded: 1,
  entity_not_recorded: 1,
  state_class_removed: 2,
  units_changed: 3,
  mean_type_changed: 4,
};

const FIXABLE_ISSUES: StatisticsValidationResult["type"][] = [
  "no_state",
  "entity_no_longer_recorded",
  "state_class_removed",
  "units_changed",
  "mean_type_changed",
];

// Problems where the statistic cannot be recorded at all are shown as errors,
// the rest as warnings
const ERROR_ISSUES: StatisticsValidationResult["type"][] = [
  "no_state",
  "entity_no_longer_recorded",
];

type StatisticData = StatisticsMetaData & {
  issues?: StatisticsValidationResult[];
  state?: HassEntity;
  selectable?: boolean;
};

type DisplayedStatisticData = StatisticData & {
  displayName: string;
  device?: string;
  device_full?: string;
  area?: string;
  issues_string?: string;
};

interface StatisticGroup {
  id: string;
  label: string;
  rows: DisplayedStatisticData[];
}

@customElement("tools-statistics")
class HaPanelDevStatistics extends KeyboardShortcutMixin(LitElement) {
  @property({ type: Boolean, reflect: true }) public narrow = false;

  @state() private _data: StatisticData[] = [] as StatisticsMetaData[];

  @state() private _loading = true;

  @state() private _error?: string;

  @state() private _filter = "";

  @state() private _onlyProblems = false;

  @state() private _source = "";

  @state() private _selected: string[] = [];

  @state() private _sortColumn?: string;

  @state() private _sortDirection: SortingDirection = null;

  @state() private _groupColumn?: string;

  @state() private _collapsedGroups: string[] = [];

  @state()
  @consume({ context: apiContext, subscribe: true })
  private _api!: ContextType<typeof apiContext>;

  @state()
  @consume({ context: internationalizationContext, subscribe: true })
  private _i18n!: ContextType<typeof internationalizationContext>;

  @state()
  @consume({ context: registriesContext, subscribe: true })
  private _registries!: ContextType<typeof registriesContext>;

  @state()
  @consume({ context: formattersContext, subscribe: true })
  @transform<
    HomeAssistantFormatters,
    HomeAssistantFormatters["formatEntityName"]
  >({
    transformer: ({ formatEntityName }) => formatEntityName,
  })
  private _formatEntityName!: HomeAssistantFormatters["formatEntityName"];

  @state()
  @consume({ context: statesContext, subscribe: true })
  private _states!: ContextType<typeof statesContext>;

  @query("ha-input-search") private _searchInput!: HaInputSearch;

  // The search, sort and grouping are kept in the page address. Nothing is
  // stored, so opening the page again without params, like from another tools
  // tab, keeps what was picked and writes it back
  private _queryParams = new QueryParamsController(
    this,
    dataTableQueryParamConfig,
    {
      enabled: () => true,
      navigated: () => this._applyUrl(),
    }
  );

  protected willUpdate(changedProps: PropertyValues<this>) {
    super.willUpdate(changedProps);

    if (!this.hasUpdated) {
      this._validateStatistics();
      this._applyUrl();
    }
  }

  // The ways to sort and group, with the names they have in the address
  private _columns = memoizeOne(
    (localize: LocalizeFunc): DataTableColumnContainer => ({
      displayName: {
        title: localize(
          "ui.panel.config.tools.tabs.statistics.data_table.name"
        ),
        sortable: true,
        urlName: "name",
      },
      statistic_id: {
        title: localize(
          "ui.panel.config.tools.tabs.statistics.data_table.statistic_id"
        ),
        sortable: true,
      },
      statistics_unit_of_measurement: {
        title: localize(
          "ui.panel.config.tools.tabs.statistics.data_table.statistics_unit"
        ),
        sortable: true,
        urlName: "unit",
      },
      source: {
        title: localize(
          "ui.panel.config.tools.tabs.statistics.data_table.source"
        ),
        sortable: true,
        groupable: true,
        urlName: "source",
      },
      issues_string: {
        title: localize(
          "ui.panel.config.tools.tabs.statistics.data_table.issue"
        ),
        sortable: true,
        groupable: true,
        urlName: "issue",
      },
      device_full: {
        title: localize("ui.panel.config.entities.picker.headers.device"),
        sortable: true,
        groupable: true,
        urlName: "device",
      },
      area: {
        title: localize(
          "ui.panel.config.tools.tabs.statistics.data_table.area"
        ),
        sortable: true,
        groupable: true,
        urlName: "area",
      },
    })
  );

  private _displayData = memoizeOne(
    (
      data: StatisticData[],
      localize: LocalizeFunc,
      entities: HomeAssistantRegistries["entities"],
      devices: HomeAssistantRegistries["devices"],
      areas: HomeAssistantRegistries["areas"],
      formatEntityName: HomeAssistantFormatters["formatEntityName"],
      language: string
    ): DisplayedStatisticData[] => {
      const duplicatedDeviceNames = getDuplicatedDeviceNames(devices);

      return (
        data
          .map((item) => {
            const entry = entities[item.statistic_id];
            const device = entry?.device_id
              ? devices[entry.device_id]
              : undefined;
            const areaId = entry?.area_id || device?.area_id;
            const area = areaId ? areas[areaId] : undefined;

            const entityName = entry
              ? computeEntityEntryName(entry)
              : undefined;
            const deviceName = device ? computeDeviceName(device) : undefined;
            const areaName = area ? computeAreaName(area) : undefined;

            return {
              ...item,
              displayName:
                entityName ||
                deviceName ||
                (item.state ? formatEntityName(item.state) : undefined) ||
                item.name ||
                item.statistic_id,
              device: deviceName,
              device_full: deviceName
                ? duplicatedDeviceNames.has(deviceName) && areaName
                  ? `${deviceName} (${areaName})`
                  : deviceName
                : undefined,
              area: areaName,
              issues_string: item.issues
                ?.map(
                  (issue) =>
                    localize(
                      `ui.panel.config.tools.tabs.statistics.issues.${issue.type}`,
                      issue.data
                    ) || issue.type
                )
                .join(" "),
            };
          })
          // Statistics with a problem first, then by name, until a sort is
          // picked
          .sort((a, b) => {
            const problems = Number(!!b.issues) - Number(!!a.issues);
            return (
              problems ||
              stringCompare(a.statistic_id, b.statistic_id, language)
            );
          })
      );
    }
  );

  private _visibleRows = memoizeOne(
    (
      rows: DisplayedStatisticData[],
      filter: string,
      onlyProblems: boolean,
      source: string,
      sortColumn: string | undefined,
      sortDirection: SortingDirection,
      language: string
    ): DisplayedStatisticData[] => {
      const matches = searchMatcher(filter);
      const filtered = rows.filter(
        (row) =>
          (!onlyProblems || !!row.issues) &&
          (!source || row.source === source) &&
          (!filter.trim() ||
            [
              row.statistic_id,
              row.displayName,
              row.device,
              row.area,
              row.statistics_unit_of_measurement,
              row.source,
              row.issues_string,
            ].some((value) => !!value && matches(value)))
      );
      if (!sortColumn || !sortDirection) {
        return filtered;
      }
      const factor = sortDirection === "desc" ? -1 : 1;
      const key = sortColumn as keyof DisplayedStatisticData;
      return [...filtered].sort(
        (a, b) =>
          factor *
          stringCompare(String(a[key] ?? ""), String(b[key] ?? ""), language)
      );
    }
  );

  private _groups = memoizeOne(
    (
      rows: DisplayedStatisticData[],
      groupColumn: string | undefined,
      noIssueLabel: string,
      language: string
    ): StatisticGroup[] | undefined => {
      if (!groupColumn) {
        return undefined;
      }
      const key = groupColumn as keyof DisplayedStatisticData;
      const groups = new Map<string, StatisticGroup>();
      for (const row of rows) {
        const value = row[key];
        const label =
          typeof value === "string" && value
            ? value
            : groupColumn === "issues_string"
              ? noIssueLabel
              : "—";
        let group = groups.get(label);
        if (!group) {
          group = { id: label, label, rows: [] };
          groups.set(label, group);
        }
        group.rows.push(row);
      }
      return [...groups.values()].sort((a, b) =>
        stringCompare(a.label, b.label, language)
      );
    }
  );

  private _sources = memoizeOne((data: StatisticData[]): string[] =>
    [...new Set(data.map((item) => item.source).filter(Boolean))].sort()
  );

  // Memoized, so render and the select buttons share one result
  private _currentRows(): DisplayedStatisticData[] {
    const rows = this._displayData(
      this._data,
      this._i18n.localize,
      this._registries.entities,
      this._registries.devices,
      this._registries.areas,
      this._formatEntityName,
      this._i18n.locale.language
    );
    return this._visibleRows(
      rows,
      this._filter,
      this._onlyProblems,
      this._source,
      this._sortColumn,
      this._sortDirection,
      this._i18n.locale.language
    );
  }

  private _renderSortMenu(localize: LocalizeFunc) {
    const columns = this._columns(localize);
    return html`
      <ha-dropdown @wa-select=${this._handleSortBy}>
        <ha-assist-chip
          slot="trigger"
          .label=${localize("ui.components.subpage-data-table.sort_by", {
            sortColumn: this._sortColumn
              ? ` ${columns[this._sortColumn]?.title}`
              : "",
          })}
        >
          <ha-svg-icon slot="trailing-icon" .path=${mdiMenuDown}></ha-svg-icon>
        </ha-assist-chip>
        ${Object.entries(columns).map(([id, column]) =>
          column.sortable
            ? html`
                <ha-dropdown-item
                  .value=${id}
                  .selected=${id === this._sortColumn}
                >
                  ${
                    this._sortColumn === id
                      ? html`<ha-svg-icon
                          slot="details"
                          .path=${
                            this._sortDirection === "desc"
                              ? mdiArrowDown
                              : mdiArrowUp
                          }
                        ></ha-svg-icon>`
                      : nothing
                  }
                  ${column.title}
                </ha-dropdown-item>
              `
            : nothing
        )}
      </ha-dropdown>
    `;
  }

  private _renderGroupMenu(localize: LocalizeFunc) {
    const columns = this._columns(localize);
    return html`
      <ha-dropdown @wa-select=${this._handleGroupBy}>
        <ha-assist-chip
          slot="trigger"
          .label=${localize("ui.components.subpage-data-table.group_by", {
            groupColumn: this._groupColumn
              ? ` ${columns[this._groupColumn]?.title}`
              : "",
          })}
        >
          <ha-svg-icon slot="trailing-icon" .path=${mdiMenuDown}></ha-svg-icon>
        </ha-assist-chip>
        ${Object.entries(columns).map(([id, column]) =>
          column.groupable
            ? html`
                <ha-dropdown-item
                  .value=${id}
                  .selected=${id === this._groupColumn}
                >
                  ${column.title}
                </ha-dropdown-item>
              `
            : nothing
        )}
        <ha-dropdown-item
          value="none"
          .selected=${this._groupColumn === undefined}
        >
          ${localize("ui.components.subpage-data-table.dont_group_by")}
        </ha-dropdown-item>
        <wa-divider></wa-divider>
        <ha-dropdown-item
          value="collapse_all"
          .disabled=${this._groupColumn === undefined}
        >
          <ha-svg-icon
            slot="icon"
            .path=${mdiUnfoldLessHorizontal}
          ></ha-svg-icon>
          ${localize("ui.components.subpage-data-table.collapse_all_groups")}
        </ha-dropdown-item>
        <ha-dropdown-item
          value="expand_all"
          .disabled=${this._groupColumn === undefined}
        >
          <ha-svg-icon
            slot="icon"
            .path=${mdiUnfoldMoreHorizontal}
          ></ha-svg-icon>
          ${localize("ui.components.subpage-data-table.expand_all_groups")}
        </ha-dropdown-item>
      </ha-dropdown>
    `;
  }

  private _renderGroup(group: StatisticGroup, localize: LocalizeFunc) {
    const collapsed = this._collapsedGroups.includes(group.id);
    return html`
      <section class="group">
        <button
          type="button"
          class="group-header"
          aria-expanded=${collapsed ? "false" : "true"}
          .groupId=${group.id}
          @click=${this._toggleGroup}
        >
          <ha-svg-icon
            class=${collapsed ? "chevron collapsed" : "chevron"}
            .path=${mdiMenuDown}
          ></ha-svg-icon>
          <span class="group-label">${group.label}</span>
          <span class="group-count">${group.rows.length}</span>
        </button>
        ${
          collapsed
            ? nothing
            : html`<ul class="rows">
                ${group.rows.map((row) => this._renderRow(row, localize))}
              </ul>`
        }
      </section>
    `;
  }

  protected render() {
    const localize = this._i18n.localize;
    const visible = this._currentRows();
    const sources = this._sources(this._data);
    const groups = this._groups(
      visible,
      this._groupColumn,
      localize("ui.panel.config.tools.tabs.statistics.no_issue"),
      this._i18n.locale.language
    );

    return html`
      <div class="page">
        <div class="toolbar">
          <ha-input-search
            .label=${localize(
              "ui.panel.config.tools.tabs.statistics.search_statistics"
            )}
            .value=${this._filter}
            @input=${this._handleSearchChange}
            @blur=${this._flushUrl}
          ></ha-input-search>
          ${this._renderSortMenu(localize)} ${this._renderGroupMenu(localize)}
          <ha-filter-chip
            .label=${localize(
              "ui.panel.config.tools.tabs.statistics.with_problems"
            )}
            .selected=${this._onlyProblems}
            @click=${this._toggleProblems}
          ></ha-filter-chip>
          ${
            sources.length > 1
              ? html`<ha-dropdown @wa-select=${this._sourceSelected}>
                  <ha-assist-chip
                    slot="trigger"
                    .label=${localize(
                      "ui.panel.config.tools.tabs.statistics.source_filter",
                      {
                        source:
                          this._source ||
                          localize(
                            "ui.panel.config.tools.tabs.statistics.source_any"
                          ),
                      }
                    )}
                  >
                    <ha-svg-icon
                      slot="trailing-icon"
                      .path=${mdiMenuDown}
                    ></ha-svg-icon>
                  </ha-assist-chip>
                  <ha-dropdown-item value="" .selected=${this._source === ""}>
                    ${localize(
                      "ui.panel.config.tools.tabs.statistics.source_any"
                    )}
                  </ha-dropdown-item>
                  ${sources.map(
                    (source) => html`
                      <ha-dropdown-item
                        .value=${source}
                        .selected=${this._source === source}
                      >
                        ${source}
                      </ha-dropdown-item>
                    `
                  )}
                </ha-dropdown>`
              : nothing
          }
        </div>

        ${this._selected.length ? this._renderSelectionBar() : nothing}
        ${
          this._error
            ? html`<ha-alert alert-type="error">${this._error}</ha-alert>`
            : nothing
        }
        ${
          this._loading
            ? html`<div class="state"><ha-spinner></ha-spinner></div>`
            : !visible.length
              ? html`<p class="state">
                  ${localize(
                    "ui.panel.config.tools.tabs.statistics.data_table.no_statistics"
                  )}
                </p>`
              : html`
                  <div class="headers" aria-hidden="true">
                    <span class="check"></span>
                    <span class="id">
                      ${localize(
                        "ui.panel.config.tools.tabs.statistics.data_table.name"
                      )}
                    </span>
                    <span class="unit">
                      ${localize(
                        "ui.panel.config.tools.tabs.statistics.data_table.statistics_unit"
                      )}
                    </span>
                    <span class="source">
                      ${localize(
                        "ui.panel.config.tools.tabs.statistics.data_table.source"
                      )}
                    </span>
                    <span class="problem">
                      ${localize(
                        "ui.panel.config.tools.tabs.statistics.data_table.issue"
                      )}
                    </span>
                    <span class="actions"></span>
                  </div>
                  ${
                    groups
                      ? groups.map((group) =>
                          this._renderGroup(group, localize)
                        )
                      : html`<ul class="rows">
                          ${visible.map((row) =>
                            this._renderRow(row, localize)
                          )}
                        </ul>`
                  }
                `
        }

        <div class="tip">
          <ha-svg-icon .path=${mdiInformationOutline}></ha-svg-icon>
          <span>
            ${localize("ui.panel.config.tools.tabs.statistics.footer_tip")}
          </span>
        </div>
      </div>
    `;
  }

  private _renderSelectionBar() {
    const localize = this._i18n.localize;
    return html`
      <div class="selection-bar">
        <span>
          ${localize("ui.components.subpage-data-table.selected", {
            selected: this._selected.length,
          })}
        </span>
        <div class="selection-actions">
          <ha-button
            appearance="plain"
            size="small"
            @click=${this._selectAllVisible}
          >
            ${localize("ui.components.subpage-data-table.select_all")}
          </ha-button>
          <ha-button
            appearance="plain"
            size="small"
            @click=${this._selectAllProblems}
          >
            ${localize(
              "ui.panel.config.tools.tabs.statistics.data_table.select_all_issues"
            )}
          </ha-button>
          <ha-button appearance="plain" size="small" @click=${this._selectNone}>
            ${localize("ui.components.subpage-data-table.select_none")}
          </ha-button>
          <ha-button
            variant="danger"
            appearance="filled"
            size="small"
            @click=${this._clearSelected}
          >
            ${localize("ui.panel.config.tools.tabs.statistics.delete_selected")}
          </ha-button>
        </div>
      </div>
    `;
  }

  private _renderRow(row: DisplayedStatisticData, localize: LocalizeFunc) {
    const fixable = row.issues?.some((issue) =>
      FIXABLE_ISSUES.includes(issue.type)
    );
    return html`
      <li class="row">
        <span class="check">
          <ha-checkbox
            .checked=${this._selected.includes(row.statistic_id)}
            .value=${row.statistic_id}
            aria-label=${row.displayName}
            @change=${this._rowSelectionChanged}
          ></ha-checkbox>
        </span>
        <span class="id">
          <button
            type="button"
            class="statistic-id"
            .disabled=${!(row.statistic_id in this._states)}
            @click=${this._rowClicked}
            .statisticId=${row.statistic_id}
          >
            ${row.statistic_id}
          </button>
          ${
            row.displayName !== row.statistic_id
              ? html`<span class="name">${row.displayName}</span>`
              : nothing
          }
        </span>
        <span class="unit">${row.statistics_unit_of_measurement || "—"}</span>
        <span class="source">${row.source || "—"}</span>
        <span class="problem">
          ${
            row.issues?.length
              ? row.issues
                  .slice()
                  .sort(
                    (a, b) =>
                      (FIX_ISSUES_ORDER[a.type] ?? 99) -
                      (FIX_ISSUES_ORDER[b.type] ?? 99)
                  )
                  .map(
                    (issue) =>
                      html`<span
                        class="pill ${
                          ERROR_ISSUES.includes(issue.type)
                            ? "error"
                            : "warning"
                        }"
                        >${
                          localize(
                            `ui.panel.config.tools.tabs.statistics.fix_issue.${issue.type}.title`
                          ) || issue.type
                        }</span
                      >`
                  )
              : localize("ui.panel.config.tools.tabs.statistics.no_issue")
          }
        </span>
        <span class="actions">
          ${
            row.issues
              ? html`<ha-button
                  appearance="filled"
                  size="small"
                  @click=${this._fixIssue}
                  .data=${row.issues}
                >
                  ${localize(
                    fixable
                      ? "ui.panel.config.tools.tabs.statistics.fix_issue.fix"
                      : "ui.panel.config.tools.tabs.statistics.fix_issue.info"
                  )}
                </ha-button>`
              : nothing
          }
          <ha-icon-button
            .label=${localize(
              "ui.panel.config.tools.tabs.statistics.clear_range.title"
            )}
            .path=${mdiDeleteClock}
            .statistic=${row}
            @click=${this._showStatisticsClearRangeDialog}
          ></ha-icon-button>
          ${
            row.has_sum
              ? html`<ha-icon-button
                  .label=${localize(
                    "ui.panel.config.tools.tabs.statistics.adjust_sum"
                  )}
                  .path=${mdiSlopeUphill}
                  .statistic=${row}
                  @click=${this._showStatisticsAdjustSumDialog}
                ></ha-icon-button>`
              : nothing
          }
        </span>
      </li>
    `;
  }

  private _handleSearchChange(ev: HASSDomTargetEvent<HaInputSearch>) {
    if (this._filter === ev.target.value) {
      return;
    }
    this._filter = ev.target.value ?? "";
    this._writeUrl(true);
  }

  // A link with table params wins over what was picked before
  private _applyUrl() {
    const searchParams = this._queryParams.searchParams();

    const linked = searchParams
      ? dataTableQueryStateFromUrl(
          searchParams,
          this._columns(this._i18n.localize)
        )
      : undefined;

    if (linked) {
      this._filter = linked.search;

      if (linked.sorting) {
        this._sortColumn = linked.sorting.column;
        this._sortDirection = linked.sorting.direction;
      }

      if (linked.groupColumn) {
        this._groupColumn = linked.groupColumn;
      }
    }

    this._writeUrl();
  }

  private _flushUrl() {
    this._queryParams.flush();
  }

  private _writeUrl(debounced = false) {
    this._queryParams.write(
      dataTableQueryParamsFromState(
        this._columns(this._i18n.localize),
        this._filter,
        this._sortColumn,
        this._sortDirection,
        this._groupColumn
      ),
      debounced
    );
  }

  private _handleSortBy(ev: HaDropdownSelectEvent) {
    ev.preventDefault(); // keep dropdown open
    const columnId = ev.detail.item.value;
    if (!this._sortDirection || this._sortColumn !== columnId) {
      this._sortDirection = "asc";
    } else if (this._sortDirection === "asc") {
      this._sortDirection = "desc";
    } else {
      this._sortDirection = "asc";
    }
    this._sortColumn = columnId;
    this._writeUrl();
  }

  private _handleGroupBy(ev: HaDropdownSelectEvent) {
    const action = ev.detail.item.value;
    if (!action) {
      return;
    }
    switch (action) {
      case "collapse_all":
        this._collapsedGroups =
          this._groups(
            this._currentRows(),
            this._groupColumn,
            this._i18n.localize(
              "ui.panel.config.tools.tabs.statistics.no_issue"
            ),
            this._i18n.locale.language
          )?.map((group) => group.id) ?? [];
        return;
      case "expand_all":
        this._collapsedGroups = [];
        return;
      case "none":
        this._setGroupColumn();
        return;
      default:
        this._setGroupColumn(action);
    }
  }

  private _setGroupColumn(columnId?: string) {
    this._groupColumn = columnId;
    this._collapsedGroups = [];
    this._writeUrl();
  }

  private _toggleGroup(ev: HASSDomCurrentTargetEvent<HTMLElement>) {
    const id = (ev.currentTarget as HTMLElement & { groupId: string }).groupId;
    this._collapsedGroups = this._collapsedGroups.includes(id)
      ? this._collapsedGroups.filter((item) => item !== id)
      : [...this._collapsedGroups, id];
  }

  private _toggleProblems(ev: Event) {
    this._onlyProblems = (ev.currentTarget as HaFilterChip).selected;
  }

  private _sourceSelected(ev: HaDropdownSelectEvent) {
    this._source = ev.detail.item.value ?? "";
  }

  private _rowSelectionChanged(ev: Event) {
    const checkbox = ev.currentTarget as HTMLInputElement;
    const id = checkbox.value;
    this._selected = checkbox.checked
      ? [...this._selected.filter((item) => item !== id), id]
      : this._selected.filter((item) => item !== id);
  }

  private _selectAllVisible() {
    this._selected = this._currentRows().map((row) => row.statistic_id);
  }

  private _selectAllProblems() {
    this._selected = this._currentRows()
      .filter((row) => row.issues)
      .map((row) => row.statistic_id);
  }

  private _selectNone() {
    this._selected = [];
  }

  private _showStatisticsAdjustSumDialog(
    ev: HASSDomCurrentTargetEvent<HTMLElement & { statistic: StatisticData }>
  ) {
    ev.stopPropagation();
    showStatisticsAdjustSumDialog(this, {
      statistic: ev.currentTarget.statistic,
    });
  }

  private _showStatisticsClearRangeDialog(
    ev: HASSDomCurrentTargetEvent<
      HTMLElement & { statistic: DisplayedStatisticData }
    >
  ) {
    ev.stopPropagation();
    const statistic = ev.currentTarget.statistic;
    showStatisticsClearRangeDialog(this, {
      statistic,
      name: statistic.displayName,
    });
  }

  private _rowClicked(ev: HASSDomCurrentTargetEvent<HTMLElement>) {
    const id = (ev.currentTarget as HTMLElement & { statisticId: string })
      .statisticId;
    if (id in this._states) {
      fireEvent(this, "hass-more-info", { entityId: id });
    }
  }

  private async _validateStatistics() {
    this._error = undefined;
    try {
      const [statisticIds, issues] = await Promise.all([
        getStatisticIds(this._api),
        validateStatistics(this._api),
      ]);

      updateStatisticsIssues(this._api);

      const statsIds = new Set();

      const data: StatisticData[] = statisticIds.map((statistic) => {
        statsIds.add(statistic.statistic_id);
        return {
          ...statistic,
          state: this._states[statistic.statistic_id],
          issues: issues[statistic.statistic_id],
        };
      });

      Object.keys(issues).forEach((statisticId) => {
        if (!statsIds.has(statisticId)) {
          data.push({
            statistic_id: statisticId,
            statistics_unit_of_measurement: "",
            source: "",
            state: this._states[statisticId],
            issues: issues[statisticId],
            mean_type: StatisticMeanType.NONE,
            has_sum: false,
            unit_class: null,
          });
        }
      });
      this._data = data;
      // Drop selections of statistics that are gone
      this._selected = this._selected.filter((id) => statsIds.has(id));
    } catch (err) {
      this._error = this._i18n.localize(
        "ui.panel.config.tools.tabs.statistics.load_failed",
        { error: err instanceof Error ? err.message : String(err) }
      );
    } finally {
      this._loading = false;
    }
  }

  private _clearSelected = async () => {
    if (!this._selected.length) {
      return;
    }

    const deletableIds = this._selected;

    await showConfirmationDialog(this, {
      title: this._i18n.localize(
        "ui.panel.config.tools.tabs.statistics.multi_delete.title"
      ),
      text: html`${this._i18n.localize(
        "ui.panel.config.tools.tabs.statistics.multi_delete.info_text",
        { statistic_count: deletableIds.length }
      )}`,
      confirmText: this._i18n.localize("ui.common.delete"),
      destructive: true,
      confirm: async () => {
        await clearStatistics(this._api, deletableIds);
        this._selected = [];
        this._validateStatistics();
      },
    });
  };

  private _fixIssue = async (
    ev: HASSDomCurrentTargetEvent<
      HTMLElement & { data: StatisticsValidationResult[] }
    >
  ) => {
    const issues = [...ev.currentTarget.data].sort(
      (itemA, itemB) =>
        (FIX_ISSUES_ORDER[itemA.type] ?? 99) -
        (FIX_ISSUES_ORDER[itemB.type] ?? 99)
    );
    const issue = issues[0];
    await fixStatisticsIssue(this, issue);
    this._validateStatistics();
  };

  protected supportedShortcuts(): SupportedShortcuts {
    return {
      f: () => this._searchInput.focus(),
    };
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        :host {
          display: block;
          user-select: initial;
        }

        .page {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-3);
          padding: var(--ha-space-4);
          max-width: 1400px;
          margin: 0 auto;
          box-sizing: border-box;
        }

        .toolbar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-3);
        }

        .toolbar ha-input-search {
          flex: 1;
          min-width: 220px;
          max-width: 420px;
        }

        ha-assist-chip {
          --ha-assist-chip-container-shape: 10px;
          --ha-assist-chip-container-color: var(--card-background-color);
          --ha-assist-chip-trailing-space: 8px;
        }

        .selection-bar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: var(--ha-space-2);
          padding: var(--ha-space-2) var(--ha-space-4);
          border-radius: var(--ha-border-radius-xl);
          background: var(--secondary-background-color);
        }

        .selection-actions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-1);
        }

        .state {
          display: flex;
          justify-content: center;
          margin: 0;
          padding: var(--ha-space-8) var(--ha-space-4);
          color: var(--secondary-text-color);
          text-align: center;
        }

        .headers,
        .row {
          display: grid;
          grid-template-columns:
            40px minmax(0, 3fr) minmax(60px, 1fr) minmax(80px, 1.2fr)
            minmax(0, 2.4fr) auto;
          align-items: center;
          gap: var(--ha-space-3);
          padding: 0 var(--ha-space-4);
        }

        .headers {
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-s);
        }

        .rows {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
        }

        .row {
          min-height: 64px;
          padding-block: var(--ha-space-2);
          border-radius: var(--ha-border-radius-xl);
          background: var(--card-background-color);
          content-visibility: auto;
          contain-intrinsic-size: auto 64px;
        }

        .group {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
        }

        .group-header {
          display: flex;
          align-items: center;
          gap: var(--ha-space-2);
          padding: var(--ha-space-1) var(--ha-space-2);
          border: none;
          background: none;
          color: var(--primary-text-color);
          font-family: inherit;
          font-size: var(--ha-font-size-m);
          font-weight: var(--ha-font-weight-medium);
          text-align: start;
          cursor: pointer;
        }

        .group-label {
          min-width: 0;
          overflow-wrap: anywhere;
        }

        .group-count {
          padding: 0 var(--ha-space-2);
          border-radius: var(--ha-border-radius-pill);
          background: var(--secondary-background-color);
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-s);
        }

        .chevron {
          flex: none;
          transition: transform 150ms ease;
        }

        .chevron.collapsed {
          transform: rotate(-90deg);
        }

        @media (prefers-reduced-motion: reduce) {
          .chevron {
            transition: none;
          }
        }

        .id {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        .statistic-id {
          padding: 0;
          border: none;
          background: none;
          color: var(--primary-text-color);
          font-family: var(--ha-font-family-code);
          font-size: var(--ha-font-size-m);
          font-weight: var(--ha-font-weight-bold);
          text-align: start;
          overflow-wrap: anywhere;
          cursor: pointer;
        }

        .statistic-id:disabled {
          cursor: default;
        }

        .name {
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-s);
          overflow-wrap: anywhere;
        }

        .unit,
        .source {
          overflow-wrap: anywhere;
        }

        .problem {
          display: flex;
          flex-wrap: wrap;
          gap: var(--ha-space-1);
          min-width: 0;
        }

        .pill {
          padding: 2px var(--ha-space-3);
          border-radius: var(--ha-border-radius-pill);
          font-size: var(--ha-font-size-s);
          font-weight: var(--ha-font-weight-medium);
        }

        .pill.warning {
          background: var(--ha-color-fill-warning-quiet-resting, #ffe08a);
          color: var(--ha-color-on-warning-normal, #5c4300);
        }

        .pill.error {
          background: var(--ha-color-fill-danger-quiet-resting, #f9d6d2);
          color: var(--ha-color-on-danger-normal, #7a1a12);
        }

        .actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: var(--ha-space-1);
        }

        .tip {
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
          padding: var(--ha-space-3) var(--ha-space-4);
          border-radius: var(--ha-border-radius-xl);
          background: var(--secondary-background-color);
          color: var(--secondary-text-color);
        }

        .tip ha-svg-icon {
          flex: none;
        }

        :host([narrow]) .headers {
          display: none;
        }

        :host([narrow]) .row {
          grid-template-columns: 40px minmax(0, 1fr) auto;
          grid-template-areas:
            "check id actions"
            ". unit unit"
            ". source source"
            ". problem problem";
          row-gap: var(--ha-space-1);
        }

        :host([narrow]) .check {
          grid-area: check;
        }
        :host([narrow]) .id {
          grid-area: id;
        }
        :host([narrow]) .unit {
          grid-area: unit;
        }
        :host([narrow]) .source {
          grid-area: source;
        }
        :host([narrow]) .problem {
          grid-area: problem;
        }
        :host([narrow]) .actions {
          grid-area: actions;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "tools-statistics": HaPanelDevStatistics;
  }
}
