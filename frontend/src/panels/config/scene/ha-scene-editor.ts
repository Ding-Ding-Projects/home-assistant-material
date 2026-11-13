import "@home-assistant/webawesome/dist/components/divider/divider";

import {
  mdiClose,
  mdiCog,
  mdiContentDuplicate,
  mdiDelete,
  mdiDotsVertical,
  mdiEyeOutline,
  mdiInformationOutline,
  mdiLightbulbOnOutline,
  mdiPencil,
  mdiPlay,
  mdiPlaylistEdit,
  mdiPlus,
  mdiTag,
  mdiTimerSand,
} from "@mdi/js";
import type { HassEntity, HassEvent } from "home-assistant-js-websocket";
import type { CSSResultGroup, PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import memoizeOne from "memoize-one";
import { consume } from "../../../common/decorators/consume";
import { transform } from "../../../common/decorators/transform";
import { fireEvent } from "../../../common/dom/fire_event";
import { computeDeviceNameDisplay } from "../../../common/entity/compute_device_name";
import { computeDomain } from "../../../common/entity/compute_domain";
import { stateActive } from "../../../common/entity/state_active";
import { goBack, navigate } from "../../../common/navigate";
import { computeRTL } from "../../../common/util/compute_rtl";
import { promiseTimeout } from "../../../common/util/promise-timeout";
import { afterNextRender } from "../../../common/util/render-status";
import "../../../components/device/ha-device-picker";
import "../../../components/entity/ha-entity-picker";
import "../../../components/appearance/ha-appearance-color-picker";
import "../../../components/ha-area-picker";
import "../../../components/ha-button";
import "../../../components/ha-control-slider";
import "../../../components/ha-dropdown";
import type { HaDropdownSelectEvent } from "../../../components/ha-dropdown";
import "../../../components/ha-dropdown-item";
import "../../../components/ha-icon-button";
import "../../../components/ha-icon-picker";
import "../../../components/ha-state-icon";
import "../../../components/ha-svg-icon";
import "../../../components/ha-switch";
import type { HaYamlEditor } from "../../../components/ha-yaml-editor";
import "../../../components/input/ha-input";
import {
  fireRelatedContext,
  fullEntitiesContext,
  type RelatedContextItem,
} from "../../../data/context";
import type { DeviceRegistryEntry } from "../../../data/device/device_registry";
import type { EntityRegistryEntry } from "../../../data/entity/entity_registry";
import { updateEntityRegistryEntry } from "../../../data/entity/entity_registry";
import type { LightEntity } from "../../../data/light";
import {
  lightSupportsBrightness,
  lightSupportsColor,
} from "../../../data/light";
import type {
  SceneConfig,
  SceneEntities,
  SceneEntity,
  SceneMetaData,
} from "../../../data/scene";
import {
  activateScene,
  applyScene,
  deleteScene,
  getSceneConfig,
  getSceneEditorInitData,
  saveScene,
  SCENE_IGNORED_DOMAINS,
  sceneEntityStateObj,
  showSceneEditor,
} from "../../../data/scene";
import {
  showAlertDialog,
  showConfirmationDialog,
} from "../../../dialogs/generic/show-dialog-box";
import { showMoreInfoDialog } from "../../../dialogs/more-info/show-ha-more-info-dialog";
import "../../../layouts/hass-subpage";
import { DirtyStateProviderMixin } from "../../../mixins/dirty-state-provider-mixin";
import { KeyboardShortcutMixin } from "../../../mixins/keyboard-shortcut-mixin";
import { PreventUnsavedMixin } from "../../../mixins/prevent-unsaved-mixin";
import "../../../components/editor/ha-editor-save-bar";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant, Route } from "../../../types";
import { showToast } from "../../../util/toast";
import { showAutomationSaveTimeoutDialog } from "../automation/automation-save-timeout-dialog/show-dialog-automation-save-timeout";
import { showAssignCategoryDialog } from "../category/show-dialog-assign-category";
import {
  showSceneSaveDialog,
  type EntityRegistryUpdate,
} from "./scene-save-dialog/show-dialog-scene-save";

interface DeviceEntities {
  id: string;
  name: string;
  entities: string[];
}

type DeviceEntitiesLookup = Record<string, string[]>;

// One line of the list: a device with its entities, or a single entity
interface SceneRow {
  key: string;
  name: string;
  entities: string[];
  deviceId?: string;
}

// Domains that can be switched on and off from the editor
const PREVIEW_SECONDS = 30;

const TOGGLE_DOMAINS = [
  "light",
  "switch",
  "fan",
  "input_boolean",
  "humidifier",
  "siren",
  "media_player",
  "remote",
];

const SCENE_SWATCHES = [
  { key: "deep_blue", rgb: [33, 53, 142] },
  { key: "warm_white", rgb: [255, 214, 153] },
  { key: "red", rgb: [198, 58, 42] },
  { key: "purple", rgb: [124, 80, 128] },
  { key: "green", rgb: [48, 112, 59] },
] as const;

// A light reports the colour its hardware reached, so a near match counts
const sameColour = (a: readonly number[], b: readonly number[]) =>
  a.length >= 3 &&
  (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2 < 15 ** 2;

const rgbToHex = (rgb: number[]) =>
  `#${rgb
    .slice(0, 3)
    .map((value) =>
      Math.max(0, Math.min(255, Math.round(value)))
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;

const hexToRgb = (hex: string): number[] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

@customElement("ha-scene-editor")
export class HaSceneEditor extends DirtyStateProviderMixin<number>()(
  PreventUnsavedMixin(KeyboardShortcutMixin(LitElement))
) {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @property({ attribute: "is-wide", type: Boolean }) public isWide = false;

  @property({ attribute: false }) public route!: Route;

  @property({ attribute: false }) public sceneId: string | null = null;

  @property({ attribute: false }) public scenes!: SceneEntity[];

  @state() private _errors?: string;

  private _sceneRevision = 0;

  @state() private _yamlErrors?: string;

  @state() private _config?: SceneConfig;

  @state() private _entities: string[] = [];

  private _single_entities: string[] = [];

  @state() private _devices: string[] = [];

  @state()
  @consume({ context: fullEntitiesContext, subscribe: true })
  @transform<EntityRegistryEntry[], EntityRegistryEntry>({
    transformer: function (this: HaSceneEditor, value) {
      return value?.find(
        ({ entity_id }) => entity_id === this._scene?.entity_id
      );
    },
    watch: ["_scene"],
  })
  private _registryEntry?: EntityRegistryEntry;

  @state()
  @consume({ context: fullEntitiesContext, subscribe: true })
  private _entityRegistryEntries: EntityRegistryEntry[] = [];

  @state() private _scene?: SceneEntity;

  @state() private _mode: "review" | "live" | "yaml" = "review";

  @query("ha-yaml-editor") private _yamlEditor?: HaYamlEditor;

  private _storedStates: SceneEntities = {};

  @state() private _preview?: { sceneId: string; remaining: number };

  private _previewTimer?: number;

  private _unsubscribeEvents?: () => void;

  private _deviceEntityLookup: DeviceEntitiesLookup = {};

  private _activateContextId?: string;

  @state() private _saving = false;

  @state() private _selectedKey?: string;

  @state() private _adding?: "device" | "entity";

  private _entityRegistryUpdate?: EntityRegistryUpdate;

  private _relatedContext?: RelatedContextItem;

  private _newSceneId?: string;

  private _entityRegCreated?: (
    value: PromiseLike<EntityRegistryEntry> | EntityRegistryEntry
  ) => void;

  private _getEntitiesDevices = memoizeOne(
    (
      entities: string[],
      devices: string[],
      deviceEntityLookup: DeviceEntitiesLookup,
      deviceRegs: DeviceRegistryEntry[]
    ) => {
      const outputDevices: DeviceEntities[] = [];

      if (devices.length) {
        const deviceLookup: Record<string, DeviceRegistryEntry> = {};
        for (const device of deviceRegs) {
          deviceLookup[device.id] = device;
        }

        devices.forEach((deviceId) => {
          const device = deviceLookup[deviceId];
          const deviceEntities: string[] = deviceEntityLookup[deviceId] || [];
          outputDevices.push({
            name: computeDeviceNameDisplay(device, this.hass.localize),
            id: device.id,
            entities: deviceEntities,
          });
        });
      }

      const outputEntities: string[] = [];

      entities.forEach((entity) => {
        if (!outputDevices.find((device) => device.entities.includes(entity))) {
          outputEntities.push(entity);
        }
      });

      return { devices: outputDevices, entities: outputEntities };
    }
  );

  public connectedCallback() {
    super.connectedCallback();
    if (!this.sceneId) {
      this._mode = "live";
      this._subscribeEvents();
    }
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    // Hidden-tab panel suspend detaches an ancestor and later reattaches
    // this same instance. Direct removal (route change) has no parentNode,
    // so we still tear down even if the tab is hidden — e.g. saving a new
    // scene remounts the itemId editor.
    // Leave the live subscription in place on suspend so the websocket
    // library can restore it after reconnect; a fresh subscribe here races
    // the closed socket.
    if (document.hidden && this.parentNode) {
      return;
    }
    // Leaving during a preview puts the devices back right away.
    if (this._preview && this.hass) {
      this._restorePreview();
    }
    if (this._mode === "live" && this.hass) {
      this._exitLiveMode();
    } else if (this._unsubscribeEvents) {
      this._unsubscribeEvents();
      this._unsubscribeEvents = undefined;
    }
  }

  protected render() {
    if (!this.hass) {
      return nothing;
    }
    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        .route=${this.route}
        .backCallback=${this._backTapped}
        .header=${this.hass.localize(
          this.sceneId
            ? "ui.panel.config.scene.picker.edit_scene"
            : "ui.panel.config.scene.picker.add_scene"
        )}
        .breadcrumb=${`${this.hass.localize("panel.config")}, ${this.hass.localize(
          "ui.panel.config.scene.caption"
        )}`}
      >
        <ha-dropdown
          slot="toolbar-icon"
          @wa-select=${this._handleMenuAction}
          activatable
        >
          <ha-icon-button
            slot="trigger"
            .label=${this.hass.localize("ui.common.menu")}
            .path=${mdiDotsVertical}
          ></ha-icon-button>

          <ha-dropdown-item
            value="apply"
            .disabled=${!this.sceneId || this._mode === "live"}
          >
            ${this.hass.localize("ui.panel.config.scene.picker.apply")}
            <ha-svg-icon slot="icon" .path=${mdiPlay}></ha-svg-icon>
          </ha-dropdown-item>

          <ha-dropdown-item value="show-info" .disabled=${!this.sceneId}>
            ${this.hass.localize("ui.panel.config.scene.picker.show_info")}
            <ha-svg-icon
              slot="icon"
              .path=${mdiInformationOutline}
            ></ha-svg-icon>
          </ha-dropdown-item>

          <ha-dropdown-item value="show-settings" .disabled=${!this.sceneId}>
            ${this.hass.localize(
              "ui.panel.config.automation.picker.show_settings"
            )}
            <ha-svg-icon slot="icon" .path=${mdiCog}></ha-svg-icon>
          </ha-dropdown-item>

          <ha-dropdown-item value="edit-category" .disabled=${!this.sceneId}>
            ${this.hass.localize(
              `ui.panel.config.scene.picker.${this._registryEntry?.categories?.scene ? "edit_category" : "assign_category"}`
            )}
            <ha-svg-icon slot="icon" .path=${mdiTag}></ha-svg-icon>
          </ha-dropdown-item>

          <ha-dropdown-item value="rename" .disabled=${!this.sceneId}>
            ${this.hass.localize("ui.panel.config.scene.editor.rename")}
            <ha-svg-icon slot="icon" .path=${mdiPencil}></ha-svg-icon>
          </ha-dropdown-item>

          <ha-dropdown-item value="toggle-yaml">
            ${this.hass.localize(
              `ui.panel.config.automation.editor.edit_${this._mode !== "yaml" ? "yaml" : "ui"}`
            )}
            <ha-svg-icon slot="icon" .path=${mdiPlaylistEdit}></ha-svg-icon>
          </ha-dropdown-item>

          <wa-divider></wa-divider>

          <ha-dropdown-item value="duplicate" .disabled=${!this.sceneId}>
            ${this.hass.localize(
              "ui.panel.config.scene.picker.duplicate_scene"
            )}
            <ha-svg-icon slot="icon" .path=${mdiContentDuplicate}></ha-svg-icon>
          </ha-dropdown-item>

          <ha-dropdown-item
            value="delete"
            .disabled=${!this.sceneId}
            class=${classMap({ warning: Boolean(this.sceneId) })}
          >
            ${this.hass.localize("ui.panel.config.scene.picker.delete_scene")}
            <ha-svg-icon
              class=${classMap({ warning: Boolean(this.sceneId) })}
              slot="icon"
              .path=${mdiDelete}
            >
            </ha-svg-icon>
          </ha-dropdown-item>
        </ha-dropdown>
        ${this._errors ? html` <div class="errors">${this._errors}</div> ` : ""}
        ${this._mode === "yaml" ? this._renderYamlMode() : this._renderUiMode()}
        ${this._renderActions()}
      </hass-subpage>
    `;
  }

  private _renderYamlMode() {
    return html` <ha-yaml-editor
      .defaultValue=${this._config}
      @value-changed=${this._yamlChanged}
      @editor-save=${this._saveScene}
      disable-fullscreen
    ></ha-yaml-editor>`;
  }

  private _renderUiMode() {
    const { devices, entities } = this._getEntitiesDevices(
      this._entities,
      this._devices,
      this._deviceEntityLookup,
      Object.values(this.hass.devices)
    );
    const rows: SceneRow[] = [
      ...devices.map((device) => ({
        key: `device:${device.id}`,
        name: device.name,
        entities: device.entities,
        deviceId: device.id,
      })),
      ...entities.map((entityId) => ({
        key: `entity:${entityId}`,
        name: this._entityName(entityId),
        entities: [entityId],
      })),
    ];
    const selected =
      rows.find((row) => row.key === this._selectedKey) ?? rows[0];
    const live = this._mode === "live";

    return html`<div
      id="root"
      class=${classMap({
        rtl: computeRTL(
          this.hass.language,
          this.hass.translationMetadata.translations
        ),
      })}
    >
      ${
        this._config
          ? html`<div class="editor">
              <div class="left">
                <ha-input
                  .label=${this.hass.localize(
                    "ui.panel.config.scene.editor.name"
                  )}
                  .value=${this._config.name ?? ""}
                  required
                  @input=${this._nameChanged}
                ></ha-input>
                <div class="pair">
                  <ha-icon-picker
                    .label=${this.hass.localize(
                      "ui.panel.config.scene.editor.icon"
                    )}
                    .value=${this._config.icon}
                    @value-changed=${this._iconChanged}
                  ></ha-icon-picker>
                  <ha-area-picker
                    .value=${
                      this._entityRegistryUpdate?.area ??
                      this._registryEntry?.area_id ??
                      ""
                    }
                    @value-changed=${this._areaChanged}
                  ></ha-area-picker>
                </div>
                <div class="banner" role="status">
                  <ha-svg-icon .path=${mdiLightbulbOnOutline}></ha-svg-icon>
                  <span>
                    ${this.hass.localize(
                      live
                        ? "ui.panel.config.scene.editor.live_banner"
                        : "ui.panel.config.scene.editor.paper_mode_detail"
                    )}
                  </span>
                  <ha-button
                    appearance="plain"
                    size="s"
                    @click=${this._toggleLiveMode}
                  >
                    ${this.hass.localize(
                      `ui.panel.config.scene.editor.${live ? "switch_to_review_mode" : "live_edit"}`
                    )}
                  </ha-button>
                </div>
                <section class="card devices">
                  <h2>
                    ${this.hass.localize(
                      "ui.panel.config.scene.editor.devices_in_scene"
                    )}
                  </h2>
                  ${
                    rows.length
                      ? html`<ul class="rows">
                          ${rows.map((row) =>
                            this._renderRow(row, row === selected)
                          )}
                        </ul>`
                      : html`<p class="hint">
                          ${this.hass.localize(
                            "ui.panel.config.scene.editor.devices.introduction"
                          )}
                        </p>`
                  }
                  <div class="add-row">
                    <ha-button
                      appearance="filled"
                      variant="neutral"
                      size="s"
                      @click=${this._addDevice}
                    >
                      <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
                      ${this.hass.localize(
                        "ui.panel.config.scene.editor.devices.add"
                      )}
                    </ha-button>
                    <ha-button
                      appearance="plain"
                      size="s"
                      @click=${this._addEntity}
                    >
                      <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
                      ${this.hass.localize(
                        "ui.panel.config.scene.editor.entities.add"
                      )}
                    </ha-button>
                  </div>
                  ${
                    this._adding === "device"
                      ? html`<ha-device-picker
                          @value-changed=${this._devicePicked}
                          .label=${this.hass.localize(
                            "ui.panel.config.scene.editor.devices.add"
                          )}
                        ></ha-device-picker>`
                      : this._adding === "entity"
                        ? html`<ha-entity-picker
                            @value-changed=${this._entityPicked}
                            .excludeDomains=${SCENE_IGNORED_DOMAINS}
                            .label=${this.hass.localize(
                              "ui.panel.config.scene.editor.entities.add"
                            )}
                          ></ha-entity-picker>`
                        : nothing
                  }
                </section>
              </div>
              <div class="right">
                ${selected ? this._renderSelected(selected, live) : nothing}
              </div>
            </div>`
          : nothing
      }
    </div>`;
  }

  private _renderRow(row: SceneRow, selected: boolean) {
    const first = this._rowStateObj(row.entities[0]);
    const summary =
      row.entities.length > 1
        ? this.hass.localize("ui.panel.config.scene.picker.entity_count", {
            count: row.entities.length,
          })
        : first
          ? this._describe(first)
          : "";
    return html`<li class=${classMap({ row: true, selected })}>
      <button
        type="button"
        class="row-main"
        aria-pressed=${selected ? "true" : "false"}
        .rowKey=${row.key}
        @click=${this._rowSelected}
      >
        <span class="tile">
          ${
            first
              ? html`<ha-state-icon .stateObj=${first}></ha-state-icon>`
              : nothing
          }
        </span>
        <span class="row-text">
          <span class="row-name">${row.name}</span>
          <span class="row-state">${summary}</span>
        </span>
      </button>
      <ha-icon-button
        .path=${mdiInformationOutline}
        .label=${this.hass.localize("ui.panel.config.scene.picker.show_info")}
        .entityId=${row.entities[0]}
        @click=${this._infoClicked}
      ></ha-icon-button>
      <ha-icon-button
        .path=${mdiClose}
        .label=${this.hass.localize(
          row.deviceId
            ? "ui.panel.config.scene.editor.devices.delete"
            : "ui.panel.config.scene.editor.entities.delete"
        )}
        .entityId=${row.entities[0]}
        .deviceId=${row.deviceId}
        @click=${this._removeClicked}
      ></ha-icon-button>
    </li>`;
  }

  private _renderSelected(row: SceneRow, live: boolean) {
    return html`<section class="card selected-card">
      <h2>${row.name}</h2>
      ${row.entities.map((entityId) =>
        this._renderEntityControls(entityId, live, row.entities.length > 1)
      )}
    </section>`;
  }

  private _renderEntityControls(
    entityId: string,
    live: boolean,
    showName: boolean
  ) {
    const stateObj = this._rowStateObj(entityId);
    if (!stateObj) {
      return nothing;
    }
    const domain = computeDomain(entityId);
    const isOn = stateActive(stateObj);
    const unavailable = stateObj.state === "unavailable";
    // Live edit changes the device itself; otherwise the edit is made on the
    // scene only and nothing is sent to the device.
    const editable = !unavailable;
    const isLight = domain === "light";
    const light = stateObj as LightEntity;
    const brightness =
      isLight && isOn && lightSupportsBrightness(light)
        ? typeof light.attributes.brightness === "number"
          ? Math.max(1, Math.round((light.attributes.brightness / 255) * 100))
          : 100
        : undefined;
    const rgb =
      isLight && isOn && lightSupportsColor(light)
        ? (light.attributes.rgb_color as number[] | undefined)
        : undefined;

    return html`<div class="entity-block">
      ${showName ? html`<h3>${this._entityName(entityId)}</h3>` : nothing}
      ${
        TOGGLE_DOMAINS.includes(domain)
          ? html`<div class="toggle-row">
              <ha-switch
                .checked=${isOn}
                .disabled=${!editable}
                .entityId=${entityId}
                @change=${this._switchChanged}
              >
                ${this.hass.localize("ui.panel.config.scene.editor.state_on")}
              </ha-switch>
            </div>`
          : nothing
      }
      ${
        brightness !== undefined
          ? html`<ha-control-slider
              touch-action="none"
              .value=${brightness}
              min="1"
              max="100"
              unit="%"
              .showHandle=${true}
              .disabled=${!editable}
              .label=${this.hass.localize(
                "ui.panel.config.scene.editor.brightness"
              )}
              .entityId=${entityId}
              @value-changed=${this._brightnessChanged}
            ></ha-control-slider>`
          : nothing
      }
      ${
        isLight && isOn && lightSupportsColor(light)
          ? html`<div class="swatches">
              ${SCENE_SWATCHES.map(
                (swatch) =>
                  html`<button
                    type="button"
                    class=${classMap({
                      swatch: true,
                      active: rgb !== undefined && sameColour(rgb, swatch.rgb),
                    })}
                    style=${styleMap({
                      backgroundColor: `rgb(${swatch.rgb.join(",")})`,
                    })}
                    .disabled=${!editable}
                    aria-label=${this.hass.localize(
                      `ui.panel.config.scene.editor.colours.${swatch.key}`
                    )}
                    .entityId=${entityId}
                    .rgb=${swatch.rgb}
                    @click=${this._swatchClicked}
                  ></button>`
              )}
              <ha-appearance-color-picker
                class="any-colour ${editable ? "" : "disabled"}"
                .label=${this.hass.localize(
                  "ui.panel.config.scene.editor.colours.any"
                )}
                .value=${rgb ? rgbToHex(rgb) : "#ffffff"}
                .entityId=${entityId}
                @appearance-color-changed=${this._colourChanged}
                @appearance-color-committed=${this._colourPicked}
              ></ha-appearance-color-picker>
            </div>`
          : nothing
      }
      ${
        !TOGGLE_DOMAINS.includes(domain)
          ? html`<ha-button
              appearance="plain"
              size="s"
              .entityId=${entityId}
              @click=${this._infoClicked}
            >
              ${this.hass.localize("ui.panel.config.scene.editor.all_controls")}
            </ha-button>`
          : nothing
      }
      <p class="saved">
        <ha-svg-icon .path=${mdiInformationOutline}></ha-svg-icon>
        ${this.hass.localize("ui.panel.config.scene.editor.saved_in_scene", {
          state: this._describe(stateObj),
        })}
      </p>
      ${
        !live
          ? html`<p class="hint">
              ${this.hass.localize(
                "ui.panel.config.scene.editor.paper_controls_hint"
              )}
            </p>`
          : nothing
      }
    </div>`;
  }

  private _renderActions() {
    const live = this._mode === "live";
    // Try it stays outside the save bar: the bar hides while nothing is
    // unsaved, and a saved scene must still be possible to try.
    return html`${this._renderPreviewBanner()}
      <div class="try-row">
        <ha-button
          appearance="outlined"
          variant="neutral"
          .disabled=${live || !this._entities.length || !!this._preview}
          @click=${this._previewClicked}
        >
          <ha-svg-icon slot="start" .path=${mdiEyeOutline}></ha-svg-icon>
          ${this.hass.localize("ui.panel.config.scene.editor.preview")}
        </ha-button>
        <ha-button
          appearance="outlined"
          variant="neutral"
          .disabled=${live || !this._entities.length}
          @click=${this._tryIt}
        >
          <ha-svg-icon slot="start" .path=${mdiPlay}></ha-svg-icon>
          ${this.hass.localize("ui.panel.config.scene.editor.try_it")}
        </ha-button>
      </div>
      <ha-editor-save-bar
        .hass=${this.hass}
        .dirty=${this.isDirtyState}
        .saving=${this._saving}
        .errorMessage=${this._errors}
        .saveLabel=${this.hass.localize("ui.panel.config.scene.editor.save")}
        hide-when-clean
        show-discard
        show-shortcut
        @save-bar-save=${this._saveScene}
        @save-bar-discard=${this._discard}
      ></ha-editor-save-bar>`;
  }

  private _entityName(entityId: string): string {
    const stateObj = this.hass.states[entityId];
    return stateObj ? this.hass.formatEntityName(stateObj) : entityId;
  }

  // The live state in live mode, the state the scene holds otherwise. Without
  // a usable target nothing is shown, so a live state is never mistaken for
  // what the scene will set.
  private _rowStateObj(entityId?: string): HassEntity | undefined {
    if (!entityId) {
      return undefined;
    }
    const live = this.hass.states[entityId];
    if (!live) {
      return undefined;
    }
    return this._badgeStateObj(entityId, live);
  }

  private _describe(stateObj: HassEntity): string {
    const parts = [this.hass.formatEntityState(stateObj)];
    if (
      computeDomain(stateObj.entity_id) === "light" &&
      stateObj.state === "on"
    ) {
      const brightness = stateObj.attributes.brightness;
      if (typeof brightness === "number") {
        parts.push(`${Math.round((brightness / 255) * 100)}%`);
      }
      const rgb = stateObj.attributes.rgb_color as number[] | undefined;
      const swatch = rgb
        ? SCENE_SWATCHES.find((item) => sameColour(rgb, item.rgb))
        : undefined;
      if (swatch) {
        parts.push(
          this.hass.localize(
            `ui.panel.config.scene.editor.colours.${swatch.key}`
          )
        );
      }
    }
    return parts.join(", ");
  }

  private _rowSelected(ev: Event) {
    this._selectedKey = (
      ev.currentTarget as HTMLElement & { rowKey: string }
    ).rowKey;
  }

  private _infoClicked(ev: Event) {
    this._showEntityInfo(
      (ev.currentTarget as HTMLElement & { entityId?: string }).entityId
    );
  }

  private _removeClicked(ev: Event) {
    const { entityId, deviceId } = ev.currentTarget as HTMLElement & {
      entityId: string;
      deviceId?: string;
    };
    if (deviceId) {
      this._deleteDevice(deviceId);
    } else {
      this._deleteEntity(entityId);
    }
  }

  private _switchChanged(ev: Event) {
    const target = ev.currentTarget as HTMLInputElement & { entityId: string };
    this._toggleEntity(target.entityId, target.checked);
  }

  private _brightnessChanged(ev: CustomEvent) {
    this._setBrightness(
      (ev.currentTarget as HTMLElement & { entityId: string }).entityId,
      ev.detail.value
    );
  }

  private _swatchClicked(ev: Event) {
    const { entityId, rgb } = ev.currentTarget as HTMLElement & {
      entityId: string;
      rgb: readonly number[];
    };
    this._setColour(entityId, rgb);
  }

  /** The colour last chosen in each "any colour" picker, applied on commit. */
  private _pendingColours: Record<string, string> = {};

  private _colourChanged(ev: Event) {
    const target = ev.currentTarget as HTMLElement & { entityId: string };
    this._pendingColours[target.entityId] = (
      ev as CustomEvent<{ value: string }>
    ).detail.value;
  }

  private _colourPicked(ev: Event) {
    const target = ev.currentTarget as HTMLElement & { entityId: string };
    const hex = this._pendingColours[target.entityId];
    delete this._pendingColours[target.entityId];
    if (hex) {
      this._setColour(target.entityId, hexToRgb(hex));
    }
  }

  private _showEntityInfo(entityId?: string) {
    if (entityId) {
      fireEvent(this, "hass-more-info", { entityId });
    }
  }

  private _nameChanged(ev: Event) {
    ev.stopPropagation();
    this._config = {
      ...this._config!,
      name: (ev.target as HTMLInputElement).value,
    };
    this._updateDirtyState(++this._sceneRevision);
  }

  private _iconChanged(ev: CustomEvent) {
    ev.stopPropagation();
    this._config = {
      ...this._config!,
      icon: ev.detail.value || undefined,
    };
    this._updateDirtyState(++this._sceneRevision);
  }

  private _areaChanged(ev: CustomEvent) {
    ev.stopPropagation();
    this._entityRegistryUpdate = {
      area: ev.detail.value || "",
      labels:
        this._entityRegistryUpdate?.labels ?? this._registryEntry?.labels ?? [],
      category:
        this._entityRegistryUpdate?.category ??
        this._registryEntry?.categories?.scene ??
        "",
    };
    this._updateDirtyState(++this._sceneRevision);
  }

  // Adding needs the room to follow the edit, so it starts live edit first
  private async _startAdding(kind: "device" | "entity") {
    if (this._mode !== "live") {
      await this._enterLiveMode();
    }
    if (this._mode === "live") {
      this._adding = kind;
    }
  }

  private _addDevice = () => this._startAdding("device");

  private _addEntity = () => this._startAdding("entity");

  /**
   * Edits the state the scene stores for one entity without touching the
   * device. Colour attributes that would compete with a new colour are
   * dropped, because a light applies only one of them.
   */
  private _editOnPaper(
    entityId: string,
    patch: Record<string, unknown>,
    remove: string[] = []
  ) {
    if (!this._config) {
      return;
    }
    const current: unknown = this._config.entities[entityId];
    const base: Record<string, unknown> =
      typeof current === "object" && current !== null && !Array.isArray(current)
        ? { ...(current as Record<string, unknown>) }
        : { state: sceneEntityStateObj(entityId, current)?.state ?? "on" };
    const next = { ...base, ...patch };
    remove.forEach((key) => delete next[key]);
    this._config = {
      ...this._config,
      entities: {
        ...this._config.entities,
        [entityId]: next as { state: string },
      },
    };
    this._updateDirtyState(++this._sceneRevision);
  }

  private _toggleEntity(entityId: string, on: boolean) {
    if (this._mode !== "live") {
      this._editOnPaper(entityId, { state: on ? "on" : "off" });
      return;
    }
    this.hass.callService(
      computeDomain(entityId),
      on ? "turn_on" : "turn_off",
      {
        entity_id: entityId,
      }
    );
  }

  private _setBrightness(entityId: string, value?: number) {
    if (value === undefined) {
      return;
    }
    if (this._mode !== "live") {
      this._editOnPaper(entityId, {
        state: "on",
        brightness: Math.max(1, Math.round((value / 100) * 255)),
      });
      return;
    }
    this.hass.callService("light", "turn_on", {
      entity_id: entityId,
      brightness_pct: value,
    });
  }

  private _setColour(entityId: string, rgb: readonly number[]) {
    if (this._mode !== "live") {
      this._editOnPaper(entityId, { state: "on", rgb_color: [...rgb] }, [
        "hs_color",
        "xy_color",
        "rgbw_color",
        "rgbww_color",
        "color_temp",
        "color_temp_kelvin",
        "color_mode",
      ]);
      return;
    }
    this.hass.callService("light", "turn_on", {
      entity_id: entityId,
      rgb_color: rgb,
    });
  }

  private _tryIt = async () => {
    if (!this._config) {
      return;
    }
    await applyScene(this.hass, this._config.entities);
    showToast(this, {
      message: this.hass.localize("ui.panel.config.scene.activated", {
        name: this._config.name,
      }),
    });
  };

  /**
   * Preview: remembers how the devices are now with `scene.create` and
   * `snapshot_entities`, applies the edited states, counts down, then turns
   * the remembered scene back on and deletes it. Devices are only touched
   * after the person confirms.
   */
  private _previewClicked = async () => {
    if (!this._config || this._preview) {
      return;
    }
    const confirmed = await showConfirmationDialog(this, {
      title: this.hass.localize("ui.panel.config.scene.editor.preview_title"),
      text: this.hass.localize("ui.panel.config.scene.editor.preview_text", {
        seconds: PREVIEW_SECONDS,
      }),
      confirmText: this.hass.localize(
        "ui.panel.config.scene.editor.preview_confirm"
      ),
      dismissText: this.hass.localize("ui.common.cancel"),
    });
    if (!confirmed || !this._config) {
      return;
    }
    const entityIds = Object.keys(this._config.entities).filter((id) => {
      const stateObj = this.hass.states[id];
      return stateObj && stateObj.state !== "unavailable";
    });
    const sceneId = `ha_scene_preview_${Date.now()}`;
    try {
      await this.hass.callService("scene", "create", {
        scene_id: sceneId,
        snapshot_entities: entityIds,
      });
    } catch (err: any) {
      showToast(this, {
        message: this.hass.localize(
          "ui.panel.config.scene.editor.preview_failed",
          { error: err?.message ?? String(err) }
        ),
      });
      return;
    }
    this._preview = { sceneId, remaining: PREVIEW_SECONDS };
    try {
      await applyScene(this.hass, this._config.entities);
    } catch (err: any) {
      showToast(this, {
        message: this.hass.localize(
          "ui.panel.config.scene.editor.preview_failed",
          { error: err?.message ?? String(err) }
        ),
      });
      await this._restorePreview();
      return;
    }
    this._previewTimer = window.setInterval(() => {
      if (!this._preview) {
        return;
      }
      const remaining = this._preview.remaining - 1;
      if (remaining <= 0) {
        this._restorePreview();
      } else {
        this._preview = { ...this._preview, remaining };
      }
    }, 1000);
  };

  private _restorePreview = async (): Promise<void> => {
    const preview = this._preview;
    if (!preview) {
      return;
    }
    window.clearInterval(this._previewTimer);
    this._previewTimer = undefined;
    this._preview = undefined;
    const entityId = `scene.${preview.sceneId}`;
    try {
      await this.hass.callService("scene", "turn_on", { entity_id: entityId });
      showToast(this, {
        message: this.hass.localize(
          "ui.panel.config.scene.editor.preview_restored"
        ),
      });
    } catch (err: any) {
      showToast(this, {
        message: this.hass.localize(
          "ui.panel.config.scene.editor.preview_restore_failed",
          { error: err?.message ?? String(err) }
        ),
      });
    }
    try {
      await this.hass.callService("scene", "delete", { entity_id: entityId });
    } catch (_err) {
      // The remembered scene only exists until Home Assistant restarts.
    }
  };

  private _renderPreviewBanner() {
    if (!this._preview) {
      return nothing;
    }
    return html`<div class="banner preview-banner" role="status">
      <ha-svg-icon .path=${mdiTimerSand}></ha-svg-icon>
      <span>
        ${this.hass.localize("ui.panel.config.scene.editor.preview_running", {
          seconds: this._preview.remaining,
        })}
      </span>
      <ha-button appearance="plain" size="s" @click=${this._restorePreview}>
        ${this.hass.localize("ui.panel.config.scene.editor.preview_restore_now")}
      </ha-button>
    </div>`;
  }

  private _discard = () => this._backTapped();

  protected willUpdate(changedProps: PropertyValues): void {
    super.willUpdate(changedProps);

    if (
      this._entityRegCreated &&
      this._newSceneId &&
      (changedProps.has("scenes") || changedProps.has("_entityRegistryEntries"))
    ) {
      const scene = this.scenes.find(
        (entity: SceneEntity) => entity.attributes.id === this._newSceneId
      );
      if (scene) {
        // Scene appeared in state machine, now look for registry entry
        const registryEntry = this._entityRegistryEntries.find(
          (reg) => reg.entity_id === scene.entity_id
        );
        if (registryEntry) {
          // We have both the scene and its registry entry, resolve
          this._entityRegCreated(registryEntry);
          this._entityRegCreated = undefined;
        }
      }
    }
  }

  protected updated(changedProps: PropertyValues): void {
    super.updated(changedProps);

    const oldscene = changedProps.get("sceneId");

    if (
      changedProps.has("sceneId") &&
      this.sceneId &&
      this.hass &&
      // Only refresh config if we picked a new scene. If same ID, don't fetch it.
      (!oldscene || oldscene !== this.sceneId)
    ) {
      this._loadConfig();
    }

    if (changedProps.has("sceneId") && !this.sceneId && this.hass) {
      this._sceneRevision = 0;
      const initData = getSceneEditorInitData();
      this._config = {
        name: this.hass.localize("ui.panel.config.scene.editor.default_name"),
        entities: {},
        ...initData?.config,
      };
      this._initEntities(this._config);
      if (initData?.areaId !== undefined) {
        this._entityRegistryUpdate = {
          area: initData.areaId || "",
          labels: [],
          category: "",
        };
      }
      this._initDirtyTracking({ type: "shallow" }, 0);
      if (
        initData !== undefined &&
        (initData.areaId !== undefined || initData.config !== undefined)
      ) {
        this._updateDirtyState(++this._sceneRevision);
      }
    }

    if (changedProps.has("_entityRegistryEntries")) {
      this._deviceEntityLookup = {};
      for (const entity of this._entityRegistryEntries) {
        if (
          !entity.device_id ||
          entity.entity_category ||
          entity.hidden_by ||
          SCENE_IGNORED_DOMAINS.includes(computeDomain(entity.entity_id))
        ) {
          continue;
        }
        if (!(entity.device_id in this._deviceEntityLookup)) {
          this._deviceEntityLookup[entity.device_id] = [];
        }
        this._deviceEntityLookup[entity.device_id].push(entity.entity_id);
        if (
          this._entities.includes(entity.entity_id) &&
          !this._single_entities.includes(entity.entity_id) &&
          !this._devices.includes(entity.device_id)
        ) {
          this._devices = [...this._devices, entity.device_id];
        }
      }
    }

    if (changedProps.has("hass")) {
      if (this._scene) {
        if (this.hass.states[this._scene.entity_id] !== this._scene) {
          this._scene = this.hass.states[this._scene.entity_id];
        }
      } else if (this.sceneId) {
        this._scene = Object.values(this.hass.states).find(
          (stateObj) =>
            stateObj.entity_id.startsWith("scene") &&
            stateObj.attributes?.id === this.sceneId
        );
      }
    }

    if (
      changedProps.has("sceneId") ||
      changedProps.has("_scene") ||
      changedProps.has("_registryEntry")
    ) {
      this._setRelatedContext();
    }
  }

  private _setRelatedContext(): void {
    const context: RelatedContextItem | undefined = this.sceneId
      ? this._registryEntry?.area_id
        ? {
            itemType: "area",
            itemId: this._registryEntry.area_id,
          }
        : this._scene
          ? {
              itemType: "scene",
              itemId: this._scene.entity_id,
            }
          : undefined
      : undefined;

    if (
      context?.itemType === this._relatedContext?.itemType &&
      context?.itemId === this._relatedContext?.itemId
    ) {
      return;
    }

    this._relatedContext = context;
    fireRelatedContext(this, context);
  }

  private _handleMenuAction(ev: HaDropdownSelectEvent) {
    const action = ev.detail?.item?.value;
    if (!action) {
      return;
    }

    switch (action) {
      case "apply":
        activateScene(this.hass.callService, this._scene!.entity_id);
        break;
      case "show-info":
        fireEvent(this, "hass-more-info", { entityId: this._scene!.entity_id });
        break;
      case "show-settings":
        showMoreInfoDialog(this, {
          entityId: this._scene!.entity_id,
          view: "settings",
        });
        break;
      case "edit-category":
        this._editCategory();
        break;
      case "rename":
        this._promptSceneRename();
        break;
      case "toggle-yaml":
        this._toggleYamlMode();
        break;
      case "duplicate":
        this._duplicate();
        break;
      case "delete":
        this._deleteTapped();
        break;
    }
  }

  private async _toggleYamlMode() {
    if (this._mode === "yaml") {
      this._initEntities(this._config!);
      this._exitYamlMode();
    } else {
      this._enterYamlMode();
      await this.updateComplete;
      this._yamlEditor?.focus();
    }
  }

  private async _exitYamlMode() {
    if (this._yamlErrors) {
      const result = await showConfirmationDialog(this, {
        text: html`${this.hass.localize(
            "ui.panel.config.automation.editor.switch_ui_yaml_error"
          )}<br /><br />${this._yamlErrors}`,
        confirmText: this.hass!.localize("ui.common.continue"),
        destructive: true,
        dismissText: this.hass!.localize("ui.common.cancel"),
      });
      if (!result) {
        return;
      }
    }
    this._yamlErrors = undefined;
    this._mode = "review";
  }

  private _enterYamlMode() {
    if (this._mode === "live") {
      this._generateConfigFromLive();
      if (this._unsubscribeEvents) {
        this._unsubscribeEvents();
        this._unsubscribeEvents = undefined;
      }
      applyScene(this.hass, this._storedStates);
    }
    this._mode = "yaml";
  }

  private async _toggleLiveMode() {
    if (this._mode === "live") {
      this._exitLiveMode();
    } else {
      await this._enterLiveMode();
    }
  }

  private async _enterLiveMode() {
    if (this.isDirtyState) {
      const result = await showConfirmationDialog(this, {
        text: this.hass.localize(
          "ui.panel.config.scene.editor.enter_live_mode_unsaved"
        ),
        confirmText: this.hass!.localize(
          "ui.panel.config.scene.editor.save_before_live"
        ),
        dismissText: this.hass!.localize("ui.common.cancel"),
      });
      if (!result) {
        return;
      }
      await this._saveScene();
    }

    this._entities.forEach((entity) => this._storeState(entity));
    this._mode = "live";
    await this._setScene();
    this._subscribeEvents();
  }

  private _exitLiveMode() {
    this._generateConfigFromLive();
    if (this._unsubscribeEvents) {
      this._unsubscribeEvents();
      this._unsubscribeEvents = undefined;
    }
    applyScene(this.hass, this._storedStates);
    this._mode = "review";
  }

  private _yamlChanged(ev: CustomEvent) {
    ev.stopPropagation();
    if (!ev.detail.isValid) {
      this._yamlErrors = ev.detail.errorMsg;
      this._updateDirtyState(++this._sceneRevision);
      return;
    }
    this._yamlErrors = undefined;
    this._config = ev.detail.value;
    this._updateDirtyState(++this._sceneRevision);
    this._errors = undefined;
  }

  private async _setScene() {
    if (!this._scene) {
      return;
    }
    const { context } = await activateScene(
      this.hass.callService,
      this._scene.entity_id
    );
    this._activateContextId = context.id;
  }

  private async _subscribeEvents() {
    if (this._unsubscribeEvents) {
      return;
    }
    const unsubscribe = await this.hass!.connection.subscribeEvents<HassEvent>(
      (event) => this._stateChanged(event),
      "state_changed"
    );
    if (!this.isConnected || this._mode !== "live" || this._unsubscribeEvents) {
      unsubscribe();
      return;
    }
    this._unsubscribeEvents = unsubscribe;
  }

  private async _loadConfig() {
    let config: SceneConfig;
    try {
      config = await getSceneConfig(this.hass, this.sceneId!);
    } catch (err: any) {
      if (!this.isConnected) {
        return;
      }
      await showAlertDialog(this, {
        text:
          err.status_code === 404
            ? this.hass.localize(
                "ui.panel.config.scene.editor.load_error_not_editable"
              )
            : this.hass.localize(
                "ui.panel.config.scene.editor.load_error_unknown",
                { err_no: err.status_code }
              ),
      });
      goBack("/config/scene/dashboard");
      return;
    }

    if (!this.isConnected) {
      return;
    }

    if (!config.entities) {
      config.entities = {};
    }

    this._initEntities(config);

    this._scene = this.scenes.find(
      (entity: SceneEntity) => entity.attributes.id === this.sceneId
    );

    this._sceneRevision = 0;
    this._initDirtyTracking({ type: "shallow" }, 0);
    this._config = config;
  }

  private _initEntities(config: SceneConfig) {
    this._entities = Object.keys(config.entities);
    this._single_entities = [];

    const filteredEntityReg = this._entityRegistryEntries.filter((entityReg) =>
      this._entities.includes(entityReg.entity_id)
    );
    const newDevices: string[] = [];

    if (config.metadata) {
      Object.keys(config.entities).forEach((entity) => {
        if (
          !this._single_entities.includes(entity) &&
          config.metadata![entity]?.entity_only
        ) {
          this._single_entities.push(entity);
        }
      });
    }

    for (const entityReg of filteredEntityReg) {
      if (!entityReg.device_id) {
        continue;
      }
      const entityMetaData = config.metadata?.[entityReg.entity_id];
      if (
        !newDevices.includes(entityReg.device_id) &&
        !entityMetaData?.entity_only
      ) {
        newDevices.push(entityReg.device_id);
      }
    }

    this._devices = newDevices;
  }

  private _entityPicked(ev: CustomEvent) {
    const entityId = ev.detail.value;
    (ev.target as any).value = "";
    this._adding = undefined;
    if (!entityId || this._entities.includes(entityId)) {
      return;
    }
    this._entities = [...this._entities, entityId];
    this._single_entities.push(entityId);
    this._storeState(entityId);
    this._updateDirtyState(++this._sceneRevision);
  }

  private _deleteEntity(deleteEntityId: string) {
    this._entities = this._entities.filter(
      (entityId) => entityId !== deleteEntityId
    );
    this._single_entities = this._single_entities.filter(
      (entityId) => entityId !== deleteEntityId
    );
    if (this._config!.entities) {
      delete this._config!.entities[deleteEntityId];
    }
    if (this._config!.metadata) {
      delete this._config!.metadata[deleteEntityId];
    }
    this._updateDirtyState(++this._sceneRevision);
  }

  private _pickDevice(device_id: string) {
    if (this._devices.includes(device_id)) {
      return;
    }
    this._devices = [...this._devices, device_id];
    const deviceEntities = this._deviceEntityLookup[device_id];
    if (!deviceEntities) {
      return;
    }
    this._entities = [...this._entities, ...deviceEntities];
    deviceEntities.forEach((entityId) => {
      this._storeState(entityId);
    });
    this._updateDirtyState(++this._sceneRevision);
  }

  private _devicePicked(ev: CustomEvent) {
    const device = ev.detail.value;
    (ev.target as any).value = "";
    this._adding = undefined;
    if (device) {
      this._pickDevice(device);
    }
  }

  private _deleteDevice(deviceId: string) {
    this._devices = this._devices.filter((device) => device !== deviceId);
    const deviceEntities = this._deviceEntityLookup[deviceId];
    if (!deviceEntities) {
      return;
    }
    this._entities = this._entities.filter(
      (entityId) => !deviceEntities.includes(entityId)
    );
    if (this._config!.entities) {
      deviceEntities.forEach((entityId) => {
        delete this._config!.entities[entityId];
      });
    }
    this._updateDirtyState(++this._sceneRevision);
  }

  private _stateChanged(event: HassEvent) {
    if (
      event.context.id !== this._activateContextId &&
      this._entities.includes(event.data.entity_id)
    ) {
      this._updateDirtyState(++this._sceneRevision);
    }
  }

  private _backTapped = async (): Promise<void> => {
    const result = await this._confirmUnsavedChanged();
    if (result) {
      this._goBack();
    }
  };

  private _goBack(): void {
    afterNextRender(() => goBack("/config/scene/dashboard"));
  }

  private _deleteTapped(): void {
    showConfirmationDialog(this, {
      title: this.hass!.localize(
        "ui.panel.config.scene.picker.delete_confirm_title"
      ),
      text: this.hass!.localize(
        "ui.panel.config.scene.picker.delete_confirm_text",
        { name: this._config?.name }
      ),
      confirmText: this.hass!.localize("ui.common.delete"),
      dismissText: this.hass!.localize("ui.common.cancel"),
      confirm: () => this._delete(),
      destructive: true,
    });
  }

  private async _delete(): Promise<void> {
    if (!this.sceneId) {
      return;
    }
    await deleteScene(this.hass, this.sceneId);
    goBack("/config/scene/dashboard");
  }

  private async _confirmUnsavedChanged(addHistory = true): Promise<boolean> {
    if (!this.isDirtyState) {
      return true;
    }
    const confirmed = await showConfirmationDialog(this, {
      addHistory,
      title: this.hass!.localize(
        "ui.panel.config.scene.editor.unsaved_confirm_title"
      ),
      text: this.hass!.localize(
        "ui.panel.config.scene.editor.unsaved_confirm_text"
      ),
      confirmText: this.hass!.localize("ui.common.leave"),
      dismissText: this.hass!.localize("ui.common.stay"),
      destructive: true,
    });
    if (confirmed) {
      this._markDirtyStateClean();
    }
    return confirmed;
  }

  private async _duplicate() {
    const result = await this._confirmUnsavedChanged();
    if (result) {
      showSceneEditor(
        {
          ...this._config,
          id: undefined,
          name: `${this._config?.name} (${this.hass.localize(
            "ui.panel.config.scene.picker.duplicate"
          )})`,
        },
        this._sceneAreaIdCurrent || undefined
      );
    }
  }

  private _calculateMetaData(): SceneMetaData {
    const output: SceneMetaData = {};

    for (const entityId of this._single_entities) {
      const entityState = this._getCurrentState(entityId);

      if (!entityState) {
        continue;
      }

      output[entityId] = {
        entity_only: true,
      };
    }

    return output;
  }

  private _calculateStates(): SceneEntities {
    const output: SceneEntities = {};
    this._entities.forEach((entityId) => {
      const entityState = this._getCurrentState(entityId);
      if (entityState) {
        output[entityId] = entityState;
      }
    });
    return output;
  }

  private _storeState(entityId: string): void {
    if (entityId in this._storedStates) {
      return;
    }
    const entityState = this._getCurrentState(entityId);
    if (!entityState) {
      return;
    }
    this._storedStates[entityId] = entityState;
  }

  private _getCurrentState(entityId: string) {
    const stateObj = this.hass.states[entityId];
    if (!stateObj) {
      return undefined;
    }
    return { ...stateObj.attributes, state: stateObj.state };
  }

  // Memoized per config so re-renders reuse the same object references and
  // the state badges skip work when nothing changed.
  private _sceneStateObjs = memoizeOne((config?: SceneConfig) => {
    const objs: Record<string, HassEntity | undefined> = {};
    for (const entityId of Object.keys(config?.entities ?? {})) {
      objs[entityId] = sceneEntityStateObj(
        entityId,
        config!.entities[entityId]
      );
    }
    return objs;
  });

  // Picks the state the row's icon should reflect: the live state in live
  // mode, the scene's stored target in review mode. Undefined in review mode
  // when the scene holds no usable target for the entity - the row then
  // renders no badge rather than a live state that could be mistaken for a
  // target.
  private _badgeStateObj(
    entityId: string,
    entityStateObj: HassEntity
  ): HassEntity | undefined {
    return this._mode === "live"
      ? entityStateObj
      : this._sceneStateObjs(this._config)[entityId];
  }

  private _generateConfigFromLive() {
    this._config = {
      ...this._config!,
      entities: this._calculateStates(),
      metadata: this._calculateMetaData(),
    };
  }

  private async _saveScene(): Promise<void> {
    if (this._yamlErrors) {
      showToast(this, {
        message: this._yamlErrors,
      });
      return;
    }

    if (!this._config?.name?.trim()) {
      showToast(this, {
        message: this.hass.localize(
          "ui.panel.config.scene.editor.missing_name"
        ),
      });
      return;
    }

    if (this._mode === "live") {
      this._generateConfigFromLive();
    }

    const isNewScene = !this.sceneId;
    if (isNewScene) {
      const saved = await this._promptSceneSave();
      if (!saved) {
        return;
      }
    }

    const id = this.sceneId || String(Date.now());

    this._saving = true;

    let entityRegPromise: Promise<EntityRegistryEntry> | undefined;
    if (this._entityRegistryUpdate !== undefined && !this.sceneId) {
      this._newSceneId = id;
      entityRegPromise = new Promise<EntityRegistryEntry>((resolve) => {
        this._entityRegCreated = resolve;
      });
    }

    try {
      await saveScene(this.hass, id, this._config!);
      this._errors = undefined;

      if (this._entityRegistryUpdate !== undefined) {
        let entityId = this._scene?.entity_id;

        // wait for scene to appear in entity registry when creating a new scene
        if (entityRegPromise) {
          try {
            const scene = await promiseTimeout(5000, entityRegPromise);
            entityId = scene.entity_id;
          } catch (e) {
            if (e instanceof Error && e.name === "TimeoutError") {
              // Show the dialog and give user a chance to wait for the registry
              // to respond.
              await showAutomationSaveTimeoutDialog(this, {
                savedPromise: entityRegPromise,
                type: "scene",
              });
              try {
                // We already gave the user a chance to wait once, so if they skipped
                // the dialog and it's still not there just immediately timeout.
                const scene = await promiseTimeout(0, entityRegPromise);
                entityId = scene.entity_id;
              } catch (e2) {
                if (!(e2 instanceof Error && e2.name === "TimeoutError")) {
                  throw e2;
                }
              }
            } else {
              throw e;
            }
          }
        }

        if (entityId) {
          await updateEntityRegistryEntry(this.hass, entityId, {
            area_id: this._entityRegistryUpdate.area || null,
            labels: this._entityRegistryUpdate.labels || [],
            categories: {
              scene: this._entityRegistryUpdate.category || null,
            },
          });
        }
      }

      this._markDirtyStateClean();
      if (isNewScene) {
        navigate(`/config/scene/edit/${id}`, { replace: true });
      }
    } catch (err: any) {
      this._errors = err.body?.message || err.message || err.body;
      showToast(this, {
        message: err.body?.message || err.message || err.body,
      });
      throw err;
    } finally {
      this._saving = false;
      this._entityRegCreated = undefined;
      this._newSceneId = undefined;
    }
  }

  protected supportedShortcuts(): SupportedShortcuts {
    return {
      s: () => this._saveScene(),
    };
  }

  protected supportedShortcutsInInput(): SupportedShortcuts {
    return {
      Y: () => this._toggleYamlMode(),
    };
  }

  private get _sceneAreaIdCurrent(): string | undefined | null {
    return this._registryEntry?.area_id || undefined;
  }

  private _editCategory() {
    if (!this._registryEntry) {
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
      entityReg: this._registryEntry,
    });
  }

  private async _promptSceneSave(): Promise<boolean> {
    return new Promise((resolve) => {
      showSceneSaveDialog(this, {
        config: this._config!,
        domain: "scene",
        entityRegistryEntry: this._registryEntry,
        entityRegistryUpdate: this._entityRegistryUpdate,
        updateConfig: async (newConfig, entityRegistryUpdate) => {
          this._config = newConfig;
          this._entityRegistryUpdate = entityRegistryUpdate;
          this._updateDirtyState(++this._sceneRevision);
          this.requestUpdate();
          resolve(true);
        },
        onClose: () => resolve(false),
      });
    });
  }

  private async _promptSceneRename(): Promise<boolean> {
    return new Promise((resolve) => {
      showSceneSaveDialog(this, {
        config: this._config!,
        domain: "scene",
        entityRegistryEntry: this._registryEntry,
        entityRegistryUpdate: this._entityRegistryUpdate,
        updateConfig: async (newConfig, entityRegistryUpdate) => {
          this._config = newConfig;
          this._entityRegistryUpdate = entityRegistryUpdate;
          this._updateDirtyState(++this._sceneRevision);
          this.requestUpdate();
          resolve(true);
        },
        onClose: () => resolve(false),
      });
    });
  }

  protected async promptDiscardChanges() {
    return this._confirmUnsavedChanged(false);
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        #root {
          box-sizing: border-box;
          width: 100%;
          max-width: 1100px;
          margin: 0 auto;
          padding-inline: var(--ha-space-8);
        }
        #root {
          padding-top: var(--ha-space-4);
        }
        :host([narrow]) #root {
          padding-inline: var(--ha-space-3);
        }
        .errors {
          padding: var(--ha-space-5);
          font-weight: var(--ha-font-weight-bold);
          color: var(--error-color);
        }
        .editor {
          display: grid;
          grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
          align-items: start;
          gap: var(--ha-space-4);
        }
        @media (max-width: 800px) {
          .editor {
            grid-template-columns: minmax(0, 1fr);
          }
        }
        .left,
        .right {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-3);
          min-width: 0;
        }
        .pair {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: var(--ha-space-3);
        }
        .pair > * {
          min-width: 0;
        }
        .banner {
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
          padding: var(--ha-space-3) var(--ha-space-4);
          border-radius: var(--ha-border-radius-xl);
          background: var(--card-background-color);
          color: var(--secondary-text-color);
        }
        .banner ha-svg-icon {
          flex: none;
          color: var(--primary-color);
        }
        .banner span {
          flex: 1;
          min-width: 0;
        }
        .card {
          padding: var(--ha-space-5) var(--ha-space-6);
          border-radius: var(--ha-border-radius-3xl);
          background: var(--card-background-color);
        }
        .card h2 {
          margin: 0 0 var(--ha-space-3);
          font-family: var(--ha-font-family-heading, inherit);
          font-size: var(--ha-font-size-xl);
          font-weight: var(--ha-font-weight-medium);
          line-height: var(--ha-line-height-condensed);
        }
        .card h3 {
          margin: var(--ha-space-3) 0 0;
          font-size: var(--ha-font-size-m);
          font-weight: var(--ha-font-weight-medium);
        }
        .rows {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-1);
          margin: 0;
          padding: 0;
          list-style: none;
        }
        .row {
          display: flex;
          align-items: center;
          border-radius: var(--ha-border-radius-xl);
        }
        .row.selected {
          background: var(--ha-color-fill-primary-quiet-resting);
        }
        .row-main {
          display: flex;
          flex: 1;
          align-items: center;
          gap: var(--ha-space-3);
          min-width: 0;
          padding: var(--ha-space-2);
          border: 0;
          border-radius: var(--ha-border-radius-xl);
          background: transparent;
          color: inherit;
          font: inherit;
          text-align: start;
          cursor: pointer;
        }
        .row-main:focus-visible {
          outline: 2px solid var(--primary-color);
        }
        .tile {
          display: flex;
          flex: none;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: var(--ha-border-radius-lg);
          background: var(--ha-color-fill-neutral-quiet-resting);
          color: var(--secondary-text-color);
        }
        .row-text {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        .row-name {
          font-weight: var(--ha-font-weight-medium);
          overflow-wrap: anywhere;
        }
        .row-state {
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-s);
        }
        .row ha-icon-button {
          flex: none;
          color: var(--secondary-text-color);
        }
        .add-row {
          display: flex;
          flex-wrap: wrap;
          gap: var(--ha-space-2);
          margin-top: var(--ha-space-3);
        }
        ha-device-picker,
        ha-entity-picker {
          display: block;
          margin-top: var(--ha-space-3);
        }
        .hint {
          margin: var(--ha-space-2) 0 0;
          color: var(--secondary-text-color);
        }
        .toggle-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin: var(--ha-space-3) 0;
          font-weight: var(--ha-font-weight-medium);
        }
        ha-control-slider {
          --control-slider-thickness: 56px;
          --control-slider-border-radius: 28px;
          --control-slider-color: var(--primary-color);
          --control-slider-background: var(
            --ha-color-fill-neutral-quiet-resting
          );
          --control-slider-background-opacity: 1;
          width: 100%;
        }
        .swatches {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-3);
          margin-top: var(--ha-space-4);
        }
        .swatch {
          width: 44px;
          height: 44px;
          padding: 0;
          border: 3px solid transparent;
          border-radius: 50%;
          cursor: pointer;
        }
        .swatch.active {
          box-shadow: 0 0 0 2px var(--primary-text-color);
        }
        .swatch:disabled {
          cursor: default;
          opacity: var(--light-disabled-opacity, 0.5);
        }
        .swatch:focus-visible {
          outline: 2px solid var(--primary-color);
          outline-offset: 2px;
        }
        .any-colour {
          display: inline-block;
          min-height: 44px;
        }
        .any-colour.disabled {
          opacity: var(--light-disabled-opacity, 0.5);
          pointer-events: none;
        }
        .saved {
          display: flex;
          align-items: center;
          gap: var(--ha-space-2);
          margin: var(--ha-space-4) 0 0;
          color: var(--secondary-text-color);
        }
        .saved ha-svg-icon {
          flex: none;
        }
        .try-row {
          box-sizing: border-box;
          max-width: 1100px;
          margin: var(--ha-space-5) auto 0;
          padding-inline: var(--ha-space-4);
        }
        .try-row ha-button {
          min-height: 44px;
        }
        ha-editor-save-bar {
          --ha-editor-save-bar-max-width: 1100px;
          margin-top: var(--ha-space-3);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-scene-editor": HaSceneEditor;
  }
}
