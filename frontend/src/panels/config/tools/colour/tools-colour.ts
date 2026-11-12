import { mdiContentCopy, mdiEyedropper } from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import type {
  ColorFormats,
  Hsv,
} from "../../../../common/color/translate-color";
import {
  contrast,
  contrastGrade,
  formatColor,
  hsvToRgb,
  nearestNamed,
  parseColor,
  rgbToHsv,
} from "../../../../common/color/translate-color";
import type { Gamut } from "../../../../common/color/named-palette";
import {
  gamutOfRgb,
  NAMED_PALETTE,
  nearestNamedColour,
} from "../../../../common/color/named-palette";
import { copyToClipboard } from "../../../../common/util/copy-clipboard";
import "../../../../components/ha-button";
import "../../../../components/ha-icon-button";
import "../../../../components/ha-slider";
import type { HaSlider } from "../../../../components/ha-slider";
import "../../../../components/ha-svg-icon";
import "../../../../components/input/ha-input";
import type { HaInput } from "../../../../components/input/ha-input";
import { haStyle } from "../../../../resources/styles";
import type { HomeAssistant } from "../../../../types";

const ROWS: (keyof ColorFormats)[] = [
  "hex",
  "hex8",
  "rgb",
  "hsl",
  "hsv",
  "hwb",
  "oklch",
  "lab",
  "cmyk",
];

const GAMUTS: Gamut[] = ["srgb", "p3", "outside"];

interface EyeDropperLike {
  open(): Promise<{ sRGBHex: string }>;
}

/**
 * Any colour: pick or type one colour and read it in every notation, with
 * its nearest named colour and how well text reads on it.
 */
@customElement("tools-colour")
class ToolsColour extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  // Held as hue, saturation and value so a grey keeps its hue while it is
  // dragged through black or white.
  @state() private _hsv: Hsv = rgbToHsv(0, 99, 155);

  @state() private _alpha = 1;

  @state() private _typed = "";

  @state() private _typedBad = false;

  @state() private _status = "";

  private _l(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(
      `ui.panel.config.tools.tabs.colour.${key}` as any,
      values
    );
  }

  private _p(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(`ui.common.color_palette.${key}` as any, values);
  }

  protected render(): TemplateResult {
    const [r, g, b] = hsvToRgb(this._hsv);
    const color = { r, g, b, a: this._alpha };
    const formats = formatColor(color);
    const named = nearestNamed(r, g, b);
    const onWhite = contrast([r, g, b], [255, 255, 255]);
    const onBlack = contrast([r, g, b], [0, 0, 0]);
    const hueColor = `hsl(${this._hsv.h} 100% 50%)`;
    const hasEyeDropper = "EyeDropper" in window;
    const hex = formats.hex.toLowerCase();
    const nearest = nearestNamedColour([r, g, b]);
    const nearestName = this._p(`name_${nearest.colour.id}`);
    const gamut = gamutOfRgb([Math.round(r), Math.round(g), Math.round(b)]);
    return html`
      <div class="content">
        <section class="pane picker">
          <div
            class="square"
            role="slider"
            tabindex="0"
            aria-label=${this._l("square")}
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow=${Math.round(this._hsv.s * 100)}
            aria-valuetext=${this._l("square_value", {
              saturation: Math.round(this._hsv.s * 100),
              value: Math.round(this._hsv.v * 100),
            })}
            style=${styleMap({ backgroundColor: hueColor })}
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
          <div class="slider">
            <span id="hue-label">${this._l("hue")}</span>
            <ha-slider
              class="hue"
              .min=${0}
              .max=${360}
              .step=${1}
              .value=${Math.round(this._hsv.h)}
              aria-labelledby="hue-label"
              @input=${this._hueChanged}
            ></ha-slider>
            <output>${Math.round(this._hsv.h)}°</output>
          </div>
          <div
            class="rainbow"
            role="slider"
            tabindex="0"
            aria-label=${this._p("rainbow_label")}
            aria-valuemin="0"
            aria-valuemax="360"
            aria-valuenow=${Math.round(this._hsv.h)}
            aria-valuetext=${this._p("rainbow_value", {
              hue: Math.round(this._hsv.h),
            })}
            @pointerdown=${this._rainbowDown}
            @pointermove=${this._rainbowMove}
            @keydown=${this._rainbowKey}
          >
            <span
              class="rainbow-thumb"
              style=${styleMap({ left: `${(this._hsv.h / 360) * 100}%` })}
            ></span>
          </div>
          <div class="slider">
            <span id="alpha-label">${this._l("alpha")}</span>
            <ha-slider
              .min=${0}
              .max=${100}
              .step=${1}
              .value=${Math.round(this._alpha * 100)}
              aria-labelledby="alpha-label"
              @input=${this._alphaChanged}
            ></ha-slider>
            <output>${Math.round(this._alpha * 100)}%</output>
          </div>
          <div class="typed">
            <ha-input
              .label=${this._l("type")}
              .value=${this._typed}
              .invalid=${this._typedBad}
              @input=${this._typedChanged}
            ></ha-input>
            ${
              hasEyeDropper
                ? html`<ha-button
                    size="s"
                    appearance="outlined"
                    @click=${this._pickFromScreen}
                  >
                    <ha-svg-icon
                      slot="start"
                      .path=${mdiEyedropper}
                    ></ha-svg-icon>
                    ${this._l("pick")}
                  </ha-button>`
                : nothing
            }
          </div>
          <p class="note">
            ${this._typedBad ? this._l("type_bad") : this._l("type_note")}
          </p>
        </section>

        <section class="pane">
          <header>
            <span
              class="swatch"
              style=${styleMap({
                backgroundColor: `rgb(${r} ${g} ${b} / ${this._alpha})`,
              })}
            ></span>
            <div>
              <h2>${formats.hex}</h2>
              <p>
                ${this._l(named.exact ? "named_exact" : "named_nearest", {
                  name: named.name,
                  hex: named.hex,
                })}
              </p>
            </div>
          </header>
          <ul>
            ${ROWS.map(
              (row) => html`
                <li>
                  <span class="label">${this._l(`format_${row}`)}</span>
                  <code>${formats[row]}</code>
                  ${
                    row === "cmyk"
                      ? html`<span class="badge"
                          >${this._l("approximate")}</span
                        >`
                      : nothing
                  }
                  <ha-icon-button
                    .label=${this._l("copy", {
                      format: this._l(`format_${row}`),
                    })}
                    .path=${mdiContentCopy}
                    data-value=${formats[row]}
                    @click=${this._copy}
                  ></ha-icon-button>
                </li>
              `
            )}
          </ul>
          <p class="nearest">
            ${this._l(
              nearest.distance < 0.5 ? "family_exact" : "family_nearest",
              { name: nearestName }
            )}
          </p>
          <div class="gamut" role="group" aria-label=${this._p("gamut_label")}>
            ${GAMUTS.map(
              (item) =>
                html`<span
                  class=${classMap({ chip: true, active: item === gamut })}
                  aria-current=${item === gamut ? "true" : "false"}
                  >${this._p(`gamut_${item}`)}</span
                >`
            )}
          </div>
          <p class="note">${this._p(`gamut_${gamut}_note`)}</p>
          ${[
            ["white", onWhite],
            ["black", onBlack],
          ].map(([text, ratio]) => {
            const grade = contrastGrade(ratio as number);
            return html`<p class=${classMap({ contrast: true, [grade]: true })}>
              ${this._l(`contrast_${text}_${grade}`, {
                ratio: (ratio as number).toFixed(1),
              })}
            </p>`;
          })}
          ${
            this._status
              ? html`<p class="note" role="status">${this._status}</p>`
              : nothing
          }
        </section>

        <section class="pane wide">
          <h3>${this._p("palette_label")}</h3>
          <p class="note">${this._p("palette_hint")}</p>
          <div
            class="palette"
            role="group"
            aria-label=${this._p("palette_label")}
          >
            ${NAMED_PALETTE.map((item) => {
              const name = this._p(`name_${item.id}`);
              return html`<button
                class=${classMap({ named: true, current: item.hex === hex })}
                aria-label=${name}
                aria-pressed=${item.hex === hex ? "true" : "false"}
                title=${name}
                data-hex=${item.hex}
                style=${styleMap({ backgroundColor: item.hex })}
                @click=${this._pickNamed}
              ></button>`;
            })}
          </div>
        </section>
      </div>
    `;
  }

  private _setFromSquare(ev: PointerEvent): void {
    const box = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    this._hsv = {
      ...this._hsv,
      s: Math.min(1, Math.max(0, (ev.clientX - box.left) / box.width)),
      v: 1 - Math.min(1, Math.max(0, (ev.clientY - box.top) / box.height)),
    };
    this._typed = "";
    this._typedBad = false;
  }

  private _squareDown(ev: PointerEvent): void {
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    this._setFromSquare(ev);
  }

  private _squareMove(ev: PointerEvent): void {
    if ((ev.currentTarget as HTMLElement).hasPointerCapture(ev.pointerId)) {
      this._setFromSquare(ev);
    }
  }

  private _squareKey(ev: KeyboardEvent): void {
    const step = ev.shiftKey ? 0.1 : 0.01;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const move = moves[ev.key];
    if (!move) {
      return;
    }
    ev.preventDefault();
    this._hsv = {
      ...this._hsv,
      s: Math.min(1, Math.max(0, this._hsv.s + move[0])),
      v: Math.min(1, Math.max(0, this._hsv.v + move[1])),
    };
  }

  private _setHue(hue: number): void {
    this._hsv = { ...this._hsv, h: Math.min(360, Math.max(0, hue)) };
    this._typed = "";
    this._typedBad = false;
  }

  private _hueFromPointer(ev: PointerEvent): void {
    const box = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    this._setHue(((ev.clientX - box.left) / box.width) * 360);
  }

  private _rainbowDown(ev: PointerEvent): void {
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    this._hueFromPointer(ev);
  }

  private _rainbowMove(ev: PointerEvent): void {
    if ((ev.currentTarget as HTMLElement).hasPointerCapture(ev.pointerId)) {
      this._hueFromPointer(ev);
    }
  }

  private _rainbowKey(ev: KeyboardEvent): void {
    const step = ev.shiftKey ? 10 : 1;
    const hue = this._hsv.h;
    const next: Record<string, number> = {
      ArrowLeft: hue - step,
      ArrowDown: hue - step,
      ArrowRight: hue + step,
      ArrowUp: hue + step,
      PageDown: hue - 30,
      PageUp: hue + 30,
      Home: 0,
      End: 360,
    };
    if (!(ev.key in next)) {
      return;
    }
    ev.preventDefault();
    this._setHue(next[ev.key]);
  }

  private _pickNamed(ev: Event): void {
    const color = parseColor((ev.currentTarget as HTMLElement).dataset.hex!);
    if (color) {
      this._hsv = rgbToHsv(color.r, color.g, color.b);
      this._typed = "";
      this._typedBad = false;
    }
  }

  private _hueChanged(ev: Event): void {
    this._hsv = {
      ...this._hsv,
      h: Number((ev.currentTarget as HaSlider).value),
    };
  }

  private _alphaChanged(ev: Event): void {
    this._alpha = Number((ev.currentTarget as HaSlider).value) / 100;
  }

  private _typedChanged(ev: Event): void {
    this._typed = (ev.currentTarget as HaInput).value ?? "";
    if (!this._typed.trim()) {
      this._typedBad = false;
      return;
    }
    const color = parseColor(this._typed);
    this._typedBad = !color;
    if (color) {
      this._hsv = rgbToHsv(color.r, color.g, color.b);
      this._alpha = color.a;
    }
  }

  private async _pickFromScreen(): Promise<void> {
    try {
      const dropper = new (
        window as unknown as { EyeDropper: new () => EyeDropperLike }
      ).EyeDropper();
      const color = parseColor((await dropper.open()).sRGBHex);
      if (color) {
        this._hsv = rgbToHsv(color.r, color.g, color.b);
        this._alpha = 1;
        this._typed = "";
      }
    } catch (_err) {
      // The person left the picker without choosing.
    }
  }

  private async _copy(ev: Event): Promise<void> {
    const value = (ev.currentTarget as HTMLElement).dataset.value!;
    await copyToClipboard(value);
    this._status = this._l("copied", { value });
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        :host {
          display: block;
        }
        .content {
          box-sizing: border-box;
          max-width: 1200px;
          margin: 0 auto;
          padding: var(--ha-space-4) var(--ha-space-6) var(--ha-space-8);
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
          gap: var(--ha-space-3);
        }
        .pane {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-3);
          min-width: 0;
          padding: var(--ha-space-5);
          border-radius: var(--ha-border-radius-3xl);
          background: var(--card-background-color);
        }
        .square {
          position: relative;
          height: 260px;
          border-radius: var(--ha-border-radius-xl);
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
        .square:focus-visible {
          outline: 3px solid var(--primary-color);
          outline-offset: 2px;
        }
        .slider {
          display: grid;
          grid-template-columns: 56px 1fr 48px;
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
        .slider ha-slider {
          width: 100%;
          min-width: 0;
        }
        ha-slider.hue::part(track) {
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
        ha-slider.hue::part(indicator) {
          background: transparent;
        }
        .rainbow {
          position: relative;
          overflow: hidden;
          min-height: 44px;
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
          cursor: ew-resize;
          touch-action: none;
        }
        .rainbow::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(
            100deg,
            transparent 30%,
            rgba(255, 255, 255, 0.35) 50%,
            transparent 70%
          );
          background-size: 200% 100%;
          pointer-events: none;
          animation: rainbow-sheen 6s linear infinite;
        }
        @keyframes rainbow-sheen {
          from {
            background-position: 200% 0;
          }
          to {
            background-position: -200% 0;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .rainbow::after {
            animation: none;
          }
        }
        .rainbow:focus-visible,
        .named:focus-visible {
          outline: 3px solid var(--primary-color);
          outline-offset: 2px;
        }
        .rainbow-thumb {
          position: absolute;
          top: 50%;
          z-index: 1;
          width: 28px;
          height: 28px;
          margin: -14px 0 0 -14px;
          border: 3px solid #fff;
          border-radius: 50%;
          box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5);
          pointer-events: none;
        }
        .gamut {
          display: flex;
          flex-wrap: wrap;
          gap: var(--ha-space-2);
        }
        .chip {
          display: inline-flex;
          align-items: center;
          min-height: 32px;
          padding: 0 var(--ha-space-3);
          border: 1px solid var(--outline-color);
          border-radius: var(--ha-border-radius-pill);
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        .chip.active {
          border-color: transparent;
          background: var(--ha-color-fill-primary-normal-resting);
          color: var(--primary-text-color);
          font-weight: var(--ha-font-weight-medium);
        }
        .nearest {
          font-size: var(--ha-font-size-s);
        }
        .wide {
          grid-column: 1 / -1;
        }
        h3 {
          margin: 0;
          font-size: var(--ha-font-size-l);
          font-weight: var(--ha-font-weight-medium);
        }
        .palette {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(44px, 1fr));
          gap: var(--ha-space-2);
        }
        .named {
          min-width: 44px;
          min-height: 44px;
          padding: 0;
          border: 0;
          border-radius: var(--ha-border-radius-lg);
          box-shadow: inset 0 0 0 1px var(--outline-color);
          cursor: pointer;
        }
        .named.current {
          outline: 3px solid var(--primary-text-color);
          outline-offset: 2px;
        }
        .typed {
          display: flex;
          align-items: flex-end;
          gap: var(--ha-space-2);
        }
        .typed ha-input {
          flex: 1;
        }
        header {
          display: flex;
          align-items: center;
          gap: var(--ha-space-4);
        }
        .swatch {
          flex: none;
          width: 72px;
          height: 72px;
          border-radius: var(--ha-border-radius-xl);
          box-shadow: inset 0 0 0 1px var(--outline-color);
        }
        h2 {
          margin: 0;
          font-family: var(--ha-font-family-heading, inherit);
          font-size: var(--ha-font-size-2xl);
          font-weight: var(--ha-font-weight-medium);
        }
        p {
          margin: 0;
          line-height: var(--ha-line-height-normal);
        }
        header p,
        .note {
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
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
          gap: var(--ha-space-3);
          min-height: var(--ha-space-12);
          padding-inline-start: var(--ha-space-4);
          border-radius: var(--ha-border-radius-lg);
          background: var(--primary-background-color);
        }
        .label {
          flex: none;
          width: 64px;
          font-size: var(--ha-font-size-xs);
          font-weight: var(--ha-font-weight-medium);
          letter-spacing: 0.06em;
          color: var(--secondary-text-color);
        }
        code {
          flex: 1;
          min-width: 0;
          font-family: var(--ha-font-family-code);
          overflow-wrap: anywhere;
        }
        .badge {
          padding: 2px var(--ha-space-2);
          border-radius: var(--ha-border-radius-pill);
          background: color-mix(
            in srgb,
            var(--warning-color) 45%,
            var(--primary-background-color)
          );
          font-size: var(--ha-font-size-xs);
        }
        .contrast {
          padding: var(--ha-space-3) var(--ha-space-4);
          border-radius: var(--ha-border-radius-lg);
          background: var(--primary-background-color);
        }
        .contrast.all {
          background: color-mix(
            in srgb,
            var(--success-color) 28%,
            var(--primary-background-color)
          );
        }
        .contrast.large {
          background: color-mix(
            in srgb,
            var(--warning-color) 40%,
            var(--primary-background-color)
          );
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "tools-colour": ToolsColour;
  }
}
