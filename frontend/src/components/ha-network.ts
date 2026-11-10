import { mdiAutoFix, mdiEthernet, mdiLan, mdiStar, mdiWifi } from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { fireEvent } from "../common/dom/fire_event";
import type { HASSDomCurrentTargetEvent } from "../common/dom/fire_event";
import type {
  Adapter,
  IPv4ConfiguredAddress,
  IPv6ConfiguredAddress,
  NetworkConfig,
} from "../data/network";
import { haStyle } from "../resources/styles";
import "./ha-checkbox";
import { consumeLocalize } from "../common/decorators/consume-context-entry";
import type { LocalizeFunc } from "../common/translations/localize";
import type { HaCheckbox } from "./ha-checkbox";
import "./ha-svg-icon";
import "./ha-switch";
import type { HaSwitch } from "./ha-switch";

const format_addresses = (
  addresses: IPv6ConfiguredAddress[] | IPv4ConfiguredAddress[]
): TemplateResult =>
  html`${addresses.map((address, i) => [
    html`<span>${address.address}/${address.network_prefix}</span>`,
    i < addresses.length - 1 ? ", " : nothing,
  ])}`;

const format_auto_detected_interfaces = (
  adapters: Adapter[]
): (TemplateResult | string)[] =>
  adapters.map((adapter) =>
    adapter.auto
      ? html`${adapter.name}
        (${format_addresses([...adapter.ipv4, ...adapter.ipv6])})`
      : ""
  );

const adapterIcon = (adapter: Adapter): string => {
  if (/^(wl|wlan|wifi)/i.test(adapter.name)) {
    return mdiWifi;
  }
  if (/^(en|eth)/i.test(adapter.name)) {
    return mdiEthernet;
  }
  return mdiLan;
};

declare global {
  interface HASSDomEvents {
    "network-config-changed": { configured_adapters: string[] };
  }
}
@customElement("ha-network")
export class HaNetwork extends LitElement {
  @property({ attribute: false }) public networkConfig?: NetworkConfig;

  @state() private _expanded?: boolean;

  @state()
  @consumeLocalize()
  private _localize!: LocalizeFunc;

  protected render() {
    if (this.networkConfig === undefined) {
      return nothing;
    }
    const configured_adapters = this.networkConfig.configured_adapters || [];
    const auto = !configured_adapters.length;
    return html`
      <div class="row">
        <span class="tile"
          ><ha-svg-icon .path=${mdiAutoFix}></ha-svg-icon
        ></span>
        <div class="text">
          <span class="heading"
            >${this._localize(
              "ui.panel.config.network.adapter.choose_for_me"
            )}</span
          >
          <span class="description">
            ${this._localize("ui.panel.config.network.adapter.detected")}:
            ${format_auto_detected_interfaces(this.networkConfig.adapters)}
          </span>
        </div>
        <ha-switch
          .checked=${auto}
          .ariaLabel=${this._localize(
            "ui.panel.config.network.adapter.auto_configure"
          )}
          @change=${this._handleAutoConfigureCheckboxClick}
        ></ha-switch>
      </div>
      ${
        auto
          ? html`<p class="hint">
              ${this._localize(
                "ui.panel.config.network.adapter.auto_configure_manual_hint"
              )}
            </p>`
          : nothing
      }
      ${
        configured_adapters.length || this._expanded
          ? this.networkConfig.adapters.map(
              (adapter) =>
                html`<div class="row">
                  <span class="tile"
                    ><ha-svg-icon .path=${adapterIcon(adapter)}></ha-svg-icon
                  ></span>
                  <label class="text" for=${adapter.name}>
                    <span class="heading">
                      ${this._localize(
                        "ui.panel.config.network.adapter.adapter"
                      )}:
                      ${adapter.name}
                      ${
                        adapter.default
                          ? html`<ha-svg-icon
                                class="default"
                                .path=${mdiStar}
                              ></ha-svg-icon>
                              (${this._localize("ui.common.default")})`
                          : nothing
                      }
                    </span>
                    <span class="description">
                      ${format_addresses([...adapter.ipv4, ...adapter.ipv6])}
                    </span>
                  </label>
                  <ha-checkbox
                    id=${adapter.name}
                    @change=${this._handleAdapterCheckboxClick}
                    .checked=${configured_adapters.includes(adapter.name)}
                    .adapter=${adapter.name}
                  ></ha-checkbox>
                </div>`
            )
          : nothing
      }
    `;
  }

  private _handleAutoConfigureCheckboxClick(
    ev: HASSDomCurrentTargetEvent<HaSwitch>
  ) {
    const checkbox = ev.currentTarget as HaSwitch;
    if (this.networkConfig === undefined) {
      return;
    }

    let configured_adapters = [...this.networkConfig.configured_adapters];

    if (checkbox.checked) {
      this._expanded = false;
      configured_adapters = [];
    } else {
      this._expanded = true;
      for (const adapter of this.networkConfig.adapters) {
        if (adapter.default) {
          configured_adapters = [adapter.name];
          break;
        }
      }
    }

    fireEvent(this, "network-config-changed", {
      configured_adapters: configured_adapters,
    });
  }

  private _handleAdapterCheckboxClick(
    ev: HASSDomCurrentTargetEvent<HaCheckbox>
  ) {
    const checkbox = ev.currentTarget as HaCheckbox;
    const adapter_name = checkbox.id;
    if (this.networkConfig === undefined) {
      return;
    }

    const configured_adapters = [...this.networkConfig.configured_adapters];

    if (checkbox.checked) {
      configured_adapters.push(adapter_name);
    } else {
      const index = configured_adapters.indexOf(adapter_name, 0);
      configured_adapters.splice(index, 1);
    }

    fireEvent(this, "network-config-changed", {
      configured_adapters: configured_adapters,
    });
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        .error {
          color: var(--error-color);
        }

        .row {
          display: flex;
          align-items: center;
          gap: var(--ha-space-4);
          padding: var(--ha-space-2) 0;
        }

        .tile {
          flex: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: var(--ha-border-radius-lg, 12px);
          background: var(--secondary-background-color);
          color: var(--secondary-text-color);
        }

        .text {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-1);
        }

        .heading {
          font-weight: var(--ha-font-weight-medium);
          overflow-wrap: anywhere;
        }

        .description {
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
          overflow-wrap: anywhere;
        }

        .hint {
          margin: var(--ha-space-2) 0 0;
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }

        ha-svg-icon.default {
          --mdc-icon-size: 12px;
          margin-bottom: 4px;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-network": HaNetwork;
  }
}
