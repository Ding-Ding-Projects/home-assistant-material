import {
  mdiDelete,
  mdiHelpCircleOutline,
  mdiMemoryArrowDown,
  mdiNfcVariant,
  mdiPencil,
  mdiPlus,
  mdiRobot,
} from "@mdi/js";
import type { CSSResultGroup, PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { DataTableSettingsController } from "../../../common/controllers/data-table-settings-controller";
import type { HASSDomEvent } from "../../../common/dom/fire_event";
import { computeStateDomain } from "../../../common/entity/compute_state_domain";
import type { LocalizeFunc } from "../../../common/translations/localize";
import { hasRejectedItems } from "../../../common/util/promise-all-settled-results";
import type {
  BulkAction,
  BulkPreview,
  BulkPreviewItem,
} from "../../../components/bulk/bulk-selection";
import "../../../components/bulk/ha-bulk-bar";
import {
  filteredTableCount,
  hiddenTableSelection,
  invertTableRows,
  selectAllTableRows,
} from "../../../components/bulk/table-selection";
import type {
  DataTableColumnContainer,
  RowClickedEvent,
  SelectionChangedEvent,
} from "../../../components/data-table/ha-data-table";
import "../../../components/ha-button";
import "../../../components/ha-icon-button";
import "../../../components/ha-icon-overflow-menu";
import "../../../components/ha-relative-time";
import "../../../components/ha-svg-icon";
import type { TagTrigger } from "../../../data/automation";
import {
  getAutomationStateConfig,
  showAutomationEditor,
} from "../../../data/automation";
import type { Tag, TagScannedEvent, UpdateTagParams } from "../../../data/tag";
import {
  createTag,
  deleteTag,
  EVENT_TAG_SCANNED,
  fetchTags,
  updateTag,
} from "../../../data/tag";
import {
  showAlertDialog,
  showConfirmationDialog,
} from "../../../dialogs/generic/show-dialog-box";
import "../../../layouts/hass-tabs-subpage-data-table";
import type { HaTabsSubpageDataTable } from "../../../layouts/hass-tabs-subpage-data-table";
import { SubscribeMixin } from "../../../mixins/subscribe-mixin";
import type { HomeAssistant, Route } from "../../../types";
import { documentationUrl } from "../../../util/documentation-url";
import { configSections } from "../config-sections";
import { showTagDetailDialog } from "./show-dialog-tag-detail";
import {
  buildTagDeletePreview,
  shortNameList,
  summarizeTagDelete,
  tagDisplayName,
  tagIdsInAutomationConfig,
  tagUsageById,
} from "./tag-bulk-actions";
import "./tag-image";

export interface TagRowData extends Tag {
  display_name: string;
  last_scanned_datetime: Date | null;
}

@customElement("ha-config-tags")
export class HaConfigTags extends SubscribeMixin(LitElement) {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: "is-wide", type: Boolean }) public isWide = false;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: false }) public route!: Route;

  @state() private _tags: Tag[] = [];

  @state() private _loading = true;

  @state() private _loadFailed = false;

  @state() private _selected: string[] = [];

  // Which automations use which tag, read when a selection is first made
  @state() private _usage?: Record<string, string[]>;

  @state() private _usageFailed = false;

  private _usageLoading = false;

  @query("hass-tabs-subpage-data-table", true)
  private _dataTable!: HaTabsSubpageDataTable;

  private get _canWriteTags() {
    return this.hass.auth.external?.config.canWriteTag;
  }

  private _tableSettings = new DataTableSettingsController(this, {
    search: "tags-table-search",
  });

  private _columns = memoizeOne((localize: LocalizeFunc) => {
    const columns: DataTableColumnContainer<TagRowData> = {
      icon: {
        title: "",
        moveable: false,
        showNarrow: true,
        label: localize("ui.panel.config.tag.headers.icon"),
        type: "icon",
        template: (tag) => html`<tag-image .tag=${tag}></tag-image>`,
      },
      display_name: {
        title: localize("ui.panel.config.tag.headers.name"),
        main: true,
        sortable: true,
        urlName: "name",
        filterable: true,
        flex: 2,
      },
      id: {
        title: localize("ui.panel.config.tag.headers.tag_id"),
        sortable: true,
        filterable: true,
        defaultHidden: true,
      },
      last_scanned_datetime: {
        title: localize("ui.panel.config.tag.headers.last_scanned"),
        sortable: true,
        urlName: "last_scanned",
        direction: "desc",
        flex: 2,
        template: (tag) => {
          if (!tag.last_scanned_datetime) {
            return html`${this.hass.localize(
              "ui.panel.config.tag.never_scanned"
            )}`;
          }
          const device = tag.device_id
            ? this.hass.devices[tag.device_id]
            : undefined;
          const deviceName = device?.name_by_user || device?.name;
          return html`<ha-relative-time
              .datetime=${tag.last_scanned_datetime}
              capitalize
            ></ha-relative-time
            >${
              deviceName
                ? html`,
                  ${this.hass.localize("ui.panel.config.tag.scanned_by", {
                    device: deviceName,
                  })}`
                : nothing
            }`;
        },
      },
      create_automation: {
        title: "",
        label: localize("ui.panel.config.tag.create_automation"),
        type: "icon-button",
        minWidth: "190px",
        maxWidth: "190px",
        template: (tag) =>
          html`<ha-button
            appearance="plain"
            size="s"
            .tag=${tag}
            @click=${this._handleCreateAutomationClick}
          >
            <ha-svg-icon slot="start" .path=${mdiRobot}></ha-svg-icon>
            ${localize("ui.panel.config.tag.create_automation")}
          </ha-button>`,
      },
      edit: {
        title: "",
        label: localize("ui.panel.config.tag.edit"),
        type: "icon-button",
        showNarrow: true,
        moveable: false,
        template: (tag) =>
          html`<ha-icon-button
            .tag=${tag}
            @click=${this._handleEditClick}
            .label=${localize("ui.panel.config.tag.edit")}
            .path=${mdiPencil}
          ></ha-icon-button>`,
      },
    };
    if (this._canWriteTags) {
      columns.write = {
        title: "",
        label: localize("ui.panel.config.tag.headers.write"),
        type: "icon-button",
        showNarrow: true,
        template: (tag) =>
          html`<ha-icon-button
            .tag=${tag}
            @click=${this._handleWriteClick}
            .label=${this.hass.localize("ui.panel.config.tag.write")}
            .path=${mdiMemoryArrowDown}
          ></ha-icon-button>`,
      };
    }
    columns.actions = {
      title: "",
      label: localize("ui.panel.config.generic.headers.actions"),
      showNarrow: true,
      moveable: false,
      hideable: false,
      type: "overflow-menu",
      template: (tag) => html`
        <ha-icon-overflow-menu
          narrow
          .items=${[
            {
              label: this.hass.localize(
                "ui.panel.config.tag.create_automation"
              ),
              path: mdiRobot,
              action: () => this._createAutomation(tag),
            },
            {
              label: this.hass.localize("ui.common.delete"),
              path: mdiDelete,
              action: () => this._removeTag(tag),
              warning: true,
            },
          ]}
        >
        </ha-icon-overflow-menu>
      `,
    };
    return columns;
  });

  private _data = memoizeOne((tags: Tag[]): TagRowData[] =>
    tags.map((tag) => ({
      ...tag,
      display_name: tag.name || tag.id,
      last_scanned_datetime: tag.last_scanned
        ? new Date(tag.last_scanned)
        : null,
    }))
  );

  protected firstUpdated(changedProperties: PropertyValues<this>) {
    super.firstUpdated(changedProperties);
    this._fetchTags();
  }

  protected hassSubscribe() {
    return [
      this.hass.connection.subscribeEvents<TagScannedEvent>((ev) => {
        const foundTag = this._tags.find((tag) => tag.id === ev.data.tag_id);
        if (!foundTag) {
          this._fetchTags();
          return;
        }
        foundTag.last_scanned = ev.time_fired;
        foundTag.device_id = ev.data.device_id;
        this._tags = [...this._tags];
      }, EVENT_TAG_SCANNED),
    ];
  }

  protected render() {
    return html`
      <hass-tabs-subpage-data-table
        .hass=${this.hass}
        .narrow=${this.narrow}
        back-path="/config/connectivity"
        .route=${this.route}
        .tabs=${configSections.tags}
        .columns=${this._columns(this.hass.localize)}
        .loading=${this._loading}
        .data=${this._data(this._tags)}
        .noDataText=${this.hass.localize("ui.panel.config.tag.no_tags")}
        .loadError=${
          this._loadFailed
            ? this.hass.localize("ui.panel.config.tag.load_failed")
            : undefined
        }
        .summary=${this.hass.localize("ui.panel.config.tag.summary")}
        .appendRow=${this._waitingCard(this.hass.localize)}
        @retry-load=${this._retryFetchTags}
        .filter=${this._tableSettings.search}
        @search-changed=${this._tableSettings.searchChanged}
        sync-url
        selectable
        keep-hidden-selection
        .selected=${this._selected.length}
        ?bulk-bar=${this._selected.length > 0}
        @selection-changed=${this._handleSelectionChanged}
        @filtered-rows-changed=${this._filteredRowsChanged}
        has-fab
        clickable
        @row-click=${this._editTag}
        id="id"
      >
        <ha-icon-button
          slot="toolbar-icon"
          @click=${this._showHelp}
          .label=${this.hass.localize("ui.common.help")}
          .path=${mdiHelpCircleOutline}
        ></ha-icon-button>
        <ha-button slot="fab" size="l" @click=${this._addTag}>
          <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
          ${this.hass.localize("ui.panel.config.tag.add_tag")}
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

  private _waitingCard = memoizeOne(
    (localize: LocalizeFunc) =>
      html`<div
        style="display: flex; align-items: center; gap: var(--ha-space-4); margin: var(--ha-space-2) var(--ha-space-4); padding: var(--ha-space-5) var(--ha-space-6); border-radius: var(--ha-border-radius-3xl); background: var(--secondary-background-color);"
      >
        <ha-svg-icon
          .path=${mdiNfcVariant}
          style="flex: none; --mdc-icon-size: 32px; color: var(--primary-color);"
        ></ha-svg-icon>
        <div role="status">
          <div
            style="font-size: var(--ha-font-size-l); font-weight: var(--ha-font-weight-medium);"
          >
            ${localize("ui.panel.config.tag.waiting_title")}
          </div>
          <div style="color: var(--secondary-text-color);">
            ${localize("ui.panel.config.tag.waiting_text")}
          </div>
        </div>
      </div>`
  );

  private _handleCreateAutomationClick = (ev: Event) => {
    ev.stopPropagation();
    this._createAutomation((ev.currentTarget as any).tag);
  };

  private _handleEditClick = (ev: Event) => {
    ev.stopPropagation();
    this._openDialog((ev.currentTarget as any).tag);
  };

  private _handleWriteClick = (ev: Event) =>
    this._openWrite((ev.currentTarget as any).tag);

  private _createAutomation = (tag: Tag) => {
    const data = {
      alias: this.hass.localize("ui.panel.config.tag.automation_title", {
        name: tag.name || tag.id,
      }),
      trigger: [{ trigger: "tag", tag_id: tag.id } as TagTrigger],
    };
    showAutomationEditor(data);
  };

  private _editTag = (ev: CustomEvent<RowClickedEvent>) => {
    const tag = this._tags.find((t) => t.id === ev.detail.id);
    this._openDialog(tag);
  };

  private _showHelp() {
    showAlertDialog(this, {
      title: this.hass.localize("ui.panel.config.tag.caption"),
      text: html`
        <p>
          ${this.hass.localize("ui.panel.config.tag.detail.usage", {
            companion_link: this.hass!.localize(
              "ui.panel.config.tag.detail.companion_apps"
            ),
          })}
        </p>
        <p>
          <a
            href=${documentationUrl(this.hass, "/integrations/tag/")}
            target="_blank"
            rel="noreferrer"
          >
            ${this.hass.localize("ui.panel.config.tag.learn_more")}
          </a>
        </p>
      `,
    });
  }

  private async _fetchTags() {
    try {
      this._tags = await fetchTags(this.hass);
      this._loadFailed = false;
    } catch {
      this._loadFailed = true;
    } finally {
      this._loading = false;
    }
  }

  private _retryFetchTags() {
    this._loading = true;
    this._fetchTags();
  }

  private _openWrite(tag: Tag) {
    this.hass.auth.external!.fireMessage({
      type: "tag/write",
      payload: { name: tag.name || null, tag: tag.id },
    });
  }

  private _addTag() {
    this._openDialog();
  }

  private _openDialog(entry?: Tag) {
    showTagDetailDialog(this, {
      entry,
      openWrite: this._canWriteTags ? (tag) => this._openWrite(tag) : undefined,
      createEntry: (values, tagId) => this._createTag(values, tagId),
      updateEntry: entry
        ? (values) => this._updateTag(entry, values)
        : undefined,
      removeEntry: entry ? () => this._removeTag(entry) : undefined,
    });
  }

  private async _createTag(
    values: Partial<UpdateTagParams>,
    tagId?: string
  ): Promise<Tag> {
    const newTag = await createTag(this.hass, values, tagId);
    this._tags = [...this._tags, newTag];
    return newTag;
  }

  private async _updateTag(
    selectedTag: Tag,
    values: Partial<UpdateTagParams>
  ): Promise<Tag> {
    const updated = await updateTag(this.hass, selectedTag.id, values);
    this._tags = this._tags.map((tag) =>
      tag.id === selectedTag.id ? updated : tag
    );
    return updated;
  }

  private async _removeTag(selectedTag: Tag) {
    if (
      !(await showConfirmationDialog(this, {
        title: this.hass!.localize("ui.panel.config.tag.confirm_delete_title"),
        text: this.hass.localize("ui.panel.config.tag.confirm_delete", {
          tag: selectedTag.name || selectedTag.id,
        }),
        dismissText: this.hass!.localize("ui.common.cancel"),
        confirmText: this.hass!.localize("ui.common.delete"),
        destructive: true,
      }))
    ) {
      return false;
    }
    try {
      await deleteTag(this.hass, selectedTag.id);
      this._tags = this._tags.filter((tag) => tag.id !== selectedTag.id);
      return true;
    } catch (_err: any) {
      return false;
    }
  }

  private _handleSelectionChanged = (
    ev: HASSDomEvent<SelectionChangedEvent>
  ): void => {
    this._selected = ev.detail.value;
    if (this._selected.length) {
      this._loadUsage();
    }
  };

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

  /** Reads which automations have a tag trigger, once, for the preview. */
  private async _loadUsage() {
    if (this._usage || this._usageLoading) {
      return;
    }
    this._usageLoading = true;
    this._usageFailed = false;
    try {
      // Automations written in YAML without an id have no stored config to
      // read, so they are left out instead of counted as failures.
      const automations = Object.values(this.hass.states).filter(
        (stateObj) =>
          computeStateDomain(stateObj) === "automation" &&
          Boolean(stateObj.attributes.id)
      );
      // Ask in small batches so a large instance does not flood the
      // connection, which matters most on a phone.
      const results: PromiseSettledResult<
        Awaited<ReturnType<typeof getAutomationStateConfig>>
      >[] = [];
      for (let start = 0; start < automations.length; start += 10) {
        results.push(
          // eslint-disable-next-line no-await-in-loop
          ...(await Promise.allSettled(
            automations
              .slice(start, start + 10)
              .map((stateObj) =>
                getAutomationStateConfig(this.hass, stateObj.entity_id)
              )
          ))
        );
      }
      this._usageFailed = hasRejectedItems(results);
      this._usage = tagUsageById(
        results.flatMap((result, index) =>
          result.status === "fulfilled"
            ? [
                {
                  name:
                    automations[index].attributes.friendly_name ||
                    automations[index].entity_id,
                  tagIds: tagIdsInAutomationConfig(result.value.config),
                },
              ]
            : []
        )
      );
    } finally {
      this._usageLoading = false;
    }
  }

  /** What deleting the selected tags will do, shown before it is asked. */
  private _bulkPreview = (id: string): BulkPreview | undefined => {
    if (id !== "delete") {
      return undefined;
    }
    const localize = this.hass.localize;
    const preview = buildTagDeletePreview(
      this._tags,
      this._selected,
      this._usage ?? {},
      hiddenTableSelection(this._dataTable)
    );
    const count = preview.deletable.length;
    const items: BulkPreviewItem[] = [];
    if (count) {
      items.push({
        kind: "change",
        text: `${localize("ui.panel.config.tag.bulk_preview_delete", {
          count,
        })}: ${shortNameList(preview.deletable.map(tagDisplayName))}`,
      });
    }
    if (preview.skipped.length) {
      items.push({
        kind: "same",
        text: localize("ui.panel.config.tag.bulk_preview_skipped", {
          count: preview.skipped.length,
        }),
      });
    }
    if (preview.hiddenCount > 0) {
      items.push({
        kind: "same",
        text: localize("ui.bulk.preview_hidden", {
          count: preview.hiddenCount,
        }),
      });
    }
    if (!this._usage) {
      items.push({
        kind: "same",
        text: localize("ui.panel.config.tag.bulk_preview_checking"),
      });
    } else if (this._usageFailed) {
      items.push({
        kind: "same",
        text: localize("ui.panel.config.tag.bulk_preview_usage_unknown"),
      });
    }
    preview.warnings.slice(0, 5).forEach((warning) => {
      items.push({
        kind: "skip",
        text: localize("ui.panel.config.tag.bulk_preview_used", {
          tag: tagDisplayName(warning.tag),
          automations: warning.automations.join(", "),
        }),
      });
    });
    if (preview.warnings.length > 5) {
      items.push({
        kind: "skip",
        text: localize("ui.panel.config.tag.bulk_preview_used_more", {
          count: preview.warnings.length - 5,
        }),
      });
    }
    return {
      title: localize("ui.panel.config.tag.bulk_preview_title", { count }),
      items,
      changeCount: count,
      confirmLabel: localize("ui.common.delete"),
      note: localize("ui.panel.config.tag.confirm_delete_selected", {
        count,
      }),
    };
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
   * further dialog follows. A tag that could not be deleted stays selected
   * and is named; success offers no Undo.
   */
  private _deleteSelected = async () => {
    const ids = [...this._selected];
    const results = await Promise.allSettled(
      ids.map((id) => deleteTag(this.hass, id))
    );
    const { deletedIds, failedIds } = summarizeTagDelete(ids, results);
    const deleted = new Set(deletedIds);
    const failedNames = this._tags
      .filter((tag) => failedIds.includes(tag.id))
      .map(tagDisplayName);
    this._tags = this._tags.filter((tag) => !deleted.has(tag.id));
    this._dataTable?.setCheckedRowIds(failedIds);
    if (failedIds.length) {
      showAlertDialog(this, {
        title: this.hass.localize("ui.panel.config.tag.delete_failed_title"),
        text: failedNames.length
          ? this.hass.localize("ui.panel.config.tag.delete_failed_named", {
              names: failedNames.join(", "),
            })
          : this.hass.localize("ui.panel.config.tag.delete_failed"),
      });
    }
  };

  static styles: CSSResultGroup = css`
    .bulk {
      position: fixed;
      z-index: 4;
      bottom: calc(var(--ha-phone-bar-height, 0px) + var(--ha-space-4));
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
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-tags": HaConfigTags;
  }
}
