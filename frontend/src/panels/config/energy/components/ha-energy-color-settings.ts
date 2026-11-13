import type { ContextType } from "@lit/context";
import { mdiPalette } from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import { getGraphColorByIndex } from "../../../../common/color/colors";
import { consume } from "../../../../common/decorators/consume";
import { fireEvent } from "../../../../common/dom/fire_event";
import "../../../../components/ha-card";
import "../../../../components/ha-color-rainbow-button";
import "../../../../components/ha-svg-icon";
import "../../../../components/ha-switch";
import type { HaSwitch } from "../../../../components/ha-switch";
import {
  internationalizationContext,
  statesContext,
} from "../../../../data/context";
import type { EnergyPreferences } from "../../../../data/energy";
import { saveEnergyPreferences } from "../../../../data/energy";
import {
  normalizeEnergyColors,
  withEnergyColor,
} from "../../../../data/energy-colors";
import type { StatisticsMetaData } from "../../../../data/recorder";
import { getStatisticLabel } from "../../../../data/recorder";
import { showAlertDialog } from "../../../../dialogs/generic/show-dialog-box";
import { haStyle } from "../../../../resources/styles";
import type { HomeAssistant } from "../../../../types";
import { energyCardStyles } from "./styles";

const THEME_SWATCHES = 4;

/**
 * Lists every energy source and device with a color row: the first colors of
 * the theme palette and a rainbow that opens the full picker. By default the
 * charts follow the theme; a chosen color is stored in the energy preferences.
 */
@customElement("ha-energy-color-settings")
export class EnergyColorSettings extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public preferences!: EnergyPreferences;

  @property({ attribute: false })
  public statsMetadata?: Record<string, StatisticsMetaData>;

  @property({ type: Boolean, reflect: true }) public page = false;

  @state()
  @consume({ context: internationalizationContext, subscribe: true })
  private _i18n!: ContextType<typeof internationalizationContext>;

  @state()
  @consume({ context: statesContext, subscribe: true })
  private _states!: ContextType<typeof statesContext>;

  // Whether the person is picking colors of their own. Starts on when some
  // are already stored.
  @state() private _custom?: boolean;

  private _entries(): { statId: string; name: string }[] {
    const ids = new Map<string, string | undefined>();
    const add = (statId?: string | null, name?: string) => {
      if (statId && !ids.has(statId)) {
        ids.set(statId, name);
      }
    };
    for (const source of this.preferences.energy_sources) {
      switch (source.type) {
        case "grid":
          add(source.stat_energy_from, source.name);
          add(source.stat_energy_to, source.name);
          break;
        case "battery":
          add(source.stat_energy_from);
          add(source.stat_energy_to);
          break;
        case "solar":
        case "gas":
        case "water":
          add(source.stat_energy_from, source.name);
          break;
        default:
          break;
      }
    }
    for (const device of [
      ...this.preferences.device_consumption,
      ...(this.preferences.device_consumption_water || []),
    ]) {
      add(device.stat_consumption, device.name);
    }
    return Array.from(ids, ([statId, name]) => ({
      statId,
      name:
        name ||
        getStatisticLabel(
          this._states,
          this.hass.formatEntityName,
          statId,
          this.statsMetadata?.[statId]
        ),
    }));
  }

  protected render(): TemplateResult {
    const colors = normalizeEnergyColors(this.preferences.colors);
    const custom = this._custom ?? Object.keys(colors).length > 0;
    const entries = this._entries();
    const style = getComputedStyle(this);
    const theme = Array.from({ length: THEME_SWATCHES }, (_, i) =>
      getGraphColorByIndex(i, style)
    );

    return html`
      <ha-card>
        <h1 class="card-header">
          <ha-svg-icon .path=${mdiPalette}></ha-svg-icon>
          ${this._i18n.localize("ui.panel.config.energy.colors.title")}
        </h1>
        <div class="card-content">
          <p>${this._i18n.localize("ui.panel.config.energy.colors.sub")}</p>
          <label class="row follow">
            <span class="content">
              <b
                >${this._i18n.localize(
                  "ui.panel.config.energy.colors.follow_theme"
                )}</b
              >
            </span>
            <ha-switch
              .checked=${!custom}
              @change=${this._followChanged}
            ></ha-switch>
          </label>
          ${
            entries.length === 0
              ? html`<p>
                  ${this._i18n.localize("ui.panel.config.energy.colors.empty")}
                </p>`
              : html`
                  <div class="items-container">
                    ${entries.map(({ statId, name }) => {
                      const chosen = colors[statId];
                      return html`
                        <div class="row" role="group" aria-label=${name}>
                          <span class="content">${name}</span>
                          <div class="palette">
                            ${theme.map(
                              (color, index) => html`
                                <button
                                  type="button"
                                  class=${classMap({
                                    swatch: true,
                                    selected: chosen === color.toLowerCase(),
                                  })}
                                  style=${styleMap({ backgroundColor: color })}
                                  aria-pressed=${
                                    chosen === color.toLowerCase()
                                      ? "true"
                                      : "false"
                                  }
                                  aria-label=${this._i18n.localize(
                                    "ui.panel.config.energy.colors.theme_color",
                                    { index: index + 1 }
                                  )}
                                  title=${this._i18n.localize(
                                    "ui.panel.config.energy.colors.pick_for",
                                    { name }
                                  )}
                                  .disabled=${!custom}
                                  data-stat=${statId}
                                  data-color=${color}
                                  @click=${this._swatchClicked}
                                ></button>
                              `
                            )}
                            <ha-color-rainbow-button
                              .value=${chosen}
                              .disabled=${!custom}
                              data-stat=${statId}
                              @value-changed=${this._rainbowChanged}
                            ></ha-color-rainbow-button>
                            ${
                              chosen
                                ? html`<button
                                    type="button"
                                    class="reset"
                                    .disabled=${!custom}
                                    aria-label=${this._i18n.localize(
                                      "ui.panel.config.energy.colors.reset",
                                      { name }
                                    )}
                                    data-stat=${statId}
                                    @click=${this._resetClicked}
                                  >
                                    ×
                                  </button>`
                                : html`<span class="reset-gap"></span>`
                            }
                          </div>
                        </div>
                      `;
                    })}
                  </div>
                `
          }
        </div>
      </ha-card>
    `;
  }

  private async _followChanged(ev: Event) {
    const follow = (ev.target as HaSwitch).checked;
    this._custom = !follow;
    if (follow && Object.keys(this.preferences.colors || {}).length > 0) {
      await this._save({});
    }
  }

  private _swatchClicked(ev: Event) {
    const { stat, color } = (ev.currentTarget as HTMLElement).dataset;
    if (stat && color) {
      this._setColor(stat, color);
    }
  }

  private _rainbowChanged(ev: CustomEvent<{ value: string }>) {
    ev.stopPropagation();
    const { stat } = (ev.currentTarget as HTMLElement).dataset;
    if (stat) {
      this._setColor(stat, ev.detail.value);
    }
  }

  private _resetClicked(ev: Event) {
    const { stat } = (ev.currentTarget as HTMLElement).dataset;
    if (stat) {
      this._setColor(stat, undefined);
    }
  }

  private async _setColor(statId: string, color?: string) {
    await this._save(withEnergyColor(this.preferences.colors, statId, color));
  }

  private async _save(colors: Record<string, string>) {
    try {
      const result = await saveEnergyPreferences(this.hass, {
        ...this.preferences,
        colors,
      });
      fireEvent(this, "value-changed", { value: result });
    } catch (err: any) {
      showAlertDialog(this, {
        title: this._i18n.localize(
          "ui.panel.config.energy.colors.save_failed",
          { error: err.message }
        ),
      });
    }
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      energyCardStyles,
      css`
        .follow {
          cursor: pointer;
        }
        /* The name gets the room it needs, so a normal name is one or two lines
           and not squeezed beside the swatches. When the swatches do not fit
           beside it, they go to their own line under the name. */
        .items-container .row {
          height: auto;
          min-height: 48px;
          flex-wrap: wrap;
          column-gap: var(--ha-space-3);
          row-gap: var(--ha-space-1);
          padding-block: var(--ha-space-2);
        }
        .items-container .row .content {
          flex: 1 1 12rem;
          min-width: 0;
          overflow: visible;
          text-overflow: clip;
          overflow-wrap: anywhere;
        }
        .palette {
          display: flex;
          flex: none;
          align-items: center;
          gap: var(--ha-space-2);
        }
        .swatch {
          width: var(--ha-space-8);
          height: var(--ha-space-8);
          padding: 0;
          border: 2px solid transparent;
          border-radius: var(--ha-border-radius-pill);
          cursor: pointer;
        }
        .swatch.selected {
          border-color: var(--primary-text-color);
          outline: 2px solid var(--card-background-color);
          outline-offset: -4px;
        }
        .swatch:focus-visible,
        .reset:focus-visible {
          outline: 3px solid var(--primary-color);
          outline-offset: 2px;
        }
        .swatch:disabled,
        .reset:disabled {
          opacity: 0.4;
          cursor: default;
        }
        .reset {
          width: var(--ha-space-6);
          height: var(--ha-space-6);
          padding: 0;
          border: none;
          background: none;
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-l);
          cursor: pointer;
        }
        .reset-gap {
          width: var(--ha-space-6);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-energy-color-settings": EnergyColorSettings;
  }
}
