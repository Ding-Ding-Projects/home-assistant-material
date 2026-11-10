/* eslint-disable lit/prefer-query-decorators -- the row and the first key are found by what is shown now */
import {
  mdiBackspaceOutline,
  mdiKeyboardOutline,
  mdiShuffleVariant,
} from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { repeat } from "lit/directives/repeat";
import { getStorage } from "../../common/decorators/storage";
import { fireEvent } from "../../common/dom/fire_event";
import { PIN_PATTERN } from "../../common/locks/lock-credentials";
import "../ha-svg-icon";
import "../input/ha-input";
import type { HaInput } from "../input/ha-input";
import { isNarrow, isTouch, lockText, onNarrowChange } from "./lock-text";

declare global {
  interface HASSDomEvents {
    /** A PIN was submitted, from the keypad or from the field. */
    "lock-pin-submit": { value: string };
    /** PIN entry was cancelled. */
    "lock-pin-cancel": undefined;
    /** The PIN being entered became complete enough to submit, or stopped being so. */
    "lock-pin-change": { valid: boolean };
  }
}

const PIN_MAX = 12;
const DOTS_MIN = 6;
const SHUFFLE_KEY = "lockKeypadShuffle";
const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

const shuffled = (items: string[]): string[] => {
  const out = [...items];
  const random = crypto.getRandomValues(new Uint32Array(out.length));
  for (let i = out.length - 1; i > 0; i--) {
    const j = random[i] % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

const readShuffle = (): boolean => {
  try {
    return getStorage().getValue(SHUFFLE_KEY) === true;
  } catch (_err) {
    return false;
  }
};

/**
 * PIN entry with an on-screen keypad and a field. Both write the same
 * value and both submit through the same event, so whatever checks the PIN
 * sees one kind of input. The entered digits are shown only as dots and are
 * never put in a name or a live region. Wide, the keypad and the field sit
 * side by side; narrow, one is shown and "Type instead" swaps them.
 */
@customElement("ha-lock-pin-entry")
export class HaLockPinEntry extends LitElement {
  /** The label of the field. */
  @property({ attribute: false }) public label = "";

  /** The line above the keys. */
  @property({ attribute: false }) public prompt = "";

  @property({ attribute: false }) public submitLabel = "";

  @property({ attribute: false }) public disabled = false;

  /** Leaves out Cancel and Submit, for a host that has its own buttons. */
  @property({ attribute: "hide-actions", type: Boolean })
  public hideActions = false;

  @state() private _value = "";

  @state() private _shuffle = readShuffle();

  @state() private _order = [...DIGITS];

  @state() private _narrow = isNarrow();

  @state() private _typing = isNarrow() && !isTouch();

  @query("ha-input") private _field?: HaInput;

  private _stopNarrow?: () => void;

  public connectedCallback(): void {
    super.connectedCallback();
    this._stopNarrow = onNarrowChange((narrow) => {
      this._narrow = narrow;
    });
    this._order = this._shuffle ? shuffled(DIGITS) : [...DIGITS];
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._stopNarrow?.();
  }

  /** Whether the entered PIN can be submitted. */
  public get valid(): boolean {
    return PIN_PATTERN.test(this._value);
  }

  /** Empties the entry, after a wrong try or a step. */
  public clear(): void {
    this._setValue("");
    if (this._shuffle) {
      this._order = shuffled(DIGITS);
    }
  }

  /** Submits what was entered, when it is complete. */
  public submit(): void {
    if (this.disabled || !this.valid) {
      return;
    }
    const value = this._value;
    this._setValue("");
    fireEvent(this, "lock-pin-submit", { value });
  }

  /** Puts focus on the field where it is shown with a keyboard, else on the first key. */
  public focus(): void {
    this.updateComplete.then(() => {
      if (this._showField && (!isTouch() || this._typing)) {
        this._field?.focus?.();
      } else {
        this.renderRoot.querySelector<HTMLElement>(".digit")?.focus();
      }
    });
  }

  private get _showField(): boolean {
    return !this._narrow || this._typing;
  }

  private get _showPad(): boolean {
    return !this._narrow || !this._typing;
  }

  private _setValue(value: string): void {
    const before = this.valid;
    this._value = value;
    if (before !== this.valid) {
      fireEvent(this, "lock-pin-change", { valid: this.valid });
    }
  }

  protected render(): TemplateResult {
    return html`
      <form @submit=${this._submit} novalidate>
        <div class="layout">
          ${this._showPad ? this._renderPad() : nothing}
          ${this._showField ? this._renderField() : nothing}
        </div>
        ${
          this.hideActions
            ? nothing
            : html`<div class="buttons">
                <button type="button" class="action" @click=${this._cancel}>
                  ${lockText("cancel")}
                </button>
                <button
                  type="submit"
                  class="action primary"
                  ?disabled=${this.disabled || !this.valid}
                >
                  ${this.submitLabel || lockText("submit")}
                </button>
              </div>`
        }
      </form>
    `;
  }

  private _renderPad(): TemplateResult {
    const rows = [
      this._order.slice(0, 3),
      this._order.slice(3, 6),
      this._order.slice(6, 9),
    ];
    const dots = Math.max(DOTS_MIN, this._value.length);
    return html`<div class="padside">
      <p class="prompt">${this.prompt || lockText("pin_enter")}</p>
      <div class="dots" aria-hidden="true">
        ${repeat(
          Array.from({ length: dots }),
          (_x, index) => index,
          (_x, index) =>
            html`<span
              class=${classMap({ filled: index < this._value.length })}
            ></span>`
        )}
      </div>
      <div class="pad" role="group" aria-label=${lockText("keypad")}>
        ${rows.map((row) => row.map((digit) => this._digit(digit)))}
        <button
          type="button"
          class="key action"
          ?disabled=${this.disabled || !this._value}
          @click=${this._clear}
        >
          ${lockText("keypad_clear")}
        </button>
        ${this._digit(this._order[9])}
        <button
          type="button"
          class="key action"
          ?disabled=${this.disabled || !this._value}
          @click=${this._backspace}
          aria-label=${lockText("keypad_backspace")}
        >
          <ha-svg-icon .path=${mdiBackspaceOutline}></ha-svg-icon>
        </button>
      </div>
      <div class="links">
        <button
          type="button"
          class="text"
          aria-pressed=${this._shuffle ? "true" : "false"}
          @click=${this._toggleShuffle}
        >
          <ha-svg-icon .path=${mdiShuffleVariant}></ha-svg-icon>
          ${lockText("keypad_shuffle")}
        </button>
        ${
          this._narrow
            ? html`<button
                type="button"
                class="text"
                @click=${this._toggleTyping}
              >
                <ha-svg-icon .path=${mdiKeyboardOutline}></ha-svg-icon>
                ${lockText("keypad_type")}
              </button>`
            : nothing
        }
      </div>
    </div>`;
  }

  private _renderField(): TemplateResult {
    return html`<div class="fieldside">
      ${
        this._narrow
          ? html`<p class="prompt">${this.prompt || lockText("pin_enter")}</p>`
          : html`<p class="prompt">${lockText("pin_or_type")}</p>`
      }
      <ha-input
        type="password"
        inputmode="numeric"
        autocomplete="off"
        maxlength=${PIN_MAX}
        .label=${this.label || lockText("pin_label")}
        .value=${this._value}
        ?disabled=${this.disabled}
        @input=${this._typed}
      ></ha-input>
      ${
        this._narrow
          ? html`<button
              type="button"
              class="text"
              @click=${this._toggleTyping}
            >
              ${lockText("keypad_use")}
            </button>`
          : html`<p class="note">${lockText("pin_hint")}</p>`
      }
    </div>`;
  }

  private _digit(digit: string): TemplateResult {
    return html`<button
      type="button"
      class="key digit"
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
      this._setValue(this._value + digit);
    }
  }

  private _typed(ev: Event): void {
    const raw = (ev.target as HaInput).value ?? "";
    // Only digits are kept, however the text arrived.
    const value = raw.replace(/\D/g, "").slice(0, PIN_MAX);
    this._setValue(value);
    (ev.target as HaInput).value = value;
  }

  private _clear(): void {
    this._setValue("");
  }

  private _backspace(): void {
    this._setValue(this._value.slice(0, -1));
  }

  private _toggleTyping(): void {
    this._typing = !this._typing;
    this.focus();
  }

  private _toggleShuffle(): void {
    this._shuffle = !this._shuffle;
    try {
      getStorage().setValue(SHUFFLE_KEY, this._shuffle);
    } catch (_err) {
      // The choice then only lasts for this prompt.
    }
    this._order = this._shuffle ? shuffled(DIGITS) : [...DIGITS];
  }

  private _cancel(): void {
    this._setValue("");
    fireEvent(this, "lock-pin-cancel");
  }

  private _submit(ev: Event): void {
    ev.preventDefault();
    this.submit();
  }

  static styles: CSSResultGroup = css`
    :host {
      display: block;
      container-type: inline-size;
    }
    form {
      display: grid;
      gap: var(--ha-space-3);
    }
    .layout {
      display: grid;
      gap: var(--ha-space-4);
    }
    @container (min-width: 520px) {
      .layout {
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        align-items: start;
      }
    }
    .padside,
    .fieldside {
      display: grid;
      gap: var(--ha-space-2);
      align-content: start;
    }
    .prompt {
      margin: 0;
      text-align: center;
    }
    .fieldside .prompt {
      text-align: start;
      font-weight: 500;
    }
    .note {
      margin: 0;
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s, 0.85rem);
    }
    .dots {
      display: flex;
      justify-content: center;
      gap: var(--ha-space-2);
      min-height: 12px;
    }
    .dots span {
      width: 12px;
      height: 12px;
      box-sizing: border-box;
      border-radius: 50%;
      border: 2px solid var(--secondary-text-color);
    }
    .dots span.filled {
      background: var(--primary-color);
      border-color: var(--primary-color);
    }
    .pad {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: var(--ha-space-2);
    }
    button {
      border: 1px solid var(--divider-color);
      border-radius: var(--ha-border-radius-pill, 24px);
      background: var(--secondary-background-color);
      color: var(--primary-text-color);
      font: inherit;
      cursor: pointer;
    }
    button.key {
      min-height: 60px;
      min-width: 56px;
      border: 0;
      font-size: var(--ha-font-size-xl, 1.25rem);
    }
    button.digit {
      background: color-mix(in srgb, var(--primary-color) 16%, transparent);
    }
    button.action {
      min-height: 48px;
      font-size: var(--ha-font-size-m, 1rem);
    }
    button.key.action {
      min-height: 60px;
    }
    button.primary {
      background: var(--primary-color);
      color: var(--text-primary-color, #fff);
      border-color: var(--primary-color);
    }
    button.text {
      display: inline-flex;
      align-items: center;
      gap: var(--ha-space-2);
      min-height: 44px;
      padding: 0 var(--ha-space-2);
      border: 0;
      background: none;
      color: var(--primary-color);
    }
    button.text[aria-pressed="true"] {
      font-weight: 600;
    }
    button.text ha-svg-icon {
      --mdc-icon-size: 20px;
    }
    .links {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: var(--ha-space-2);
    }
    button:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    button:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .buttons {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--ha-space-2);
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
