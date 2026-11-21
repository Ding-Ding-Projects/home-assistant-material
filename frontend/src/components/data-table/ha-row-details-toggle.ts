import { mdiChevronDown } from "@mdi/js";
import type { CSSResultGroup } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { consume } from "../../common/decorators/consume";
import { LanguageModeController } from "../../common/language-mode/language-mode-controller";
import type { HomeAssistant } from "../../types";
import "../ha-svg-icon";
import type { RowDetailsControl, RowDetailsToggleElement } from "./row-details";
import { closeRowDetailsOnKey, rowDetailsContext } from "./row-details";

/**
 * "Show more details" for a table row that is not an entity. It opens and
 * closes the row's details in the table's detail row (see `renderRowDetails`)
 * and draws nothing in a table without one.
 */
@customElement("ha-row-details-toggle")
export class HaRowDetailsToggle
  extends LitElement
  implements Pick<RowDetailsToggleElement, "focusRowDetailsToggle">
{
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public rowId?: string;

  /** What the row is called, for the button's accessible name. */
  @property({ attribute: false }) public name = "";

  @state()
  @consume({ context: rowDetailsContext, subscribe: true })
  private _rowDetails?: RowDetailsControl;

  private _lang = new LanguageModeController(this);

  public connectedCallback(): void {
    super.connectedCallback();
    // The button must never open or select the row.
    this.addEventListener("click", this._stopEvent);
    this.addEventListener("pointerdown", this._stopEvent);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this.removeEventListener("click", this._stopEvent);
    this.removeEventListener("pointerdown", this._stopEvent);
  }

  private _stopEvent = (ev: Event) => ev.stopPropagation();

  protected render() {
    if (!this.hass || !this._rowDetails || this.rowId === undefined) {
      return nothing;
    }
    const expanded = this._rowDetails.open.has(this.rowId);
    const key = expanded ? "less_details" : "more_details";
    return html`<button
      type="button"
      aria-expanded=${expanded ? "true" : "false"}
      aria-label=${this._lang.text(
        this.hass.localize,
        `ui.components.quick_control.${key}_label`,
        { name: this.name }
      )}
      title=${this._lang.text(
        this.hass.localize,
        `ui.components.quick_control.${key}`
      )}
      @click=${this._toggle}
      @keydown=${this._stopActivationKeys}
    >
      <ha-svg-icon
        class=${expanded ? "open" : ""}
        .path=${mdiChevronDown}
      ></ha-svg-icon>
    </button>`;
  }

  @query("button") private _button?: HTMLButtonElement;

  public focusRowDetailsToggle(): boolean {
    const button = this._button;
    if (!button) {
      return false;
    }
    button.focus();
    return true;
  }

  private _stopActivationKeys(ev: KeyboardEvent) {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.stopPropagation();
      return;
    }
    // Escape on the button closes the open details; focus stays here.
    if (
      this._rowDetails &&
      this.rowId !== undefined &&
      closeRowDetailsOnKey(ev.key, this._rowDetails.open, this.rowId)
    ) {
      ev.stopPropagation();
      this._rowDetails.toggle(this.rowId);
    }
  }

  private _toggle() {
    if (this.rowId !== undefined) {
      this._rowDetails?.toggle(this.rowId);
    }
  }

  static styles: CSSResultGroup = css`
    :host {
      display: inline-flex;
    }
    button {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      padding: 0;
      border: var(--ha-border-width-sm) solid var(--outline-color);
      border-radius: var(--ha-border-radius-circle);
      background: transparent;
      color: var(--primary-text-color);
      cursor: pointer;
      --mdc-icon-size: 20px;
    }
    /* A 48 px hit area around the 40 px button. */
    button::after {
      content: "";
      position: absolute;
      inset: -4px;
    }
    button:hover {
      background: var(--ha-color-fill-neutral-quiet-hover);
    }
    button:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    ha-svg-icon.open {
      transform: rotate(180deg);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-row-details-toggle": HaRowDetailsToggle;
  }
}
