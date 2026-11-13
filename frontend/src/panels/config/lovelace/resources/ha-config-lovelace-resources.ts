import { mdiDelete, mdiPlus, mdiRefresh } from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import memoize from "memoize-one";
import "../../../../components/bulk/ha-bulk-bar";
import type {
  BulkAction,
  BulkPreview,
} from "../../../../components/bulk/bulk-selection";
import {
  filteredTableCount,
  hiddenTableSelection,
  invertTableRows,
  selectAllTableRows,
} from "../../../../components/bulk/table-selection";
import type { HASSDomEvent } from "../../../../common/dom/fire_event";
import { DataTableSettingsController } from "../../../../common/controllers/data-table-settings-controller";
import { stringCompare } from "../../../../common/string/compare";
import type { LocalizeFunc } from "../../../../common/translations/localize";
import type {
  DataTableColumnContainer,
  RowClickedEvent,
  SelectionChangedEvent,
} from "../../../../components/data-table/ha-data-table";
import "../../../../components/ha-card";
import "../../../../components/ha-button";
import "../../../../components/ha-icon-button";
import "../../../../components/ha-svg-icon";
import type {
  LovelaceInfo,
  LovelaceResource,
} from "../../../../data/lovelace/resource";
import {
  createResource,
  uploadResource,
  deleteResource,
  fetchLovelaceInfo,
  fetchResources,
  updateResource,
} from "../../../../data/lovelace/resource";
import {
  showAlertDialog,
  showConfirmationDialog,
} from "../../../../dialogs/generic/show-dialog-box";
import "../../../../layouts/hass-loading-screen";
import "../../../../layouts/hass-subpage";
import "../../../../layouts/hass-tabs-subpage-data-table";
import type { HaTabsSubpageDataTable } from "../../../../layouts/hass-tabs-subpage-data-table";
import { haStyle } from "../../../../resources/styles";
import type { HomeAssistant, Route } from "../../../../types";
import { loadLovelaceResources } from "../../../lovelace/common/load-resources";
import { lovelaceResourcesTabs } from "../ha-config-lovelace";
import {
  consentBeforeResourceSave,
  recordResourceConsent,
} from "../../extensions/extension-consent";
import { showResourceDetailDialog } from "./show-dialog-lovelace-resource-detail";
import { storage } from "../../../../common/decorators/storage";
import {
  buildResourceDeletePreview,
  summarizeResourceDelete,
} from "./resource-bulk-actions";

@customElement("ha-config-lovelace-resources")
export class HaConfigLovelaceResources extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: "is-wide", type: Boolean }) public isWide = false;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: false }) public route!: Route;

  @state() private _resources: LovelaceResource[] = [];

  @state() private _loaded = false;

  @state() private _lovelaceInfo?: LovelaceInfo;

  @state() private _selected: string[] = [];

  // Not cached, the table only renders once the resources have loaded
  @query("hass-tabs-subpage-data-table")
  private _dataTable?: HaTabsSubpageDataTable;

  private _tableSettings = new DataTableSettingsController(this, {
    search: "lovelace-resources-table-search",
    sorting: "lovelace-resources-table-sort",
  });

  @storage({
    key: "lovelace-resources-table-column-order",
    state: false,
    subscribe: false,
  })
  private _activeColumnOrder?: string[];

  @storage({
    key: "lovelace-resources-table-hidden-columns",
    state: false,
    subscribe: false,
  })
  private _activeHiddenColumns?: string[];

  private _columns = memoize(
    (
      _language,
      localize: LocalizeFunc
    ): DataTableColumnContainer<LovelaceResource> => ({
      url: {
        main: true,
        title: localize(
          "ui.panel.config.lovelace.resources.picker.headers.url"
        ),
        sortable: true,
        filterable: true,
        direction: "asc",
        flex: 2,
        forceLTR: true,
      },
      type: {
        title: localize(
          "ui.panel.config.lovelace.resources.picker.headers.type"
        ),
        sortable: true,
        filterable: true,
        template: (resource) => html`
          ${
            this.hass.localize(
              `ui.panel.config.lovelace.resources.types.${resource.type}`
            ) || resource.type
          }
        `,
      },
      delete: {
        title: "",
        label: localize(
          "ui.panel.config.lovelace.resources.picker.headers.delete"
        ),
        type: "icon-button",
        minWidth: "48px",
        maxWidth: "48px",
        showNarrow: true,
        template: (resource) =>
          html`<ha-icon-button
            @click=${this._removeResource}
            .label=${this.hass.localize("ui.common.delete")}
            .path=${mdiDelete}
            .resource=${resource}
          ></ha-icon-button>`,
      },
    })
  );

  protected render(): TemplateResult {
    if (!this.hass || !this._loaded) {
      return html` <hass-loading-screen></hass-loading-screen> `;
    }

    if (this.hass.config.safe_mode) {
      return html`
        <hass-subpage
          .hass=${this.hass}
          .narrow=${this.narrow}
          back-path="/config"
          .header=${this.hass.localize(
            "ui.panel.config.lovelace.resources.caption"
          )}
        >
          <div class="content">
            <ha-card outlined>
              <div class="card-content">
                <h2>
                  ${this.hass.localize(
                    "ui.panel.config.lovelace.resources.unavailable"
                  )}
                </h2>
                <p>
                  ${this.hass.localize(
                    "ui.panel.config.lovelace.resources.unavailable_safe_mode"
                  )}
                </p>
              </div>
            </ha-card>
          </div>
        </hass-subpage>
      `;
    }

    const isYamlMode = this._lovelaceInfo?.resource_mode === "yaml";

    return html`
      <hass-tabs-subpage-data-table
        .hass=${this.hass}
        .narrow=${this.narrow}
        .route=${this.route}
        back-path="/config/lovelace/dashboards"
        .tabs=${lovelaceResourcesTabs}
        .columns=${this._columns(this.hass.language, this.hass.localize)}
        .data=${this._resources}
        .noDataText=${this.hass.localize(
          "ui.panel.config.lovelace.resources.picker.no_resources"
        )}
        .initialSorting=${this._tableSettings.sorting}
        .columnOrder=${this._activeColumnOrder}
        .hiddenColumns=${this._activeHiddenColumns}
        @columns-changed=${this._handleColumnsChanged}
        @sorting-changed=${this._tableSettings.sortingChanged}
        .filter=${this._tableSettings.search}
        @search-changed=${this._tableSettings.searchChanged}
        sync-url
        ?selectable=${!isYamlMode}
        keep-hidden-selection
        .selected=${this._selected.length}
        @selection-changed=${this._handleSelectionChanged}
        @filtered-rows-changed=${this._filteredRowsChanged}
        ?bulk-bar=${this._selected.length > 0}
        @row-click=${this._editResource}
        has-fab
        clickable
      >
        ${
          isYamlMode
            ? html`
                <ha-icon-button
                  slot="toolbar-icon"
                  .label=${this.hass.localize(
                    "ui.panel.config.lovelace.resources.reload_resources"
                  )}
                  .path=${mdiRefresh}
                  @click=${this._handleReloadResources}
                ></ha-icon-button>
              `
            : ""
        }
        <ha-button slot="fab" size="l" @click=${this._addResource}>
          <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
          ${this.hass.localize(
            "ui.panel.config.lovelace.resources.picker.add_resource"
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
                @bulk-confirm=${this._deleteSelected}
              ></ha-bulk-bar>
            </div>`
          : nothing
      }
    `;
  }

  private _handleSelectionChanged(
    ev: HASSDomEvent<SelectionChangedEvent>
  ): void {
    this._selected = ev.detail.value;
  }

  private _bulkLocalize = (
    key: string,
    values?: Record<string, string | number>
  ): string => this.hass.localize(key as any, values);

  private _bulkActions(): BulkAction[] {
    return [
      {
        id: "delete",
        label: this.hass.localize("ui.common.delete"),
        path: mdiDelete,
        destructive: true,
      },
    ];
  }

  /**
   * What deleting the selected resources will do. Which dashboards load a
   * resource is not part of the data this page loads, so no usage is passed
   * and the preview says that it cannot be known.
   */
  private _bulkPreview = (id: string): BulkPreview | undefined => {
    if (id !== "delete") {
      return undefined;
    }
    return buildResourceDeletePreview(
      {
        resources: this._resources,
        selectedIds: this._selected,
        hiddenCount: hiddenTableSelection(this._dataTable),
        ownHost: location.host,
      },
      this._bulkLocalize
    );
  };

  private _filteredRowsChanged = () => {
    if (this._selected.length) {
      this.requestUpdate();
    }
  };

  private _selectAllRows = () => selectAllTableRows(this._dataTable);

  private _invertRows = () => invertTableRows(this._dataTable);

  private _clearRows = () => this._dataTable?.clearSelection();

  /**
   * The bar already showed what will be deleted and asked twice, so no
   * further dialog asks again. Each resource is handled on its own, and the
   * ones that fail stay selected.
   */
  private _deleteSelected = async () => {
    if (this._lovelaceInfo?.resource_mode !== "storage") {
      return;
    }
    const ids = [...this._selected];
    const results = await Promise.allSettled(
      ids.map((id) => deleteResource(this.hass, id))
    );
    const { deletedIds, failedIds } = summarizeResourceDelete(ids, results);
    const deleted = new Set(deletedIds);
    const failedAddresses = this._resources
      .filter((res) => failedIds.includes(res.id))
      .map((res) => res.url);
    this._resources = this._resources.filter(({ id }) => !deleted.has(id));
    this._dataTable?.setCheckedRowIds(failedIds);
    if (failedIds.length) {
      // The alert and the refresh prompt share one dialog element, so wait
      // for the failure notice to be dismissed before asking about refresh.
      await showAlertDialog(this, {
        title: this.hass.localize(
          "ui.panel.config.lovelace.resources.bulk_delete_failed_title"
        ),
        text: this.hass.localize(
          "ui.panel.config.lovelace.resources.bulk_delete_failed_named",
          { addresses: failedAddresses.join(", ") }
        ),
      });
    }
    if (deletedIds.length) {
      showConfirmationDialog(this, {
        title: this.hass.localize(
          "ui.panel.config.lovelace.resources.refresh_header"
        ),
        text: this.hass.localize(
          "ui.panel.config.lovelace.resources.refresh_body"
        ),
        confirmText: this.hass.localize("ui.common.refresh"),
        dismissText: this.hass.localize("ui.common.not_now"),
        confirm: () => location.reload(),
      });
    }
  };

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);
    this._fetchData();
  }

  private async _fetchData() {
    const [resources, lovelaceInfo] = await Promise.all([
      fetchResources(this.hass.connection),
      fetchLovelaceInfo(this.hass),
    ]);
    this._resources = resources;
    this._lovelaceInfo = lovelaceInfo;
    this._loaded = true;
  }

  private _editResource(ev: CustomEvent) {
    if (this._lovelaceInfo?.resource_mode !== "storage") {
      showAlertDialog(this, {
        text: this.hass!.localize(
          "ui.panel.config.lovelace.resources.cant_edit_yaml"
        ),
      });
      return;
    }
    const id = (ev.detail as RowClickedEvent).id;
    const resource = this._resources.find((res) => res.id === id);
    this._openDialog(resource);
  }

  private _addResource() {
    if (this._lovelaceInfo?.resource_mode !== "storage") {
      showAlertDialog(this, {
        text: this.hass!.localize(
          "ui.panel.config.lovelace.resources.cant_edit_yaml"
        ),
      });
      return;
    }
    this._openDialog();
  }

  private async _openDialog(resource?: LovelaceResource): Promise<void> {
    showResourceDetailDialog(this, {
      resource,
      allowUpload: true,
      createResource: async (values, file) => {
        await consentBeforeResourceSave(this, this.hass!, values);
        const created = file
          ? await uploadResource(this.hass!, file)
          : await createResource(this.hass!, values);
        recordResourceConsent(this.hass!, created);
        this._resources = this._resources!.concat(created).sort((res1, res2) =>
          stringCompare(res1.url, res2.url, this.hass!.locale.language)
        );
        loadLovelaceResources([created], this.hass!);
      },
      updateResource: async (values) => {
        await consentBeforeResourceSave(this, this.hass!, values, resource);
        const updated = await updateResource(this.hass!, resource!.id, values);
        recordResourceConsent(this.hass!, updated);
        this._resources = this._resources!.map((res) =>
          res === resource ? updated : res
        );
        loadLovelaceResources([updated], this.hass!);
      },
    });
  }

  private _removeResource = async (event: any) => {
    if (this._lovelaceInfo?.resource_mode !== "storage") {
      showAlertDialog(this, {
        text: this.hass!.localize(
          "ui.panel.config.lovelace.resources.cant_edit_yaml"
        ),
      });
      return false;
    }

    const resource = event.currentTarget.resource as LovelaceResource;

    if (
      !(await showConfirmationDialog(this, {
        title: this.hass!.localize(
          "ui.panel.config.lovelace.resources.confirm_delete_title"
        ),
        text: this.hass!.localize(
          "ui.panel.config.lovelace.resources.confirm_delete_text",
          { url: resource.url }
        ),
        dismissText: this.hass!.localize("ui.common.cancel"),
        confirmText: this.hass!.localize("ui.common.delete"),
        destructive: true,
      }))
    ) {
      return false;
    }

    try {
      await deleteResource(this.hass!, resource.id);
      this._resources = this._resources!.filter(({ id }) => id !== resource.id);
      showConfirmationDialog(this, {
        title: this.hass!.localize(
          "ui.panel.config.lovelace.resources.refresh_header"
        ),
        text: this.hass!.localize(
          "ui.panel.config.lovelace.resources.refresh_body"
        ),
        confirmText: this.hass.localize("ui.common.refresh"),
        dismissText: this.hass.localize("ui.common.not_now"),
        confirm: () => location.reload(),
      });
      return true;
    } catch (_err: any) {
      return false;
    }
  };

  private _handleColumnsChanged(ev: CustomEvent) {
    this._activeColumnOrder = ev.detail.columnOrder;
    this._activeHiddenColumns = ev.detail.hiddenColumns;
  }

  private _handleReloadResources() {
    this.hass.callService("lovelace", "reload_resources");
    showConfirmationDialog(this, {
      title: this.hass.localize(
        "ui.panel.config.lovelace.resources.reload_refresh_header"
      ),
      text: this.hass.localize(
        "ui.panel.config.lovelace.resources.reload_refresh_body"
      ),
      confirmText: this.hass.localize("ui.common.refresh"),
      dismissText: this.hass.localize("ui.common.not_now"),
      confirm: () => location.reload(),
    });
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        .content {
          padding: 28px 20px 0;
          max-width: 1040px;
          margin: 0 auto;
        }
        h2 {
          margin-top: 0;
          margin-bottom: 12px;
        }
        p {
          margin: 0;
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
    "ha-config-lovelace-resources": HaConfigLovelaceResources;
  }
}
