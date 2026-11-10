import {
  mdiDelete,
  mdiDevices,
  mdiDotsVertical,
  mdiMovieOpen,
  mdiPalette,
  mdiPencil,
  mdiPlus,
  mdiRobot,
  mdiScriptText,
  mdiShape,
  mdiTagMultiple,
  mdiThermometer,
  mdiTools,
  mdiWaterPercent,
} from "@mdi/js";
import { startOfYesterday } from "date-fns";
import type { HassEntity } from "home-assistant-js-websocket/dist/types";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { ifDefined } from "lit/directives/if-defined";
import { styleMap } from "lit/directives/style-map";
import memoizeOne from "memoize-one";
import { isComponentLoaded } from "../../../common/config/is_component_loaded";
import { consume } from "../../../common/decorators/consume";
import type { HASSDomCurrentTargetEvent } from "../../../common/dom/fire_event";
import { computeDeviceNameDisplay } from "../../../common/entity/compute_device_name";
import { computeDomain } from "../../../common/entity/compute_domain";
import { goBack, navigate } from "../../../common/navigate";
import { caseInsensitiveStringCompare } from "../../../common/string/compare";
import { createSearchParam } from "../../../common/url/search-params";
import { groupBy } from "../../../common/util/group-by";
import { afterNextRender } from "../../../common/util/render-status";
import "../../../components/ha-button";
import "../../../components/ha-card";
import "../../../components/ha-dropdown";
import type { HaDropdownSelectEvent } from "../../../components/ha-dropdown";
import "../../../components/ha-dropdown-item";
import "../../../components/ha-icon-button";
import "../../../components/ha-icon-button-next";
import "../../../components/ha-icon-next";
import "../../../components/ha-list";
import "../../../components/ha-list-item";
import "../../../components/ha-svg-icon";
import type { AreaRegistryEntry } from "../../../data/area/area_registry";
import {
  deleteAreaRegistryEntry,
  updateAreaRegistryEntry,
} from "../../../data/area/area_registry";
import type { AutomationEntity } from "../../../data/automation";
import { fireRelatedContext, fullEntitiesContext } from "../../../data/context";
import type { DeviceRegistryEntry } from "../../../data/device/device_registry";
import { sortDeviceRegistryByName } from "../../../data/device/device_registry";
import type { EntityRegistryEntry } from "../../../data/entity/entity_registry";
import {
  computeEntityRegistryName,
  sortEntityRegistryByName,
} from "../../../data/entity/entity_registry";
import type { SceneEntity } from "../../../data/scene";
import type { ScriptEntity } from "../../../data/script";
import type { RelatedResult } from "../../../data/search";
import { findRelated } from "../../../data/search";
import { filterAddToSceneEntityIds } from "../../../dialogs/add-to/add-to";
import { showConfirmationDialog } from "../../../dialogs/generic/show-dialog-box";
import { showMoreInfoDialog } from "../../../dialogs/more-info/show-ha-more-info-dialog";
import "../../../layouts/hass-error-screen";
import "../../../layouts/hass-subpage";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";
import "../../logbook/ha-logbook";
import { isHelperDomain } from "../helpers/const";
import {
  loadAreaAddToDialog,
  showAreaAddToDialog,
} from "./show-dialog-area-add-to";
import {
  loadAreaRegistryDetailDialog,
  showAreaRegistryDetailDialog,
} from "./show-dialog-area-registry-detail";

declare interface NameAndEntity<EntityType extends HassEntity> {
  name: string;
  entity: EntityType;
}

type AreaQuickLinkKey =
  "devices" | "entities" | "helpers" | "automations" | "scenes" | "scripts";

const NAVIGATION_ACTIONS: {
  value: string;
  path: string;
  params?: string;
  icon: string;
  countKey: AreaQuickLinkKey;
}[] = [
  {
    value: "navigate-devices",
    path: "/config/devices/dashboard",
    params: "&status=disabled",
    icon: mdiDevices,
    countKey: "devices",
  },
  {
    value: "navigate-entities",
    path: "/config/entities",
    icon: mdiShape,
    countKey: "entities",
  },
  {
    value: "navigate-helpers",
    path: "/config/helpers",
    icon: mdiTools,
    countKey: "helpers",
  },
  {
    value: "navigate-automations",
    path: "/config/automation/dashboard",
    icon: mdiRobot,
    countKey: "automations",
  },
  {
    value: "navigate-scenes",
    path: "/config/scene/dashboard",
    icon: mdiPalette,
    countKey: "scenes",
  },
  {
    value: "navigate-scripts",
    path: "/config/script/dashboard",
    icon: mdiScriptText,
    countKey: "scripts",
  },
] as const;

const COLLAPSED_ROWS = 3;

@customElement("ha-config-area-page")
class HaConfigAreaPage extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public areaId!: string;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @property({ attribute: "is-wide", type: Boolean }) public isWide = false;

  @state()
  @consume({ context: fullEntitiesContext, subscribe: true })
  _entityReg: EntityRegistryEntry[] = [];

  @state() private _related?: RelatedResult;

  @state() private _showAllDevices = false;

  private _logbookTime = { recent: 86400 };

  private _memberships = memoizeOne(
    (
      areaId: string,
      registryDevices: DeviceRegistryEntry[],
      registryEntities: EntityRegistryEntry[]
    ) => {
      const devices = new Map<string, DeviceRegistryEntry>();

      for (const device of registryDevices) {
        if (device.area_id === areaId) {
          devices.set(device.id, device);
        }
      }

      const entities: EntityRegistryEntry[] = [];
      const indirectEntities: EntityRegistryEntry[] = [];

      for (const entity of registryEntities) {
        if (entity.area_id) {
          if (entity.area_id === areaId) {
            entities.push(entity);
          }
        } else if (entity.device_id && devices.has(entity.device_id)) {
          indirectEntities.push(entity);
        }
      }

      return {
        devices: Array.from(devices.values()),
        entities,
        indirectEntities,
      };
    }
  );

  private _allDeviceIds = memoizeOne((devices: DeviceRegistryEntry[]) =>
    devices.map((device) => device.id)
  );

  private _allEntities = memoizeOne(
    (memberships: {
      entities: EntityRegistryEntry[];
      indirectEntities: EntityRegistryEntry[];
    }) =>
      memberships.entities
        .map((entry) => entry.entity_id)
        .concat(memberships.indirectEntities.map((entry) => entry.entity_id))
  );

  private _getQuickLinkCounts = memoizeOne(
    (
      memberships: {
        devices: DeviceRegistryEntry[];
        entities: EntityRegistryEntry[];
        indirectEntities: EntityRegistryEntry[];
      },
      related?: RelatedResult
    ) => {
      const allEntityIds = this._allEntities(memberships);
      const entityIds = related?.entity ?? allEntityIds;

      return {
        devices: related?.device?.length ?? memberships.devices.length,
        entities: entityIds.length,
        helpers: entityIds.filter((entityId) =>
          isHelperDomain(computeDomain(entityId))
        ).length,
        automations: related?.automation?.length ?? 0,
        scenes: related?.scene?.length ?? 0,
        scripts: related?.script?.length ?? 0,
      };
    }
  );

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);
    loadAreaRegistryDetailDialog();
    loadAreaAddToDialog();
  }

  protected updated(changedProps: PropertyValues<this>) {
    super.updated(changedProps);
    if (changedProps.has("areaId")) {
      this._findRelated();
      fireRelatedContext(this, {
        itemType: "area",
        itemId: this.areaId,
      });
    }
  }

  protected render() {
    if (!this.hass.areas || !this.hass.devices || !this.hass.entities) {
      return nothing;
    }

    const area = this.hass.areas[this.areaId];

    if (!area) {
      return html`
        <hass-error-screen
          .hass=${this.hass}
          .error=${this.hass.localize("ui.panel.config.areas.area_not_found")}
        ></hass-error-screen>
      `;
    }

    const memberships = this._memberships(
      this.areaId,
      Object.values(this.hass.devices),
      this._entityReg
    );
    const quickLinkCounts = this._getQuickLinkCounts(
      memberships,
      this._related
    );

    // Compute the display names on shallow copies so we can sort and render by
    // them without mutating the shared registry objects.
    const devices = memberships.devices.map((entry) => ({
      ...entry,
      name: computeDeviceNameDisplay(entry, this.hass.localize),
    }));
    sortDeviceRegistryByName(devices, this.hass.locale.language);

    const entities = memberships.entities.map((entry) => ({
      ...entry,
      name: computeEntityRegistryName(this.hass, entry),
    }));
    sortEntityRegistryByName(entities, this.hass.locale.language);

    // Group entities by domain
    const groupedEntities = groupBy(entities, (entity) =>
      computeDomain(entity.entity_id)
    );

    // Pre-compute the name also for the grouped and related entities so we can sort by them
    let groupedAutomations: NameAndEntity<AutomationEntity>[] = [];
    let groupedScenes: NameAndEntity<SceneEntity>[] = [];
    let groupedScripts: NameAndEntity<ScriptEntity>[] = [];
    let relatedAutomations: NameAndEntity<AutomationEntity>[] = [];
    let relatedScenes: NameAndEntity<SceneEntity>[] = [];
    let relatedScripts: NameAndEntity<ScriptEntity>[] = [];

    if (isComponentLoaded(this.hass.config, "automation")) {
      ({
        groupedEntities: groupedAutomations,
        relatedEntities: relatedAutomations,
      } = this._prepareEntities<AutomationEntity>(
        groupedEntities.automation,
        this._related?.automation
      ));
    }

    if (isComponentLoaded(this.hass.config, "scene")) {
      ({ groupedEntities: groupedScenes, relatedEntities: relatedScenes } =
        this._prepareEntities<SceneEntity>(
          groupedEntities.scene,
          this._related?.scene
        ));
    }

    if (isComponentLoaded(this.hass.config, "script")) {
      ({ groupedEntities: groupedScripts, relatedEntities: relatedScripts } =
        this._prepareEntities<ScriptEntity>(
          groupedEntities.script,
          this._related?.script
        ));
    }

    const nonAutomatedEntities = entities.filter(
      (entity) =>
        !["scene", "script", "automation"].includes(
          computeDomain(entity.entity_id)
        )
    );

    const floor = area.floor_id ? this.hass.floors[area.floor_id] : undefined;
    const temperatureState = area.temperature_entity_id
      ? this.hass.states[area.temperature_entity_id]
      : undefined;
    const humidityState = area.humidity_entity_id
      ? this.hass.states[area.humidity_entity_id]
      : undefined;
    const temperature = this._formatReading(temperatureState);
    const humidity = this._formatReading(humidityState);

    const areaEntityIds = this._allEntities(memberships);
    const lightIds = areaEntityIds.filter(
      (entityId) => computeDomain(entityId) === "light"
    );
    const lightsOn = lightIds.filter(
      (entityId) => this.hass.states[entityId]?.state === "on"
    ).length;

    const heroSentences = [
      temperature && humidity
        ? this.hass.localize(
            "ui.panel.config.areas.hero.temperature_humidity",
            {
              temperature,
              humidity,
            }
          )
        : temperature
          ? this.hass.localize("ui.panel.config.areas.hero.temperature", {
              temperature,
            })
          : humidity
            ? this.hass.localize("ui.panel.config.areas.hero.humidity", {
                humidity,
              })
            : undefined,
      lightIds.length
        ? this.hass.localize("ui.panel.config.areas.hero.lights", {
            on: lightsOn,
            total: lightIds.length,
          })
        : undefined,
    ].filter((sentence): sentence is string => Boolean(sentence));

    const scenesAndAutomations = [
      ...groupedAutomations.map((item) => ({ kind: "automation", ...item })),
      ...relatedAutomations.map((item) => ({ kind: "automation", ...item })),
      ...groupedScenes.map((item) => ({ kind: "scene", ...item })),
      ...relatedScenes.map((item) => ({ kind: "scene", ...item })),
      ...groupedScripts.map((item) => ({ kind: "script", ...item })),
      ...relatedScripts.map((item) => ({ kind: "script", ...item })),
    ].filter(
      (item, index, all) =>
        all.findIndex(
          (other) => other.entity.entity_id === item.entity.entity_id
        ) === index
    );

    const visibleDevices = this._showAllDevices
      ? devices
      : devices.slice(0, COLLAPSED_ROWS);

    const reportRows: TemplateResult[] = [];
    if (temperatureState) {
      reportRows.push(
        this._renderReportRow(
          mdiThermometer,
          this.hass.localize("ui.panel.config.areas.reports.temperature"),
          temperatureState
        )
      );
    }
    if (humidityState) {
      reportRows.push(
        this._renderReportRow(
          mdiWaterPercent,
          this.hass.localize("ui.panel.config.areas.reports.humidity"),
          humidityState
        )
      );
    }

    const heroStyle = styleMap({
      backgroundImage: area.picture
        ? `linear-gradient(rgba(0, 0, 0, 0.35), rgba(0, 0, 0, 0.35)), url(${area.picture})`
        : undefined,
    });

    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        back-path="/config/areas/dashboard"
        .header=${html`${
          area.icon
            ? html`<ha-icon
                .icon=${area.icon}
                style="margin-inline-end: 8px;"
              ></ha-icon>`
            : nothing
        }${area.name}`}
      >
        <ha-dropdown slot="toolbar-icon" @wa-select=${this._handleMenuAction}>
          <ha-icon-button
            slot="trigger"
            .label=${this.hass.localize("ui.common.menu")}
            .path=${mdiDotsVertical}
          ></ha-icon-button>

          ${NAVIGATION_ACTIONS.filter(
            (action) => quickLinkCounts[action.countKey]
          ).map(
            (action) => html`
              <ha-dropdown-item value=${action.value}>
                <ha-svg-icon slot="icon" .path=${action.icon}></ha-svg-icon>
                ${this.hass.localize(
                  `ui.panel.config.areas.quick_links.${action.countKey}`,
                  { count: quickLinkCounts[action.countKey] }
                )}
                <ha-icon-next slot="details"></ha-icon-next>
              </ha-dropdown-item>
            `
          )}
          ${
            NAVIGATION_ACTIONS.some(
              (action) => quickLinkCounts[action.countKey]
            )
              ? html`<wa-divider></wa-divider>`
              : nothing
          }

          <ha-dropdown-item value="edit" .data=${area}>
            <ha-svg-icon slot="icon" .path=${mdiPencil}> </ha-svg-icon>
            ${this.hass.localize("ui.panel.config.areas.edit_settings")}
          </ha-dropdown-item>

          <ha-dropdown-item value="delete" variant="danger">
            <ha-svg-icon slot="icon" .path=${mdiDelete}> </ha-svg-icon>
            ${this.hass.localize("ui.panel.config.areas.editor.delete")}
          </ha-dropdown-item>
        </ha-dropdown>

        <div class="page">
          <section
            class="hero ${area.picture ? "with-picture" : ""}"
            style=${heroStyle}
          >
            <div class="hero-text">
              ${floor ? html`<span class="eyebrow">${floor.name}</span>` : nothing}
              <h1>${area.name}</h1>
              ${
                heroSentences.length
                  ? html`<p>${heroSentences.join(" ")}</p>`
                  : nothing
              }
            </div>
            <div class="hero-actions">
              <ha-button
                appearance="filled"
                .entry=${area}
                @click=${this._showSettings}
              >
                <ha-svg-icon .path=${mdiPencil} slot="start"></ha-svg-icon>
                ${this.hass.localize("ui.panel.config.areas.edit_area")}
              </ha-button>
              <ha-button
                appearance="filled"
                variant="brand"
                @click=${this._showAddToDialog}
              >
                <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
                ${this.hass.localize("ui.dialogs.more_info_control.add_to.item")}
              </ha-button>
            </div>
          </section>

          <div class="cards">
            <ha-card outlined>
              <h2>
                ${this.hass.localize("ui.panel.config.areas.devices_heading", {
                  count: devices.length,
                })}
              </h2>
              ${
                devices.length
                  ? html`<div class="rows">
                        ${visibleDevices.map((device) =>
                          this._renderRow({
                            href: `/config/devices/device/${device.id}`,
                            icon: mdiDevices,
                            name: device.name,
                            secondary: device.manufacturer ?? undefined,
                          })
                        )}
                      </div>
                      ${
                        devices.length > COLLAPSED_ROWS
                          ? html`<button
                              class="link-button"
                              @click=${this._toggleShowAllDevices}
                            >
                              ${this.hass.localize(
                                this._showAllDevices
                                  ? "ui.panel.config.areas.show_fewer"
                                  : "ui.panel.config.areas.show_all",
                                { count: devices.length }
                              )}
                            </button>`
                          : nothing
                      }`
                  : html`<div class="no-entries">
                      ${this.hass.localize("ui.panel.config.devices.no_devices")}
                    </div>`
              }
            </ha-card>

            <ha-card outlined>
              <h2>
                ${this.hass.localize(
                  "ui.panel.config.areas.automations_scenes_heading"
                )}
              </h2>
              ${
                scenesAndAutomations.length
                  ? html`<div class="rows">
                      ${scenesAndAutomations.map((item) =>
                        this._renderAutomationRow(
                          item.kind,
                          item.name,
                          item.entity
                        )
                      )}
                    </div>`
                  : html`<div class="no-entries">
                      ${this.hass.localize(
                        "ui.panel.config.areas.automations_scenes_empty"
                      )}
                    </div>`
              }
            </ha-card>

            <ha-card outlined>
              <h2>
                ${this.hass.localize("ui.panel.config.areas.reports_heading")}
              </h2>
              <div class="rows">
                ${reportRows}
                ${
                  area.aliases.length
                    ? this._renderRow({
                        icon: mdiTagMultiple,
                        name: this.hass.localize(
                          "ui.panel.config.areas.reports.aliases"
                        ),
                        secondary: area.aliases.join(", "),
                      })
                    : nothing
                }
              </div>
              ${
                reportRows.length || area.aliases.length
                  ? nothing
                  : html`<div class="no-entries">
                      ${this.hass.localize("ui.panel.config.areas.reports.empty")}
                    </div>`
              }
              ${
                area.aliases.length
                  ? html`<p class="note">
                      ${this.hass.localize("ui.panel.config.areas.reports.aliases_note")}
                    </p>`
                  : nothing
              }
            </ha-card>
          </div>

          <div class="cards">
            <ha-card
              outlined
              .header=${this.hass.localize(
                "ui.panel.config.areas.editor.linked_entities_caption"
              )}
            >
              ${
                nonAutomatedEntities.length
                  ? html`<ha-list>
                      ${nonAutomatedEntities.map(
                        (entity) => html`
                          <ha-list-item
                            @click=${this._openEntity}
                            .entity=${entity}
                            hasMeta
                          >
                            <span>${entity.name}</span>
                            <ha-icon-next slot="meta"></ha-icon-next>
                          </ha-list-item>
                        `
                      )}
                    </ha-list>`
                  : html`
                      <div class="no-entries">
                        ${this.hass.localize(
                          "ui.panel.config.areas.editor.no_linked_entities"
                        )}
                      </div>
                    `
              }
            </ha-card>
            ${
              isComponentLoaded(this.hass.config, "logbook")
                ? html`
                    <ha-card outlined class="logbook">
                      <div class="card-header logbook-header">
                        <span>${this.hass.localize("panel.logbook")}</span>
                        <a
                          href="/logbook?${createSearchParam({
                            area_id: this.areaId,
                            start_date: startOfYesterday().toISOString(),
                            back: "1",
                          })}"
                        >
                          <ha-icon-button-next
                            .label=${this.hass.localize(
                              "ui.dialogs.more_info_control.show_more"
                            )}
                          ></ha-icon-button-next>
                        </a>
                      </div>
                      <ha-logbook
                        .hass=${this.hass}
                        .time=${this._logbookTime}
                        .entityIds=${this._allEntities(memberships)}
                        .deviceIds=${this._allDeviceIds(memberships.devices)}
                        name-detail="device"
                        virtualize
                        narrow
                        no-icon
                      ></ha-logbook>
                    </ha-card>
                  `
                : nothing
            }
          </div>
        </div>
      </hass-subpage>
    `;
  }

  private _formatReading(stateObj?: HassEntity): string | undefined {
    if (
      !stateObj ||
      stateObj.state === "unavailable" ||
      stateObj.state === "unknown"
    ) {
      return undefined;
    }
    return this.hass.formatEntityState(stateObj);
  }

  private _renderReportRow(icon: string, label: string, stateObj: HassEntity) {
    return this._renderRow({
      icon,
      name: label,
      secondary: this.hass.localize("ui.panel.config.areas.reports.from", {
        name: this.hass.formatEntityName(stateObj),
      }),
      onClick: () => showMoreInfoDialog(this, { entityId: stateObj.entity_id }),
    });
  }

  private _renderRow(row: {
    icon: string;
    name: string;
    secondary?: string;
    href?: string;
    onClick?: () => void;
    disabledReason?: string;
  }) {
    const content = html`
      <span class="row-icon"
        ><ha-svg-icon .path=${row.icon}></ha-svg-icon
      ></span>
      <span class="row-text">
        <span class="row-name">${row.name}</span>
        ${
          row.secondary
            ? html`<span class="row-secondary">${row.secondary}</span>`
            : nothing
        }
      </span>
      ${row.href || row.onClick ? html`<ha-icon-next></ha-icon-next>` : nothing}
    `;
    if (row.href) {
      return html`<a class="row" href=${row.href}>${content}</a>`;
    }
    if (row.onClick) {
      return html`<button class="row" @click=${row.onClick}>
        ${content}
      </button>`;
    }
    return html`<div
      class="row"
      title=${ifDefined(row.disabledReason)}
      ?disabled=${Boolean(row.disabledReason)}
    >
      ${content}
    </div>`;
  }

  private _renderAutomationRow(
    kind: string,
    name: string,
    entityState: AutomationEntity | SceneEntity | ScriptEntity
  ) {
    const icon =
      kind === "automation"
        ? mdiRobot
        : kind === "scene"
          ? mdiMovieOpen
          : mdiScriptText;
    const secondary =
      kind === "automation"
        ? this.hass.localize("ui.panel.config.areas.row_kind.automation", {
            state: this.hass.formatEntityState(entityState),
          })
        : this.hass.localize(
            kind === "scene"
              ? "ui.panel.config.areas.row_kind.scene"
              : "ui.panel.config.areas.row_kind.script"
          );
    const itemId = (entityState.attributes as { id?: string }).id;
    let href: string | undefined;
    if (kind === "automation") {
      href = itemId
        ? `/config/automation/edit/${encodeURIComponent(itemId)}`
        : undefined;
    } else if (kind === "scene") {
      href = itemId ? `/config/scene/edit/${itemId}` : undefined;
    } else {
      const entry = this._entityReg.find(
        (e) => e.entity_id === entityState.entity_id
      );
      href = entry
        ? `/config/script/edit/${entry.unique_id}`
        : `/config/script/show/${entityState.entity_id}`;
    }
    return this._renderRow({
      icon,
      name,
      secondary,
      href,
      disabledReason: href
        ? undefined
        : this.hass.localize("ui.panel.config.devices.cant_edit"),
    });
  }

  private _toggleShowAllDevices() {
    this._showAllDevices = !this._showAllDevices;
  }

  private _prepareEntities<EntityType extends HassEntity>(
    entries?: EntityRegistryEntry[],
    relatedEntityIds?: string[]
  ): {
    groupedEntities: NameAndEntity<EntityType>[];
    relatedEntities: NameAndEntity<EntityType>[];
  } {
    const groupedEntities: NameAndEntity<EntityType>[] = [];
    const relatedEntities: NameAndEntity<EntityType>[] = [];

    if (entries?.length) {
      entries.forEach((entity) => {
        const entityState = this.hass.states[
          entity.entity_id
        ] as unknown as EntityType;
        if (entityState) {
          groupedEntities.push({
            name: this.hass.formatEntityName(entityState),
            entity: entityState,
          });
        }
      });
      groupedEntities.sort((entry1, entry2) =>
        caseInsensitiveStringCompare(
          entry1.name!,
          entry2.name!,
          this.hass.locale.language
        )
      );
    }
    if (relatedEntityIds?.length) {
      relatedEntityIds.forEach((entity) => {
        const entityState = this.hass.states[entity] as EntityType;
        if (entityState) {
          relatedEntities.push({
            name: this.hass.formatEntityName(entityState),
            entity: entityState,
          });
        }
      });
      relatedEntities.sort((entry1, entry2) =>
        caseInsensitiveStringCompare(
          entry1.name!,
          entry2.name!,
          this.hass.locale.language
        )
      );
    }

    return { groupedEntities, relatedEntities };
  }

  private async _findRelated() {
    this._related = await findRelated(this.hass, "area", this.areaId);
  }

  private _showAddToDialog() {
    const area = this.hass.areas[this.areaId];
    if (!area) {
      return;
    }
    const sceneEntityIds = filterAddToSceneEntityIds(
      this._areaEntityIds,
      this._entityReg,
      this.hass.states
    );
    showAreaAddToDialog(this, {
      areaId: area.area_id,
      entityIds: sceneEntityIds,
      canCreateScene:
        isComponentLoaded(this.hass.config, "scene") &&
        sceneEntityIds.length > 0,
    });
  }

  private get _areaEntityIds(): string[] {
    const memberships = this._memberships(
      this.areaId,
      Object.values(this.hass.devices),
      this._entityReg
    );

    return this._allEntities(memberships);
  }

  private _handleMenuAction(
    ev: HaDropdownSelectEvent<string, AreaRegistryEntry>
  ) {
    const action = ev.detail?.item?.value;
    const entry = ev.detail?.item?.data;

    const navAction = NAVIGATION_ACTIONS.find((a) => a.value === action);
    if (navAction) {
      navigate(
        `${navAction.path}?historyBack=1&area=${this.areaId}${navAction.params ?? ""}`
      );
      return;
    }

    switch (action) {
      case "edit":
        this._openDialog(entry);
        break;
      case "delete":
        this._deleteConfirm();
        break;
    }
  }

  private _showSettings(
    ev: HASSDomCurrentTargetEvent<
      HTMLButtonElement & { entry: AreaRegistryEntry }
    >
  ) {
    this._openDialog(ev.currentTarget.entry);
  }

  private _openEntity(
    ev: HASSDomCurrentTargetEvent<HTMLElement & { entity: EntityRegistryEntry }>
  ) {
    showMoreInfoDialog(this, {
      entityId: ev.currentTarget.entity.entity_id,
    });
  }

  private _openDialog(entry?: AreaRegistryEntry) {
    showAreaRegistryDetailDialog(this, {
      entry,
      updateEntry: async (values) =>
        updateAreaRegistryEntry(this.hass!.callWS, entry!.area_id, values),
    });
  }

  private async _deleteConfirm() {
    const area = this.hass.areas[this.areaId];
    showConfirmationDialog(this, {
      title: this.hass.localize(
        "ui.panel.config.areas.delete.confirmation_title",
        { name: area!.name }
      ),
      text: this.hass.localize(
        "ui.panel.config.areas.delete.confirmation_text"
      ),
      dismissText: this.hass.localize("ui.common.cancel"),
      confirmText: this.hass.localize("ui.common.delete"),
      destructive: true,
      confirm: async () => {
        await deleteAreaRegistryEntry(this.hass!, area!.area_id);
        afterNextRender(() => goBack("/config/areas/dashboard"));
      },
    });
  }

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
          max-width: 1280px;
          margin: 0 auto;
          padding: var(--ha-space-4) var(--ha-space-8) var(--ha-space-8);
        }
        :host([narrow]) .page {
          padding: var(--ha-space-2) var(--ha-space-3) var(--ha-space-6);
        }
        .hero {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-end;
          justify-content: space-between;
          gap: var(--ha-space-4);
          min-height: 160px;
          margin-bottom: var(--ha-space-4);
          padding: var(--ha-space-6) var(--ha-space-8);
          border-radius: var(--ha-border-radius-3xl);
          box-sizing: border-box;
          background-image: linear-gradient(
            135deg,
            var(--primary-color),
            color-mix(
              in srgb,
              var(--primary-color) 25%,
              var(--card-background-color)
            )
          );
          background-size: cover;
          background-position: center;
          color: var(--text-primary-color, #fff);
        }
        .hero.with-picture {
          background-color: var(--primary-color);
        }
        :host([narrow]) .hero {
          padding: var(--ha-space-5) var(--ha-space-4);
        }
        .hero-text {
          min-width: 0;
          overflow-wrap: anywhere;
        }
        .eyebrow {
          font-size: var(--ha-font-size-m);
          font-weight: var(--ha-font-weight-medium);
        }
        .hero h1 {
          margin: var(--ha-space-1) 0;
          font-family: var(--ha-font-family-heading, inherit);
          font-size: var(--ha-font-size-4xl);
          font-weight: var(--ha-font-weight-normal);
          line-height: var(--ha-line-height-condensed);
        }
        .hero p {
          margin: 0;
          font-size: var(--ha-font-size-m);
        }
        .hero-actions {
          display: flex;
          flex-wrap: wrap;
          gap: var(--ha-space-2);
        }
        .cards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: var(--ha-space-4);
          margin-bottom: var(--ha-space-4);
          align-items: start;
        }
        ha-card {
          border-radius: var(--ha-border-radius-3xl);
          min-width: 0;
        }
        ha-card > h2 {
          margin: 0;
          padding: var(--ha-space-5) var(--ha-space-5) var(--ha-space-2);
          font-size: var(--ha-font-size-l);
          font-weight: var(--ha-font-weight-medium);
        }
        .rows {
          display: flex;
          flex-direction: column;
          padding: 0 var(--ha-space-2);
        }
        .row {
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
          box-sizing: border-box;
          width: 100%;
          padding: var(--ha-space-2) var(--ha-space-3);
          border: none;
          border-radius: var(--ha-border-radius-xl);
          background: none;
          font: inherit;
          text-align: start;
          text-decoration: none;
          color: var(--primary-text-color);
        }
        a.row,
        button.row {
          cursor: pointer;
        }
        a.row:hover,
        button.row:hover {
          background: var(--secondary-background-color);
        }
        .row[disabled] {
          opacity: 0.6;
        }
        .row-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          flex: none;
          width: 40px;
          height: 40px;
          border-radius: var(--ha-border-radius-lg);
          background: var(--secondary-background-color);
        }
        .row-text {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-width: 0;
          overflow-wrap: anywhere;
        }
        .row-name {
          font-weight: var(--ha-font-weight-medium);
        }
        .row-secondary {
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        .link-button {
          margin: var(--ha-space-2) var(--ha-space-5) var(--ha-space-4);
          padding: 0;
          border: none;
          background: none;
          font: inherit;
          font-weight: var(--ha-font-weight-medium);
          color: var(--primary-color);
          cursor: pointer;
        }
        .note {
          margin: 0;
          padding: var(--ha-space-2) var(--ha-space-5) var(--ha-space-4);
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        a {
          text-decoration: none;
          color: var(--primary-text-color);
        }
        .logbook-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: var(--ha-space-4) var(--ha-space-4) 0;
        }
        .logbook-header a {
          display: flex;
          align-items: center;
          color: var(--primary-text-color);
          margin-inline-end: calc(var(--ha-space-2) * -1);
        }
        ha-logbook {
          height: 400px;
        }
        :host([narrow]) ha-logbook {
          height: 235px;
          overflow: auto;
        }
        .no-entries {
          text-align: center;
          padding: var(--ha-space-4);
          color: var(--secondary-text-color);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-area-page": HaConfigAreaPage;
  }
}
