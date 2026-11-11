import { mdiAlertOutline, mdiCheckCircleOutline, mdiRestore } from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import {
  ACCESSIBILITY_STORAGE_KEY,
  getAccessibilitySettings,
  subscribeAccessibilitySettings,
  TEXT_SCALE_STEPS,
} from "../../common/accessibility/accessibility-tools";
import {
  contrastRatio,
  cssColorToHex,
} from "../../common/appearance/element-appearance";
import type {
  FontAvailability,
  FontChoice,
  HeadingWeight,
  ReadingOptions,
} from "../../common/appearance/reading-options";
import {
  availableFonts,
  DEFAULT_READING_OPTIONS,
  getReadingOptions,
  HEADING_WEIGHTS,
  isDefaultReadingOptions,
  setReadingOptions,
  subscribeReadingOptions,
} from "../../common/appearance/reading-options";
import { getStorage } from "../../common/decorators/storage";
import type { HomeAssistant } from "../../types";
import "../ha-dialog";
import "../ha-svg-icon";
import "../ha-switch";

type FontRole = "heading" | "body" | "code";

const ROLES: { role: FontRole; field: keyof ReadingOptions }[] = [
  { role: "heading", field: "headingFont" },
  { role: "body", field: "bodyFont" },
  { role: "code", field: "codeFont" },
];

/**
 * @element ha-appearance-fonts
 *
 * @summary
 * Fonts for the interface: one for headings, one for body text and labels,
 * one for numbers and code, the weight of headings and the size of the type
 * scale, with a live preview. Typefaces are the one bundled with the project
 * and the ones installed on this device; nothing is fetched from the
 * internet. The choices are kept in this browser and take effect everywhere
 * as they are made.
 */
@customElement("ha-appearance-fonts")
export class HaAppearanceFonts extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _open = true;

  @state() private _options: ReadingOptions = getReadingOptions();

  @state() private _textScale = getAccessibilitySettings().textScale;

  @state() private _available?: FontAvailability;

  @state() private _contrast?: number;

  @query("#preview") private _preview?: HTMLElement;

  private _unsubscribe: (() => void)[] = [];

  public connectedCallback() {
    super.connectedCallback();
    this._available = availableFonts();
    this._unsubscribe = [
      subscribeReadingOptions((options) => {
        this._options = options;
      }),
      subscribeAccessibilitySettings((settings) => {
        this._textScale = settings.textScale;
      }),
    ];
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubscribe.forEach((stop) => stop());
    this._unsubscribe = [];
  }

  protected updated() {
    this._measureContrast();
  }

  private _l(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(`ui.accessibility_tools.${key}` as any, values);
  }

  protected render(): TemplateResult {
    const available = this._available ?? availableFonts();
    return html`
      <ha-dialog
        .open=${this._open}
        width="large"
        .headerTitle=${this._l("fonts_title")}
        @closed=${this._closed}
      >
        <div class="content">
          <div class="choices">
            ${ROLES.map(({ role, field }) =>
              this._renderFont(
                role,
                field,
                available[role === "code" ? "code" : "body"]
              )
            )}
            <p class="note">${this._l("fonts_device_only")}</p>

            <label class="scale">
              <span class="label">${this._l("fonts_scale")}</span>
              <input
                type="range"
                min="0"
                max=${TEXT_SCALE_STEPS.length - 1}
                step="1"
                .value=${String(TEXT_SCALE_STEPS.indexOf(this._textScale))}
                aria-valuetext=${`${Math.round(this._textScale * 100)}%`}
                @input=${this._scaleChanged}
              />
              <output>${Math.round(this._textScale * 100)}%</output>
            </label>
            <p class="note">${this._l("fonts_scale_note")}</p>

            <div class="weight">
              <span class="label" id="weight-label"
                >${this._l("fonts_weight")}</span
              >
              <div
                class="segments"
                role="radiogroup"
                aria-labelledby="weight-label"
              >
                ${HEADING_WEIGHTS.map(
                  (weight) => html`
                    <button
                      role="radio"
                      aria-checked=${
                        this._options.headingWeight === weight
                          ? "true"
                          : "false"
                      }
                      .weight=${weight}
                      @click=${this._weightChanged}
                    >
                      ${this._l(`fonts_weight_${weight}`)}
                    </button>
                  `
                )}
              </div>
            </div>

            <p class="note">${this._l("fonts_default")}</p>
          </div>

          <section
            class="preview"
            id="preview"
            aria-label=${this._l("fonts_preview")}
          >
            <span class="eyebrow">${this._l("fonts_preview")}</span>
            <h3>${this._l("fonts_preview_title")}</h3>
            <h4>${this._l("fonts_preview_room")}</h4>
            <p>${this._l("fonts_preview_text")}</p>
            <code>${this._l("fonts_preview_code")}</code>
            ${
              this._contrast === undefined
                ? nothing
                : html`<p
                    class=${classMap({
                      contrast: true,
                      low: this._contrast < 4.5,
                    })}
                    role="status"
                  >
                    <ha-svg-icon
                      .path=${
                        this._contrast >= 4.5
                          ? mdiCheckCircleOutline
                          : mdiAlertOutline
                      }
                    ></ha-svg-icon>
                    ${this._l(
                      this._contrast >= 4.5
                        ? "fonts_contrast_pass"
                        : "fonts_contrast_low",
                      { ratio: this._contrast.toFixed(1) }
                    )}
                  </p>`
            }
          </section>
        </div>
        <div slot="footer" class="footer">
          <button
            class="text-button"
            ?disabled=${
              isDefaultReadingOptions({
                ...this._options,
                lineSpacing: DEFAULT_READING_OPTIONS.lineSpacing,
                wideSpacing: DEFAULT_READING_OPTIONS.wideSpacing,
              }) && this._textScale === 1
            }
            @click=${this._reset}
          >
            <ha-svg-icon .path=${mdiRestore}></ha-svg-icon>
            ${this._l("fonts_reset")}
          </button>
        </div>
      </ha-dialog>
    `;
  }

  private _renderFont(
    role: FontRole,
    field: keyof ReadingOptions,
    choices: FontChoice[]
  ) {
    const selected = this._options[field] as string;
    const missing = !choices.some((choice) => choice.key === selected);
    return html`
      <div class="field">
        <label for=${`font-${role}`}>${this._l(`fonts_${role}`)}</label>
        <div class="select">
          <select
            id=${`font-${role}`}
            .field=${field}
            @change=${this._fontChanged}
          >
            ${
              missing
                ? html`<option value=${selected} selected>
                    ${this._l("fonts_not_on_device")}
                  </option>`
                : nothing
            }
            ${choices.map(
              (choice) => html`
                <option
                  value=${choice.key}
                  ?selected=${choice.key === selected}
                >
                  ${choice.name} (${this._l(`fonts_source_${choice.source}`)})
                </option>
              `
            )}
          </select>
        </div>
      </div>
    `;
  }

  private _fontChanged(ev: Event) {
    const select = ev.currentTarget as HTMLSelectElement & {
      field: keyof ReadingOptions;
    };
    setReadingOptions({ ...this._options, [select.field]: select.value });
  }

  private _weightChanged(ev: Event) {
    setReadingOptions({
      ...this._options,
      headingWeight: (
        ev.currentTarget as HTMLElement & { weight: HeadingWeight }
      ).weight,
    });
  }

  private _scaleChanged(ev: Event) {
    const index = Number((ev.currentTarget as HTMLInputElement).value);
    getStorage().setValue(ACCESSIBILITY_STORAGE_KEY, {
      ...getAccessibilitySettings(),
      textScale: TEXT_SCALE_STEPS[index] ?? 1,
    });
  }

  private _reset() {
    setReadingOptions({
      ...this._options,
      bodyFont: DEFAULT_READING_OPTIONS.bodyFont,
      headingFont: DEFAULT_READING_OPTIONS.headingFont,
      codeFont: DEFAULT_READING_OPTIONS.codeFont,
      headingWeight: DEFAULT_READING_OPTIONS.headingWeight,
    });
    getStorage().setValue(ACCESSIBILITY_STORAGE_KEY, {
      ...getAccessibilitySettings(),
      textScale: 1,
    });
  }

  // The reading of the preview's own text against the card it sits on.
  private _measureContrast() {
    const preview = this._preview;
    if (!preview) {
      return;
    }
    const style = getComputedStyle(preview);
    const text = cssColorToHex(style.color);
    const background = cssColorToHex(style.backgroundColor);
    const next =
      text && background ? contrastRatio(text, background) : undefined;
    if (next !== this._contrast) {
      this._contrast = next;
    }
  }

  private _closed(ev: Event) {
    if (ev.target !== ev.currentTarget) {
      return;
    }
    this._open = false;
    this.dispatchEvent(new CustomEvent("closed"));
  }

  static styles: CSSResultGroup = css`
    .content {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr));
      gap: var(--ha-space-4);
      align-items: start;
    }
    .choices {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-3);
      min-width: 0;
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
    }
    .field label,
    .label {
      font-size: var(--ha-font-size-s);
      font-weight: var(--ha-font-weight-medium);
      color: var(--secondary-text-color);
    }
    .select {
      position: relative;
      display: flex;
      align-items: center;
    }
    select {
      flex: 1;
      min-width: 0;
      height: var(--ha-space-12);
      padding: 0 var(--ha-space-4);
      border: 1px solid var(--outline-color);
      border-radius: var(--ha-border-radius-xl);
      background: var(--card-background-color);
      color: var(--primary-text-color);
      font: inherit;
      font-size: var(--ha-font-size-l);
    }
    select:focus-visible,
    input:focus-visible,
    button:focus-visible {
      outline: 3px solid var(--primary-color);
      outline-offset: 2px;
    }
    .note {
      margin: 0;
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
    .scale {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      gap: var(--ha-space-1) var(--ha-space-3);
    }
    .scale input {
      grid-column: 1 / -1;
      grid-row: 2;
      width: 100%;
      accent-color: var(--primary-color);
    }
    .scale output {
      font-variant-numeric: tabular-nums;
      font-weight: var(--ha-font-weight-medium);
    }
    .weight {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--ha-space-2);
    }
    .segments {
      display: flex;
      padding: var(--ha-space-1);
      gap: var(--ha-space-1);
      border-radius: var(--ha-border-radius-pill);
      background: var(--secondary-background-color);
    }
    .segments button {
      height: var(--ha-space-9, 36px);
      padding: 0 var(--ha-space-3);
      border: none;
      border-radius: var(--ha-border-radius-pill);
      background: none;
      font: inherit;
      font-weight: var(--ha-font-weight-medium);
      color: var(--secondary-text-color);
      cursor: pointer;
    }
    .segments button[aria-checked="true"] {
      background: var(--primary-text-color);
      color: var(--primary-background-color);
    }
    .preview {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
      min-width: 0;
      padding: var(--ha-space-5);
      border-radius: var(--ha-border-radius-3xl);
      background: var(--secondary-background-color);
      color: var(--primary-text-color);
    }
    .eyebrow {
      font-size: var(--ha-font-size-s);
      font-weight: var(--ha-font-weight-medium);
      color: var(--secondary-text-color);
    }
    .preview h3,
    .preview h4,
    .preview p {
      margin: 0;
    }
    .preview h3 {
      font-family: var(--ha-font-family-heading);
      font-weight: var(--ha-font-weight-heading);
      font-size: var(--ha-font-size-4xl);
      line-height: var(--ha-line-height-condensed);
    }
    .preview h4 {
      font-family: var(--ha-font-family-heading);
      font-weight: var(--ha-font-weight-heading);
      font-size: var(--ha-font-size-2xl);
    }
    .preview p {
      font-family: var(--ha-font-family-body);
      font-size: var(--ha-font-size-l);
      line-height: var(--ha-line-height-normal);
    }
    .preview code {
      font-family: var(--ha-font-family-code);
      font-size: var(--ha-font-size-m);
      overflow-wrap: anywhere;
    }
    .contrast {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      padding: var(--ha-space-3);
      border-radius: var(--ha-border-radius-xl);
      background: var(--ha-color-fill-success-quiet-resting);
      font-size: var(--ha-font-size-s);
      --mdc-icon-size: 20px;
    }
    .preview p.contrast {
      font-size: var(--ha-font-size-s);
    }
    .contrast.low {
      background: var(--ha-color-fill-warning-quiet-resting);
    }
    .footer {
      display: flex;
      justify-content: flex-start;
    }
    .text-button {
      display: inline-flex;
      align-items: center;
      gap: var(--ha-space-2);
      height: var(--ha-space-10);
      padding: 0 var(--ha-space-4);
      border: none;
      border-radius: var(--ha-border-radius-pill);
      background: none;
      color: var(--primary-color);
      font: inherit;
      font-weight: var(--ha-font-weight-medium);
      cursor: pointer;
      --mdc-icon-size: 18px;
    }
    .text-button[disabled] {
      opacity: 0.4;
      cursor: default;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-appearance-fonts": HaAppearanceFonts;
  }
}
