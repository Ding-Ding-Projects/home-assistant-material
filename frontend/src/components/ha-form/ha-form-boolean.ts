import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query } from "lit/decorators";
import { fireEvent } from "../../common/dom/fire_event";
import "../ha-switch";
import type { HaSwitch } from "../ha-switch";
import type {
  HaFormBooleanData,
  HaFormBooleanSchema,
  HaFormElement,
} from "./types";

/** A switch with its label and description beside it. */
@customElement("ha-form-boolean")
export class HaFormBoolean extends LitElement implements HaFormElement {
  @property({ attribute: false }) public schema!: HaFormBooleanSchema;

  @property({ attribute: false }) public data!: HaFormBooleanData;

  @property() public label!: string;

  @property() public helper?: string;

  @property({ type: Boolean }) public disabled = false;

  @query("ha-switch", true) private _input?: HTMLElement;

  public focus() {
    if (this._input) {
      this._input.focus();
    }
  }

  protected render(): TemplateResult {
    return html`
      <ha-switch
        .checked=${this.data ?? false}
        .disabled=${this.disabled}
        @change=${this._valueChanged}
      >
        <p class="primary">${this.label}</p>
        ${this.helper ? html`<p class="secondary">${this.helper}</p>` : nothing}
      </ha-switch>
    `;
  }

  private _valueChanged(ev: Event) {
    const checked = (ev.target as HaSwitch).checked;
    if (checked === this.data) {
      return;
    }
    fireEvent(this, "value-changed", {
      value: checked,
    });
  }

  static styles = css`
    :host {
      display: block;
    }
    ha-switch {
      display: flex;
      width: 100%;
      min-height: 48px;
      align-items: center;
    }
    /* The switch draws its control before the label; flip the row so the
       label and description sit on the start side. */
    ha-switch::part(base) {
      width: 100%;
      flex-direction: row-reverse;
      justify-content: space-between;
      gap: var(--ha-space-2);
    }
    ha-switch::part(label) {
      margin-inline-start: 0;
      line-height: var(--ha-line-height-normal);
    }
    p {
      margin: 0;
    }
    .secondary {
      direction: var(--direction);
      padding-top: var(--ha-space-1);
      color: var(--secondary-text-color);
      font-size: calc(13px * var(--ha-font-size-scale, 1));
      font-weight: var(--ha-font-weight-normal);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-form-boolean": HaFormBoolean;
  }
}
