import type { PropertyValues, TemplateResult } from "lit";
import { mdiMinus, mdiPlus } from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query } from "lit/decorators";
import { fireEvent } from "../../common/dom/fire_event";
import type { HASSDomTargetEvent } from "../../common/dom/fire_event";
import type { LocalizeFunc } from "../../common/translations/localize";
import "../ha-checkbox";
import "../ha-icon-button";
import type { HaCheckbox } from "../ha-checkbox";
import "../ha-input-helper-text";
import "../ha-slider";
import "../input/ha-input";
import type { HaInput } from "../input/ha-input";
import { getNumberFieldProps } from "./field-kinds";
import type {
  HaFormElement,
  HaFormIntegerData,
  HaFormIntegerSchema,
} from "./types";

@customElement("ha-form-integer")
export class HaFormInteger extends LitElement implements HaFormElement {
  @property({ attribute: false }) public localize?: LocalizeFunc;

  @property({ attribute: false }) public schema!: HaFormIntegerSchema;

  @property({ attribute: false }) public data?: HaFormIntegerData;

  @property() public label?: string;

  @property() public helper?: string;

  @property({ type: Boolean }) public disabled = false;

  @query("ha-input, ha-slider", true) private _input?:
    HaInput | HTMLInputElement;

  private _lastValue?: HaFormIntegerData;

  static shadowRootOptions = {
    ...LitElement.shadowRootOptions,
    delegatesFocus: true,
  };

  public reportValidity(): boolean {
    const showSlider = this._showSlider();
    if (showSlider && this.schema.required && isNaN(Number(this.data))) {
      return false;
    }

    if (!showSlider) {
      return this._input?.reportValidity() ?? true;
    }
    return true;
  }

  private _showSlider(): boolean {
    return (
      getNumberFieldProps("integer", this.schema).presentation === "slider"
    );
  }

  protected render(): TemplateResult {
    const props = getNumberFieldProps("integer", this.schema);
    if (this._showSlider()) {
      return html`
        <div>
          ${this.label}
          <div class="flex">
            ${
              !this.schema.required
                ? html`
                    <ha-checkbox
                      @change=${this._handleCheckboxChange}
                      .checked=${this.data !== undefined}
                      .disabled=${this.disabled}
                    ></ha-checkbox>
                  `
                : ""
            }
            <ha-slider
              labeled
              .value=${this._value}
              .min=${this.schema.valueMin}
              .max=${this.schema.valueMax}
              .disabled=${
                this.disabled ||
                (this.data === undefined && !this.schema.required)
              }
              @change=${this._valueChanged}
            ></ha-slider>
            <ha-input
              class="slider-box"
              type="number"
              .inputmode=${"numeric"}
              .min=${props.min}
              .max=${props.max}
              .step=${1}
              .accessibleLabel=${this.label}
              .value=${this.data?.toString() ?? ""}
              .disabled=${
                this.disabled ||
                (this.data === undefined && !this.schema.required)
              }
              without-spin-buttons
              @input=${this._valueChanged}
            >
              ${
                props.suffix
                  ? html`<span slot="end">${props.suffix}</span>`
                  : nothing
              }
            </ha-input>
          </div>
          ${
            this.helper
              ? html`<ha-input-helper-text
                  >${this.helper}</ha-input-helper-text
                >`
              : nothing
          }
        </div>
      `;
    }

    return html`
      <ha-input
        type="number"
        .inputmode=${props.inputMode}
        .min=${props.min}
        .max=${props.max}
        .step=${props.step}
        without-spin-buttons
        .label=${this.label}
        .hint=${this.helper}
        .value=${this.data?.toString() ?? ""}
        .disabled=${this.disabled}
        .required=${this.schema.required}
        .autoValidate=${this.schema.required}
        .validationMessage=${
          this.schema.required
            ? this.localize?.("ui.common.error_required")
            : undefined
        }
        @input=${this._valueChanged}
      >
        <ha-icon-button
          slot="start"
          .label=${this.localize?.("ui.components.number-buttons.decrement")}
          .path=${mdiMinus}
          .disabled=${this.disabled}
          @click=${this._decrement}
        ></ha-icon-button>
        ${
          props.suffix ? html`<span slot="end">${props.suffix}</span>` : nothing
        }
        <ha-icon-button
          slot="end"
          .label=${this.localize?.("ui.components.number-buttons.increment")}
          .path=${mdiPlus}
          .disabled=${this.disabled}
          @click=${this._increment}
        ></ha-icon-button>
      </ha-input>
    `;
  }

  protected updated(changedProps: PropertyValues<this>): void {
    if (changedProps.has("schema")) {
      this.toggleAttribute(
        "own-margin",
        !("valueMin" in this.schema && "valueMax" in this.schema) &&
          !!this.schema.required
      );
    }
  }

  private get _value() {
    if (this.data !== undefined) {
      return this.data;
    }

    if (!this.schema.required) {
      return this.schema.valueMin || 0;
    }

    return (
      (this.schema.description?.suggested_value !== undefined &&
        this.schema.description?.suggested_value !== null) ||
      this.schema.default ||
      this.schema.valueMin ||
      0
    );
  }

  private _handleCheckboxChange(ev: HASSDomTargetEvent<HaCheckbox>) {
    const checked = (ev.target as HaCheckbox).checked;
    let value: HaFormIntegerData | undefined;
    if (checked) {
      for (const candidate of [
        this._lastValue,
        this.schema.description?.suggested_value as HaFormIntegerData,
        this.schema.default,
        0,
      ]) {
        if (candidate !== undefined) {
          value = candidate;
          break;
        }
      }
    } else {
      // We track last value so user can disable and enable a field without losing
      // their value.
      this._lastValue = this.data;
    }
    fireEvent(this, "value-changed", {
      value,
    });
  }

  private _decrement = () => this._step(-1);

  private _increment = () => this._step(1);

  private _step(direction: 1 | -1) {
    const props = getNumberFieldProps("integer", this.schema);
    let value = (this.data ?? this.schema.default ?? 0) + direction;
    if (props.min !== undefined) {
      value = Math.max(props.min, value);
    }
    if (props.max !== undefined) {
      value = Math.min(props.max, value);
    }
    if (value === this.data) {
      return;
    }
    fireEvent(this, "value-changed", { value });
  }

  private _valueChanged(
    ev: InputEvent & HASSDomTargetEvent<HaInput | HTMLInputElement>
  ) {
    const source = ev.target as HaInput | HTMLInputElement;
    const rawValue = source.value;

    let value: number | undefined;

    if (rawValue !== "") {
      value = parseInt(String(rawValue));
    }

    if (this.data === value) {
      // parseInt will drop invalid text at the end, in that case update textfield
      const newRawValue = value === undefined ? "" : String(value);
      if (source.value !== newRawValue) {
        source.value = newRawValue;
      }
      return;
    }

    fireEvent(this, "value-changed", {
      value,
    });
  }

  static styles = css`
    :host([own-margin]) {
      margin-bottom: 5px;
    }
    .flex {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
    }
    ha-slider {
      flex: 1;
    }
    .slider-box {
      width: 96px;
      flex: none;
    }
    ha-input-helper-text {
      margin-top: var(--ha-space-1);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-form-integer": HaFormInteger;
  }
}
