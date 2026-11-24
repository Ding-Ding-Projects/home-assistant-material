import { html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { assert, assign, object, optional, string } from "superstruct";
import { fireEvent } from "../../../../common/dom/fire_event";
import "../../../../components/ha-form/ha-form";
import type { SchemaUnion } from "../../../../components/ha-form/types";
import type { HomeAssistant } from "../../../../types";
import type {
  GrowLightCardConfig,
  GrowLightOverviewCardConfig,
} from "../../cards/types";
import type { LovelaceCardEditor } from "../../types";
import { baseLovelaceCardConfig } from "../structs/base-card-struct";

const cardStruct = assign(
  baseLovelaceCardConfig,
  object({ entity: optional(string()), name: optional(string()) })
);

const overviewStruct = assign(
  baseLovelaceCardConfig,
  object({ title: optional(string()) })
);

const CARD_SCHEMA = [
  {
    name: "entity",
    required: true,
    selector: { entity: { domain: "sensor", integration: "grow_light" } },
  },
  { name: "name", selector: { text: {} } },
] as const;

const OVERVIEW_SCHEMA = [{ name: "title", selector: { text: {} } }] as const;

@customElement("hui-grow-light-card-editor")
export class HuiGrowLightCardEditor
  extends LitElement
  implements LovelaceCardEditor
{
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: GrowLightCardConfig;

  public setConfig(config: GrowLightCardConfig): void {
    assert(config, cardStruct);
    this._config = config;
  }

  protected render() {
    if (!this.hass || !this._config) {
      return nothing;
    }
    return html`<ha-form
      .hass=${this.hass}
      .data=${this._config}
      .schema=${CARD_SCHEMA}
      .computeLabel=${this._computeLabel}
      @value-changed=${this._valueChanged}
    ></ha-form>`;
  }

  private _valueChanged(ev: CustomEvent): void {
    fireEvent(this, "config-changed", { config: ev.detail.value });
  }

  private _computeLabel = (schema: SchemaUnion<typeof CARD_SCHEMA>) =>
    this.hass!.localize(`ui.panel.lovelace.editor.card.generic.${schema.name}`);
}

@customElement("hui-grow-light-overview-card-editor")
export class HuiGrowLightOverviewCardEditor
  extends LitElement
  implements LovelaceCardEditor
{
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: GrowLightOverviewCardConfig;

  public setConfig(config: GrowLightOverviewCardConfig): void {
    assert(config, overviewStruct);
    this._config = config;
  }

  protected render() {
    if (!this.hass || !this._config) {
      return nothing;
    }
    return html`<ha-form
      .hass=${this.hass}
      .data=${this._config}
      .schema=${OVERVIEW_SCHEMA}
      .computeLabel=${this._computeLabel}
      @value-changed=${this._valueChanged}
    ></ha-form>`;
  }

  private _valueChanged(ev: CustomEvent): void {
    fireEvent(this, "config-changed", { config: ev.detail.value });
  }

  private _computeLabel = (schema: SchemaUnion<typeof OVERVIEW_SCHEMA>) =>
    this.hass!.localize(`ui.panel.lovelace.editor.card.generic.${schema.name}`);
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-grow-light-card-editor": HuiGrowLightCardEditor;
    "hui-grow-light-overview-card-editor": HuiGrowLightOverviewCardEditor;
  }
}
