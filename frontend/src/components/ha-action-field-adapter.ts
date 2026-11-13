import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import { LanguageModeController } from "../common/language-mode/language-mode-controller";
import { fireEvent } from "../common/dom/fire_event";
import {
  decodeCalendarOffset,
  decodeWiLightTrigger,
  encodeCalendarOffset,
  encodeWiLightTrigger,
  WILIGHT_WEEKDAYS,
  type ActionFieldAdapterKind,
  type CalendarOffset,
  type WiLightTrigger,
} from "../data/action-field-adapters";
import type { HomeAssistant } from "../types";
import type { HaFormSchema } from "./ha-form/types";
import "./ha-form/ha-form";

/** Typed controls which emit the original service-field format only after editing. */
@customElement("ha-action-field-adapter")
export class HaActionFieldAdapter extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @property({ attribute: false }) public kind!: ActionFieldAdapterKind;
  @property({ attribute: false }) public value?: unknown;
  @property({ type: Boolean }) public disabled = false;
  @property({ type: Boolean }) public required = false;

  private _lang = new LanguageModeController(this);

  private _label = (schema: HaFormSchema): string =>
    this._lang.text(
      this.hass.localize,
      `ui.components.action-field-adapter.${schema.name}`
    ) || schema.name;

  protected render() {
    const calendar = this.kind === "calendar-offset";
    const data = calendar
      ? this.value === undefined
        ? { unit: "days", amount: 0 }
        : decodeCalendarOffset(this.value)
      : this.value === undefined
        ? { weekdays: [], time: "00:00", active: false }
        : decodeWiLightTrigger(this.value);
    // The parent routes unsupported values to the original selector. Do not
    // silently replace one if properties change before that route updates.
    if (!data) return nothing;
    const text = (key: string) =>
      this._lang.text(
        this.hass.localize,
        `ui.components.action-field-adapter.${key}`
      ) || key;
    const schema: HaFormSchema[] = calendar
      ? [
          {
            name: "amount",
            required: true,
            selector: { number: { min: 0, step: 1, mode: "box" } },
          },
          {
            name: "unit",
            required: true,
            selector: {
              select: {
                options: ["days", "weeks"].map((value) => ({
                  value,
                  label: text(value),
                })),
              },
            },
          },
        ]
      : [
          {
            name: "weekdays",
            selector: {
              select: {
                multiple: true,
                options: WILIGHT_WEEKDAYS.map((value) => ({
                  value,
                  label: text(value),
                })),
              },
            },
          },
          {
            name: "time",
            required: true,
            selector: { time: { no_second: true } },
          },
          { name: "active", selector: { boolean: {} } },
        ];
    return html`<ha-form
      .hass=${this.hass}
      .schema=${schema}
      .data=${data}
      .disabled=${this.disabled}
      .computeLabel=${this._label}
      @value-changed=${this._changed}
    ></ha-form>`;
  }

  private _changed(
    event: CustomEvent<{ value: CalendarOffset | WiLightTrigger }>
  ) {
    event.stopPropagation();
    if (this.disabled) return;
    const value =
      this.kind === "calendar-offset"
        ? encodeCalendarOffset(event.detail.value as CalendarOffset)
        : encodeWiLightTrigger({
            ...(event.detail.value as WiLightTrigger),
            // Clearing the last multi-select choice emits undefined.
            weekdays: (event.detail.value as WiLightTrigger).weekdays ?? [],
          });
    // Incomplete input never removes or coerces the saved service value.
    if (value === undefined) return;
    fireEvent(this, "value-changed", { value });
  }

  static styles = css`
    :host {
      display: block;
      min-width: 0;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-action-field-adapter": HaActionFieldAdapter;
  }
}
