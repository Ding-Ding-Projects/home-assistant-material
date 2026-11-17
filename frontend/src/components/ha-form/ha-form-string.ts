import type { PropertyValues, TemplateResult } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, query } from "lit/decorators";
import { fireEvent } from "../../common/dom/fire_event";
import type { HASSDomTargetEvent } from "../../common/dom/fire_event";
import type { LocalizeFunc } from "../../common/translations/localize";
import "../ha-icon-button";
import "../input/ha-input";
import type { HaInput } from "../input/ha-input";
import { getStringFieldProps } from "./field-kinds";
import type {
  HaFormElement,
  HaFormStringData,
  HaFormStringSchema,
} from "./types";

@customElement("ha-form-string")
export class HaFormString extends LitElement implements HaFormElement {
  @property({ attribute: false }) public localize?: LocalizeFunc;

  @property({ attribute: false }) public localizeBaseKey =
    "ui.components.selectors.text";

  @property({ attribute: false }) public schema!: HaFormStringSchema;

  @property() public data!: HaFormStringData;

  @property() public label!: string;

  @property() public helper?: string;

  @property({ type: Boolean }) public disabled = false;

  @query("ha-input") private _input?: HaInput;

  static shadowRootOptions = {
    ...LitElement.shadowRootOptions,
    delegatesFocus: true,
  };

  public reportValidity(): boolean {
    return this._input?.reportValidity() ?? true;
  }

  protected render(): TemplateResult {
    const props = getStringFieldProps(this.schema);
    return html`
      <ha-input
        .passwordToggle=${props.passwordToggle}
        .type=${props.type}
        .inputmode=${props.inputMode}
        .label=${this.label}
        .value=${this.data || ""}
        .hint=${this.helper}
        .disabled=${this.disabled}
        .required=${!!this.schema.required}
        .autoValidate=${!!this.schema.required}
        .name=${this.schema.name}
        .autofocus=${!!this.schema.autofocus}
        .autocomplete=${props.autocomplete}
        .inputId=${this.schema.name}
        .validationMessage=${
          this.schema.required
            ? this.localize?.("ui.common.error_required")
            : undefined
        }
        @input=${this._valueChanged}
        @change=${this._valueChanged}
      >
        ${
          props.suffix ? html`<span slot="end">${props.suffix}</span>` : nothing
        }
      </ha-input>
    `;
  }

  protected updated(changedProps: PropertyValues<this>): void {
    if (changedProps.has("schema")) {
      this.toggleAttribute("own-margin", !!this.schema.required);
    }
  }

  protected _valueChanged(ev: HASSDomTargetEvent<HaInput>): void {
    let value: string | undefined = (ev.target as HaInput).value;
    if (this.data === value) {
      return;
    }
    if (value === "" && !this.schema.required) {
      value = undefined;
    }
    fireEvent(this, "value-changed", {
      value,
    });
  }

  static styles = css`
    :host {
      display: block;
      position: relative;
    }
    :host([own-margin]) {
      margin-bottom: 5px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-form-string": HaFormString;
  }
}
