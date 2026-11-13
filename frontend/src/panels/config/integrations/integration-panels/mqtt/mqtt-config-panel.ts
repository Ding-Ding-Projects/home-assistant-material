import {
  mdiAlertCircleOutline,
  mdiCheck,
  mdiCog,
  mdiDevices,
  mdiMessageText,
  mdiPound,
  mdiShape,
  mdiSpeedometer,
  mdiTune,
} from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { storage } from "../../../../../common/decorators/storage";
import "../../../../../components/ha-button";
import "../../../../../components/ha-card";
import "../../../../../components/ha-code-editor";
import "../../../../../components/ha-empty-state";
import "../../../../../components/ha-icon-next";
import type { HaSelectSelectEvent } from "../../../../../components/ha-select";
import "../../../../../components/ha-svg-icon";
import "../../../../../components/ha-switch";
import "../../../../../components/input/ha-input";
import "../../../../../components/item/ha-list-item-button";
import "../../../../../components/list/ha-list-base";
import "../../../../../components/list/ha-list-nav";
import type { ConfigEntry } from "../../../../../data/config_entries";
import { getConfigEntries } from "../../../../../data/config_entries";
import { fetchIntegrationManifest } from "../../../../../data/integration";
import type { Action } from "../../../../../data/script";
import { callExecuteScript } from "../../../../../data/service";
import { showConfigFlowDialog } from "../../../../../dialogs/config-flow/show-dialog-config-flow";
import { showOptionsFlowDialog } from "../../../../../dialogs/config-flow/show-dialog-options-flow";
import "../../../../../layouts/hass-subpage";
import { mdiMqttLogo } from "../../../../../resources/mqtt-logo-svg";
import { haStyle } from "../../../../../resources/styles";
import type { HomeAssistant } from "../../../../../types";
import { showToast } from "../../../../../util/toast";
import "../ha-protocol-stat-tiles";
import type { ProtocolStatTile } from "../ha-protocol-stat-tiles";
import "./mqtt-subscribe-card";
import type { MqttListenStats } from "./mqtt-subscribe-card";

const qosLevel = ["0", "1", "2"];

@customElement("mqtt-config-panel")
export class MQTTConfigPanel extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @state()
  @storage({
    key: "panel-dev-mqtt-topic-ls",
    state: true,
    subscribe: false,
  })
  private _topic = "";

  @state()
  @storage({
    key: "panel-dev-mqtt-payload-ls",
    state: true,
    subscribe: false,
  })
  private _payload = "";

  @state()
  @storage({
    key: "panel-dev-mqtt-qos-ls",
    state: true,
    subscribe: false,
  })
  private _qos = "0";

  @state()
  @storage({
    key: "panel-dev-mqtt-retain-ls",
    state: true,
    subscribe: false,
  })
  private _retain = false;

  @state() private _configEntry?: ConfigEntry | null;

  // Measured by the listener on this page; unknown until it has heard a message
  @state() private _listenStats?: MqttListenStats;

  protected firstUpdated(changedProperties: PropertyValues<this>) {
    super.firstUpdated(changedProperties);
    if (this.hass) {
      this._fetchConfigEntry();
    }
  }

  private _MQTTDeviceIds = memoizeOne(
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

  protected render(): TemplateResult | typeof nothing {
    if (this._configEntry === undefined) {
      return nothing;
    }
    if (this._configEntry === null) {
      return this._renderNotConfigured();
    }
    const isOnline = this._configEntry.state === "loaded";
    const deviceIds = this._MQTTDeviceIds(
      this.hass.devices,
      this._configEntry.entry_id
    );
    const entityCount = this._entityCount(this.hass.entities, deviceIds);

    return html`
      <hass-subpage
        .narrow=${this.narrow}
        .hass=${this.hass}
        header="MQTT"
        back-path="/config/integrations/integration/mqtt"
        has-fab
      >
        <div class="page">
          ${this._renderHero(isOnline, deviceIds.size)}
          <ha-protocol-stat-tiles
            class="tiles"
            .tiles=${this._statTiles(deviceIds.size, entityCount)}
          ></ha-protocol-stat-tiles>
          <div class="grid">
            ${this._renderPublishCard()}
            <mqtt-subscribe-card
              .hass=${this.hass}
              @mqtt-listen-stats=${this._listenStatsChanged}
            ></mqtt-subscribe-card>
          </div>
          <section class="broker">
            <h2>${this.hass.localize("ui.panel.config.mqtt.broker_title")}</h2>
            <div class="broker-cards">
              ${this._renderMyNetworkCard(deviceIds.size, entityCount)}
              ${this._renderNavigationCard()}
            </div>
          </section>
        </div>
      </hass-subpage>
    `;
  }

  private _listenStatsChanged(ev: CustomEvent<MqttListenStats>) {
    this._listenStats = ev.detail;
  }

  private _statTiles(deviceCount: number, entityCount: number) {
    const localize = this.hass.localize;
    const tiles: ProtocolStatTile[] = [
      {
        label: localize("ui.panel.config.mqtt.tile_devices"),
        value: deviceCount,
        icon: mdiDevices,
        tone: "tertiary",
      },
      {
        label: localize("ui.panel.config.mqtt.tile_entities"),
        value: entityCount,
        icon: mdiShape,
        tone: "primary",
      },
    ];
    const stats = this._listenStats;
    if (stats) {
      tiles.push(
        {
          label: localize("ui.panel.config.mqtt.tile_topics_heard"),
          value: stats.topics,
          icon: mdiPound,
          tone: "success",
        },
        {
          label: localize("ui.panel.config.mqtt.tile_messages_heard"),
          value: stats.count,
          icon: mdiMessageText,
          tone: "warning",
        }
      );
      // An average over the time the listener has run, from the first start
      if (stats.elapsedMs >= 1000) {
        tiles.push({
          label: localize("ui.panel.config.mqtt.tile_rate"),
          value: `${(stats.count / (stats.elapsedMs / 1000)).toFixed(1)}/s`,
          icon: mdiSpeedometer,
          tone: "primary",
        });
      }
    }
    return tiles;
  }

  private _renderNotConfigured() {
    return html`
      <hass-subpage
        .narrow=${this.narrow}
        .hass=${this.hass}
        header="MQTT"
        back-path="/config/integrations/integration/mqtt"
      >
        <ha-empty-state
          .icon=${mdiMqttLogo}
          .heading=${this.hass.localize(
            "ui.panel.config.mqtt.not_configured_title"
          )}
          .description=${this.hass.localize(
            "ui.panel.config.mqtt.not_configured_description"
          )}
        >
          <ha-button appearance="plain" @click=${this._setUp}>
            ${this.hass.localize("ui.panel.config.mqtt.set_up")}
          </ha-button>
        </ha-empty-state>
      </hass-subpage>
    `;
  }

  private _renderHero(isOnline: boolean, deviceCount: number) {
    return html`
      <section class="hero">
        <div class="hero-text">
          <h1>${this.hass.localize("ui.panel.config.mqtt.title")}</h1>
          <p>
            ${this.hass.localize(
              isOnline
                ? "ui.panel.config.mqtt.summary_connected"
                : "ui.panel.config.mqtt.summary_offline",
              { count: deviceCount }
            )}
          </p>
        </div>
        <span class="chip ${isOnline ? "success" : "error"}">
          <ha-svg-icon
            .path=${isOnline ? mdiCheck : mdiAlertCircleOutline}
          ></ha-svg-icon>
          ${this.hass.localize(
            `ui.panel.config.mqtt.status_${isOnline ? "connected" : "offline"}`
          )}
        </span>
        <ha-button appearance="outlined" @click=${this._openConfigFlow}>
          <ha-svg-icon slot="start" .path=${mdiCog}></ha-svg-icon>
          ${this.hass.localize("ui.panel.config.mqtt.reconfigure")}
        </ha-button>
      </section>
    `;
  }

  private _renderMyNetworkCard(deviceCount: number, entityCount: number) {
    return html`
      <ha-card class="nav-card">
        <div class="card-header">
          ${this.hass.localize("ui.panel.config.mqtt.my_network_title")}
        </div>
        <div class="card-content">
          <ha-list-nav
            .ariaLabel=${this.hass.localize(
              "ui.panel.config.mqtt.my_network_title"
            )}
          >
            <ha-list-item-button
              href=${`/config/devices/dashboard?historyBack=1&config_entry=${this._configEntry?.entry_id}&status=disabled`}
            >
              <ha-svg-icon slot="start" .path=${mdiDevices}></ha-svg-icon>
              <div slot="headline">
                ${this.hass.localize("ui.panel.config.mqtt.device_count", {
                  count: deviceCount,
                })}
              </div>
              <ha-icon-next slot="end"></ha-icon-next>
            </ha-list-item-button>
            <ha-list-item-button
              href=${`/config/entities?historyBack=1&config_entry=${this._configEntry?.entry_id}`}
            >
              <ha-svg-icon slot="start" .path=${mdiShape}></ha-svg-icon>
              <div slot="headline">
                ${this.hass.localize("ui.panel.config.mqtt.entity_count", {
                  count: entityCount,
                })}
              </div>
              <ha-icon-next slot="end"></ha-icon-next>
            </ha-list-item-button>
          </ha-list-nav>
        </div>
      </ha-card>
    `;
  }

  private _renderNavigationCard() {
    return html`
      <ha-card class="nav-card">
        <div class="card-content">
          <ha-list-base>
            <ha-list-item-button @click=${this._openOptionFlow}>
              <ha-svg-icon slot="start" .path=${mdiTune}></ha-svg-icon>
              <div slot="headline">
                ${this.hass.localize("ui.panel.config.mqtt.option_flow")}
              </div>
              <div slot="supporting-text">
                ${this.hass.localize(
                  "ui.panel.config.mqtt.option_flow_description"
                )}
              </div>
              <ha-icon-next slot="end"></ha-icon-next>
            </ha-list-item-button>
            <ha-list-item-button @click=${this._openConfigFlow}>
              <ha-svg-icon slot="start" .path=${mdiMqttLogo}></ha-svg-icon>
              <div slot="headline">
                ${this.hass.localize("ui.panel.config.mqtt.config_flow")}
              </div>
              <div slot="supporting-text">
                ${this.hass.localize(
                  "ui.panel.config.mqtt.config_flow_description"
                )}
              </div>
              <ha-icon-next slot="end"></ha-icon-next>
            </ha-list-item-button>
          </ha-list-base>
        </div>
      </ha-card>
    `;
  }

  private _renderPublishCard() {
    return html`
      <ha-card
        class="publish-card"
        .header=${this.hass.localize(
          "ui.panel.config.mqtt.description_publish"
        )}
      >
        <div class="card-content">
          <div class="panel-dev-mqtt-fields">
            <ha-input
              .label=${this.hass.localize("ui.panel.config.mqtt.topic")}
              .value=${this._topic}
              @change=${this._handleTopic}
            ></ha-input>
            <ha-select
              .label=${this.hass.localize("ui.panel.config.mqtt.qos")}
              .value=${this._qos}
              @selected=${this._handleQos}
              .options=${qosLevel}
            >
            </ha-select>
            <ha-switch @change=${this._handleRetain} .checked=${this._retain}
              >${this.hass!.localize("ui.panel.config.mqtt.retain")}</ha-switch
            >
          </div>
          <p>${this.hass.localize("ui.panel.config.mqtt.payload")}</p>
          <ha-code-editor
            mode="jinja2"
            autocomplete-entities
            autocomplete-icons
            .value=${this._payload}
            @value-changed=${this._handlePayload}
            dir="ltr"
          ></ha-code-editor>
        </div>
        <div class="card-actions">
          <ha-button appearance="plain" @click=${this._publish}
            >${this.hass.localize("ui.panel.config.mqtt.publish")}</ha-button
          >
        </div>
      </ha-card>
    `;
  }

  private async _fetchConfigEntry(): Promise<void> {
    const configEntries = await getConfigEntries(this.hass, {
      domain: "mqtt",
    });
    const activeEntry = configEntries.find(
      (entry) => entry.disabled_by === null && entry.source !== "ignore"
    );
    this._configEntry = activeEntry ?? null;
  }

  private _handleTopic(ev: InputEvent) {
    this._topic = (ev.target as HTMLInputElement).value;
  }

  private _handlePayload(ev: CustomEvent) {
    this._payload = ev.detail.value;
  }

  private _handleQos(ev: HaSelectSelectEvent) {
    const newValue = ev.detail.value;
    if (Number(newValue) >= 0 && newValue !== this._qos) {
      this._qos = newValue;
    }
  }

  private _handleRetain(ev: CustomEvent) {
    this._retain = (ev.target! as any).checked;
  }

  private _publish(): void {
    if (!this.hass) {
      return;
    }

    const script: Action[] = [
      {
        action: "mqtt.publish",
        data: {
          topic: this._topic,
          payload: this._payload,
          qos: parseInt(this._qos),
          retain: this._retain,
        },
      },
    ];

    callExecuteScript(this.hass, script).catch((err) =>
      showToast(this, {
        message: err.message,
      })
    );
  }

  private async _openOptionFlow() {
    showOptionsFlowDialog(this, this._configEntry!);
  }

  private _openConfigFlow = async () => {
    if (!this._configEntry) {
      return;
    }
    showConfigFlowDialog(this, {
      startFlowHandler: this._configEntry.domain,
      manifest: await fetchIntegrationManifest(
        this.hass,
        this._configEntry.domain
      ),
      entryId: this._configEntry.entry_id,
      navigateToResult: true,
    });
  };

  private _setUp = async () => {
    const manifest = await fetchIntegrationManifest(this.hass, "mqtt");
    showConfigFlowDialog(this, {
      startFlowHandler: "mqtt",
      manifest,
      dialogClosedCallback: () => this._fetchConfigEntry(),
    });
  };

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        :host {
          user-select: initial;
        }

        .page {
          box-sizing: border-box;
          max-width: 1100px;
          margin: 0 auto;
          padding: var(--ha-space-4) var(--ha-space-8)
            calc(var(--ha-space-16) + var(--safe-area-inset-bottom, 0px));
        }
        :host([narrow]) .page {
          padding: var(--ha-space-2) var(--ha-space-3)
            calc(var(--ha-space-16) + var(--safe-area-inset-bottom, 0px));
        }
        .hero {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-end;
          gap: var(--ha-space-4);
          margin-bottom: var(--ha-space-4);
        }
        .hero-text {
          flex: 1;
          min-width: 220px;
        }
        h1 {
          margin: 0;
          font-family: var(--ha-font-family-heading, inherit);
          font-size: var(--ha-font-size-4xl, 2.25rem);
          font-weight: var(--ha-font-weight-medium);
          line-height: var(--ha-line-height-condensed);
        }
        .hero p {
          margin: var(--ha-space-1) 0 0;
          color: var(--secondary-text-color);
          line-height: var(--ha-line-height-normal);
        }
        .chip {
          display: inline-flex;
          align-items: center;
          gap: var(--ha-space-1);
          padding: var(--ha-space-1) var(--ha-space-3);
          border-radius: var(--ha-border-radius-pill, 999px);
          font-size: var(--ha-font-size-s);
          font-weight: var(--ha-font-weight-medium);
          color: var(--primary-text-color);
          background: color-mix(in srgb, var(--chip-color) 22%, transparent);
          --mdc-icon-size: 16px;
        }
        .chip.success {
          --chip-color: var(--success-color);
        }
        .chip.error {
          --chip-color: var(--error-color);
        }
        .tiles {
          margin-bottom: var(--ha-space-4);
        }
        .grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: var(--ha-space-4);
          align-items: start;
        }
        :host([narrow]) .grid {
          grid-template-columns: minmax(0, 1fr);
        }
        ha-card,
        mqtt-subscribe-card {
          min-width: 0;
        }
        mqtt-subscribe-card {
          display: block;
        }
        .broker h2 {
          margin: var(--ha-space-6) 0 var(--ha-space-3);
          font-size: var(--ha-font-size-xl);
          font-weight: var(--ha-font-weight-medium);
        }
        .broker-cards {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: var(--ha-space-4);
          align-items: start;
        }
        :host([narrow]) .broker-cards {
          grid-template-columns: minmax(0, 1fr);
        }
        .nav-card {
          overflow: hidden;
        }
        .nav-card .card-content {
          padding: 0;
        }
        .nav-card .card-header {
          padding-bottom: var(--ha-space-2);
        }
        .panel-dev-mqtt-fields {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-2);
        }
        ha-select {
          width: 96px;
        }
        ha-input {
          flex: 1;
          min-width: 160px;
        }
        @media screen and (max-width: 600px) {
          ha-input {
            flex: auto;
            width: 100%;
          }
        }
        a[slot="fab"] {
          text-decoration: none;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "mqtt-config-panel": MQTTConfigPanel;
  }
}
