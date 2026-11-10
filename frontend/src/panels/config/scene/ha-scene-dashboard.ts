import "@home-assistant/webawesome/dist/components/divider/divider";
import {
  mdiClose,
  mdiCog,
  mdiContentDuplicate,
  mdiDelete,
  mdiFilterVariant,
  mdiFilterVariantRemove,
  mdiFormatListChecks,
  mdiHelpCircleOutline,
  mdiInformationOutline,
  mdiMenuDown,
  mdiOpenInNew,
  mdiPalette,
  mdiPencil,
  mdiPlay,
  mdiPlus,
  mdiTag,
  mdiTextureBox,
} from "@mdi/js";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { DataTableSettingsController } from "../../../common/controllers/data-table-settings-controller";
import { QueryParamsController } from "../../../common/controllers/query-params-controller";
import { consume } from "../../../common/decorators/consume";
import { storage } from "../../../common/decorators/storage";
import type { HASSDomEvent } from "../../../common/dom/fire_event";
import { fireEvent } from "../../../common/dom/fire_event";
import { navigate } from "../../../common/navigate";
import { searchMatcher } from "../../../common/regex/filter";
import {
  scenesFilterQueryParamConfig,
  scenesFilterQueryParams,
  scenesFilterQueryString,
  scenesLinkFromUrl,
} from "../../../common/url/scenes-query-params";
import { deepEqual } from "../../../common/util/deep-equal";
import {
  hasRejectedItems,
  rejectedItems,
} from "../../../common/util/promise-all-settled-results";
import "../../../components/chips/ha-assist-chip";
import "../../../components/ha-button";
import "../../../components/ha-checkbox";
import "../../../components/ha-dropdown";
import type { HaDropdownSelectEvent } from "../../../components/ha-dropdown";
import "../../../components/ha-dropdown-item";
import "../../../components/ha-filter-categories";
import "../../../components/ha-filter-devices";
import "../../../components/ha-filter-entities";
import "../../../components/ha-filter-floor-areas";
import "../../../components/ha-filter-labels";
import "../../../components/ha-filter-voice-assistants";
import "../../../components/ha-icon-button";
import "../../../components/ha-icon-overflow-menu";
import "../../../components/ha-state-icon";
import "../../../components/ha-svg-icon";
import type { HaInputSearch } from "../../../components/input/ha-input-search";
import "../../../components/input/ha-input-search";
import { createAreaRegistryEntry } from "../../../data/area/area_registry";
import type { CategoryRegistryEntry } from "../../../data/category_registry";
import {
  createCategoryRegistryEntry,
  subscribeCategoryRegistry,
} from "../../../data/category_registry";
import type { CloudStatus } from "../../../data/cloud";
import { fullEntitiesContext, labelsContext } from "../../../data/context";
import type {
  DataTableFilter,
  DataTableFilters,
} from "../../../data/data_table_filters";
import {
  deserializeFilters,
  isFilterUsed,
  isRelatedItemsFilterUsed,
  serializeFilters,
} from "../../../data/data_table_filters";
import type {
  EntityRegistryEntry,
  UpdateEntityRegistryEntryResult,
} from "../../../data/entity/entity_registry";
import { updateEntityRegistryEntry } from "../../../data/entity/entity_registry";
import { getEntityVoiceAssistantsIds } from "../../../data/expose";
import { forwardHaptic } from "../../../data/haptics";
import type { LabelRegistryEntry } from "../../../data/label/label_registry";
import { createLabelRegistryEntry } from "../../../data/label/label_registry";
import type { SceneEntity } from "../../../data/scene";
import {
  activateScene,
  deleteScene,
  getSceneConfig,
  saveScene,
  showSceneEditor,
} from "../../../data/scene";
import {
  showAlertDialog,
  showConfirmationDialog,
} from "../../../dialogs/generic/show-dialog-box";
import { showMoreInfoDialog } from "../../../dialogs/more-info/show-ha-more-info-dialog";
import "../../../layouts/hass-tabs-subpage";
import { SubscribeMixin } from "../../../mixins/subscribe-mixin";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant, Route } from "../../../types";
import { documentationUrl } from "../../../util/documentation-url";
import { showToast } from "../../../util/toast";
import { showAreaRegistryDetailDialog } from "../areas/show-dialog-area-registry-detail";
import { showAssignCategoryDialog } from "../category/show-dialog-assign-category";
import { showCategoryRegistryDetailDialog } from "../category/show-dialog-category-registry-detail";
import { configSections } from "../config-sections";
import { showLabelDetailDialog } from "../labels/show-dialog-label-detail";
import { showSceneSaveDialog } from "./scene-save-dialog/show-dialog-scene-save";

// The card colours, taken from the theme's colour scales
const TINT_COUNT = 6;

type SceneItem = SceneEntity & {
  name: string;
  area: string | undefined;
  area_id: string | undefined;
  category: string | undefined;
  label_entries: LabelRegistryEntry[];
  labels: string[]; // search only
  entity_count: number;
  tint: number;
  selectable: boolean;
  editable: boolean;
};

// Keeps a scene on the same colour whatever else is on the page
const tintOf = (entityId: string): number => {
  let hash = 0;
  for (let i = 0; i < entityId.length; i++) {
    hash = (hash * 31 + entityId.charCodeAt(i)) % 9973;
  }
  return hash % TINT_COUNT;
};

@customElement("ha-scene-dashboard")
class HaSceneDashboard extends SubscribeMixin(LitElement) {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: "is-wide", type: Boolean }) public isWide = false;

  @property({ attribute: false }) public route!: Route;

  @property({ attribute: false }) public cloudStatus?: CloudStatus;

  @property({ attribute: false }) public scenes!: SceneEntity[];

  @state() private _selected: string[] = [];

  @state() private _selectMode = false;

  @state() private _showMoreFilters = false;

  @state() private _filteredSceneEntityIds?: string[] | null;

  // Only the search is kept here; the page lists its scenes by name
  private _tableSettings = new DataTableSettingsController(this, {
    search: "scene-table-search",
  });

  @state()
  private _filters: DataTableFilters = {};

  @storage({
    storage: "sessionStorage",
    key: "scene-table-filters-full",
    state: false,
    subscribe: false,
    serializer: serializeFilters,
    deserializer: deserializeFilters,
  })
  private _storageFilters: DataTableFilters = {};

  // The filters are kept in the URL by the page
  private _filterParams = new QueryParamsController(
    this,
    scenesFilterQueryParamConfig,
    {
      enabled: () => true,
      navigated: () => this._applyLink(),
    }
  );

  @state() private _expandedFilter?: string;

  @state()
  _categories!: CategoryRegistryEntry[];

  @consume({ context: labelsContext, subscribe: true })
  @state()
  _labels?: LabelRegistryEntry[];

  @state()
  @consume({ context: fullEntitiesContext, subscribe: true })
  _entityReg: EntityRegistryEntry[] = [];

  private _scenes = memoizeOne(
    (
      scenes: SceneEntity[],
      entityReg: EntityRegistryEntry[],
      areas: HomeAssistant["areas"],
      formatEntityName: HomeAssistant["formatEntityName"],
      categoryReg?: CategoryRegistryEntry[],
      labelReg?: LabelRegistryEntry[],
      filteredScenes?: string[] | null
    ): SceneItem[] => {
      if (filteredScenes === null) {
        return [];
      }
      return (
        filteredScenes
          ? scenes.filter((scene) => filteredScenes!.includes(scene.entity_id))
          : scenes
      )
        .map((scene) => {
          const entityRegEntry = entityReg.find(
            (reg) => reg.entity_id === scene.entity_id
          );
          const category = entityRegEntry?.categories.scene;
          const labels = labelReg && entityRegEntry?.labels;
          const label_entries = (labels || [])
            .map((lbl) => labelReg!.find((label) => label.label_id === lbl))
            .filter((lbl): lbl is LabelRegistryEntry => lbl !== undefined);
          const members = (scene.attributes as { entity_id?: string[] })
            .entity_id;
          return {
            ...scene,
            name: formatEntityName(scene),
            area: entityRegEntry?.area_id
              ? areas[entityRegEntry?.area_id]?.name
              : undefined,
            area_id: entityRegEntry?.area_id || undefined,
            category: category
              ? categoryReg?.find((cat) => cat.category_id === category)?.name
              : undefined,
            label_entries,
            labels: label_entries.map((lbl) => lbl.name),
            entity_count: Array.isArray(members) ? members.length : 0,
            tint: tintOf(scene.entity_id),
            selectable: entityRegEntry !== undefined,
            editable: Boolean(scene.attributes.id),
          };
        })
        .sort((a, b) =>
          a.name.localeCompare(b.name, this.hass.locale?.language, {
            numeric: true,
            sensitivity: "base",
          })
        );
    }
  );

  protected willUpdate(changedProps: PropertyValues) {
    super.willUpdate(changedProps);
    if (!this.hasUpdated) {
      this._filters = this._storageFilters;
      this._applyLink();
    }
  }

  // Links, like the ones on a device or area page, say in the URL what to
  // show. The router keeps the page open, so a link can land on it.
  private _applyLink() {
    const searchParams = this._filterParams.searchParams();

    const link = searchParams ? scenesLinkFromUrl(searchParams) : undefined;

    // Shown, but not stored as the user's choice
    if (link) {
      this._tableSettings.showSearch(link.search);
      this._filters = this._keepItems(link.filters);
      this._applyFilters();
    } else if (searchParams?.toString() === "") {
      // Opened again without params, like from the sidebar. Written once the
      // page has seen the URL without params, so it restores what it stored
      this._filters = this._keepItems(this._storageFilters);
      this._applyFilters();
      queueMicrotask(() => this._writeFilters());

      return;
    }

    this._writeFilters();
  }

  // The filters only work out their items again when their value changes, so
  // keep the items of the ones that stay as they are
  private _keepItems(filters: DataTableFilters): DataTableFilters {
    return Object.fromEntries(
      Object.entries(filters).map(([key, filter]) => {
        const current = this._filters[key];

        return [
          key,
          current && deepEqual(filter.value, current.value) ? current : filter,
        ];
      })
    );
  }

  private _writeFilters() {
    this._filterParams.write(scenesFilterQueryParams(this._filters));
  }

  protected updated(changedProps: PropertyValues) {
    super.updated(changedProps);
    if (changedProps.has("_entityReg")) {
      this._applyFilters();
    }
  }

  protected hassSubscribe(): (UnsubscribeFunc | Promise<UnsubscribeFunc>)[] {
    return [
      subscribeCategoryRegistry(this.hass.connection, "scene", (categories) => {
        this._categories = categories;
      }),
    ];
  }

  private get _filterCount(): number {
    return Object.values(this._filters).filter((filter) =>
      Array.isArray(filter.value)
        ? filter.value.length
        : filter.value &&
          Object.values(filter.value).some((val) =>
            Array.isArray(val) ? val.length : val
          )
    ).length;
  }

  protected render(): TemplateResult {
    const allScenes = this._scenes(
      this.scenes,
      this._entityReg,
      this.hass.areas,
      this.hass.formatEntityName,
      this._categories,
      this._labels,
      this._filteredSceneEntityIds
    );

    const matches = searchMatcher(this._tableSettings.search);
    const scenes = allScenes.filter((scene) =>
      matches(scene.name, scene.area, scene.category, ...scene.labels)
    );

    const filterCount = this._filterCount;
    const narrowedDown = Boolean(this._tableSettings.search) || filterCount > 0;
    const searchLabel = this.hass.localize(
      "ui.panel.config.scene.picker.search",
      { number: scenes.length }
    );

    return html`
      <hass-tabs-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        .isWide=${this.isWide}
        back-path="/config"
        .route=${this.route}
        .tabs=${configSections.automations}
        content-heading
        has-fab
      >
        <ha-icon-button
          slot="toolbar-icon"
          @click=${this._showHelp}
          .label=${this.hass.localize("ui.common.help")}
          .path=${mdiHelpCircleOutline}
        ></ha-icon-button>
        <div class="page">
          <div class="page-heading">
            <h1>${this.hass.localize("ui.panel.config.scene.caption")}</h1>
            <p>
              ${this.hass.localize("ui.panel.config.scene.picker.summary", {
                number: this.scenes.length,
              })}.
              ${this.hass.localize("ui.panel.config.scene.picker.description")}
            </p>
          </div>
          ${
            this.scenes.length
              ? html`
                  ${this._renderToolbar(searchLabel, filterCount)}
                  ${this._selectMode ? this._renderSelectionBar() : nothing}
                `
              : nothing
          }
          <div class="filter-panel" ?hidden=${!this._showMoreFilters}>
            ${this._renderFilterPanes()}
          </div>
          ${
            !this.scenes.length
              ? this._renderEmpty()
              : scenes.length
                ? html`<div class="grid">
                    ${scenes.map((scene) => this._renderCard(scene))}
                  </div>`
                : html`<div class="no-match">
                    <p>
                      ${this.hass.localize(
                        "ui.panel.config.scene.picker.no_match"
                      )}
                    </p>
                    ${
                      narrowedDown
                        ? html`<ha-button
                            appearance="plain"
                            size="s"
                            @click=${this._clearAll}
                          >
                            ${this.hass.localize(
                              "ui.panel.config.scene.picker.clear_filters"
                            )}
                          </ha-button>`
                        : nothing
                    }
                  </div>`
          }
        </div>
        <ha-button href="/config/scene/edit/new" size="l" slot="fab">
          <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
          ${this.hass.localize("ui.panel.config.scene.picker.add_scene")}
        </ha-button>
      </hass-tabs-subpage>
    `;
  }

  private _renderToolbar(searchLabel: string, filterCount: number) {
    const areaId = this._selectedAreas[0];
    const categoryIds = this._selectedCategories;
    const labelIds = this._selectedLabels;
    return html`<div class="toolbar">
      <ha-input-search
        class="search"
        appearance="outlined"
        .placeholder=${searchLabel}
        .accessibleLabel=${searchLabel}
        .value=${this._tableSettings.search}
        @input=${this._searchChanged}
      ></ha-input-search>
      <ha-dropdown @wa-select=${this._handleAreaFilter}>
        <ha-assist-chip
          slot="trigger"
          .label=${this._chipLabel(
            this.hass.localize("ui.panel.config.scene.picker.filter_area"),
            this._selectedAreas.length > 1
              ? undefined
              : areaId
                ? this.hass.areas[areaId]?.name
                : "",
            this._selectedAreas.length
          )}
        >
          <ha-svg-icon slot="trailing-icon" .path=${mdiMenuDown}></ha-svg-icon>
        </ha-assist-chip>
        <ha-dropdown-item value="area_any" .selected=${!areaId}>
          ${this.hass.localize("ui.panel.config.scene.picker.filter_any_item")}
        </ha-dropdown-item>
        ${Object.values(this.hass.areas).map(
          (area) =>
            html`<ha-dropdown-item
              .value=${`area_${area.area_id}`}
              .selected=${this._selectedAreas.includes(area.area_id)}
            >
              ${area.name}
            </ha-dropdown-item>`
        )}
      </ha-dropdown>
      <ha-dropdown @wa-select=${this._handleCategoryFilter}>
        <ha-assist-chip
          slot="trigger"
          .label=${this._chipLabel(
            this.hass.localize("ui.panel.config.scene.picker.filter_category"),
            categoryIds.length === 1
              ? this._categories?.find(
                  (cat) => cat.category_id === categoryIds[0]
                )?.name
              : undefined,
            categoryIds.length
          )}
        >
          <ha-svg-icon slot="trailing-icon" .path=${mdiMenuDown}></ha-svg-icon>
        </ha-assist-chip>
        <ha-dropdown-item value="category_any" .selected=${!categoryIds.length}>
          ${this.hass.localize("ui.panel.config.scene.picker.filter_any_item")}
        </ha-dropdown-item>
        ${this._categories?.map(
          (category) =>
            html`<ha-dropdown-item
              .value=${`category_${category.category_id}`}
              .selected=${categoryIds.includes(category.category_id)}
            >
              ${category.name}
            </ha-dropdown-item>`
        )}
      </ha-dropdown>
      <ha-dropdown @wa-select=${this._handleLabelFilter}>
        <ha-assist-chip
          slot="trigger"
          .label=${this._chipLabel(
            this.hass.localize("ui.panel.config.scene.picker.filter_label"),
            labelIds.length === 1
              ? this._labels?.find((lbl) => lbl.label_id === labelIds[0])?.name
              : undefined,
            labelIds.length
          )}
        >
          <ha-svg-icon slot="trailing-icon" .path=${mdiMenuDown}></ha-svg-icon>
        </ha-assist-chip>
        <ha-dropdown-item value="label_any" .selected=${!labelIds.length}>
          ${this.hass.localize("ui.panel.config.scene.picker.filter_any_item")}
        </ha-dropdown-item>
        ${this._labels?.map(
          (label) =>
            html`<ha-dropdown-item
              .value=${`label_${label.label_id}`}
              .selected=${labelIds.includes(label.label_id)}
            >
              ${label.name}
            </ha-dropdown-item>`
        )}
      </ha-dropdown>
      <ha-assist-chip
        .label=${this.hass.localize(
          "ui.panel.config.scene.picker.more_filters"
        )}
        .active=${this._showMoreFilters}
        @click=${this._toggleMoreFilters}
      >
        <ha-svg-icon slot="icon" .path=${mdiFilterVariant}></ha-svg-icon>
      </ha-assist-chip>
      ${
        filterCount
          ? html`<ha-icon-button
              .path=${mdiFilterVariantRemove}
              .label=${this.hass.localize(
                "ui.panel.config.scene.picker.clear_filters"
              )}
              @click=${this._clearFilter}
            ></ha-icon-button>`
          : nothing
      }
      <span class="spacer"></span>
      <ha-icon-button
        .path=${mdiFormatListChecks}
        .label=${this.hass.localize(
          "ui.panel.config.scene.picker.select_scenes"
        )}
        aria-pressed=${this._selectMode ? "true" : "false"}
        @click=${this._toggleSelectMode}
      ></ha-icon-button>
    </div>`;
  }

  private _chipLabel(
    name: string,
    value: string | undefined,
    count: number
  ): string {
    if (!count) {
      return this.hass.localize("ui.panel.config.scene.picker.filter_any", {
        name,
      });
    }
    return this.hass.localize("ui.panel.config.scene.picker.filter_value", {
      name,
      value:
        value ??
        this.hass.localize("ui.panel.config.scene.picker.filter_count", {
          count,
        }),
    });
  }

  private get _selectedAreas(): string[] {
    const value = this._filters["ha-filter-floor-areas"]?.value;
    return value && !Array.isArray(value) ? (value.areas ?? []) : [];
  }

  private get _selectedCategories(): string[] {
    const value = this._filters["ha-filter-categories"]?.value;
    return Array.isArray(value) ? value : [];
  }

  private get _selectedLabels(): string[] {
    const value = this._filters["ha-filter-labels"]?.value;
    return Array.isArray(value) ? value : [];
  }

  private _renderSelectionBar() {
    return html`<div class="selection-bar">
      <ha-icon-button
        .path=${mdiClose}
        .label=${this.hass.localize(
          "ui.components.subpage-data-table.exit_selection_mode"
        )}
        @click=${this._toggleSelectMode}
      ></ha-icon-button>
      <ha-dropdown @wa-select=${this._handleSelect}>
        <ha-assist-chip
          slot="trigger"
          .label=${this.hass.localize("ui.components.subpage-data-table.select")}
        >
          <ha-svg-icon slot="icon" .path=${mdiFormatListChecks}></ha-svg-icon>
          <ha-svg-icon slot="trailing-icon" .path=${mdiMenuDown}></ha-svg-icon>
        </ha-assist-chip>
        <ha-dropdown-item value="all">
          ${this.hass.localize("ui.components.subpage-data-table.select_all")}
        </ha-dropdown-item>
        <ha-dropdown-item value="none">
          ${this.hass.localize("ui.components.subpage-data-table.select_none")}
        </ha-dropdown-item>
      </ha-dropdown>
      <p>
        ${this.hass.localize("ui.components.subpage-data-table.selected", {
          selected: this._selected.length || "0",
        })}
      </p>
      <ha-dropdown @wa-select=${this._handleBulkCategory}>
        <ha-assist-chip
          slot="trigger"
          .disabled=${!this._selected.length}
          .label=${this.hass.localize(
            "ui.panel.config.automation.picker.bulk_actions.move_category"
          )}
        >
          <ha-svg-icon slot="trailing-icon" .path=${mdiMenuDown}></ha-svg-icon>
        </ha-assist-chip>
        ${this._renderCategoryItems()}
      </ha-dropdown>
      <ha-dropdown @wa-select=${this._handleBulkLabel}>
        <ha-assist-chip
          slot="trigger"
          .disabled=${!this._selected.length}
          .label=${this.hass.localize(
            "ui.panel.config.automation.picker.bulk_actions.add_label"
          )}
        >
          <ha-svg-icon slot="trailing-icon" .path=${mdiMenuDown}></ha-svg-icon>
        </ha-assist-chip>
        ${this._renderLabelItems()}
      </ha-dropdown>
      <ha-dropdown @wa-select=${this._handleBulkArea}>
        <ha-assist-chip
          slot="trigger"
          .disabled=${!this._selected.length}
          .label=${this.hass.localize(
            "ui.panel.config.devices.picker.bulk_actions.move_area"
          )}
        >
          <ha-svg-icon slot="trailing-icon" .path=${mdiMenuDown}></ha-svg-icon>
        </ha-assist-chip>
        ${this._renderAreaItems()}
      </ha-dropdown>
    </div>`;
  }

  private _renderFilterPanes() {
    return html`
      <ha-filter-floor-areas
        .type=${"scene"}
        .value=${this._filters["ha-filter-floor-areas"]?.value}
        @data-table-filter-changed=${this._filterChanged}
        .expanded=${this._expandedFilter === "ha-filter-floor-areas"}
        .narrow=${this.narrow}
        @expanded-changed=${this._filterExpanded}
      ></ha-filter-floor-areas>
      <ha-filter-devices
        .type=${"scene"}
        .value=${this._filters["ha-filter-devices"]?.value}
        @data-table-filter-changed=${this._filterChanged}
        .expanded=${this._expandedFilter === "ha-filter-devices"}
        .narrow=${this.narrow}
        @expanded-changed=${this._filterExpanded}
      ></ha-filter-devices>
      <ha-filter-entities
        .type=${"scene"}
        .value=${this._filters["ha-filter-entities"]?.value}
        @data-table-filter-changed=${this._filterChanged}
        .expanded=${this._expandedFilter === "ha-filter-entities"}
        .narrow=${this.narrow}
        @expanded-changed=${this._filterExpanded}
      ></ha-filter-entities>
      <ha-filter-labels
        .value=${this._filters["ha-filter-labels"]?.value}
        @data-table-filter-changed=${this._filterChanged}
        .expanded=${this._expandedFilter === "ha-filter-labels"}
        .narrow=${this.narrow}
        @expanded-changed=${this._filterExpanded}
      ></ha-filter-labels>
      <ha-filter-categories
        scope="scene"
        .value=${this._filters["ha-filter-categories"]?.value}
        @data-table-filter-changed=${this._filterChanged}
        .expanded=${this._expandedFilter === "ha-filter-categories"}
        .narrow=${this.narrow}
        @expanded-changed=${this._filterExpanded}
      ></ha-filter-categories>
      <ha-filter-voice-assistants
        .value=${this._filters["ha-filter-voice-assistants"]?.value}
        @data-table-filter-changed=${this._filterChanged}
        .expanded=${this._expandedFilter === "ha-filter-voice-assistants"}
        .narrow=${this.narrow}
        @expanded-changed=${this._filterExpanded}
      ></ha-filter-voice-assistants>
    `;
  }

  private _renderEmpty() {
    return html`<div class="empty">
      <ha-svg-icon .path=${mdiPalette}></ha-svg-icon>
      <h2>
        ${this.hass.localize("ui.panel.config.scene.picker.empty_header")}
      </h2>
      <p>${this.hass.localize("ui.panel.config.scene.picker.empty_text")}</p>
      <ha-button
        appearance="plain"
        href=${documentationUrl(this.hass, "/docs/scene/editor/")}
        target="_blank"
        rel="noreferrer"
        size="s"
      >
        ${this.hass.localize("ui.panel.config.common.learn_more")}
        <ha-svg-icon slot="end" .path=${mdiOpenInNew}></ha-svg-icon>
      </ha-button>
    </div>`;
  }

  private _renderCard(scene: SceneItem) {
    const selected = this._selected.includes(scene.entity_id);
    const subtitle = [
      this.hass.localize("ui.panel.config.scene.picker.entity_count", {
        count: scene.entity_count,
      }),
      scene.area,
    ]
      .filter(Boolean)
      .join(", ");

    return html`
      <div
        class="card tint-${scene.tint} ${selected ? "selected" : ""}"
        title=${
          scene.editable
            ? ""
            : this.hass.localize("ui.panel.config.scene.picker.only_editable")
        }
      >
        <button
          type="button"
          class="open"
          aria-label=${scene.name}
          aria-pressed=${this._selectMode ? String(selected) : nothing}
          .entityId=${scene.entity_id}
          @click=${this._cardClicked}
        ></button>
        <div class="card-top">
          <div class="icon-tile">
            <ha-state-icon .stateObj=${scene}></ha-state-icon>
          </div>
          ${
            this._selectMode
              ? html`<ha-checkbox
                  class="check"
                  .checked=${selected}
                  .disabled=${!scene.selectable}
                  .ariaLabel=${scene.name}
                  .entityId=${scene.entity_id}
                  @change=${this._checkChanged}
                ></ha-checkbox>`
              : html`<ha-icon-overflow-menu
                  narrow
                  .items=${this._cardActions(scene)}
                ></ha-icon-overflow-menu>`
          }
        </div>
        <div class="card-text">
          <h2>${scene.name}</h2>
          <p>${subtitle}</p>
        </div>
        <ha-button
          class="turn-on"
          size="s"
          appearance="filled"
          variant="neutral"
          .entityId=${scene.entity_id}
          @click=${this._turnOnClicked}
        >
          <ha-svg-icon slot="start" .path=${mdiPlay}></ha-svg-icon>
          ${this.hass.localize("ui.panel.config.scene.picker.turn_on")}
        </ha-button>
      </div>
    `;
  }

  private _cardActions(scene: SceneItem) {
    return [
      {
        path: mdiPlay,
        label: this.hass.localize("ui.panel.config.scene.picker.apply"),
        action: () => this._activateScene(scene),
      },
      {
        path: mdiInformationOutline,
        label: this.hass.localize("ui.panel.config.scene.picker.show_info"),
        action: () => this._showInfo(scene),
      },
      {
        path: mdiCog,
        label: this.hass.localize(
          "ui.panel.config.automation.picker.show_settings"
        ),
        action: () => this._openSettings(scene),
      },
      {
        path: mdiTag,
        label: this.hass.localize(
          `ui.panel.config.scene.picker.${scene.category ? "edit_category" : "assign_category"}`
        ),
        action: () => this._editCategory(scene),
      },
      {
        path: mdiPencil,
        label: this.hass.localize("ui.panel.config.scene.editor.rename"),
        action: () => this._rename(scene),
        disabled: !scene.editable,
      },
      {
        divider: true,
      },
      {
        path: mdiContentDuplicate,
        label: this.hass.localize("ui.panel.config.scene.picker.duplicate"),
        action: () => this._duplicate(scene),
        disabled: !scene.editable,
      },
      {
        label: this.hass.localize("ui.panel.config.scene.picker.delete"),
        path: mdiDelete,
        action: () => this._deleteConfirm(scene),
        warning: scene.editable,
        disabled: !scene.editable,
      },
    ];
  }

  private _searchChanged(ev: Event) {
    const value = (ev.target as HaInputSearch).value ?? "";
    this._tableSettings.searchChanged({
      detail: { value },
    } as unknown as HASSDomEvent<HASSDomEvents["search-changed"]>);
  }

  private _toggleMoreFilters() {
    this._showMoreFilters = !this._showMoreFilters;
  }

  private _toggleSelectMode() {
    this._selectMode = !this._selectMode;
    if (!this._selectMode) {
      this._selected = [];
    }
  }

  private _handleSelect(ev: HaDropdownSelectEvent) {
    const value = ev.detail.item.value;
    if (value === "all") {
      this._selected = this._scenes(
        this.scenes,
        this._entityReg,
        this.hass.areas,
        this.hass.formatEntityName,
        this._categories,
        this._labels,
        this._filteredSceneEntityIds
      )
        .filter((scene) => {
          const matches = searchMatcher(this._tableSettings.search);
          return (
            scene.selectable &&
            matches(scene.name, scene.area, scene.category, ...scene.labels)
          );
        })
        .map((scene) => scene.entity_id);
    } else if (value === "none") {
      this._selected = [];
    }
  }

  private _entityIdOf(ev: Event): string | undefined {
    return (ev.currentTarget as HTMLElement & { entityId?: string }).entityId;
  }

  private _toggleSelected(entityId: string) {
    // Only scenes in the entity registry can take part in bulk actions
    if (!this._entityReg.some((reg) => reg.entity_id === entityId)) {
      return;
    }
    this._selected = this._selected.includes(entityId)
      ? this._selected.filter((id) => id !== entityId)
      : [...this._selected, entityId];
  }

  private _checkChanged(ev: Event) {
    const entityId = this._entityIdOf(ev);
    if (entityId) {
      this._toggleSelected(entityId);
    }
  }

  private _turnOnClicked(ev: Event) {
    const scene = this.scenes.find(
      (item) => item.entity_id === this._entityIdOf(ev)
    );
    if (scene) {
      this._activateScene(scene);
    }
  }

  private _cardClicked(ev: Event) {
    const entityId = this._entityIdOf(ev);
    const scene = this.scenes.find((item) => item.entity_id === entityId);
    if (!scene) {
      return;
    }
    if (this._selectMode) {
      this._toggleSelected(scene.entity_id);
      return;
    }
    if (scene.attributes.id) {
      navigate(`/config/scene/edit/${scene.attributes.id}`);
    } else {
      this._showInfo(scene);
    }
  }

  private _handleAreaFilter = (ev: HaDropdownSelectEvent) => {
    const value = ev.detail.item.value;
    if (!value?.startsWith("area_")) {
      return;
    }
    const id = value.substring(5);
    this._setFilter("ha-filter-floor-areas", {
      value: id === "any" ? undefined : { floors: [], areas: [id] },
      items: undefined,
    });
  };

  private _handleCategoryFilter = (ev: HaDropdownSelectEvent) => {
    const value = ev.detail.item.value;
    if (!value?.startsWith("category_")) {
      return;
    }
    const id = value.substring(9);
    this._setFilter("ha-filter-categories", {
      value: id === "any" ? undefined : [id],
      items: undefined,
    });
  };

  private _handleLabelFilter = (ev: HaDropdownSelectEvent) => {
    const value = ev.detail.item.value;
    if (!value?.startsWith("label_")) {
      return;
    }
    const id = value.substring(6);
    this._setFilter("ha-filter-labels", {
      value: id === "any" ? undefined : [id],
      items: undefined,
    });
  };

  private _filterExpanded(ev) {
    if (ev.detail.expanded) {
      this._expandedFilter = ev.target.localName;
    } else if (this._expandedFilter === ev.target.localName) {
      this._expandedFilter = undefined;
    }
  }

  private _filterChanged(ev) {
    this._setFilter(ev.target.localName, ev.detail);
  }

  private _setFilter(type: string, filter: DataTableFilter) {
    const filters = { ...this._filters, [type]: filter };

    // A filter also sends the value it was given, once it has found its items.
    // Only a change to what the URL holds is the user's, so a link isn't stored.
    if (
      scenesFilterQueryString(filters) !==
      scenesFilterQueryString(this._filters)
    ) {
      this._storageFilters = { ...this._storageFilters, [type]: filter };
    }

    this._filters = filters;
    this._applyFilters();
    this._writeFilters();
  }

  private _applyFilters() {
    const filters = Object.entries(this._filters);
    let filteredEntityIds = this.scenes.map((scene) => scene.entity_id);
    for (const [key, filter] of filters) {
      if (
        // these 3 filters actually apply any selected options, and expose
        // the list of scenes that match these options as filter.items
        isRelatedItemsFilterUsed(key, filter, [
          "ha-filter-floor-areas",
          "ha-filter-devices",
          "ha-filter-entities",
        ])
      ) {
        filteredEntityIds = filteredEntityIds.filter((entityId) =>
          filter.items!.has(entityId)
        );

        // the filters below only expose the selected options (as filter.value);
        // applying the filter must be done here
      } else if (isFilterUsed(key, filter, "ha-filter-categories")) {
        filteredEntityIds = filteredEntityIds.filter((entityId) => {
          const category = this._entityReg.find(
            (reg) => reg.entity_id === entityId
          )?.categories.scene;

          return (
            category !== undefined &&
            Array.isArray(filter.value) &&
            filter.value.includes(category)
          );
        });
      } else if (isFilterUsed(key, filter, "ha-filter-labels")) {
        filteredEntityIds = filteredEntityIds.filter((entityId) =>
          this._entityReg
            .find((reg) => reg.entity_id === entityId)
            ?.labels.some((lbl) => (filter.value as string[]).includes(lbl))
        );
      } else if (isFilterUsed(key, filter, "ha-filter-voice-assistants")) {
        filteredEntityIds = filteredEntityIds.filter((entityId) =>
          getEntityVoiceAssistantsIds(this._entityReg, entityId).some((va) =>
            (filter.value as string[]).includes(va)
          )
        );
      }
    }
    this._filteredSceneEntityIds = filteredEntityIds;
  }

  private _clearFilter() {
    this._filters = {};
    this._storageFilters = {};
    this._applyFilters();
    this._writeFilters();
  }

  private _clearAll() {
    this._clearFilter();
    this._tableSettings.searchChanged({
      detail: { value: "" },
    } as unknown as HASSDomEvent<HASSDomEvents["search-changed"]>);
  }

  private _handleBulkCategory = (ev: HaDropdownSelectEvent) => {
    const value = ev.detail.item.value;
    if (value === "category_create") {
      this._bulkCreateCategory();
      return;
    }
    if (value === "category_none") {
      this._bulkAddCategory(null);
      return;
    }
    if (value?.startsWith("category_")) {
      this._bulkAddCategory(value.substring(9));
    }
  };

  private async _bulkAddCategory(category: string | null) {
    const promises: Promise<UpdateEntityRegistryEntryResult>[] = [];
    this._selected.forEach((entityId) => {
      promises.push(
        updateEntityRegistryEntry(this.hass, entityId, {
          categories: { scene: category },
        })
      );
    });
    const result = await Promise.allSettled(promises);
    if (hasRejectedItems(result)) {
      const rejected = rejectedItems(result);
      showAlertDialog(this, {
        title: this.hass.localize("ui.panel.config.common.multiselect.failed", {
          number: rejected.length,
        }),
        text: html`<pre>
${rejected
            .map((r) => r.reason.message || r.reason.code || r.reason)
            .join("\r\n")}</pre>`,
      });
    }
  }

  private _handleBulkLabel = (ev: HaDropdownSelectEvent) => {
    ev.preventDefault();
    const value = ev.detail.item.value;
    if (value === "label_create") {
      this._bulkCreateLabel();
      return;
    }
    if (value?.startsWith("label_")) {
      const action = (ev.detail.item as any).action;
      this._bulkLabel(value.substring(6), action);
    }
  };

  private async _bulkLabel(label: string, action: "add" | "remove") {
    const promises: Promise<UpdateEntityRegistryEntryResult>[] = [];
    this._selected.forEach((entityId) => {
      promises.push(
        updateEntityRegistryEntry(this.hass, entityId, {
          labels:
            action === "add"
              ? this.hass.entities[entityId].labels.concat(label)
              : this.hass.entities[entityId].labels.filter(
                  (lbl) => lbl !== label
                ),
        })
      );
    });
    const result = await Promise.allSettled(promises);
    if (hasRejectedItems(result)) {
      const rejected = rejectedItems(result);
      showAlertDialog(this, {
        title: this.hass.localize("ui.panel.config.common.multiselect.failed", {
          number: rejected.length,
        }),
        text: html`<pre>
${rejected
            .map((r) => r.reason.message || r.reason.code || r.reason)
            .join("\r\n")}</pre>`,
      });
    }
  }

  private _handleBulkArea = (ev: HaDropdownSelectEvent) => {
    const value = ev.detail.item.value;
    if (value === "area_create") {
      this._bulkCreateArea();
      return;
    }
    if (value === "area_none") {
      this._bulkAddArea(null);
      return;
    }
    if (value?.startsWith("area_")) {
      this._bulkAddArea(value.substring(5));
    }
  };

  private async _bulkAddArea(area: string | null) {
    const promises: Promise<UpdateEntityRegistryEntryResult>[] = [];
    this._selected.forEach((entityId) => {
      promises.push(
        updateEntityRegistryEntry(this.hass, entityId, {
          area_id: area,
        })
      );
    });
    const result = await Promise.allSettled(promises);
    if (hasRejectedItems(result)) {
      const rejected = rejectedItems(result);
      showAlertDialog(this, {
        title: this.hass.localize("ui.panel.config.common.multiselect.failed", {
          number: rejected.length,
        }),
        text: html`<pre>
${rejected
            .map((r) => r.reason.message || r.reason.code || r.reason)
            .join("\r\n")}</pre>`,
      });
    }
  }

  private _bulkCreateArea = () => {
    showAreaRegistryDetailDialog(this, {
      createEntry: async (values) => {
        const area = await createAreaRegistryEntry(this.hass, values);
        this._bulkAddArea(area.area_id);
        return area;
      },
    });
  };

  private _editCategory(scene: any) {
    const entityReg = this._entityReg.find(
      (reg) => reg.entity_id === scene.entity_id
    );
    if (!entityReg) {
      showAlertDialog(this, {
        title: this.hass.localize(
          "ui.panel.config.scene.picker.no_category_support"
        ),
        text: this.hass.localize(
          "ui.panel.config.scene.picker.no_category_entity_reg"
        ),
      });
      return;
    }
    showAssignCategoryDialog(this, {
      scope: "scene",
      entityReg,
    });
  }

  private _showInfo(scene: SceneEntity) {
    fireEvent(this, "hass-more-info", { entityId: scene.entity_id });
  }

  private _openSettings(scene: SceneEntity) {
    showMoreInfoDialog(this, {
      entityId: scene.entity_id,
      view: "settings",
    });
  }

  private _activateScene = async (scene: SceneEntity) => {
    await activateScene(this.hass.callService, scene.entity_id);
    showToast(this, {
      message: this.hass.localize("ui.panel.config.scene.activated", {
        name: this.hass.formatEntityName(scene),
      }),
    });
    forwardHaptic(this, "light");
  };

  private _deleteConfirm(scene: SceneEntity): void {
    showConfirmationDialog(this, {
      title: this.hass!.localize(
        "ui.panel.config.scene.picker.delete_confirm_title"
      ),
      text: this.hass!.localize(
        "ui.panel.config.scene.picker.delete_confirm_text",
        { name: this.hass.formatEntityName(scene) }
      ),
      confirmText: this.hass!.localize("ui.common.delete"),
      dismissText: this.hass!.localize("ui.common.cancel"),
      confirm: () => this._delete(scene),
      destructive: true,
    });
  }

  private async _delete(scene: SceneEntity): Promise<void> {
    if (scene.attributes.id) {
      await deleteScene(this.hass, scene.attributes.id);
      this._selected = this._selected.filter(
        (entityId) => entityId !== scene.entity_id
      );
    }
  }

  private async _duplicate(scene: SceneEntity) {
    if (scene.attributes.id) {
      const config = await getSceneConfig(this.hass, scene.attributes.id);
      const entityRegEntry = this._entityReg.find(
        (reg) => reg.entity_id === scene.entity_id
      );
      showSceneEditor(
        {
          ...config,
          id: undefined,
          name: `${config?.name} (${this.hass.localize(
            "ui.panel.config.scene.picker.duplicate"
          )})`,
        },
        entityRegEntry?.area_id || undefined
      );
    }
  }

  private async _rename(scene: SceneEntity): Promise<void> {
    if (!scene.attributes.id) {
      return;
    }
    const config = await getSceneConfig(this.hass, scene.attributes.id);
    const entityRegEntry = this._entityReg.find(
      (reg) => reg.entity_id === scene.entity_id
    );
    showSceneSaveDialog(this, {
      config,
      domain: "scene",
      entityRegistryEntry: entityRegEntry,
      updateConfig: async (newConfig, entityRegistryUpdate) => {
        await saveScene(this.hass, scene.attributes.id!, newConfig);
        if (entityRegEntry) {
          await updateEntityRegistryEntry(this.hass, scene.entity_id, {
            area_id: entityRegistryUpdate.area || null,
            labels: entityRegistryUpdate.labels,
            categories: { scene: entityRegistryUpdate.category || null },
          });
        }
      },
    });
  }

  private _showHelp() {
    showAlertDialog(this, {
      title: this.hass.localize("ui.panel.config.scene.picker.header"),
      text: html`
        ${this.hass.localize("ui.panel.config.scene.picker.introduction")}
        <p>
          <a
            href=${documentationUrl(this.hass, "/docs/scene/editor/")}
            target="_blank"
            rel="noreferrer"
          >
            ${this.hass.localize("ui.panel.config.scene.picker.learn_more")}
          </a>
        </p>
      `,
    });
  }

  private _bulkCreateCategory = () => {
    showCategoryRegistryDetailDialog(this, {
      scope: "scene",
      createEntry: async (values) => {
        const category = await createCategoryRegistryEntry(
          this.hass.callWS,
          "scene",
          values
        );
        this._bulkAddCategory(category.category_id);
        return category;
      },
    });
  };

  private _bulkCreateLabel = () => {
    showLabelDetailDialog(this, {
      createEntry: async (values) => {
        const label = await createLabelRegistryEntry(this.hass.callWS, values);
        this._bulkLabel(label.label_id, "add");
      },
    });
  };

  private _renderCategoryItems = () =>
    html`${this._categories?.map(
        (category) =>
          html`<ha-dropdown-item .value=${`category_${category.category_id}`}>
            ${
              category.icon
                ? html`<ha-icon slot="icon" .icon=${category.icon}></ha-icon>`
                : html`<ha-svg-icon slot="icon" .path=${mdiTag}></ha-svg-icon>`
            }
            ${category.name}
          </ha-dropdown-item>`
      )}
      <ha-dropdown-item value="category_none">
        ${this.hass.localize(
          "ui.panel.config.automation.picker.bulk_actions.no_category"
        )}
      </ha-dropdown-item>
      <wa-divider></wa-divider>
      <ha-dropdown-item value="category_create">
        ${this.hass.localize("ui.panel.config.category.editor.add")}
      </ha-dropdown-item>`;

  private _renderLabelItems = () =>
    html`${this._labels?.map((label) => {
        const selected = this._selected.every((entityId) =>
          this.hass.entities[entityId]?.labels.includes(label.label_id)
        );
        const partial =
          !selected &&
          this._selected.some((entityId) =>
            this.hass.entities[entityId]?.labels.includes(label.label_id)
          );
        return html`<ha-dropdown-item
          .value=${`label_${label.label_id}`}
          .action=${selected ? "remove" : "add"}
        >
          <ha-checkbox
            slot="icon"
            .checked=${selected}
            .indeterminate=${partial}
          ></ha-checkbox>
          <ha-label .color=${label.color} .description=${label.description}>
            ${
              label.icon
                ? html`<ha-icon slot="icon" .icon=${label.icon}></ha-icon>`
                : nothing
            }
            ${label.name}
          </ha-label>
        </ha-dropdown-item>`;
      })}
      <wa-divider></wa-divider>
      <ha-dropdown-item value="label_create">
        ${this.hass.localize("ui.panel.config.labels.add_label")}
      </ha-dropdown-item>`;

  private _renderAreaItems = () =>
    html`${Object.values(this.hass.areas).map(
        (area) =>
          html`<ha-dropdown-item .value=${`area_${area.area_id}`}>
            ${
              area.icon
                ? html`<ha-icon slot="icon" .icon=${area.icon}></ha-icon>`
                : html`<ha-svg-icon
                    slot="icon"
                    .path=${mdiTextureBox}
                  ></ha-svg-icon>`
            }
            ${area.name}
          </ha-dropdown-item>`
      )}
      <ha-dropdown-item value="area_none">
        ${this.hass.localize(
          "ui.panel.config.devices.picker.bulk_actions.no_area"
        )}
      </ha-dropdown-item>
      <wa-divider></wa-divider>
      <ha-dropdown-item value="area_create">
        ${this.hass.localize(
          "ui.panel.config.devices.picker.bulk_actions.add_area"
        )}
      </ha-dropdown-item>`;

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        :host {
          display: block;
          height: 100%;
        }
        .page {
          box-sizing: border-box;
          width: 100%;
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 var(--ha-space-8) var(--ha-space-20);
        }
        :host([narrow]) .page {
          padding: 0 var(--ha-space-3) var(--ha-space-20);
        }
        .page-heading {
          padding: var(--ha-space-6) var(--ha-space-2) var(--ha-space-2);
        }
        :host([narrow]) .page-heading {
          padding-top: var(--ha-space-3);
        }
        .page-heading h1 {
          margin: 0;
          font-family: var(--ha-font-family-heading, inherit);
          font-size: var(--ha-font-size-4xl);
          font-weight: var(--ha-font-weight-medium);
          line-height: var(--ha-line-height-condensed);
          color: var(--primary-text-color);
        }
        .page-heading p {
          margin: var(--ha-space-1) 0 0;
          font-size: var(--ha-font-size-l);
          line-height: var(--ha-line-height-normal);
          color: var(--secondary-text-color);
        }
        .toolbar,
        .selection-bar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-2);
          padding: var(--ha-space-3) 0;
        }
        .selection-bar {
          padding-top: 0;
        }
        .selection-bar p {
          margin: 0 var(--ha-space-2);
          color: var(--secondary-text-color);
        }
        .spacer {
          flex: 1;
        }
        .search {
          flex: 0 1 320px;
          min-width: 200px;
          --ha-input-search-height: var(--ha-space-12);
          --ha-input-search-border-radius: var(--ha-border-radius-pill);
        }
        :host([narrow]) .search {
          flex: 1 1 100%;
        }
        ha-assist-chip {
          --ha-assist-chip-container-shape: 10px;
          --ha-assist-chip-trailing-space: 8px;
        }
        ha-icon-button[aria-pressed="true"] {
          color: var(--primary-color);
        }
        .filter-panel {
          margin-bottom: var(--ha-space-3);
          border-radius: var(--ha-border-radius-xl);
          background: var(--card-background-color);
          overflow: hidden;
        }
        .filter-panel[hidden] {
          display: none;
        }
        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: var(--ha-space-4);
          padding-top: var(--ha-space-2);
        }
        .card {
          --card-tint: var(--ha-color-primary-60);
          position: relative;
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-3);
          min-width: 0;
          padding: var(--ha-space-5);
          border-radius: var(--ha-border-radius-3xl);
          background: color-mix(
            in srgb,
            var(--card-tint) 24%,
            var(--card-background-color)
          );
          color: var(--primary-text-color);
          transition: box-shadow var(--ha-animation-duration-fast, 150ms);
        }
        .card:hover {
          box-shadow: 0 0 0 2px
            color-mix(in srgb, var(--card-tint) 55%, transparent);
        }
        .card.selected {
          box-shadow: 0 0 0 3px var(--primary-color);
        }
        .card.tint-1 {
          --card-tint: var(--ha-color-red-60);
        }
        .card.tint-2 {
          --card-tint: var(--ha-color-neutral-60);
        }
        .card.tint-3 {
          --card-tint: var(--ha-color-orange-70);
        }
        .card.tint-4 {
          --card-tint: var(--ha-color-green-60);
        }
        .card.tint-5 {
          --card-tint: var(--ha-color-orange-60);
        }
        /* The whole card opens the scene; the controls sit above it */
        .card .open {
          position: absolute;
          inset: 0;
          z-index: 0;
          border: 0;
          border-radius: inherit;
          background: transparent;
          cursor: pointer;
        }
        .card .open:focus-visible {
          outline: 2px solid var(--primary-color);
          outline-offset: 2px;
        }
        .card-top,
        .card-text,
        .turn-on {
          position: relative;
          z-index: 1;
        }
        .card-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          pointer-events: none;
        }
        .card-top > * {
          pointer-events: auto;
        }
        .icon-tile {
          display: flex;
          align-items: center;
          justify-content: center;
          width: var(--ha-space-14, 56px);
          height: var(--ha-space-14, 56px);
          border-radius: var(--ha-border-radius-xl);
          background: var(--card-background-color);
          --mdc-icon-size: 28px;
          pointer-events: none;
        }
        .card-text {
          min-width: 0;
          pointer-events: none;
        }
        .card-text h2 {
          margin: 0;
          font-family: var(--ha-font-family-heading, inherit);
          font-size: var(--ha-font-size-2xl);
          font-weight: var(--ha-font-weight-medium);
          line-height: var(--ha-line-height-condensed);
          overflow-wrap: anywhere;
        }
        .card-text p {
          margin: var(--ha-space-1) 0 0;
          color: var(--secondary-text-color);
        }
        .turn-on {
          align-self: flex-start;
        }
        .empty,
        .no-match {
          display: flex;
          flex-direction: column;
          align-items: center;
          margin: var(--ha-space-10) auto;
          max-width: 500px;
          text-align: center;
          color: var(--secondary-text-color);
        }
        .empty ha-svg-icon {
          --mdc-icon-size: 80px;
        }
        .empty h2 {
          margin-block: var(--ha-space-5);
          font-family: var(--ha-font-family-heading);
          font-size: var(--ha-font-size-3xl);
          font-weight: var(--ha-font-weight-normal);
          line-height: var(--ha-line-height-condensed);
          color: var(--primary-text-color);
        }
        ha-dropdown::part(menu),
        ha-dropdown::part(submenu) {
          --auto-size-available-width: calc(50vw - var(--ha-space-4));
        }
        ha-dropdown-item[selected]::part(base) {
          font-weight: var(--ha-font-weight-medium);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-scene-dashboard": HaSceneDashboard;
  }
}
