import { mdiMapMarker } from "@mdi/js";
import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { UNIT_C } from "../../../common/const";
import { stopPropagation } from "../../../common/dom/stop_propagation";
import { navigate } from "../../../common/navigate";
import "../../../components/buttons/ha-progress-button";
import type { HaProgressButton } from "../../../components/buttons/ha-progress-button";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-checkbox";
import type { HaCheckbox } from "../../../components/ha-checkbox";
import "../../../components/ha-country-picker";
import "../../../components/ha-currency-picker";
import "../../../components/ha-language-picker";
import "../../../components/ha-select-box";
import "../../../components/ha-svg-icon";
import "../../../components/ha-timezone-picker";
import "../../../components/input/ha-input";
import type { HaInput } from "../../../components/input/ha-input";
import "../../../components/map/ha-map";
import type { ConfigUpdateValues } from "../../../data/core";
import { saveCoreConfig } from "../../../data/core";
import { showConfirmationDialog } from "../../../dialogs/generic/show-dialog-box";
import "../../../layouts/hass-subpage";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant, ValueChangedEvent } from "../../../types";

@customElement("ha-config-section-general")
class HaConfigSectionGeneral extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @state() private _submitting = false;

  @state() private _unitSystem?: ConfigUpdateValues["unit_system"];

  @state() private _currency?: string;

  @state() private _language?: string;

  @state() private _country?: string | null;

  @state() private _name?: string;

  @state() private _elevation?: number;

  @state() private _timeZone?: string;

  @state() private _error?: string;

  @state() private _updateUnits?: boolean;

  protected render(): TemplateResult {
    const config = this.hass.config;
    const canEdit = ["storage", "default"].includes(config.config_source);
    const disabled = this._submitting || !canEdit;
    return html`
      <hass-subpage
        back-path="/config/system"
        .hass=${this.hass}
        .narrow=${this.narrow}
        .header=${this.hass.localize("ui.panel.config.core.caption")}
      >
        <div class="page">
          <div class="intro">
            <h2>${this.hass.localize("ui.panel.config.core.caption")}</h2>
            <p>${this._summary()}</p>
          </div>
          ${
            this._error
              ? html`<ha-alert alert-type="error">${this._error}</ha-alert>`
              : nothing
          }
          ${
            !canEdit
              ? html`<ha-alert>
                  ${this.hass.localize(
                    "ui.panel.config.core.section.core.core_config.edit_requires_storage"
                  )}
                </ha-alert>`
              : nothing
          }
          <div class="columns">
            <div class="column">
              <ha-input
                name="name"
                .label=${this.hass.localize(
                  "ui.panel.config.core.section.core.core_config.location_name"
                )}
                .disabled=${disabled}
                .value=${this._name}
                @change=${this._handleChange}
              ></ha-input>
              <div class="pair">
                <ha-country-picker
                  .label=${this.hass.localize(
                    "ui.panel.config.core.section.core.core_config.country"
                  )}
                  name="country"
                  .disabled=${disabled}
                  .value=${this._country}
                  @value-changed=${this._handleValueChanged}
                ></ha-country-picker>
                <ha-language-picker
                  native-name
                  .label=${this.hass.localize(
                    "ui.panel.config.core.section.core.core_config.language"
                  )}
                  name="language"
                  .value=${this._language}
                  .disabled=${disabled}
                  @closed=${stopPropagation}
                  @value-changed=${this._handleValueChanged}
                ></ha-language-picker>
                <ha-timezone-picker
                  .label=${this.hass.localize(
                    "ui.panel.config.core.section.core.core_config.time_zone"
                  )}
                  name="timeZone"
                  .disabled=${disabled}
                  .value=${this._timeZone}
                  @value-changed=${this._handleValueChanged}
                  hide-clear-icon
                ></ha-timezone-picker>
                <div>
                  <ha-currency-picker
                    .label=${this.hass.localize(
                      "ui.panel.config.core.section.core.core_config.currency"
                    )}
                    name="currency"
                    .disabled=${disabled}
                    .value=${this._currency}
                    @value-changed=${this._handleValueChanged}
                  ></ha-currency-picker>
                  <a
                    href="https://en.wikipedia.org/wiki/ISO_4217#Active_codes"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="find-value"
                    >${this.hass.localize(
                      "ui.panel.config.core.section.core.core_config.find_currency_value"
                    )}</a
                  >
                </div>
              </div>
              <section class="card">
                <h3>
                  ${this.hass.localize(
                    "ui.panel.config.core.section.core.core_config.unit_system"
                  )}
                </h3>
                ${this._renderUnits(disabled)}
              </section>
            </div>
            <div class="column">
              ${this._renderMap(canEdit)}
              <ha-input
                name="elevation"
                type="number"
                .label=${this.hass.localize(
                  "ui.panel.config.core.section.core.core_config.elevation"
                )}
                .disabled=${disabled}
                .value=${
                  this._elevation !== undefined ? String(this._elevation) : ""
                }
                @change=${this._handleChange}
              >
                <span slot="end"
                  >${this.hass.localize(
                    "ui.panel.config.core.section.core.core_config.elevation_meters"
                  )}</span
                >
              </ha-input>
              <p class="hint">
                ${this.hass.localize(
                  "ui.panel.config.core.section.core.core_config.location_hint"
                )}
              </p>
            </div>
          </div>
          <div class="actions">
            <ha-button
              appearance="plain"
              .disabled=${disabled || !this._dirty()}
              @click=${this._discard}
            >
              ${this.hass.localize(
                "ui.panel.config.core.section.core.core_config.discard_button"
              )}
            </ha-button>
            <ha-progress-button
              appearance="filled"
              @click=${this._save}
              .disabled=${disabled || !this._dirty()}
            >
              ${this.hass.localize("ui.common.save")}
            </ha-progress-button>
          </div>
        </div>
      </hass-subpage>
    `;
  }

  private _renderUnits(disabled: boolean): TemplateResult {
    return html`
      <ha-select-box
        name="unit_system"
        .value=${this._unitSystem}
        .disabled=${disabled}
        @value-changed=${this._unitSystemChanged}
        .options=${[
          {
            value: "metric",
            label: this.hass.localize(
              "ui.panel.config.core.section.core.core_config.metric_example"
            ),
            description: this.hass.localize(
              "ui.panel.config.core.section.core.core_config.unit_system_metric"
            ),
          },
          {
            value: "us_customary",
            label: this.hass.localize(
              "ui.panel.config.core.section.core.core_config.us_customary_example"
            ),
            description: this.hass.localize(
              "ui.panel.config.core.section.core.core_config.unit_system_us_customary"
            ),
          },
        ]}
      >
      </ha-select-box>
      ${
        this._unitSystem !== this._configuredUnitSystem()
          ? html`
              <ha-checkbox
                .checked=${this._updateUnits}
                .disabled=${this._submitting}
                @change=${this._updateUnitsChanged}
              >
                ${this.hass.localize(
                  "ui.panel.config.core.section.core.core_config.update_units_label"
                )}
                <div slot="hint">
                  ${this.hass.localize(
                    "ui.panel.config.core.section.core.core_config.update_units_text_1"
                  )}
                  ${this.hass.localize(
                    "ui.panel.config.core.section.core.core_config.update_units_text_2"
                  )}
                  <br /><br />
                  ${this.hass.localize(
                    "ui.panel.config.core.section.core.core_config.update_units_text_3"
                  )}
                </div>
              </ha-checkbox>
            `
          : nothing
      }
    `;
  }

  private _renderMap(canEdit: boolean): TemplateResult {
    const hasHomeZone = "zone.home" in this.hass.states;
    return html`
      <div class="map-card">
        ${
          hasHomeZone
            ? html`<ha-map
                .entities=${["zone.home"]}
                .zoom=${14}
                .autoFit=${true}
                .fitZones=${true}
                .themeMode=${"auto"}
                .renderPassive=${false}
                .interactiveZones=${false}
                class="map-preview"
              ></ha-map>`
            : html`<div class="no-map">
                <ha-svg-icon .path=${mdiMapMarker}></ha-svg-icon>
                <p>
                  ${this.hass.localize(
                    "ui.panel.config.core.section.core.core_config.no_home_zone"
                  )}
                </p>
              </div>`
        }
        <ha-button
          class="edit-location"
          appearance="filled"
          @click=${this._editLocation}
          .disabled=${!canEdit}
        >
          ${this.hass.localize("ui.common.edit")}
        </ha-button>
      </div>
    `;
  }

  private _summary(): string {
    return this.hass.localize(
      "ui.panel.config.core.section.core.core_config.summary",
      {
        name: this.hass.config.location_name,
        time_zone: this.hass.config.time_zone,
        units: this.hass.localize(
          this._configuredUnitSystem() === "metric"
            ? "ui.panel.config.core.section.core.core_config.summary_metric"
            : "ui.panel.config.core.section.core.core_config.summary_us_customary"
        ),
      }
    );
  }

  private _configuredUnitSystem() {
    return this.hass.config.unit_system.temperature === UNIT_C
      ? "metric"
      : "us_customary";
  }

  private _dirty(): boolean {
    const config = this.hass.config;
    return (
      this._name !== config.location_name ||
      this._timeZone !== (config.time_zone || "Etc/GMT") ||
      Number(this._elevation) !== config.elevation ||
      this._unitSystem !== this._configuredUnitSystem() ||
      this._currency !== config.currency ||
      this._country !== config.country ||
      this._language !== config.language
    );
  }

  protected firstUpdated(): void {
    this._resetFields();
  }

  private _resetFields(): void {
    this._unitSystem = this._configuredUnitSystem();
    this._currency = this.hass.config.currency;
    this._country = this.hass.config.country;
    this._language = this.hass.config.language;
    this._elevation = this.hass.config.elevation;
    this._timeZone = this.hass.config.time_zone || "Etc/GMT";
    this._name = this.hass.config.location_name;
    this._updateUnits = true;
  }

  private _discard(): void {
    this._error = undefined;
    this._resetFields();
  }

  private _handleValueChanged(ev: ValueChangedEvent<string>) {
    const target = ev.currentTarget as HTMLElement;
    this[`_${target.getAttribute("name")}`] = ev.detail.value;
  }

  private _handleChange(ev: InputEvent) {
    const target = ev.currentTarget as HaInput;
    this[`_${target.name}`] = target.value;
  }

  private _unitSystemChanged(ev: ValueChangedEvent<string>) {
    this._unitSystem = ev.detail.value as "metric" | "us_customary";
  }

  private _updateUnitsChanged(ev: CustomEvent) {
    this._updateUnits = (ev.target as HaCheckbox).checked;
  }

  private async _save(ev: CustomEvent) {
    const button = ev.target as HaProgressButton;
    if (button.progress) {
      return;
    }
    const unitSystemChanged = this._unitSystem !== this._configuredUnitSystem();
    if (unitSystemChanged && this._updateUnits) {
      if (
        !(await showConfirmationDialog(this, {
          title: this.hass.localize(
            "ui.panel.config.core.section.core.core_config.update_units_confirm_title"
          ),
          text: this.hass.localize(
            "ui.panel.config.core.section.core.core_config.update_units_confirm_text"
          ),
          confirmText: this.hass!.localize(
            "ui.panel.config.core.section.core.core_config.update_units_confirm_update"
          ),
          dismissText: this.hass!.localize("ui.common.cancel"),
        }))
      ) {
        return;
      }
    }
    button.progress = true;
    this._submitting = true;
    this._error = undefined;

    try {
      await saveCoreConfig(this.hass, {
        location_name: this._name,
        time_zone: this._timeZone,
        elevation: Number(this._elevation),
        unit_system: this._unitSystem,
        update_units: this._updateUnits && unitSystemChanged,
        currency: this._currency,
        country: this._country,
        language: this._language,
      });
      button.actionSuccess();
    } catch (err: any) {
      button.actionError();
      this._error = err.message;
    } finally {
      button.progress = false;
      this._submitting = false;
    }
  }

  private _editLocation() {
    navigate("/config/zone/edit/zone.home");
  }

  static styles = [
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
      ha-alert {
        display: block;
        margin-bottom: var(--ha-space-4);
      }
      .columns {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        align-items: start;
        gap: var(--ha-space-4);
      }
      :host([narrow]) .columns {
        grid-template-columns: minmax(0, 1fr);
      }
      @media (max-width: 800px) {
        .columns {
          grid-template-columns: minmax(0, 1fr);
        }
      }
      .column {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-4);
        min-width: 0;
      }
      .pair {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: var(--ha-space-4);
      }
      .pair > * {
        min-width: 0;
      }
      .card {
        padding: var(--ha-space-5) var(--ha-space-6);
        border-radius: var(--ha-border-radius-3xl);
        background: var(--card-background-color);
      }
      h3 {
        margin: 0 0 var(--ha-space-3);
        font-size: var(--ha-font-size-l);
        font-weight: var(--ha-font-weight-medium);
      }
      a.find-value {
        margin-top: var(--ha-space-2);
        display: inline-block;
      }
      .map-card {
        position: relative;
        overflow: hidden;
        border-radius: var(--ha-border-radius-3xl);
        background: var(--card-background-color);
      }
      .map-preview {
        display: block;
        width: 100%;
        height: 280px;
      }
      .no-map {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: var(--ha-space-8) var(--ha-space-4);
        color: var(--secondary-text-color);
        text-align: center;
      }
      .edit-location {
        position: absolute;
        inset-block-end: var(--ha-space-3);
        inset-inline-end: var(--ha-space-3);
      }
      .no-map + .edit-location {
        position: static;
        margin: 0 var(--ha-space-3) var(--ha-space-3);
        display: block;
      }
      .hint {
        margin: 0;
        font-size: var(--ha-font-size-s);
        color: var(--secondary-text-color);
      }
      .actions {
        display: flex;
        justify-content: flex-end;
        gap: var(--ha-space-2);
        margin-top: var(--ha-space-4);
      }
      ha-checkbox {
        display: block;
        margin-top: var(--ha-space-3);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-section-general": HaConfigSectionGeneral;
  }
}
