import { mdiLightbulbGroup, mdiLightbulbGroupOff } from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import "../../../components/ha-svg-icon";
import { summariseLights } from "../../light/light-summary";
import type { HomeAssistant } from "../../../types";
import type { LovelaceCard, LovelaceGridOptions } from "../types";
import type { LightsSummaryCardConfig } from "./types";

/**
 * The top of the Lights page: how many lights are on, of how many, in how
 * many rooms, and one button that turns all of them off (or on, when none
 * is). Only what the lights report is shown.
 */
@customElement("hui-lights-summary-card")
export class HuiLightsSummaryCard extends LitElement implements LovelaceCard {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: LightsSummaryCardConfig;

  public setConfig(config: LightsSummaryCardConfig): void {
    this._config = config;
  }

  public getCardSize(): number {
    return 3;
  }

  public getGridOptions(): LovelaceGridOptions {
    return { columns: "full", rows: "auto" };
  }

  private _summary = memoizeOne(summariseLights);

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) {
      return nothing;
    }
    const hass = this.hass;
    const localize = hass.localize;
    const summary = this._summary(hass.states, hass.entities, hass.devices);
    if (!summary.total) {
      return nothing;
    }
    const anyOn = summary.on.length > 0;
    return html`
      <section class=${anyOn ? "hero on" : "hero"}>
        <div class="text">
          <span class="label">
            ${localize("ui.panel.lovelace.cards.lights_summary.title")}
          </span>
          <div class="big">
            ${
              anyOn
                ? localize("ui.panel.lovelace.cards.lights_summary.are_on", {
                    count: summary.on.length,
                  })
                : localize("ui.panel.lovelace.cards.lights_summary.all_off")
            }
          </div>
          <span class="caption">
            ${
              summary.areas
                ? localize("ui.panel.lovelace.cards.lights_summary.out_of", {
                    total: summary.total,
                    rooms: summary.areas,
                  })
                : localize(
                    "ui.panel.lovelace.cards.lights_summary.out_of_no_rooms",
                    { total: summary.total }
                  )
            }
          </span>
        </div>
        <button type="button" class="all" @click=${this._toggleAll}>
          <ha-svg-icon
            .path=${anyOn ? mdiLightbulbGroupOff : mdiLightbulbGroup}
          ></ha-svg-icon>
          ${
            anyOn
              ? localize("ui.panel.lovelace.cards.lights_summary.turn_all_off")
              : localize("ui.panel.lovelace.cards.lights_summary.turn_all_on")
          }
        </button>
      </section>
    `;
  }

  private _toggleAll(): void {
    if (!this.hass) {
      return;
    }
    const summary = this._summary(
      this.hass.states,
      this.hass.entities,
      this.hass.devices
    );
    if (summary.on.length) {
      this.hass.callService("light", "turn_off", { entity_id: summary.on });
    } else {
      this.hass.callService("light", "turn_on", { entity_id: "all" });
    }
  }

  static styles: CSSResultGroup = css`
    :host {
      display: block;
    }
    .hero {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--ha-space-4) var(--ha-space-6);
      padding: var(--ha-space-6);
      border-radius: var(--ha-border-radius-3xl, 28px);
      background: var(--secondary-background-color);
      color: var(--primary-text-color);
    }
    .hero.on {
      background: color-mix(
        in srgb,
        var(--primary-color) 22%,
        var(--primary-background-color)
      );
      color: var(--primary-color);
    }
    .text {
      min-width: 0;
    }
    .label {
      font-weight: var(--ha-font-weight-medium);
    }
    .big {
      font-size: clamp(36px, 6vw, 64px);
      font-weight: var(--ha-font-weight-medium);
      line-height: 1.1;
    }
    .caption {
      font-size: var(--ha-font-size-l);
    }
    .all {
      display: inline-flex;
      align-items: center;
      gap: var(--ha-space-2);
      min-height: var(--ha-space-12);
      padding: 0 var(--ha-space-6);
      border: none;
      border-radius: var(--ha-border-radius-pill);
      background: var(--primary-color);
      color: var(--text-primary-color);
      font: inherit;
      font-size: var(--ha-font-size-l);
      font-weight: var(--ha-font-weight-medium);
      cursor: pointer;
      --mdc-icon-size: 20px;
    }
    .all:focus-visible {
      outline: 3px solid var(--primary-text-color);
      outline-offset: 2px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-lights-summary-card": HuiLightsSummaryCard;
  }
}
