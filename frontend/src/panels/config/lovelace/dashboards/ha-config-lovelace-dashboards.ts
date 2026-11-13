import {
  mdiContentCopy,
  mdiDelete,
  mdiDotsVertical,
  mdiDownload,
  mdiEye,
  mdiEyeOff,
  mdiHistory,
  mdiHomeEdit,
  mdiInformationOutline,
  mdiPencil,
  mdiPlus,
  mdiUpload,
  mdiViewDashboard,
  mdiViewDashboardEdit,
} from "@mdi/js";
import type { PropertyValues } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import memoize from "memoize-one";
import { DataTableSettingsController } from "../../../../common/controllers/data-table-settings-controller";
import { storage } from "../../../../common/decorators/storage";
import type { HASSDomEvent } from "../../../../common/dom/fire_event";
import { isComponentLoaded } from "../../../../common/config/is_component_loaded";
import { navigate } from "../../../../common/navigate";
import { stringCompare } from "../../../../common/string/compare";
import type { LocalizeFunc } from "../../../../common/translations/localize";
import type { BulkAction } from "../../../../components/bulk/bulk-selection";
import {
  filteredTableCount,
  hiddenTableSelection,
  invertTableRows,
  selectAllTableRows,
} from "../../../../components/bulk/table-selection";
import "../../../../components/bulk/ha-bulk-bar";
import type {
  DataTableColumnContainer,
  RowClickedEvent,
  SelectionChangedEvent,
} from "../../../../components/data-table/ha-data-table";
import "../../../../components/ha-alert";
import "../../../../components/ha-button";
import "../../../../components/ha-dropdown";
import "../../../../components/ha-dropdown-item";
import "../../../../components/ha-icon";
import "../../../../components/ha-icon-button";
import "../../../../components/ha-icon-overflow-menu";
import "../../../../components/ha-svg-icon";
import "../../../../components/ha-switch";
import { dashboardHistoryUrl } from "../../../../data/dashboard_repos";
import {
  getDashboardConditions,
  hiddenDashboardPaths,
  saveDashboardConditions,
} from "../../../../data/dashboard-visibility";
import type { LovelaceRawConfig } from "../../../../data/lovelace/config/types";
import {
  isStrategyDashboard,
  saveConfig,
} from "../../../../data/lovelace/config/types";
import { fetchResources } from "../../../../data/lovelace/resource";
import type {
  LovelaceDashboard,
  LovelaceDashboardCreateParams,
  LovelaceDashboardSuggestions,
} from "../../../../data/lovelace/dashboard";
import {
  createDashboard,
  deleteDashboard,
  fetchDashboards,
  updateDashboard,
} from "../../../../data/lovelace/dashboard";
import {
  DEFAULT_PANEL,
  getPanelIcon,
  getPanelTitle,
  updatePanel,
} from "../../../../data/panel";
import {
  showAlertDialog,
  showConfirmationDialog,
} from "../../../../dialogs/generic/show-dialog-box";
import type { WindowWithPreloads } from "../../../../data/preloads";
import "../../../../layouts/hass-loading-screen";
import "../../../../layouts/hass-tabs-subpage-data-table";
import type { HaTabsSubpageDataTable } from "../../../../layouts/hass-tabs-subpage-data-table";
import type { HomeAssistant, Route } from "../../../../types";
import {
  exportDashboard,
  isGeneratedPage,
  makeEditableCopy,
  saveDefaultPanel,
} from "../../../lovelace/import-export/dashboard-actions";
import { importChosenFile } from "../../../lovelace/import-export/dashboard-file-import";
import { loadLovelaceResources } from "../../../lovelace/common/load-resources";
import { loadDashboardStrategyWithCreateSuggestions } from "../../../lovelace/strategies/get-strategy";
import type { NewDashboardSelection } from "../../dashboard/show-dialog-new-dashboard";
import { showNewDashboardDialog } from "../../dashboard/show-dialog-new-dashboard";
import { lovelaceTabs } from "../ha-config-lovelace";
import { showDashboardConfigureStrategyDialog } from "./show-dialog-lovelace-dashboard-configure-strategy";
import { showDashboardDetailDialog } from "./show-dialog-lovelace-dashboard-detail";
import { showDuplicateDashboardDialog } from "./show-dialog-duplicate-dashboard";
import { showPanelDetailDialog } from "./show-dialog-panel-detail";
import { showDefaultDashboardDialog } from "./show-dialog-default-dashboard";
import type {
  BulkDashboardRow,
  BulkLocalize,
  DashboardBulkActionId,
  DashboardBulkPlan,
} from "./dashboard-bulk-actions";
import {
  buildDashboardBulkPreview,
  planDashboardBulkAction,
  runBulkRequests,
} from "./dashboard-bulk-actions";

export const PANEL_DASHBOARDS = [
  "home",
  "light",
  "security",
  "climate",
  "energy",
  "maintenance",
] as string[];

type DataTableItem = Pick<
  LovelaceDashboard,
  "icon" | "title" | "show_in_sidebar" | "require_admin" | "mode" | "url_path"
> & {
  default: boolean;
  /** Its "show only when" conditions do not hold now, so navigation skips it. */
  hidden_now?: boolean;
  filename: string;
  localized_type: string;
  type: string;
};

@customElement("ha-config-lovelace-dashboards")
export class HaConfigLovelaceDashboards extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: "is-wide", type: Boolean }) public isWide = false;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: false }) public route!: Route;

  @state() private _dashboards: LovelaceDashboard[] = [];

  @state() private _loading = true;

  @state() private _loadFailed = false;

  @state() private _selected: string[] = [];

  // How many extra card files are loaded, for the line under the list
  @state() private _resourceCount?: number;

  @query(".import-input")
  private _importInput?: HTMLInputElement;

  @query("hass-tabs-subpage-data-table", true)
  private _dataTable!: HaTabsSubpageDataTable;

  private _tableSettings = new DataTableSettingsController(
    this,
    {
      search: "lovelace-dashboards-table-search",
      sorting: "lovelace-dashboards-table-sort",
      grouping: "lovelace-dashboards-table-grouping",
    },
    { defaultGrouping: "localized_type" }
  );

  @storage({
    key: "lovelace-dashboards-table-column-order",
    state: false,
    subscribe: false,
  })
  private _activeColumnOrder?: string[];

  @storage({
    key: "lovelace-dashboards-table-hidden-columns",
    state: false,
    subscribe: false,
  })
  private _activeHiddenColumns?: string[];

  @storage({
    key: "lovelace-dashboards-table-collapsed",
    state: false,
    subscribe: false,
  })
  private _activeCollapsed: string[] = [];

  public willUpdate() {
    if (!this.hasUpdated) {
      this.hass.loadFragmentTranslation("lovelace");
    }
  }

  private _columns = memoize(
    (
      narrow: boolean,
      _language,
      dashboards,
      localize: LocalizeFunc
    ): DataTableColumnContainer => {
      const columns: DataTableColumnContainer<DataTableItem> = {
        icon: {
          title: "",
          moveable: false,
          showNarrow: true,
          label: localize(
            "ui.panel.config.lovelace.dashboards.picker.headers.icon"
          ),
          type: "icon",
          template: (dashboard) => html`
            <span
              style="display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 12px; background: var(--secondary-background-color);"
            >
              ${
                dashboard.icon
                  ? html`<ha-icon
                      slot="item-icon"
                      .icon=${dashboard.icon}
                    ></ha-icon>`
                  : html`<ha-svg-icon .path=${mdiViewDashboard}></ha-svg-icon>`
              }
            </span>
          `,
        },
        title: {
          title: localize(
            "ui.panel.config.lovelace.dashboards.picker.headers.title"
          ),
          main: true,
          sortable: true,
          filterable: true,
          flex: 2,
          template: narrow
            ? undefined
            : (dashboard) => html`
                <span
                  style="display:flex; align-items:center; gap: var(--ha-space-2); min-width:0; width:100%;"
                >
                  <span
                    style="min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;"
                    >${dashboard.title}</span
                  >
                  ${
                    dashboard.default
                      ? html`<span
                          style="flex-shrink: 0; padding: 2px 10px; border-radius: 999px; background: var(--primary-color); color: var(--text-primary-color); font-size: var(--ha-font-size-s);"
                          >${this.hass.localize(
                            "ui.panel.config.lovelace.dashboards.default_badge"
                          )}</span
                        >`
                      : nothing
                  }
                </span>
              `,
          extraTemplate: (dashboard) =>
            html`<span
              style="display: block; color: var(--secondary-text-color); font-size: var(--ha-font-size-s);"
              >/${dashboard.url_path}${
                dashboard.hidden_now
                  ? html` ·
                      <span style="color: var(--warning-color);"
                        >${localize(
                          "ui.panel.config.lovelace.dashboards.detail.visibility.hidden_now"
                        )}</span
                      >`
                  : nothing
              }</span
            >`,
        },
      };

      columns.localized_type = {
        title: localize(
          "ui.panel.config.lovelace.dashboards.picker.headers.type"
        ),
        sortable: true,
        groupable: true,
        filterable: true,
        urlName: "type",
      };

      columns.mode = {
        title: localize(
          "ui.panel.config.lovelace.dashboards.picker.headers.conf_mode"
        ),
        sortable: true,
        filterable: true,
        defaultHidden: true,
        template: (dashboard) => html`
          ${
            this.hass.localize(
              `ui.panel.config.lovelace.dashboards.conf_mode.${dashboard.mode}`
            ) || dashboard.mode
          }
        `,
      };
      if (dashboards.some((dashboard) => dashboard.filename)) {
        columns.filename = {
          title: localize(
            "ui.panel.config.lovelace.dashboards.picker.headers.filename"
          ),
          sortable: true,
          filterable: true,
          defaultHidden: true,
        };
      }
      columns.require_admin = {
        title: localize(
          "ui.panel.config.lovelace.dashboards.picker.headers.who_sees_it"
        ),
        sortable: true,
        hidden: narrow,
        minWidth: "140px",
        maxWidth: "180px",
        template: (dashboard) =>
          localize(
            dashboard.require_admin
              ? "ui.panel.config.lovelace.dashboards.picker.who_admins"
              : "ui.panel.config.lovelace.dashboards.picker.who_everyone"
          ),
      };
      columns.show_in_sidebar = {
        title: localize(
          "ui.panel.config.lovelace.dashboards.picker.headers.on_the_rail"
        ),
        sortable: true,
        showNarrow: true,
        minWidth: "100px",
        maxWidth: "120px",
        template: (dashboard) => html`
          <ha-switch
            .checked=${dashboard.show_in_sidebar}
            .disabled=${
              dashboard.type === "user_created" && dashboard.mode !== "storage"
            }
            aria-label=${localize(
              "ui.panel.config.lovelace.dashboards.picker.show_on_rail",
              { title: dashboard.title }
            )}
            data-url-path=${dashboard.url_path}
            @click=${this._stopRowClick}
            @change=${this._handleRailToggled}
          ></ha-switch>
        `,
      };

      columns.actions = {
        title: "",
        label: this.hass.localize("ui.panel.config.generic.headers.actions"),
        type: "overflow-menu",
        showNarrow: true,
        moveable: false,
        hideable: false,
        template: (dashboard) => html`
          <ha-icon-overflow-menu
            narrow
            .items=${[
              {
                path: mdiHomeEdit,
                label: localize(
                  "ui.panel.config.lovelace.dashboards.picker.set_as_default"
                ),
                action: () => this._handleSetAsDefault(dashboard),
                disabled: dashboard.default,
              },
              ...(dashboard.type === "built_in" &&
              isGeneratedPage(dashboard.url_path)
                ? [
                    {
                      path: mdiViewDashboardEdit,
                      label: this.hass.localize(
                        "ui.panel.lovelace.import_export.edit_cards_layout"
                      ),
                      action: () => this._handleEditCopy(dashboard),
                    },
                  ]
                : []),
              ...(dashboard.url_path !== "energy"
                ? [
                    {
                      path: mdiDownload,
                      label: this.hass.localize(
                        "ui.panel.lovelace.import_export.export_dashboard"
                      ),
                      action: () => this._handleExport(dashboard),
                    },
                  ]
                : []),
              ...(dashboard.type === "user_created"
                ? [
                    {
                      path: mdiContentCopy,
                      label: this.hass.localize(
                        "ui.panel.config.lovelace.dashboards.duplicate.menu"
                      ),
                      action: () => this._handleDuplicate(dashboard),
                    },
                  ]
                : []),
              ...(dashboard.type === "built_in"
                ? [
                    {
                      path: mdiPencil,
                      label: this.hass.localize(
                        "ui.panel.config.lovelace.dashboards.picker.edit"
                      ),
                      action: () => this._handleEditPanel(dashboard),
                    },
                  ]
                : []),
              ...(dashboard.type === "user_created" &&
              dashboard.mode === "storage"
                ? [
                    {
                      path: mdiPencil,
                      label: this.hass.localize(
                        "ui.panel.config.lovelace.dashboards.picker.edit"
                      ),
                      action: () => this._handleEdit(dashboard),
                    },
                    ...(isComponentLoaded(this.hass.config, "dashboard_repos")
                      ? [
                          {
                            path: mdiHistory,
                            label: this.hass.localize(
                              "ui.panel.config.lovelace.dashboards.picker.history"
                            ),
                            action: () =>
                              navigate(dashboardHistoryUrl(dashboard.url_path)),
                          },
                        ]
                      : []),
                    {
                      label: this.hass.localize(
                        "ui.panel.config.lovelace.dashboards.picker.delete"
                      ),
                      path: mdiDelete,
                      action: () => this._handleDelete(dashboard),
                      warning: true,
                    },
                  ]
                : []),
            ]}
          >
          </ha-icon-overflow-menu>
        `,
      };

      return columns;
    }
  );

  private _getItems = memoize(
    (
      dashboards: LovelaceDashboard[],
      defaultUrlPath: string | null,
      panels: HomeAssistant["panels"],
      hiddenKey: string
    ) => {
      const hidden = new Set(hiddenKey ? hiddenKey.split("\n") : []);
      const result: DataTableItem[] = [];

      PANEL_DASHBOARDS.forEach((panel) => {
        const panelInfo = panels[panel];
        if (!panelInfo) {
          return;
        }
        const item: DataTableItem = {
          icon: getPanelIcon(panelInfo),
          title: getPanelTitle(this.hass, panelInfo) || panelInfo.url_path,
          show_in_sidebar: panelInfo.show_in_sidebar || false,
          mode: "storage",
          url_path: panelInfo.url_path,
          filename: "",
          default: defaultUrlPath === panelInfo.url_path,
          hidden_now: hidden.has(panelInfo.url_path),
          require_admin: panelInfo.require_admin || false,
          type: "built_in",
          localized_type: this._localizeType("built_in"),
        };
        result.push(item);
      });

      result.push(
        ...dashboards
          .sort((a, b) =>
            stringCompare(a.title, b.title, this.hass.locale.language)
          )
          .map(
            (dashboard) =>
              ({
                filename: "",
                ...dashboard,
                default: defaultUrlPath === dashboard.url_path,
                hidden_now: hidden.has(dashboard.url_path),
                type: "user_created",
                localized_type: this._localizeType("user_created"),
              }) satisfies DataTableItem
          )
      );
      return result;
    }
  );

  private _localizeType = (type: "user_created" | "built_in") =>
    this.hass.localize(
      `ui.panel.config.lovelace.dashboards.picker.type.${type}`
    );

  protected render() {
    if (!this.hass || this._dashboards === undefined) {
      return html` <hass-loading-screen></hass-loading-screen> `;
    }

    const defaultPanel = this.hass.systemData?.default_panel || DEFAULT_PANEL;

    return html`
      <hass-tabs-subpage-data-table
        .hass=${this.hass}
        .narrow=${this.narrow}
        back-path="/config"
        .route=${this.route}
        .tabs=${lovelaceTabs}
        .columns=${this._columns(
          this.narrow,
          this.hass.language,
          this._dashboards,
          this.hass.localize
        )}
        .loading=${this._loading}
        .data=${
          this._loading
            ? []
            : this._getItems(
                this._dashboards,
                defaultPanel,
                this.hass.panels,
                hiddenDashboardPaths(
                  this.hass.systemData?.dashboard_visibility,
                  this.hass,
                  [defaultPanel]
                ).join("\n")
              )
        }
        .initialGroupColumn=${this._tableSettings.grouping}
        .initialCollapsedGroups=${this._activeCollapsed}
        .initialSorting=${this._tableSettings.sorting}
        .columnOrder=${this._activeColumnOrder}
        .hiddenColumns=${this._activeHiddenColumns}
        @grouping-changed=${this._tableSettings.groupingChanged}
        @collapsed-changed=${this._handleCollapseChanged}
        @columns-changed=${this._handleColumnsChanged}
        @sorting-changed=${this._tableSettings.sortingChanged}
        .filter=${this._tableSettings.search}
        @search-changed=${this._tableSettings.searchChanged}
        ?sync-url=${!this._loading && !this._loadFailed}
        @row-click=${this._handleRowClicked}
        selectable
        keep-hidden-selection
        .selected=${this._selected.length}
        @selection-changed=${this._handleSelectionChanged}
        @filtered-rows-changed=${this._filteredRowsChanged}
        ?bulk-bar=${this._selected.length > 0}
        .loadError=${
          this._loadFailed
            ? this.hass.localize(
                "ui.panel.config.lovelace.dashboards.picker.load_failed"
              )
            : undefined
        }
        @retry-load=${this._retryGetDashboards}
        id="url_path"
        .summary=${this.hass.localize(
          "ui.panel.config.lovelace.dashboards.picker.summary"
        )}
        .appendRow=${this._renderResourcesNote()}
        has-fab
        clickable
      >
        <ha-dropdown
          slot="toolbar-icon"
          @wa-select=${this._handleToolbarSelect}
        >
          <ha-icon-button
            slot="trigger"
            .label=${this.hass.localize("ui.common.menu")}
            .path=${mdiDotsVertical}
          ></ha-icon-button>
          <ha-dropdown-item value="import">
            <ha-svg-icon slot="icon" .path=${mdiUpload}></ha-svg-icon>
            ${this.hass.localize(
              "ui.panel.lovelace.import_export.import_dashboard"
            )}
          </ha-dropdown-item>
          <ha-dropdown-item value="default">
            <ha-svg-icon slot="icon" .path=${mdiHomeEdit}></ha-svg-icon>
            ${this.hass.localize(
              "ui.panel.config.lovelace.dashboards.default_dialog.menu"
            )}
          </ha-dropdown-item>
          <a href="/config/lovelace/resources">
            <ha-dropdown-item>
              ${this.hass.localize(
                "ui.panel.config.lovelace.resources.caption"
              )}
            </ha-dropdown-item>
          </a>
        </ha-dropdown>
        <input
          slot="toolbar-icon"
          type="file"
          class="import-input"
          accept=".json,.yaml,.yml,application/json"
          tabindex="-1"
          aria-hidden="true"
          @change=${this._handleImportFileChosen}
        />
        <ha-button slot="fab" size="l" @click=${this._addDashboard}>
          <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
          ${this.hass.localize(
            "ui.panel.config.lovelace.dashboards.picker.add_dashboard"
          )}
        </ha-button>
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
                .actions=${this._bulkActions(this.hass.language)}
                .getPreview=${this._bulkPreview}
                @bulk-select-page=${this._selectAllRows}
                @bulk-select-matches=${this._selectAllRows}
                @bulk-invert=${this._invertRows}
                @bulk-clear=${this._clearRows}
                @bulk-confirm=${this._handleBulkConfirm}
              ></ha-bulk-bar>
            </div>`
          : nothing
      }
    `;
  }

  private _renderResourcesNote() {
    if (this._resourceCount === undefined) {
      return undefined;
    }
    return html`<div
      role="cell"
      style="display: flex; align-items: center; gap: 12px; width: 100%; box-sizing: border-box; padding: 12px 16px; margin-top: 8px; border-radius: 16px; background: var(--secondary-background-color); color: var(--secondary-text-color);"
    >
      <ha-svg-icon .path=${mdiInformationOutline}></ha-svg-icon>
      <span
        >${this.hass.localize(
          "ui.panel.config.lovelace.dashboards.picker.resources_note",
          { count: this._resourceCount }
        )}</span
      >
    </div>`;
  }

  private _stopRowClick(ev: Event) {
    ev.stopPropagation();
  }

  private async _handleRailToggled(ev: Event) {
    ev.stopPropagation();
    const target = ev.currentTarget as HTMLElement & { checked: boolean };
    const urlPath = target.dataset.urlPath!;
    const show = target.checked;
    const dashboard = this._dashboards.find((res) => res.url_path === urlPath);
    try {
      if (dashboard) {
        const updated = await updateDashboard(this.hass, dashboard.id, {
          show_in_sidebar: show,
        });
        this._dashboards = this._dashboards.map((res) =>
          res === dashboard ? updated : res
        );
      } else if (this.hass.panels[urlPath]) {
        await updatePanel(this.hass, urlPath, { show_in_sidebar: show });
      }
    } catch (err: any) {
      target.checked = !show;
      showAlertDialog(this, {
        title: this.hass.localize(
          "ui.panel.config.lovelace.dashboards.picker.rail_failed"
        ),
        text: err.message,
      });
    }
  }

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);

    const preloadWindow = window as WindowWithPreloads;
    if (!preloadWindow.llResProm) {
      preloadWindow.llResProm = fetchResources(this.hass.connection);
    }

    preloadWindow.llResProm
      .then((resources) => {
        this._resourceCount = resources.length;
        loadLovelaceResources(resources, this.hass);
      })
      .catch((err: unknown) => {
        preloadWindow.llResProm = undefined;
        // eslint-disable-next-line
        console.error("Unable to preload Lovelace resources", err);
      });

    this._getDashboards();
  }

  private async _getDashboards() {
    try {
      this._dashboards = await fetchDashboards(this.hass);
      this._loadFailed = false;
    } catch {
      this._loadFailed = true;
    } finally {
      this._loading = false;
    }
  }

  private _retryGetDashboards() {
    this._loading = true;
    this._getDashboards();
  }

  private _handleToolbarSelect = (ev: CustomEvent) => {
    if ((ev.detail as { item?: { value?: string } }).item?.value === "import") {
      this._importInput?.click();
    } else if (
      (ev.detail as { item?: { value?: string } }).item?.value === "default"
    ) {
      showDefaultDashboardDialog(this);
    }
  };

  private _handleImportFileChosen = async (ev: Event) => {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    // Allow choosing the same file again later.
    input.value = "";
    if (!file) {
      return;
    }
    await importChosenFile({ hass: this.hass, element: this }, file);
    await this._getDashboards();
  };

  private _handleExport(item: DataTableItem) {
    const dashboard = this._dashboards.find(
      (res) => res.url_path === item.url_path
    );
    void exportDashboard({ hass: this.hass, element: this }, item.url_path, {
      dashboard,
    });
  }

  private _handleDuplicate(item: DataTableItem) {
    showDuplicateDashboardDialog(this, {
      dashboard: {
        title: item.title,
        url_path: item.url_path,
        icon: item.icon,
        require_admin: item.require_admin,
        show_in_sidebar: item.show_in_sidebar,
      },
      takenUrlPaths: this._collectTakenDashboardUrlPaths(),
      created: (created) => {
        this._dashboards = this._dashboards!.concat(created).sort(
          (res1, res2) =>
            stringCompare(
              res1.url_path,
              res2.url_path,
              this.hass.locale.language
            )
        );
      },
    });
  }

  private async _handleEditCopy(item: DataTableItem) {
    await makeEditableCopy(
      { hass: this.hass, element: this },
      { urlPath: item.url_path, title: item.title }
    );
  }

  private _handleRowClicked(ev: CustomEvent) {
    ev.stopPropagation();
    const urlPath = (ev.detail as RowClickedEvent).id;
    navigate(`/${urlPath}`);
  }

  private _handleEdit(item: DataTableItem) {
    const urlPath = item.url_path;

    if (urlPath === "energy") {
      navigate("/config/energy");
      return;
    }
    const dashboard = this._dashboards.find((res) => res.url_path === urlPath);
    this._openDetailDialog(dashboard, urlPath);
  }

  private _handleEditPanel(item: DataTableItem) {
    const panelInfo = this.hass.panels[item.url_path];
    if (!panelInfo) {
      return;
    }
    const defaultPanel = this.hass.systemData?.default_panel || DEFAULT_PANEL;
    showPanelDetailDialog(this, {
      urlPath: panelInfo.url_path,
      title: getPanelTitle(this.hass, panelInfo) || panelInfo.url_path,
      icon: getPanelIcon(panelInfo),
      requireAdmin: panelInfo.require_admin || false,
      showInSidebar: panelInfo.show_in_sidebar || false,
      isDefault: panelInfo.url_path === defaultPanel,
      updatePanel: async (values) => {
        await updatePanel(this.hass!, panelInfo.url_path, values);
      },
    });
  }

  private _handleSetAsDefault = async (item: DataTableItem) => {
    if (item.default) {
      return;
    }

    if (item.require_admin) {
      showAlertDialog(this, {
        title: this.hass.localize(
          "ui.panel.config.lovelace.dashboards.detail.set_default_admin_only_title"
        ),
        text: this.hass.localize(
          "ui.panel.config.lovelace.dashboards.detail.set_default_admin_only_text"
        ),
      });
      return;
    }

    const confirm = await showConfirmationDialog(this, {
      title: this.hass.localize(
        "ui.panel.config.lovelace.dashboards.detail.set_default_confirm_title"
      ),
      text: html`${this.hass.localize(
          "ui.panel.config.lovelace.dashboards.detail.set_default_confirm_text"
        )}<br /><br /><ha-alert alert-type="info"
          >${this.hass.localize(
            "ui.panel.config.lovelace.dashboards.detail.set_default_confirm_note"
          )}</ha-alert
        >`,
      confirmText: this.hass.localize("ui.common.ok"),
      dismissText: this.hass.localize("ui.common.cancel"),
      destructive: false,
    });

    if (!confirm) {
      return;
    }

    await saveDefaultPanel(this.hass, item.url_path);
  };

  private _handleDelete = async (item: DataTableItem) => {
    const dashboard = this._dashboards.find(
      (res) => res.url_path === item.url_path
    );
    if (!dashboard) {
      return;
    }
    this._deleteDashboard(dashboard);
  };

  private async _addDashboard() {
    showNewDashboardDialog(this, {
      selectConfig: async ({ config }: NewDashboardSelection) => {
        let fieldSuggestions: LovelaceDashboardSuggestions | undefined;

        if (config && isStrategyDashboard(config)) {
          const { strategyClass, fieldSuggestions: suggested } =
            await loadDashboardStrategyWithCreateSuggestions(
              this.hass,
              config.strategy.type
            );
          fieldSuggestions = suggested;

          if (strategyClass.configRequired) {
            showDashboardConfigureStrategyDialog(this, {
              config: config,
              saveConfig: async (updatedConfig) => {
                const { fieldSuggestions: afterConfigure } =
                  await loadDashboardStrategyWithCreateSuggestions(
                    this.hass,
                    updatedConfig.strategy.type
                  );
                this._openDetailDialog(
                  undefined,
                  undefined,
                  updatedConfig,
                  afterConfigure
                );
              },
            });
            return;
          }
        }

        this._openDetailDialog(undefined, undefined, config, fieldSuggestions);
      },
    });
  }

  private async _openDetailDialog(
    dashboard?: LovelaceDashboard,
    urlPath?: string,
    defaultConfig?: LovelaceRawConfig,
    fieldSuggestions?: LovelaceDashboardSuggestions
  ): Promise<void> {
    const defaultPanel = this.hass.systemData?.default_panel || DEFAULT_PANEL;
    showDashboardDetailDialog(this, {
      dashboard,
      urlPath,
      isDefault: dashboard?.url_path === defaultPanel,
      suggestions: fieldSuggestions,
      takenUrlPaths: dashboard
        ? undefined
        : this._collectTakenDashboardUrlPaths(),
      createDashboard: async (values: LovelaceDashboardCreateParams) => {
        const created = await createDashboard(this.hass!, values);
        this._dashboards = this._dashboards!.concat(created).sort(
          (res1, res2) =>
            stringCompare(
              res1.url_path,
              res2.url_path,
              this.hass.locale.language
            )
        );
        if (defaultConfig) {
          await saveConfig(this.hass!, created.url_path, defaultConfig);
        }
      },
      updateDashboard: async (values) => {
        const updated = await updateDashboard(
          this.hass!,
          dashboard!.id,
          values
        );
        this._dashboards = this._dashboards!.map((res) =>
          res === dashboard ? updated : res
        );
      },
      removeDashboard: async () => {
        if (!dashboard) {
          return false;
        }
        return this._deleteDashboard(dashboard);
      },
    });
  }

  private _collectTakenDashboardUrlPaths(): ReadonlySet<string> {
    const taken = new Set<string>();
    for (const d of this._dashboards ?? []) {
      taken.add(d.url_path);
    }
    for (const path of Object.keys(this.hass.panels)) {
      taken.add(path);
    }
    taken.add("lovelace");
    return taken;
  }

  /** Drops the "show only when" entries of deleted dashboards (best effort). */
  private _forgetVisibility(urlPaths: string[]): void {
    const map = this.hass.systemData?.dashboard_visibility;
    if (!this.hass.user?.is_admin || !map) {
      return;
    }
    urlPaths
      .filter((urlPath) => getDashboardConditions(map, urlPath).length)
      .reduce(
        (chain, urlPath) =>
          chain.then(() =>
            saveDashboardConditions(this.hass.connection, urlPath, [])
          ),
        Promise.resolve()
      )
      .catch(() => undefined);
  }

  private async _deleteDashboard(
    dashboard: LovelaceDashboard
  ): Promise<boolean> {
    const confirm = await showConfirmationDialog(this, {
      title: this.hass!.localize(
        "ui.panel.config.lovelace.dashboards.confirm_delete_title",
        { dashboard_title: dashboard.title }
      ),
      text: this.hass!.localize(
        "ui.panel.config.lovelace.dashboards.confirm_delete_text"
      ),
      confirmText: this.hass!.localize("ui.common.delete"),
      destructive: true,
    });
    if (!confirm) {
      return false;
    }
    try {
      await deleteDashboard(this.hass!, dashboard.id);
      this._forgetVisibility([dashboard.url_path]);
      this._dashboards = this._dashboards.filter((res) => res !== dashboard);
      return true;
    } catch (_err: any) {
      return false;
    }
  }

  private _bulkLocalize: BulkLocalize = (key, values) =>
    this.hass.localize(key as any, values);

  private _bulkActions = memoize((_language: string): BulkAction[] => [
    {
      id: "show",
      label: this.hass.localize(
        "ui.panel.config.lovelace.dashboards.bulk.show"
      ),
      path: mdiEye,
      preview: true,
    },
    {
      id: "hide",
      label: this.hass.localize(
        "ui.panel.config.lovelace.dashboards.bulk.hide"
      ),
      path: mdiEyeOff,
      preview: true,
    },
    {
      id: "delete",
      label: this.hass.localize("ui.common.delete"),
      path: mdiDelete,
      destructive: true,
      preview: true,
    },
  ]);

  private _filteredRowsChanged = () => {
    if (this._selected.length) {
      this.requestUpdate();
    }
  };

  private _selectAllRows = () => selectAllTableRows(this._dataTable);

  private _invertRows = () => invertTableRows(this._dataTable);

  private _clearRows = () => this._dataTable?.clearSelection();

  /** The ticked rows, in the shape the bulk rules read. */
  private _selectedRows(): BulkDashboardRow[] {
    const defaultPanel = this.hass.systemData?.default_panel || DEFAULT_PANEL;
    const rows: BulkDashboardRow[] = [];
    for (const urlPath of this._selected) {
      const dashboard = this._dashboards.find(
        (res) => res.url_path === urlPath
      );
      if (dashboard) {
        rows.push({
          url_path: dashboard.url_path,
          title: dashboard.title,
          show_in_sidebar: dashboard.show_in_sidebar,
          mode: dashboard.mode,
          type: "user_created",
          default: dashboard.url_path === defaultPanel,
          id: dashboard.id,
        });
        continue;
      }
      const panelInfo = this.hass.panels[urlPath];
      if (panelInfo) {
        rows.push({
          url_path: urlPath,
          title: getPanelTitle(this.hass, panelInfo) || urlPath,
          show_in_sidebar: panelInfo.show_in_sidebar || false,
          mode: "storage",
          type: "built_in",
          default: urlPath === defaultPanel,
        });
      }
    }
    return rows;
  }

  private _bulkPlan(id: string): DashboardBulkPlan {
    return planDashboardBulkAction(
      id as DashboardBulkActionId,
      this._selectedRows(),
      new Set(this._dataTable?.getFilteredRowIds() ?? [])
    );
  }

  private _bulkPreview = (id: string) =>
    buildDashboardBulkPreview(
      this._bulkPlan(id),
      this._bulkLocalize,
      isComponentLoaded(this.hass.config, "dashboard_repos")
    );

  private _handleBulkConfirm = async (ev: CustomEvent<{ id: string }>) => {
    const action = ev.detail.id as DashboardBulkActionId;
    const plan = this._bulkPlan(action);
    if (!plan.change.length) {
      return;
    }
    const updated = new Map<string, LovelaceDashboard>();
    const result = await runBulkRequests(plan.change, async (row) => {
      if (action === "delete") {
        await deleteDashboard(this.hass, row.id!);
        return;
      }
      updated.set(
        row.id!,
        await updateDashboard(this.hass, row.id!, {
          show_in_sidebar: action === "show",
        })
      );
    });
    const doneIds = new Set(result.succeeded.map((row) => row.id));
    if (action === "delete") {
      const gone = new Set(result.succeeded.map((row) => row.url_path));
      this._forgetVisibility([...gone]);
      this._dashboards = this._dashboards.filter(
        (dashboard) => !gone.has(dashboard.url_path)
      );
      // Ticked rows the search hides stay ticked.
      this._dataTable?.setCheckedRowIds(
        this._selected.filter((urlPath) => !gone.has(urlPath))
      );
    } else {
      this._dashboards = this._dashboards.map((dashboard) =>
        doneIds.has(dashboard.id)
          ? (updated.get(dashboard.id) ?? dashboard)
          : dashboard
      );
    }
    if (result.failed.length) {
      showAlertDialog(this, {
        title: this.hass.localize(
          "ui.panel.config.lovelace.dashboards.bulk.failed_title"
        ),
        text: this.hass.localize(
          "ui.panel.config.lovelace.dashboards.bulk.failed",
          {
            count: result.failed.length,
            names: result.failed
              .map(({ item, message }) =>
                message ? `${item.title} (${message})` : item.title
              )
              .join(", "),
          }
        ),
      });
    }
  };

  private _handleSelectionChanged = (
    ev: HASSDomEvent<SelectionChangedEvent>
  ): void => {
    this._selected = ev.detail.value;
  };

  private _handleColumnsChanged(ev: CustomEvent) {
    this._activeColumnOrder = ev.detail.columnOrder;
    this._activeHiddenColumns = ev.detail.hiddenColumns;
  }

  private _handleCollapseChanged(ev: CustomEvent) {
    this._activeCollapsed = ev.detail.value;
  }

  static styles = css`
    .bulk {
      position: fixed;
      z-index: 4;
      bottom: calc(
        var(--ha-phone-bar-height, 0px) + var(--ha-bottom-tabs-height, 0px) +
          var(--ha-space-4)
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
    .import-input {
      display: none;
    }
    ha-dropdown a {
      text-decoration: none;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-lovelace-dashboards": HaConfigLovelaceDashboards;
  }
}
