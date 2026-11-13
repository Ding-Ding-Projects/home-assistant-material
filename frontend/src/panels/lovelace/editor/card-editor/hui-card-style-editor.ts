import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators";
import memoizeOne from "memoize-one";
import { fireEvent } from "../../../../common/dom/fire_event";
import "../../../../components/ha-button";
import "../../../../components/ha-form/ha-form";
import type { HaFormSchema } from "../../../../components/ha-form/types";
import type { LovelaceCardConfig } from "../../../../data/lovelace/config/card";
import type { HomeAssistant } from "../../../../types";
import type { CardStyleConfig } from "../../common/card-style";
import {
  CARD_STYLE_KEYS,
  isCardStyleEmpty,
  resetCardStyle,
} from "../../common/card-style";

const lengthSelector = (max: number) =>
  ({
    number: {
      min: 0,
      max,
      step: 1,
      mode: "box",
      unit_of_measurement: "px",
    },
  }) as const;

const SCHEMA = [
  { name: "font_size", required: false, selector: lengthSelector(72) },
  { name: "text_color", required: false, selector: { ui_color: {} } },
  { name: "icon_color", required: false, selector: { ui_color: {} } },
  { name: "background", required: false, selector: { ui_color: {} } },
  { name: "border_width", required: false, selector: lengthSelector(16) },
  { name: "border_color", required: false, selector: { ui_color: {} } },
  { name: "border_radius", required: false, selector: lengthSelector(64) },
] as const satisfies readonly HaFormSchema[];

/**
 * The Style tab of the card editor: text size and colour, icon colour,
 * background, border and corner radius, stored in the card's `style` block
 * and applied by the card wrapper. The card preview in the dialog updates
 * while values change.
 */
@customElement("hui-card-style-editor")
export class HuiCardStyleEditor extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public config!: LovelaceCardConfig;

  private _data = memoizeOne(
    (style: CardStyleConfig | undefined): Record<string, unknown> => ({
      ...(style ?? {}),
    })
  );

  private _t(key: string): string {
    return this.hass.localize(
      `ui.panel.lovelace.editor.card_style.${key}` as any
    );
  }

  private _label = (schema: HaFormSchema): string =>
    this._t(`fields.${schema.name}`);

  protected render() {
    const style = this.config.style as CardStyleConfig | undefined;
    return html`
      <p class="hint">${this._t("intro")}</p>
      <ha-form
        .hass=${this.hass}
        .data=${this._data(style)}
        .schema=${SCHEMA}
        .computeLabel=${this._label}
        @value-changed=${this._valueChanged}
      ></ha-form>
      <p class="hint">${this._t("padding_note")}</p>
      <div class="actions">
        <ha-button
          appearance="plain"
          .disabled=${!style || Object.keys(style).length === 0}
          @click=${this._reset}
        >
          ${this._t("reset")}
        </ha-button>
      </div>
      ${
        style && Object.keys(style).length > 0 && isCardStyleEmpty(style)
          ? html`<p class="hint" role="status">${this._t("ignored")}</p>`
          : ""
      }
    `;
  }

  private _valueChanged(ev: CustomEvent<{ value: Record<string, unknown> }>) {
    ev.stopPropagation();
    const value = ev.detail.value;
    const style: Record<string, unknown> = {};
    CARD_STYLE_KEYS.forEach((key) => {
      const entry = value[key];
      if (entry !== undefined && entry !== null && entry !== "") {
        style[key] = entry;
      }
    });
    const next: LovelaceCardConfig = { ...this.config };
    if (Object.keys(style).length) {
      next.style = style;
    } else {
      delete next.style;
    }
    fireEvent(this, "value-changed", { value: next });
  }

  private _reset() {
    const next: LovelaceCardConfig = resetCardStyle(this.config);
    fireEvent(this, "value-changed", { value: next });
  }

  static styles = css`
    :host {
      display: block;
    }
    .hint {
      margin: 0 0 var(--ha-space-3);
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
    }
    .actions {
      display: flex;
      gap: var(--ha-space-2);
      margin-top: var(--ha-space-2);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-card-style-editor": HuiCardStyleEditor;
  }
}
