import {
  mdiAlertCircle,
  mdiDelete,
  mdiDownload,
  mdiEye,
  mdiHelpCircleOutline,
  mdiInformationOutline,
  mdiOpenInNew,
  mdiPaletteSwatch,
  mdiPlus,
  mdiShareVariant,
} from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { styleMap } from "lit/directives/style-map";
import memoizeOne from "memoize-one";
import "../../../components/bulk/ha-bulk-bar";
import type {
  BulkAction,
  BulkPreview,
} from "../../../components/bulk/bulk-selection";
import {
  filteredTableCount,
  hiddenTableSelection,
  invertTableRows,
  selectAllTableRows,
} from "../../../components/bulk/table-selection";
import { DataTableSettingsController } from "../../../common/controllers/data-table-settings-controller";
import { storage } from "../../../common/decorators/storage";
import type {
  HASSDomCurrentTargetEvent,
  HASSDomEvent,
} from "../../../common/dom/fire_event";
import { fireEvent } from "../../../common/dom/fire_event";
import { mainWindow } from "../../../common/dom/get_main_window";
import { navigate, replaceCurrentUrl } from "../../../common/navigate";
import type { LocalizeFunc } from "../../../common/translations/localize";
import { currentPath } from "../../../common/url/current-path";
import { extractSearchParam } from "../../../common/url/search-params";
import type {
  DataTableColumnContainer,
  RowClickedEvent,
  SelectionChangedEvent,
} from "../../../components/data-table/ha-data-table";
import "../../../components/ha-button";
import "../../../components/ha-icon-button";
import "../../../components/ha-icon-overflow-menu";
import "../../../components/ha-svg-icon";
import { showAutomationEditor } from "../../../data/automation";
import type {
  BlueprintImportResult,
  BlueprintMetaData,
  Blueprints,
} from "../../../data/blueprint";
import {
  deleteBlueprint,
  importBlueprint,
  saveBlueprint,
} from "../../../data/blueprint";
import { showScriptEditor } from "../../../data/script";
import { findRelated } from "../../../data/search";
import "../../../components/chips/ha-chip-set";
import "../../../components/chips/ha-filter-chip";
import {
  showAlertDialog,
  showConfirmationDialog,
} from "../../../dialogs/generic/show-dialog-box";
import "../../../layouts/hass-tabs-subpage-data-table";
import type { HaTabsSubpageDataTable } from "../../../layouts/hass-tabs-subpage-data-table";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant, Route } from "../../../types";
import { documentationUrl } from "../../../util/documentation-url";
import { showToast } from "../../../util/toast";
import { configSections } from "../config-sections";
import type {
  BlueprintBulkPlan,
  BulkBlueprintItem,
} from "./blueprint-bulk-actions";
import {
  blueprintDeletePreview,
  blueprintFailureDetail,
  blueprintReImportPreview,
  blueprintResultLine,
  planBlueprintDelete,
  planBlueprintReImport,
  reImportBlueprints,
  summarizeBlueprintResults,
} from "./blueprint-bulk-actions";
import { showAddBlueprintDialog } from "./show-dialog-import-blueprint";

const BARE_PATH = "/config/blueprint";
const DASHBOARD_PATH = `${BARE_PATH}/dashboard`;
const IMPORT_PATH = `${DASHBOARD_PATH}/import`;

type BlueprintMetaDataPath = BlueprintMetaData & {
  path: string;
  error: boolean;
  type: "automation" | "script";
  fullpath: string;
  usageCount?: number;
  usageAutomations?: number;
  usageScripts?: number;
  usedByText?: string;
};

type BlueprintFilter = "automation" | "script" | "used";

interface BlueprintUsage {
  automation: number;
  script: number;
}

const createNewFunctions = {
  automation: (blueprintMeta: BlueprintMetaDataPath) => {
    showAutomationEditor({
      alias: blueprintMeta.name,
      use_blueprint: { path: blueprintMeta.path },
    });
  },
  script: (blueprintMeta: BlueprintMetaDataPath) => {
    showScriptEditor({
      alias: blueprintMeta.name,
      use_blueprint: { path: blueprintMeta.path },
    });
  },
};

@customElement("ha-blueprint-overview")
class HaBlueprintOverview extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: "is-wide", type: Boolean }) public isWide = false;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: false }) public route!: Route;

  @property({ attribute: false }) public blueprints!: Record<
    "automation" | "script",
    Blueprints
  >;

  private _tableSettings = new DataTableSettingsController(this, {
    search: "blueprint-table-search",
    sorting: "blueprint-table-sort",
    grouping: "blueprint-table-grouping",
  });

  @storage({
    key: "blueprint-table-collapsed",
    state: false,
    subscribe: false,
  })
  private _activeCollapsed?: string;

  @storage({
    key: "blueprint-table-column-order",
    state: false,
    subscribe: false,
  })
  private _activeColumnOrder?: string[];

  @storage({
    key: "blueprint-table-hidden-columns",
    state: false,
    subscribe: false,
  })
  private _activeHiddenColumns?: string[];

  @state() private _usageCounts: Record<string, BlueprintUsage> = {};

  // Filter chips above the list; with none on, every blueprint is listed
  @state() private _filters: BlueprintFilter[] = [];

  private _usageCountRequest = 0;

  @state() private _usageCountsLoading = false;

  @state() private _selected: string[] = [];

  @state() private _deletedFullpaths: string[] = [];

  @query("hass-tabs-subpage-data-table", true)
  private _dataTable!: HaTabsSubpageDataTable;

  private _processedBlueprints = memoizeOne(
    (
      blueprints: Record<string, Blueprints>,
      localize: LocalizeFunc,
      usageCounts: Record<string, BlueprintUsage>,
      deleted: string[],
      filters: BlueprintFilter[]
    ): BlueprintMetaDataPath[] => {
      const deletedFullpaths = new Set(deleted);
      const result: any[] = [];
      Object.entries(blueprints).forEach(([type, typeBlueprints]) =>
        Object.entries(typeBlueprints).forEach(([path, blueprint]) => {
          const fullpath = `${type}/${path}`;
          if (deletedFullpaths.has(fullpath)) {
            return;
          }
          if ("error" in blueprint) {
            result.push({
              name: blueprint.error,
              type,
              translated_type: localize(
                `ui.panel.config.blueprint.overview.types.${type as "automation" | "script"}`
              ),
              error: true,
              path,
              fullpath,
              usageCount: 0,
            });
          } else {
            const usage = usageCounts[fullpath];
            const automations = usage?.automation ?? 0;
            const scripts = usage?.script ?? 0;
            const parts = [
              automations
                ? localize(
                    "ui.panel.config.blueprint.overview.used_by_automations",
                    { count: automations }
                  )
                : undefined,
              scripts
                ? localize(
                    "ui.panel.config.blueprint.overview.used_by_scripts",
                    { count: scripts }
                  )
                : undefined,
            ].filter(Boolean);
            result.push({
              ...blueprint.metadata,
              type,
              translated_type: localize(
                `ui.panel.config.blueprint.overview.types.${type as "automation" | "script"}`
              ),
              error: false,
              path,
              fullpath,
              usageCount: automations + scripts,
              usageAutomations: automations,
              usageScripts: scripts,
              usedByText: parts.length
                ? parts.join(", ")
                : localize("ui.panel.config.blueprint.overview.not_used"),
            });
          }
        })
      );
      return result.filter(
        (row) =>
          (!filters.includes("automation") || row.type === "automation") &&
          (!filters.includes("script") || row.type === "script") &&
          (!filters.includes("used") || (row.usageCount ?? 0) > 0)
      );
    }
  );

  private _columns = memoizeOne(
    (
      localize: LocalizeFunc,
      narrow: boolean
    ): DataTableColumnContainer<BlueprintMetaDataPath> => ({
      icon: {
        title: "",
        label: localize("ui.panel.config.blueprint.overview.headers.icon"),
        type: "icon",
        moveable: false,
        showNarrow: true,
        template: (blueprint) =>
          html`<ha-svg-icon
            .path=${blueprint.error ? mdiAlertCircle : mdiPaletteSwatch}
          ></ha-svg-icon>`,
      },
      name: {
        title: localize("ui.panel.config.blueprint.overview.headers.name"),
        main: true,
        sortable: true,
        filterable: true,
        direction: "asc",
        flex: 2,
        extraTemplate: (blueprint) =>
          blueprint.description
            ? html`<span
                style=${styleMap({
                  display: "block",
                  color: "var(--secondary-text-color)",
                  fontSize: "var(--ha-font-size-s)",
                  // One line with an ellipsis on a wide table, wrapped on a phone.
                  overflow: "hidden",
                  textOverflow: narrow ? "clip" : "ellipsis",
                  whiteSpace: narrow ? "normal" : "nowrap",
                  overflowWrap: narrow ? "anywhere" : "normal",
                })}
                >${blueprint.description}</span
              >`
            : "",
      },
      translated_type: {
        title: localize("ui.panel.config.blueprint.overview.headers.kind"),
        sortable: true,
        filterable: true,
        groupable: true,
        urlName: "type",
      },
      path: {
        title: localize("ui.panel.config.blueprint.overview.headers.file_name"),
        sortable: true,
        filterable: true,
        defaultHidden: true,
        flex: 2,
      },
      usage_count: {
        title: localize("ui.panel.config.blueprint.overview.headers.used_by"),
        sortable: true,
        valueColumn: "usageCount",
        flex: 1,
        template: (blueprint) =>
          blueprint.error
            ? ""
            : !blueprint.usageCount
              ? html`<span style="color: var(--secondary-text-color);"
                  >${blueprint.usedByText}</span
                >`
              : html`<ha-button
                  appearance="plain"
                  size="s"
                  class="usage-count"
                  title=${this.hass.localize(
                    `ui.panel.config.blueprint.overview.view_${blueprint.type}`
                  )}
                  data-fullpath=${blueprint.fullpath}
                  @click=${this._handleUsageClick}
                >
                  ${blueprint.usedByText}
                </ha-button>`,
      },
      use: {
        title: "",
        label: this.hass.localize("ui.panel.config.blueprint.overview.use"),
        showNarrow: false,
        minWidth: "110px",
        maxWidth: "110px",
        template: (blueprint) =>
          blueprint.error
            ? ""
            : html`<ha-button
                appearance="filled"
                variant="neutral"
                size="s"
                style=${styleMap({
                  // A finger needs a 44 px target, the small button is 32 px.
                  "--ha-button-height": narrow ? "44px" : undefined,
                })}
                data-fullpath=${blueprint.fullpath}
                @click=${this._handleUseClick}
              >
                <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
                ${this.hass.localize("ui.panel.config.blueprint.overview.use")}
              </ha-button>`,
      },
      fullpath: {
        title: "fullpath",
        hidden: true,
      },
      actions: {
        lastFixed: true,
        title: "",
        label: this.hass.localize("ui.panel.config.generic.headers.actions"),
        type: "overflow-menu",
        showNarrow: true,
        template: (blueprint) =>
          blueprint.error
            ? html`<ha-svg-icon
                style="color: var(--error-color); display: block; margin-inline-end: 12px; margin-inline-start: auto;"
                .path=${mdiAlertCircle}
              ></ha-svg-icon>`
            : html`
                <ha-icon-overflow-menu
                  narrow
                  .items=${[
                    {
                      path: mdiPlus,
                      label: this.hass.localize(
                        `ui.panel.config.blueprint.overview.create_${blueprint.type}`
                      ),
                      action: () => this._createNew(blueprint),
                    },
                    {
                      path: mdiEye,
                      label: this.hass.localize(
                        `ui.panel.config.blueprint.overview.view_${blueprint.domain}`
                      ),
                      action: () => this._showUsed(blueprint),
                    },
                    {
                      path: mdiShareVariant,
                      disabled: !blueprint.source_url,
                      label: this.hass.localize(
                        blueprint.source_url
                          ? "ui.panel.config.blueprint.overview.share_blueprint"
                          : "ui.panel.config.blueprint.overview.share_blueprint_no_url"
                      ),
                      action: () => this._share(blueprint),
                    },
                    {
                      path: mdiDownload,
                      disabled: !blueprint.source_url,
                      label: this.hass.localize(
                        blueprint.source_url
                          ? "ui.panel.config.blueprint.overview.re_import_blueprint"
                          : "ui.panel.config.blueprint.overview.re_import_blueprint_no_url"
                      ),
                      action: () => this._reImport(blueprint),
                    },
                    {
                      divider: true,
                    },
                    {
                      label: this.hass.localize(
                        "ui.panel.config.blueprint.overview.delete_blueprint"
                      ),
                      path: mdiDelete,
                      action: () => this._delete(blueprint),
                      warning: true,
                    },
                  ]}
                >
                </ha-icon-overflow-menu>
              `,
      },
    })
  );

  public connectedCallback() {
    // Move to the dashboard path before the URL controllers connect, they
    // keep the path they connected on. The router only gets there from the
    // bare path after this, and the import path is left for the dashboard.
    // Reads the URL, as a cached config panel reconnects this page with its
    // old route on the way to another page.
    const path = currentPath().replace(/\/$/, "");
    const importUrl =
      path === IMPORT_PATH
        ? (extractSearchParam("blueprint_url") ?? "")
        : undefined;

    if (path === BARE_PATH || importUrl !== undefined) {
      const search = importUrl === undefined ? mainWindow.location.search : "";
      replaceCurrentUrl(
        __DEMO__
          ? `${mainWindow.location.pathname}${search}#${DASHBOARD_PATH}`
          : `${DASHBOARD_PATH}${search}`
      );
      fireEvent(mainWindow, "location-changed", { replace: true });
    }

    super.connectedCallback();

    if (importUrl) {
      this._addBlueprint(importUrl);
    }
  }

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);
    this._loadUsageCounts();
  }

  protected willUpdate(changedProps: PropertyValues<this>) {
    super.willUpdate(changedProps);
    if (changedProps.has("blueprints") && this._deletedFullpaths.length) {
      this._deletedFullpaths = [];
    }
  }

  protected updated(changedProps: PropertyValues<this>) {
    super.updated(changedProps);
    if (changedProps.has("blueprints")) {
      this._loadUsageCounts();
    }
  }

  protected render(): TemplateResult {
    return html`
      <hass-tabs-subpage-data-table
        .hass=${this.hass}
        .narrow=${this.narrow}
        back-path="/config"
        .route=${this.route}
        .tabs=${configSections.automations}
        .columns=${this._columns(this.hass.localize, this.narrow)}
        .data=${this._processedBlueprints(
          this.blueprints,
          this.hass.localize,
          this._usageCounts,
          this._deletedFullpaths,
          this._filters
        )}
        id="fullpath"
        .noDataText=${this.hass.localize(
          this._filters.length
            ? "ui.panel.config.blueprint.overview.no_match"
            : "ui.panel.config.blueprint.overview.no_blueprints"
        )}
        .summary=${this.hass.localize(
          "ui.panel.config.blueprint.overview.summary"
        )}
        has-fab
        clickable
        @row-click=${this._handleRowClicked}
        selectable
        keep-hidden-selection
        .selected=${this._selected.length}
        ?bulk-bar=${this._selected.length > 0}
        @selection-changed=${this._handleSelectionChanged}
        @filtered-rows-changed=${this._filteredRowsChanged}
        .appendRow=${html`<div
          role="cell"
          style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; width: 100%; box-sizing: border-box; padding: 12px 16px; margin-top: 8px; border-radius: 16px; background: var(--secondary-background-color);"
        >
          <div
            style="display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1 1 220px; color: var(--secondary-text-color);"
          >
            <ha-svg-icon .path=${mdiInformationOutline}></ha-svg-icon>
            <span
              style="min-width: 0; white-space: normal; overflow-wrap: anywhere;"
              >${this.hass.localize(
                "ui.panel.config.blueprint.overview.info_files"
              )}</span
            >
          </div>
          <ha-button
            appearance="plain"
            href=${documentationUrl(this.hass, "/get-blueprints")}
            target="_blank"
            rel="noreferrer noopener"
            size="s"
          >
            ${this.hass.localize(
              "ui.panel.config.blueprint.overview.discover_more"
            )}
            <ha-svg-icon slot="end" .path=${mdiOpenInNew}></ha-svg-icon>
          </ha-button>
        </div>`}
        .initialGroupColumn=${this._tableSettings.grouping}
        .initialCollapsedGroups=${this._activeCollapsed}
        .initialSorting=${this._tableSettings.sorting}
        .columnOrder=${this._activeColumnOrder}
        .hiddenColumns=${this._activeHiddenColumns}
        @columns-changed=${this._handleColumnsChanged}
        @sorting-changed=${this._tableSettings.sortingChanged}
        @grouping-changed=${this._tableSettings.groupingChanged}
        @collapsed-changed=${this._handleCollapseChanged}
        .filter=${this._tableSettings.search}
        @search-changed=${this._tableSettings.searchChanged}
        sync-url
      >
        <ha-chip-set slot="top-header" class="filter-chips">
          ${(["automation", "script", "used"] as const).map(
            (filter) => html`
              <ha-filter-chip
                data-filter=${filter}
                .label=${this.hass.localize(
                  `ui.panel.config.blueprint.overview.filter_${filter}`
                )}
                .selected=${this._filters.includes(filter)}
                @click=${this._toggleFilter}
              ></ha-filter-chip>
            `
          )}
        </ha-chip-set>
        <ha-icon-button
          slot="toolbar-icon"
          .label=${this.hass.localize("ui.common.help")}
          .path=${mdiHelpCircleOutline}
          @click=${this._showHelp}
        ></ha-icon-button>
        <ha-button slot="fab" size="l" @click=${this._addBlueprintClicked}>
          <ha-svg-icon slot="start" .path=${mdiDownload}></ha-svg-icon>
          ${this.hass.localize(
            "ui.panel.config.blueprint.overview.add_blueprint"
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
                .actions=${this._bulkActions()}
                .getPreview=${this._bulkPreview}
                @bulk-select-page=${this._selectAllRows}
                @bulk-select-matches=${this._selectAllRows}
                @bulk-invert=${this._invertRows}
                @bulk-clear=${this._clearRows}
                @bulk-confirm=${this._bulkConfirm}
              ></ha-bulk-bar>
            </div>`
          : nothing
      }
    `;
  }

  private _showHelp() {
    showAlertDialog(this, {
      title: this.hass.localize("ui.panel.config.blueprint.caption"),
      text: html`
        ${this.hass.localize("ui.panel.config.blueprint.overview.introduction")}
        <p>
          <a
            href=${documentationUrl(
              this.hass,
              "/docs/automation/using_blueprints/"
            )}
            target="_blank"
            rel="noreferrer"
          >
            ${this.hass.localize(
              "ui.panel.config.blueprint.overview.learn_more"
            )}
          </a>
        </p>
      `,
    });
  }

  private _addBlueprint(url?: string) {
    showAddBlueprintDialog(this, {
      url,
      importedCallback: () => this._reload(),
    });
  }

  private _addBlueprintClicked(): void {
    this._addBlueprint();
  }

  private _reload() {
    fireEvent(this, "reload-blueprints");
  }

  private async _loadUsageCounts() {
    if (!this.blueprints) {
      return;
    }

    const request = ++this._usageCountRequest;
    this._usageCountsLoading = true;
    const usageCounts: Record<string, BlueprintUsage> = {};

    const blueprintList = this._processedBlueprints(
      this.blueprints,
      this.hass.localize,
      {},
      this._deletedFullpaths,
      []
    );

    await Promise.all(
      blueprintList.map(async (blueprint) => {
        if (blueprint.error) {
          usageCounts[blueprint.fullpath] = { automation: 0, script: 0 };
          return;
        }
        try {
          const related = await findRelated(
            this.hass,
            `${blueprint.domain}_blueprint`,
            blueprint.path
          );
          usageCounts[blueprint.fullpath] = {
            automation: related.automation?.length || 0,
            script: related.script?.length || 0,
          };
        } catch (_err) {
          usageCounts[blueprint.fullpath] = { automation: 0, script: 0 };
        }
      })
    );

    if (request === this._usageCountRequest) {
      this._usageCounts = usageCounts;
      this._usageCountsLoading = false;
    }
  }

  private _handleRowClicked(ev: HASSDomEvent<RowClickedEvent>) {
    const blueprint = this._processedBlueprints(
      this.blueprints,
      this.hass.localize,
      this._usageCounts,
      this._deletedFullpaths,
      []
    ).find((b) => b.fullpath === ev.detail.id)!;
    if (blueprint.error) {
      showAlertDialog(this, {
        title: this.hass.localize("ui.panel.config.blueprint.overview.error", {
          path: blueprint.path,
        }),
        text: blueprint.name,
      });
      return;
    }
    this._createNew(blueprint);
  }

  private _handleUsageClick = (ev: HASSDomCurrentTargetEvent<HTMLElement>) => {
    ev.stopPropagation();
    ev.preventDefault();
    const target = ev.currentTarget as HTMLElement | null;
    const fullpath = target?.dataset.fullpath;
    if (!fullpath) {
      return;
    }
    const blueprint = this._processedBlueprints(
      this.blueprints,
      this.hass.localize,
      this._usageCounts,
      this._deletedFullpaths,
      []
    ).find((item) => item.fullpath === fullpath);
    if (!blueprint || blueprint.error) {
      return;
    }
    this._showUsed(blueprint);
  };

  private _handleUseClick = (ev: HASSDomCurrentTargetEvent<HTMLElement>) => {
    ev.stopPropagation();
    const fullpath = ev.currentTarget.dataset.fullpath;
    const blueprint = this._processedBlueprints(
      this.blueprints,
      this.hass.localize,
      this._usageCounts,
      this._deletedFullpaths,
      []
    ).find((item) => item.fullpath === fullpath);
    if (blueprint && !blueprint.error) {
      this._createNew(blueprint);
    }
  };

  private _toggleFilter(ev: Event) {
    const filter = (ev.currentTarget as HTMLElement).dataset
      .filter as BlueprintFilter;
    this._filters = this._filters.includes(filter)
      ? this._filters.filter((item) => item !== filter)
      : [...this._filters, filter];
  }

  private _showUsed = (blueprint: BlueprintMetaDataPath) => {
    navigate(
      `/config/${blueprint.domain}/dashboard?blueprint=${encodeURIComponent(
        blueprint.path
      )}`
    );
  };

  private _createNew = (blueprint: BlueprintMetaDataPath) => {
    createNewFunctions[blueprint.domain](blueprint);
  };

  private _share = (blueprint: BlueprintMetaDataPath) => {
    const params = new URLSearchParams();
    params.append("redirect", "blueprint_import");
    params.append("blueprint_url", blueprint.source_url!);
    window.open(
      `https://my.home-assistant.io/create-link/?${params.toString()}`
    );
  };

  private _reImport = async (blueprint: BlueprintMetaDataPath) => {
    const result = await showConfirmationDialog(this, {
      title: this.hass.localize(
        "ui.panel.config.blueprint.overview.re_import_confirm_title"
      ),
      text: html`
        ${this.hass.localize(
          "ui.panel.config.blueprint.overview.re_import_confirm_text"
        )}
      `,
      confirmText: this.hass.localize(
        "ui.panel.config.blueprint.overview.re_import_confirm_action"
      ),
      warning: true,
    });

    if (!result) {
      return;
    }

    let importResult: BlueprintImportResult;
    try {
      importResult = await importBlueprint(this.hass, blueprint.source_url!);
    } catch (err) {
      showToast(this, {
        message: this.hass.localize(
          "ui.panel.config.blueprint.overview.re_import_error_source_not_found"
        ),
      });
      throw err;
    }

    try {
      await saveBlueprint(
        this.hass,
        blueprint.domain,
        blueprint.path,
        importResult!.raw_data,
        blueprint.source_url,
        true
      );
    } catch (err: any) {
      showToast(this, {
        message: this.hass.localize(
          "ui.panel.config.blueprint.overview.re_import_error_save",
          { error: err.message }
        ),
      });
      throw err;
    }

    fireEvent(this, "reload-blueprints");

    showToast(this, {
      message: this.hass.localize(
        "ui.panel.config.blueprint.overview.re_import_success",
        { name: importResult!.blueprint.metadata.name }
      ),
    });
  };

  private _delete = async (blueprint: BlueprintMetaDataPath) => {
    const related = await findRelated(
      this.hass,
      `${blueprint.domain}_blueprint`,
      blueprint.path
    );
    if (related.automation?.length || related.script?.length) {
      const type = this.hass.localize(
        `ui.panel.config.blueprint.overview.types_plural.${blueprint.domain}`
      );
      const result = await showConfirmationDialog(this, {
        title: this.hass.localize(
          "ui.panel.config.blueprint.overview.blueprint_in_use_title"
        ),
        text: this.hass.localize(
          "ui.panel.config.blueprint.overview.blueprint_in_use_text",
          {
            type,
            list: html`<ul>
              ${[...(related.automation || []), ...(related.script || [])].map(
                (item) => {
                  const automationState = this.hass.states[item];
                  return html`<li>
                    ${
                      automationState
                        ? `${this.hass.formatEntityName(automationState)} (${item})`
                        : item
                    }
                  </li>`;
                }
              )}
            </ul>`,
          }
        ),
        confirmText: this.hass!.localize(
          `ui.panel.config.blueprint.overview.blueprint_in_use_view_${blueprint.domain}`
        ),
      });
      if (result) {
        navigate(
          `/config/${blueprint.domain}/dashboard?blueprint=${encodeURIComponent(
            blueprint.path
          )}`
        );
      }
      return;
    }
    if (
      !(await showConfirmationDialog(this, {
        title: this.hass.localize(
          "ui.panel.config.blueprint.overview.confirm_delete_title"
        ),
        text: this.hass.localize(
          "ui.panel.config.blueprint.overview.confirm_delete_text",
          { name: blueprint.name }
        ),
        confirmText: this.hass!.localize("ui.common.delete"),
        dismissText: this.hass!.localize("ui.common.cancel"),
        destructive: true,
      }))
    ) {
      return;
    }
    await deleteBlueprint(this.hass, blueprint.domain, blueprint.path);
    fireEvent(this, "reload-blueprints");
  };

  private _handleSelectionChanged = (
    ev: HASSDomEvent<SelectionChangedEvent>
  ): void => {
    this._selected = ev.detail.value;
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

  private _bulkActions(): BulkAction[] {
    // The usage of each blueprint decides what can be deleted, so the actions
    // wait for it
    const disabled = this._usageCountsLoading;
    return [
      {
        id: "reimport",
        label: this.hass.localize(
          "ui.panel.config.blueprint.overview.re_import_blueprint"
        ),
        path: mdiDownload,
        preview: true,
        disabled,
      },
      {
        id: "delete",
        label: this.hass.localize("ui.common.delete"),
        path: mdiDelete,
        destructive: true,
        disabled,
      },
    ];
  }

  private _selectedItems(): BulkBlueprintItem[] {
    return this._processedBlueprints(
      this.blueprints,
      this.hass.localize,
      this._usageCounts,
      this._deletedFullpaths,
      []
    )
      .filter((row) => this._selected.includes(row.fullpath))
      .map((row) => ({
        fullpath: row.fullpath,
        type: row.type,
        path: row.path,
        name: row.error ? row.path : row.name,
        error: row.error,
        sourceUrl: row.source_url,
        usageAutomations: row.usageAutomations ?? 0,
        usageScripts: row.usageScripts ?? 0,
      }));
  }

  /** What the action will do to the selected blueprints, shown first. */
  private _bulkPreview = (id: string): BulkPreview | undefined => {
    const hidden = hiddenTableSelection(this._dataTable);
    if (id === "delete") {
      return blueprintDeletePreview(
        this._bulkLocalize,
        this._selectedItems(),
        hidden
      );
    }
    if (id === "reimport") {
      return blueprintReImportPreview(
        this._bulkLocalize,
        this._selectedItems(),
        hidden
      );
    }
    return undefined;
  };

  /**
   * The bar already showed the effect and asked (twice for a delete), so no
   * further dialog follows: the work starts at once.
   */
  private _bulkConfirm = (ev: CustomEvent<{ id: string }>) => {
    if (ev.detail.id === "delete") {
      this._deleteSelected();
    } else if (ev.detail.id === "reimport") {
      this._reImportSelected();
    }
  };

  private async _deleteSelected() {
    // Look at the usage once more now, so a blueprint that became used since
    // the table read it is never sent to the delete call
    const items = this._selectedItems();
    const checks = await Promise.allSettled(
      items.map((item) =>
        findRelated(this.hass, `${item.type}_blueprint`, item.path)
      )
    );
    if (checks.some((check) => check.status === "rejected")) {
      showAlertDialog(this, {
        title: this.hass.localize(
          "ui.panel.config.blueprint.overview.delete_check_failed_title"
        ),
        text: this.hass.localize(
          "ui.panel.config.blueprint.overview.delete_check_failed"
        ),
      });
      return;
    }
    const fresh = items.map((item, index) => {
      const check = checks[index];
      const related = check.status === "fulfilled" ? check.value : undefined;
      return {
        ...item,
        usageAutomations: related?.automation?.length ?? 0,
        usageScripts: related?.script?.length ?? 0,
      };
    });
    const plan = planBlueprintDelete(fresh);
    const results = await Promise.allSettled(
      plan.run.map((item) => deleteBlueprint(this.hass, item.type, item.path))
    );
    const summary = summarizeBlueprintResults(plan, results);
    this._deletedFullpaths = [
      ...this._deletedFullpaths,
      ...summary.succeeded.map((item) => item.fullpath),
    ];
    this._dataTable?.setCheckedRowIds(
      this._selected.filter(
        (id) => !summary.succeeded.some((item) => item.fullpath === id)
      )
    );
    fireEvent(this, "reload-blueprints");
    this._reportBulk(summary, "delete");
  }

  private async _reImportSelected() {
    const plan: BlueprintBulkPlan = planBlueprintReImport(
      this._selectedItems()
    );
    const results = await reImportBlueprints(plan, {
      importFn: (url) => importBlueprint(this.hass, url),
      saveFn: (item, raw, url) =>
        saveBlueprint(this.hass, item.type, item.path, raw, url, true),
    });
    const summary = summarizeBlueprintResults(plan, results);
    if (summary.succeeded.length) {
      fireEvent(this, "reload-blueprints");
    }
    this._reportBulk(summary, "reimport");
  }

  /** One line for the whole outcome, and an alert that names any failures. */
  private _reportBulk(
    summary: ReturnType<typeof summarizeBlueprintResults>,
    kind: "delete" | "reimport"
  ) {
    const line = blueprintResultLine(this._bulkLocalize, summary, kind);
    if (!summary.failed.length) {
      showToast(this, { message: line });
      return;
    }
    showAlertDialog(this, {
      title: this.hass.localize(
        kind === "delete"
          ? "ui.panel.config.blueprint.overview.delete_failed_title"
          : "ui.panel.config.blueprint.overview.bulk_reimport_failed_title"
      ),
      text: `${line} ${summary.failed
        .map((failure) => {
          const detail = blueprintFailureDetail(this._bulkLocalize, failure);
          return detail
            ? `${failure.item.name} (${detail})`
            : failure.item.name;
        })
        .join(", ")}`,
    });
  }

  private _handleCollapseChanged(ev: CustomEvent) {
    this._activeCollapsed = ev.detail.value;
  }

  private _handleColumnsChanged(ev: CustomEvent) {
    this._activeColumnOrder = ev.detail.columnOrder;
    this._activeHiddenColumns = ev.detail.hiddenColumns;
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        .filter-chips {
          padding: var(--ha-space-2) var(--ha-space-4);
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
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-blueprint-overview": HaBlueprintOverview;
  }
}
