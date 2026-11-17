import {
  mdiCalendarClock,
  mdiChevronDown,
  mdiChevronUp,
  mdiCounter,
  mdiFormDropdown,
  mdiFormTextbox,
  mdiGestureTapButton,
  mdiMinus,
  mdiPlus,
  mdiRayVertex,
  mdiTimerOutline,
  mdiToggleSwitchOutline,
} from "@mdi/js";
import type { PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import { currentMotionLock } from "../../../../common/appearance/motion-profiles";
import { normalizeConfirmationDrama } from "../../../../common/confirm/two-key-drama";
import { formatTimeWithSeconds } from "../../../../common/datetime/format_time";
import { pageEntryProfile } from "../../../../common/motion/page-entry";
import { getPersonalPreferences } from "../../../../common/preferences/personal-preferences";
import "../../../../components/ha-button";
import "../../../../components/ha-icon";
import "../../../../components/ha-icon-button";
import "../../../../components/ha-slider";
import "../../../../components/ha-svg-icon";
import "../../../../components/ha-switch";
import "../../../../components/input/ha-input";
import type { HaInput } from "../../../../components/input/ha-input";
import type { HaSlider } from "../../../../components/ha-slider";
import type { HaSwitch } from "../../../../components/ha-switch";
import { weekdays } from "../../../../data/schedule";
import type { HomeAssistant } from "../../../../types";
import type { HelperDomain } from "../const";
import type { TimerDemoState } from "./helper-demo";
import {
  clamp,
  counterCanStep,
  counterDemoConfig,
  counterStep,
  dateTimeDemoConfig,
  formatClock,
  formatClockSeconds,
  hasHelperDemo,
  HELPER_DEMO_KINDS,
  moveSelection,
  numberDemoConfig,
  scheduleDayBlocks,
  scheduleHasBlocks,
  scheduleNow,
  SECONDS_PER_DAY,
  selectDemoOptions,
  snapToStep,
  switchState,
  textDemoConfig,
  timerCancel,
  timerDemoConfig,
  timerIdle,
  timerPause,
  timerRemainingMs,
  timerStart,
  timerTick,
  truncateText,
  validateText,
} from "./helper-demo";

export const HELPER_DEMO_ICONS: Record<HelperDomain, string> = {
  input_boolean: mdiToggleSwitchOutline,
  input_button: mdiGestureTapButton,
  input_text: mdiFormTextbox,
  input_number: mdiRayVertex,
  input_datetime: mdiCalendarClock,
  input_select: mdiFormDropdown,
  counter: mdiCounter,
  timer: mdiTimerOutline,
  schedule: mdiCalendarClock,
};

/** Whether motion may play: reduced motion and "no drama" both switch it off. */
const motionAllowed = (): boolean => {
  try {
    const reduced =
      currentMotionLock() !== undefined ||
      (typeof matchMedia === "function" &&
        matchMedia("(prefers-reduced-motion: reduce)").matches);
    const drama = normalizeConfirmationDrama(
      getPersonalPreferences().confirmationDrama
    );
    return pageEntryProfile(drama, reduced).enabled;
  } catch (_err) {
    return false;
  }
};

/**
 * A small working model of a helper, driven by the create form's values. It
 * keeps its state here and calls no service: nothing is created.
 */
@customElement("ha-helper-demo")
export class HaHelperDemo extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property() public domain?: string;

  /** The form's current values, as the create dialog holds them. */
  @property({ attribute: false }) public config?: Record<string, unknown>;

  @state() private _collapsed = false;

  @state() private _on = false;

  @state() private _pressedAt?: string;

  @state() private _numberValue?: number;

  @state() private _text = "";

  @state() private _choice?: string;

  @state() private _date = "";

  @state() private _time = "";

  @state() private _counter?: number;

  @state() private _timer: TimerDemoState = timerIdle(0);

  @state() private _now = new Date();

  @query(".numeral") private _numeral?: HTMLElement;

  @query(".tile.selected") private _selectedTile?: HTMLElement;

  private _timerDurationMs = 0;

  private _interval?: number;

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._stopInterval();
  }

  protected willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("domain")) {
      this._resetState();
    }
    if (changed.has("config") || changed.has("domain")) {
      const durationMs = timerDemoConfig(this.config).seconds * 1000;
      if (durationMs !== this._timerDurationMs) {
        this._timerDurationMs = durationMs;
        this._stopInterval();
        this._timer = timerIdle(durationMs);
      }
    }
  }

  private _resetState() {
    this._stopInterval();
    this._on = false;
    this._pressedAt = undefined;
    this._numberValue = undefined;
    this._text = "";
    this._choice = undefined;
    this._date = "";
    this._time = "";
    this._counter = undefined;
    this._timerDurationMs = 0;
    this._timer = timerIdle(0);
  }

  private _popAfterRender() {
    this.updateComplete.then(() => this._popNumeral());
  }

  private _popNumeral() {
    const numeral = this._numeral;
    if (!numeral || typeof numeral.animate !== "function" || !motionAllowed()) {
      return;
    }
    numeral.animate(
      [
        { transform: "scale(0.82)", opacity: 0.6 },
        { transform: "scale(1)", opacity: 1 },
      ],
      { duration: 280, easing: "cubic-bezier(.2, 1.5, .3, 1)" }
    );
  }

  private _stopInterval() {
    if (this._interval !== undefined) {
      window.clearInterval(this._interval);
      this._interval = undefined;
    }
  }

  private _startInterval() {
    this._stopInterval();
    this._interval = window.setInterval(() => this._onTick(), 250);
  }

  private _onTick() {
    const now = Date.now();
    this._now = new Date(now);
    const next = timerTick(this._timer, now);
    if (next !== this._timer) {
      this._timer = next;
    }
    if (this._timer.status !== "active") {
      this._stopInterval();
    }
  }

  protected render() {
    if (!this.domain || !hasHelperDemo(this.domain)) {
      return nothing;
    }
    const domain = this.domain;
    const name =
      (typeof this.config?.name === "string" && this.config.name.trim()) ||
      this.hass.localize("ui.panel.config.helpers.demo.default_name");
    const icon = typeof this.config?.icon === "string" ? this.config.icon : "";
    const bodyId = "demo-body";
    return html`
      <section
        class=${classMap({ demo: true, collapsed: this._collapsed })}
        aria-label=${this.hass.localize("ui.panel.config.helpers.demo.title")}
      >
        <div class="head">
          <span class="badge" aria-hidden="true">
            ${
              icon
                ? html`<ha-icon .icon=${icon}></ha-icon>`
                : html`<ha-svg-icon
                    .path=${HELPER_DEMO_ICONS[domain]}
                  ></ha-svg-icon>`
            }
          </span>
          <div class="titles">
            <span class="eyebrow"
              >${this.hass.localize("ui.panel.config.helpers.demo.title")}</span
            >
            <span class="name">${name}</span>
          </div>
          <ha-icon-button
            .path=${this._collapsed ? mdiChevronDown : mdiChevronUp}
            .label=${this.hass.localize(
              this._collapsed
                ? "ui.panel.config.helpers.demo.expand"
                : "ui.panel.config.helpers.demo.collapse"
            )}
            aria-expanded=${this._collapsed ? "false" : "true"}
            aria-controls=${bodyId}
            @click=${this._toggleCollapsed}
          ></ha-icon-button>
        </div>
        <div class="body" id=${bodyId} ?hidden=${this._collapsed}>
          ${this._renderDemo(name)}
          <p class="disclaimer">
            ${this.hass.localize("ui.panel.config.helpers.demo.disclaimer")}
          </p>
        </div>
      </section>
    `;
  }

  private _renderDemo(name: string): TemplateResult | typeof nothing {
    switch (HELPER_DEMO_KINDS[this.domain as HelperDomain]) {
      case "switch":
        return this._renderSwitch(name);
      case "press":
        return this._renderPress();
      case "number":
        return this._renderNumber(name);
      case "text":
        return this._renderText(name);
      case "choice":
        return this._renderChoice(name);
      case "datetime":
        return this._renderDateTime();
      case "counter":
        return this._renderCounter();
      case "timer":
        return this._renderTimer();
      case "week":
        return this._renderWeek();
      default:
        return nothing;
    }
  }

  private _renderSwitch(name: string) {
    const word = this.hass.localize(
      `ui.panel.config.helpers.demo.${switchState(this._on)}`
    );
    return html`
      <div class="row">
        <ha-switch
          .checked=${this._on}
          aria-label=${name}
          @change=${this._switchChanged}
        ></ha-switch>
        <span class="state-word" aria-live="polite">${word}</span>
      </div>
    `;
  }

  private _renderPress() {
    return html`
      <div class="row">
        <ha-button @click=${this._pressed}>
          ${this.hass.localize("ui.panel.config.helpers.demo.press")}
        </ha-button>
        <span class="state-word" aria-live="polite">
          ${
            this._pressedAt
              ? this.hass.localize("ui.panel.config.helpers.demo.pressed_at", {
                  time: this._pressedAt,
                })
              : this.hass.localize("ui.panel.config.helpers.demo.not_pressed")
          }
        </span>
      </div>
    `;
  }

  private _renderNumber(name: string) {
    const cfg = numberDemoConfig(this.config);
    const value = snapToStep(
      this._numberValue ?? cfg.initial,
      cfg.min,
      cfg.max,
      cfg.step
    );
    return html`
      <div class="numeral-line">
        <span class="numeral">${value}</span>
        ${cfg.unit ? html`<span class="unit">${cfg.unit}</span>` : nothing}
      </div>
      ${
        cfg.mode === "slider"
          ? html`<ha-slider
              labeled
              .min=${cfg.min}
              .max=${cfg.max}
              .step=${cfg.step}
              .value=${value}
              aria-label=${name}
              @change=${this._sliderChanged}
            ></ha-slider>`
          : html`<ha-input
              type="number"
              appearance="outlined"
              .min=${cfg.min}
              .max=${cfg.max}
              .step=${cfg.step}
              .value=${String(value)}
              .label=${name}
              @change=${this._numberBoxChanged}
            ></ha-input>`
      }
      <div class="range-line" aria-hidden="true">
        <span>${cfg.min}</span><span>${cfg.max}</span>
      </div>
    `;
  }

  private _renderText(name: string) {
    const cfg = textDemoConfig(this.config);
    const text = truncateText(this._text, cfg.max);
    const check = validateText(text, cfg);
    let message = "";
    if (check.patternInvalid) {
      message = this.hass.localize(
        "ui.panel.config.helpers.demo.text_pattern_invalid"
      );
    } else if (check.patternMismatch) {
      message = this.hass.localize(
        "ui.panel.config.helpers.demo.text_pattern_mismatch"
      );
    } else if (check.tooShort) {
      message = this.hass.localize(
        "ui.panel.config.helpers.demo.text_too_short",
        { min: cfg.min }
      );
    }
    return html`
      <ha-input
        appearance="outlined"
        .type=${cfg.password ? "password" : "text"}
        .passwordToggle=${cfg.password}
        .value=${text}
        .label=${name}
        .invalid=${Boolean(message) && !check.patternInvalid}
        .hint=${message}
        @input=${this._textChanged}
      ></ha-input>
      <p class="count" aria-live="polite">
        ${this.hass.localize("ui.panel.config.helpers.demo.text_count", {
          count: check.length,
          max: cfg.max,
        })}
      </p>
    `;
  }

  private _renderChoice(name: string) {
    const options = selectDemoOptions(this.config);
    if (!options.length) {
      return html`<p class="muted">
        ${this.hass.localize("ui.panel.config.helpers.demo.choice_empty")}
      </p>`;
    }
    const found =
      this._choice === undefined ? -1 : options.indexOf(this._choice);
    const selected = found === -1 ? 0 : found;
    return html`
      <div
        class="tiles"
        role="radiogroup"
        aria-label=${name}
        @keydown=${this._choiceKey}
      >
        ${options.map(
          (option, index) => html`
            <button
              type="button"
              role="radio"
              class=${classMap({ tile: true, selected: index === selected })}
              aria-checked=${index === selected ? "true" : "false"}
              tabindex=${index === selected ? "0" : "-1"}
              .option=${option}
              @click=${this._choicePicked}
            >
              ${option}
            </button>
          `
        )}
      </div>
    `;
  }

  private _renderDateTime() {
    const cfg = dateTimeDemoConfig(this.config);
    return html`
      <div class="fields">
        ${
          cfg.hasDate
            ? html`<ha-input
                type="date"
                appearance="outlined"
                .value=${this._date}
                .label=${this.hass.localize(
                  "ui.panel.config.helpers.demo.date"
                )}
                @change=${this._dateChanged}
              ></ha-input>`
            : nothing
        }
        ${
          cfg.hasTime
            ? html`<ha-input
                type="time"
                appearance="outlined"
                .value=${this._time}
                .label=${this.hass.localize(
                  "ui.panel.config.helpers.demo.time"
                )}
                @change=${this._timeChanged}
              ></ha-input>`
            : nothing
        }
      </div>
    `;
  }

  private _renderCounter() {
    const cfg = counterDemoConfig(this.config);
    const value = this._counter ?? cfg.initial;
    const shown = clamp(value, cfg.min, cfg.max);
    return html`
      <div class="counter">
        <ha-icon-button
          .path=${mdiMinus}
          .label=${this.hass.localize("ui.panel.config.helpers.demo.subtract", {
            step: cfg.step,
          })}
          .disabled=${!counterCanStep(shown, -1, cfg)}
          @click=${this._counterMinus}
        ></ha-icon-button>
        <span class="numeral" aria-live="polite">${shown}</span>
        <ha-icon-button
          .path=${mdiPlus}
          .label=${this.hass.localize("ui.panel.config.helpers.demo.add", {
            step: cfg.step,
          })}
          .disabled=${!counterCanStep(shown, 1, cfg)}
          @click=${this._counterPlus}
        ></ha-icon-button>
      </div>
      <div class="row">
        <ha-button appearance="plain" @click=${this._counterReset}>
          ${this.hass.localize("ui.panel.config.helpers.demo.reset")}
        </ha-button>
      </div>
    `;
  }

  private _renderTimer() {
    const cfg = timerDemoConfig(this.config);
    const remaining = timerRemainingMs(this._timer, this._now.getTime());
    const status = this._timer.status;
    return html`
      <div
        class=${classMap({
          "timer-face": true,
          finished: status === "finished" && motionAllowed(),
        })}
      >
        <span class="numeral" aria-hidden="true"
          >${formatClock(remaining)}</span
        >
        <span class="state-word" role="status">
          ${this.hass.localize(`ui.panel.config.helpers.demo.timer_${status}`)}
        </span>
      </div>
      <div class="row">
        ${
          status === "active"
            ? html`<ha-button appearance="filled" @click=${this._timerPause}>
                ${this.hass.localize("ui.panel.config.helpers.demo.pause")}
              </ha-button>`
            : html`<ha-button appearance="filled" @click=${this._timerStart}>
                ${this.hass.localize(
                  status === "paused"
                    ? "ui.panel.config.helpers.demo.resume"
                    : "ui.panel.config.helpers.demo.start"
                )}
              </ha-button>`
        }
        <ha-button
          appearance="plain"
          .disabled=${status === "idle"}
          @click=${this._timerCancel}
        >
          ${this.hass.localize("ui.panel.config.helpers.demo.cancel")}
        </ha-button>
      </div>
      ${
        cfg.usedFallback
          ? html`<p class="muted">
              ${this.hass.localize(
                "ui.panel.config.helpers.demo.timer_fallback",
                { seconds: cfg.seconds }
              )}
            </p>`
          : nothing
      }
    `;
  }

  private _renderWeek() {
    const now = new Date();
    const result = scheduleNow(this.config, now);
    const nowPercent =
      ((now.getHours() * 3600 + now.getMinutes() * 60) / SECONDS_PER_DAY) * 100;
    const today = now.getDay();
    const order = [1, 2, 3, 4, 5, 6, 0];
    const dayFormat = new Intl.DateTimeFormat(this.hass.locale.language, {
      weekday: "narrow",
    });
    const dayLong = new Intl.DateTimeFormat(this.hass.locale.language, {
      weekday: "long",
    });
    // 2024-01-07 was a Sunday; add the day number to reach each weekday.
    const dayDate = (index: number) => new Date(2024, 0, 7 + index);
    return html`
      <p class="status ${result.on ? "on" : "off"}" role="status">
        <span class="dot" aria-hidden="true"></span>
        ${this.hass.localize(
          result.on
            ? "ui.panel.config.helpers.demo.schedule_on"
            : "ui.panel.config.helpers.demo.schedule_off"
        )}
        ${
          result.changesAt !== null
            ? html`<span class="muted">
                ${this.hass.localize(
                  result.on
                    ? "ui.panel.config.helpers.demo.schedule_until"
                    : "ui.panel.config.helpers.demo.schedule_from",
                  { time: formatClockSeconds(result.changesAt) }
                )}
              </span>`
            : nothing
        }
      </p>
      <div class="week" role="img" aria-label=${this._weekSummary()}>
        ${order.map((index) => {
          const blocks = scheduleDayBlocks(this.config, weekdays[index]);
          return html`
            <div class="week-row">
              <span class="week-day" title=${dayLong.format(dayDate(index))}
                >${dayFormat.format(dayDate(index))}</span
              >
              <div class="week-bar">
                ${blocks.map(
                  (block) =>
                    html`<span
                      class="week-block"
                      style=${styleMap({
                        insetInlineStart: `${(block.from / SECONDS_PER_DAY) * 100}%`,
                        inlineSize: `${((block.to - block.from) / SECONDS_PER_DAY) * 100}%`,
                      })}
                    ></span>`
                )}
                ${
                  index === today
                    ? html`<span
                        class="week-now"
                        style=${styleMap({ insetInlineStart: `${nowPercent}%` })}
                      ></span>`
                    : nothing
                }
              </div>
            </div>
          `;
        })}
      </div>
      ${
        scheduleHasBlocks(this.config)
          ? nothing
          : html`<p class="muted">
              ${this.hass.localize("ui.panel.config.helpers.demo.schedule_empty")}
            </p>`
      }
    `;
  }

  private _weekSummary(): string {
    const parts: string[] = [];
    for (const day of weekdays) {
      const blocks = scheduleDayBlocks(this.config, day);
      if (blocks.length) {
        parts.push(
          `${day}: ${blocks
            .map(
              (b) => `${formatClockSeconds(b.from)}-${formatClockSeconds(b.to)}`
            )
            .join(", ")}`
        );
      }
    }
    return parts.length
      ? parts.join("; ")
      : this.hass.localize("ui.panel.config.helpers.demo.schedule_empty");
  }

  private _toggleCollapsed() {
    this._collapsed = !this._collapsed;
  }

  private _switchChanged(ev: Event) {
    this._on = (ev.target as HaSwitch).checked;
  }

  private _pressed() {
    this._pressedAt = formatTimeWithSeconds(
      new Date(),
      this.hass.locale,
      this.hass.config
    );
  }

  private _sliderChanged(ev: Event) {
    this._numberValue = Number((ev.target as HaSlider).value);
  }

  private _numberBoxChanged(ev: Event) {
    const parsed = Number((ev.target as HaInput).value);
    if (Number.isFinite(parsed)) {
      this._numberValue = parsed;
    }
  }

  private _textChanged(ev: Event) {
    const cfg = textDemoConfig(this.config);
    const input = ev.target as HaInput;
    const value = truncateText(String(input.value ?? ""), cfg.max);
    this._text = value;
    if (input.value !== value) {
      input.value = value;
    }
  }

  private _choicePicked(ev: Event) {
    this._choice = (
      ev.currentTarget as HTMLElement & { option: string }
    ).option;
  }

  private _choiceKey(ev: KeyboardEvent) {
    const delta =
      ev.key === "ArrowRight" || ev.key === "ArrowDown"
        ? 1
        : ev.key === "ArrowLeft" || ev.key === "ArrowUp"
          ? -1
          : 0;
    if (!delta) {
      return;
    }
    ev.preventDefault();
    const options = selectDemoOptions(this.config);
    const found =
      this._choice === undefined ? -1 : options.indexOf(this._choice);
    const next = moveSelection(found === -1 ? 0 : found, delta, options.length);
    if (next === -1) {
      return;
    }
    this._choice = options[next];
    this.updateComplete.then(() => this._selectedTile?.focus());
  }

  private _dateChanged(ev: Event) {
    this._date = String((ev.target as HaInput).value ?? "");
  }

  private _timeChanged(ev: Event) {
    this._time = String((ev.target as HaInput).value ?? "");
  }

  private _counterBase(): number {
    return this._counter ?? counterDemoConfig(this.config).initial;
  }

  private _counterMinus() {
    this._counter = counterStep(
      this._counterBase(),
      -1,
      counterDemoConfig(this.config)
    );
    this._popAfterRender();
  }

  private _counterPlus() {
    this._counter = counterStep(
      this._counterBase(),
      1,
      counterDemoConfig(this.config)
    );
    this._popAfterRender();
  }

  private _counterReset() {
    this._counter = counterDemoConfig(this.config).initial;
    this._popAfterRender();
  }

  private _timerStart() {
    const now = Date.now();
    this._now = new Date(now);
    this._timer = timerStart(this._timer, this._timerDurationMs, now);
    this._startInterval();
  }

  private _timerPause() {
    const now = Date.now();
    this._now = new Date(now);
    this._timer = timerPause(this._timer, now);
    this._stopInterval();
  }

  private _timerCancel() {
    this._stopInterval();
    this._timer = timerCancel(this._timerDurationMs);
  }

  static styles = css`
    :host {
      display: block;
    }
    .demo {
      border-radius: var(--ha-border-radius-xl, 16px);
      background: var(
        --md-sys-color-surface-container,
        var(--secondary-background-color)
      );
      color: var(--md-sys-color-on-surface, var(--primary-text-color));
      padding: var(--ha-space-3, 12px) var(--ha-space-4, 16px);
    }
    .head {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3, 12px);
      min-height: 48px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: none;
      inline-size: 40px;
      block-size: 40px;
      border-radius: 50%;
      background: var(
        --md-sys-color-secondary-container,
        var(--ha-color-fill-neutral-quiet-resting)
      );
      color: var(--md-sys-color-on-secondary-container, var(--primary-color));
    }
    .titles {
      display: flex;
      flex-direction: column;
      min-inline-size: 0;
      flex: 1;
    }
    .eyebrow {
      font-size: var(--ha-font-size-s, 12px);
      color: var(
        --md-sys-color-on-surface-variant,
        var(--secondary-text-color)
      );
    }
    .name {
      font-weight: var(--ha-font-weight-medium, 500);
      overflow-wrap: anywhere;
    }
    .body {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-3, 12px);
      padding-block-start: var(--ha-space-3, 12px);
    }
    .body[hidden] {
      display: none;
    }
    .disclaimer,
    .muted,
    .count {
      margin: 0;
      font-size: var(--ha-font-size-s, 12px);
      color: var(
        --md-sys-color-on-surface-variant,
        var(--secondary-text-color)
      );
    }
    .row,
    .fields {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ha-space-3, 12px);
    }
    .fields ha-input {
      flex: 1 1 140px;
      min-inline-size: 0;
    }
    ha-input {
      display: block;
      inline-size: 100%;
    }
    ha-switch {
      min-block-size: 48px;
      min-inline-size: 48px;
    }
    ha-button {
      min-block-size: 48px;
    }
    .state-word {
      font-weight: var(--ha-font-weight-medium, 500);
    }
    .numeral-line {
      display: flex;
      align-items: baseline;
      gap: var(--ha-space-2, 8px);
    }
    .numeral {
      font-size: 2.5rem;
      line-height: 1.1;
      font-weight: var(--ha-font-weight-bold, 700);
      font-variant-numeric: tabular-nums;
      display: inline-block;
    }
    .unit {
      color: var(
        --md-sys-color-on-surface-variant,
        var(--secondary-text-color)
      );
    }
    .range-line {
      display: flex;
      justify-content: space-between;
      font-size: var(--ha-font-size-s, 12px);
      color: var(
        --md-sys-color-on-surface-variant,
        var(--secondary-text-color)
      );
    }
    ha-slider {
      inline-size: 100%;
      min-block-size: 48px;
    }
    .tiles {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-2, 8px);
    }
    .tile {
      min-block-size: 48px;
      padding: 0 var(--ha-space-4, 16px);
      border-radius: var(--ha-border-radius-lg, 12px);
      border: 1px solid var(--md-sys-color-outline, var(--divider-color));
      background: transparent;
      color: inherit;
      font: inherit;
      cursor: pointer;
      max-inline-size: 100%;
      overflow-wrap: anywhere;
    }
    .tile.selected {
      background: var(
        --md-sys-color-secondary-container,
        var(--ha-color-fill-neutral-quiet-resting)
      );
      color: var(--md-sys-color-on-secondary-container, inherit);
      border-color: transparent;
    }
    .tile:focus-visible {
      outline: 2px solid var(--md-sys-color-primary, var(--primary-color));
      outline-offset: 2px;
    }
    .counter {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--ha-space-3, 12px);
    }
    .counter ha-icon-button {
      --mdc-icon-button-size: 48px;
      min-inline-size: 48px;
      min-block-size: 48px;
      border-radius: 50%;
      background: var(
        --md-sys-color-secondary-container,
        var(--ha-color-fill-neutral-quiet-resting)
      );
    }
    .timer-face {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--ha-space-1, 4px);
    }
    .timer-face.finished .numeral {
      animation: demo-finish 900ms ease-out 2;
    }
    .status {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ha-space-2, 8px);
      margin: 0;
      font-weight: var(--ha-font-weight-medium, 500);
    }
    .dot {
      inline-size: 10px;
      block-size: 10px;
      border-radius: 50%;
      background: var(--md-sys-color-outline, var(--disabled-color));
    }
    .status.on .dot {
      background: var(--md-sys-color-primary, var(--primary-color));
    }
    .week {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1, 4px);
    }
    .week-row {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2, 8px);
    }
    .week-day {
      inline-size: 1.5em;
      text-align: center;
      font-size: var(--ha-font-size-s, 12px);
      color: var(
        --md-sys-color-on-surface-variant,
        var(--secondary-text-color)
      );
    }
    .week-bar {
      position: relative;
      flex: 1;
      block-size: 14px;
      border-radius: 7px;
      background: var(
        --md-sys-color-surface-container-highest,
        var(--divider-color)
      );
      overflow: hidden;
    }
    .week-block {
      position: absolute;
      inset-block: 0;
      border-radius: 7px;
      background: var(--md-sys-color-primary, var(--primary-color));
    }
    .week-now {
      position: absolute;
      inset-block: 0;
      inline-size: 2px;
      background: var(--md-sys-color-tertiary, var(--accent-color));
    }
    @keyframes demo-finish {
      0% {
        transform: scale(1);
      }
      40% {
        transform: scale(1.18);
      }
      100% {
        transform: scale(1);
      }
    }
    /* Phone: a smaller numeral and tighter padding. */
    @media (max-width: 600px) {
      .demo {
        padding: var(--ha-space-3, 12px);
      }
      .numeral {
        font-size: 32px;
      }
      .body {
        gap: var(--ha-space-2, 8px);
        padding-block-start: var(--ha-space-2, 8px);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .timer-face.finished .numeral {
        animation: none;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-helper-demo": HaHelperDemo;
  }
}
