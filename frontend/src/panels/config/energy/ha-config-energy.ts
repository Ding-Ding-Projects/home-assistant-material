import "../../../layouts/hass-error-screen";
import { mdiDownload, mdiLightningBolt, mdiViewDashboardEdit } from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators";
import { navigate } from "../../../common/navigate";
import type {
  EnergyPreferencesValidation,
  EnergyInfo,
  EnergyPreferences,
} from "../../../data/energy";
import {
  getEnergyPreferenceValidation,
  getEnergyInfo,
  getEnergyPreferences,
  getReferencedStatisticIds,
} from "../../../data/energy";
import type { StatisticsMetaData } from "../../../data/recorder";
import { getStatisticMetadata } from "../../../data/recorder";
import "../../../layouts/hass-loading-screen";
import "../../../layouts/hass-subpage";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant, Route } from "../../../types";
import "../../../components/ha-button";
import "../../../components/ha-icon-button";
import "../../../components/ha-svg-icon";
import "./components/ha-energy-color-settings";
import "./components/ha-energy-device-settings";
import "./components/ha-energy-device-settings-water";
import "./components/ha-energy-grid-settings";
import "./components/ha-energy-solar-settings";
import "./components/ha-energy-home-settings";
import "./components/ha-energy-battery-settings";
import "./components/ha-energy-gas-settings";
import "./components/ha-energy-water-settings";
import { fileDownload } from "../../../util/file_download";
import { showToast } from "../../../util/toast";
import { showEnergyCustomiseDialog } from "./dialogs/show-dialog-energy-customise";

const INITIAL_CONFIG: EnergyPreferences = {
  energy_sources: [],
  device_consumption: [],
  device_consumption_water: [],
};

// The addresses /config/energy/<section> keep working: each one scrolls its
// section of the page into view.
const SECTIONS = ["electricity", "gas", "water"] as const;

@customElement("ha-config-energy")
class HaConfigEnergy extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @property({ attribute: "is-wide", type: Boolean }) public isWide = false;

  @property({ attribute: false }) public route!: Route;

  @state() private _info?: EnergyInfo;

  @state() private _preferences?: EnergyPreferences;

  @state() private _validationResult?: EnergyPreferencesValidation;

  @state() private _error?: string;

  @state() private _statsMetadata?: Record<string, StatisticsMetaData>;

  private get _currTab(): string {
    return this.route.path.substring(1) || "electricity";
  }

  protected willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("route")) {
      const tab = this.route.path.substring(1);
      if (!tab || !SECTIONS.some((section) => section === tab)) {
        navigate(`${this.route.prefix}/electricity`, { replace: true });
      }
    }
  }

  protected firstUpdated() {
    this._fetchConfig();
  }

  protected updated(changedProperties: PropertyValues<this>) {
    super.updated(changedProperties);
    // Bring the section named in the address into view, once the cards exist.
    if (!this._preferences || this._scrolledTo === this._currTab) {
      return;
    }
    this._scrolledTo = this._currTab;
    if (this._currTab !== "electricity") {
      this.shadowRoot?.getElementById(this._currTab)?.scrollIntoView();
    }
  }

  private _scrolledTo?: string;

  protected render(): TemplateResult {
    if (!this._preferences && !this._error) {
      return html`<hass-loading-screen
        .hass=${this.hass}
        .narrow=${this.narrow}
      ></hass-loading-screen>`;
    }

    if (this._error) {
      return html`<hass-error-screen
        .hass=${this.hass}
        .narrow=${this.narrow}
        .error=${this._error}
      ></hass-error-screen>`;
    }

    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        back-path="/config/lovelace/dashboards"
        .header=${this.hass.localize("ui.panel.config.energy.caption")}
      >
        <div slot="toolbar-icon" class="toolbar-icons">
          <ha-icon-button
            .path=${mdiViewDashboardEdit}
            .label=${this.hass.localize(
              "ui.panel.config.energy.customise.toolbar_action"
            )}
            @click=${this._customise}
          ></ha-icon-button>
          <ha-icon-button
            .path=${mdiDownload}
            .label=${this.hass.localize(
              "ui.panel.config.devices.download_diagnostics"
            )}
            @click=${this._downloadDiagnostics}
          ></ha-icon-button>
        </div>
        <div class="page">
          <div class="intro">
            <h2>${this.hass.localize("ui.panel.config.energy.title")}</h2>
            <p>${this.hass.localize("ui.panel.config.energy.summary")}</p>
          </div>
          <div class="cards">
            <ha-energy-grid-settings
              page
              id="electricity"
              .hass=${this.hass}
              .preferences=${this._preferences!}
              .statsMetadata=${this._statsMetadata}
              .validationResult=${this._validationResult}
              @value-changed=${this._prefsChanged}
            ></ha-energy-grid-settings>
            <ha-energy-solar-settings
              page
              .hass=${this.hass}
              .preferences=${this._preferences!}
              .statsMetadata=${this._statsMetadata}
              .validationResult=${this._validationResult}
              .info=${this._info}
              @value-changed=${this._prefsChanged}
            ></ha-energy-solar-settings>
            <ha-energy-battery-settings
              page
              .hass=${this.hass}
              .preferences=${this._preferences!}
              .statsMetadata=${this._statsMetadata}
              .validationResult=${this._validationResult}
              @value-changed=${this._prefsChanged}
            ></ha-energy-battery-settings>
            <ha-energy-home-settings
              page
              .hass=${this.hass}
              .preferences=${this._preferences!}
              .validationResult=${this._validationResult}
              @value-changed=${this._prefsChanged}
            ></ha-energy-home-settings>
            <ha-energy-device-settings
              page
              .hass=${this.hass}
              .preferences=${this._preferences!}
              .statsMetadata=${this._statsMetadata}
              .validationResult=${this._validationResult}
              @value-changed=${this._prefsChanged}
            ></ha-energy-device-settings>
            <ha-energy-gas-settings
              page
              id="gas"
              .hass=${this.hass}
              .preferences=${this._preferences!}
              .statsMetadata=${this._statsMetadata}
              .validationResult=${this._validationResult}
              @value-changed=${this._prefsChanged}
            ></ha-energy-gas-settings>
            <ha-energy-water-settings
              page
              id="water"
              .hass=${this.hass}
              .preferences=${this._preferences!}
              .statsMetadata=${this._statsMetadata}
              .validationResult=${this._validationResult}
              @value-changed=${this._prefsChanged}
            ></ha-energy-water-settings>
            <ha-energy-device-settings-water
              page
              .hass=${this.hass}
              .preferences=${this._preferences!}
              .statsMetadata=${this._statsMetadata}
              .validationResult=${this._validationResult}
              @value-changed=${this._prefsChanged}
            ></ha-energy-device-settings-water>
            <ha-energy-color-settings
              page
              .hass=${this.hass}
              .preferences=${this._preferences!}
              .statsMetadata=${this._statsMetadata}
              @value-changed=${this._prefsChanged}
            ></ha-energy-color-settings>
          </div>
          <div class="footer">
            <p>
              ${this.hass.localize("ui.panel.config.energy.new_device_info")}
            </p>
            <ha-button appearance="filled" @click=${this._openDashboard}>
              <ha-svg-icon slot="start" .path=${mdiLightningBolt}></ha-svg-icon>
              ${this.hass.localize("ui.panel.config.energy.open_dashboard")}
            </ha-button>
          </div>
        </div>
      </hass-subpage>
    `;
  }

  private _openDashboard() {
    navigate("/energy");
  }

  private async _fetchConfig() {
    this._error = undefined;

    const validationPromise = getEnergyPreferenceValidation(this.hass);
    const energyInfoPromise = await getEnergyInfo(this.hass.callWS);
    try {
      this._preferences = await getEnergyPreferences(this.hass.callWS);
    } catch (err: any) {
      if (err.code === "not_found") {
        this._preferences = INITIAL_CONFIG;
      } else {
        this._error = err.message;
      }
    }
    try {
      this._validationResult = await validationPromise;
    } catch (err: any) {
      this._error = err.message;
    }
    this._info = await energyInfoPromise;
    await this._fetchMetaData();
  }

  private async _prefsChanged(ev: CustomEvent) {
    this._preferences = ev.detail.value;
    this._validationResult = undefined;
    try {
      this._validationResult = await getEnergyPreferenceValidation(this.hass);
    } catch (err: any) {
      this._error = err.message;
    }
    this._info = await getEnergyInfo(this.hass.callWS);
    await this._fetchMetaData();
  }

  private async _fetchMetaData() {
    if (!this._preferences || !this._info) {
      return;
    }
    const statIDs = getReferencedStatisticIds(this._preferences, this._info);
    const statsMetadataArray = await getStatisticMetadata(
      this.hass.callWS,
      statIDs
    );
    const statsMetadata: Record<string, StatisticsMetaData> = {};
    statsMetadataArray.forEach((x) => {
      statsMetadata[x.statistic_id] = x;
    });
    this._statsMetadata = statsMetadata;
  }

  private _customise() {
    if (!this._preferences) {
      return;
    }
    showEnergyCustomiseDialog(this, {
      preferences: this._preferences,
      saveCallback: () => {
        showToast(this, {
          message: this.hass.localize("ui.panel.config.energy.customise.saved"),
        });
      },
    });
  }

  private async _downloadDiagnostics() {
    const data = {
      version: this.hass.config.version,
      info: this._info,
      preferences: this._preferences,
      metadata: this._statsMetadata,
      entities: Object.fromEntries(
        Object.keys(this._statsMetadata || {}).map((key) => [
          key,
          this.hass.entities[key],
        ])
      ),
      states: Object.fromEntries(
        Object.keys(this._statsMetadata || {}).map((key) => [
          key,
          this.hass.states[key],
        ])
      ),
      issues: this._validationResult,
    };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    fileDownload(url, "energy_diagnostics.json");
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        .toolbar-icons {
          display: flex;
          align-items: center;
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
        .intro {
          margin-bottom: var(--ha-space-4);
        }
        .intro h2 {
          margin: 0;
          font-family: var(--ha-font-family-heading, inherit);
          font-size: var(--ha-font-size-3xl);
          font-weight: var(--ha-font-weight-medium);
          line-height: var(--ha-line-height-condensed);
        }
        .intro p {
          margin: var(--ha-space-1) 0 0;
          color: var(--secondary-text-color);
          line-height: var(--ha-line-height-normal);
        }
        .cards {
          display: grid;
          grid-template-columns: repeat(
            auto-fill,
            minmax(min(100%, 320px), 1fr)
          );
          gap: var(--ha-space-4);
          align-items: stretch;
        }
        .cards > * {
          display: block;
          min-width: 0;
          scroll-margin-top: var(--ha-space-4);
        }
        .footer {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: var(--ha-space-4);
          margin-top: var(--ha-space-6);
        }
        .footer p {
          flex: 1 1 280px;
          margin: 0;
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-energy": HaConfigEnergy;
  }
}
