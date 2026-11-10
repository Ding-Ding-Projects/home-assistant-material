import {
  mdiAlertDecagramOutline,
  mdiCheckCircle,
  mdiArrowUpBoldCircleOutline,
  mdiFlask,
  mdiPuzzle,
} from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import memoizeOne from "memoize-one";
import { navigate } from "../../../common/navigate";
import { caseInsensitiveStringCompare } from "../../../common/string/compare";
import "../../../components/ha-app-icon";
import "../../../components/ha-card";
import "../../../components/ha-svg-icon";
import type { HassioAddonRepository } from "../../../data/hassio/addon";
import type { StoreAddon } from "../../../data/supervisor/store";
import type { HomeAssistant } from "../../../types";
import { getAppDisplayName } from "./common/app";
import "./components/supervisor-apps-tag";
import type { AppTag } from "./components/supervisor-apps-card-content";
import { filterAndSort } from "./components/supervisor-apps-filter";

@customElement("supervisor-apps-repository")
export class SupervisorAppsRepositoryEl extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public repo!: HassioAddonRepository;

  @property({ attribute: false }) public addons!: StoreAddon[];

  @property() public filter!: string;

  private _getAddons = memoizeOne((addons: StoreAddon[], filter?: string) => {
    if (filter) {
      return filterAndSort(addons, filter);
    }
    return addons.sort((a, b) =>
      caseInsensitiveStringCompare(a.name, b.name, this.hass.locale.language)
    );
  });

  protected render(): TemplateResult {
    const repo = this.repo;
    const addons = this._getAddons(this.addons, this.filter);

    if (this.filter && addons.length < 1) {
      return html`
        <div class="no-results">
          <p>
            ${this.hass.localize(
              "ui.panel.config.apps.store.no_results_found",
              {
                repository: repo.name,
              }
            )}
          </p>
        </div>
      `;
    }
    return html`
      <section class="repository">
        <h3>${repo.name}</h3>
        <div class="card-group">
          ${addons.map((addon) => {
            const tags = this._getAppTags(addon);
            return html`
              <ha-card
                outlined
                role="button"
                tabindex="0"
                .addon=${addon}
                class=${addon.available ? "" : "not_available"}
                aria-label=${getAppDisplayName(addon.name, addon.stage)}
                @click=${this._addonTapped}
                @keydown=${this._addonKeydown}
              >
                <div class="card-content">
                  <div class="app">
                    <div class="icon-wrapper">
                      <ha-app-icon
                        .slug=${addon.slug}
                        .hasIcon=${addon.icon}
                        .alt=${""}
                      >
                        <ha-svg-icon
                          class="app-icon"
                          .path=${mdiPuzzle}
                        ></ha-svg-icon>
                      </ha-app-icon>
                    </div>
                    <div class="names">
                      <div class="title">
                        ${getAppDisplayName(addon.name, addon.stage)}
                      </div>
                      <div class="description-text">${addon.description}</div>
                    </div>
                  </div>
                  <div class="footer">
                    <div class="tags">
                      ${
                        addon.installed
                          ? html`<supervisor-apps-tag
                              variant="success"
                              .iconPath=${mdiCheckCircle}
                              .label=${this.hass.localize(
                                "ui.panel.config.apps.state.installed"
                              )}
                            ></supervisor-apps-tag>`
                          : nothing
                      }
                      ${
                        addon.available
                          ? nothing
                          : html`<supervisor-apps-tag
                              variant="neutral"
                              .label=${this.hass.localize(
                                "ui.panel.config.apps.state.not_available"
                              )}
                            ></supervisor-apps-tag>`
                      }
                      ${tags.map(
                        (tag) =>
                          html`<supervisor-apps-tag
                            .variant=${tag.variant}
                            .iconPath=${tag.iconPath}
                            .label=${tag.label}
                          ></supervisor-apps-tag>`
                      )}
                    </div>
                    ${
                      addon.available
                        ? html`<span class="action"
                            >${this.hass.localize(
                              addon.installed
                                ? "ui.panel.config.apps.store.open"
                                : "ui.panel.config.apps.dashboard.install"
                            )}</span
                          >`
                        : nothing
                    }
                  </div>
                </div>
              </ha-card>
            `;
          })}
        </div>
      </section>
    `;
  }

  private _addonKeydown(ev: KeyboardEvent) {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      this._addonTapped(ev);
    }
  }

  private _addonTapped(ev) {
    navigate(`/config/app/${ev.currentTarget.addon.slug}/info?store=true`);
  }

  private _getAppTags(addon: StoreAddon): AppTag[] {
    const labels: AppTag[] = [];

    if (addon.installed && addon.update_available) {
      labels.push({
        label: this.hass.localize(
          `ui.panel.config.apps.state.update_available`
        ),
        variant: "brand",
        iconPath: mdiArrowUpBoldCircleOutline,
      });
    }
    if (addon.stage !== "stable") {
      labels.push({
        label: this.hass.localize(
          `ui.panel.config.apps.dashboard.capability.stages.${addon.stage}`
        ),
        variant: addon.stage === "experimental" ? "warning" : "danger",
        iconPath:
          addon.stage === "experimental" ? mdiFlask : mdiAlertDecagramOutline,
      });
    }

    return labels;
  }

  static get styles(): CSSResultGroup {
    return [
      css`
        :host {
          display: block;
          margin-top: var(--ha-space-4);
        }
        h3 {
          margin: 0 0 var(--ha-space-3);
          font-size: var(--ha-font-size-l);
          font-weight: var(--ha-font-weight-medium);
          color: var(--primary-text-color);
        }
        .no-results p {
          margin: 0;
          color: var(--secondary-text-color);
        }
        .card-group {
          display: grid;
          grid-template-columns: repeat(
            auto-fill,
            minmax(min(300px, 100%), 1fr)
          );
          gap: var(--ha-space-4);
        }
        ha-card {
          cursor: pointer;
          overflow: hidden;
          border-radius: var(--ha-border-radius-3xl);
        }
        ha-card:hover {
          background-color: var(--ha-color-fill-neutral-quiet-resting);
        }
        .card-content {
          padding: var(--ha-space-4);
          color: var(--primary-text-color);
        }
        .app {
          display: flex;
          gap: var(--ha-space-4);
          margin-bottom: var(--ha-space-3);
        }
        .icon-wrapper {
          width: 48px;
          height: 48px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        ha-app-icon {
          --ha-app-icon-size: 48px;
        }
        .app-icon {
          color: var(--secondary-text-color);
        }
        .names {
          flex: 1;
          min-width: 0;
        }
        .title {
          font-weight: var(--ha-font-weight-medium);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .description-text {
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-s);
          line-height: var(--ha-line-height-condensed);
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .footer {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: var(--ha-space-2);
          min-height: 28px;
        }
        .tags {
          display: flex;
          flex-wrap: wrap;
          gap: var(--ha-space-2);
        }
        .action {
          color: var(--primary-color);
          font-weight: var(--ha-font-weight-medium);
          margin-inline-start: auto;
        }
        .not_available {
          opacity: 0.6;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "supervisor-apps-repository": SupervisorAppsRepositoryEl;
  }
}
