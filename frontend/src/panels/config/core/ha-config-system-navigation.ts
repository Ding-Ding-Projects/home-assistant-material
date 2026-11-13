import { mdiPower, mdiServer } from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators";
import { canShowPage } from "../../../common/config/can_show_page";
import { isComponentLoaded } from "../../../common/config/is_component_loaded";
import { relativeTime } from "../../../common/datetime/relative_time";
import { blankBeforePercent } from "../../../common/translations/blank_before_percent";
import "../../../components/ha-button";
import "../../../components/ha-icon-button";
import "../../../components/ha-svg-icon";
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
          <ha-config-navigation-list
            grid
            .narrow=${this.narrow}
            .pages=${pages}
            has-secondary
            .label=${this.hass.localize("ui.panel.config.dashboard.system.main")}
          ></ha-config-navigation-list>
        </div>
      </hass-subpage>
    `;
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
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-system-navigation": HaConfigSystemNavigation;
  }
}
