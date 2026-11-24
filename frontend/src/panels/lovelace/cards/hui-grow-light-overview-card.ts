import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import "../../../components/ha-card";
import type { HomeAssistant } from "../../../types";
import type {
  LovelaceCard,
  LovelaceCardEditor,
  LovelaceGridOptions,
} from "../types";
import {
  findGrowLightEntities,
  growLightStyles,
  listGrowLights,
  renderGrowLight,
} from "./grow-light/grow-light-common";
import type { GrowLightOverviewCardConfig } from "./types";

@customElement("hui-grow-light-overview-card-card")
export class HuiGrowLightOverviewCard
  extends LitElement
  implements LovelaceCard
{
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("../editor/config-elements/hui-grow-light-card-editor");
    return document.createElement("hui-grow-light-overview-card-editor");
  }

  public static getStubConfig(): GrowLightOverviewCardConfig {
    return { type: "grow-light-overview-card" };
  }

  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: GrowLightOverviewCardConfig;

  public setConfig(config: GrowLightOverviewCardConfig): void {
    this._config = config;
  }

  public getCardSize(): number {
    return 8;
  }

  public getGridOptions(): LovelaceGridOptions {
    return { columns: "full", rows: "auto", min_columns: 6 };
  }

  protected render() {
    if (!this._config || !this.hass) {
      return nothing;
    }
    const hass = this.hass;
    const lights = listGrowLights(hass);
    return html`
      ${
        this._config.title
          ? html`<h2 class="heading">${this._config.title}</h2>`
          : nothing
      }
      <div class="grid">
        ${lights.map(
          (entityId) =>
            html`<ha-card
              >${renderGrowLight(hass, findGrowLightEntities(hass, entityId), {
                compact: true,
              })}</ha-card
            >`
        )}
      </div>
    `;
  }

  static styles = [
    growLightStyles,
    css`
      :host {
        display: block;
      }
      .heading {
        margin: 0 0 var(--ha-space-2, 8px);
        font-size: var(--ha-font-size-xl);
        font-weight: var(--ha-font-weight-medium);
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: var(--ha-space-3, 12px);
      }
      ha-card {
        overflow: hidden;
      }
      @media (max-width: 480px) {
        .grid {
          grid-template-columns: 1fr;
        }
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-grow-light-overview-card-card": HuiGrowLightOverviewCard;
  }
}
