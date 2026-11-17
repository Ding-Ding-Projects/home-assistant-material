import type { TemplateResult } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators";
import { isComponentLoaded } from "../../../common/config/is_component_loaded";
import "../../../components/ha-card";
import "../../../components/ha-icon-next";
import "../../../components/item/ha-list-item-button";
import "../../../components/list/ha-list-nav";
import "../../../layouts/hass-subpage";
import type { HomeAssistant, Route } from "../../../types";
import "./ha-config-http-form";
import "./ha-config-network";
import "./ha-config-url-form";
import "./supervisor-hostname";
import "./supervisor-network";

const NETWORK_BROWSERS = ["dhcp", "ssdp", "zeroconf"] as const;

@customElement("ha-config-section-network")
class HaConfigSectionNetwork extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public route!: Route;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  protected render(): TemplateResult {
    return html`
      <hass-subpage
        back-path="/config/system"
        .hass=${this.hass}
        .narrow=${this.narrow}
        .header=${this.hass.localize("ui.panel.config.network.caption")}
      >
        <div class="content">
          <div class="intro">
            <h2>${this.hass.localize("ui.panel.config.network.caption")}</h2>
            <p>${this._summary()}</p>
          </div>
          ${
            isComponentLoaded(this.hass.config, "hassio")
              ? html`<supervisor-hostname
                    .hass=${this.hass}
                    .narrow=${this.narrow}
                  ></supervisor-hostname>
                  <supervisor-network .hass=${this.hass}></supervisor-network>`
              : ""
          }
          <ha-config-url-form .hass=${this.hass}></ha-config-url-form>
          <ha-config-http-form .hass=${this.hass}></ha-config-http-form>
          <ha-config-network .hass=${this.hass}></ha-config-network>
          ${
            NETWORK_BROWSERS.some((component) =>
              isComponentLoaded(this.hass.config, component)
            )
              ? html`
                  <ha-card
                    outlined
                    class="discovery-card"
                    header=${this.hass.localize(
                      "ui.panel.config.network.discovery.title"
                    )}
                  >
                    <ha-list-nav
                      .ariaLabel=${this.hass.localize(
                        "ui.panel.config.network.discovery.title"
                      )}
                    >
                      ${NETWORK_BROWSERS.map(
                        (domain) => html`
                          <ha-list-item-button href="/config/${domain}">
                            <div slot="headline">
                              ${this.hass.localize(
                                `ui.panel.config.network.discovery.${domain}`
                              )}
                            </div>
                            <div slot="supporting-text">
                              ${this.hass.localize(
                                `ui.panel.config.network.discovery.${domain}_info`
                              )}
                            </div>
                            <ha-icon-next slot="end"></ha-icon-next>
                          </ha-list-item-button>
                        `
                      )}
                    </ha-list-nav>
                  </ha-card>
                `
              : ""
          }
        </div>
      </hass-subpage>
    `;
  }

  /** One line from what the instance already knows; nothing is probed here. */
  private _summary(): string {
    const config = this.hass.config;
    const parts: string[] = [];
    if (config.internal_url) {
      parts.push(
        this.hass.localize("ui.panel.config.network.summary_home", {
          address: config.internal_url,
        })
      );
    }
    parts.push(
      this.hass.localize(
        config.external_url
          ? "ui.panel.config.network.summary_away_on"
          : "ui.panel.config.network.summary_away_off"
      )
    );
    return parts.join(" ");
  }

  static styles = css`
    .intro {
      grid-column: 1 / -1;
    }
    .intro h2 {
      margin: 0;
      font-family: var(--ha-font-family-heading, inherit);
      font-size: calc(34px * var(--ha-font-size-scale, 1));
      font-weight: 800;
      letter-spacing: -0.02em;
      line-height: 1.15;
    }
    .intro p {
      margin: var(--ha-space-2) 0 0;
      font-size: calc(15px * var(--ha-font-size-scale, 1));
      color: var(--secondary-text-color);
      line-height: var(--ha-line-height-normal);
    }
    .content {
      box-sizing: border-box;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-items: start;
      gap: var(--ha-space-4);
      padding: var(--ha-space-5) var(--ha-space-6) var(--ha-space-8);
      max-width: 1200px;
      margin: 0 auto;
    }
    :host([narrow]) .content,
    .content {
      --network-gap: var(--ha-space-4);
      /* Every card on the page is a tonal rounded block without an outline. */
      --ha-card-border-width: 0px;
      --ha-card-background: var(
        --md-sys-color-surface-container,
        var(--card-background-color)
      );
    }
    @media (max-width: 800px) {
      .content {
        grid-template-columns: minmax(0, 1fr);
        padding: var(--ha-space-3) var(--ha-space-3) var(--ha-space-6);
      }
    }
    /* Phone: a 22 px headline and tighter gaps. */
    @media (max-width: 600px) {
      .content {
        gap: var(--ha-space-3);
      }
      /* The header already shows the page name on a phone; saying it twice
         only pushes the settings down. The sentence under it stays. */
      .intro h2 {
        display: none;
      }
      .intro p {
        font-size: calc(14px * var(--ha-font-size-scale, 1));
        margin-top: var(--ha-space-1);
      }
      .content {
        --ha-card-border-radius: 24px;
        --ha-card-header-font-size: 18px;
      }
    }
    supervisor-hostname,
    supervisor-network,
    ha-config-url-form,
    ha-config-http-form,
    ha-config-network,
    .discovery-card {
      display: block;
      min-width: 0;
      max-width: none;
      margin: 0;
    }
    .discovery-card ha-list-item-button::part(headline),
    .discovery-card ha-list-item-button::part(supporting-text) {
      white-space: normal;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-section-network": HaConfigSectionNetwork;
  }
}
