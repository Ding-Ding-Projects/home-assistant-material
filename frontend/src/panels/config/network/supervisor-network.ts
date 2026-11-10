import {
  mdiDeleteOutline,
  mdiEthernet,
  mdiMenuDown,
  mdiPlus,
  mdiWifi,
} from "@mdi/js";
import { css, type CSSResultGroup, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { cache } from "lit/directives/cache";
import type {
  HASSDomCurrentTargetEvent,
  HASSDomTargetEvent,
} from "../../../common/dom/fire_event";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-card";
import "../../../components/ha-dropdown";
import type { HaDropdownSelectEvent } from "../../../components/ha-dropdown";
import "../../../components/ha-dropdown-item";
import "../../../components/ha-expansion-panel";
import "../../../components/ha-icon-button";
import "../../../components/ha-list";
import "../../../components/ha-list-item";
import "../../../components/radio/ha-radio-group";
import type { HaRadioGroup } from "../../../components/radio/ha-radio-group";
import "../../../components/radio/ha-radio-option";
import "../../../components/ha-spinner";
import "../../../components/ha-svg-icon";
import "../../../components/input/ha-input";
import type { HaInput } from "../../../components/input/ha-input";
import { extractApiErrorMessage } from "../../../data/hassio/common";
import {
  type AccessPoint,
  accesspointScan,
  fetchNetworkInfo,
  formatAddress,
  type NetworkInterface,
  parseAddress,
  updateNetworkInterface,
  type WifiConfiguration,
} from "../../../data/hassio/network";
import {
  showAlertDialog,
  showConfirmationDialog,
} from "../../../dialogs/generic/show-dialog-box";
import type { HomeAssistant } from "../../../types";

const IP_VERSIONS = ["ipv4", "ipv6"];

const PREDEFINED_DNS = {
  ipv4: {
    Cloudflare: ["1.1.1.1", "1.0.0.1"],
    Google: ["8.8.8.8", "8.8.4.4"],
    Quad9: ["9.9.9.9", "149.112.112.112"],
    NextDNS: ["45.90.28.0", "45.90.30.0"],
    AdGuard: ["94.140.14.140", "94.140.14.141"],
  },
  ipv6: {
    Cloudflare: ["2606:4700:4700::1111", "2606:4700:4700::1001"],
    Google: ["2001:4860:4860::8888", "2001:4860:4860::8844"],
    Quad9: ["2620:fe::fe", "2620:fe::9"],
    NextDNS: ["2a05:d014:a000::", "2a05:d014:a001::"],
    AdGuard: ["94.140.14.140", "94.140.14.141"],
  },
};

@customElement("supervisor-network")
export class HassioNetwork extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _accessPoints: AccessPoint[] = [];

  @state() private _curTabIndex = 0;

  @state() private _dirty = false;

  @state() private _interface?: NetworkInterface;

  @state() private _interfaces!: NetworkInterface[];

  @state() private _processing = false;

  @state() private _scanning = false;

  @state() private _wifiConfiguration?: WifiConfiguration;

  @state() private _dnsMenuOpen = false;

  protected firstUpdated() {
    this._fetchNetworkInfo();
  }

  private async _fetchNetworkInfo() {
    const network = await fetchNetworkInfo(this.hass);
    this._interfaces = network.interfaces.sort((a, b) =>
      a.primary > b.primary ? -1 : 1
    );
    this._interface = { ...this._interfaces[this._curTabIndex] };
  }

  protected render() {
    if (!this._interface) {
      return nothing;
    }

    return html`
      <ha-card outlined>
        <div class="card-header">
          ${this.hass.localize("ui.panel.config.network.supervisor.title")}
        </div>
        <div class="adapters">
          ${this._interfaces.map((device, i) => this._renderAdapter(device, i))}
        </div>
        ${cache(this._renderTab())}
      </ha-card>
    `;
  }

  private _renderAdapter(device: NetworkInterface, index: number) {
    const wireless = device.type === "wireless";
    const address = device.ipv4?.address?.[0]?.split("/")[0];
    const connected = wireless ? Boolean(device.wifi?.ssid) : device.connected;
    const detail = connected
      ? [wireless ? device.wifi?.ssid : undefined, address]
          .filter(Boolean)
          .join(", ") || device.mac
      : this.hass.localize("ui.panel.config.network.supervisor.not_connected");
    return html`<button
      type="button"
      class="adapter ${this._curTabIndex === index ? "selected" : ""}"
      data-index=${index}
      aria-pressed=${this._curTabIndex === index ? "true" : "false"}
      @click=${this._handleAdapterClick}
    >
      <span class="adapter-tile"
        ><ha-svg-icon .path=${wireless ? mdiWifi : mdiEthernet}></ha-svg-icon
      ></span>
      <span class="adapter-text">
        <span class="adapter-title"
          >${this.hass.localize(
            wireless
              ? "ui.panel.config.network.supervisor.adapter_wifi"
              : "ui.panel.config.network.supervisor.adapter_ethernet",
            { name: device.interface }
          )}</span
        >
        <span class="adapter-detail">${detail}</span>
      </span>
      ${
        device.primary
          ? html`<span class="adapter-badge"
              >${this.hass.localize(
                "ui.panel.config.network.supervisor.in_use"
              )}</span
            >`
          : nothing
      }
    </button>`;
  }

  private _renderTab() {
    return html`<div class="card-content">
        ${
          this._interface?.type === "wireless"
            ? html`
                <ha-expansion-panel
                  .header=${this.hass.localize(
                    "ui.panel.config.network.supervisor.wifi"
                  )}
                  outlined
                  .expanded=${!this._interface?.wifi?.ssid}
                >
                  ${
                    this._interface?.wifi?.ssid
                      ? html`<p>
                          <ha-svg-icon
                            slot="icon"
                            .path=${mdiWifi}
                          ></ha-svg-icon>
                          ${this.hass.localize(
                            "ui.panel.config.network.supervisor.connected_to",
                            { ssid: this._interface?.wifi?.ssid }
                          )}
                        </p>`
                      : nothing
                  }
                  <ha-button
                    appearance="plain"
                    class="scan"
                    @click=${this._scanForAP}
                    .disabled=${this._scanning}
                    .loading=${this._scanning}
                  >
                    ${this.hass.localize(
                      "ui.panel.config.network.supervisor.scan_ap"
                    )}
                    <ha-svg-icon slot="start" .path=${mdiWifi}></ha-svg-icon>
                  </ha-button>
                  ${
                    this._accessPoints.length
                      ? html`
                          <ha-list>
                            ${this._accessPoints.map(
                              (ap) => html`
                                <ha-list-item
                                  twoline
                                  @click=${this._selectAP}
                                  .activated=${
                                    ap.ssid === this._wifiConfiguration?.ssid
                                  }
                                  .ap=${ap}
                                >
                                  <span>${ap.ssid}</span>
                                  <span slot="secondary">
                                    ${ap.mac} -
                                    ${this.hass.localize(
                                      "ui.panel.config.network.supervisor.signal_strength"
                                    )}:
                                    ${ap.signal}
                                  </span>
                                </ha-list-item>
                              `
                            )}
                          </ha-list>
                        `
                      : nothing
                  }
                  ${
                    this._wifiConfiguration
                      ? html`
                          <ha-radio-group
                            orientation="horizontal"
                            .value=${this._wifiConfiguration.auth || "open"}
                            name="auth"
                            @change=${this._handleRadioValueChangedAp}
                          >
                            <ha-radio-option value="open">
                              ${this.hass.localize(
                                "ui.panel.config.network.supervisor.open"
                              )}
                            </ha-radio-option>
                            <ha-radio-option value="wep">
                              ${this.hass.localize(
                                "ui.panel.config.network.supervisor.wep"
                              )}
                            </ha-radio-option>
                            <ha-radio-option value="wpa-psk">
                              ${this.hass.localize(
                                "ui.panel.config.network.supervisor.wpa"
                              )}
                            </ha-radio-option>
                          </ha-radio-group>
                          ${
                            this._wifiConfiguration.auth === "wpa-psk" ||
                            this._wifiConfiguration.auth === "wep"
                              ? html`
                                  <ha-input
                                    type="password"
                                    password-toggle
                                    id="psk"
                                    .label=${this.hass.localize(
                                      "ui.panel.config.network.supervisor.wifi_password"
                                    )}
                                    .version=${"wifi"}
                                    @change=${this._handleInputValueChangedWifi}
                                  >
                                  </ha-input>
                                `
                              : nothing
                          }
                        `
                      : nothing
                  }
                </ha-expansion-panel>
              `
            : nothing
        }
        ${IP_VERSIONS.map((version) =>
          this._interface![version]
            ? this._renderIPConfiguration(version)
            : nothing
        )}
        ${
          this._dirty
            ? html`<ha-alert alert-type="warning">
                ${this.hass.localize(
                  "ui.panel.config.network.supervisor.warning"
                )}
              </ha-alert>`
            : nothing
        }
      </div>
      <div class="card-actions">
        <ha-button
          .loading=${this._processing}
          @click=${this._updateNetwork}
          .disabled=${!this._dirty}
        >
          ${this.hass.localize("ui.common.save")}
        </ha-button>
        <ha-button variant="danger" appearance="plain" @click=${this._clear}>
          ${this.hass.localize("ui.panel.config.network.supervisor.reset")}
        </ha-button>
      </div>`;
  }

  private _selectAP(event) {
    this._wifiConfiguration = event.currentTarget.ap;
    IP_VERSIONS.forEach((version) => {
      if (this._interface![version]!.method === "disabled") {
        this._interface![version]!.method = "auto";
      }
    });
    this._dirty = true;
  }

  private async _scanForAP() {
    if (!this._interface) {
      return;
    }
    this._scanning = true;
    try {
      const aps = await accesspointScan(this.hass, this._interface.interface);
      this._accessPoints = [];
      aps.accesspoints?.forEach((ap) => {
        if (ap.ssid) {
          // filter out duplicates
          const existing = this._accessPoints.find((a) => a.ssid === ap.ssid);
          if (!existing) {
            this._accessPoints.push(ap);
          } else if (ap.signal > existing.signal) {
            this._accessPoints = this._accessPoints.filter(
              (a) => a.ssid !== ap.ssid
            );
            this._accessPoints.push(ap);
          }
        }
      });
    } catch (err: any) {
      showAlertDialog(this, {
        title: "Failed to scan for accesspoints",
        text: extractApiErrorMessage(err),
      });
    } finally {
      this._scanning = false;
    }
  }

  private _renderIPConfiguration(version: string) {
    const watingForSSID =
      this._interface?.type === "wireless" &&
      !this._wifiConfiguration?.ssid &&
      !this._interface.wifi?.ssid;
    if (watingForSSID) {
      return nothing;
    }
    const nameservers = this._interface![version]?.nameservers || [];
    if (nameservers.length === 0) {
      nameservers.push(""); // always show input
    }
    const disableInputs = this._interface![version]?.method === "auto";
    return html`
      <ha-expansion-panel
        .header=${`IPv${version.charAt(version.length - 1)}`}
        outlined
      >
        <ha-radio-group
          orientation="horizontal"
          .version=${version}
          .value=${this._interface![version]?.method}
          name="${version}method"
          @change=${this._handleRadioValueChanged}
        >
          <ha-radio-option value="auto">
            ${this.hass.localize("ui.panel.config.network.supervisor.auto")}
          </ha-radio-option>
          <ha-radio-option value="static">
            ${this.hass.localize("ui.panel.config.network.supervisor.static")}
          </ha-radio-option>
          <ha-radio-option value="disabled">
            ${this.hass.localize("ui.panel.config.network.supervisor.disabled")}
          </ha-radio-option>
        </ha-radio-group>
        ${
          ["static", "auto"].includes(this._interface![version].method)
            ? html`
                ${this._interface![version].address.map(
                  (address: string, index: number) => {
                    const { ip, mask, prefix } = parseAddress(address);
                    return html`
                      <div class="address-row">
                        <ha-input
                          id="address"
                          .label=${this.hass.localize(
                            "ui.panel.config.network.supervisor.ip"
                          )}
                          .version=${version}
                          .value=${ip}
                          .index=${index}
                          @change=${this._handleInputValueChanged}
                          .disabled=${disableInputs}
                        >
                        </ha-input>
                        ${
                          version === "ipv6"
                            ? html`
                                <ha-input
                                  id="prefix"
                                  .label=${this.hass.localize(
                                    "ui.panel.config.network.supervisor.prefix"
                                  )}
                                  .version=${version}
                                  .value=${prefix || ""}
                                  .index=${index}
                                  @change=${this._handleInputValueChanged}
                                  .disabled=${disableInputs}
                                >
                                </ha-input>
                              `
                            : html`
                                <ha-input
                                  id="netmask"
                                  .label=${this.hass.localize(
                                    "ui.panel.config.network.supervisor.netmask"
                                  )}
                                  .version=${version}
                                  .value=${mask || ""}
                                  .index=${index}
                                  @change=${this._handleInputValueChanged}
                                  .disabled=${disableInputs}
                                >
                                </ha-input>
                              `
                        }
                        ${
                          this._interface![version].address.length > 1 &&
                          !disableInputs
                            ? html`
                                <ha-icon-button
                                  .label=${this.hass.localize("ui.common.delete")}
                                  .path=${mdiDeleteOutline}
                                  .version=${version}
                                  .index=${index}
                                  @click=${this._removeAddress}
                                ></ha-icon-button>
                              `
                            : nothing
                        }
                      </div>
                    `;
                  }
                )}
                ${
                  !disableInputs
                    ? html`
                        <ha-button
                          @click=${this._addAddress}
                          .version=${version}
                          class="add-address"
                          appearance="filled"
                          size="s"
                        >
                          ${this.hass.localize(
                            "ui.panel.config.network.supervisor.add_address"
                          )}
                          <ha-svg-icon
                            slot="start"
                            .path=${mdiPlus}
                          ></ha-svg-icon>
                        </ha-button>
                      `
                    : nothing
                }
                <ha-input
                  id="gateway"
                  .label=${this.hass.localize(
                    "ui.panel.config.network.supervisor.gateway"
                  )}
                  .version=${version}
                  .value=${this._interface![version].gateway || ""}
                  @change=${this._handleInputValueChanged}
                  .disabled=${disableInputs}
                >
                </ha-input>
                <div class="nameservers">
                  ${nameservers.map(
                    (nameserver: string, index: number) => html`
                      <div class="address-row">
                        <ha-input
                          id="nameserver"
                          .label=${`${this.hass.localize(
                            "ui.panel.config.network.supervisor.dns_server"
                          )}${this._getPredefinedDnsName(nameserver, version)}`}
                          .version=${version}
                          .value=${nameserver}
                          .index=${index}
                          @change=${this._handleInputValueChanged}
                        >
                        </ha-input>
                        ${
                          this._interface![version].nameservers?.length > 1
                            ? html`
                                <ha-icon-button
                                  slot="end"
                                  .label=${this.hass.localize("ui.common.delete")}
                                  .path=${mdiDeleteOutline}
                                  .version=${version}
                                  .index=${index}
                                  @click=${this._removeNameserver}
                                ></ha-icon-button>
                              `
                            : nothing
                        }
                      </div>
                    `
                  )}
                </div>
                <ha-dropdown
                  @wa-show=${this._handleDNSMenuOpened}
                  @wa-hide=${this._handleDNSMenuClosed}
                  .version=${version}
                  @wa-select=${this._handleDropdownSelect}
                  class="add-nameserver"
                >
                  <ha-button appearance="filled" size="s" slot="trigger">
                    ${this.hass.localize(
                      "ui.panel.config.network.supervisor.add_dns_server"
                    )}
                    <ha-svg-icon
                      slot="start"
                      .path=${this._dnsMenuOpen ? mdiMenuDown : mdiPlus}
                    ></ha-svg-icon>
                  </ha-button>
                  ${Object.entries(PREDEFINED_DNS[version]).map(
                    ([name, addresses]) => html`
                      <ha-dropdown-item
                        value="add_predefined"
                        .version=${version}
                        .addresses=${addresses}
                      >
                        ${name}
                      </ha-dropdown-item>
                    `
                  )}
                  <ha-dropdown-item value="add_custom" .version=${version}>
                    ${this.hass.localize(
                      "ui.panel.config.network.supervisor.custom_dns"
                    )}
                  </ha-dropdown-item>
                </ha-dropdown>
              `
            : nothing
        }
      </ha-expansion-panel>
    `;
  }

  private _getPredefinedDnsName(nameserver: string, version: string) {
    for (const [name, addresses] of Object.entries(
      PREDEFINED_DNS[version as "ipv4" | "ipv6"]
    )) {
      if (addresses.includes(nameserver)) {
        return ` - ${name}`;
      }
    }
    return "";
  }

  private async _updateNetwork() {
    this._processing = true;
    let interfaceOptions: Partial<NetworkInterface> = {};

    IP_VERSIONS.forEach((version) => {
      interfaceOptions[version] = {
        method: this._interface![version]?.method || "auto",
        nameservers: this._interface![version]?.nameservers?.filter(
          (ns: string) => ns.trim()
        ),
      };
      if (this._interface![version]?.method === "static") {
        interfaceOptions[version] = {
          ...interfaceOptions[version],
          address: this._interface![version]?.address?.filter(
            (address: string) => address.trim()
          ),
          gateway: this._interface![version]?.gateway,
        };
      }
    });

    if (this._wifiConfiguration) {
      interfaceOptions = {
        ...interfaceOptions,
        wifi: {
          ssid: this._wifiConfiguration.ssid,
          mode: this._wifiConfiguration.mode,
          auth: this._wifiConfiguration.auth || "open",
        },
      };
      if (interfaceOptions.wifi!.auth !== "open") {
        interfaceOptions.wifi = {
          ...interfaceOptions.wifi,
          psk: this._wifiConfiguration.psk,
        };
      }
    }

    interfaceOptions.enabled =
      // at least one ip version is enabled
      (interfaceOptions.ipv4?.method !== "disabled" ||
        interfaceOptions.ipv6?.method !== "disabled") &&
      // require connection if this is a wireless interface
      (this._interface!.type !== "wireless" ||
        this._wifiConfiguration !== undefined ||
        !!this._interface!.wifi);

    try {
      await updateNetworkInterface(
        this.hass,
        this._interface!.interface,
        interfaceOptions
      );
      this._dirty = false;
      await this._fetchNetworkInfo();
    } catch (err: any) {
      showAlertDialog(this, {
        title: this.hass.localize(
          "ui.panel.config.network.supervisor.failed_to_change"
        ),
        text: extractApiErrorMessage(err),
      });
    } finally {
      this._processing = false;
    }
  }

  private async _clear() {
    await this._fetchNetworkInfo();
    this._interface!.ipv4!.method = "auto";
    this._interface!.ipv4!.nameservers = [];
    this._interface!.ipv6!.method = "auto";
    this._interface!.ipv6!.nameservers = [];
    // removing the connection will disable the interface
    // this is the only way to forget the wifi network right now
    this._interface!.wifi = null;
    this._wifiConfiguration = undefined;
    this._dirty = true;
    this.requestUpdate("_interface");
  }

  private async _handleAdapterClick(ev: Event): Promise<void> {
    await this._activateAdapter(
      Number((ev.currentTarget as HTMLElement).dataset.index)
    );
  }

  private async _activateAdapter(index: number): Promise<void> {
    if (index === this._curTabIndex) {
      return;
    }
    if (this._dirty) {
      const confirm = await showConfirmationDialog(this, {
        text: this.hass.localize("ui.panel.config.network.supervisor.unsaved"),
        confirmText: this.hass.localize("ui.common.yes"),
        dismissText: this.hass.localize("ui.common.no"),
      });
      if (!confirm) {
        this.requestUpdate("_interface");
        return;
      }
    }
    this._curTabIndex = index;
    this._interface = { ...this._interfaces[this._curTabIndex] };
  }

  private _handleRadioValueChanged(
    ev: HASSDomCurrentTargetEvent<HaRadioGroup & { version: "ipv4" | "ipv6" }>
  ): void {
    const source = ev.currentTarget as HaRadioGroup;
    const value = source.value as "disabled" | "auto" | "static";
    const version = (source as any).version as "ipv4" | "ipv6";

    const iface = this._interface?.[version];
    if (!value || !iface || iface.method === value) {
      return;
    }
    this._dirty = true;

    iface.method = value;
    this.requestUpdate("_interface");
  }

  private _handleRadioValueChangedAp(
    ev: HASSDomCurrentTargetEvent<HaRadioGroup>
  ): void {
    const source = ev.currentTarget as HaRadioGroup;
    const value = source.value as "open" | "wep" | "wpa-psk";
    this._wifiConfiguration!.auth = value;
    this._dirty = true;
    this.requestUpdate("_wifiConfiguration");
  }

  private _handleInputValueChanged(
    ev: HASSDomTargetEvent<
      HaInput & { version: "ipv4" | "ipv6"; index: number }
    >
  ): void {
    const source = ev.target as HaInput;
    const value = source.value;
    const version = (ev.target as any).version as "ipv4" | "ipv6";
    const id = source.id;

    const iface = this._interface?.[version];
    if (!value || !iface) {
      source.reportValidity();
      return;
    }

    this._dirty = true;
    if (id === "address") {
      const index = (ev.target as any).index as number;
      const { mask: oldMask } = parseAddress(iface.address![index]);
      const { mask } = parseAddress(value);
      iface.address![index] = formatAddress(value, mask || oldMask || "");
      this.requestUpdate("_interface");
    } else if (id === "netmask") {
      const index = (ev.target as any).index as number;
      const { ip } = parseAddress(iface.address![index]);
      iface.address![index] = formatAddress(ip, value);
      this.requestUpdate("_interface");
    } else if (id === "prefix") {
      const index = (ev.target as any).index as number;
      const { ip } = parseAddress(iface.address![index]);
      iface.address![index] = `${ip}/${value}`;
      this.requestUpdate("_interface");
    } else if (id === "nameserver") {
      const index = (ev.target as any).index as number;
      iface.nameservers![index] = value;
      this.requestUpdate("_interface");
    } else {
      iface[id] = value;
    }
  }

  private _handleInputValueChangedWifi(ev: HASSDomTargetEvent<HaInput>): void {
    const source = ev.target as HaInput;
    const value = source.value;
    const id = source.id;

    if (
      !value ||
      !this._wifiConfiguration ||
      this._wifiConfiguration![id] === value
    ) {
      source.reportValidity();
      return;
    }
    this._dirty = true;
    this._wifiConfiguration![id] = value;
  }

  private _addAddress(
    ev: HASSDomTargetEvent<HTMLElement & { version: "ipv4" | "ipv6" }>
  ): void {
    const version = (ev.target as any).version as "ipv4" | "ipv6";
    this._interface![version]!.address!.push(
      version === "ipv4" ? "0.0.0.0/24" : "::/64"
    );
    this._dirty = true;
    this.requestUpdate("_interface");
  }

  private _removeAddress(
    ev: HASSDomTargetEvent<
      HTMLElement & { index: number; version: "ipv4" | "ipv6" }
    >
  ): void {
    const source = ev.target as any;
    const index = source.index as number;
    const version = source.version as "ipv4" | "ipv6";
    this._interface![version]!.address!.splice(index, 1);
    this._dirty = true;
    this.requestUpdate("_interface");
  }

  private _handleDNSMenuOpened() {
    this._dnsMenuOpen = true;
  }

  private _handleDNSMenuClosed() {
    this._dnsMenuOpen = false;
  }

  private _addPredefinedDNS(version: "ipv4" | "ipv6", addresses: string[]) {
    if (!this._interface![version]!.nameservers) {
      this._interface![version]!.nameservers = [];
    }
    this._interface![version]!.nameservers!.push(...addresses);
    this._dirty = true;
    this.requestUpdate("_interface");
  }

  private _addCustomDNS(version: "ipv4" | "ipv6") {
    if (!this._interface![version]!.nameservers) {
      this._interface![version]!.nameservers = [];
    }
    this._interface![version]!.nameservers!.push("");
    this._dirty = true;
    this.requestUpdate("_interface");
  }

  private _removeNameserver(
    ev: HASSDomTargetEvent<
      HTMLElement & { index: number; version: "ipv4" | "ipv6" }
    >
  ): void {
    const source = ev.target as any;
    const index = source.index as number;
    const version = source.version as "ipv4" | "ipv6";
    this._interface![version]!.nameservers!.splice(index, 1);
    this._dirty = true;
    this.requestUpdate("_interface");
  }

  private _handleDropdownSelect(ev: HaDropdownSelectEvent) {
    const action = ev.detail?.item?.value;

    if (action === "add_predefined") {
      this._addPredefinedDNS(
        (ev.detail.item as any).version,
        (ev.detail.item as any).addresses
      );
      return;
    }

    if (action === "add_custom") {
      this._addCustomDNS((ev.detail.item as any).version);
    }
  }

  static get styles(): CSSResultGroup {
    return [
      css`
        .content {
          display: block;
          padding: 20px 24px;
        }

        ha-button.scan {
          margin-left: 8px;
          margin-inline-start: 8px;
          margin-inline-end: initial;
        }
        ha-expansion-panel {
          --expansion-panel-summary-padding: 0 16px;
          margin: 4px 0;
        }
        .address-row {
          display: flex;
          flex-direction: row;
          gap: var(--ha-space-2);
          align-items: center;
        }
        .address-row ha-input {
          flex: 1;
        }
        .address-row #prefix {
          flex: none;
          width: 95px;
        }
        ha-icon-button {
          color: var(--secondary-text-color);
        }
        .address-row ha-icon-button {
          --ha-icon-button-size: 36px;
          margin-top: var(--ha-space-5);
        }
        ha-dropdown {
          display: block;
        }

        .add-address,
        .add-nameserver {
          margin-top: 16px;
        }
        ha-list-item {
          --mdc-list-side-padding: 10px;
        }
        .card-actions {
          display: flex;
          flex-direction: row-reverse;
          justify-content: space-between;
          align-items: center;
        }
        ha-expansion-panel > :last-child {
          margin-bottom: 16px;
        }

        .adapters {
          display: flex;
          flex-direction: column;
          padding: 0 var(--ha-space-4);
        }
        .adapter {
          display: flex;
          align-items: center;
          gap: var(--ha-space-4);
          width: 100%;
          padding: var(--ha-space-2);
          border: none;
          border-radius: var(--ha-border-radius-xl);
          background: none;
          color: inherit;
          font: inherit;
          text-align: start;
          cursor: pointer;
        }
        .adapter.selected {
          background: var(--secondary-background-color);
        }
        .adapter:focus-visible {
          outline: 3px solid var(--primary-color);
          outline-offset: 2px;
        }
        .adapter-tile {
          display: flex;
          flex: none;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: var(--ha-border-radius-xl);
          background: var(--secondary-background-color);
          color: var(--secondary-text-color);
        }
        .adapter.selected .adapter-tile {
          background: var(--card-background-color);
        }
        .adapter-text {
          display: flex;
          flex: 1;
          flex-direction: column;
          gap: var(--ha-space-1);
          min-width: 0;
        }
        .adapter-title {
          font-weight: var(--ha-font-weight-medium);
        }
        .adapter-detail {
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        .adapter-badge {
          padding: var(--ha-space-1) var(--ha-space-3);
          border-radius: var(--ha-border-radius-pill);
          background: color-mix(
            in srgb,
            var(--primary-color) 22%,
            var(--card-background-color)
          );
          font-size: var(--ha-font-size-s);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "supervisor-network": HassioNetwork;
  }
}
