import { ReactiveElement } from "lit";
import { customElement } from "lit/decorators";
import type { LovelaceCardConfig } from "../../../../data/lovelace/config/card";
import type { LovelaceStrategyConfig } from "../../../../data/lovelace/config/strategy";
import type { LovelaceConfig } from "../../../../data/lovelace/config/types";
import type { LovelaceDashboardSuggestions } from "../../../../data/lovelace/dashboard";
import { fetchTtcOverview, ttcDashboardCards } from "../../../../data/ttc";
import type { HomeAssistant } from "../../../../types";
import type { LovelaceStrategyDependency } from "../types";

export type TransitDashboardStrategyConfig = LovelaceStrategyConfig;

/**
 * A transit dashboard built each time it opens from the routes, stops and
 * stations the TTC transit integration watches, so it follows their changes.
 */
@customElement("transit-dashboard-strategy")
export class TransitDashboardStrategy extends ReactiveElement {
  static registryDependencies: readonly LovelaceStrategyDependency[] = [];

  static async generate(
    _config: TransitDashboardStrategyConfig,
    hass: HomeAssistant
  ): Promise<LovelaceConfig> {
    const title = hass.localize("ui.panel.config.ttc.dashboard_title");
    try {
      const overview = await fetchTtcOverview(hass);
      return {
        views: [
          {
            title,
            path: "transit",
            max_columns: 1,
            cards: ttcDashboardCards(overview) as LovelaceCardConfig[],
          },
        ],
      };
    } catch (_err) {
      return {
        views: [
          {
            title,
            path: "transit",
            cards: [
              {
                type: "markdown",
                content: hass.localize(
                  "ui.panel.lovelace.cards.ttc.not_set_up"
                ),
              },
            ],
          },
        ],
      };
    }
  }

  static noEditor = true;

  static getCreateSuggestions(
    hass: HomeAssistant
  ): LovelaceDashboardSuggestions {
    return {
      title: hass.localize("ui.panel.config.ttc.dashboard_title"),
      icon: "mdi:bus-clock",
    };
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "transit-dashboard-strategy": TransitDashboardStrategy;
  }
}
