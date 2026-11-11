import { mdiContentCopy, mdiEyedropper } from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import type { ContextType } from "@lit/context";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import {
  contrastReading,
  toLch,
  toNamed,
  toOklab,
} from "../../common/appearance/color-notations";
import type { Hsv } from "../../common/color/translate-color";
import {
  formatColor,
  hsvToRgb,
  nearestNamed,
  parseColor,
  rgbToHsv,
  toHex,
} from "../../common/color/translate-color";
import { consume } from "../../common/decorators/consume";
import { fireEvent } from "../../common/dom/fire_event";
import { copyToClipboard } from "../../common/util/copy-clipboard";
import type { LocalizeKeys } from "../../common/translations/localize";
import { internationalizationContext } from "../../data/context";
import "../ha-svg-icon";

declare global {
  interface HASSDomEvents {
    "appearance-color-changed": { value: string };
  }
}

type Notation =
  | "hex"
  | "rgb"
  | "hsl"
  | "oklch"
  | "lab"
  | "cmyk"
  | "hex8"
  | "hsv"
  | "hwb"
  | "lch"
  | "oklab"
  | "named";

const BASE: Notation[] = ["hex", "rgb", "hsl", "oklch", "lab", "cmyk"];
const EXTRA: Notation[] = ["hex8", "hsv", "hwb", "lch", "oklab", "named"];

interface EyeDropperLike {
  open(): Promise<{ sRGBHex: string }>;
}

/**
 * @element ha-appearance-color-picker
 *
 * @summary
 * The colour field of the appearance editor: a swatch with the colour's
 * value that opens a picker with a square, a hue slider, typed input, the
 * colour in every common notation with copy buttons, and a contrast reading
 * against the surface the colour will sit on. Everything works with the
 * keyboard. Colours are opaque `#rrggbb` values.
 *
 * @fires appearance-color-changed - The colour changed; `detail.value` is the new `#rrggbb`.
 */
@customElement("ha-appearance-color-picker")
export class HaAppearanceColorPicker extends LitElement {
  @state()
  @consume({ context: internationalizationContext, subscribe: true })
  private _i18n?: ContextType<typeof internationalizationContext>;

  /** The colour as `#rrggbb`. Empty or absent means none is set. */
  @property() public value?: string;

  @property() public label = "";

  /** The colour this one sits on, for the contrast reading. */
  @property({ attribute: "contrast-with" }) public contrastWith?: string;

  /** Words for what it sits on, such as "the background". */
  @property({ attribute: "contrast-name" }) public contrastName = "";

  @query(".trigger") private _trigger?: HTMLElement;

  @state() private _open = false;

  // Held as hue, saturation and value so a grey keeps its hue while it is
  // dragged through black or white.
  @state() private _hsv: Hsv = rgbToHsv(0, 0, 0);

  @state() private _typed = "";

  @state() private _typedBad = false;

  @state() private _extra = new Set<Notation>();

  @state() private _status = "";

  private _l(key: string, values?: Record<string, string | number>): string {
    return (
      this._i18n?.localize(
        `ui.appearance_editor.${key}` as LocalizeKeys,
        values
      ) || key
    );
  }

  protected willUpdate(changed: PropertyValues<this>) {
    if (changed.has("value") && this.value) {
      const color = parseColor(this.value);
      if (color && toHex(color).toLowerCase() !== this._currentHex()) {
        this._hsv = rgbToHsv(color.r, color.g, color.b);
      }
    }
  }

  private _currentHex(): string {
    const [r, g, b] = hsvToRgb(this._hsv);
    return toHex({ r, g, b, a: 1 }).toLowerCase();
  }

  protected render(): TemplateResult {
    const [r, g, b] = hsvToRgb(this._hsv);
    const hex = toHex({ r, g, b, a: 1 }).toLowerCase();
    const shown = this.value ? hex : this._l("picker_not_set");
    return html`
      <button
        class="trigger"
        aria-expanded=${this._open ? "true" : "false"}
        aria-label=${`${this.label}: ${shown}`}
        @click=${this._toggle}
      >
        <span
          class=${classMap({ swatch: true, empty: !this.value })}
          style=${styleMap({ backgroundColor: this.value ? hex : "" })}
        ></span>
        <span class="value">${shown}</span>
      </button>
      ${this._open ? this._renderPicker(r, g, b, hex) : nothing}
    `;
  }

  private _renderPicker(r: number, g: number, b: number, hex: string) {
    const formats = formatColor({ r, g, b, a: 1 });
    const named = nearestNamed(r, g, b);
    const values: Record<Notation, string> = {
      ...formats,
      lch: toLch(r, g, b),
      oklab: toOklab(r, g, b),
      named: toNamed(r, g, b),
    };
    const notations = [...BASE, ...EXTRA.filter((n) => this._extra.has(n))];
    const reading = this.contrastWith
      ? contrastReading(hex, this.contrastWith)
      : undefined;
    const hasEyeDropper = "EyeDropper" in window;
    return html`
      <div
        class="picker"
        role="group"
        aria-label=${this.label}
        @keydown=${this._pickerKey}
      >
        <div
          class="square"
          role="slider"
          tabindex="0"
          aria-label=${this._l("picker_square")}
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow=${Math.round(this._hsv.s * 100)}
          aria-valuetext=${this._l("picker_square_value", {
            saturation: Math.round(this._hsv.s * 100),
            value: Math.round(this._hsv.v * 100),
          })}
          style=${styleMap({ backgroundColor: `hsl(${this._hsv.h} 100% 50%)` })}
          @pointerdown=${this._squareDown}
          @pointermove=${this._squareMove}
          @keydown=${this._squareKey}
        >
          <span
            class="thumb"
            style=${styleMap({
              left: `${this._hsv.s * 100}%`,
              top: `${(1 - this._hsv.v) * 100}%`,
            })}
          ></span>
        </div>
        <label class="slider">
          <span>${this._l("picker_hue")}</span>
          <input
            class="hue"
            type="range"
            min="0"
            max="360"
            step="1"
            .value=${String(Math.round(this._hsv.h))}
            @input=${this._hueChanged}
          />
          <output>${Math.round(this._hsv.h)}°</output>
        </label>
        <div class="typed">
          <input
            type="text"
            class=${classMap({ invalid: this._typedBad })}
            aria-label=${this._l("picker_type")}
            aria-invalid=${this._typedBad ? "true" : "false"}
            spellcheck="false"
            autocomplete="off"
            .value=${this._typed || hex}
            @input=${this._typedChanged}
          />
          ${
            hasEyeDropper
              ? html`<button class="pill" @click=${this._pickFromScreen}>
                  <ha-svg-icon .path=${mdiEyedropper}></ha-svg-icon>
                  ${this._l("picker_screen")}
                </button>`
              : nothing
          }
        </div>
        <p class=${classMap({ note: true, error: this._typedBad })}>
          ${this._typedBad ? this._l("picker_type_bad") : this._l("picker_type_note")}
        </p>
        <p class="note">
          ${this._l("picker_named", { name: named.name, hex: named.hex })}
        </p>

        <ul>
          ${notations.map(
            (notation) => html`
              <li>
                <span class="label"
                  >${this._l(`picker_notation_${notation}`)}</span
                >
                <code>${values[notation]}</code>
                ${
                  notation === "cmyk"
                    ? html`<span class="badge"
                        >${this._l("picker_approximate")}</span
                      >`
                    : nothing
                }
                <button
                  class="icon"
                  aria-label=${this._l("picker_copy", {
                    format: this._l(`picker_notation_${notation}`),
                  })}
                  .value=${values[notation]}
                  @click=${this._copy}
                >
                  <ha-svg-icon .path=${mdiContentCopy}></ha-svg-icon>
                </button>
              </li>
            `
          )}
        </ul>
        <div class="chips" role="group" aria-label=${this._l("picker_more")}>
          ${EXTRA.map(
            (notation) => html`
              <button
                class="chip"
                aria-pressed=${this._extra.has(notation) ? "true" : "false"}
                .notation=${notation}
                @click=${this._toggleExtra}
              >
                ${this._l(`picker_notation_${notation}`)}
              </button>
            `
          )}
        </div>
        ${
          reading
            ? html`<p
                class=${classMap({ contrast: true, [reading.grade]: true })}
                role="status"
              >
                ${this._l(`picker_contrast_${reading.grade}`, {
                  ratio: reading.ratio.toFixed(1),
                  against: this.contrastName,
                })}
              </p>`
            : nothing
        }
        ${
          this._status
            ? html`<p class="note" role="status">${this._status}</p>`
            : nothing
        }
        <div class="actions">
          <button class="pill" @click=${this._close}>
            ${this._l("picker_done")}
          </button>
        </div>
      </div>
    `;
  }

  private _toggle() {
    this._open = !this._open;
    this._typed = "";
    this._typedBad = false;
    this._status = "";
  }

  private _close() {
    this._open = false;
    this.updateComplete.then(() => this._trigger?.focus());
  }

  // Escape closes the picker and nothing behind it.
  private _pickerKey(ev: KeyboardEvent) {
    if (ev.key === "Escape") {
      ev.preventDefault();
      ev.stopPropagation();
      this._close();
    }
  }

  private _emit() {
    this._typed = "";
    this._typedBad = false;
    fireEvent(this, "appearance-color-changed", { value: this._currentHex() });
  }

  private _setFromSquare(ev: PointerEvent) {
    const box = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    this._hsv = {
      ...this._hsv,
      s: Math.min(1, Math.max(0, (ev.clientX - box.left) / box.width)),
      v: 1 - Math.min(1, Math.max(0, (ev.clientY - box.top) / box.height)),
    };
    this._emit();
  }

  private _squareDown(ev: PointerEvent) {
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    this._setFromSquare(ev);
  }

  private _squareMove(ev: PointerEvent) {
    if ((ev.currentTarget as HTMLElement).hasPointerCapture(ev.pointerId)) {
      this._setFromSquare(ev);
    }
  }

  // Arrows move the point, Shift moves it further, Home and End go to the
  // dull and the vivid edge, Page Up and Page Down to the light and dark edge.
  private _squareKey(ev: KeyboardEvent) {
    const step = ev.shiftKey ? 0.1 : 0.01;
    const clamp = (value: number) => Math.min(1, Math.max(0, value));
    const { s, v } = this._hsv;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [clamp(s - step), v],
      ArrowRight: [clamp(s + step), v],
      ArrowUp: [s, clamp(v + step)],
      ArrowDown: [s, clamp(v - step)],
      Home: [0, v],
      End: [1, v],
      PageUp: [s, 1],
      PageDown: [s, 0],
    };
    const move = moves[ev.key];
    if (!move) {
      return;
    }
    ev.preventDefault();
    this._hsv = { ...this._hsv, s: move[0], v: move[1] };
    this._emit();
  }

  private _hueChanged(ev: Event) {
    this._hsv = {
      ...this._hsv,
      h: Number((ev.currentTarget as HTMLInputElement).value),
    };
    this._emit();
  }

  private _typedChanged(ev: Event) {
    const text = (ev.currentTarget as HTMLInputElement).value;
    this._typed = text;
    if (!text.trim()) {
      this._typedBad = false;
      return;
    }
    const color = parseColor(text);
    this._typedBad = !color;
    if (color) {
      this._hsv = rgbToHsv(color.r, color.g, color.b);
      fireEvent(this, "appearance-color-changed", {
        value: toHex({ ...color, a: 1 }).toLowerCase(),
      });
    }
  }

  private async _pickFromScreen() {
    try {
      const dropper = new (
        window as unknown as { EyeDropper: new () => EyeDropperLike }
      ).EyeDropper();
      const color = parseColor((await dropper.open()).sRGBHex);
      if (color) {
        this._hsv = rgbToHsv(color.r, color.g, color.b);
        this._emit();
      }
    } catch (_err) {
      // The person left the picker without choosing.
    }
  }

  private _toggleExtra(ev: Event) {
    const notation = (ev.currentTarget as HTMLElement & { notation: Notation })
      .notation;
    const next = new Set(this._extra);
    if (!next.delete(notation)) {
      next.add(notation);
    }
    this._extra = next;
  }

  private async _copy(ev: Event) {
    const value = (ev.currentTarget as HTMLElement & { value: string }).value;
    await copyToClipboard(value);
    this._status = this._l("picker_copied", { value });
  }

  static styles: CSSResultGroup = css`
    :host {
      display: block;
      min-width: 0;
    }
    button {
      font: inherit;
      color: inherit;
    }
    button:focus-visible,
    input:focus-visible,
    .square:focus-visible {
      outline: 3px solid var(--primary-color);
      outline-offset: 2px;
    }
    .trigger {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      width: 100%;
      min-height: var(--ha-space-10);
      padding: var(--ha-space-1) var(--ha-space-2);
      border: 1px solid var(--outline-color);
      border-radius: var(--ha-border-radius-md);
      background: none;
      cursor: pointer;
      text-align: start;
    }
    .swatch {
      flex: none;
      width: var(--ha-space-8);
      height: var(--ha-space-6);
      border-radius: var(--ha-border-radius-sm);
      box-shadow: inset 0 0 0 1px var(--outline-color);
    }
    .swatch.empty {
      background-image: repeating-linear-gradient(
        45deg,
        var(--divider-color) 0 3px,
        transparent 3px 6px
      );
    }
    .value {
      flex: 1;
      min-width: 0;
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
      font-variant-numeric: tabular-nums;
    }
    .picker {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
      margin-top: var(--ha-space-2);
      padding: var(--ha-space-3);
      border-radius: var(--ha-border-radius-xl);
      background: var(--secondary-background-color);
    }
    .square {
      position: relative;
      height: 160px;
      border-radius: var(--ha-border-radius-lg);
      background-image:
        linear-gradient(to top, #000, transparent),
        linear-gradient(to right, #fff, transparent);
      cursor: crosshair;
      touch-action: none;
    }
    .thumb {
      position: absolute;
      width: 24px;
      height: 24px;
      margin: -12px 0 0 -12px;
      border: 3px solid #fff;
      border-radius: 50%;
      box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5);
      pointer-events: none;
    }
    .slider {
      display: grid;
      grid-template-columns: 40px 1fr 44px;
      align-items: center;
      gap: var(--ha-space-2);
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
    .slider output {
      text-align: end;
      font-variant-numeric: tabular-nums;
      color: var(--primary-text-color);
    }
    input.hue {
      width: 100%;
      height: 16px;
      appearance: none;
      -webkit-appearance: none;
      border-radius: var(--ha-border-radius-pill);
      background: linear-gradient(
        to right,
        #f00,
        #ff0,
        #0f0,
        #0ff,
        #00f,
        #f0f,
        #f00
      );
    }
    input.hue::-webkit-slider-thumb {
      appearance: none;
      -webkit-appearance: none;
      width: 10px;
      height: 28px;
      border: 2px solid var(--primary-text-color);
      border-radius: var(--ha-border-radius-md);
      background: var(--primary-background-color);
    }
    input.hue::-moz-range-thumb {
      width: 10px;
      height: 28px;
      border: 2px solid var(--primary-text-color);
      border-radius: var(--ha-border-radius-md);
      background: var(--primary-background-color);
    }
    .typed {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
    }
    .typed input {
      flex: 1;
      min-width: 0;
      height: var(--ha-space-10);
      padding: 0 var(--ha-space-3);
      box-sizing: border-box;
      border: 1px solid var(--outline-color);
      border-radius: var(--ha-border-radius-md);
      background: var(--card-background-color);
      color: inherit;
      font: inherit;
      font-family: var(--ha-font-family-code);
    }
    .typed input.invalid {
      border-color: var(--error-color);
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: var(--ha-space-1);
      min-height: var(--ha-space-10);
      padding: 0 var(--ha-space-3);
      border: 1px solid var(--outline-color);
      border-radius: var(--ha-border-radius-pill);
      background: var(--card-background-color);
      font-weight: var(--ha-font-weight-medium);
      cursor: pointer;
      --mdc-icon-size: 18px;
    }
    .note {
      margin: 0;
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
    .note.error {
      color: var(--error-color);
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
    }
    li {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      min-height: var(--ha-space-10);
      padding-inline-start: var(--ha-space-3);
      border-radius: var(--ha-border-radius-lg);
      background: var(--card-background-color);
    }
    .label {
      flex: none;
      width: 56px;
      font-size: var(--ha-font-size-xs);
      font-weight: var(--ha-font-weight-medium);
      letter-spacing: 0.06em;
      color: var(--secondary-text-color);
    }
    code {
      flex: 1;
      min-width: 0;
      font-family: var(--ha-font-family-code);
      font-size: var(--ha-font-size-s);
      overflow-wrap: anywhere;
    }
    .badge {
      padding: 2px var(--ha-space-2);
      border-radius: var(--ha-border-radius-pill);
      background: var(--ha-color-fill-warning-quiet-resting);
      font-size: var(--ha-font-size-xs);
    }
    .icon {
      display: flex;
      align-items: center;
      justify-content: center;
      flex: none;
      width: var(--ha-space-10);
      height: var(--ha-space-10);
      border: none;
      border-radius: var(--ha-border-radius-circle);
      background: none;
      cursor: pointer;
      --mdc-icon-size: 18px;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-1);
    }
    .chip {
      min-height: var(--ha-space-9, 36px);
      padding: 0 var(--ha-space-3);
      border: 1px solid var(--outline-color);
      border-radius: var(--ha-border-radius-pill);
      background: none;
      font-size: var(--ha-font-size-s);
      font-weight: var(--ha-font-weight-medium);
      cursor: pointer;
    }
    .chip[aria-pressed="true"] {
      background: var(--ha-color-fill-primary-normal-resting);
      border-color: transparent;
    }
    .contrast {
      margin: 0;
      padding: var(--ha-space-3);
      border-radius: var(--ha-border-radius-lg);
      font-size: var(--ha-font-size-s);
      background: var(--ha-color-fill-success-quiet-resting);
    }
    .contrast.large {
      background: var(--ha-color-fill-warning-quiet-resting);
    }
    .contrast.none {
      background: var(--ha-color-fill-danger-quiet-resting);
    }
    .actions {
      display: flex;
      justify-content: flex-end;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-appearance-color-picker": HaAppearanceColorPicker;
  }
}
