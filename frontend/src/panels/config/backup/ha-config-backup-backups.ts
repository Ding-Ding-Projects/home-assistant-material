import {
  mdiAlertOutline,
  mdiCheckCircleOutline,
  mdiDelete,
  mdiHelpCircleOutline,
  mdiServerNetwork,
  mdiMonitor,
  mdiArchiveLock,
  mdiDotsVertical,
  mdiDownload,
  mdiHarddisk,
  mdiLock,
  mdiNas,
  mdiPlus,
  mdiUpload,
} from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { styleMap } from "lit/directives/style-map";
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
import "../../../components/chips/ha-chip-set";
import "../../../components/chips/ha-filter-chip";
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
import { isRegistryAgent } from "../../../data/registry_storage";
import type { BackupDeleteProofInfo } from "../../../data/backup_delete_proof";
import {
  bulkDeleteResultCounts,
  fetchBackupDeleteProofInfo,
  isDeleteProofError,
  summarizeDeleteProof,
} from "../../../data/backup_delete_proof";
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
import {
  factsRowDetails,
  rowDetailsColumn,
} from "../../../components/data-table/row-details-column";
import { backupFacts } from "../../../data/entity-details";
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
import { summarizeSelfCheck } from "./helper/backup-self-check";
import { downloadBackup } from "./helper/download_backup";
import { showHostBackupDialog } from "./dialogs/show-dialog-host-backup";
import { modeText } from "../../../common/language-mode/language-mode";

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

  @state() private _hostingBackups = new Set<string>();

  // Only delete proof backups are listed while this is on
  @state() private _onlyDeleteProof = false;

  // Every mark, also of backups no location reports any more
  @state() private _deleteProofInfo?: BackupDeleteProofInfo;

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
      // The search of everything opens this page with the delete proof filter
      this._onlyDeleteProof = window.location.hash === "#delete_proof";
    }
    if (changedProps.has("backups") && this.hass?.user?.is_admin) {
      this._loadDeleteProofInfo();
    }
  }

  private async _loadDeleteProofInfo() {
    try {
      this._deleteProofInfo = await fetchBackupDeleteProofInfo(this.hass);
    } catch (_err) {
      // An older Core has no delete proof; the page shows none
      this._deleteProofInfo = undefined;
    }
  }

  // The backup's facts, in the row right under it.
  private _rowDetails = factsRowDetails((backup) =>
    backupFacts({
      backup_id: backup.backup_id,
      date: backup.date,
      agents: backup.agents,
    })
  );

  private _columns = memoizeOne(
    (
      localize: LocalizeFunc,
      maxDisplayedAgents: number,
      hostingBackups: Set<string>,
      narrow: boolean
    ): DataTableColumnContainer<BackupRow> => ({
      name: {
        title: localize("ui.panel.config.backup.name"),
        main: true,
        sortable: true,
        filterable: true,
        flex: 3,
        template: (backup) =>
          backup.delete_proof
            ? html`<span
                style="display: inline-flex; flex-wrap: wrap; align-items: center; column-gap: var(--ha-space-2); min-width: 0;"
                ><span>${backup.name}</span
                ><span
                  style="display: inline-flex; align-items: center; gap: var(--ha-space-1); color: var(--warning-color); font-size: var(--ha-font-size-s); white-space: nowrap;"
                  ><ha-svg-icon
                    style="--mdc-icon-size: 14px;"
                    .path=${mdiLock}
                  ></ha-svg-icon
                  >${modeText(
                    localize,
                    "ui.panel.config.backup.delete_proof.label"
                  )}</span
                ></span
              >`
            : backup.name,
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
                if (isRegistryAgent(agentId)) {
                  return html`
                    <ha-svg-icon
                      .path=${mdiArchiveLock}
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
      self_check: {
        title: modeText(localize, "ui.panel.config.backup.self_check.column"),
        label: modeText(localize, "ui.panel.config.backup.self_check.title"),
        showNarrow: true,
        // 24 icon, 32 cell padding, and room for the short header.
        minWidth: "96px",
        maxWidth: "96px",
        template: (backup) => {
          const checkState = summarizeSelfCheck(backup.self_check)?.state;
          if (!checkState) {
            return nothing;
          }
          const label = modeText(
            localize,
            `ui.panel.config.backup.self_check.badge.${checkState}`
          );
          return html`<ha-svg-icon
            role="img"
            aria-label=${label}
            title=${label}
            style=${styleMap({
              color:
                checkState === "passed"
                  ? "var(--success-color)"
                  : "var(--warning-color)",
            })}
            .path=${
              checkState === "passed"
                ? mdiCheckCircleOutline
                : checkState === "failed"
                  ? mdiAlertOutline
                  : mdiHelpCircleOutline
            }
          ></ha-svg-icon>`;
        },
      },
      hosting: {
        title: localize("ui.panel.config.backup.hosting.column"),
        label: localize("ui.panel.config.backup.hosting.title"),
        showNarrow: false,
        // On a phone the table joins every column that is not shown on its
        // own into the second line of the name, which put these two buttons
        // in the middle of the text. The same actions are in the row menu.
        hidden: !this.hass.user?.is_admin || narrow,
        // Two 48px buttons and the 32px cell padding.
        minWidth: "136px",
        maxWidth: "136px",
        template: (backup) => html`
          ${
            this.hass.user?.is_admin
              ? html`
                  <ha-icon-button
                    .path=${mdiServerNetwork}
                    .disabled=${hostingBackups.has(backup.backup_id)}
                    .label=${modeText(this.hass.localize, "ui.panel.config.backup.hosting.container")}
                    .backup=${backup}
                    data-kind="docker"
                    @click=${this._hostBackupClicked}
                  ></ha-icon-button>
                  <ha-icon-button
                    .path=${mdiMonitor}
                    .disabled=${hostingBackups.has(backup.backup_id)}
                    .label=${modeText(this.hass.localize, "ui.panel.config.backup.hosting.appliance")}
                    .backup=${backup}
                    data-kind="appliance"
                    @click=${this._hostBackupClicked}
                  ></ha-icon-button>
                `
              : nothing
          }
        `,
      },
      details: rowDetailsColumn<BackupRow>(
        localize("ui.components.quick_control.details_column"),
        this,
        (backup) => backup.backup_id,
        (backup) => backup.name
      ),
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
            modeText(localize, `ui.panel.config.backup.type.${type}`)
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
      isHassio: boolean,
      onlyDeleteProof = false
    ): BackupRow[] => {
      const typeFilter = filters[BACKUP_TYPE_FILTER];
      const locationFilter = filters[BACKUP_LOCATIONS_FILTER];

      let filteredBackups = onlyDeleteProof
        ? backups.filter((backup) => !!backup.delete_proof)
        : backups;

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
          formatted_type: modeText(
            localize,
            `ui.panel.config.backup.type.${type}`
          ),
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
    const deleteProof = summarizeDeleteProof(
      this.backups,
      this._deleteProofInfo?.marks
    );
    const onlyDeleteProof = this._onlyDeleteProof && deleteProof.count > 0;
    const data = this._data(
      this.backups,
      this._filters,
      this.hass.localize,
      isHassio,
      onlyDeleteProof
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
            name: modeText(
              this.hass.localize,
              "ui.panel.config.backup.backups.header"
            ),
            path: `/config/backup/list`,
          },
        ]}
        .hass=${this.hass}
        .narrow=${this.narrow}
        back-path="/config/backup/overview"
        clickable
        id="backup_id"
        .renderRowDetails=${this._rowDetails}
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
        .columns=${this._columns(
          this.hass.localize,
          maxDisplayedAgents,
          this._hostingBackups,
          this.narrow
        )}
        .data=${data}
        .noDataText=${this.hass.localize("ui.panel.config.backup.no_backups")}
        .searchLabel=${this.hass.localize(
          "ui.panel.config.backup.picker.search"
        )}
      >
        ${this._renderDeleteProof(deleteProof, onlyDeleteProof)}
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
                  title=${
                    backupInProgress
                      ? this.hass.localize(
                          "ui.panel.config.backup.creating_backup"
                        )
                      : nothing
                  }
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
        ${
          this.hass.user?.is_admin
            ? html`
                <ha-dropdown-item value="host-docker"
                  >${modeText(this.hass.localize, "ui.panel.config.backup.hosting.container")}</ha-dropdown-item
                >
                <ha-dropdown-item value="host-appliance"
                  >${modeText(this.hass.localize, "ui.panel.config.backup.hosting.appliance")}</ha-dropdown-item
                >
              `
            : nothing
        }
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

  private _dpText(key: string, values?: Record<string, string | number>) {
    return modeText(
      this.hass.localize,
      `ui.panel.config.backup.delete_proof.${key}`,
      values
    );
  }

  // The filter chips, the space the delete proof backups use, and the marks
  // whose backup no location reports. Nothing is shown without any mark.
  private _renderDeleteProof(
    summary: ReturnType<typeof summarizeDeleteProof>,
    onlyDeleteProof: boolean
  ) {
    const unreadable = this._deleteProofInfo?.readable === false;
    if (!summary.count && !summary.missingIds.length && !unreadable) {
      return nothing;
    }
    const copies = this.config?.retention?.copies;
    return html`<div slot="top-header" class="delete-proof">
      ${
        summary.count
          ? html`<ha-chip-set
              role="group"
              aria-label=${this._dpText("filter_label")}
            >
              <ha-filter-chip
                .label=${this._dpText("filter_all")}
                .selected=${!onlyDeleteProof}
                @click=${this._showAll}
              ></ha-filter-chip>
              <ha-filter-chip
                .label=${this._dpText("filter_count", { count: summary.count })}
                .selected=${onlyDeleteProof}
                @click=${this._showDeleteProof}
              ></ha-filter-chip>
            </ha-chip-set>`
          : nothing
      }
      ${
        unreadable
          ? html`<p class="dp-line warning" role="alert">
              ${this._dpText("unreadable")}
            </p>`
          : nothing
      }
      ${
        summary.count
          ? html`<p class="dp-line">
              ${this._dpText("space_text", {
                count: summary.count,
                size: bytesToString(summary.size),
              })}
              ${
                copies
                  ? this._dpText("space_keep", { copies })
                  : this._dpText("space_never")
              }
            </p>`
          : nothing
      }
      ${
        summary.missingIds.length
          ? html`<p class="dp-line warning">
              ${this._dpText("missing", { count: summary.missingIds.length })}
            </p>`
          : nothing
      }
    </div>`;
  }

  private _showAll = () => {
    this._onlyDeleteProof = false;
  };

  private _showDeleteProof = () => {
    this._onlyDeleteProof = true;
  };

  private _states = memoizeOne((localize: LocalizeFunc, isHassio: boolean) =>
    getBackupTypes(isHassio).map((type) => ({
      value: type,
      label: modeText(localize, `ui.panel.config.backup.type.${type}`),
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

  private _hostBackupClicked(ev: Event) {
    ev.stopPropagation();
    const button = ev.currentTarget as HTMLElement & { backup: BackupContent };
    this._hostBackup(
      button.backup,
      button.dataset.kind === "appliance" ? "appliance" : "docker"
    );
  }

  private _hostBackup(backup: BackupContent, kind: "docker" | "appliance") {
    showHostBackupDialog(this, {
      backup,
      kind,
      onBusy: (busy) => {
        const next = new Set(this._hostingBackups);
        if (busy) next.add(backup.backup_id);
        else next.delete(backup.backup_id);
        this._hostingBackups = next;
      },
    });
  }

  private _handleOverflowAction = (ev: HaDropdownSelectEvent) => {
    const action = ev.detail.item.value;

    if (
      (action === "host-docker" || action === "host-appliance") &&
      this._overflowBackup
    ) {
      this._hostBackup(
        this._overflowBackup,
        action === "host-docker" ? "docker" : "appliance"
      );
      return;
    }

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

    if (backup.delete_proof) {
      showAlertDialog(this, {
        title: this.hass.localize(
          "ui.panel.config.backup.dialogs.delete.title"
        ),
        text: this._dpText("turn_off_first"),
      });
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
        text: isDeleteProofError(err)
          ? this._dpText("refused", { name: backup.name })
          : extractApiErrorMessage(err),
      });
      fireEvent(this, "ha-refresh-backup-info");
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
    const modeLocalize = (
      key: string,
      values?: Record<string, string | number>
    ) => modeText(this.hass.localize, key, values);
    const plan = this._deletePlan();
    const items: BulkPreviewItem[] = [];

    plan.deletable.forEach((entry) => {
      items.push(
        ...backupPreviewItems(entry, {
          entry: modeLocalize("ui.panel.config.backup.backups.bulk.entry", {
            name: entry.name,
            date: formatDateTime(
              new Date(entry.date),
              this.hass.locale,
              this.hass.config
            ),
            size: bytesToString(entry.size),
          }),
          newest: modeLocalize("ui.panel.config.backup.backups.bulk.newest"),
          onlyCopy: modeLocalize(
            "ui.panel.config.backup.backups.bulk.only_copy",
            {
              location: entry.onlyCopy
                ? computeBackupAgentName(
                    localize,
                    entry.agentIds[0],
                    this.agents
                  )
                : "",
            }
          ),
        })
      );
    });

    plan.skipped.forEach((entry) => {
      items.push({
        kind: "skip",
        text:
          entry.reason === "delete_proof"
            ? this._dpText("bulk_skipped", { name: entry.name })
            : modeLocalize(
                `ui.panel.config.backup.backups.bulk.skipped_${entry.reason}`,
                { name: entry.name }
              ),
      });
    });

    const count = plan.deletable.length;
    const hidden = hiddenTableSelection(this._dataTable);
    const notes = [modeLocalize("ui.panel.config.backup.backups.bulk.note")];
    if (hidden > 0) {
      notes.push(modeLocalize("ui.bulk.preview_hidden", { count: hidden }));
    }
    return {
      title: modeLocalize("ui.panel.config.backup.backups.bulk.title", {
        count,
      }),
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
    const skippedDeleteProof = plan.skipped.filter(
      (entry) => entry.reason === "delete_proof"
    ).length;
    if (!planned.length) {
      if (skippedDeleteProof) {
        this._showBulkResult(0, skippedDeleteProof);
      }
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
        message: modeText(
          this.hass.localize,
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

    // A backup marked delete proof after the list was loaded is refused by
    // the backend; it is reported as kept, not as a failure
    const counts = bulkDeleteResultCounts(
      outcome.deleted.length,
      skippedDeleteProof,
      outcome.failed.map((failure) => failure.error)
    );
    if (counts.keptDeleteProof) {
      this._showBulkResult(counts.deleted, counts.keptDeleteProof);
      if (counts.keptDeleteProof > skippedDeleteProof) {
        fireEvent(this, "ha-refresh-backup-info");
      }
    }
    outcome.failed = outcome.failed.filter(
      (failure) => !isDeleteProofError(failure.error)
    );

    if (outcome.failed.length) {
      showAlertDialog(this, {
        title: this.hass.localize(
          "ui.panel.config.backup.dialogs.delete_selected.failed"
        ),
        text: `${modeText(
          this.hass.localize,
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

  // "2 deleted. 1 kept because it is delete proof."
  private _showBulkResult(deleted: number, kept: number) {
    showToast(this, {
      message: this._dpText("bulk_result", { deleted, kept }),
      duration: 8000,
      dismissable: true,
    });
  }

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
        .delete-proof {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
          padding: var(--ha-space-2) var(--ha-space-4);
        }
        .dp-line {
          margin: 0;
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-s);
          overflow-wrap: anywhere;
        }
        .dp-line.warning {
          color: var(--warning-color);
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
