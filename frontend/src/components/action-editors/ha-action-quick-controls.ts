import { css, html, LitElement, nothing } from "lit";
import type { TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import { hs2rgb, rgb2hs } from "../../common/color/convert-color";
import { fireEvent } from "../../common/dom/fire_event";
import { LanguageModeController } from "../../common/language-mode/language-mode-controller";
import type { HomeAssistant } from "../../types";
import "../input/ha-input";
import "../ha-duration-input";
import "../ha-expansion-panel";
import "../ha-hs-color-picker";
import "../ha-selector/ha-selector";
import "../ha-slider";
import "../ha-textarea";
import "../ha-switch";
import type { HaDurationData } from "../ha-duration-input";
import type { QuickControl, QuickOption } from "./descriptors";
import {
  coerceText,
  LIGHT_COLORS,
  humanizeOption,
  snapToStep,
  splitAction,
} from "./descriptors";
import "../../panels/config/automation/ha-automation-zone-map";
import "./ha-automation-options-editor";
import {
  colorToHexText,
  colorToRgb,
  hexTextToColor,
  durationSeconds,
  hexToRgb,
  partsToSeconds,
  rgbToColor,
  rgbToHex,
  secondsToParts,
  secondsToText,
  WHITE_CHANNELS,
} from "./quick-rich";

declare global {
  interface HASSDomEvents {
    "quick-control-changed": { key: string; value: unknown };
    "quick-action-changed": { action: string };
    "quick-run-action": undefined;
  }
}

type TextControl = Extract<QuickControl, { kind: "text" }>;

/** Entity tiles shown before the rest move to the entity picker. */
const MAX_ENTITY_TILES = 12;

/**
 * Rich controls for one action: sliders, steppers, option tiles, the colour
 * wheel, duration and date pickers, entity tiles, selectors and labelled
 * value boxes. It only reports changes; the owning service control writes
 * them into the action data.
 */
@customElement("ha-action-quick-controls")
export class HaActionQuickControls extends LitElement {
  private _lang = new LanguageModeController(this);

  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public controls: QuickControl[] = [];

  /** Localized service field names, by data key. */
  @property({ attribute: false }) public fieldLabels: Record<string, string> =
    {};

  /** Localized service field descriptions, by data key. */
  @property({ attribute: false }) public fieldDescriptions: Record<
    string,
    string
  > = {};

  /** Context handed to the selectors, such as the targeted entities. */
  @property({ attribute: false }) public selectorContext?: Record<
    string,
    unknown
  >;

  @property({ type: Boolean }) public disabled = false;

  /** Live length of the text being typed, by data key. */
  @state() private _typed: Record<string, number> = {};

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
    const control = this._find(key);
    if (
      control?.kind === "color" &&
      control.space === "hex" &&
      Array.isArray(value)
    ) {
      fireEvent(this, "quick-control-changed", {
        key,
        value: colorToHexText(value as number[]),
      });
      return;
    }
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
        return html`<div
          class=${classMap({ notice: true, info: control.tone === "info" })}
          role="note"
        >
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
            ${control.colors.map((color) => this._swatch(control.key, color, control.value))}
          </div>
        </div>`;
      case "color":
        return this._renderColor(control);
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
        return this._renderSelector(
          control,
          { [control.kind]: {} },
          control.value
        );
      case "selector":
        if (this._isDictionary(control.selector, control.value)) {
          return this._renderDictionary(control);
        }
        return this._renderSelector(
          control,
          control.selector,
          control.value,
          control.context
        );
      case "duration":
        return this._renderDuration(control);
      case "entities":
        return this._renderEntities(control);
      case "options":
        return this._renderOptions(control);
      case "run":
        return html`<div class="control">
          <button
            type="button"
            class="run"
            .disabled=${this.disabled}
            @click=${this._onRun}
          >
            ${this._t(control.labelKey)}
          </button>
          <div class="hint">${this._t(control.noteKey)}</div>
        </div>`;
      case "text":
        return this._renderText(control);
      default:
        return nothing;
    }
  }

  private _swatch(
    key: string,
    color: { id: string; rgb: number[] },
    value?: number[]
  ) {
    const selected =
      Array.isArray(value) &&
      color.rgb.every((part, index) => value[index] === part);
    const name = this._t(`ui.components.action-editors.colors.${color.id}`);
    return html`<button
      type="button"
      class=${classMap({ swatch: true, selected })}
      style=${styleMap({ "--swatch": `rgb(${color.rgb.join(",")})` })}
      aria-pressed=${selected}
      aria-label=${name}
      title=${name}
      data-key=${key}
      data-color=${color.rgb.join(",")}
      .disabled=${this.disabled}
      @click=${this._onSwatch}
    ></button>`;
  }

  private _head(control: QuickControl, canClear: boolean) {
    const description =
      control.kind === "services" || control.kind === "notice"
        ? undefined
        : this.fieldDescriptions[control.key];
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
      </div>
      ${description ? html`<div class="hint">${description}</div>` : nothing}`;
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
    const control = this._find(key!);
    const rgb = color!.split(",").map(Number);
    this._emit(
      key!,
      control?.kind === "color"
        ? rgbToColor(control.space, rgb, control.value)
        : rgb
    );
  }

  private _onSwitch(ev: Event) {
    const target = ev.currentTarget as HTMLInputElement;
    const control = this._find(target.dataset.key!);
    this._emit(
      target.dataset.key!,
      control?.kind === "switch" && control.constant && !target.checked
        ? undefined
        : target.checked
    );
  }

  private _onRun() {
    if (this.disabled) return;
    fireEvent(this, "quick-run-action");
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
      !(
        (control?.kind === "slider" || control?.kind === "stepper") &&
        control.value === value
      )
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
    // Wide ranges (an unbounded number) get the buttons only.
    const showSlider = control.max - control.min <= 100000;
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
      ${
        showSlider
          ? html`<ha-slider
              labeled
              .min=${control.min}
              .max=${control.max}
              .step=${control.step}
              .value=${current}
              .disabled=${this.disabled}
              data-key=${control.key}
              aria-label=${this._label(control)}
              @change=${this._onSlider}
            ></ha-slider>`
          : nothing
      }
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

  private _renderColor(control: Extract<QuickControl, { kind: "color" }>) {
    const rgb = colorToRgb(control.space, control.value);
    const wheelValue = rgb ? rgb2hs(rgb) : undefined;
    const whites = WHITE_CHANNELS[control.space];
    return html`<div class="control">
      ${this._head(control, control.value !== undefined)}
      <div class="color">
        <div class="wheel">
          <ha-hs-color-picker
            .renderSize=${200}
            .value=${wheelValue}
            .disabled=${this.disabled}
            data-key=${control.key}
            @value-changed=${this._onWheel}
          ></ha-hs-color-picker>
        </div>
        <div class="color-side">
          <ha-input
            type="text"
            class="box"
            data-key=${control.key}
            .label=${this._t("ui.components.action-editors.hex")}
            .value=${
              control.space === "hex" && control.value
                ? colorToHexText(control.value)
                : rgb
                  ? rgbToHex(rgb)
                  : ""
            }
            .disabled=${this.disabled}
            @change=${this._onHex}
          ></ha-input>
          ${
            control.swatches
              ? html`<div
                  class="tiles"
                  role="group"
                  aria-label=${this._t("ui.components.action-editors.shortcuts")}
                >
                  ${LIGHT_COLORS.map((color) =>
                    this._swatch(control.key, color, rgb ? [...rgb] : undefined)
                  )}
                </div>`
              : nothing
          }
          ${whites.map(
            (name, index) =>
              html`<div class="white">
                <span class="label"
                  >${this._t(`ui.components.action-editors.white.${name}`)}</span
                >
                <ha-slider
                  labeled
                  .min=${0}
                  .max=${255}
                  .step=${1}
                  .value=${control.value?.[3 + index] ?? (control.space === "hex" ? 255 : 0)}
                  .disabled=${this.disabled}
                  data-key=${control.key}
                  data-channel=${3 + index}
                  aria-label=${this._t(`ui.components.action-editors.white.${name}`)}
                  @change=${this._onWhite}
                ></ha-slider>
              </div>`
          )}
        </div>
      </div>
    </div>`;
  }

  private _onWheel(ev: CustomEvent<{ value?: [number, number] }>) {
    ev.stopPropagation();
    const key = (ev.currentTarget as HTMLElement).dataset.key!;
    const control = this._find(key);
    if (control?.kind !== "color" || !ev.detail.value) return;
    const rgb = hs2rgb(ev.detail.value).map((part) => Math.round(part));
    this._emit(key, rgbToColor(control.space, rgb, control.value));
  }

  private _onHex(ev: Event) {
    ev.stopPropagation();
    const target = ev.currentTarget as HTMLInputElement;
    const control = this._find(target.dataset.key!);
    if (control?.kind !== "color") return;
    if (control.space === "hex") {
      const color = hexTextToColor(target.value);
      if (color) this._emit(control.key, color);
      return;
    }
    const rgb = hexToRgb(target.value);
    if (!rgb) return;
    this._emit(control.key, rgbToColor(control.space, rgb, control.value));
  }

  private _onWhite(ev: Event) {
    ev.stopPropagation();
    const target = ev.currentTarget as HTMLInputElement;
    const control = this._find(target.dataset.key!);
    if (control?.kind !== "color") return;
    const next = [
      ...(control.value ??
        (control.space === "hex" ? [0, 0, 0, 255] : [0, 0, 0, 0, 0])),
    ];
    while (next.length < (control.space === "rgbww" ? 5 : 4)) next.push(0);
    next[Number(target.dataset.channel)] = Number(target.value);
    this._emit(control.key, next);
  }

  /** A free-form object with no declared fields, edited as name and value rows. */
  private _isDictionary(selector: Record<string, any>, value: unknown) {
    const config = selector.object;
    return (
      Object.keys(selector).length === 1 &&
      config !== undefined &&
      !config?.fields &&
      !config?.multiple &&
      (value === undefined ||
        (value !== null && typeof value === "object" && !Array.isArray(value)))
    );
  }

  private _renderDictionary(control: QuickControl) {
    const value = (control as { value?: unknown }).value;
    return html`<div class="control">
      ${this._head(control, value !== undefined)}
      <ha-automation-options-editor
        .hass=${this.hass}
        .value=${value as Record<string, unknown> | undefined}
        .disabled=${this.disabled}
        data-key=${control.key}
        @value-changed=${this._onDictionary}
      ></ha-automation-options-editor>
    </div>`;
  }

  private _onDictionary(ev: CustomEvent<{ value: Record<string, unknown> }>) {
    ev.stopPropagation();
    const key = (ev.currentTarget as HTMLElement).dataset.key!;
    const value = ev.detail.value;
    this._emit(key, value && Object.keys(value).length ? value : undefined);
  }

  private _renderSelector(
    control: QuickControl,
    selector: Record<string, any>,
    value: unknown,
    context?: Record<string, unknown>
  ) {
    return html`<div class="control">
      ${this._head(control, value !== undefined)}
      <ha-selector
        class="selector"
        .hass=${this.hass}
        .selector=${selector}
        .value=${value}
        .required=${false}
        .disabled=${this.disabled}
        .context=${{ ...this.selectorContext, ...context }}
        data-key=${control.key}
        @value-changed=${this._onSelector}
      ></ha-selector>
    </div>`;
  }

  private _onSelector(ev: CustomEvent<{ value?: unknown }>) {
    ev.stopPropagation();
    const key = (ev.currentTarget as HTMLElement).dataset.key!;
    const value = ev.detail.value;
    this._emit(
      key,
      value === null || value === "" || (Array.isArray(value) && !value.length)
        ? undefined
        : value
    );
  }

  private _renderDuration(
    control: Extract<QuickControl, { kind: "duration" }>
  ) {
    const seconds = durationSeconds(control.value);
    return html`<div class="control">
      ${this._head(control, control.value !== undefined)}
      <ha-duration-input
        .data=${seconds === undefined ? undefined : secondsToParts(seconds)}
        .enableMillisecond=${control.enableMillisecond ?? false}
        .disabled=${this.disabled}
        data-key=${control.key}
        @value-changed=${this._onDuration}
      ></ha-duration-input>
    </div>`;
  }

  private _onDuration(ev: CustomEvent<{ value?: HaDurationData }>) {
    ev.stopPropagation();
    const key = (ev.currentTarget as HTMLElement).dataset.key!;
    const control = this._find(key);
    if (control?.kind !== "duration") return;
    if (ev.detail.value === undefined) {
      this._emit(key, undefined);
      return;
    }
    const total = partsToSeconds(ev.detail.value);
    this._emit(key, control.format === "hms" ? secondsToText(total) : total);
  }

  private _renderEntities(
    control: Extract<QuickControl, { kind: "entities" }>
  ) {
    const chosen = Array.isArray(control.value)
      ? control.value
      : control.value
        ? [control.value]
        : [];
    const ids = Object.keys(this.hass.states)
      .filter((id) => id.startsWith(`${control.domain}.`))
      .sort((a, b) => this._entityName(a).localeCompare(this._entityName(b)));
    const shown = [
      ...new Set([...chosen, ...ids.slice(0, MAX_ENTITY_TILES)]),
    ].filter((id) => ids.includes(id) || chosen.includes(id));
    return html`<div class="control">
      ${this._head(control, control.value !== undefined)}
      ${
        shown.length
          ? html`<div
              class="tiles"
              role="group"
              aria-label=${this._label(control)}
            >
              ${shown.map((id) => {
                const selected = chosen.includes(id);
                return html`<button
                  type="button"
                  class=${classMap({ tile: true, selected })}
                  aria-pressed=${selected}
                  data-key=${control.key}
                  data-entity=${id}
                  .disabled=${this.disabled}
                  @click=${this._onEntityTile}
                >
                  ${this._entityName(id)}
                </button>`;
              })}
            </div>`
          : nothing
      }
      <ha-selector
        class="selector"
        .hass=${this.hass}
        .selector=${{
          entity: {
            domain: control.domain,
            multiple: control.multiple,
          },
        }}
        .value=${control.value}
        .required=${false}
        .disabled=${this.disabled}
        data-key=${control.key}
        @value-changed=${this._onSelector}
      ></ha-selector>
      ${
        control.domain === "zone" && !control.multiple
          ? html`<ha-automation-zone-map
              .hass=${this.hass}
              .zone=${chosen[0]}
            ></ha-automation-zone-map>`
          : nothing
      }
    </div>`;
  }

  private _entityName(entityId: string): string {
    return (
      (this.hass.states[entityId]?.attributes.friendly_name as
        string | undefined) || entityId
    );
  }

  private _onEntityTile(ev: Event) {
    const { key, entity } = (ev.currentTarget as HTMLElement).dataset;
    const control = this._find(key!);
    if (control?.kind !== "entities") return;
    const chosen = Array.isArray(control.value)
      ? control.value
      : control.value
        ? [control.value]
        : [];
    if (!control.multiple) {
      this._emit(key!, chosen[0] === entity ? undefined : entity);
      return;
    }
    const next = chosen.includes(entity!)
      ? chosen.filter((id) => id !== entity)
      : [...chosen, entity!];
    this._emit(key!, next.length ? next : undefined);
  }

  private _renderOptions(control: Extract<QuickControl, { kind: "options" }>) {
    const known = new Set(control.fields.map((field) => field.name));
    const value = control.value ?? {};
    const rest = Object.fromEntries(
      Object.entries(value).filter(([name]) => !known.has(name))
    );
    return html`<div class="control">
      ${this._head(control, control.value !== undefined)}
      ${control.fields.map((field) =>
        field.type === "voice"
          ? html`<div class="option">
              <div class="label">
                ${this._t("ui.components.action-editors.fields.voice")}
              </div>
              <ha-selector
                class="selector"
                .hass=${this.hass}
                .selector=${{ tts_voice: {} }}
                .value=${value[field.name]}
                .required=${false}
                .disabled=${this.disabled}
                .context=${control.context}
                data-key=${control.key}
                data-option=${field.name}
                @value-changed=${this._onOptionValue}
              ></ha-selector>
            </div>`
          : html`<ha-input
              class="box"
              .label=${
                field.labelKey
                  ? this._t(field.labelKey)
                  : humanizeOption(field.name)
              }
              .value=${value[field.name] === undefined ? "" : String(value[field.name])}
              .disabled=${this.disabled}
              data-key=${control.key}
              data-option=${field.name}
              @change=${this._onOptionValue}
            ></ha-input>`
      )}
      <ha-expansion-panel
        outlined
        .expanded=${Object.keys(rest).length > 0}
        .header=${this._t("ui.components.action-editors.more_options")}
      >
        <ha-automation-options-editor
          .hass=${this.hass}
          .value=${rest}
          .disabled=${this.disabled}
          data-key=${control.key}
          @value-changed=${this._onOptionsRest}
        ></ha-automation-options-editor>
      </ha-expansion-panel>
    </div>`;
  }

  private _onOptionValue(ev: Event) {
    ev.stopPropagation();
    const target = ev.currentTarget as HTMLElement;
    const control = this._find(target.dataset.key!);
    if (control?.kind !== "options") return;
    const name = target.dataset.option!;
    const raw =
      ev instanceof CustomEvent
        ? (ev.detail as { value?: unknown }).value
        : (target as HTMLInputElement).value;
    const next = { ...control.value };
    if (raw === undefined || raw === null || raw === "") delete next[name];
    else next[name] = raw;
    this._emit(control.key, Object.keys(next).length ? next : undefined);
  }

  private _onOptionsRest(ev: CustomEvent<{ value: Record<string, unknown> }>) {
    ev.stopPropagation();
    const target = ev.currentTarget as HTMLElement;
    const control = this._find(target.dataset.key!);
    if (control?.kind !== "options") return;
    const known = new Set(control.fields.map((field) => field.name));
    const kept = Object.fromEntries(
      Object.entries(control.value ?? {}).filter(([name]) => known.has(name))
    );
    const next = { ...kept, ...ev.detail.value };
    this._emit(control.key, Object.keys(next).length ? next : undefined);
  }

  private _onTextInput(ev: Event) {
    const target = ev.currentTarget as HTMLInputElement;
    const key = target.dataset.key!;
    this._typed = { ...this._typed, [key]: (target.value ?? "").length };
  }

  private _renderText(control: TextControl) {
    const value = control.value === undefined ? "" : String(control.value);
    const typed = this._typed[control.key] ?? value.length;
    return html`<div class="control">
      ${this._head(control, control.value !== undefined)}
      ${
        control.multiline
          ? html`<ha-textarea
              class="box area"
              data-key=${control.key}
              .rows=${3}
              resize="vertical"
              aria-label=${this._label(control)}
              .value=${value}
              .disabled=${this.disabled}
              @input=${this._onTextInput}
              @change=${this._onText}
            ></ha-textarea>`
          : html`<ha-input
              class="box"
              data-key=${control.key}
              type=${control.inputType ?? "text"}
              .accessibleLabel=${this._label(control)}
              .value=${value}
              .disabled=${this.disabled}
              @input=${this._onTextInput}
              @change=${this._onText}
            ></ha-input>`
      }
      ${
        control.showCount
          ? html`<div class="count" aria-live="polite">
              ${this._lang.text(
                this.hass.localize,
                "ui.components.action-editors.characters",
                { count: typed }
              )}${control.maxLength ? ` / ${control.maxLength}` : nothing}
            </div>`
          : nothing
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
                    data-replace=${chip.replace ? "1" : ""}
                    .disabled=${this.disabled}
                    @click=${this._onChip}
                  >
                    ${this._chipLabel(chip.id, chip.text)}
                  </button>`
              )}
            </div>`
          : nothing
      }
    </div>`;
  }

  private _chipLabel(id: string, text: string): string {
    if (id.startsWith("command_")) return humanizeOption(text);
    return this._t(`ui.components.action-editors.chips.${id}`) || text;
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
    const { key, snippet, replace } = (ev.currentTarget as HTMLElement).dataset;
    const control = this._find(key!);
    const current =
      control?.kind === "text" && control.value !== undefined
        ? String(control.value)
        : "";
    // The box commits on change, so a snippet always lands after the saved
    // text, never in the middle of a half-typed edit.
    this._emit(key!, replace ? snippet : `${current}${snippet}`);
  }

  static styles = css`
    :host {
      display: block;
    }
    .control {
      display: flex;
      flex-direction: column;
      padding: var(--ha-space-2) var(--ha-space-4);
      border-top: var(
        --service-control-items-border-top,
        1px solid var(--divider-color)
      );
    }
    .control.row {
      display: flex;
      flex-direction: row;
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
    .hint,
    .count {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
      overflow-wrap: anywhere;
    }
    /* The label is shown once, above the field; the description is small
       helper text under the field. */
    .hint {
      order: 2;
      padding-block-start: var(--ha-space-1);
    }
    .count {
      text-align: end;
      padding-block-start: var(--ha-space-1);
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
    .selector {
      display: block;
      width: 100%;
    }
    .option {
      padding-block: var(--ha-space-1);
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
    .swatch,
    .run {
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
    .run {
      min-height: 48px;
      padding: 0 var(--ha-space-5, 20px);
      border-radius: var(--ha-border-radius-pill, 24px);
      border: 1px solid var(--primary-color);
      background: none;
      color: var(--primary-color);
      font-weight: var(--ha-font-weight-medium);
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
    .color {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-4);
      align-items: flex-start;
    }
    .wheel {
      flex: 0 0 auto;
      width: min(100%, 220px);
      aspect-ratio: 1;
      margin-inline: auto;
    }
    .color-side {
      flex: 1 1 200px;
      min-width: 0;
    }
    .white {
      padding-block-start: var(--ha-space-2);
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
    .notice.info {
      border-inline-start-color: var(--info-color, var(--primary-color));
    }
    /* Phones: compact, but never under a 44 px touch target. */
    @media (max-width: 600px) {
      .control {
        padding: var(--ha-space-2) var(--ha-space-3);
      }
      .head {
        min-height: 32px;
      }
      .notice {
        margin: var(--ha-space-2) var(--ha-space-3);
      }
      .numeral {
        font-size: 36px;
      }
      .tiles {
        gap: var(--ha-space-2);
      }
      .tile {
        min-height: 44px;
        min-width: 44px;
        padding: 0 var(--ha-space-3);
        flex: 1 1 calc(33% - var(--ha-space-2));
      }
      .run {
        min-height: 44px;
      }
      .step,
      .swatch {
        width: 44px;
        height: 44px;
      }
      .box {
        min-height: 44px;
      }
      .wheel {
        width: min(100%, 180px);
      }
      ha-slider {
        min-height: 44px;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-action-quick-controls": HaActionQuickControls;
  }
}
