import { mdiPencil, mdiPencilOff, mdiPlus } from "@mdi/js";
import type { HassEntity, UnsubscribeFunc } from "home-assistant-js-websocket";
import type { PropertyValues, TemplateResult } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { styleMap } from "lit/directives/style-map";
import memoizeOne from "memoize-one";
import { computeStateDomain } from "../../../common/entity/compute_state_domain";
import { addDistanceToCoord } from "../../../common/location/add_distance_to_coord";
import { shouldHandleRequestSelectedEvent } from "../../../common/mwc/handle-request-selected-event";
import { navigate } from "../../../common/navigate";
import { stringCompare } from "../../../common/string/compare";
import { slugify } from "../../../common/string/slugify";
import "../../../components/ha-button";
import "../../../components/ha-card";
import "../../../components/ha-form/ha-form";
import "../../../components/ha-icon-button";
import "../../../components/ha-list";
import "../../../components/ha-list-item";
import "../../../components/ha-svg-icon";
import "../../../components/ha-tooltip";
import "../../../components/map/ha-locations-editor";
import type {
  HaLocationsEditor,
  MarkerLocation,
} from "../../../components/map/ha-locations-editor";
import { saveCoreConfig } from "../../../data/core";
import type { EntityRegistryEntry } from "../../../data/entity/entity_registry";
import { subscribeEntityRegistry } from "../../../data/entity/entity_registry";
import {
  HOME_ZONE_ENTITY_ID,
  zoneColor,
} from "../../../common/map/entity-map-colors";
import {
  contrastingZoneContent,
  zoneInitials,
} from "../../../common/map/zone-marker";
import type {
  HomeZoneMutableParams,
  Zone,
  ZoneMutableParams,
} from "../../../data/zone";
import {
  createZone,
  deleteZone,
  fetchZones,
  updateZone,
} from "../../../data/zone";
import {
  showAlertDialog,
  showConfirmationDialog,
} from "../../../dialogs/generic/show-dialog-box";
import "../../../layouts/hass-loading-screen";
import "../../../layouts/hass-tabs-subpage";
import { SubscribeMixin } from "../../../mixins/subscribe-mixin";
import type { HomeAssistant, Route } from "../../../types";
import "../ha-config-section";
import { configSections } from "../config-sections";
import { showHomeZoneDetailDialog } from "./show-dialog-home-zone-detail";
import { showZoneDetailDialog } from "./show-dialog-zone-detail";

// The zone shown in the form under the map
interface SelectedZone {
  id: string;
  name: string;
  icon?: string;
  radius?: number;
  latitude?: number;
  longitude?: number;
  // Name and icon can be edited here, the radius and position alone for home
  editable: boolean;
  radiusEditable: boolean;
  entry?: Zone;
}

// Values typed in the form and not saved yet
interface FormDraft {
  name?: string;
  icon?: string;
  radius?: number;
}

const KEY_STEP = 10;

interface PendingEdit {
  latitude?: number;
  longitude?: number;
  radius?: number;
}

// How close the saved value must come to a pending one to count as saved
const PENDING_TOLERANCE: Record<keyof PendingEdit, number> = {
  latitude: 1e-7,
  longitude: 1e-7,
  radius: 0.5,
};

@customElement("ha-config-zone")
export class HaConfigZone extends SubscribeMixin(LitElement) {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: "is-wide", type: Boolean }) public isWide = false;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: false }) public route!: Route;

  @state() private _storageItems?: Zone[];

  @state() private _stateItems?: HassEntity[];

  // Values dragged on the map, shown until the saved data reflects them, so
  // a re-render while the save is in flight does not move the marker back.
  // A failed save drops them and the marker returns to the saved values.
  @state() private _pendingEdits: Record<string, PendingEdit> = {};

  @state() private _canEditCore = false;

  // The zone the map and the form under it are about
  @state() private _selectedId?: string;

  @state() private _draft: FormDraft = {};

  @state() private _saving = false;

  @query("ha-locations-editor") private _map?: HaLocationsEditor;

  private _regEntities: string[] = [];

  // Registry creation order decides the zone colors
  @state() private _entityReg: EntityRegistryEntry[] = [];

  // Storage zone id (its unique id) to entity id
  @state() private _zoneEntityIds: Record<string, string> = {};

  // Bumped on a theme change to recompute the memoized locations
  @state() private _colorVersion = 0;

  // Home first, then alphabetical, for UI and YAML zones alike
  private _sortedItems = memoizeOne(
    (
      storageItems: Zone[],
      stateItems: HassEntity[],
      formatEntityName: HomeAssistant["formatEntityName"],
      language: string
    ): ({ entry: Zone } | { stateObject: HassEntity })[] => {
      const items = [
        ...storageItems.map((entry) => ({
          entry,
          name: entry.name,
          home: false,
        })),
        ...stateItems.map((stateObject) => ({
          stateObject,
          name: formatEntityName(stateObject) || stateObject.entity_id,
          home: stateObject.entity_id === HOME_ZONE_ENTITY_ID,
        })),
      ];
      return items.sort((a, b) =>
        a.home !== b.home
          ? a.home
            ? -1
            : 1
          : stringCompare(a.name, b.name, language)
      );
    }
  );

  private _renderStorageItem(entry: Zone) {
    const hass = this.hass;
    return html`
      <ha-list-item
        .entry=${entry}
        .id=${this.narrow ? entry.id : ""}
        graphic="avatar"
        twoline
        .hasMeta=${!this.narrow}
        ?activated=${this._selectedId === entry.id}
        @request-selected=${this._itemClicked}
        .value=${entry.id}
      >
        ${this._renderZoneGraphic(
          this._zoneEntityIds[entry.id] ?? `zone.${entry.id}`,
          !!entry.passive,
          entry.icon,
          entry.name
        )}
        <span>${entry.name}</span>
        <span slot="secondary">
          ${this._zoneSubtitle(
            this._zoneEntityIds[entry.id] ?? `zone.${entry.id}`,
            entry.radius,
            !!entry.passive
          )}
        </span>
        ${
          !this.narrow
            ? html`
                <div slot="meta">
                  <ha-icon-button
                    .id=${entry.id}
                    .entry=${entry}
                    @click=${this._openEditEntry}
                    .path=${mdiPencil}
                    .label=${hass.localize("ui.common.edit_item", {
                      name: entry.name,
                    })}
                  ></ha-icon-button>
                </div>
              `
            : ""
        }
      </ha-list-item>
    `;
  }

  private _renderStateItem(stateObject: HassEntity) {
    const hass = this.hass;
    const name = hass.formatEntityName(stateObject) || stateObject.entity_id;
    return html`
      <ha-list-item
        graphic="avatar"
        twoline
        ?activated=${this._selectedId === stateObject.entity_id}
        .id=${this.narrow ? stateObject.entity_id : ""}
        .hasMeta=${!this.narrow || stateObject.entity_id !== "zone.home"}
        .value=${stateObject.entity_id}
        @request-selected=${this._stateItemClicked}
        .noEdit=${stateObject.entity_id !== "zone.home" || !this._canEditCore}
      >
        ${this._renderZoneGraphic(
          stateObject.entity_id,
          !!stateObject.attributes.passive,
          stateObject.attributes.icon,
          name
        )}
        <span>${name}</span>
        <span slot="secondary">
          ${this._zoneSubtitle(
            stateObject.entity_id,
            stateObject.attributes.radius,
            !!stateObject.attributes.passive
          )}
        </span>
        ${
          this.narrow &&
          stateObject.entity_id === "zone.home" &&
          !this._canEditCore
            ? nothing
            : html`<ha-icon-button
                  .id="zone-${slugify(stateObject.entity_id)}"
                  .entityId=${stateObject.entity_id}
                  .noEdit=${
                    stateObject.entity_id !== "zone.home" || !this._canEditCore
                  }
                  .path=${
                    stateObject.entity_id === "zone.home" && this._canEditCore
                      ? mdiPencil
                      : mdiPencilOff
                  }
                  .label=${hass.localize("ui.common.edit_item", {
                    name: hass.config.location_name,
                  })}
                  @click=${this._editHomeZone}
                  slot="meta"
                ></ha-icon-button>
                <ha-tooltip
                  .for="zone-${slugify(stateObject.entity_id)}"
                  placement="left"
                  .disabled=${stateObject.entity_id === "zone.home"}
                  hoist
                >
                  ${hass.localize("ui.panel.config.zone.configured_in_yaml")}
                </ha-tooltip>`
        }
      </ha-list-item>
    `;
  }

  // Radius, how many people are in it and whether it is passive
  private _zoneSubtitle(
    entityId: string,
    radius: number | undefined,
    passive: boolean
  ): string {
    const hass = this.hass;
    const people = Number(hass.states[entityId]?.state);
    return [
      radius !== undefined
        ? hass.localize("ui.panel.config.zone.radius_meters", {
            radius: Math.round(radius),
          })
        : undefined,
      people > 0
        ? hass.localize("ui.panel.config.zone.people_here", { count: people })
        : undefined,
      passive ? hass.localize("ui.panel.config.zone.passive") : undefined,
    ]
      .filter(Boolean)
      .join(", ");
  }

  // The zone as it looks on the map: its color, with its icon or initials
  private _renderZoneGraphic(
    entityId: string,
    passive: boolean,
    icon: string | undefined,
    name: string
  ) {
    const color = zoneColor(
      entityId,
      passive,
      this._entityReg,
      getComputedStyle(this)
    );
    return html`
      <div
        slot="graphic"
        class="zone-avatar"
        style=${styleMap({
          background: color,
          color: contrastingZoneContent(color),
        })}
      >
        ${icon ? html`<ha-icon .icon=${icon}></ha-icon>` : zoneInitials(name)}
      </div>
    `;
  }

  private _getZones = memoizeOne(
    (
      storageItems: Zone[],
      stateItems: HassEntity[],
      formatEntityName: HomeAssistant["formatEntityName"],
      zoneEntityIds: Record<string, string>,
      pendingEdits: Record<string, PendingEdit>,
      entityReg: EntityRegistryEntry[],
      _colorVersion: number
    ): MarkerLocation[] => {
      const computedStyles = getComputedStyle(this);

      const stateLocations: MarkerLocation[] = stateItems.map(
        (entityState) => ({
          id: entityState.entity_id,
          icon: entityState.attributes.icon,
          name: formatEntityName(entityState) || entityState.entity_id,
          latitude: entityState.attributes.latitude,
          longitude: entityState.attributes.longitude,
          radius: entityState.attributes.radius,
          ...pendingEdits[entityState.entity_id],
          radius_color: zoneColor(
            entityState.entity_id,
            !!entityState.attributes.passive,
            entityReg,
            computedStyles
          ),
          location_editable:
            entityState.entity_id === HOME_ZONE_ENTITY_ID && this._canEditCore,
          radius_editable:
            entityState.entity_id === HOME_ZONE_ENTITY_ID && this._canEditCore,
          clickable: true,
          fit: !entityState.attributes.passive,
        })
      );
      const storageLocations: MarkerLocation[] = storageItems.map((zone) => ({
        ...zone,
        ...pendingEdits[zone.id],
        radius_color: zoneColor(
          zoneEntityIds[zone.id] ?? `zone.${zone.id}`,
          !!zone.passive,
          entityReg,
          computedStyles
        ),
        location_editable: true,
        radius_editable: true,
        clickable: true,
        fit: !zone.passive,
      }));
      return storageLocations.concat(stateLocations);
    }
  );

  public hassSubscribe(): UnsubscribeFunc[] {
    return [
      subscribeEntityRegistry(this.hass.connection!, (entities) => {
        this._entityReg = entities;
        this._regEntities = entities.map(
          (registryEntry) => registryEntry.entity_id
        );
        this._zoneEntityIds = Object.fromEntries(
          entities
            .filter((registryEntry) => registryEntry.platform === "zone")
            .map((registryEntry) => [
              registryEntry.unique_id,
              registryEntry.entity_id,
            ])
        );
        this._filterStates();
      }),
    ];
  }

  protected render(): TemplateResult {
    if (
      !this.hass ||
      this._storageItems === undefined ||
      this._stateItems === undefined
    ) {
      return html`<hass-loading-screen></hass-loading-screen>`;
    }
    const hass = this.hass;
    const listBox =
      this._storageItems.length === 0 && this._stateItems.length === 0
        ? html`
            <div class="empty">
              ${hass.localize("ui.panel.config.zone.no_zones_created_yet")}
              <br />
              <ha-button size="s" @click=${this._createZone}>
                ${hass.localize("ui.panel.config.zone.create_zone")}</ha-button
              >
            </div>
          `
        : html`
            <ha-list>
              ${this._sortedItems(
                this._storageItems,
                this._stateItems,
                hass.formatEntityName,
                hass.locale.language
              ).map((item) =>
                "entry" in item
                  ? this._renderStorageItem(item.entry)
                  : this._renderStateItem(item.stateObject)
              )}
            </ha-list>
            <ha-button
              class="add-zone"
              appearance="filled"
              variant="neutral"
              @click=${this._createZone}
            >
              <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
              ${hass.localize("ui.panel.config.zone.add_zone")}
            </ha-button>
          `;

    return html`
      <hass-tabs-subpage
        .hass=${this.hass}
        .route=${this.route}
        back-path="/config"
        .tabs=${configSections.areas}
        has-fab
      >
        ${
          this.narrow
            ? html`
                <ha-config-section .isWide=${this.isWide}>
                  <span slot="introduction">
                    ${hass.localize("ui.panel.config.zone.introduction")}
                  </span>
                  <ha-card outlined>${listBox}</ha-card>
                </ha-config-section>
              `
            : ""
        }
        ${
          !this.narrow
            ? html`
                <div class="flex">
                  <div class="overflow">${listBox}</div>
                  <div class="detail">
                    <div
                      class="map-wrap"
                      tabindex="0"
                      role="group"
                      aria-label=${hass.localize(
                        "ui.panel.config.zone.map_label"
                      )}
                      @keydown=${this._mapKeydown}
                    >
                      <ha-locations-editor
                        .locations=${this._getZones(
                          this._storageItems,
                          this._stateItems,
                          hass.formatEntityName,
                          this._zoneEntityIds,
                          this._pendingEdits,
                          this._entityReg,
                          this._colorVersion
                        )}
                        @location-updated=${this._locationUpdated}
                        @radius-updated=${this._radiusUpdated}
                        @marker-clicked=${this._markerClicked}
                      ></ha-locations-editor>
                    </div>
                    ${this._renderForm()}
                  </div>
                </div>
              `
            : ""
        }
        ${
          this.narrow
            ? html`<ha-button slot="fab" size="l" @click=${this._createZone}>
                <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
                ${hass.localize("ui.panel.config.zone.create_zone")}
              </ha-button>`
            : nothing
        }
      </hass-tabs-subpage>
    `;
  }

  // The selected zone, or home (then the first zone) before one is chosen
  private _selection(): SelectedZone | undefined {
    const storage = this._storageItems ?? [];
    const states = this._stateItems ?? [];
    const id =
      this._selectedId &&
      (storage.some((zone) => zone.id === this._selectedId) ||
        states.some((zone) => zone.entity_id === this._selectedId))
        ? this._selectedId
        : (states.find((zone) => zone.entity_id === HOME_ZONE_ENTITY_ID)
            ?.entity_id ??
          storage[0]?.id ??
          states[0]?.entity_id);
    if (!id) {
      return undefined;
    }
    const entry = storage.find((zone) => zone.id === id);
    if (entry) {
      return {
        id,
        name: entry.name,
        icon: entry.icon,
        radius: entry.radius,
        latitude: entry.latitude,
        longitude: entry.longitude,
        editable: true,
        radiusEditable: true,
        entry,
      };
    }
    const stateObject = states.find((zone) => zone.entity_id === id)!;
    const isHome = id === HOME_ZONE_ENTITY_ID;
    return {
      id,
      name: this.hass.formatEntityName(stateObject) || id,
      icon: stateObject.attributes.icon,
      radius: stateObject.attributes.radius,
      latitude: stateObject.attributes.latitude,
      longitude: stateObject.attributes.longitude,
      editable: false,
      radiusEditable: isHome && this._canEditCore,
    };
  }

  private _formSchema = memoizeOne(
    (editable: boolean, radiusEditable: boolean) =>
      [
        {
          name: "",
          type: "grid",
          column_min_width: "160px",
          schema: [
            {
              name: "name",
              required: true,
              disabled: !editable,
              selector: { text: {} },
            },
            {
              name: "radius",
              required: true,
              disabled: !radiusEditable,
              selector: {
                number: {
                  min: 1,
                  step: 1,
                  mode: "box",
                  unit_of_measurement: "m",
                },
              },
            },
            {
              name: "icon",
              disabled: !editable,
              selector: { icon: {} },
            },
          ],
        },
      ] as const
  );

  private _computeFormLabel = (schema: { name: string }) =>
    this.hass.localize(`ui.panel.config.zone.detail.${schema.name}` as any);

  private _renderForm() {
    const selected = this._selection();
    if (!selected) {
      return nothing;
    }
    const pending = this._pendingEdits[selected.id];
    const data = {
      name: this._draft.name ?? selected.name,
      icon: this._draft.icon ?? selected.icon,
      radius: this._draft.radius ?? pending?.radius ?? selected.radius,
    };
    const dirty = Object.keys(this._draft).length > 0;
    const readOnly = !selected.editable && !selected.radiusEditable;
    return html`
      <div class="form">
        <ha-form
          .hass=${this.hass}
          .schema=${this._formSchema(selected.editable, selected.radiusEditable)}
          .data=${data}
          .computeLabel=${this._computeFormLabel}
          @value-changed=${this._formChanged}
        ></ha-form>
        <div class="form-footer">
          <p class="hint">
            ${this.hass.localize(
              readOnly
                ? "ui.panel.config.zone.configured_in_yaml"
                : "ui.panel.config.zone.map_hint"
            )}
          </p>
          <ha-button
            .disabled=${readOnly || !dirty || this._saving}
            @click=${this._saveForm}
          >
            ${this.hass.localize("ui.common.save")}
          </ha-button>
        </div>
      </div>
    `;
  }

  private _formChanged(ev: CustomEvent) {
    const selected = this._selection();
    if (!selected) {
      return;
    }
    const value = ev.detail.value as FormDraft;
    const draft: FormDraft = {};
    if (selected.editable && value.name !== selected.name) {
      draft.name = value.name;
    }
    if (selected.editable && (value.icon || undefined) !== selected.icon) {
      draft.icon = value.icon || undefined;
    }
    const savedRadius =
      this._pendingEdits[selected.id]?.radius ?? selected.radius;
    if (selected.radiusEditable && value.radius !== savedRadius) {
      draft.radius = value.radius;
    }
    this._draft = draft;
  }

  private async _saveForm() {
    const selected = this._selection();
    if (!selected || !Object.keys(this._draft).length) {
      return;
    }
    const draft = this._draft;
    this._saving = true;
    try {
      if (selected.entry) {
        await this._updateEntry(selected.entry, draft);
      } else if (draft.radius !== undefined) {
        await this._saveEdit(selected.id, {
          radius: Math.round(draft.radius),
        });
      }
      this._draft = {};
    } catch (err: any) {
      showAlertDialog(this, {
        title: this.hass.localize("ui.panel.config.zone.can_not_edit"),
        text: err.message,
      });
    } finally {
      this._saving = false;
    }
  }

  private _select(id: string) {
    if (this._selectedId !== id) {
      this._selectedId = id;
      this._draft = {};
    }
  }

  private _markerClicked(ev: CustomEvent<{ id: string }>) {
    this._select(ev.detail.id);
  }

  // Arrow keys move the selected zone and plus and minus resize it, 10 m at a
  // time, for people who cannot drag
  private _mapKeydown(ev: KeyboardEvent) {
    const selected = this._selection();
    if (
      ev.target !== ev.currentTarget ||
      !selected ||
      ev.altKey ||
      ev.ctrlKey ||
      ev.metaKey
    ) {
      return;
    }
    const pending = this._pendingEdits[selected.id];
    const radius = pending?.radius ?? selected.radius;
    if (["+", "=", "-", "_"].includes(ev.key)) {
      if (!selected.radiusEditable || radius === undefined) {
        return;
      }
      ev.preventDefault();
      const step = ev.key === "+" || ev.key === "=" ? KEY_STEP : -KEY_STEP;
      this._saveEdit(selected.id, {
        radius: Math.max(1, Math.round(radius) + step),
      });
      return;
    }
    const moves: Record<string, [number, number]> = {
      ArrowUp: [0, KEY_STEP],
      ArrowDown: [0, -KEY_STEP],
      ArrowLeft: [-KEY_STEP, 0],
      ArrowRight: [KEY_STEP, 0],
    };
    const move = moves[ev.key];
    const latitude = pending?.latitude ?? selected.latitude;
    const longitude = pending?.longitude ?? selected.longitude;
    if (
      !move ||
      !(selected.editable || selected.radiusEditable) ||
      latitude === undefined ||
      longitude === undefined
    ) {
      return;
    }
    ev.preventDefault();
    const [lat, lng] = addDistanceToCoord([latitude, longitude], ...move);
    this._saveEdit(selected.id, { latitude: lat, longitude: lng });
  }

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);
    this._canEditCore =
      Boolean(this.hass.user?.is_admin) &&
      ["storage", "default"].includes(this.hass.config.config_source);
    this._fetchData();
  }

  protected updated(changedProps: PropertyValues<this>) {
    super.updated(changedProps);
    // The page is kept between visits, so routes are handled on every change
    if (changedProps.has("route") && this.route.path === "/new") {
      this._openNewZone();
      return;
    }
    if (
      !this.route.path.startsWith("/edit/") ||
      !this._stateItems ||
      !this._storageItems
    ) {
      return;
    }
    const id = this.route.path.slice(6);
    this._editZone(id);
    navigate("/config/zone", { replace: true });
    if (this.narrow) {
      return;
    }
    this._zoomZone(id);
  }

  public willUpdate(changedProps: PropertyValues<this>) {
    super.willUpdate(changedProps);
    const oldHass = changedProps.get("hass") as HomeAssistant | undefined;
    if (oldHass && this._stateItems) {
      this._getStates(oldHass);
    }
    // Zone colors come from theme variables
    if (oldHass && oldHass.themes !== this.hass.themes) {
      this._colorVersion++;
    }
    this._settlePendingEdits();
  }

  // A pending edit is done once the saved data carries its values
  private _settlePendingEdits() {
    for (const [id, pending] of Object.entries(this._pendingEdits)) {
      const saved =
        this._storageItems?.find((zone) => zone.id === id) ??
        this.hass.states[id]?.attributes;
      if (
        saved &&
        (Object.keys(pending) as (keyof PendingEdit)[]).every(
          (key) =>
            Math.abs((saved[key] as number) - pending[key]!) <
            PENDING_TOLERANCE[key]
        )
      ) {
        this._dropPendingEdit(id);
      }
    }
  }

  private _dropPendingEdit(id: string) {
    const { [id]: _done, ...rest } = this._pendingEdits;
    this._pendingEdits = rest;
  }

  // Saves for one zone run in order, so each sees the entry the previous one
  // produced and a failure only drops the values its own request carried
  private _saveQueue: Record<string, Promise<void>> = {};

  private _saveEdit(id: string, pending: PendingEdit): Promise<void> {
    this._pendingEdits = {
      ...this._pendingEdits,
      [id]: { ...this._pendingEdits[id], ...pending },
    };
    const save = (this._saveQueue[id] ?? Promise.resolve())
      .then(() => this._performSave(id, pending))
      .finally(() => {
        // Only the last save in the chain removes the queue entry
        if (this._saveQueue[id] === save) {
          delete this._saveQueue[id];
        }
      });
    this._saveQueue[id] = save;
    return save;
  }

  private async _performSave(id: string, pending: PendingEdit) {
    try {
      if (id === HOME_ZONE_ENTITY_ID) {
        await saveCoreConfig(this.hass, pending);
        return;
      }
      const entry = this._storageItems!.find((item) => item.id === id);
      if (entry) {
        await this._updateEntry(entry, pending);
      }
    } catch (err: any) {
      // The saved values are the truth again for what this request changed;
      // a later edit of other values stays pending for its own save
      this._dropPendingValues(id, pending);
      showAlertDialog(this, {
        title: this.hass.localize("ui.panel.config.zone.can_not_edit"),
        text: err.message,
      });
    }
  }

  private _dropPendingValues(id: string, failed: PendingEdit) {
    const current = this._pendingEdits[id];
    if (!current) {
      return;
    }
    const rest = Object.fromEntries(
      Object.entries(current).filter(
        ([key, value]) => failed[key as keyof PendingEdit] !== value
      )
    ) as PendingEdit;
    if (Object.keys(rest).length) {
      this._pendingEdits = { ...this._pendingEdits, [id]: rest };
    } else {
      this._dropPendingEdit(id);
    }
  }

  private async _fetchData() {
    this._storageItems = (await fetchZones(this.hass!)).sort((ent1, ent2) =>
      stringCompare(ent1.name, ent2.name, this.hass!.locale.language)
    );
    this._getStates();
  }

  private _getStates(oldHass?: HomeAssistant) {
    let changed = false;
    const tempStates = Object.values(this.hass!.states).filter((entity) => {
      if (computeStateDomain(entity) !== "zone") {
        return false;
      }
      if (oldHass?.states[entity.entity_id] !== entity) {
        changed = true;
      }
      if (this._regEntities.includes(entity.entity_id)) {
        return false;
      }
      return true;
    });

    if (changed) {
      this._stateItems = tempStates;
    }
  }

  private _filterStates() {
    if (!this._stateItems) {
      return;
    }
    const tempStates = this._stateItems.filter(
      (entity) => !this._regEntities.includes(entity.entity_id)
    );
    if (tempStates.length !== this._stateItems.length) {
      this._stateItems = tempStates;
    }
  }

  private _locationUpdated(ev: CustomEvent) {
    this._saveEdit(ev.detail.id, {
      latitude: ev.detail.location[0],
      longitude: ev.detail.location[1],
    });
  }

  private _radiusUpdated(ev: CustomEvent) {
    this._saveEdit(ev.detail.id, {
      radius:
        ev.detail.id === HOME_ZONE_ENTITY_ID
          ? Math.round(ev.detail.radius)
          : ev.detail.radius,
    });
  }

  private _createZone() {
    this._openDialog();
  }

  private async _openNewZone() {
    if (await navigate("/config/zone", { replace: true })) {
      this._createZone();
    }
  }

  private _itemClicked(ev: CustomEvent) {
    if (!shouldHandleRequestSelectedEvent(ev)) {
      return;
    }

    if (this.narrow) {
      this._openEditEntry(ev);
      return;
    }
    this._select((ev.currentTarget! as any).value);
    this._zoomZone((ev.currentTarget! as any).value);
  }

  private _stateItemClicked(ev: CustomEvent) {
    if (!shouldHandleRequestSelectedEvent(ev)) {
      return;
    }

    const entryId: string = (ev.currentTarget! as any).value;

    if (this.narrow && entryId === HOME_ZONE_ENTITY_ID) {
      this._editHomeZone(ev);
      return;
    }

    this._select(entryId);
    this._zoomZone(entryId);
  }

  private async _zoomZone(id: string) {
    this._map?.fitMarker(id);
  }

  private async _editZone(id: string) {
    await this.updateComplete;
    // eslint-disable-next-line lit/prefer-query-decorators
    (this.shadowRoot?.querySelector(`[id="${id}"]`) as HTMLElement)?.click();
  }

  private _openEditEntry(ev: Event) {
    const entry: Zone = (ev.currentTarget! as any).entry;
    this._openDialog(entry);
    ev.stopPropagation();
  }

  private async _editHomeZone(ev) {
    // Keep the click from selecting the list item, which zooms the map
    ev.stopPropagation();
    if (ev.currentTarget.noEdit) {
      showAlertDialog(this, {
        title: this.hass.localize("ui.panel.config.zone.can_not_edit"),
        text: this.hass.localize("ui.panel.config.zone.configured_in_yaml"),
      });
      return;
    }
    showHomeZoneDetailDialog(this, {
      updateEntry: (values) => this._updateHomeZoneEntry(values),
    });
  }

  private async _createEntry(values: ZoneMutableParams) {
    const created = await createZone(this.hass!, values);
    this._storageItems = this._storageItems!.concat(created).sort(
      (ent1, ent2) =>
        stringCompare(ent1.name, ent2.name, this.hass!.locale.language)
    );
    if (this.narrow) {
      return;
    }
    await this.updateComplete;
    await this._map?.updateComplete;
    this._map?.fitMarker(created.id);
  }

  private async _updateHomeZoneEntry(values: HomeZoneMutableParams) {
    await saveCoreConfig(this.hass, {
      latitude: values.latitude,
      longitude: values.longitude,
      radius: values.radius,
    });
    this._zoomZone(HOME_ZONE_ENTITY_ID);
  }

  private async _updateEntry(
    entry: Zone,
    values: Partial<ZoneMutableParams>,
    fitMap = false
  ) {
    const updated = await updateZone(this.hass!, entry!.id, values);
    this._storageItems = this._storageItems!.map((ent) =>
      ent === entry ? updated : ent
    );
    if (this.narrow || !fitMap) {
      return;
    }
    await this.updateComplete;
    await this._map?.updateComplete;
    this._map?.fitMarker(entry.id);
  }

  private async _removeEntry(entry: Zone) {
    if (
      !(await showConfirmationDialog(this, {
        title: this.hass!.localize("ui.panel.config.zone.confirm_delete"),
        dismissText: this.hass!.localize("ui.common.cancel"),
        confirmText: this.hass!.localize("ui.common.delete"),
        destructive: true,
      }))
    ) {
      return false;
    }

    try {
      await deleteZone(this.hass!, entry!.id);
      this._storageItems = this._storageItems!.filter((ent) => ent !== entry);
      if (!this.narrow) {
        this._map?.fitMap();
      }
      return true;
    } catch (_err: any) {
      return false;
    }
  }

  private async _openDialog(entry?: Zone) {
    showZoneDetailDialog(this, {
      entry,
      location: entry ? undefined : this._map?.getView()?.center,
      createEntry: (values) => this._createEntry(values),
      updateEntry: entry
        ? (values) => this._updateEntry(entry, values, true)
        : undefined,
      removeEntry: entry ? () => this._removeEntry(entry) : undefined,
    });
  }

  static styles = css`
    hass-loading-screen {
      --app-header-background-color: var(--sidebar-background-color);
      --app-header-text-color: var(--sidebar-text-color);
    }
    ha-list-item {
      --mdc-list-item-meta-size: 48px;
    }
    a {
      color: var(--primary-color);
    }
    ha-card {
      margin: 16px auto;
      overflow: hidden;
    }
    ha-icon,
    ha-icon-button:not([disabled]) {
      color: var(--secondary-text-color);
    }
    .zone-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: var(--ha-font-weight-medium);
    }
    .zone-avatar ha-icon {
      color: inherit;
    }
    ha-icon-button {
      --mdc-theme-text-disabled-on-light: var(--disabled-text-color);
    }
    .empty {
      text-align: center;
      padding: 8px;
    }
    .flex {
      display: flex;
      gap: var(--ha-space-4);
      height: 100%;
      box-sizing: border-box;
      padding: var(--ha-space-4);
    }
    .overflow {
      flex: 0 0 300px;
      overflow: auto;
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
    }
    .detail {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-3);
    }
    .map-wrap {
      flex: 1;
      min-height: 280px;
      border-radius: var(--ha-border-radius-3xl);
      overflow: hidden;
    }
    .map-wrap:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    ha-locations-editor {
      height: 100%;
    }
    .overflow ha-list {
      padding: 0;
    }
    .overflow ha-list-item {
      border-radius: var(--ha-border-radius-xl);
      margin-bottom: var(--ha-space-1);
    }
    .overflow ha-list-item[activated] {
      background: var(
        --primary-container-color,
        var(--secondary-background-color)
      );
    }
    .add-zone {
      align-self: stretch;
    }
    .overflow .empty {
      padding: var(--ha-space-4);
    }
    .form-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--ha-space-4);
    }
    .hint {
      margin: 0;
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
    }
    @media (max-width: 700px) {
      .flex {
        flex-direction: column;
      }
      .overflow {
        flex-basis: auto;
      }
    }
    ha-tooltip {
      display: block;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-zone": HaConfigZone;
  }
}
