import type { PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import memoizeOne from "memoize-one";
import { fireEvent } from "../../common/dom/fire_event";
import type { SelectSelector } from "../../data/selector";
import type { ValueChangedEvent } from "../../types";
import "../chips/ha-chip-set";
import "../chips/ha-filter-chip";
import "../ha-input-helper-text";
import "../ha-selector/ha-selector-select";
import { MULTI_SELECT_CHIP_LIMIT } from "./field-kinds";
import type {
  HaFormElement,
  HaFormMultiSelectData,
  HaFormMultiSelectSchema,
} from "./types";

type RawOption = string | readonly string[];

function optionValue(item: RawOption): string {
  return Array.isArray(item) ? item[0] : (item as string);
}

function optionLabel(item: RawOption): string {
  return Array.isArray(item) ? item[1] || item[0] : (item as string);
}

/**
 * A few options are toggle chips, all visible at once. More options use the
 * searchable multi picker. Either way the value is the array of selected
 * option values.
 */
@customElement("ha-form-multi_select")
export class HaFormMultiSelect extends LitElement implements HaFormElement {
  @property({ attribute: false }) public schema!: HaFormMultiSelectSchema;

  @property({ attribute: false }) public data!: HaFormMultiSelectData;

  @property() public label!: string;

  @property() public helper?: string;

  @property({ type: Boolean, reflect: true }) public disabled = false;

  public reportValidity(): boolean {
    if (!this.schema.required || (this.data && this.data.length > 0)) {
      return true;
    }
    return false;
  }

  private get _options(): RawOption[] {
    return (
      Array.isArray(this.schema.options)
        ? this.schema.options
        : Object.entries(this.schema.options)
    ) as RawOption[];
  }

  private _selector = memoizeOne((options: RawOption[]): SelectSelector => ({
    select: {
      multiple: true,
      options: options.map((item) => ({
        value: optionValue(item),
        label: optionLabel(item),
      })),
    },
  }));

  protected render(): TemplateResult {
    const options = this._options;
    const data = this.data || [];

    if (options.length > MULTI_SELECT_CHIP_LIMIT) {
      return html`<ha-selector-select
        .label=${this.label}
        .helper=${this.helper}
        .value=${data}
        .disabled=${this.disabled}
        .required=${this.schema.required || false}
        .selector=${this._selector(options)}
        @value-changed=${this._selectorChanged}
      ></ha-selector-select>`;
    }

    return html`
      <div class="label" id="label">
        ${this.label}${this.schema.required ? " *" : nothing}
      </div>
      <ha-chip-set aria-labelledby="label">
        ${options.map((item) => {
          const value = optionValue(item);
          return html`<ha-filter-chip
            .label=${optionLabel(item)}
            .selected=${data.includes(value)}
            .disabled=${this.disabled}
            @click=${this._chipClicked(value)}
          ></ha-filter-chip>`;
        })}
      </ha-chip-set>
      ${
        this.helper
          ? html`<ha-input-helper-text>${this.helper}</ha-input-helper-text>`
          : nothing
      }
    `;
  }

  protected updated(changedProps: PropertyValues<this>): void {
    if (changedProps.has("schema")) {
      this.toggleAttribute("own-margin", !!this.schema.required);
    }
  }

  private _chipClicked = memoizeOne((value: string) => (ev: Event) => {
    ev.stopPropagation();
    this._toggle(value, !(this.data || []).includes(value));
  });

  private _toggle(value: string, checked: boolean): void {
    const current = this.data || [];
    if (checked === current.includes(value)) {
      return;
    }
    fireEvent(this, "value-changed", {
      value: checked ? [...current, value] : current.filter((v) => v !== value),
    });
  }

  private _selectorChanged(ev: ValueChangedEvent<string[]>) {
    ev.stopPropagation();
    fireEvent(this, "value-changed", { value: ev.detail.value });
  }

  static styles = css`
    :host {
      display: block;
    }
    :host([own-margin]) {
      margin-bottom: 5px;
    }
    .label {
      margin-bottom: var(--ha-space-2);
      color: var(--secondary-text-color);
      font-size: calc(14px * var(--ha-font-size-scale, 1));
    }
    ha-input-helper-text {
      margin-top: var(--ha-space-1);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-form-multi_select": HaFormMultiSelect;
  }
}
