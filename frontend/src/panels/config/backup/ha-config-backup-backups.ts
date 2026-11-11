import {
  mdiDelete,
  mdiDotsVertical,
  mdiDownload,
  mdiHarddisk,
  mdiNas,
  mdiPlus,
  mdiUpload,
} from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { isComponentLoaded } from "../../../common/config/is_component_loaded";
import { DataTableSettingsController } from "../../../common/controllers/data-table-settings-controller";
import { QueryParamsController } from "../../../common/controllers/query-params-controller";
import { formatDateTime } from "../../../common/datetime/format_date_time";
import { relativeTime } from "../../../common/datetime/relative_time";
import { storage } from "../../../common/decorators/storage";
import { fireEvent, type HASSDomEvent } from "../../../common/dom/fire_event";
import { computeDomain } from "../../../common/entity/compute_domain";
import { navigate } from "../../../common/navigate";
import type { LocalizeFunc } from "../../../common/translations/localize";
import {
  BACKUP_LOCATIONS_FILTER,
  BACKUP_TYPE_FILTER,
  backupsFilterQueryParamConfig,
  backupsFilterQueryParams,
  backupsFilterQueryString,
  backupsLinkFromUrl,
} from "../../../common/url/backups-query-params";
import type {
  DataTableColumnContainer,
  DataTableRowData,
  RowClickedEvent,
  SelectionChangedEvent,
} from "../../../components/data-table/ha-data-table";
import "../../../components/bulk/ha-bulk-bar";
import type {
  BulkAction,
  BulkPreview,
  BulkPreviewItem,
} from "../../../components/bulk/bulk-selection";
import { splitAlreadyGone } from "../../../components/bulk/bulk-selection";
import {
  filteredTableCount,
  hiddenTableSelection,
  invertTableRows,
  selectAllTableRows,
} from "../../../components/bulk/table-selection";
import "../../../components/ha-button";
import "../../../components/ha-dropdown";
import type {
  HaDropdown,
  HaDropdownSelectEvent,
} from "../../../components/ha-dropdown";
import "../../../components/ha-dropdown-item";
import "../../../components/ha-filter-states";
import "../../../components/ha-icon";
import "../../../components/ha-icon-next";
import "../../../components/ha-spinner";
import "../../../components/ha-svg-icon";
import type {
  BackupAgent,
  BackupConfig,
  BackupContent,
} from "../../../data/backup";
import {
  compareAgents,
  computeBackupAgentName,
  computeBackupSize,
  computeBackupType,
  deleteBackup,
  fetchBackupInfo,
  generateBackup,
  generateBackupWithAutomaticSettings,
  getBackupTypes,
  isLocalAgent,
  isNetworkMountAgent,
} from "../../../data/backup";
import type { ManagerStateEvent } from "../../../data/backup_manager";
import type { CloudStatus } from "../../../data/cloud";
import type {
  DataTableFiltersValue,
  DataTableFiltersValues,
} from "../../../data/data_table_filters";
import { extractApiErrorMessage } from "../../../data/hassio/common";
import {
  showAlertDialog,
  showConfirmationDialog,
} from "../../../dialogs/generic/show-dialog-box";
import "../../../layouts/hass-tabs-subpage-data-table";
import type { HaTabsSubpageDataTable } from "../../../layouts/hass-tabs-subpage-data-table";
import { SubscribeMixin } from "../../../mixins/subscribe-mixin";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant, Route } from "../../../types";
import { brandsUrl } from "../../../util/brands-url";
import { bytesToString } from "../../../util/bytes-to-string";
import { showToast } from "../../../util/toast";
import { showGenerateBackupDialog } from "./dialogs/show-dialog-generate-backup";
import { showNewBackupDialog } from "./dialogs/show-dialog-new-backup";
import { showUploadBackupDialog } from "./dialogs/show-dialog-upload-backup";
import {
  backupPreviewItems,
  planBackupDelete,
  summarizeBackupDelete,
} from "./backup-bulk-actions";
import { downloadBackup } from "./helper/download_backup";

interface BackupRow extends DataTableRowData, BackupContent {
  formatted_type: string;
  size: number;
  agent_ids: string[];
}

@customElement("ha-config-backup-backups")
class HaConfigBackupBackups extends SubscribeMixin(LitElement) {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public cloudStatus?: CloudStatus;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: false }) public route!: Route;

  @property({ attribute: false }) public manager!: ManagerStateEvent;

  @property({ attribute: false }) public backups: BackupContent[] = [];

  @property({ attribute: false }) public config?: BackupConfig;

  @property({ attribute: false }) public agents: BackupAgent[] = [];

  @state() private _selected: string[] = [];

  @state()
  private _filters: DataTableFiltersValues = {};

  @storage({
    storage: "sessionStorage",
    key: "backups-table-filters",
    state: false,
    subscribe: false,
  })
  private _storageFilters: DataTableFiltersValues = {};

  private _tableSettings = new DataTableSettingsController(
    this,
    { grouping: "backups-table-grouping" },
    { defaultGrouping: "formatted_type" }
  );

  @storage({
    key: "backups-table-collapsed",
    state: false,
    subscribe: false,
  })
  private _activeCollapsed: string[] = [];

  @query("hass-tabs-subpage-data-table", true)
  private _dataTable!: HaTabsSubpageDataTable;

  @query("#overflow-menu") private _overflowMenu?: HaDropdown;

  private _openingOverflow = false;

  private _overflowBackup?: BackupRow;

  // The filters are kept in the URL by the page, the search, sorting and
  // grouping by the table
  private _filterParams = new QueryParamsController(
    this,
    backupsFilterQueryParamConfig,
    {
      enabled: () => true,
      navigated: () => this._applyLink(),
    }
  );

  protected willUpdate(changedProps: PropertyValues) {
    super.willUpdate(changedProps);
    if (!this.hasUpdated) {
      this._filters = this._storageFilters;
      this._applyLink();
    }
  }

  private _columns = memoizeOne(
    (
      localize: LocalizeFunc,
      maxDisplayedAgents: number
    ): DataTableColumnContainer<BackupRow> => ({
      name: {
        title: localize("ui.panel.config.backup.name"),
        main: true,
        sortable: true,
        filterable: true,
        flex: 3,
      },
      size: {
        title: localize("ui.panel.config.backup.size"),
        filterable: true,
        sortable: true,
        template: (backup) => bytesToString(backup.size),
      },
      date: {
        title: localize("ui.panel.config.backup.created"),
        direction: "desc",
        filterable: true,
        sortable: true,
        template: (backup) =>
          relativeTime(new Date(backup.date), this.hass.locale),
      },
      formatted_type: {
        title: localize("ui.panel.config.backup.backup_type"),
        filterable: true,
        sortable: true,
        groupable: true,
        urlName: "type",
      },
      locations: {
        title: localize("ui.panel.config.backup.locations"),
        showNarrow: true,
        // 24 icon size, 4 gap, 16 left and right padding
        minWidth: `${maxDisplayedAgents * 24 + (maxDisplayedAgents - 1) * 4 + 32}px`,
        template: (backup) => {
          const agentIds = backup.agent_ids;
          const displayedAgentIds =
            agentIds.length > maxDisplayedAgents
              ? [...agentIds].splice(0, maxDisplayedAgents - 1)
              : agentIds;
          const agentsMore = Math.max(
            agentIds.length - displayedAgentIds.length,
            0
          );
          return html`
            <div style="display: flex; gap: var(--ha-space-1);">
              ${displayedAgentIds.map((agentId) => {
                const name = computeBackupAgentName(
                  this.hass.localize,
                  agentId,
                  this.agents
                );
                if (isLocalAgent(agentId)) {
                  return html`
                    <ha-svg-icon
                      .path=${mdiHarddisk}
                      title=${name}
                      style="flex-shrink: 0;"
                    ></ha-svg-icon>
                  `;
                }
                if (isNetworkMountAgent(agentId)) {
                  return html`
                    <ha-svg-icon
                      .path=${mdiNas}
                      title=${name}
                      style="flex-shrink: 0;"
                    ></ha-svg-icon>
                  `;
                }
                const domain = computeDomain(agentId);
                return html`
                  <img
                    title=${name}
                    .src=${brandsUrl(
                      {
                        domain,
                        type: "icon",
                        darkOptimized: this.hass.themes?.darkMode,
                      },
                      this.hass.auth.data.hassUrl
                    )}
                    height="24"
                    crossorigin="anonymous"
                    referrerpolicy="no-referrer"
                    alt=${name}
                    slot="graphic"
                    style="flex-shrink: 0;"
                  />
                `;
              })}
              ${
                agentsMore
                  ? html`
                      <span
                        style="display: flex; align-items: center; font-size: var(--ha-font-size-m);"
                      >
                        +${agentsMore}
                      </span>
                    `
                  : nothing
              }
            </div>
          `;
        },
      },
      actions: {
        lastFixed: true,
        title: "",
        label: localize("ui.panel.config.generic.headers.actions"),
        showNarrow: true,
        type: "overflow-menu",
        template: (backup) => html`
          <ha-icon-button
            .backup=${backup}
            .label=${this.hass.localize("ui.common.overflow_menu")}
            .path=${mdiDotsVertical}
            @click=${this._toggleOverflowMenu}
          ></ha-icon-button>
        `,
      },
    })
  );

  private _groupOrder = memoizeOne(
    (
      activeGrouping: string | undefined,
      localize: LocalizeFunc,
      isHassio: boolean
    ) =>
      activeGrouping === "formatted_type"
        ? getBackupTypes(isHassio).map((type) =>
            localize(`ui.panel.config.backup.type.${type}`)
          )
        : undefined
  );

  private _toggleOverflowMenu = (ev) => {
    if (!this._overflowMenu) {
      return;
    }

    if (this._overflowMenu.anchorElement === ev.target) {
      this._overflowMenu.anchorElement = undefined;
      return;
    }
    this._openingOverflow = true;
    this._overflowMenu.anchorElement = ev.target;
    this._overflowBackup = ev.target.backup;
    this._overflowMenu.open = true;
  };

  private _overflowMenuOpened = () => {
    this._openingOverflow = false;
  };

  private _overflowMenuClosed = () => {
    // changing the anchorElement triggers a close event, ignore it
    if (this._openingOverflow || !this._overflowMenu) {
      return;
    }

    this._overflowMenu.anchorElement = undefined;
  };

  private _handleCollapseChanged(ev: CustomEvent) {
    this._activeCollapsed = ev.detail.value;
  }

  private _handleSelectionChanged(
    ev: HASSDomEvent<SelectionChangedEvent>
  ): void {
    this._selected = ev.detail.value;
  }

  private _data = memoizeOne(
    (
      backups: BackupContent[],
      filters: DataTableFiltersValues,
      localize: LocalizeFunc,
      isHassio: boolean
    ): BackupRow[] => {
      const typeFilter = filters[BACKUP_TYPE_FILTER];
      const locationFilter = filters[BACKUP_LOCATIONS_FILTER];

      let filteredBackups = backups;

      if (Array.isArray(typeFilter) && typeFilter.length) {
        filteredBackups = filteredBackups.filter((backup) => {
          const type = computeBackupType(backup, isHassio);
          return typeFilter.includes(type);
        });
      }

      if (Array.isArray(locationFilter) && locationFilter.length) {
        filteredBackups = filteredBackups.filter((backup) =>
          Object.keys(backup.agents).some((agentId) =>
            locationFilter.includes(agentId)
          )
        );
      }
      return filteredBackups.map((backup) => {
        const type = computeBackupType(backup, isHassio);
        const agentIds = Object.keys(backup.agents);
        return {
          ...backup,
          size: computeBackupSize(backup),
          agent_ids: agentIds.sort(compareAgents),
          formatted_type: localize(`ui.panel.config.backup.type.${type}`),
        };
      });
    }
  );

  private _maxAgents = memoizeOne((data: BackupRow[]): number =>
    Math.max(1, ...data.map((row) => row.agent_ids.length))
  );

  private _locations = memoizeOne(
    (
      localize: LocalizeFunc,
      agents: BackupAgent[],
      backups: BackupContent[]
    ) => {
      const agentIds = new Set(agents.map((agent) => agent.agent_id));
      backups.forEach((backup) => {
        Object.keys(backup.agents).forEach((agentId) => agentIds.add(agentId));
      });

      return Array.from(agentIds)
        .sort(compareAgents)
        .map((agentId) => ({
          value: agentId,
          label: computeBackupAgentName(localize, agentId, agents),
        }));
    }
  );

  protected render(): TemplateResult {
    const backupInProgress =
      "state" in this.manager && this.manager.state === "in_progress";
    const isHassio = isComponentLoaded(this.hass.config, "hassio");
    const data = this._data(
      this.backups,
      this._filters,
      this.hass.localize,
      isHassio
    );
    const maxDisplayedAgents = Math.min(
      this._maxAgents(data),
      this.narrow ? 3 : 5
    );

    return html`
      <hass-tabs-subpage-data-table
        has-fab
        .tabs=${[
          {
            name: this.hass.localize("ui.panel.config.backup.backups.header"),
            path: `/config/backup/list`,
          },
        ]}
        .hass=${this.hass}
        .narrow=${this.narrow}
        back-path="/config/backup/overview"
        clickable
        id="backup_id"
        has-filters
        .filters=${
          Object.values(this._filters).filter((filter) =>
            Array.isArray(filter)
              ? filter.length
              : filter &&
                Object.values(filter).some((val) =>
                  Array.isArray(val) ? val.length : val
                )
          ).length
        }
        selectable
        .selected=${this._selected.length}
        .initialGroupColumn=${this._tableSettings.grouping}
        .initialCollapsedGroups=${this._activeCollapsed}
        .groupOrder=${this._groupOrder(
          this._tableSettings.grouping,
          this.hass.localize,
          isHassio
        )}
        @grouping-changed=${this._tableSettings.groupingChanged}
        @collapsed-changed=${this._handleCollapseChanged}
        @selection-changed=${this._handleSelectionChanged}
        @filtered-rows-changed=${this._filteredRowsChanged}
        ?bulk-bar=${this._selected.length > 0}
        @clear-filter=${this._clearFilter}
        .route=${this.route}
        sync-url
        .filter=${this._tableSettings.search}
        @search-changed=${this._tableSettings.searchChanged}
        @row-click=${this._showBackupDetails}
        .columns=${this._columns(this.hass.localize, maxDisplayedAgents)}
        .data=${data}
        .noDataText=${this.hass.localize("ui.panel.config.backup.no_backups")}
        .searchLabel=${this.hass.localize(
          "ui.panel.config.backup.picker.search"
        )}
      >
        <div slot="toolbar-icon">
          <ha-dropdown
            @wa-select=${this._handleDropdownSelect}
            placement="bottom-end"
          >
            <ha-icon-button
              slot="trigger"
              .label=${this.hass.localize("ui.common.menu")}
              .path=${mdiDotsVertical}
            ></ha-icon-button>
            <ha-dropdown-item value="upload_backup">
              <ha-svg-icon slot="icon" .path=${mdiUpload}></ha-svg-icon>
              ${this.hass.localize(
                "ui.panel.config.backup.backups.menu.upload_backup"
              )}
            </ha-dropdown-item>
          </ha-dropdown>
        </div>

        <ha-filter-states
          .label=${this.hass.localize("ui.panel.config.backup.backup_type")}
          .value=${this._filters[BACKUP_TYPE_FILTER]}
          .states=${this._states(this.hass.localize, isHassio)}
          @data-table-filter-changed=${this._typeFilterChanged}
          slot="filter-pane"
          .narrow=${this.narrow}
        ></ha-filter-states>
        <ha-filter-states
          .label=${this.hass.localize("ui.panel.config.backup.locations")}
          .value=${this._filters[BACKUP_LOCATIONS_FILTER]}
          .states=${this._locations(
            this.hass.localize,
            this.agents,
            this.backups
          )}
          @data-table-filter-changed=${this._locationsFilterChanged}
          slot="filter-pane"
          .narrow=${this.narrow}
        ></ha-filter-states>
        ${
          !this._needsOnboarding
            ? html`
                <ha-button
                  slot="fab"
                  size="l"
                  ?disabled=${backupInProgress}
                  @click=${this._newBackup}
                >
                  ${
                    backupInProgress
                      ? html`<div slot="start" class="loading">
                          <ha-spinner .size=${"small"}></ha-spinner>
                        </div>`
                      : html`<ha-svg-icon
                          slot="start"
                          .path=${mdiPlus}
                        ></ha-svg-icon>`
                  }
                  ${this.hass.localize(
                    "ui.panel.config.backup.backups.new_backup"
                  )}
                </ha-button>
              `
            : nothing
        }
      </hass-tabs-subpage-data-table>
      ${
        this._selected.length
          ? html`<div class=${this.narrow ? "bulk narrow" : "bulk"}>
              <ha-bulk-bar
                .localize=${this._bulkLocalize}
                .count=${this._selected.length}
                .pageCount=${filteredTableCount(this._dataTable)}
                .matchCount=${filteredTableCount(this._dataTable)}
                .hiddenCount=${hiddenTableSelection(this._dataTable)}
                .actions=${this._bulkActions(this.hass.localize)}
                .getPreview=${this._getBulkPreview}
                @bulk-select-page=${this._selectAllRows}
                @bulk-select-matches=${this._selectAllRows}
                @bulk-invert=${this._invertRows}
                @bulk-clear=${this._clearRows}
                @bulk-confirm=${this._deleteSelected}
              ></ha-bulk-bar>
            </div>`
          : nothing
      }
      <ha-dropdown
        id="overflow-menu"
        @wa-select=${this._handleOverflowAction}
        @wa-after-show=${this._overflowMenuOpened}
        @wa-after-hide=${this._overflowMenuClosed}
      >
        <ha-dropdown-item value="download">
          <ha-svg-icon slot="icon" .path=${mdiDownload}></ha-svg-icon>
          ${this.hass.localize("ui.common.download")}
        </ha-dropdown-item>
        <ha-dropdown-item variant="danger" value="delete">
          <ha-svg-icon slot="icon" .path=${mdiDelete}></ha-svg-icon>
          ${this.hass.localize("ui.common.delete")}
        </ha-dropdown-item>
      </ha-dropdown>
    `;
  }

  private _states = memoizeOne((localize: LocalizeFunc, isHassio: boolean) =>
    getBackupTypes(isHassio).map((type) => ({
      value: type,
      label: localize(`ui.panel.config.backup.type.${type}`),
    }))
  );

  private _typeFilterChanged(ev) {
    this._filterChanged(BACKUP_TYPE_FILTER, ev.detail.value);
  }

  private _locationsFilterChanged(ev) {
    this._filterChanged(BACKUP_LOCATIONS_FILTER, ev.detail.value);
  }

  private _filterChanged(type: string, value: DataTableFiltersValue) {
    const filters = { ...this._filters, [type]: value };

    // Only a change to what the URL holds is the user's, so a link isn't stored
    if (
      backupsFilterQueryString(filters) !==
      backupsFilterQueryString(this._filters)
    ) {
      this._storageFilters = { ...this._storageFilters, [type]: value };
    }

    this._filters = filters;
    this._writeFilters();
  }

  private _clearFilter() {
    this._filters = {};
    this._storageFilters = {};
    this._writeFilters();
  }

  // Links, like the ones on the backups overview, say in the URL what to show.
  // The router keeps the page open, so a link can land on it.
  private _applyLink() {
    const searchParams = this._filterParams.searchParams();
    const link = searchParams ? backupsLinkFromUrl(searchParams) : undefined;

    // Shown, but not stored as the user's choice
    if (link) {
      this._tableSettings.showSearch(link.search);
      this._filters = link.filters;
    } else if (searchParams?.toString() === "") {
      // Opened again without params, like from the sidebar. Written once the
      // table has seen the URL without params, so it restores what it stored
      this._filters = this._storageFilters;
      queueMicrotask(() => this._writeFilters());

      return;
    }

    this._writeFilters();
  }

  private _writeFilters() {
    this._filterParams.write(backupsFilterQueryParams(this._filters));
  }

  private get _needsOnboarding() {
    return !this.config?.automatic_backups_configured;
  }

  private _uploadBackup = async () => {
    await showUploadBackupDialog(this, {});
  };

  private async _newBackup(): Promise<void> {
    const config = this.config!;

    const type = await showNewBackupDialog(this, { config });

    if (!type) {
      return;
    }

    if (type === "manual") {
      const params = await showGenerateBackupDialog(this, {
        cloudStatus: this.cloudStatus,
      });

      if (!params) {
        return;
      }

      await generateBackup(this.hass, params);
      fireEvent(this, "ha-refresh-backup-info");
      return;
    }
    if (type === "automatic") {
      await generateBackupWithAutomaticSettings(this.hass);
      fireEvent(this, "ha-refresh-backup-info");
    }
  }

  private _showBackupDetails(ev: CustomEvent): void {
    const id = (ev.detail as RowClickedEvent).id;
    navigate(`/config/backup/details/${id}`);
  }

  private _handleOverflowAction = (ev: HaDropdownSelectEvent) => {
    const action = ev.detail.item.value;

    if (action === "download") {
      this._downloadBackup();
      return;
    }

    if (action === "delete") {
      this._deleteBackup();
    }
  };

  private _downloadBackup = async (): Promise<void> => {
    const backup = this._overflowBackup;
    if (!backup) {
      return;
    }
    downloadBackup(this.hass, this, backup, this.config);
  };

  private _deleteBackup = async (): Promise<void> => {
    const backup = this._overflowBackup;
    if (!backup) {
      return;
    }

    const confirm = await showConfirmationDialog(this, {
      title: this.hass.localize("ui.panel.config.backup.dialogs.delete.title"),
      text: this.hass.localize("ui.panel.config.backup.dialogs.delete.text"),
      confirmText: this.hass.localize("ui.common.delete"),
      destructive: true,
    });

    if (!confirm) {
      return;
    }

    try {
      await deleteBackup(this.hass, backup.backup_id);
      if (this._selected.includes(backup.backup_id)) {
        this._selected = this._selected.filter((id) => id !== backup.backup_id);
      }
    } catch (err: any) {
      showAlertDialog(this, {
        title: this.hass.localize(
          "ui.panel.config.backup.dialogs.delete.failed"
        ),
        text: extractApiErrorMessage(err),
      });
      return;
    }
    fireEvent(this, "ha-refresh-backup-info");
  };

  private _bulkLocalize = (
    key: string,
    values?: Record<string, string | number>
  ): string => this.hass.localize(key as any, values);

  private _filteredRowsChanged = () => {
    if (this._selected.length) {
      this.requestUpdate();
    }
  };

  private _selectAllRows = () => selectAllTableRows(this._dataTable);

  private _invertRows = () => invertTableRows(this._dataTable);

  private _clearRows = () => this._dataTable?.clearSelection();

  private _bulkActions = memoizeOne((localize: LocalizeFunc): BulkAction[] => [
    {
      id: "delete",
      label: localize("ui.panel.config.backup.backups.delete_selected"),
      path: mdiDelete,
      destructive: true,
      preview: true,
    },
  ]);

  // Locked backups are not reported by the instance, and a backup that is
  // still being created is not in the list yet, so nothing is passed here.
  private _deletePlan() {
    return planBackupDelete(this._selected, this.backups);
  }

  private _getBulkPreview = (id: string): BulkPreview | undefined => {
    if (id !== "delete") {
      return undefined;
    }
    const localize = this.hass.localize;
    const plan = this._deletePlan();
    const items: BulkPreviewItem[] = [];

    plan.deletable.forEach((entry) => {
      items.push(
        ...backupPreviewItems(entry, {
          entry: localize("ui.panel.config.backup.backups.bulk.entry", {
            name: entry.name,
            date: formatDateTime(
              new Date(entry.date),
              this.hass.locale,
              this.hass.config
            ),
            size: bytesToString(entry.size),
          }),
          newest: localize("ui.panel.config.backup.backups.bulk.newest"),
          onlyCopy: localize("ui.panel.config.backup.backups.bulk.only_copy", {
            location: entry.onlyCopy
              ? computeBackupAgentName(localize, entry.agentIds[0], this.agents)
              : "",
          }),
        })
      );
    });

    plan.skipped.forEach((entry) => {
      items.push({
        kind: "skip",
        text: localize(
          `ui.panel.config.backup.backups.bulk.skipped_${entry.reason}`,
          { name: entry.name }
        ),
      });
    });

    const count = plan.deletable.length;
    const hidden = hiddenTableSelection(this._dataTable);
    const notes = [localize("ui.panel.config.backup.backups.bulk.note")];
    if (hidden > 0) {
      notes.push(localize("ui.bulk.preview_hidden", { count: hidden }));
    }
    return {
      title: localize("ui.panel.config.backup.backups.bulk.title", { count }),
      items,
      changeCount: count,
      confirmLabel: localize("ui.common.delete"),
      note: notes.join(" "),
    };
  };

  // Runs after the bar's two confirmations, so no further dialog asks again
  private _deleteSelected = async () => {
    const plan = this._deletePlan();
    const planned = plan.deletable.map((entry) => entry.backupId);
    if (!planned.length) {
      return;
    }

    // A backup that someone else deleted since the list was loaded would
    // "succeed" without doing anything. Look at the instance first, so that
    // case is reported instead of counted as a deletion. If the instance cannot
    // be asked, every backup is sent as before.
    let ids = planned;
    let gone: string[] = [];
    try {
      const info = await fetchBackupInfo(this.hass);
      ({ present: ids, gone } = splitAlreadyGone(
        planned,
        new Set(info.backups.map((backup) => backup.backup_id))
      ));
    } catch (_err) {
      // Keep every planned backup in the request
    }

    const results = await Promise.allSettled(
      ids.map((id) => deleteBackup(this.hass, id))
    );
    const outcome = summarizeBackupDelete(ids, results);

    if (outcome.deleted.length || gone.length) {
      fireEvent(this, "ha-refresh-backup-info");
    }

    const names = new Map(
      plan.deletable.map((entry) => [entry.backupId, entry.name])
    );
    if (gone.length) {
      showToast(this, {
        message: this.hass.localize(
          "ui.panel.config.backup.backups.bulk.already_gone",
          { names: gone.map((id) => names.get(id) ?? id).join(", ") }
        ),
        duration: 8000,
      });
    }

    // A backup that is already gone leaves the selection too
    const deleted = new Set([...outcome.deleted, ...gone]);
    this._dataTable?.setCheckedRowIds(
      this._selected.filter((id) => !deleted.has(id))
    );

    if (outcome.failed.length) {
      showAlertDialog(this, {
        title: this.hass.localize(
          "ui.panel.config.backup.dialogs.delete_selected.failed"
        ),
        text: `${this.hass.localize(
          "ui.panel.config.backup.backups.bulk.partly_deleted",
          { deleted: outcome.deleted.length, total: ids.length }
        )}\n${outcome.failed
          .map(
            ({ backupId, error }) =>
              `${names.get(backupId) ?? backupId}: ${extractApiErrorMessage(error)}`
          )
          .join("\n")}`,
      });
    }
  };

  private _handleDropdownSelect(ev: HaDropdownSelectEvent) {
    const action = ev.detail?.item.value;

    if (action === "upload_backup") {
      this._uploadBackup();
    }
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        .loading {
          display: flex;
        }
        .bulk {
          position: fixed;
          z-index: 4;
          bottom: calc(
            var(--ha-phone-bar-height, 0px) +
              var(--ha-bottom-tabs-height, 0px) + var(--ha-space-4)
          );
          inset-inline: var(--ha-sidebar-width, 0px) 0;
          box-sizing: border-box;
          width: min(
            720px,
            calc(100% - var(--ha-sidebar-width, 0px) - var(--ha-space-8))
          );
          margin-inline: auto;
        }
        .bulk.narrow {
          inset-inline: 0;
          width: calc(100% - var(--ha-space-8));
        }
        ha-spinner {
          --ha-spinner-indicator-color: var(--mdc-theme-on-secondary);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-backup-backups": HaConfigBackupBackups;
  }
}
