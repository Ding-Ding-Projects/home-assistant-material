import "@home-assistant/webawesome/dist/components/divider/divider";
import {
  mdiDelete,
  mdiDotsVertical,
  mdiHelpCircleOutline,
  mdiPencil,
  mdiPlus,
  mdiSort,
  mdiTextureBox,
} from "@mdi/js";
import {
  css,
  html,
  LitElement,
  nothing,
  type PropertyValues,
  type TemplateResult,
} from "lit";
import { customElement, property, state } from "lit/decorators";
import { styleMap } from "lit/directives/style-map";
import memoizeOne from "memoize-one";
import {
  getAreasFloorHierarchy,
  getAreasOrder,
  type AreasFloorHierarchy,
} from "../../../common/areas/areas-floor-hierarchy";
import { computeDomain } from "../../../common/entity/compute_domain";
import { formatListWithAnds } from "../../../common/string/format-list";
import "../../../components/ha-button";
import "../../../components/ha-card";
import "../../../components/ha-dropdown";
import type { HaDropdownSelectEvent } from "../../../components/ha-dropdown";
import "../../../components/ha-dropdown-item";
import "../../../components/ha-floor-icon";
import "../../../components/ha-icon-button";
import "../../../components/ha-sortable";
import type { HaSortableOptions } from "../../../components/ha-sortable";
import "../../../components/ha-svg-icon";
import type { AreaRegistryEntry } from "../../../data/area/area_registry";
import {
  createAreaRegistryEntry,
  reorderAreaRegistryEntries,
  updateAreaRegistryEntry,
} from "../../../data/area/area_registry";
import type { FloorRegistryEntry } from "../../../data/floor_registry";
import {
  createFloorRegistryEntry,
  deleteFloorRegistryEntry,
  updateFloorRegistryEntry,
} from "../../../data/floor_registry";
import {
  showAlertDialog,
  showConfirmationDialog,
} from "../../../dialogs/generic/show-dialog-box";
import "../../../layouts/hass-tabs-subpage";
import type { HomeAssistant, Route } from "../../../types";
import { showToast } from "../../../util/toast";
import { configSections } from "../config-sections";
import {
  loadAreaRegistryDetailDialog,
  showAreaRegistryDetailDialog,
} from "./show-dialog-area-registry-detail";
import { showAreasFloorsOrderDialog } from "./show-dialog-areas-floors-order";
import { showFloorRegistryDetailDialog } from "./show-dialog-floor-registry-detail";

const UNASSIGNED_FLOOR = "__unassigned__";

const SORT_OPTIONS: HaSortableOptions = {
  sort: true,
  delay: 500,
  delayOnTouchOnly: true,
};

interface AreaStats {
  devices: number;
  services: number;
  entities: number;
  automations: number;
}

@customElement("ha-config-areas-dashboard")
export class HaConfigAreasDashboard extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: "is-wide", type: Boolean }) public isWide = false;

  @property({ attribute: false }) public route!: Route;

  @state() private _hierarchy?: AreasFloorHierarchy;

  private _blockHierarchyUpdate = false;

  private _blockHierarchyUpdateTimeout?: number;

  private _processAreasStats = memoizeOne(
    (
      areas: HomeAssistant["areas"],
      devices: HomeAssistant["devices"],
      entities: HomeAssistant["entities"]
    ): Map<string, AreaStats> => {
      const computeAreaStats = (area: AreaRegistryEntry) => {
        let devicesCount = 0;
        let servicesCount = 0;
        let entitiesCount = 0;
        let automationsCount = 0;

        for (const device of Object.values(devices)) {
          if (device.area_id === area.area_id) {
            if (device.entry_type === "service") {
              servicesCount++;
            } else {
              devicesCount++;
            }
          }
        }

        for (const entity of Object.values(entities)) {
          const entityAreaId =
            entity.area_id ??
            (entity.device_id ? devices[entity.device_id]?.area_id : undefined);
          if (entityAreaId === area.area_id) {
            entitiesCount++;
            if (computeDomain(entity.entity_id) === "automation") {
              automationsCount++;
            }
          }
        }

        return {
          devices: devicesCount,
          services: servicesCount,
          entities: entitiesCount,
          automations: automationsCount,
        };
      };
      const areaStats = new Map<string, AreaStats>();
      Object.values(areas).forEach((area) => {
        areaStats.set(area.area_id, computeAreaStats(area));
      });
      return areaStats;
    }
  );

  protected willUpdate(changedProperties: PropertyValues<this>): void {
    super.willUpdate(changedProperties);
    if (changedProperties.has("hass")) {
      const oldHass = changedProperties.get("hass");
      if (
        (this.hass.areas !== oldHass?.areas ||
          this.hass.floors !== oldHass?.floors) &&
        !this._blockHierarchyUpdate
      ) {
        this._computeHierarchy();
      }
    }
  }

  private _computeHierarchy() {
    this._hierarchy = getAreasFloorHierarchy(
      Object.values(this.hass.floors),
      Object.values(this.hass.areas)
    );
  }

  protected render(): TemplateResult<1> | typeof nothing {
    if (!this._hierarchy) {
      return nothing;
    }
    const areasStats = this._processAreasStats(
      this.hass.areas,
      this.hass.devices,
      this.hass.entities
    );

    const floorCount = this._hierarchy.floors.length;
    const areaCount = Object.keys(this.hass.areas).length;

    return html`
      <hass-tabs-subpage
        .hass=${this.hass}
        .isWide=${this.isWide}
        back-path="/config"
        .tabs=${configSections.areas}
        .route=${this.route}
      >
        <ha-icon-button
          slot="toolbar-icon"
          .label=${this.hass.localize("ui.common.help")}
          .path=${mdiHelpCircleOutline}
          @click=${this._showHelp}
        ></ha-icon-button>
        <div class="container">
          <div class="page-header">
            <div class="page-heading">
              <h1>${this.hass.localize("ui.panel.config.areas.caption")}</h1>
              <p>
                ${this.hass.localize(
                  floorCount
                    ? "ui.panel.config.areas.picker.summary"
                    : "ui.panel.config.areas.picker.summary_no_floors",
                  { areas: areaCount, floors: floorCount }
                )}
              </p>
            </div>
            <div class="page-actions">
              <ha-button appearance="outlined" @click=${this._createFloor}>
                <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
                ${this.hass.localize("ui.panel.config.areas.picker.add_floor")}
              </ha-button>
              <ha-button @click=${this._createArea}>
                <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
                ${this.hass.localize("ui.panel.config.areas.picker.add_area")}
              </ha-button>
            </div>
          </div>
          ${
            !floorCount && !this._hierarchy.areas.length
              ? html`<div class="empty">
                  ${this.hass.localize("ui.panel.config.areas.picker.no_areas")}
                </div>`
              : nothing
          }
          <div class="floors">
            ${this._hierarchy.floors.map(({ areas, id }) => {
              const floor = this.hass.floors[id];
              if (!floor) {
                return nothing;
              }
              return html`
                <div class="floor">
                  <div class="header">
                    <h2>
                      <ha-floor-icon .floor=${floor}></ha-floor-icon>
                      ${floor.name}
                    </h2>
                    <div class="actions">
                      <ha-icon-button
                        .floor=${floor}
                        .path=${mdiPencil}
                        .label=${this.hass.localize(
                          "ui.panel.config.areas.picker.floor.edit_floor"
                        )}
                        @click=${this._editFloorClicked}
                      ></ha-icon-button>
                      <ha-dropdown
                        .floor=${floor}
                        @wa-select=${this._handleFloorAction}
                      >
                        <ha-icon-button
                          slot="trigger"
                          .path=${mdiDotsVertical}
                          .label=${this.hass.localize("ui.common.menu")}
                        ></ha-icon-button>
                        <ha-dropdown-item value="reorder"
                          ><ha-svg-icon
                            .path=${mdiSort}
                            slot="icon"
                          ></ha-svg-icon
                          >${this.hass.localize(
                            "ui.panel.config.areas.picker.reorder"
                          )}</ha-dropdown-item
                        >
                        <wa-divider></wa-divider>
                        <ha-dropdown-item value="edit"
                          ><ha-svg-icon
                            .path=${mdiPencil}
                            slot="icon"
                          ></ha-svg-icon
                          >${this.hass.localize(
                            "ui.panel.config.areas.picker.floor.edit_floor"
                          )}</ha-dropdown-item
                        >
                        <ha-dropdown-item value="delete" variant="danger"
                          ><ha-svg-icon
                            .path=${mdiDelete}
                            slot="icon"
                          ></ha-svg-icon
                          >${this.hass.localize(
                            "ui.panel.config.areas.picker.floor.delete_floor"
                          )}</ha-dropdown-item
                        >
                      </ha-dropdown>
                    </div>
                  </div>
                  <ha-sortable
                    handle-selector="a"
                    draggable-selector="a"
                    @item-added=${this._areaAdded}
                    @item-moved=${this._areaMoved}
                    group="areas"
                    .options=${SORT_OPTIONS}
                    .floor=${floor.floor_id}
                  >
                    <div class="areas">
                      ${areas.map((areaId) => {
                        const area = this.hass.areas[areaId];
                        if (!area) {
                          return nothing;
                        }
                        const stats = areasStats.get(area.area_id);
                        return this._renderArea(area, stats);
                      })}
                    </div>
                  </ha-sortable>
                </div>
              `;
            })}
          </div>

          ${
            this._hierarchy.areas.length
              ? html`
                  <div class="floor">
                    <div class="header">
                      <h2>
                        ${this.hass.localize(
                          this._hierarchy.floors.length
                            ? "ui.panel.config.areas.picker.no_floor"
                            : "ui.panel.config.areas.picker.header"
                        )}
                      </h2>
                      <div class="actions">
                        <ha-dropdown
                          @wa-select=${this._handleUnassignedAreasAction}
                        >
                          <ha-icon-button
                            slot="trigger"
                            .path=${mdiDotsVertical}
                            .label=${this.hass.localize("ui.common.menu")}
                          ></ha-icon-button>
                          <ha-dropdown-item value="reorder"
                            ><ha-svg-icon
                              .path=${mdiSort}
                              slot="icon"
                            ></ha-svg-icon
                            >${this.hass.localize(
                              "ui.panel.config.areas.picker.reorder"
                            )}</ha-dropdown-item
                          >
                        </ha-dropdown>
                      </div>
                    </div>
                    <ha-sortable
                      handle-selector="a"
                      draggable-selector="a"
                      @item-added=${this._areaAdded}
                      @item-moved=${this._areaMoved}
                      group="areas"
                      .options=${SORT_OPTIONS}
                      .floor=${UNASSIGNED_FLOOR}
                    >
                      <div class="areas">
                        ${this._hierarchy.areas.map((areaId) => {
                          const area = this.hass.areas[areaId];
                          if (!area) {
                            return nothing;
                          }
                          const stats = areasStats.get(area.area_id);
                          return this._renderArea(area, stats);
                        })}
                      </div>
                    </ha-sortable>
                  </div>
                `
              : nothing
          }
        </div>
      </hass-tabs-subpage>
    `;
  }

  private _renderArea(
    area: AreaRegistryEntry,
    stats: AreaStats | undefined
  ): TemplateResult<1> {
    const temperatureState = area.temperature_entity_id
      ? this.hass.states[area.temperature_entity_id]
      : undefined;
    const temperature =
      temperatureState &&
      temperatureState.state !== "unavailable" &&
      temperatureState.state !== "unknown"
        ? this.hass.formatEntityState(temperatureState)
        : undefined;
    const summary = formatListWithAnds(
      this.hass.locale,
      [
        stats?.devices &&
          this.hass.localize(
            "ui.panel.config.integrations.config_entry.devices",
            { count: stats.devices }
          ),
        stats?.services &&
          this.hass.localize(
            "ui.panel.config.integrations.config_entry.services",
            { count: stats.services }
          ),
        stats?.automations &&
          this.hass.localize("ui.panel.config.areas.picker.automations_count", {
            count: stats.automations,
          }),
      ].filter((v): v is string => Boolean(v))
    );
    return html`
      <a href=${`/config/areas/area/${area.area_id}`} .sortableData=${area}>
        <ha-card outlined>
          <div
            style=${styleMap({
              backgroundImage: area.picture
                ? `url(${area.picture})`
                : undefined,
            })}
            class="picture ${!area.picture ? "placeholder" : ""}"
          >
            ${
              temperature
                ? html`<span class="temperature">${temperature}</span>`
                : nothing
            }
          </div>
          <div class="card-body">
            ${
              area.icon
                ? html`<ha-icon .icon=${area.icon}></ha-icon>`
                : html`<ha-svg-icon .path=${mdiTextureBox}></ha-svg-icon>`
            }
            <div class="card-text">
              <div class="name">${area.name}</div>
              ${summary ? html`<div class="stats">${summary}</div>` : nothing}
            </div>
            <ha-icon-button
              .area=${area}
              .path=${mdiPencil}
              .label=${this.hass.localize("ui.panel.config.areas.edit_settings")}
              @click=${this._openAreaDetails}
            ></ha-icon-button>
          </div>
        </ha-card>
      </a>
    `;
  }

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);
    loadAreaRegistryDetailDialog();
  }

  private _openAreaDetails(ev) {
    ev.preventDefault();
    const area = ev.currentTarget.area;
    showAreaRegistryDetailDialog(this, {
      entry: area,
      updateEntry: async (values) =>
        updateAreaRegistryEntry(this.hass!.callWS, area.area_id, values),
    });
  }

  private async _areaMoved(ev) {
    ev.stopPropagation();
    if (!this.hass || !this._hierarchy) {
      return;
    }
    const { floor } = ev.currentTarget;
    const { oldIndex, newIndex } = ev.detail;

    const floorId = floor === UNASSIGNED_FLOOR ? null : floor;

    // Reorder areas within the same floor
    const reorderAreas = (areas: string[], oldIdx: number, newIdx: number) => {
      const newAreas = [...areas];
      const [movedArea] = newAreas.splice(oldIdx, 1);
      newAreas.splice(newIdx, 0, movedArea);
      return newAreas;
    };

    // Optimistically update UI
    this._hierarchy = {
      ...this._hierarchy,
      floors: this._hierarchy.floors.map((f) => {
        if (f.id === floorId) {
          return {
            ...f,
            areas: reorderAreas(f.areas, oldIndex, newIndex),
          };
        }
        return f;
      }),
      areas:
        floorId === null
          ? reorderAreas(this._hierarchy.areas, oldIndex, newIndex)
          : this._hierarchy.areas,
    };

    const areaOrder = getAreasOrder(this._hierarchy);

    try {
      await reorderAreaRegistryEntries(this.hass, areaOrder);
    } catch {
      showToast(this, {
        message: this.hass.localize(
          "ui.panel.config.areas.picker.area_move_failed"
        ),
      });
      // Revert on error
      this._computeHierarchy();
    }
  }

  private async _areaAdded(ev) {
    ev.stopPropagation();
    if (!this.hass || !this._hierarchy) {
      return;
    }
    const { floor } = ev.currentTarget;
    const { data: area, index } = ev.detail;

    const newFloorId = floor === UNASSIGNED_FLOOR ? null : floor;

    // Insert area at the specified index
    const insertAtIndex = (areas: string[], areaId: string, idx: number) => {
      const newAreas = [...areas];
      newAreas.splice(idx, 0, areaId);
      return newAreas;
    };

    // Optimistically update UI
    this._hierarchy = {
      ...this._hierarchy,
      floors: this._hierarchy.floors.map((f) => {
        if (f.id === newFloorId) {
          return {
            ...f,
            areas: insertAtIndex(f.areas, area.area_id, index),
          };
        }
        return {
          ...f,
          areas: f.areas.filter((id) => id !== area.area_id),
        };
      }),
      areas:
        newFloorId === null
          ? insertAtIndex(this._hierarchy.areas, area.area_id, index)
          : this._hierarchy.areas.filter((id) => id !== area.area_id),
    };

    const areaOrder = getAreasOrder(this._hierarchy);

    // Block hierarchy updates for 500ms to avoid flickering
    // because of multiple async updates
    this._blockHierarchyUpdateFor(500);

    try {
      await reorderAreaRegistryEntries(this.hass, areaOrder);
      await updateAreaRegistryEntry(this.hass.callWS, area.area_id, {
        floor_id: newFloorId,
      });
    } catch {
      showToast(this, {
        message: this.hass.localize(
          "ui.panel.config.areas.picker.area_move_failed"
        ),
      });
      // Revert on error
      this._computeHierarchy();
    }
  }

  private _blockHierarchyUpdateFor(time: number) {
    this._blockHierarchyUpdate = true;
    if (this._blockHierarchyUpdateTimeout) {
      window.clearTimeout(this._blockHierarchyUpdateTimeout);
    }
    this._blockHierarchyUpdateTimeout = window.setTimeout(() => {
      this._blockHierarchyUpdate = false;
    }, time);
  }

  private _handleFloorAction(ev: HaDropdownSelectEvent) {
    const floor = (ev.currentTarget as any).floor;
    const action = ev.detail.item.value;
    switch (action) {
      case "reorder":
        this._showReorderDialog();
        break;
      case "edit":
        this._editFloor(floor);
        break;
      case "delete":
        this._deleteFloor(floor);
        break;
    }
  }

  private _handleUnassignedAreasAction(ev: HaDropdownSelectEvent) {
    const action = ev.detail.item.value;
    if (action === "reorder") {
      this._showReorderDialog();
    }
  }

  private _createFloor() {
    this._openFloorDialog();
  }

  private _editFloorClicked(ev: Event) {
    ev.stopPropagation();
    this._editFloor((ev.currentTarget as any).floor);
  }

  private _editFloor(floor) {
    this._openFloorDialog(floor);
  }

  private async _deleteFloor(floor) {
    const confirm = await showConfirmationDialog(this, {
      title: this.hass.localize(
        "ui.panel.config.areas.picker.floor.confirm_delete"
      ),
      text: this.hass.localize(
        "ui.panel.config.areas.picker.floor.confirm_delete_text"
      ),
      confirmText: this.hass.localize("ui.common.delete"),
      destructive: true,
    });
    if (!confirm) {
      return;
    }
    await deleteFloorRegistryEntry(this.hass, floor.floor_id);
  }

  private _createArea() {
    this._openAreaDialog();
  }

  private _showReorderDialog() {
    showAreasFloorsOrderDialog(this, {});
  }

  private _showHelp() {
    showAlertDialog(this, {
      title: this.hass.localize("ui.panel.config.areas.caption"),
      text: html`
        ${this.hass.localize("ui.panel.config.areas.picker.introduction")}
        <p>
          ${this.hass.localize("ui.panel.config.areas.picker.introduction2")}
        </p>
        <a href="/config/integrations/dashboard">
          ${this.hass.localize(
            "ui.panel.config.areas.picker.integrations_page"
          )}
        </a>
      `,
    });
  }

  private _openAreaDialog(entry?: AreaRegistryEntry) {
    showAreaRegistryDetailDialog(this, {
      entry,
      createEntry: async (values) =>
        createAreaRegistryEntry(this.hass!, values),
    });
  }

  private _openFloorDialog(entry?: FloorRegistryEntry) {
    showFloorRegistryDetailDialog(this, {
      entry,
      createEntry: async (values, addedAreas) => {
        const floor = await createFloorRegistryEntry(this.hass!.callWS, values);
        addedAreas.forEach((areaId) => {
          updateAreaRegistryEntry(this.hass.callWS, areaId, {
            floor_id: floor.floor_id,
          });
        });
      },
      updateEntry: async (values, addedAreas, removedAreas) => {
        const floor = await updateFloorRegistryEntry(
          this.hass!,
          entry!.floor_id,
          values
        );
        addedAreas.forEach((areaId) => {
          updateAreaRegistryEntry(this.hass.callWS, areaId, {
            floor_id: floor.floor_id,
          });
        });
        removedAreas.forEach((areaId) => {
          updateAreaRegistryEntry(this.hass.callWS, areaId, {
            floor_id: null,
          });
        });
      },
    });
  }

  static styles = css`
    :host {
      display: block;
    }
    .container {
      box-sizing: border-box;
      padding: var(--ha-space-4) var(--ha-space-8) var(--ha-space-8);
      margin: 0 auto;
      max-width: 1280px;
    }
    .page-header {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--ha-space-4);
      padding-top: var(--ha-space-4);
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
    .page-actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-3);
    }
    .empty {
      padding: var(--ha-space-8) 0;
      color: var(--secondary-text-color);
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-inline-start: var(--ha-space-1);
    }
    .header h2 {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      margin: var(--ha-space-6) 0 var(--ha-space-2);
      font-size: var(--ha-font-size-l);
      font-weight: var(--ha-font-weight-medium);
      color: var(--primary-text-color);
    }
    .header .actions {
      display: flex;
      align-items: center;
      color: var(--secondary-text-color);
    }
    .areas {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      grid-gap: var(--ha-space-4);
      max-width: 2000px;
      margin-bottom: var(--ha-space-4);
    }
    .areas > * {
      max-width: 500px;
    }
    ha-card {
      overflow: hidden;
      border-radius: var(--ha-border-radius-3xl);
    }
    a {
      text-decoration: none;
      color: inherit;
    }
    .picture {
      height: 96px;
      width: 100%;
      background-size: cover;
      background-position: center;
      position: relative;
    }
    .picture.placeholder {
      background-image: linear-gradient(
        135deg,
        var(--primary-color),
        color-mix(
          in srgb,
          var(--primary-color) 25%,
          var(--card-background-color)
        )
      );
    }
    .temperature {
      position: absolute;
      inset-inline-start: var(--ha-space-3);
      bottom: var(--ha-space-3);
      padding: var(--ha-space-1) var(--ha-space-2);
      border-radius: var(--ha-border-radius-pill, 999px);
      background: var(--card-background-color);
      color: var(--primary-text-color);
      font-size: var(--ha-font-size-s);
      font-weight: var(--ha-font-weight-medium);
    }
    .card-body {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
      padding: var(--ha-space-3) var(--ha-space-2) var(--ha-space-3)
        var(--ha-space-4);
    }
    .card-text {
      flex: 1;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .name {
      font-size: var(--ha-font-size-l);
      font-weight: var(--ha-font-weight-medium);
      color: var(--primary-text-color);
    }
    .stats {
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
    @media (max-width: 600px) {
      .container {
        padding: var(--ha-space-2) var(--ha-space-4) var(--ha-space-6);
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-areas-dashboard": HaConfigAreasDashboard;
  }
}
