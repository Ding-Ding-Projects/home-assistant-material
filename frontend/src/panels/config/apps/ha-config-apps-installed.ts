import {
  mdiAlertDecagramOutline,
  mdiArrowUpBoldCircleOutline,
  mdiFlask,
  mdiPuzzle,
  mdiRefresh,
  mdiStorePlus,
} from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { searchMatcher } from "../../../common/regex/filter";
import { navigate } from "../../../common/navigate";
import { caseInsensitiveStringCompare } from "../../../common/string/compare";
import type { LocalizeKeys } from "../../../common/translations/localize";
import "../../../components/chips/ha-filter-chip";
import "../../../components/ha-app-icon";
import "../../../components/ha-bar";
import "../../../components/ha-button";
import "../../../components/ha-card";
import "../../../components/ha-icon-button";
import "../../../components/ha-svg-icon";
import "../../../components/input/ha-input-search";
import type {
  HassioAddonInfo,
  HassioAddonsInfo,
} from "../../../data/hassio/addon";
import { fetchHassioAddonsInfo } from "../../../data/hassio/addon";
import type { HassioStats } from "../../../data/hassio/common";
import { fetchHassioStats } from "../../../data/hassio/common";
import "../../../layouts/hass-error-screen";
import "../../../layouts/hass-loading-screen";
import "../../../layouts/hass-subpage";
import type { HomeAssistant, Route } from "../../../types";
import { roundWithOneDecimal } from "../../../util/calculate";
import { getAppDisplayName } from "./common/app";
import { checkForAppUpdates } from "./common/check-for-updates";
import type { AppTag } from "./components/supervisor-apps-card-content";
import "./components/supervisor-apps-state";
import "./components/supervisor-apps-tag";

type StatusFilter = "running" | "stopped" | "update";

const STATUS_FILTERS: StatusFilter[] = ["running", "stopped", "update"];

@customElement("ha-config-apps-installed")
export class HaConfigAppsInstalled extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @property({ attribute: false }) public route!: Route;

  @state() private _addonInfo?: HassioAddonsInfo;

  @state() private _filter?: string;

  @state() private _error?: string;

  @state() private _checkingUpdates = false;

  @state() private _statusFilters: StatusFilter[] = [];

  @state() private _stats: Record<string, HassioStats> = {};

  protected firstUpdated() {
    this._loadData();
  }

  protected render(): TemplateResult {
    if (this._error) {
      return html`
        <hass-error-screen
          .hass=${this.hass}
          .error=${this._error}
        ></hass-error-screen>
      `;
    }

    if (!this._addonInfo) {
      return html`
        <hass-loading-screen
          .hass=${this.hass}
          .narrow=${this.narrow}
        ></hass-loading-screen>
      `;
    }

    const all = this._addonInfo.addons;
    const addons = this._getAddons(all, this._filter, this._statusFilters);

    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        .route=${this.route}
        back-path="/config"
        .header=${this.hass.localize("ui.panel.config.apps.caption")}
      >
        <ha-icon-button
          slot="toolbar-icon"
          .disabled=${this._checkingUpdates}
          @click=${this._handleCheckUpdates}
          .path=${mdiRefresh}
          .label=${this.hass.localize(
            "ui.panel.config.apps.store.check_updates"
          )}
        ></ha-icon-button>
        <div class="page">
          <header class="heading">
            <div class="heading-text">
              <h2>${this.hass.localize("ui.panel.config.apps.caption")}</h2>
              <p>
                ${this.hass.localize("ui.panel.config.apps.installed.summary", {
                  number: all.length,
                })}
                ${this.hass.localize(
                  "ui.panel.config.apps.installed.page_summary"
                )}
              </p>
            </div>
            <ha-button size="l" href="/config/apps/available">
              <ha-svg-icon slot="start" .path=${mdiStorePlus}></ha-svg-icon>
              ${this.hass.localize("ui.panel.config.apps.store.title")}
            </ha-button>
          </header>
          <div class="filters">
            <ha-input-search
              appearance="outlined"
              .value=${this._filter}
              .placeholder=${this.hass.localize(
                "ui.panel.config.apps.installed.search",
                { number: all.length }
              )}
              @input=${this._handleSearchChange}
            >
            </ha-input-search>
            <div
              class="chips"
              role="group"
              aria-label=${this.hass.localize(
                "ui.panel.config.apps.installed.filters"
              )}
            >
              ${STATUS_FILTERS.map(
                (status) => html`
                  <ha-filter-chip
                    .selected=${this._statusFilters.includes(status)}
                    .label=${this.hass.localize(
                      `ui.panel.config.apps.installed.filter_${status}`
                    )}
                    .status=${status}
                    @click=${this._statusChipClicked}
                  ></ha-filter-chip>
                `
              )}
            </div>
          </div>
          <div class="content">
            ${
              all.length === 0
                ? html`
                    <ha-card outlined class="empty">
                      <div class="card-content">
                        <button class="link" @click=${this._openStore}>
                          ${this.hass.localize(
                            "ui.panel.config.apps.installed.no_apps"
                          )}
                        </button>
                      </div>
                    </ha-card>
                  `
                : addons.length === 0
                  ? html`
                      <ha-card outlined class="empty">
                        <div class="card-content">
                          ${this.hass.localize(
                            "ui.panel.config.apps.installed.no_matches"
                          )}
                        </div>
                      </ha-card>
                    `
                  : addons.map((addon) => this._renderApp(addon))
            }
          </div>
        </div>
      </hass-subpage>
    `;
  }

  private _renderApp(addon: HassioAddonInfo): TemplateResult {
    const stats = this._stats[addon.slug];
    const running = addon.state === "started";
    const tags = this._getAppTags(addon);
    return html`
      <ha-card
        role="button"
        tabindex="0"
        outlined
        .addon=${addon}
        @click=${this._addonTapped}
        @keydown=${this._addonKeydown}
        aria-label=${getAppDisplayName(addon.name, addon.stage)}
      >
        <div class="card-content">
          <div class="app">
            <div class="icon-wrapper">
              <ha-app-icon
                .slug=${addon.slug}
                .hasIcon=${addon.icon}
                .alt=${""}
              >
                <ha-svg-icon class="app-icon" .path=${mdiPuzzle}></ha-svg-icon>
              </ha-app-icon>
            </div>
            <div class="names">
              <div class="title">
                ${getAppDisplayName(addon.name, addon.stage)}
              </div>
              <div class="version">${addon.version}</div>
            </div>
            <div class="tags">
              <supervisor-apps-state
                .state=${addon.state}
              ></supervisor-apps-state>
              ${tags.map(
                (tag) => html`
                  <supervisor-apps-tag
                    .variant=${tag.variant}
                    .iconPath=${tag.iconPath}
                    .label=${tag.label}
                  ></supervisor-apps-tag>
                `
              )}
            </div>
          </div>
          ${
            running
              ? stats
                ? html`
                    <div class="usage">
                      ${this._renderMeter(
                        "ui.panel.config.apps.installed.cpu",
                        stats.cpu_percent
                      )}
                      ${this._renderMeter(
                        "ui.panel.config.apps.installed.memory",
                        stats.memory_percent
                      )}
                    </div>
                  `
                : nothing
              : html`<div class="idle">
                  ${this.hass.localize("ui.panel.config.apps.installed.idle")}
                </div>`
          }
        </div>
      </ha-card>
    `;
  }

  private _renderMeter(
    key: LocalizeKeys,
    value: number | null
  ): TemplateResult | typeof nothing {
    if (value === null || value === undefined) {
      return nothing;
    }
    const rounded = roundWithOneDecimal(value);
    return html`
      <div class="meter">
        <span>${this.hass.localize(key, { percent: `${rounded} %` })}</span>
        <ha-bar .value=${value}></ha-bar>
      </div>
    `;
  }

  private _getAddons = memoizeOne(
    (
      addons: HassioAddonInfo[],
      filter?: string,
      statuses: StatusFilter[] = []
    ) => {
      let filteredAddons = [...addons];
      if (filter) {
        const matches = searchMatcher(filter);
        filteredAddons = filteredAddons.filter((addon) =>
          matches(addon.name, addon.description, addon.slug)
        );
      }
      if (statuses.length) {
        filteredAddons = filteredAddons.filter(
          (addon) =>
            (statuses.includes("running") && addon.state === "started") ||
            (statuses.includes("stopped") && addon.state !== "started") ||
            (statuses.includes("update") && addon.update_available)
        );
      }
      return filteredAddons.sort((a, b) =>
        caseInsensitiveStringCompare(a.name, b.name, this.hass.locale.language)
      );
    }
  );

  private _statusChipClicked(ev: Event) {
    const status = (ev.currentTarget as any).status as StatusFilter;
    this._statusFilters = this._statusFilters.includes(status)
      ? this._statusFilters.filter((item) => item !== status)
      : [...this._statusFilters, status];
  }

  private _handleSearchChange(ev: InputEvent) {
    this._filter = (ev.target as HTMLInputElement).value;
  }

  private async _loadData(): Promise<void> {
    try {
      this._addonInfo = await fetchHassioAddonsInfo(this.hass);
      this._loadStats(this._addonInfo.addons);
    } catch (err: any) {
      this._error =
        err.message || this.hass.localize("ui.panel.config.apps.error_loading");
    }
  }

  /** Usage of each running app; an app whose figures cannot be read shows none. */
  private async _loadStats(addons: HassioAddonInfo[]): Promise<void> {
    const entries = await Promise.all(
      addons
        .filter((addon) => addon.state === "started")
        .map(async (addon) => {
          try {
            return [
              addon.slug,
              await fetchHassioStats(this.hass.callWS, `addons/${addon.slug}`),
            ] as const;
          } catch (_err: any) {
            return undefined;
          }
        })
    );
    this._stats = Object.fromEntries(
      entries.filter((entry): entry is NonNullable<typeof entry> => !!entry)
    );
  }

  private async _handleCheckUpdates() {
    this._checkingUpdates = true;
    try {
      const info = await checkForAppUpdates(this, this.hass);
      if (info) {
        this._addonInfo = info;
        this._loadStats(info.addons);
      } else {
        this._loadData();
      }
    } finally {
      this._checkingUpdates = false;
    }
  }

  private _addonKeydown(ev: KeyboardEvent) {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      this._addonTapped(ev);
    }
  }

  private _addonTapped(ev: Event): void {
    const addon = (ev.currentTarget as any).addon as HassioAddonInfo;
    navigate(`/config/app/${addon.slug}/info`);
  }

  private _openStore(): void {
    navigate("/config/apps/available");
  }

  private _getAppTags(addon: HassioAddonInfo): AppTag[] {
    const labels: AppTag[] = [];

    if (addon.update_available) {
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

  static styles: CSSResultGroup = [
    css`
      :host {
        display: block;
        height: 100%;
      }

      .page {
        box-sizing: border-box;
        max-width: 1100px;
        margin: 0 auto;
        padding: var(--ha-space-4) var(--ha-space-8) var(--ha-space-8);
      }
      :host([narrow]) .page {
        padding: var(--ha-space-2) var(--ha-space-3) var(--ha-space-6);
      }
      .heading {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--ha-space-4);
        margin-bottom: var(--ha-space-4);
      }
      .heading-text {
        flex: 1;
        min-width: 220px;
      }
      h2 {
        margin: 0 0 var(--ha-space-1);
        font-family: var(--ha-font-family-heading, inherit);
        font-size: var(--ha-font-size-3xl);
        font-weight: var(--ha-font-weight-medium);
        line-height: var(--ha-line-height-condensed);
      }
      .heading p {
        margin: 0;
        color: var(--secondary-text-color);
        line-height: var(--ha-line-height-normal);
      }
      .filters {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--ha-space-3);
        margin-bottom: var(--ha-space-4);
      }
      ha-input-search {
        flex: 1 1 260px;
        min-width: 0;
        max-width: 420px;
      }
      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: var(--ha-space-2);
      }
      .content {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(min(380px, 100%), 1fr));
        gap: var(--ha-space-4);
      }
      ha-card {
        cursor: pointer;
        overflow: hidden;
        border-radius: var(--ha-border-radius-3xl);
      }
      ha-card.empty {
        cursor: default;
        grid-column: 1 / -1;
      }
      ha-card[role="button"]:hover {
        background-color: var(--ha-color-fill-neutral-quiet-resting);
      }
      .card-content {
        padding: var(--ha-space-4);
        color: var(--primary-text-color);
      }
      .app {
        display: flex;
        align-items: center;
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
      .version {
        color: var(--secondary-text-color);
        font-size: var(--ha-font-size-s);
      }
      .tags {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: flex-end;
        gap: var(--ha-space-2);
      }
      .usage {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--ha-space-4);
      }
      :host([narrow]) .usage {
        grid-template-columns: 1fr;
      }
      .meter {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-1);
        font-size: var(--ha-font-size-s);
        color: var(--secondary-text-color);
      }
      ha-bar {
        --ha-bar-primary-color: var(
          --hassio-bar-ok-color,
          var(--success-color)
        );
      }
      .idle {
        font-size: var(--ha-font-size-s);
        color: var(--secondary-text-color);
      }
      button.link {
        color: var(--primary-color);
        background: none;
        border: none;
        padding: 0;
        font: inherit;
        text-align: start;
        text-decoration: underline;
        cursor: pointer;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-apps-installed": HaConfigAppsInstalled;
  }
}
