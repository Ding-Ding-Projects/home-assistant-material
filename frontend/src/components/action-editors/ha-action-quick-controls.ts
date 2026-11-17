import { css, html, LitElement, nothing } from "lit";
import type { TemplateResult } from "lit";
import { customElement, property } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import { fireEvent } from "../../common/dom/fire_event";
import { LanguageModeController } from "../../common/language-mode/language-mode-controller";
import type { HomeAssistant } from "../../types";
import "../input/ha-input";
import "../ha-slider";
import "../ha-textarea";
import "../ha-switch";
import type { QuickControl, QuickOption } from "./descriptors";
import {
  coerceText,
  humanizeOption,
  snapToStep,
  splitAction,
} from "./descriptors";

declare global {
  interface HASSDomEvents {
    "quick-control-changed": { key: string; value: unknown };
    "quick-action-changed": { action: string };
  }
}

type TextControl = Extract<QuickControl, { kind: "text" }>;

/**
 * Rich controls for one action: sliders, steppers, option tiles, swatches,
 * switches and labelled value boxes. It only reports changes; the owning
 * service control writes them into the action data.
 */
@customElement("ha-action-quick-controls")
export class HaActionQuickControls extends LitElement {
  private _lang = new LanguageModeController(this);

  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public controls: QuickControl[] = [];

  /** Localized service field names, by data key. */
  @property({ attribute: false }) public fieldLabels: Record<string, string> =
    {};

  @property({ type: Boolean }) public disabled = false;

  private _t(key: string): string {
    return this._lang.text(this.hass.localize, key);
  }

  private _label(control: QuickControl): string {
    const named = this.fieldLabels[control.key];
    if (named) return named;
    if (control.labelKey.endsWith(".field_fallback")) {
      return humanizeOption(control.key);
    }
    return this._t(control.labelKey) || humanizeOption(control.key);
  }

  private _optionLabel(option: QuickOption): string {
    return (
      option.label ||
      (option.labelKey ? this._t(option.labelKey) : "") ||
      humanizeOption(option.value)
    );
  }

  private _emit(key: string, value: unknown) {
    if (this.disabled) return;
    fireEvent(this, "quick-control-changed", { key, value });
  }

  protected render() {
    if (!this.controls.length) return nothing;
    return html`${this.controls.map((control) => this._renderControl(control))}`;
  }

  private _find(key: string): QuickControl | undefined {
    return this.controls.find((control) => control.key === key);
  }

  private _renderControl(
    control: QuickControl
  ): TemplateResult | typeof nothing {
    switch (control.kind) {
      case "notice":
        return html`<div class="notice" role="note">
          ${this._t(control.labelKey)}
        </div>`;
      case "services":
        return html`<div class="control">
          <div class="label">${this._t(control.labelKey)}</div>
          <div
            class="tiles"
            role="group"
            aria-label=${this._t(control.labelKey)}
          >
            ${control.options.map((option) => {
              const [domain, service] = splitAction(option.value);
              const name =
                this.hass.localize(
                  `component.${domain}.services.${service}.name`
                ) || humanizeOption(service);
              const selected = option.value === control.value;
              return html`<button
                type="button"
                class=${classMap({ tile: true, selected })}
                aria-pressed=${selected}
                data-action=${option.value}
                .disabled=${this.disabled}
                @click=${this._onActionTile}
              >
                ${name}
              </button>`;
            })}
          </div>
        </div>`;
      case "slider":
        return this._renderSlider(control);
      case "stepper":
        return this._renderStepper(control);
      case "tiles":
        return html`<div class="control">
          ${this._head(control, control.value !== undefined)}
          <div class="tiles" role="group" aria-label=${this._label(control)}>
            ${control.options.map((option) => {
              const selected = option.value === control.value;
              return html`<button
                type="button"
                class=${classMap({ tile: true, selected })}
                aria-pressed=${selected}
                data-key=${control.key}
                data-value=${option.value}
                .disabled=${this.disabled}
                @click=${this._onTile}
              >
                ${this._optionLabel(option)}
              </button>`;
            })}
          </div>
        </div>`;
      case "swatches":
        return html`<div class="control">
          ${this._head(control, control.value !== undefined)}
          <div class="tiles" role="group" aria-label=${this._label(control)}>
            ${control.colors.map((color) => {
              const selected =
                Array.isArray(control.value) &&
                color.rgb.every(
                  (part, index) => control.value![index] === part
                );
              const name = this._t(
                `ui.components.action-editors.colors.${color.id}`
              );
              return html`<button
                type="button"
                class=${classMap({ swatch: true, selected })}
                style=${styleMap({ "--swatch": `rgb(${color.rgb.join(",")})` })}
                aria-pressed=${selected}
                aria-label=${name}
                title=${name}
                data-key=${control.key}
                data-color=${color.rgb.join(",")}
                .disabled=${this.disabled}
                @click=${this._onSwatch}
              ></button>`;
            })}
          </div>
        </div>`;
      case "switch":
        return html`<div class="control row">
          <span class="label">${this._label(control)}</span>
          <ha-switch
            .checked=${control.value === true}
            .disabled=${this.disabled}
            data-key=${control.key}
            @change=${this._onSwitch}
          ></ha-switch>
        </div>`;
      case "time":
      case "date":
      case "datetime":
        return this._renderTemporal(control);
      case "text":
        return this._renderText(control);
      default:
        return nothing;
    }
  }

  private _head(control: QuickControl, canClear: boolean) {
    return html`<div class="head">
      <span class="label">${this._label(control)}</span>
      ${
        canClear
          ? html`<button
              type="button"
              class="clear"
              data-key=${control.key}
              .disabled=${this.disabled}
              @click=${this._onClear}
            >
              ${this._t("ui.components.action-editors.clear")}
            </button>`
          : nothing
      }
    </div>`;
  }

  private _onClear(ev: Event) {
    this._emit((ev.currentTarget as HTMLElement).dataset.key!, undefined);
  }

  private _onTile(ev: Event) {
    const { key, value } = (ev.currentTarget as HTMLElement).dataset;
    this._emit(key!, value);
  }

  private _onSwatch(ev: Event) {
    const { key, color } = (ev.currentTarget as HTMLElement).dataset;
    this._emit(key!, color!.split(",").map(Number));
  }

  private _onSwitch(ev: Event) {
    const target = ev.currentTarget as HTMLInputElement;
    this._emit(target.dataset.key!, target.checked);
  }

  private _onActionTile(ev: Event) {
    const next = (ev.currentTarget as HTMLElement).dataset.action!;
    const current = this._find("$action");
    if (
      this.disabled ||
      (current?.kind === "services" && current.value === next)
    ) {
      return;
    }
    fireEvent(this, "quick-action-changed", { action: next });
  }

  private _renderSlider(control: Extract<QuickControl, { kind: "slider" }>) {
    const scale = control.scale ?? 1;
    const shown =
      control.value === undefined
        ? "—"
        : `${Math.round(control.value * scale * 100) / 100}`;
    return html`<div class="control">
      ${this._head(control, control.value !== undefined)}
      <div class="numeral" aria-hidden="true">
        ${shown}${
          control.value !== undefined && control.unit
            ? html`<span class="unit">${control.unit}</span>`
            : nothing
        }
      </div>
      <ha-slider
        labeled
        .min=${control.min}
        .max=${control.max}
        .step=${control.step}
        .value=${control.value ?? control.min}
        .disabled=${this.disabled}
        data-key=${control.key}
        aria-label=${this._label(control)}
        @change=${this._onSlider}
      ></ha-slider>
    </div>`;
  }

  private _onSlider(ev: Event) {
    ev.stopPropagation();
    const target = ev.currentTarget as HTMLInputElement;
    const control = this._find(target.dataset.key!);
    const value = Number(target.value);
    if (
      Number.isFinite(value) &&
      !(control?.kind === "slider" && control.value === value)
    ) {
      this._emit(target.dataset.key!, value);
    }
  }

  private _renderStepper(control: Extract<QuickControl, { kind: "stepper" }>) {
    const start = snapToStep(
      (control.min + control.max) / 2,
      control.min,
      control.max,
      control.step
    );
    const current = control.value ?? start;
    return html`<div class="control">
      ${this._head(control, control.value !== undefined)}
      <div class="stepper" role="group" aria-label=${this._label(control)}>
        <button
          type="button"
          class="step"
          aria-label=${this._t("ui.components.action-editors.decrease")}
          data-key=${control.key}
          data-dir="-1"
          .disabled=${
            this.disabled ||
            (control.value !== undefined && current <= control.min)
          }
          @click=${this._onStep}
        >
          −
        </button>
        <div class="numeral" aria-live="polite">
          ${control.value === undefined ? "—" : control.value}${
            control.value !== undefined && control.unit
              ? html`<span class="unit">${control.unit}</span>`
              : nothing
          }
        </div>
        <button
          type="button"
          class="step"
          aria-label=${this._t("ui.components.action-editors.increase")}
          data-key=${control.key}
          data-dir="1"
          .disabled=${
            this.disabled ||
            (control.value !== undefined && current >= control.max)
          }
          @click=${this._onStep}
        >
          +
        </button>
      </div>
    </div>`;
  }

  private _onStep(ev: Event) {
    const { key, dir } = (ev.currentTarget as HTMLElement).dataset;
    const control = this._find(key!);
    if (control?.kind !== "stepper") return;
    const start = snapToStep(
      (control.min + control.max) / 2,
      control.min,
      control.max,
      control.step
    );
    this._emit(
      key!,
      control.value === undefined
        ? start
        : snapToStep(
            control.value + Number(dir) * control.step,
            control.min,
            control.max,
            control.step
          )
    );
  }

  private _renderTemporal(
    control: Extract<QuickControl, { kind: "time" | "date" | "datetime" }>
  ) {
    const type = control.kind === "datetime" ? "datetime-local" : control.kind;
    const raw = control.value ?? "";
    const shown =
      control.kind === "datetime"
        ? raw.replace(" ", "T").slice(0, 16)
        : control.kind === "time"
          ? raw.slice(0, 5)
          : raw;
    return html`<div class="control">
      ${this._head(control, control.value !== undefined)}
      <ha-input
        class="box"
        type=${type}
        data-key=${control.key}
        .label=${this._label(control)}
        .value=${shown}
        .disabled=${this.disabled}
        @change=${this._onTemporal}
      ></ha-input>
    </div>`;
  }

  private _onTemporal(ev: Event) {
    const target = ev.currentTarget as HTMLInputElement;
    const control = this._find(target.dataset.key!);
    const text = target.value;
    if (!text || !control) {
      this._emit(target.dataset.key!, undefined);
      return;
    }
    this._emit(
      control.key,
      control.kind === "datetime"
        ? `${text.replace("T", " ")}:00`
        : control.kind === "time"
          ? `${text}:00`
          : text
    );
  }

  private _renderText(control: TextControl) {
    const value = control.value === undefined ? "" : String(control.value);
    return html`<div class="control">
      ${this._head(control, control.value !== undefined)}
      ${
        control.multiline
          ? html`<ha-textarea
              class="box area"
              data-key=${control.key}
              .rows=${3}
              resize="vertical"
              .label=${this._label(control)}
              .value=${value}
              .disabled=${this.disabled}
              @change=${this._onText}
            ></ha-textarea>`
          : html`<ha-input
              class="box"
              data-key=${control.key}
              type=${control.inputType ?? "text"}
              .label=${this._label(control)}
              .value=${value}
              .disabled=${this.disabled}
              @change=${this._onText}
            ></ha-input>`
      }
      ${
        control.chips?.length
          ? html`<div
              class="tiles"
              role="group"
              aria-label=${this._t("ui.components.action-editors.insert")}
            >
              ${control.chips.map(
                (chip) =>
                  html`<button
                    type="button"
                    class="tile"
                    data-key=${control.key}
                    data-snippet=${chip.text}
                    .disabled=${this.disabled}
                    @click=${this._onChip}
                  >
                    ${this._t(`ui.components.action-editors.chips.${chip.id}`)}
                  </button>`
              )}
            </div>`
          : nothing
      }
    </div>`;
  }

  private _onText(ev: Event) {
    const target = ev.currentTarget as HTMLInputElement;
    const control = this._find(target.dataset.key!);
    this._emit(
      target.dataset.key!,
      coerceText(
        target.value,
        control?.kind === "text" ? control.value : undefined
      )
    );
  }

  private _onChip(ev: Event) {
    const { key, snippet } = (ev.currentTarget as HTMLElement).dataset;
    const control = this._find(key!);
    const current =
      control?.kind === "text" && control.value !== undefined
        ? String(control.value)
        : "";
    // The box commits on change, so a snippet always lands after the saved
    // text, never in the middle of a half-typed edit.
    this._emit(key!, `${current}${snippet}`);
  }

  static styles = css`
    :host {
      display: block;
    }
    .control {
      padding: var(--ha-space-2) var(--ha-space-4);
      border-top: var(
        --service-control-items-border-top,
        1px solid var(--divider-color)
      );
    }
    .control.row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--ha-space-3);
      min-height: 48px;
    }
    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--ha-space-2);
      min-height: 40px;
    }
    .label {
      font-weight: var(--ha-font-weight-medium);
      overflow-wrap: anywhere;
    }
    .numeral {
      font-size: var(--ha-font-size-3xl, 2rem);
      font-weight: var(--ha-font-weight-medium);
      line-height: 1.1;
      text-align: center;
      min-width: 3ch;
    }
    .unit {
      font-size: var(--ha-font-size-m);
      color: var(--secondary-text-color);
      margin-inline-start: var(--ha-space-1);
    }
    ha-slider {
      width: 100%;
    }
    .tiles {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-2);
      padding-block: var(--ha-space-1) var(--ha-space-2);
    }
    .tile,
    .clear,
    .step,
    .swatch {
      font: inherit;
      color: var(--primary-text-color);
      cursor: pointer;
    }
    .tile {
      min-height: 48px;
      min-width: 48px;
      padding: 0 var(--ha-space-4);
      border-radius: var(--ha-border-radius-lg, 12px);
      border: 1px solid var(--divider-color);
      background: var(--secondary-background-color);
    }
    .tile.selected {
      background: var(--primary-color);
      border-color: var(--primary-color);
      color: var(--text-primary-color);
    }
    .clear {
      min-height: 40px;
      padding: 0 var(--ha-space-3);
      border: none;
      background: none;
      color: var(--primary-color);
    }
    .stepper {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--ha-space-4);
    }
    .step {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      border: 1px solid var(--divider-color);
      background: var(--secondary-background-color);
      font-size: var(--ha-font-size-xl, 1.5rem);
    }
    .swatch {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      border: 2px solid var(--divider-color);
      background: var(--swatch);
    }
    .swatch.selected {
      border-color: var(--primary-color);
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    button:disabled {
      opacity: 0.5;
      cursor: default;
    }
    button:focus-visible,
    .box:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    .box {
      box-sizing: border-box;
      width: 100%;
      min-height: 48px;
      padding: var(--ha-space-2) var(--ha-space-3);
      font: inherit;
      color: var(--primary-text-color);
      background: var(--secondary-background-color);
      border: 1px solid var(--divider-color);
      border-radius: var(--ha-border-radius-lg, 12px);
    }
    .area {
      resize: vertical;
    }
    .notice {
      margin: var(--ha-space-2) var(--ha-space-4);
      padding: var(--ha-space-2) var(--ha-space-3);
      border-radius: var(--ha-border-radius-lg, 12px);
      border-inline-start: 4px solid var(--warning-color);
      background: var(--secondary-background-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-action-quick-controls": HaActionQuickControls;
  }
}
