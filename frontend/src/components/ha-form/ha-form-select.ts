import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import memoizeOne from "memoize-one";
import { fireEvent } from "../../common/dom/fire_event";
import type { SelectSelector } from "../../data/selector";
import type { ValueChangedEvent } from "../../types";
import "../ha-generic-picker";
import "../ha-input-helper-text";
import "../ha-selector/ha-selector-select";
import { getSelectPresentation } from "./field-kinds";
import type {
  HaFormElement,
  HaFormSelectData,
  HaFormSelectSchema,
} from "./types";

/**
 * The underlying select returns option values as strings. Map a selected value
 * back to its original option value so the source type is retained (for example
 * a number coming from a backend `vol.In` schema), falling back to the value
 * itself when no option matches.
 */
export const matchSelectOptionValue = (
  options: HaFormSelectSchema["options"],
  value: string
): HaFormSelectData => {
  const option = options.find((opt) => String(opt[0]) === String(value));
  return option ? option[0] : value;
};

@customElement("ha-form-select")
export class HaFormSelect extends LitElement implements HaFormElement {
  @property({ attribute: false }) public schema!: HaFormSelectSchema;

  @property({ attribute: false }) public data!: HaFormSelectData;

  @property() public label?: string;

  @property() public helper?: string;

  @property({ attribute: false })
  public localizeValue?: (key: string) => string;

  @property({ type: Boolean }) public disabled = false;

  private _selectSchema = memoizeOne(
    (schema: HaFormSelectSchema): SelectSelector => ({
      select: {
        translation_key: schema.name,
        mode: "box",
        box_max_columns: 3,
        options: schema.options.map((option) => ({
          value: option[0],
          label: option[1],
        })),
      },
    })
  );

  public reportValidity(): boolean {
    if (!this.schema.required || this.data) {
      return true;
    }
    return false;
  }

  private _items = memoizeOne(
    (schema: HaFormSelectSchema, localizeValue?: (key: string) => string) =>
      schema.options.map((option) => ({
        id: String(option[0]),
        primary:
          (localizeValue &&
            localizeValue(`${schema.name}.options.${option[0]}`)) ||
          option[1],
        sorting_label: option[1],
      }))
  );

  private _getItems = () => this._items(this.schema, this.localizeValue);

  private _renderValue = (value: string) =>
    html`<span slot="headline"
      >${
        this._items(this.schema, this.localizeValue).find(
          (item) => item.id === value
        )?.primary ?? value
      }</span
    >`;

  private _renderSearchable(): TemplateResult {
    return html`
      <ha-generic-picker
        no-sort
        .label=${this.label}
        .disabled=${this.disabled}
        .required=${this.schema.required || false}
        .getItems=${this._getItems}
        .value=${
          this.data === undefined || this.data === null
            ? undefined
            : String(this.data)
        }
        .valueRenderer=${this._renderValue}
        @value-changed=${this._valueChanged}
      ></ha-generic-picker>
      ${
        this.helper
          ? html`<ha-input-helper-text>${this.helper}</ha-input-helper-text>`
          : nothing
      }
    `;
  }

  protected render(): TemplateResult {
    if (getSelectPresentation(this.schema.options.length) === "searchable") {
      return this._renderSearchable();
    }
    return html`
      <ha-selector-select
        .value=${this.data === undefined ? undefined : String(this.data)}
        .label=${this.label}
        .helper=${this.helper}
        .disabled=${this.disabled}
        .required=${this.schema.required || false}
        .selector=${this._selectSchema(this.schema)}
        .localizeValue=${this.localizeValue}
        @value-changed=${this._valueChanged}
      ></ha-selector-select>
    `;
  }

  static styles = css`
    :host {
      display: block;
    }
    ha-input-helper-text {
      margin-top: var(--ha-space-1);
    }
  `;

  private _valueChanged(ev: ValueChangedEvent<string>) {
    ev.stopPropagation();
    let value: HaFormSelectData | undefined = ev.detail.value;

    if (value === "") {
      value = undefined;
    } else if (value != null) {
      value = matchSelectOptionValue(this.schema.options, value);
    }

    if (value === this.data) {
      return;
    }

    fireEvent(this, "value-changed", {
      value,
    });
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-form-select": HaFormSelect;
  }
}
