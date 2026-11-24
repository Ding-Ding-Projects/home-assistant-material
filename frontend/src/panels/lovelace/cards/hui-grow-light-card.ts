import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import "../../../components/ha-card";
import type { HomeAssistant } from "../../../types";
import { findEntities } from "../common/find-entities";
import { createEntityNotFoundWarning } from "../components/hui-warning";
import type {
  LovelaceCard,
  LovelaceCardEditor,
  LovelaceGridOptions,
} from "../types";
import type { GrowLightEntities } from "./grow-light/grow-light-common";
import {
  findGrowLightEntities,
  growLightStyles,
  GROW_LIGHT_DOMAIN,
  renderGrowLight,
} from "./grow-light/grow-light-common";
import type { GrowLightCardConfig } from "./types";

@customElement("hui-grow-light-card-card")
export class HuiGrowLightCard extends LitElement implements LovelaceCard {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("../editor/config-elements/hui-grow-light-card-editor");
    return document.createElement("hui-grow-light-card-editor");
  }

  public static getStubConfig(
    hass: HomeAssistant,
    entities: string[],
    entitiesFallback: string[]
  ): GrowLightCardConfig {
    const found = findEntities(
      hass,
      1,
      entities,
      entitiesFallback,
      ["sensor"],
      (stateObj) =>
        hass.entities[stateObj.entity_id]?.platform === GROW_LIGHT_DOMAIN &&
        hass.entities[stateObj.entity_id]?.translation_key === "status"
    );
    return { type: "grow-light-card", entity: found[0] || "" };
  }

  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: GrowLightCardConfig;

  private _entities?: GrowLightEntities;

  public setConfig(config: GrowLightCardConfig): void {
    if (!config.entity || config.entity.split(".")[0] !== "sensor") {
      throw new Error("Specify the grow light status sensor");
    }
    this._config = config;
  }

  public getCardSize(): number {
    return 6;
  }

  public getGridOptions(): LovelaceGridOptions {
    return { columns: 6, rows: "auto", min_columns: 4 };
  }

  protected willUpdate(changed: PropertyValues): void {
    if (
      this._config &&
      this.hass &&
      (changed.has("_config") ||
        changed.get("hass")?.entities !== this.hass.entities)
    ) {
      this._entities = findGrowLightEntities(this.hass, this._config.entity);
    }
  }

  protected shouldUpdate(changed: PropertyValues): boolean {
    if (changed.has("_config") || !this._entities || !this.hass) {
      return true;
    }
    const oldHass = changed.get("hass") as HomeAssistant | undefined;
    if (!oldHass) {
      return true;
    }
    return Object.values(this._entities).some(
      (id) => id && oldHass.states[id] !== this.hass!.states[id]
    );
  }

  protected render() {
    if (!this._config || !this.hass) {
      return nothing;
    }
    const entities =
      this._entities ?? findGrowLightEntities(this.hass, this._config.entity);
    if (!this.hass.states[entities.status]) {
      return html`<hui-warning>
        ${createEntityNotFoundWarning(this.hass.localize, this.hass.config)}
      </hui-warning>`;
    }
    return html`<ha-card>
      ${renderGrowLight(this.hass, entities, { name: this._config.name })}
    </ha-card>`;
  }

  static styles = [
    growLightStyles,
    css`
      ha-card {
        height: 100%;
        overflow: hidden;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-grow-light-card-card": HuiGrowLightCard;
  }
}
