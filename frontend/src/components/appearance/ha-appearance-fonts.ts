import { mdiAlertOutline, mdiCheckCircleOutline, mdiRestore } from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
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
import type {
  TypeScaleSettings,
  TypeScaleStep,
} from "../../common/appearance/type-scale";
import {
  applyTypeScale,
  BASE_MAX,
  BASE_MIN,
  computeTypeScale,
  DEFAULT_TYPE_SCALE,
  getTypeScale,
  isDefaultTypeScale,
  normalizeTypeScale,
  RATIO_MAX,
  RATIO_MIN,
  RATIO_PRESETS,
  SIZE_MAX,
  SIZE_MIN,
  setTypeScale,
  subscribeTypeScale,
  TYPE_SCALE_STEPS,
} from "../../common/appearance/type-scale";
import { getStorage } from "../../common/decorators/storage";
import type { HomeAssistant } from "../../types";
import "../ha-dialog";
import "../ha-select";
import type { HaSelect, HaSelectSelectEvent } from "../ha-select";
import "../ha-slider";
import type { HaSlider } from "../ha-slider";
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

  @state() private _typeScale: TypeScaleSettings = getTypeScale();

  // Whether the ratio is being typed in rather than taken from the presets.
  @state() private _customRatio = !RATIO_PRESETS.includes(getTypeScale().ratio);

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
      subscribeTypeScale((settings) => {
        applyTypeScale(settings);
        this._typeScale = settings;
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

            <div class="scale">
              <span class="label" id="scale-label"
                >${this._l("fonts_scale")}</span
              >
              <output>${Math.round(this._textScale * 100)}%</output>
              <ha-slider
                .min=${0}
                .max=${TEXT_SCALE_STEPS.length - 1}
                .step=${1}
                .value=${Math.max(0, TEXT_SCALE_STEPS.indexOf(this._textScale))}
                aria-labelledby="scale-label"
                aria-valuetext=${`${Math.round(this._textScale * 100)}%`}
                @change=${this._scaleChanged}
              ></ha-slider>
            </div>
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

            ${this._renderTypeScale()}

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
            ${this._renderScalePreview()}
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
              }) &&
              this._textScale === 1 &&
              isDefaultTypeScale(this._typeScale)
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
    const options = [
      ...(missing
        ? [{ value: selected, label: this._l("fonts_not_on_device") }]
        : []),
      ...choices.map((choice) => ({
        value: choice.key,
        label: `${choice.name} (${this._l(`fonts_source_${choice.source}`)})`,
      })),
    ];
    return html`
      <div class="field">
        <ha-select
          class="select"
          .label=${this._l(`fonts_${role}`)}
          .value=${selected}
          .options=${options}
          .field=${field}
          @selected=${this._fontChanged}
        ></ha-select>
      </div>
    `;
  }

  private _renderTypeScale() {
    const scale = this._typeScale;
    const sizes = computeTypeScale(scale);
    const ratioValue = this._customRatio ? "custom" : String(scale.ratio);
    const ratioOptions = [
      ...RATIO_PRESETS.map((ratio) => ({
        value: String(ratio),
        label: String(ratio),
      })),
      { value: "custom", label: this._l("ts_ratio_custom") },
    ];
    return html`
      <div class="ts">
        <div class="ts-head">
          <span class="label" id="ts-enable-label"
            >${this._l("ts_enable")}</span
          >
          <ha-switch
            .checked=${scale.enabled}
            aria-labelledby="ts-enable-label"
            @change=${this._tsEnabledChanged}
          ></ha-switch>
        </div>
        <p class="note">${this._l("ts_note")}</p>

        <ha-select
          class="select"
          .label=${this._l("ts_ratio")}
          .value=${ratioValue}
          .options=${ratioOptions}
          @selected=${this._tsRatioSelected}
        ></ha-select>

        ${
          this._customRatio
            ? html`
                <div class="scale">
                  <span class="label" id="ts-ratio-label"
                    >${this._l("ts_ratio_custom")}</span
                  >
                  <output>${scale.ratio.toFixed(2)}</output>
                  <ha-slider
                    .min=${RATIO_MIN}
                    .max=${RATIO_MAX}
                    .step=${0.01}
                    .value=${scale.ratio}
                    aria-labelledby="ts-ratio-label"
                    aria-valuetext=${scale.ratio.toFixed(2)}
                    @change=${this._tsCustomRatioChanged}
                  ></ha-slider>
                </div>
              `
            : nothing
        }

        <div class="scale">
          <span class="label" id="ts-base-label">${this._l("ts_base")}</span>
          <output>${scale.base} px</output>
          <ha-slider
            .min=${BASE_MIN}
            .max=${BASE_MAX}
            .step=${0.5}
            .value=${scale.base}
            aria-labelledby="ts-base-label"
            aria-valuetext=${`${scale.base} px`}
            @change=${this._tsBaseChanged}
          ></ha-slider>
        </div>

        ${TYPE_SCALE_STEPS.map((step) => {
          const overridden = scale.overrides[step] !== undefined;
          const label = this._l(`ts_step_${step}`);
          return html`
            <div class="scale">
              <span class="label" id=${`ts-size-${step}`}>${label}</span>
              <output>
                ${sizes[step]}
                px${overridden ? html` · ${this._l("ts_step_own")}` : nothing}
              </output>
              <ha-slider
                .min=${SIZE_MIN}
                .max=${SIZE_MAX}
                .step=${0.5}
                .value=${sizes[step]}
                .step_name=${step}
                aria-labelledby=${`ts-size-${step}`}
                aria-valuetext=${`${sizes[step]} px`}
                @change=${this._tsSizeChanged}
              ></ha-slider>
              ${
                overridden
                  ? html`<button
                      class="text-button small"
                      .step_name=${step}
                      @click=${this._tsClearOverride}
                    >
                      ${this._l("ts_step_auto", { step: label })}
                    </button>`
                  : nothing
              }
            </div>
          `;
        })}
      </div>
    `;
  }

  private _renderScalePreview() {
    const sizes = computeTypeScale(this._typeScale);
    return html`
      <div class="scale-preview">
        <span class="eyebrow">${this._l("ts_preview")}</span>
        ${TYPE_SCALE_STEPS.slice()
          .reverse()
          .map(
            (step) => html`
              <p
                class="step"
                style=${styleMap({
                  fontSize: `calc(${sizes[step]}px * var(--ha-font-size-scale, 1))`,
                })}
              >
                <span class="step-name">${this._l(`ts_step_${step}`)}</span>
                ${this._l("ts_sample")}
              </p>
            `
          )}
        ${
          this._typeScale.enabled
            ? nothing
            : html`<span class="note">${this._l("ts_off")}</span>`
        }
      </div>
    `;
  }

  private _saveTypeScale(patch: Partial<TypeScaleSettings>) {
    setTypeScale(normalizeTypeScale({ ...this._typeScale, ...patch }));
  }

  private _tsEnabledChanged(ev: Event) {
    this._saveTypeScale({
      enabled: (ev.currentTarget as HTMLInputElement).checked,
    });
  }

  private _tsRatioSelected(ev: HaSelectSelectEvent<string>) {
    ev.stopPropagation();
    const value = String(ev.detail.value);
    if (value === "custom") {
      this._customRatio = true;
      return;
    }
    this._customRatio = false;
    this._saveTypeScale({ ratio: Number(value) });
  }

  private _tsCustomRatioChanged(ev: Event) {
    this._saveTypeScale({
      ratio: Number((ev.currentTarget as HaSlider).value),
    });
  }

  private _tsBaseChanged(ev: Event) {
    this._saveTypeScale({ base: Number((ev.currentTarget as HaSlider).value) });
  }

  private _tsSizeChanged(ev: Event) {
    const slider = ev.currentTarget as HaSlider & { step_name: TypeScaleStep };
    this._saveTypeScale({
      overrides: {
        ...this._typeScale.overrides,
        [slider.step_name]: Number(slider.value),
      },
    });
  }

  private _tsClearOverride(ev: Event) {
    const step = (
      ev.currentTarget as HTMLElement & { step_name: TypeScaleStep }
    ).step_name;
    const overrides = { ...this._typeScale.overrides };
    delete overrides[step];
    this._saveTypeScale({ overrides });
  }

  private _fontChanged(ev: HaSelectSelectEvent<string>) {
    ev.stopPropagation();
    const select = ev.currentTarget as HaSelect & {
      field: keyof ReadingOptions;
    };
    setReadingOptions({
      ...this._options,
      [select.field]: String(ev.detail.value),
    });
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
    const index = Number((ev.currentTarget as HaSlider).value);
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
    this._customRatio = false;
    setTypeScale({ ...DEFAULT_TYPE_SCALE, overrides: {} });
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
      display: block;
      min-width: 0;
    }
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
    .scale ha-slider {
      grid-column: 1 / -1;
      grid-row: 2;
      width: 100%;
      min-width: 0;
    }
    .scale output {
      font-variant-numeric: tabular-nums;
      font-weight: var(--ha-font-weight-medium);
    }
    .ts {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-3);
      padding-top: var(--ha-space-3);
      border-top: 1px solid var(--divider-color);
    }
    .ts-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--ha-space-3);
      min-height: 44px;
    }
    .text-button.small {
      justify-self: start;
      min-height: 44px;
    }
    .scale-preview {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
      padding-top: var(--ha-space-2);
      border-top: 1px solid var(--divider-color);
    }
    .scale-preview .step {
      margin: 0;
      font-family: var(--ha-font-family-body);
      line-height: var(--ha-line-height-condensed);
      overflow-wrap: anywhere;
    }
    .step-name {
      margin-inline-end: var(--ha-space-2);
      font-weight: var(--ha-font-weight-medium);
      color: var(--secondary-text-color);
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
