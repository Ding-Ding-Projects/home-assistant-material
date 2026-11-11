import {
  mdiCellphone,
  mdiChip,
  mdiFileDocument,
  mdiHandHeart,
  mdiHandsPray,
  mdiHelp,
  mdiHome,
  mdiKeyboard,
  mdiOpenInNew,
  mdiPackageVariantClosed,
  mdiScaleBalance,
  mdiShieldHalfFull,
  mdiSourceBranch,
  mdiUpdate,
  mdiViewDashboard,
} from "@mdi/js";
import type { CSSResultGroup, TemplateResult, PropertyValues } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { styleMap } from "lit/directives/style-map";
import { applyPersonalVocabulary } from "../../../common/vocabulary/personal-vocabulary";
import type { LocalizeKeys } from "../../../common/translations/localize";
import { readIdentity } from "../../../common/identity/identity";
import "../identity/ha-identity-logo";
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

type UpdateStatus = "current" | "available" | undefined;

@customElement("ha-config-info")
class HaConfigInfo extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @property({ attribute: "is-wide", type: Boolean }) public isWide = false;

  @property({ attribute: false }) public route!: Route;

  @state() private _osInfo?: HassioHassOSInfo;

  @state() private _hassioInfo?: HassioInfo;

  @state() private _installationMethod?: string;

  protected render(): TemplateResult {
    const hass = this.hass;
    const identity = readIdentity();
    const customUiList: { name: string; url: string; version: string }[] =
      (window as any).CUSTOM_UI_LIST || [];
    const coreStatus = this._updateStatus("update.home_assistant_core_update");

    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        back-path="/config/system"
        .header=${this.hass.localize("ui.panel.config.info.material.title")}
      >
        <div class="content">
          <div class="columns">
            <div class="column">
              <section class="hero">
                <div class="hero-top">
                  <span class="logo"
                    ><ha-identity-logo
                      style="--identity-logo-size: 56px"
                    ></ha-identity-logo
                  ></span>
                  <div class="hero-names">
                    <span class="eyebrow"
                      >${identity.name || hass.config.location_name || "Home Assistant Material"}</span
                    >
                    <span class="product"
                      >${
                        identity.name
                          ? this.hass.localize(
                              "ui.panel.config.identity.shown_as",
                              {
                                product: "Home Assistant Material",
                                name: identity.name,
                              }
                            )
                          : "Home Assistant Material"
                      }</span
                    >
                  </div>
                  ${this._renderBadge(coreStatus, true)}
                </div>
                <h2>${MATERIAL_VERSION || hass.connection.haVersion}</h2>
                <p>${this._builtText()}</p>
                <p class="note">
                  ${this.hass.localize("ui.panel.config.info.material.read_from_build")}
                </p>
              </section>

              <ul class="components">
                <li>
                  <span class="tile"
                    ><ha-svg-icon .path=${mdiPackageVariantClosed}></ha-svg-icon
                  ></span>
                  <span class="text">
                    <span class="title"
                      >${this.hass.localize(
                        "ui.panel.config.info.installation_method"
                      )}</span
                    >
                    <span class="sub"
                      >${
                        this._installationMethod
                          ? applyPersonalVocabulary(this._installationMethod)
                          : "…"
                      }</span
                    >
                  </span>
                </li>
                <li>
                  <span class="tile"
                    ><ha-svg-icon .path=${mdiHome}></ha-svg-icon
                  ></span>
                  <span class="text">
                    <span class="title">Core</span>
                    <span class="sub">${hass.connection.haVersion}</span>
                  </span>
                  ${this._renderBadge(coreStatus)}
                </li>
                ${
                  this._hassioInfo
                    ? html`
                        <li>
                          <span class="tile"
                            ><ha-svg-icon
                              .path=${mdiShieldHalfFull}
                            ></ha-svg-icon
                          ></span>
                          <span class="text">
                            <span class="title">Supervisor</span>
                            <span class="sub"
                              >${this._hassioInfo.supervisor}</span
                            >
                          </span>
                          ${this._renderBadge(
                            this._updateStatus(
                              "update.home_assistant_supervisor_update"
                            )
                          )}
                        </li>
                      `
                    : nothing
                }
                ${
                  this._osInfo
                    ? html`
                        <li>
                          <span class="tile"
                            ><ha-svg-icon .path=${mdiChip}></ha-svg-icon
                          ></span>
                          <span class="text">
                            <span class="title">Operating System</span>
                            <span class="sub"
                              >${
                                this._osInfo.board
                                  ? this.hass.localize(
                                      "ui.panel.config.info.material.os_on_board",
                                      {
                                        version: this._osInfo.version,
                                        board: this._osInfo.board,
                                      }
                                    )
                                  : this._osInfo.version
                              }</span
                            >
                          </span>
                          ${this._renderBadge(
                            this._updateStatus(
                              "update.home_assistant_operating_system_update"
                            )
                          )}
                        </li>
                      `
                    : nothing
                }
                <li>
                  <span class="tile"
                    ><ha-svg-icon .path=${mdiViewDashboard}></ha-svg-icon
                  ></span>
                  <span class="text">
                    <span class="title"
                      >${this.hass.localize(
                        "ui.panel.config.info.frontend_version_label"
                      )}</span
                    >
                    <span class="sub"
                      >${JS_VERSION}${JS_TYPE !== "modern" ? ` · ${JS_TYPE}` : ""}</span
                    >
                  </span>
                </li>
                ${
                  this.hass.auth.external?.config.appVersion
                    ? html`
                        <li>
                          <span class="tile"
                            ><ha-svg-icon .path=${mdiCellphone}></ha-svg-icon
                          ></span>
                          <span class="text">
                            <span class="title"
                              >${this.hass.localize(
                                "ui.panel.config.info.external_app_version"
                              )}</span
                            >
                            <span class="sub"
                              >${this.hass.auth.external?.config.appVersion}</span
                            >
                          </span>
                        </li>
                      `
                    : nothing
                }
              </ul>

              <div class="actions">
                <a class="pill primary" href="/config/updates"
                  ><ha-svg-icon .path=${mdiUpdate}></ha-svg-icon
                  >${this.hass.localize(
                    "ui.panel.config.info.material.check_updates"
                  )}</a
                >
                <a class="pill" href="/config/changelog"
                  >${this.hass.localize("ui.panel.config.changelog.title")}</a
                >
                <a
                  class="pill plain"
                  href=${documentationUrl(this.hass, "/developers/license/")}
                  target="_blank"
                  rel="noopener noreferrer"
                  >${this.hass.localize("ui.panel.config.info.items.license")}</a
                >
                <a class="pill plain" href="/config/problem-log"
                  >${this.hass.localize("ui.panel.config.info.material.report")}</a
                >
              </div>
            </div>

            <div class="column">
              <section class="card">
                <h3>
                  <ha-svg-icon .path=${mdiSourceBranch}></ha-svg-icon>
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
                  <ha-svg-icon .path=${mdiHandHeart}></ha-svg-icon>
                  ${this.hass.localize("ui.panel.config.info.material.free_title")}
                </h3>
                <p>
                  ${this.hass.localize("ui.panel.config.info.material.free_text")}
                </p>
              </section>

              <section class="card independent">
                <ha-svg-icon .path=${mdiScaleBalance}></ha-svg-icon>
                <p>
                  ${this.hass.localize("ui.panel.config.info.material.independent")}
                </p>
              </section>
            </div>
          </div>

          <ha-card outlined class="pages">
            <ha-list-base>
              <ha-list-item-button @click=${this._showShortcuts}>
                <div slot="start" class="icon-background shortcuts">
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
                      style=${styleMap({ backgroundColor: page.iconColor })}
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

  /** Whether an update is waiting, read from the update entity when there is one. */
  private _updateStatus(entityId: string): UpdateStatus {
    const entityState = this.hass.states[entityId]?.state;
    if (entityState === "on") {
      return "available";
    }
    return entityState === "off" ? "current" : undefined;
  }

  private _renderBadge(
    status: UpdateStatus,
    hero = false
  ): TemplateResult | typeof nothing {
    if (!status) {
      return nothing;
    }
    let key: LocalizeKeys = "ui.panel.config.info.material.update_available";
    if (status === "current") {
      key = hero
        ? "ui.panel.config.info.material.up_to_date"
        : "ui.panel.config.info.material.current";
    }
    return html`<span class="badge ${status}"
      >${this.hass.localize(key)}</span
    >`;
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
          box-sizing: border-box;
          padding: var(--ha-space-4) var(--ha-space-5) 0;
          max-width: 1100px;
          margin: 0 auto;
        }

        :host([narrow]) .content {
          padding: var(--ha-space-2) var(--ha-space-3) 0;
        }

        .columns {
          display: grid;
          grid-template-columns: repeat(
            auto-fit,
            minmax(min(100%, 320px), 1fr)
          );
          align-items: start;
          gap: var(--ha-space-4);
          margin-bottom: var(--ha-space-4);
        }

        .column {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-4);
          min-width: 0;
        }

        .hero,
        .card {
          box-sizing: border-box;
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

        .hero-top {
          display: flex;
          align-items: flex-start;
          gap: var(--ha-space-4);
        }

        .logo {
          display: flex;
          flex: none;
          align-items: center;
          justify-content: center;
          width: 56px;
          height: 56px;
          border-radius: var(--ha-border-radius-xl);
          background: var(--card-background-color);
          color: var(--primary-color);
        }

        .hero-names {
          display: flex;
          flex: 1;
          flex-direction: column;
          min-width: 0;
        }

        .eyebrow {
          font-family: var(--ha-font-family-heading, inherit);
          font-size: var(--ha-font-size-2xl);
          font-weight: var(--ha-font-weight-medium);
          overflow-wrap: anywhere;
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
          overflow-wrap: anywhere;
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

        .badge {
          flex: none;
          padding: var(--ha-space-1) var(--ha-space-3);
          border-radius: var(--ha-border-radius-pill);
          font-size: var(--ha-font-size-s);
          font-weight: var(--ha-font-weight-medium);
          white-space: nowrap;
          background: color-mix(
            in srgb,
            var(--success-color) 28%,
            var(--card-background-color)
          );
          color: var(--primary-text-color);
        }

        .badge.available {
          background: color-mix(
            in srgb,
            var(--warning-color) 35%,
            var(--card-background-color)
          );
        }

        .components {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-1);
          margin: 0;
          padding: 0;
          list-style: none;
        }

        .components li {
          display: flex;
          align-items: center;
          gap: var(--ha-space-4);
          padding: var(--ha-space-2) var(--ha-space-3);
        }

        .tile {
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

        .text {
          display: flex;
          flex: 1;
          flex-direction: column;
          min-width: 0;
        }

        .title {
          font-weight: var(--ha-font-weight-medium);
        }

        .sub {
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
          overflow-wrap: anywhere;
        }

        .actions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-2);
        }

        .pill {
          display: inline-flex;
          align-items: center;
          gap: var(--ha-space-2);
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

        .pill.plain {
          border-color: transparent;
          padding: 0 var(--ha-space-3);
          color: var(--primary-color);
        }

        .pill:focus-visible {
          outline: 3px solid var(--primary-color);
          outline-offset: 2px;
        }

        .card h3 {
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
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

        .card.independent {
          display: flex;
          align-items: flex-start;
          gap: var(--ha-space-3);
          background: var(--secondary-background-color);
          color: var(--secondary-text-color);
        }

        .card.independent ha-svg-icon {
          flex: none;
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

        .icon-background.shortcuts {
          background-color: #9e4dd1;
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
