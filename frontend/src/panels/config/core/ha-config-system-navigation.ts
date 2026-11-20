import { mdiPower, mdiServer } from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { styleMap } from "lit/directives/style-map";
import { canShowPage } from "../../../common/config/can_show_page";
import { isComponentLoaded } from "../../../common/config/is_component_loaded";
import { relativeTime } from "../../../common/datetime/relative_time";
import { blankBeforePercent } from "../../../common/translations/blank_before_percent";
import "../../../components/ha-button";
import "../../../components/ha-icon-button";
import "../../../components/ha-svg-icon";
import "../../../components/ha-icon-next";
import "../../../components/input/ha-input-search";
import type { HaInputSearch } from "../../../components/input/ha-input-search";
import { LanguageModeController } from "../../../common/language-mode/language-mode-controller";
import type { PageNavigation } from "../../../layouts/hass-tabs-subpage";
import type { BackupContent } from "../../../data/backup";
import { fetchBackupInfo } from "../../../data/backup";
import type { CloudStatus } from "../../../data/cloud";
import type { HardwareInfo } from "../../../data/hardware";
import { BOARD_NAMES } from "../../../data/hardware";
import type {
  HassioHassOSInfo,
  HassioHostInfo,
} from "../../../data/hassio/host";
import {
  fetchHassioHassOsInfo,
  fetchHassioHostInfo,
} from "../../../data/hassio/host";
import type { LabPreviewFeature } from "../../../data/labs";
import { fetchLabFeatures } from "../../../data/labs";
import { showRestartDialog } from "../../../dialogs/restart/show-dialog-restart";
import "../../../layouts/hass-subpage";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";
import "../../../components/ha-config-navigation-list";
import { configSections } from "../config-sections";
import type { FlatStrings } from "../settings-page-search";
import {
  loadPageStrings,
  pageWords,
  renderHighlighted,
  searchPages,
} from "../settings-page-search";

@customElement("ha-config-system-navigation")
class HaConfigSystemNavigation extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @property({ attribute: "is-wide", type: Boolean }) public isWide = false;

  @property({ attribute: false }) public cloudStatus?: CloudStatus;

  @state() private _latestBackupDate?: Date;

  @state() private _boardName?: string;

  @state() private _storageInfo?: { used: number; free: number; total: number };

  @state() private _externalAccess = false;

  @state() private _labFeatures?: LabPreviewFeature[];

  /** The text of this page's own search field. */
  @state() private _filter = "";

  /** The interface text of the listed pages, loaded when a search needs it. */
  @state() private _pageStrings?: FlatStrings;

  // Draws the page again when the language mode changes.
  private _lang = new LanguageModeController(this);

  private _t = (key: string, values?: Record<string, string | number>) =>
    this._lang.text(this.hass.localize, key, values);

  protected render(): TemplateResult {
    const pages = configSections.general
      .filter((page) => canShowPage(this.hass, page))
      .map((page) => {
        let description: string;

        switch (page.translationKey) {
          case "backup":
            description = this._latestBackupDate
              ? this.hass.localize("ui.panel.config.backup.description", {
                  relative_time: relativeTime(
                    this._latestBackupDate,
                    this.hass.locale
                  ),
                })
              : this.hass.localize(
                  "ui.panel.config.backup.description_no_backup"
                );
            break;
          case "network":
            description = this.hass.localize(
              "ui.panel.config.network.description",
              {
                state: this._externalAccess
                  ? this.hass.localize("ui.panel.config.network.enabled")
                  : this.hass.localize("ui.panel.config.network.disabled"),
              }
            );
            break;
          case "storage":
            description = this._storageInfo
              ? this.hass.localize("ui.panel.config.storage.description", {
                  percent_used: `${Math.round(
                    ((this._storageInfo.total - this._storageInfo.free) /
                      this._storageInfo.total) *
                      100
                  )}${blankBeforePercent(this.hass.locale)}%`,
                  free_space: `${this._storageInfo.free} GB`,
                })
              : "";
            break;
          case "hardware":
            description =
              this._boardName ||
              this.hass.localize("ui.panel.config.hardware.description");
            break;
          case "labs":
            description =
              this._labFeatures && this._labFeatures.some((f) => f.enabled)
                ? this.hass.localize("ui.panel.config.labs.description_enabled")
                : this.hass.localize("ui.panel.config.labs.description");
            break;

          default:
            description = this.hass.localize(
              `ui.panel.config.${page.translationKey}.description`
            );
            break;
        }

        return {
          ...page,
          name: page.translationKey
            ? this.hass.localize(
                `ui.panel.config.${page.translationKey}.caption`
              )
            : page.name,
          description,
        };
      });

    return html`
      <hass-subpage
        .hass=${this.hass}
        back-path="/config"
        .header=${this.hass.localize("ui.panel.config.dashboard.system.main")}
        .narrow=${this.narrow}
      >
        <ha-icon-button
          slot="toolbar-icon"
          .path=${mdiPower}
          .label=${this.hass.localize(
            "ui.panel.config.system_dashboard.restart_homeassistant"
          )}
          @click=${this._showRestartDialog}
        ></ha-icon-button>
        <div class="page">
          <section class="hero">
            <ha-svg-icon .path=${mdiServer}></ha-svg-icon>
            <div class="hero-text">
              <span class="eyebrow"
                >${this.hass.localize(
                  "ui.panel.config.system_dashboard.this_machine"
                )}</span
              >
              <h2>${this._heroTitle()}</h2>
              <p>${this._heroFacts()}</p>
            </div>
            <ha-button @click=${this._showRestartDialog}>
              <ha-svg-icon slot="start" .path=${mdiPower}></ha-svg-icon>
              ${this.hass.localize(
                "ui.panel.config.system_dashboard.restart_short"
              )}
            </ha-button>
          </section>
          ${this._renderSearch(pages)}
        </div>
      </hass-subpage>
    `;
  }

  /**
   * The search field over the listed pages, then either every page as tiles
   * or the pages the search shows, with their matches marked. Hidden pages
   * are counted; clearing the field shows every page again.
   */
  private _renderSearch(pages: PageNavigation[]): TemplateResult {
    const label = this.hass.localize("ui.panel.config.dashboard.system.main");
    const query = this._filter;
    const cantonese = this._lang.mode !== "english";
    const strings = this._pageStrings;
    const result = searchPages(
      pages,
      query,
      (page) => ({ name: page.name ?? "", description: page.description }),
      (page) =>
        strings && page.translationKey
          ? pageWords(strings, page.translationKey, cantonese)
          : []
    );
    const shown = result.shown.length;

    return html`
      <section class="search">
        <ha-input-search
          appearance="outlined"
          .label=${this._t("ui.panel.config.system_dashboard.search")}
          .value=${query}
          .patternSamples=${pages.map((page) => page.name ?? "")}
          @input=${this._handleSearchChange}
        ></ha-input-search>
        <p class="count" role="status">
          ${
            query
              ? this._t("ui.components.top_bar_search.page_matches", {
                  total: result.total,
                  shown,
                  query,
                })
              : this._t("ui.components.top_bar_search.page_count", {
                  total: result.total,
                })
          }
        </p>
      </section>
      ${
        !query
          ? html`<ha-config-navigation-list
              grid
              .narrow=${this.narrow}
              .pages=${pages}
              has-secondary
              .label=${label}
            ></ha-config-navigation-list>`
          : shown
            ? html`<nav class="results" aria-label=${label}>
                ${result.shown.map(
                  ({ page, foundIn }) =>
                    html`<a class="row" href=${page.path}>
                      <span
                        class="icon"
                        style=${styleMap({
                          "--page-color": page.iconColor ?? null,
                        })}
                      >
                        <ha-svg-icon
                          .path=${page.iconPath}
                          .secondaryPath=${page.iconSecondaryPath}
                          .viewBox=${page.iconViewBox}
                        ></ha-svg-icon>
                      </span>
                      <span class="text">
                        <span class="name"
                          >${renderHighlighted(query, page.name ?? "")}</span
                        >
                        <span class="summary"
                          >${
                            foundIn
                              ? html`${this._t(
                                  "ui.components.top_bar_search.found_in_page_label"
                                )}
                                ${renderHighlighted(query, foundIn)}`
                              : renderHighlighted(query, page.description ?? "")
                          }</span
                        >
                      </span>
                      <ha-icon-next></ha-icon-next>
                    </a>`
                )}
              </nav>`
            : html`<p class="empty" role="status">
                ${this._t("ui.panel.config.system_dashboard.search_empty")}
              </p>`
      }
      ${
        query && result.hidden
          ? html`<p class="hidden-count">
              ${this._t("ui.components.top_bar_search.pages_hidden", {
                hidden: result.hidden,
                total: result.total,
              })}
            </p>`
          : nothing
      }
    `;
  }

  private _handleSearchChange(ev: InputEvent): void {
    this._filter = (ev.target as HaInputSearch).value ?? "";
    if (this._filter && !this._pageStrings) {
      loadPageStrings().then((strings) => {
        this._pageStrings = strings;
      });
    }
  }

  /** What is running, and whether it is running normally. */
  private _heroTitle(): string {
    const config = this.hass.config;
    const name =
      this._boardName ||
      this.hass.localize("ui.panel.config.system_dashboard.product", {
        version: config.version,
      });
    const key = config.recovery_mode
      ? "recovery"
      : config.safe_mode
        ? "safe"
        : config.state === "RUNNING"
          ? "running"
          : "starting";
    return this.hass.localize(`ui.panel.config.system_dashboard.state_${key}`, {
      name,
    });
  }

  /** A line of facts the instance reports about itself; nothing estimated. */
  private _heroFacts(): string {
    const config = this.hass.config;
    const facts = [
      this._boardName
        ? this.hass.localize("ui.panel.config.system_dashboard.fact_version", {
            version: config.version,
          })
        : undefined,
      this.hass.localize("ui.panel.config.system_dashboard.fact_integrations", {
        count: config.components.filter((name) => !name.includes(".")).length,
      }),
      this._storageInfo
        ? this.hass.localize("ui.panel.config.system_dashboard.fact_storage", {
            percent: Math.round(
              ((this._storageInfo.total - this._storageInfo.free) /
                this._storageInfo.total) *
                100
            ),
          })
        : undefined,
      this.hass.localize("ui.panel.config.system_dashboard.fact_time_zone", {
        time_zone: config.time_zone,
      }),
    ].filter(Boolean);
    return facts.join(" ");
  }

  protected firstUpdated(_changedProperties: PropertyValues<this>): void {
    super.firstUpdated(_changedProperties);

    this._fetchNetworkStatus();
    const isHassioLoaded = isComponentLoaded(this.hass.config, "hassio");
    this._fetchBackupInfo();
    this._fetchHardwareInfo(isHassioLoaded);
    this._fetchLabFeatures();
    if (isHassioLoaded) {
      this._fetchStorageInfo();
    }
  }

  private async _fetchBackupInfo() {
    const backups: BackupContent[] = isComponentLoaded(
      this.hass.config,
      "backup"
    )
      ? await fetchBackupInfo(this.hass).then(
          (backupData) => backupData.backups
        )
      : [];

    if (backups.length > 0) {
      this._latestBackupDate = backups
        .map((backup) => new Date(backup.date))
        .reduce((a, b) => (a > b ? a : b));
    }
  }

  private async _fetchHardwareInfo(isHassioLoaded: boolean) {
    if (isComponentLoaded(this.hass.config, "hardware")) {
      const hardwareInfo: HardwareInfo = await this.hass.callWS({
        type: "hardware/info",
      });
      this._boardName =
        hardwareInfo?.hardware.find((hw) => hw.board !== null)?.name ??
        undefined;
    } else if (isHassioLoaded) {
      const osData: HassioHassOSInfo = await fetchHassioHassOsInfo(this.hass);
      if (osData.board) {
        this._boardName = BOARD_NAMES[osData.board];
      }
    }
  }

  private async _fetchStorageInfo() {
    const hostInfo: HassioHostInfo = await fetchHassioHostInfo(this.hass);
    this._storageInfo = {
      used: hostInfo.disk_used,
      free: hostInfo.disk_free,
      total: hostInfo.disk_total,
    };
  }

  private _fetchNetworkStatus() {
    this._externalAccess = this.hass.config.external_url != null;
  }

  private async _fetchLabFeatures() {
    if (isComponentLoaded(this.hass.config, "labs")) {
      this._labFeatures = await fetchLabFeatures(this.hass);
    }
  }

  private async _showRestartDialog() {
    showRestartDialog(this);
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
        .hero {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-4);
          margin-bottom: var(--ha-space-4);
          padding: var(--ha-space-5) var(--ha-space-6);
          border-radius: var(--ha-border-radius-3xl);
          background: var(--card-background-color);
          --mdc-icon-size: 28px;
        }
        .hero-text {
          flex: 1;
          min-width: 220px;
        }
        .eyebrow {
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        h2 {
          margin: var(--ha-space-1) 0;
          font-family: var(--ha-font-family-heading, inherit);
          font-size: var(--ha-font-size-3xl);
          font-weight: var(--ha-font-weight-medium);
          line-height: var(--ha-line-height-condensed);
          /* Long product names and versions wrap instead of being cut. */
          overflow: visible;
          text-overflow: clip;
          white-space: normal;
          overflow-wrap: anywhere;
        }
        :host([narrow]) h2 {
          font-size: var(--ha-font-size-2xl);
        }
        .hero p {
          margin: 0;
          color: var(--secondary-text-color);
          line-height: var(--ha-line-height-normal);
        }
        ha-config-navigation-list {
          --navigation-grid-columns: 2;
        }
        .search {
          margin-bottom: var(--ha-space-4);
          padding: var(--ha-space-4);
          border-radius: var(--ha-border-radius-3xl);
          background: var(--ha-color-fill-primary-normal-resting);
          color: var(--ha-color-on-primary-normal, var(--primary-text-color));
        }
        .search ha-input-search {
          display: block;
        }
        .count {
          margin: var(--ha-space-2) var(--ha-space-1) 0;
          font-size: var(--ha-font-size-s);
          line-height: var(--ha-line-height-normal);
        }
        .results {
          display: flex;
          flex-direction: column;
          padding: var(--ha-space-1) var(--ha-space-3);
          border-radius: var(--ha-border-radius-3xl);
          background: var(--card-background-color);
        }
        .row {
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
          min-height: 60px;
          box-sizing: border-box;
          padding: var(--ha-space-2) var(--ha-space-1);
          border-top: 1px solid var(--divider-color);
          color: var(--primary-text-color);
          text-decoration: none;
          border-radius: var(--ha-border-radius-lg);
        }
        .row:first-child {
          border-top: none;
        }
        .row:focus-visible {
          outline: 2px solid var(--primary-color);
          outline-offset: 2px;
        }
        .row .icon {
          flex: none;
          display: grid;
          place-items: center;
          width: 40px;
          height: 40px;
          border-radius: 14px;
          background: color-mix(
            in srgb,
            var(--page-color, var(--primary-color)) 28%,
            var(--card-background-color)
          );
          --mdc-icon-size: 20px;
        }
        .row .text {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
        }
        .row .name {
          font-weight: var(--ha-font-weight-medium);
          overflow-wrap: anywhere;
        }
        .row .summary {
          font-size: var(--ha-font-size-s);
          line-height: var(--ha-line-height-normal);
          color: var(--secondary-text-color);
          overflow-wrap: anywhere;
        }
        .row ha-icon-next {
          flex: none;
          color: var(--secondary-text-color);
        }
        mark {
          border-radius: 4px;
          padding: 0 2px;
          background: var(--ha-color-fill-warning-normal-resting);
          color: var(--ha-color-on-warning-normal, inherit);
        }
        .empty,
        .hidden-count {
          margin: var(--ha-space-3) var(--ha-space-1) 0;
          font-size: var(--ha-font-size-s);
          line-height: var(--ha-line-height-normal);
          color: var(--secondary-text-color);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-system-navigation": HaConfigSystemNavigation;
  }
}
