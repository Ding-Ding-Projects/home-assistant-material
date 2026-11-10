import {
  mdiDevices,
  mdiInformationOutline,
  mdiPlus,
  mdiShape,
  mdiTune,
  mdiVectorPolyline,
} from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { isComponentLoaded } from "../../../../../common/config/is_component_loaded";
import { computeDeviceNameDisplay } from "../../../../../common/entity/compute_device_name";
import "../../../../../components/ha-alert";
import "../../../../../components/ha-button";
import "../../../../../components/ha-icon-next";
import "../../../../../components/ha-svg-icon";
import "../../../../../components/item/ha-list-item-button";
import "../../../../../components/list/ha-list-nav";
import type { ConfigEntry } from "../../../../../data/config_entries";
import { getConfigEntries } from "../../../../../data/config_entries";
import type { DeviceRegistryEntry } from "../../../../../data/device/device_registry";
import type { MatterNetworkTopologyNode } from "../../../../../data/matter";
import { fetchMatterNetworkTopology } from "../../../../../data/matter";
import "../../../../../layouts/hass-subpage";
import { animationStyles } from "../../../../../resources/theme/animations.globals";
import { haStyle } from "../../../../../resources/styles";
import type { HomeAssistant } from "../../../../../types";
import { brandsUrl } from "../../../../../util/brands-url";
import { showMatterAddDeviceDialog } from "./show-dialog-add-matter-device";

const THREAD_ICON =
  "m 17.126982,8.0730792 c 0,-0.7297242 -0.593746,-1.32357 -1.323637,-1.32357 -0.729454,0 -1.323199,0.5938458 -1.323199,1.32357 v 1.3234242 l 1.323199,1.458e-4 c 0.729891,0 1.323637,-0.5937006 1.323637,-1.32357 z M 11.999709,0 C 5.3829818,0 0,5.3838955 0,12.001455 0,18.574352 5.3105455,23.927406 11.865164,24 V 12.012075 l -3.9275642,-2.91e-4 c -1.1669814,0 -2.1169453,0.949979 -2.1169453,2.118323 0,1.16718 0.9499639,2.116868 2.1169453,2.116868 v 2.615717 c -2.6093089,0 -4.732218,-2.12327 -4.732218,-4.732585 0,-2.61048 2.1229091,-4.7343308 4.732218,-4.7343308 l 3.9275642,5.82e-4 v -1.323279 c 0,-2.172296 1.766691,-3.9395777 3.938181,-3.9395777 2.171928,0 3.9392,1.7672817 3.9392,3.9395777 0,2.1721498 -1.767272,3.9395768 -3.9392,3.9395768 l -1.323199,-1.45e-4 V 23.744102 C 19.911127,22.597726 24,17.768833 24,12.001455 24,5.3838955 18.616727,0 11.999709,0 Z";

/** How many devices the list shows before "Show all". */
const COLLAPSED_DEVICE_COUNT = 4;

@customElement("matter-config-dashboard")
export class MatterConfigDashboard extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @state() private _configEntry?: ConfigEntry;

  @state() private _offlineDevices = 0;

  @state() private _topologyNodes?: MatterNetworkTopologyNode[];

  @state() private _asyncDataLoaded = false;

  @state() private _showAllDevices = false;

  protected firstUpdated(changedProperties: PropertyValues<this>) {
    super.firstUpdated(changedProperties);
    if (this.hass) {
      this._fetchConfigEntry();
    }
  }

  private _matterDeviceIds = memoizeOne(
    (
      devices: HomeAssistant["devices"],
      configEntryId?: string
    ): Set<string> => {
      if (!configEntryId) {
        return new Set();
      }
      return new Set(
        Object.values(devices)
          .filter((device) => device.config_entries.includes(configEntryId))
          .map((device) => device.id)
      );
    }
  );

  private _entityCount = memoizeOne(
    (entities: HomeAssistant["entities"], deviceIds: Set<string>): number =>
      Object.values(entities).filter(
        (entity) => entity.device_id && deviceIds.has(entity.device_id)
      ).length
  );

  private _matterDevices = memoizeOne(
    (
      devices: HomeAssistant["devices"],
      deviceIds: Set<string>
    ): DeviceRegistryEntry[] =>
      [...deviceIds]
        .map((id) => devices[id])
        .filter((device): device is DeviceRegistryEntry => !!device)
        .sort((a, b) =>
          computeDeviceNameDisplay(a, this.hass.localize).localeCompare(
            computeDeviceNameDisplay(b, this.hass.localize)
          )
        )
  );

  protected render(): TemplateResult | typeof nothing {
    if (!this._configEntry) {
      return nothing;
    }
    const isOnline = this._configEntry.state === "loaded";
    const deviceIds = this._matterDeviceIds(
      this.hass.devices,
      this._configEntry.entry_id
    );
    const entityCount = this._entityCount(this.hass.entities, deviceIds);

    return html`
      <hass-subpage
        .narrow=${this.narrow}
        .hass=${this.hass}
        header="Matter"
        back-path="/config/connectivity"
      >
        <div class="page">
          ${this._renderHero(isOnline, deviceIds.size)}
          <div class="columns">
            <div class="column">
              ${this._renderAddCard()}
              ${this._renderMoreCard(deviceIds.size, entityCount)}
            </div>
            ${this._renderDevicesCard(deviceIds)}
          </div>
          <div class="note">
            <ha-svg-icon .path=${mdiInformationOutline}></ha-svg-icon>
            <span>
              ${this.hass.localize(
                "ui.panel.config.matter.panel.multi_home_note"
              )}
            </span>
          </div>
        </div>
      </hass-subpage>
    `;
  }

  private _addDevice() {
    showMatterAddDeviceDialog(this);
  }

  /** The networks the devices report using, as readable text. */
  private _networkNames(): string | undefined {
    const types = new Set(
      (this._topologyNodes ?? [])
        .filter(
          (node) =>
            node.ha_device_id &&
            node.network_type &&
            node.network_type !== "unknown"
        )
        .map((node) => node.network_type)
    );
    if (!types.size) {
      return undefined;
    }
    const names = [...types].map(
      (type) =>
        this.hass.localize(
          `ui.panel.config.matter.panel.network_${type}` as any
        ) || type
    );
    return new Intl.ListFormat(this.hass.locale.language, {
      style: "long",
      type: "conjunction",
    }).format(names);
  }

  private _renderHero(isOnline: boolean, deviceCount: number) {
    const facts: string[] = [];
    const networks = this._networkNames();
    if (networks) {
      facts.push(
        this.hass.localize("ui.panel.config.matter.panel.fact_networks", {
          networks,
        })
      );
    }
    if (this._asyncDataLoaded && this._offlineDevices > 0) {
      facts.push(
        `(${this.hass.localize("ui.panel.config.matter.panel.devices_offline", {
          count: this._offlineDevices,
        })})`
      );
    }
    const tone = !isOnline
      ? "error"
      : this._offlineDevices > 0
        ? "warning"
        : "ok";
    return html`
      <section class="hero ${tone}">
        <div class="hero-text">
          <div class="eyebrow">
            <img
              class="logo"
              alt=""
              crossorigin="anonymous"
              referrerpolicy="no-referrer"
              src=${brandsUrl(
                {
                  domain: "matter",
                  type: "icon",
                  darkOptimized: this.hass.themes?.darkMode,
                },
                this.hass.auth.data.hassUrl
              )}
            />
            <span>Matter</span>
          </div>
          <h2>
            ${
              isOnline
                ? this.hass.localize("ui.panel.config.matter.panel.devices", {
                    count: deviceCount,
                  })
                : this.hass.localize(
                    "ui.panel.config.matter.panel.status_offline"
                  )
            }
          </h2>
          <p class="fade-in">${facts.join(" ")}</p>
        </div>
        <div class="hero-actions">
          <ha-button size="l" @click=${this._addDevice}>
            <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
            ${this.hass.localize("ui.panel.config.matter.panel.add_device")}
          </ha-button>
        </div>
      </section>
    `;
  }

  private _renderAddCard() {
    return html`
      <section class="card">
        <h3>
          ${this.hass.localize("ui.panel.config.matter.panel.add_card_title")}
        </h3>
        <p class="hint">
          ${this.hass.localize(
            "ui.panel.config.matter.panel.add_card_description"
          )}
        </p>
        <div class="actions">
          <ha-button appearance="filled" @click=${this._addDevice}>
            <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
            ${this.hass.localize("ui.panel.config.matter.panel.add_device")}
          </ha-button>
        </div>
      </section>
    `;
  }

  private _renderDevicesCard(deviceIds: Set<string>) {
    const devices = this._matterDevices(this.hass.devices, deviceIds);
    const nodeByDevice = new Map(
      (this._topologyNodes ?? [])
        .filter((node) => node.ha_device_id)
        .map((node) => [node.ha_device_id as string, node])
    );
    const visible = this._showAllDevices
      ? devices
      : devices.slice(0, COLLAPSED_DEVICE_COUNT);
    return html`
      <section class="card">
        <h3>
          ${this.hass.localize(
            "ui.panel.config.matter.panel.devices_card_title"
          )}
        </h3>
        ${
          devices.length
            ? html`<ha-list-nav
                .ariaLabel=${this.hass.localize(
                  "ui.panel.config.matter.panel.devices_card_title"
                )}
              >
                ${visible.map((device) => {
                  const node = nodeByDevice.get(device.id);
                  const networkType = node?.network_type;
                  return html`
                    <ha-list-item-button
                      href=${`/config/devices/device/${device.id}`}
                    >
                      <div slot="headline">
                        ${computeDeviceNameDisplay(device, this.hass.localize)}
                      </div>
                      ${
                        networkType && networkType !== "unknown"
                          ? html`<div slot="supporting-text">
                              ${
                                this.hass.localize(
                                  `ui.panel.config.matter.panel.network_${networkType}` as any
                                ) || networkType
                              }
                            </div>`
                          : nothing
                      }
                      ${
                        node && node.available !== undefined
                          ? html`<span
                              slot="end"
                              class="tag ${node.available ? "online" : "offline"}"
                            >
                              ${this.hass.localize(
                                `ui.panel.config.matter.panel.status_${node.available ? "online" : "offline"}`
                              )}
                            </span>`
                          : nothing
                      }
                    </ha-list-item-button>
                  `;
                })}
              </ha-list-nav>`
            : html`<p class="hint">
                ${this.hass.localize(
                  "ui.panel.config.matter.panel.devices_empty"
                )}
              </p>`
        }
        ${
          devices.length > COLLAPSED_DEVICE_COUNT
            ? html`<div class="actions">
                <ha-button
                  appearance="plain"
                  size="s"
                  @click=${this._toggleShowAll}
                >
                  ${
                    this._showAllDevices
                      ? this.hass.localize(
                          "ui.panel.config.matter.panel.show_fewer"
                        )
                      : this.hass.localize(
                          "ui.panel.config.matter.panel.show_all",
                          { count: devices.length }
                        )
                  }
                </ha-button>
              </div>`
            : nothing
        }
      </section>
    `;
  }

  private _toggleShowAll() {
    this._showAllDevices = !this._showAllDevices;
  }

  private _renderMoreCard(deviceCount: number, entityCount: number) {
    return html`
      <section class="card">
        <ha-list-nav
          .ariaLabel=${this.hass.localize(
            "ui.panel.config.matter.panel.my_network_title"
          )}
        >
          <ha-list-item-button
            href=${`/config/devices/dashboard?historyBack=1&config_entry=${this._configEntry?.entry_id}&status=disabled`}
          >
            <ha-svg-icon slot="start" .path=${mdiDevices}></ha-svg-icon>
            <div slot="headline">
              ${this.hass.localize(
                "ui.panel.config.matter.panel.device_count",
                { count: deviceCount }
              )}
            </div>
            <ha-icon-next slot="end"></ha-icon-next>
          </ha-list-item-button>
          <ha-list-item-button
            href=${`/config/entities?historyBack=1&config_entry=${this._configEntry?.entry_id}`}
          >
            <ha-svg-icon slot="start" .path=${mdiShape}></ha-svg-icon>
            <div slot="headline">
              ${this.hass.localize(
                "ui.panel.config.matter.panel.entity_count",
                { count: entityCount }
              )}
            </div>
            <ha-icon-next slot="end"></ha-icon-next>
          </ha-list-item-button>
          <ha-list-item-button href="/config/matter/visualization">
            <ha-svg-icon slot="start" .path=${mdiVectorPolyline}></ha-svg-icon>
            <div slot="headline">
              ${this.hass.localize("ui.panel.config.matter.panel.show_map")}
            </div>
            <ha-icon-next slot="end"></ha-icon-next>
          </ha-list-item-button>
          <ha-list-item-button href="/config/matter/options">
            <ha-svg-icon slot="start" .path=${mdiTune}></ha-svg-icon>
            <div slot="headline">
              ${this.hass.localize("ui.panel.config.matter.panel.options_title")}
            </div>
            <div slot="supporting-text">
              ${this.hass.localize(
                "ui.panel.config.matter.panel.options_description"
              )}
            </div>
            <ha-icon-next slot="end"></ha-icon-next>
          </ha-list-item-button>
          ${
            isComponentLoaded(this.hass.config, "thread")
              ? html`<ha-list-item-button href="/config/thread">
                  <ha-svg-icon slot="start" .path=${THREAD_ICON}></ha-svg-icon>
                  <div slot="headline">
                    ${this.hass.localize(
                      "ui.panel.config.matter.panel.thread_panel"
                    )}
                  </div>
                  <div slot="supporting-text">
                    ${this.hass.localize(
                      "ui.panel.config.matter.panel.thread_panel_description"
                    )}
                  </div>
                  <ha-icon-next slot="end"></ha-icon-next>
                </ha-list-item-button>`
              : nothing
          }
        </ha-list-nav>
      </section>
    `;
  }

  private async _fetchConfigEntry(): Promise<void> {
    const configEntries = await getConfigEntries(this.hass, {
      domain: "matter",
    });
    this._configEntry = configEntries.find(
      (entry) => entry.disabled_by === null && entry.source !== "ignore"
    );

    if (!this._configEntry) {
      return;
    }

    const deviceIds = this._matterDeviceIds(
      this.hass.devices,
      this._configEntry.entry_id
    );

    try {
      const topology = await fetchMatterNetworkTopology(this.hass);

      this._topologyNodes = topology.nodes;
      this._offlineDevices = topology.nodes.filter(
        (node) =>
          node.ha_device_id &&
          deviceIds.has(node.ha_device_id) &&
          node.available === false
      ).length;
    } catch {
      this._offlineDevices = 0;
    } finally {
      this._asyncDataLoaded = true;
    }
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      animationStyles,
      css`
        .page {
          box-sizing: border-box;
          max-width: 1100px;
          margin: 0 auto;
          padding: var(--ha-space-4) var(--ha-space-8)
            calc(var(--ha-space-8) + var(--safe-area-inset-bottom, 0px));
        }

        .hero {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-4) var(--ha-space-6);
          margin-bottom: var(--ha-space-4);
          padding: var(--ha-space-6);
          border-radius: var(--ha-border-radius-3xl);
          --hero-tone: var(--primary-color);
          background: color-mix(
            in srgb,
            var(--hero-tone) 16%,
            var(--card-background-color)
          );
        }

        .hero.warning {
          --hero-tone: var(--warning-color);
        }

        .hero.error {
          --hero-tone: var(--error-color);
        }

        .hero-text {
          flex: 1;
          min-width: min(260px, 100%);
        }

        .eyebrow {
          display: flex;
          align-items: center;
          gap: var(--ha-space-2);
          font-size: var(--ha-font-size-s);
          font-weight: var(--ha-font-weight-medium);
          color: var(--secondary-text-color);
        }

        .eyebrow .logo {
          width: 24px;
          height: 24px;
          object-fit: contain;
        }

        h2 {
          margin: var(--ha-space-2) 0 var(--ha-space-1);
          font-family: var(--ha-font-family-heading, inherit);
          font-size: var(--ha-font-size-3xl);
          font-weight: var(--ha-font-weight-medium);
          line-height: var(--ha-line-height-condensed);
        }

        .hero p {
          margin: 0;
          color: var(--secondary-text-color);
          line-height: var(--ha-line-height-normal);
        }

        .hero-actions {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
          min-width: min(220px, 100%);
        }

        .columns {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          align-items: start;
          gap: var(--ha-space-4);
          margin-bottom: var(--ha-space-4);
        }

        .column {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-4);
        }

        @media (max-width: 800px) {
          .columns {
            grid-template-columns: minmax(0, 1fr);
          }

          .page {
            padding: var(--ha-space-2) var(--ha-space-3) var(--ha-space-6);
          }
        }

        .card {
          box-sizing: border-box;
          padding: var(--ha-space-4) var(--ha-space-5);
          border-radius: var(--ha-border-radius-3xl);
          background: var(--card-background-color);
          overflow: hidden;
        }

        h3 {
          margin: 0 0 var(--ha-space-2);
          font-size: var(--ha-font-size-l);
          font-weight: var(--ha-font-weight-medium);
        }

        .hint {
          margin: 0 0 var(--ha-space-3);
          color: var(--secondary-text-color);
        }

        .actions {
          display: flex;
          justify-content: flex-end;
        }

        .note {
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
          padding: var(--ha-space-4);
          border-radius: var(--ha-border-radius-xl);
          background: var(--secondary-background-color);
          color: var(--secondary-text-color);
        }

        .note ha-svg-icon {
          flex: none;
        }

        .tag {
          padding: var(--ha-space-1) var(--ha-space-2);
          border-radius: var(--ha-border-radius-md);
          font-size: var(--ha-font-size-s);
          font-weight: var(--ha-font-weight-medium);
          background: color-mix(
            in srgb,
            var(--success-color) 22%,
            var(--card-background-color)
          );
          color: var(--primary-text-color);
        }

        .tag.offline {
          background: color-mix(
            in srgb,
            var(--error-color) 22%,
            var(--card-background-color)
          );
        }

        .fade-in {
          animation: fade-in var(--ha-animation-duration-slow) ease-in;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "matter-config-dashboard": MatterConfigDashboard;
  }
}
