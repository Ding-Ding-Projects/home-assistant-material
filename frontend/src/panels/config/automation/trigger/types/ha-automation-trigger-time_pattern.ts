import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators";
import { fireEvent } from "../../../../../common/dom/fire_event";
import "../../../../../components/ha-form/ha-form";
import type { LocalizeKeys } from "../../../../../common/translations/localize";
import type { HaFormSchema } from "../../../../../components/ha-form/types";
import type { TimePatternTrigger } from "../../../../../data/automation";
import type { HomeAssistant } from "../../../../../types";
import type { TriggerElement } from "../ha-automation-trigger-row";
import {
  applyTimePatternFormData,
  TIME_PATTERN_MAX,
  TIME_PATTERN_UNITS,
  toTimePatternFormData,
} from "../time-pattern-model";
import type { TimePatternUnit } from "../time-pattern-model";

const FALLBACK_LABELS: Record<string, string> = {
  hours: "Hours",
  minutes: "Minutes",
  seconds: "Seconds",
  mode: "Match",
  value: "Value",
  mode_any: "Every one",
  mode_every: "Every N",
  mode_at: "At exactly",
  mode_custom: "Custom pattern",
  expression: "Pattern",
};

@customElement("ha-automation-trigger-time_pattern")
export class HaTimePatternTrigger extends LitElement implements TriggerElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public trigger!: TimePatternTrigger;

  @property({ type: Boolean }) public disabled = false;

  public static get defaultConfig(): TimePatternTrigger {
    return { trigger: "time_pattern" };
  }

  private _label(key: string): string {
    return (
      this.hass.localize(
        `ui.panel.config.automation.editor.triggers.type.time_pattern.${key}` as LocalizeKeys
      ) ||
      FALLBACK_LABELS[key] ||
      key
    );
  }

  private _unitSchema(
    unit: TimePatternUnit,
    mode: string | undefined
  ): HaFormSchema[] {
    const max = TIME_PATTERN_MAX[unit];
    const schema: HaFormSchema[] = [
      {
        name: `${unit}_mode`,
        type: "select",
        required: true,
        options: [
          ["any", this._label("mode_any")],
          ["every", this._label("mode_every")],
          ["at", this._label("mode_at")],
          ["custom", this._label("mode_custom")],
        ],
      },
    ];
    if (mode === "every" || mode === "at") {
      schema.push({
        name: `${unit}_value`,
        selector: {
          number: {
            min: mode === "every" ? 1 : 0,
            max,
            step: 1,
            mode: "slider",
          },
        },
      });
    } else if (mode === "custom") {
      schema.push({ name: `${unit}_expression`, selector: { text: {} } });
    }
    return schema;
  }

  protected render() {
    const data = toTimePatternFormData(this.trigger);
    return html`${TIME_PATTERN_UNITS.map(
      (unit) => html`
        <div class="unit">
          <div class="unit-title">${this._label(unit)}</div>
          <ha-form
            .hass=${this.hass}
            .schema=${this._unitSchema(unit, data[`${unit}_mode`] as string)}
            .data=${data}
            .disabled=${this.disabled}
            .computeLabel=${this._computeLabelCallback}
            @value-changed=${this._valueChanged}
          ></ha-form>
        </div>
      `
    )}`;
  }

  private _valueChanged(ev: CustomEvent): void {
    ev.stopPropagation();
    const next = ev.detail.value as Record<string, unknown>;
    const previous = toTimePatternFormData(this.trigger);
    const newTrigger = applyTimePatternFormData(this.trigger, previous, next);
    fireEvent(this, "value-changed", { value: newTrigger });
  }

  private _computeLabelCallback = (schema: HaFormSchema): string => {
    const name = schema.name;
    if (name.endsWith("_mode")) {
      return this._label("mode");
    }
    if (name.endsWith("_value")) {
      return this._label("value");
    }
    return this._label("expression");
  };

  static styles = css`
    :host {
      display: block;
    }
    .unit {
      margin-bottom: var(--ha-space-3);
    }
    .unit-title {
      font-weight: var(--ha-font-weight-medium);
      margin-bottom: var(--ha-space-1);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-automation-trigger-time_pattern": HaTimePatternTrigger;
  }
}
