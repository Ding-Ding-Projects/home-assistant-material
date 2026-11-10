import type { TemplateResult } from "lit";
import { html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import "../../home/components/ha-panel-heading";
import type { HomeAssistant } from "../../../types";
import type { LovelaceCard, LovelaceGridOptions } from "../types";
import type { PageHeadingCardConfig } from "./types";

/** The large title of a dashboard page and one line under it. */
@customElement("hui-page-heading-card")
export class HuiPageHeadingCard extends LitElement implements LovelaceCard {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: PageHeadingCardConfig;

  public setConfig(config: PageHeadingCardConfig): void {
    if (!config.heading) {
      throw new Error("A heading is required");
    }
    this._config = config;
  }

  public getCardSize(): number {
    return 1;
  }

  public getGridOptions(): LovelaceGridOptions {
    return { columns: "full", rows: "auto" };
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this._config) {
      return nothing;
    }
    return html`<ha-panel-heading
      .heading=${this._config.heading}
      .summary=${this._config.summary}
    ></ha-panel-heading>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-page-heading-card": HuiPageHeadingCard;
  }
}
