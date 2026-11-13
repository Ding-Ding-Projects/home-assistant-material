import {
  mdiCurrencyUsd,
  mdiFlash,
  mdiSolarPower,
  mdiTransmissionTower,
} from "@mdi/js";
import type { HassConfig } from "home-assistant-js-websocket";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, state } from "lit/decorators";
import { consume } from "../../../../common/decorators/consume";
import { formatNumber } from "../../../../common/number/format_number";
import "../../../../components/ha-svg-icon";
import { transform } from "../../../../common/decorators/transform";
import {
  configContext,
  internationalizationContext,
} from "../../../../data/context";
import type { EnergyData } from "../../../../data/energy";
import {
  computeConsumptionData,
  getSummedData,
  validateEnergyCollectionKey,
} from "../../../../data/energy";
import { EnergyCollectionController } from "../../../../data/energy-collection-controller";
import type {
  HomeAssistantConfig,
  HomeAssistantInternationalization,
} from "../../../../types";
import { computeEnergyTotalCost } from "./energy-total-cost";
import type { LovelaceCard } from "../../types";
import type { EnergyTotalsCardConfig } from "../types";

interface Tile {
  key: "used" | "solar" | "returned" | "cost";
  icon: string;
  value: number;
}

/**
 * Totals for the chosen period as large tiles: what the home used, what the
 * solar panels made and what went back to the grid. Each tile appears only
 * when the energy configuration has that source.
 */
@customElement("hui-energy-totals-card")
class HuiEnergyTotalsCard extends LitElement implements LovelaceCard {
  @state() private _config?: EnergyTotalsCardConfig;

  @state() private _data?: EnergyData;

  @state()
  @consume({ context: internationalizationContext, subscribe: true })
  private _i18n!: HomeAssistantInternationalization;

  @state()
  @consume({ context: configContext, subscribe: true })
  @transform<HomeAssistantConfig, HassConfig>({
    transformer: ({ config }) => config,
  })
  private _hassConfig!: HassConfig;

  constructor() {
    super();
    new EnergyCollectionController(this, {
      config: () => this._config,
      onData: (data) => {
        this._data = data;
      },
    });
  }

  public getCardSize(): number {
    return 2;
  }

  public setConfig(config: EnergyTotalsCardConfig): void {
    if (config.collection_key) {
      validateEnergyCollectionKey(config.collection_key);
    }
    this._config = config;
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this._config || !this._data) {
      return nothing;
    }
    const { summedData } = getSummedData(this._data);
    const { consumption } = computeConsumptionData(summedData, undefined);

    const tiles: Tile[] = [];
    const hasGrid = this._data.prefs.energy_sources.some(
      (source) => source.type === "grid"
    );
    if (hasGrid || summedData.total.solar !== undefined) {
      tiles.push({
        key: "used",
        icon: mdiFlash,
        value: Math.max(0, consumption.total.used_total),
      });
    }
    if (summedData.total.solar !== undefined) {
      tiles.push({
        key: "solar",
        icon: mdiSolarPower,
        value: summedData.total.solar,
      });
    }
    if (summedData.total.to_grid !== undefined) {
      tiles.push({
        key: "returned",
        icon: mdiTransmissionTower,
        value: summedData.total.to_grid,
      });
    }
    // The cost tile appears only when the energy configuration has cost
    // statistics with data in this period, and a currency is set.
    const cost = computeEnergyTotalCost(
      this._data.prefs,
      this._data.info,
      this._data.stats
    );
    if (cost !== undefined && this._hassConfig?.currency) {
      tiles.push({ key: "cost", icon: mdiCurrencyUsd, value: cost });
    }
    if (!tiles.length) {
      return nothing;
    }
    const localize = this._i18n.localize;
    return html`<div class="tiles">
      ${tiles.map(
        (tile) =>
          html`<div class="tile ${tile.key}">
            <span class="label">
              <ha-svg-icon .path=${tile.icon}></ha-svg-icon>
              ${localize(`ui.panel.lovelace.cards.energy.energy_totals.${tile.key}`)}
            </span>
            <span class="value"
              >${
                tile.key === "cost"
                  ? formatNumber(tile.value, this._i18n.locale, {
                      style: "currency",
                      currency: this._hassConfig.currency!,
                    })
                  : html`${formatNumber(tile.value, this._i18n.locale, {
                      maximumFractionDigits: 1,
                    })}
                    kWh`
              }</span
            >
          </div>`
      )}
    </div>`;
  }

  static styles: CSSResultGroup = css`
    :host {
      display: block;
    }
    .tiles {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: var(--ha-space-3);
    }
    .tile {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
      padding: var(--ha-space-4) var(--ha-space-5);
      border-radius: var(--ha-border-radius-2xl);
      background: color-mix(
        in srgb,
        var(--primary-color) 22%,
        var(--card-background-color)
      );
      color: var(--primary-text-color);
    }
    .tile.solar {
      background: color-mix(
        in srgb,
        var(--success-color) 24%,
        var(--card-background-color)
      );
    }
    .tile.returned {
      background: color-mix(
        in srgb,
        var(--accent-color, var(--primary-color)) 22%,
        var(--card-background-color)
      );
    }
    .tile.cost {
      background: color-mix(
        in srgb,
        var(--warning-color) 22%,
        var(--card-background-color)
      );
    }
    .label {
      display: inline-flex;
      align-items: center;
      gap: var(--ha-space-2);
      font-size: var(--ha-font-size-s);
      font-weight: var(--ha-font-weight-medium);
      letter-spacing: 0.06em;
      text-transform: uppercase;
      --mdc-icon-size: 18px;
    }
    .value {
      font-family: var(--ha-font-family-heading, inherit);
      font-size: var(--ha-font-size-3xl);
      font-weight: var(--ha-font-weight-medium);
      line-height: var(--ha-line-height-condensed);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-energy-totals-card": HuiEnergyTotalsCard;
  }
}
