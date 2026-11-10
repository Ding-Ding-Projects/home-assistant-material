import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators";
import { repeat } from "lit/directives/repeat";
import { fireEvent } from "../../common/dom/fire_event";
import { PIN_PATTERN } from "../../common/locks/lock-credentials";
import "../input/ha-input";
import type { HaInput } from "../input/ha-input";
import { lockText } from "./lock-text";

declare global {
  interface HASSDomEvents {
    /** A PIN was submitted, from the keypad or from the field. */
    "lock-pin-submit": { value: string };
    /** PIN entry was cancelled. */
    "lock-pin-cancel": undefined;
  }
}

const PIN_MAX = 12;

const shuffled = (items: string[]): string[] => {
  const out = [...items];
  const random = crypto.getRandomValues(new Uint32Array(out.length));
  for (let i = out.length - 1; i > 0; i--) {
    const j = random[i] % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/**
 * PIN entry with an on-screen keypad and a field. Both write the same
 * value and both submit through the same event, so whatever checks the PIN
 * sees one kind of input. The entered digits are shown only as dots and are
 * never put in a name or a live region.
 */
@customElement("ha-lock-pin-entry")
export class HaLockPinEntry extends LitElement {
  @property({ attribute: false }) public label = "";

  @property({ attribute: false }) public submitLabel = "";

  @property({ attribute: false }) public disabled = false;

  @state() private _value = "";

  @state() private _shuffle = false;

  @state() private _order = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

  /** Empties the entry, after a wrong try or a step. */
  public clear(): void {
    this._value = "";
  }

  protected render(): TemplateResult {
    const label = this.label || lockText("pin_label");
    const rows = [
      this._order.slice(0, 3),
      this._order.slice(3, 6),
      this._order.slice(6, 9),
    ];
    return html`
      <form @submit=${this._submit} novalidate>
        <ha-input
          type="password"
          inputmode="numeric"
          autocomplete="off"
          maxlength=${PIN_MAX}
          .label=${label}
          .value=${this._value}
          ?disabled=${this.disabled}
          @input=${this._typed}
        ></ha-input>
        <div class="dots" aria-hidden="true">
          ${repeat(
            Array.from({ length: this._value.length }),
            (_x, index) => index,
            () => html`<span></span>`
          )}
        </div>
        <div class="pad" role="group" aria-label=${lockText("keypad")}>
          ${rows.map((row) => row.map((digit) => this._digit(digit)))}
          <button
            type="button"
            class="action"
            ?disabled=${this.disabled || !this._value}
            @click=${this._clear}
          >
            ${lockText("keypad_clear")}
          </button>
          ${this._digit(this._order[9])}
          <button
            type="button"
            class="action"
            ?disabled=${this.disabled || !this._value}
            @click=${this._backspace}
            aria-label=${lockText("keypad_backspace")}
          >
            &#9003;
          </button>
        </div>
        <label class="shuffle">
          <input
            type="checkbox"
            .checked=${this._shuffle}
            @change=${this._toggleShuffle}
          />
          ${lockText("keypad_shuffle")}
        </label>
        <div class="buttons">
          <button type="button" class="action" @click=${this._cancel}>
            ${lockText("cancel")}
          </button>
          <button
            type="submit"
            class="action primary"
            ?disabled=${this.disabled || !PIN_PATTERN.test(this._value)}
          >
            ${this.submitLabel || lockText("submit")}
          </button>
        </div>
      </form>
    `;
  }

  private _digit(digit: string): TemplateResult {
    return html`<button
      type="button"
      class="digit"
      ?disabled=${this.disabled}
      data-digit=${digit}
      @click=${this._digitPressed}
    >
      ${digit}
    </button>`;
  }

  private _digitPressed(ev: Event): void {
    const digit = (ev.currentTarget as HTMLElement).dataset.digit ?? "";
    if (this._value.length < PIN_MAX) {
      this._value += digit;
    }
  }

  private _typed(ev: Event): void {
    const raw = (ev.target as HaInput).value ?? "";
    // Only digits are kept, however the text arrived.
    this._value = raw.replace(/\D/g, "").slice(0, PIN_MAX);
    (ev.target as HaInput).value = this._value;
  }

  private _clear(): void {
    this._value = "";
  }

  private _backspace(): void {
    this._value = this._value.slice(0, -1);
  }

  private _toggleShuffle(ev: Event): void {
    this._shuffle = (ev.target as HTMLInputElement).checked;
    this._order = this._shuffle
      ? shuffled(["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"])
      : ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
  }

  private _cancel(): void {
    this._value = "";
    fireEvent(this, "lock-pin-cancel");
  }

  private _submit(ev: Event): void {
    ev.preventDefault();
    if (this.disabled || !PIN_PATTERN.test(this._value)) {
      return;
    }
    const value = this._value;
    this._value = "";
    fireEvent(this, "lock-pin-submit", { value });
  }

  static styles: CSSResultGroup = css`
    :host {
      display: block;
    }
    form {
      display: grid;
      gap: var(--ha-space-2);
    }
    .dots {
      display: flex;
      gap: var(--ha-space-1);
      min-height: 12px;
    }
    .dots span {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--primary-color);
    }
    .pad {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: var(--ha-space-2);
    }
    button {
      min-height: 56px;
      min-width: 56px;
      border: 1px solid var(--divider-color);
      border-radius: var(--ha-border-radius-lg);
      background: var(--secondary-background-color);
      color: var(--primary-text-color);
      font: inherit;
      font-size: var(--ha-font-size-xl, 1.25rem);
      cursor: pointer;
    }
    button:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    button:disabled {
      opacity: 0.5;
      cursor: default;
    }
    button.action {
      font-size: var(--ha-font-size-m, 1rem);
    }
    button.primary {
      background: var(--primary-color);
      color: var(--text-primary-color, #fff);
      border-color: var(--primary-color);
    }
    .buttons {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--ha-space-2);
    }
    .shuffle {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      min-height: 44px;
      color: var(--secondary-text-color);
    }
    .shuffle input {
      width: 20px;
      height: 20px;
    }
    @media (prefers-reduced-motion: reduce) {
      button {
        transition: none;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-lock-pin-entry": HaLockPinEntry;
  }
}
