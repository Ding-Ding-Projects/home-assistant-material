import {
  mdiFileDocument,
  mdiHandsPray,
  mdiHelp,
  mdiKeyboard,
  mdiOpenInNew,
} from "@mdi/js";
import type { CSSResultGroup, TemplateResult, PropertyValues } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { isComponentLoaded } from "../../../common/config/is_component_loaded";
import "../../../components/ha-card";
import "../../../components/ha-svg-icon";
import "../../../components/item/ha-list-item-button";
import "../../../components/list/ha-list-base";
import type { HassioHassOSInfo } from "../../../data/hassio/host";
import { fetchHassioHassOsInfo } from "../../../data/hassio/host";
import type { HassioInfo } from "../../../data/hassio/supervisor";
import { fetchHassioInfo } from "../../../data/hassio/supervisor";
import { subscribeSystemHealthInfo } from "../../../data/system_health";
import { showShortcutsDialog } from "../../../dialogs/shortcuts/show-shortcuts-dialog";
import "../../../layouts/hass-subpage";
import { panelIsReady } from "../../../layouts/panel-ready";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant, Route } from "../../../types";
import { documentationUrl } from "../../../util/documentation-url";

const JS_TYPE = __BUILD__;
const JS_VERSION = __VERSION__;

const MATERIAL_VERSION = __MATERIAL_BUILD__;

const PROJECT_URL =
  "https://github.com/Ding-Ding-Projects/home-assistant-material";

/** The feed this project's builds read their updates from. */
const FEED_URL =
  "https://raw.githubusercontent.com/Ding-Ding-Projects/home-assistant-material/channel/stable.json";

const PAGES = [
  {
    name: "thanks",
    path: "/developers/credits/",
    iconPath: mdiHandsPray,
    iconColor: "#3B808E",
  },
  {
    name: "help",
    path: "/community",
    iconPath: mdiHelp,
    iconColor: "#B1345C",
  },
  {
    name: "license",
    path: "/developers/license/",
    iconPath: mdiFileDocument,
    iconColor: "#518C43",
  },
] as const satisfies readonly {
  name: string;
  path: string;
  iconPath: string;
  iconColor: string;
}[];

@customElement("ha-config-info")
class HaConfigInfo extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: "is-wide", type: Boolean }) public isWide = false;

  @property({ attribute: false }) public route!: Route;

  @state() private _osInfo?: HassioHassOSInfo;

  @state() private _hassioInfo?: HassioInfo;

  @state() private _installationMethod?: string;

  protected render(): TemplateResult {
    const hass = this.hass;
    const customUiList: { name: string; url: string; version: string }[] =
      (window as any).CUSTOM_UI_LIST || [];

    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        back-path="/config"
        .header=${this.hass.localize("ui.panel.config.info.caption")}
      >
        <div class="content">
          <section class="hero">
            <span class="eyebrow"
              >${this.hass.config.location_name || "Home Assistant Material"}</span
            >
            <span class="product">Home Assistant Material</span>
            <h2>${MATERIAL_VERSION || hass.connection.haVersion}</h2>
            <p>${this._builtText()}</p>
            <p class="note">
              ${this.hass.localize("ui.panel.config.info.material.read_from_build")}
            </p>
            <div class="hero-actions">
              <a class="pill primary" href="/config/changelog"
                >${this.hass.localize("ui.panel.config.changelog.title")}</a
              >
              <a class="pill" href="/config/updates"
                >${this.hass.localize("ui.panel.config.info.material.updates")}</a
              >
              <a
                class="pill"
                href=${PROJECT_URL + "/issues"}
                target="_blank"
                rel="noopener noreferrer"
                >${this.hass.localize("ui.panel.config.info.material.report")}</a
              >
            </div>
          </section>

          <ha-card outlined class="versions-card">
            <ul class="versions">
              <li>
                <span class="version-label"
                  >${this.hass.localize(
                    "ui.panel.config.info.installation_method"
                  )}</span
                >
                <span class="version">${this._installationMethod || "…"}</span>
              </li>
              <li>
                <span class="version-label">Core</span>
                <span class="version">${hass.connection.haVersion}</span>
              </li>
              ${
                this._hassioInfo
                  ? html`
                      <li>
                        <span class="version-label">Supervisor</span>
                        <span class="version"
                          >${this._hassioInfo.supervisor}</span
                        >
                      </li>
                    `
                  : nothing
              }
              ${
                this._osInfo
                  ? html`
                      <li>
                        <span class="version-label">Operating System</span>
                        <span class="version">${this._osInfo.version}</span>
                      </li>
                    `
                  : nothing
              }
              <li>
                <span class="version-label">
                  ${this.hass.localize(
                    "ui.panel.config.info.frontend_version_label"
                  )}
                </span>
                <span class="version">
                  ${JS_VERSION}${JS_TYPE !== "modern" ? ` · ${JS_TYPE}` : ""}
                </span>
              </li>
              ${
                this.hass.auth.external?.config.appVersion
                  ? html`
                      <li>
                        <span class="version-label"
                          >${this.hass.localize(
                            "ui.panel.config.info.external_app_version"
                          )}</span
                        >
                        <span class="version"
                          >${this.hass.auth.external?.config.appVersion}</span
                        >
                      </li>
                    `
                  : nothing
              }
            </ul>
          </ha-card>

          <section class="card">
            <h3>
              ${this.hass.localize("ui.panel.config.info.material.source_title")}
            </h3>
            <p>
              ${this.hass.localize("ui.panel.config.info.material.source_text")}
            </p>
            <code class="address">${FEED_URL}</code>
            <p class="note">
              ${this.hass.localize(
                this._hassioInfo
                  ? "ui.panel.config.info.material.source_supervised"
                  : "ui.panel.config.info.material.source_container"
              )}
            </p>
          </section>

          <section class="card free">
            <h3>
              ${this.hass.localize("ui.panel.config.info.material.free_title")}
            </h3>
            <p>
              ${this.hass.localize("ui.panel.config.info.material.free_text")}
            </p>
          </section>

          <section class="card">
            <p>
              ${this.hass.localize("ui.panel.config.info.material.independent")}
            </p>
          </section>

          <ha-card outlined class="pages">
            <ha-list-base>
              <ha-list-item-button @click=${this._showShortcuts}>
                <div
                  slot="start"
                  class="icon-background"
                  style="background-color: #9e4dd1;"
                >
                  <ha-svg-icon .path=${mdiKeyboard}></ha-svg-icon>
                </div>
                <span slot="headline"
                  >${this.hass.localize("ui.panel.config.info.shortcuts")}</span
                >
              </ha-list-item-button>

              ${PAGES.map(
                (page) => html`
                  <ha-list-item-button
                    .href=${documentationUrl(this.hass, page.path)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <div
                      slot="start"
                      class="icon-background"
                      style=${`background-color: ${page.iconColor};`}
                    >
                      <ha-svg-icon .path=${page.iconPath}></ha-svg-icon>
                    </div>
                    <span slot="headline">
                      ${this.hass.localize(
                        `ui.panel.config.info.items.${page.name}`
                      )}
                    </span>
                    <ha-svg-icon slot="end" .path=${mdiOpenInNew}></ha-svg-icon>
                  </ha-list-item-button>
                `
              )}
            </ha-list-base>
            ${
              customUiList.length
                ? html`
                    <div class="custom-ui">
                      ${this.hass.localize("ui.panel.config.info.custom_uis")}
                      ${customUiList.map(
                        (item) => html`
                          <div>
                            <a
                              href=${item.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              ${item.name}</a
                            >: ${item.version}
                          </div>
                        `
                      )}
                    </div>
                  `
                : nothing
            }
          </ha-card>
        </div>
      </hass-subpage>
    `;
  }

  /** When this build was made, read from the build itself. */
  private _builtText(): string {
    const built = new Date(__BUILD_TIME__);
    if (Number.isNaN(built.getTime())) {
      return this.hass.localize("ui.panel.config.info.material.built_unknown");
    }
    const language = this.hass.locale.language;
    return this.hass.localize("ui.panel.config.info.material.built", {
      date: built.toLocaleDateString(language, {
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
      time: built.toLocaleTimeString(language, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZoneName: "long",
      }),
    });
  }

  protected firstUpdated(changedProps: PropertyValues<this>): void {
    super.firstUpdated(changedProps);

    // Legacy custom UI can be slow to register, give them time.
    const customUI = ((window as any).CUSTOM_UI_LIST || []).length;
    setTimeout(() => {
      if (((window as any).CUSTOM_UI_LIST || []).length !== customUI.length) {
        this.requestUpdate();
      }
    }, 2000);

    if (isComponentLoaded(this.hass.config, "hassio")) {
      this._loadSupervisorInfo();
    }

    const unsubSystemHealth = subscribeSystemHealthInfo(this.hass, (info) => {
      if (info?.homeassistant) {
        this._installationMethod = info.homeassistant.info.installation_type;
        unsubSystemHealth.then((unsub) => unsub());
        panelIsReady(this);
      }
    });
  }

  private async _loadSupervisorInfo(): Promise<void> {
    const [osInfo, hassioInfo] = await Promise.all([
      fetchHassioHassOsInfo(this.hass),
      fetchHassioInfo(this.hass),
    ]);

    this._hassioInfo = hassioInfo;
    this._osInfo = osInfo;
  }

  private _showShortcuts(ev): void {
    ev.stopPropagation();
    showShortcutsDialog(this);
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        .content {
          padding: 28px 20px 0;
          max-width: 1040px;
          margin: 0 auto;
        }

        ha-card,
        .hero,
        .card {
          box-sizing: border-box;
          max-width: 720px;
          margin: 0 auto var(--ha-space-4);
        }

        ha-card {
          padding: 16px;
        }

        .hero,
        .card {
          padding: var(--ha-space-5) var(--ha-space-6);
          border-radius: var(--ha-border-radius-3xl);
          background: var(--card-background-color);
        }

        .hero {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-1);
          background: color-mix(
            in srgb,
            var(--primary-color) 20%,
            var(--primary-background-color)
          );
        }

        .eyebrow {
          font-family: var(--ha-font-family-heading, inherit);
          font-size: var(--ha-font-size-2xl);
          font-weight: var(--ha-font-weight-medium);
        }

        .product {
          color: var(--secondary-text-color);
        }

        .hero h2 {
          margin: var(--ha-space-3) 0 var(--ha-space-1);
          font-family: var(--ha-font-family-heading, inherit);
          font-size: clamp(36px, 5vw, 56px);
          font-weight: var(--ha-font-weight-medium);
          line-height: 1.05;
          letter-spacing: -0.02em;
        }

        .hero p,
        .card p {
          margin: 0;
          line-height: var(--ha-line-height-normal);
        }

        .note {
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }

        .hero-actions {
          display: flex;
          flex-wrap: wrap;
          gap: var(--ha-space-2);
          margin-top: var(--ha-space-4);
        }

        .pill {
          display: inline-flex;
          align-items: center;
          min-height: var(--ha-space-10);
          padding: 0 var(--ha-space-5);
          border: 1px solid var(--outline-color);
          border-radius: var(--ha-border-radius-pill);
          color: var(--primary-text-color);
          font-weight: var(--ha-font-weight-medium);
          text-decoration: none;
        }

        .pill.primary {
          border-color: transparent;
          background: var(--primary-color);
          color: var(--text-primary-color, #fff);
        }

        .pill:focus-visible {
          outline: 3px solid var(--primary-color);
          outline-offset: 2px;
        }

        .card h3 {
          margin: 0 0 var(--ha-space-2);
          font-size: var(--ha-font-size-l);
          font-weight: var(--ha-font-weight-medium);
        }

        .card.free {
          background: color-mix(
            in srgb,
            var(--success-color) 28%,
            var(--primary-background-color)
          );
        }

        .address {
          display: block;
          margin: var(--ha-space-3) 0;
          padding: var(--ha-space-3);
          border-radius: var(--ha-border-radius-lg);
          background: var(--primary-background-color);
          font-family: var(--ha-font-family-code);
          font-size: var(--ha-font-size-s);
          overflow-wrap: anywhere;
        }

        .versions {
          display: flex;
          flex-direction: column;
          color: var(--secondary-text-color);
          align-self: stretch;
          justify-content: flex-start;
          padding: 0 12px;
          margin: 0;
        }

        .versions li {
          display: flex;
          flex-direction: row;
          justify-content: space-between;
          font-size: var(--ha-font-size-m);
          font-weight: var(--ha-font-weight-normal);
          padding: 4px 0;
        }

        .version-label {
          color: var(--primary-text-color);
        }

        .version {
          color: var(--secondary-text-color);
        }

        .ha-version {
          color: var(--primary-text-color);
          font-size: var(--ha-font-size-l);
          font-weight: var(--ha-font-weight-medium);
        }

        .pages {
          margin-bottom: max(24px, var(--safe-area-inset-bottom));
          padding: 4px 0;
        }

        .icon-background ha-svg-icon {
          height: 24px;
          width: 24px;
          color: #fff;
        }

        .icon-background {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: var(--ha-border-radius-circle);
        }

        .custom-ui {
          color: var(--secondary-text-color);
          text-align: center;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-info": HaConfigInfo;
  }
}
