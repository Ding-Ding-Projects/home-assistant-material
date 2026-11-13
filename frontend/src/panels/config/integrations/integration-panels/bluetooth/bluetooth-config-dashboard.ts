import {
  mdiAccessPoint,
  mdiAlertCircleOutline,
  mdiBroadcast,
  mdiCheck,
  mdiCloseCircleOutline,
  mdiLinkVariant,
  mdiBluetooth,
  mdiVectorPolyline,
} from "@mdi/js";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import type { CSSResultGroup, TemplateResult } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { styleMap } from "lit/directives/style-map";
import "../../../../../components/ha-button";
import "../../../../../components/ha-card";
import "../../../../../components/ha-icon-next";
import "../../../../../components/ha-svg-icon";
import "../../../../../components/item/ha-list-item-button";
import "../../../../../components/list/ha-list-nav";
import type {
  BluetoothAllocationsData,
  BluetoothDeviceData,
  BluetoothScannersDetails,
  BluetoothScannerState,
} from "../../../../../data/bluetooth";
import {
  isScannerStateMismatch,
  subscribeBluetoothAdvertisements,
  subscribeBluetoothConnectionAllocations,
  subscribeBluetoothScannerState,
  subscribeBluetoothScannersDetails,
} from "../../../../../data/bluetooth";
import type { ConfigEntry } from "../../../../../data/config_entries";
import { getConfigEntries } from "../../../../../data/config_entries";
import "../../../../../layouts/hass-subpage";
import "../ha-protocol-stat-tiles";
import type { ProtocolStatTile } from "../ha-protocol-stat-tiles";
import { haStyle } from "../../../../../resources/styles";
import type { HomeAssistant, Route } from "../../../../../types";

@customElement("bluetooth-config-dashboard")
export class BluetoothConfigDashboard extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public route!: Route;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @property({ attribute: "is-wide", type: Boolean }) public isWide = false;

  @state() private _configEntries: ConfigEntry[] = [];

  @state() private _connectionAllocationData: BluetoothAllocationsData[] = [];

  @state() private _scannerStates: Record<string, BluetoothScannerState> = {};

  @state() private _advertisementData: BluetoothDeviceData[] = [];

  @state() private _scanners: BluetoothScannersDetails = {};

  private _unsubScanners?: UnsubscribeFunc;

  private _unsubConnectionAllocations?: (() => Promise<void>) | undefined;

  private _unsubScannerState?: (() => Promise<void>) | undefined;

  private _unsubAdvertisements?: UnsubscribeFunc;

  public connectedCallback(): void {
    super.connectedCallback();
    if (this.hass) {
      this._loadConfigEntries();
      this._subscribeBluetoothConnectionAllocations();
      this._subscribeBluetoothScannerState();
      this._subscribeBluetoothAdvertisements();
      this._subscribeBluetoothScanners();
    }
  }

  private _subscribeBluetoothScanners(): void {
    if (this._unsubScanners) {
      return;
    }
    this._unsubScanners = subscribeBluetoothScannersDetails(
      this.hass.connection,
      (scanners) => {
        this._scanners = scanners;
      }
    );
  }

  private async _loadConfigEntries(): Promise<void> {
    this._configEntries = await getConfigEntries(this.hass, {
      domain: "bluetooth",
    });
  }

  private async _subscribeBluetoothConnectionAllocations(): Promise<void> {
    if (this._unsubConnectionAllocations) {
      return;
    }
    this._unsubConnectionAllocations =
      await subscribeBluetoothConnectionAllocations(
        this.hass.connection,
        (data) => {
          this._connectionAllocationData = data;
        }
      );
  }

  private async _subscribeBluetoothScannerState(): Promise<void> {
    if (this._unsubScannerState) {
      return;
    }
    this._unsubScannerState = await subscribeBluetoothScannerState(
      this.hass.connection,
      (scannerState) => {
        this._scannerStates = {
          ...this._scannerStates,
          [scannerState.source]: scannerState,
        };
      }
    );
  }

  private _subscribeBluetoothAdvertisements(): void {
    if (this._unsubAdvertisements) {
      return;
    }
    this._unsubAdvertisements = subscribeBluetoothAdvertisements(
      this.hass.connection,
      (data) => {
        this._advertisementData = data;
      }
    );
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    if (this._unsubConnectionAllocations) {
      this._unsubConnectionAllocations();
      this._unsubConnectionAllocations = undefined;
    }
    if (this._unsubScannerState) {
      this._unsubScannerState();
      this._unsubScannerState = undefined;
    }
    if (this._unsubAdvertisements) {
      this._unsubAdvertisements();
      this._unsubAdvertisements = undefined;
    }
    if (this._unsubScanners) {
      this._unsubScanners();
      this._unsubScanners = undefined;
    }
  }

  protected render(): TemplateResult {
    const enabledEntries = this._configEntries.filter(
      (e) => e.disabled_by === null
    );
    const adapterCount = enabledEntries.length;
    const usedSlots = this._connectionAllocationData.reduce(
      (sum, a) => sum + (a.slots - a.free),
      0
    );
    const hasMismatch = Object.values(this._scannerStates).some(
      isScannerStateMismatch
    );
    const isOffline = adapterCount === 0;
    const status = isOffline ? "offline" : hasMismatch ? "warning" : "online";
    const statusIcon = isOffline
      ? mdiCloseCircleOutline
      : hasMismatch
        ? mdiAlertCircleOutline
        : mdiCheck;

    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        .header=${this.hass.localize("ui.panel.config.bluetooth.title")}
        back-path="/config/connectivity"
      >
        <div class="page">
          <section class="hero">
            <div class="hero-text">
              <h1>${this.hass.localize("ui.panel.config.bluetooth.title")}</h1>
              <p>
                ${this.hass.localize("ui.panel.config.bluetooth.summary", {
                  adapters: adapterCount,
                  devices: this._advertisementData.length,
                })}
              </p>
            </div>
            <span class="chip ${status}">
              <ha-svg-icon .path=${statusIcon}></ha-svg-icon>
              ${this.hass.localize(`ui.panel.config.bluetooth.status_${status}`)}
            </span>
          </section>
          <ha-protocol-stat-tiles
            class="tiles"
            .tiles=${
              [
                {
                  label: this.hass.localize(
                    "ui.panel.config.bluetooth.tile_adapters"
                  ),
                  value: adapterCount,
                  icon: mdiBluetooth,
                  tone: "primary",
                },
                {
                  label: this.hass.localize(
                    "ui.panel.config.bluetooth.tile_heard"
                  ),
                  value: this._advertisementData.length,
                  icon: mdiBroadcast,
                  tone: "tertiary",
                },
                {
                  label: this.hass.localize(
                    "ui.panel.config.bluetooth.tile_connected"
                  ),
                  value: usedSlots,
                  icon: mdiLinkVariant,
                  tone: "success",
                },
              ] satisfies ProtocolStatTile[]
            }
          ></ha-protocol-stat-tiles>
          ${this._renderAdapters()}

          <ha-card class="network-card">
            <div class="card-header">
              ${this.hass.localize("ui.panel.config.bluetooth.my_network")}
              <ha-button
                appearance="filled"
                href="/config/bluetooth/visualization"
              >
                <ha-svg-icon
                  slot="start"
                  .path=${mdiVectorPolyline}
                ></ha-svg-icon>
                ${this.hass.localize("ui.panel.config.bluetooth.show_map")}
              </ha-button>
            </div>
            <div class="card-content network-card-content">
              <ha-list-nav
                .ariaLabel=${this.hass.localize(
                  "ui.panel.config.bluetooth.my_network"
                )}
              >
                <ha-list-item-button href="/config/bluetooth/adapter-info">
                  <ha-svg-icon
                    slot="start"
                    .path=${mdiAccessPoint}
                  ></ha-svg-icon>
                  <div slot="headline">
                    ${this.hass.localize(
                      "ui.panel.config.bluetooth.adapters_count",
                      { count: adapterCount }
                    )}
                  </div>
                  <ha-icon-next slot="end"></ha-icon-next>
                </ha-list-item-button>

                <ha-list-item-button
                  href="/config/bluetooth/connection-monitor"
                >
                  <ha-svg-icon
                    slot="start"
                    .path=${mdiLinkVariant}
                  ></ha-svg-icon>
                  <div slot="headline">
                    ${this.hass.localize(
                      "ui.panel.config.bluetooth.connections_count",
                      { count: usedSlots }
                    )}
                  </div>
                  <ha-icon-next slot="end"></ha-icon-next>
                </ha-list-item-button>

                <ha-list-item-button
                  href="/config/bluetooth/advertisement-monitor"
                >
                  <ha-svg-icon slot="start" .path=${mdiBroadcast}></ha-svg-icon>
                  <div slot="headline">
                    ${this.hass.localize(
                      "ui.panel.config.bluetooth.advertisements_count",
                      { count: this._advertisementData.length }
                    )}
                  </div>
                  <ha-icon-next slot="end"></ha-icon-next>
                </ha-list-item-button>
              </ha-list-nav>
            </div>
          </ha-card>
        </div>
      </hass-subpage>
    `;
  }

  private _renderAdapters() {
    const sources = new Set<string>([
      ...this._connectionAllocationData.map((a) => a.source),
      ...Object.keys(this._scanners),
    ]);
    if (!sources.size) {
      return nothing;
    }
    return html`<div class="adapters">
      ${[...sources].map((source) => {
        const allocation = this._connectionAllocationData.find(
          (a) => a.source === source
        );
        const scanner = this._scanners[source];
        const scannerState = this._scannerStates[source];
        const mismatch = scannerState
          ? isScannerStateMismatch(scannerState)
          : false;
        const used = allocation ? allocation.slots - allocation.free : 0;
        const slots = allocation?.slots ?? 0;
        return html`<ha-card class="adapter">
          <div class="card-content">
            <div class="adapter-head">
              <ha-svg-icon .path=${mdiBluetooth}></ha-svg-icon>
              <div class="adapter-name">
                <strong>${scanner?.name || source}</strong>
                <span>${scanner?.adapter || source}</span>
              </div>
              ${
                scannerState
                  ? html`<span class="chip ${mismatch ? "warning" : "online"}"
                      >${this.hass.localize(
                        mismatch
                          ? "ui.panel.config.bluetooth.status_warning"
                          : "ui.panel.config.bluetooth.listening"
                      )}</span
                    >`
                  : nothing
              }
            </div>
            ${
              slots
                ? html`<p class="slots">
                      ${this.hass.localize(
                        "ui.panel.config.bluetooth.connections_in_use",
                        { used, total: slots }
                      )}
                    </p>
                    <div class="bar">
                      <div
                        class="bar-fill"
                        style=${styleMap({
                          width: `${Math.round((used / slots) * 100)}%`,
                        })}
                      ></div>
                    </div>`
                : html`<p class="slots">
                    ${this.hass.localize(
                      "ui.panel.config.bluetooth.no_connection_slots"
                    )}
                  </p>`
            }
          </div>
        </ha-card>`;
      })}
    </div>`;
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        .page {
          box-sizing: border-box;
          max-width: 1100px;
          margin: 0 auto;
          padding: var(--ha-space-4) var(--ha-space-8) var(--ha-space-8);
        }
        :host([narrow]) .page {
          padding: var(--ha-space-2) var(--ha-space-3) var(--ha-space-6);
        }
        .tiles {
          margin-bottom: var(--ha-space-4);
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
          --chip-color: var(--primary-color);
          --mdc-icon-size: 16px;
        }
        .chip.online {
          --chip-color: var(--success-color);
        }
        .chip.warning {
          --chip-color: var(--warning-color);
        }
        .chip.offline {
          --chip-color: var(--error-color);
        }
        .adapters {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: var(--ha-space-4);
          margin-bottom: var(--ha-space-4);
        }
        ha-card {
          overflow: hidden;
          border-radius: var(--ha-border-radius-3xl);
        }
        .adapter-head {
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
        }
        .adapter-name {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
          overflow-wrap: anywhere;
        }
        .adapter-name span {
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-s);
        }
        .slots {
          margin: var(--ha-space-3) 0 var(--ha-space-2);
          font-weight: var(--ha-font-weight-medium);
        }
        .bar {
          height: 8px;
          border-radius: 4px;
          background: var(--divider-color);
          overflow: hidden;
        }
        .bar-fill {
          height: 100%;
          background: var(--primary-color);
        }
        .network-card .card-content {
          padding: 0;
        }
        .network-card .card-header {
          display: flex;
          flex-wrap: wrap;
          gap: var(--ha-space-2);
          align-items: center;
          justify-content: space-between;
          padding-bottom: var(--ha-space-2);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "bluetooth-config-dashboard": BluetoothConfigDashboard;
  }
}
