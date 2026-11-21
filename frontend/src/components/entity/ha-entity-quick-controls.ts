import { mdiMinus, mdiPlus } from "@mdi/js";
import type { HassEntity } from "home-assistant-js-websocket";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { LanguageModeController } from "../../common/language-mode/language-mode-controller";
import type {
  AlarmControlPanelEntity,
  AlarmMode,
} from "../../data/alarm_control_panel";
import {
  setProtectedAlarmControlPanelMode,
  supportedAlarmModes,
} from "../../data/alarm_control_panel";
import { forwardHaptic } from "../../data/haptics";
import type { LockEntity } from "../../data/lock";
import { callProtectedLockService } from "../../data/lock";
import type {
  QuickActionName,
  QuickControl,
  QuickService,
} from "../../data/quick-control";
import { quickControlFor } from "../../data/quick-control";
import { showConfirmationDialog } from "../../dialogs/generic/show-dialog-box";
import type { HomeAssistant } from "../../types";
import "../ha-adaptive-dialog";
import "../ha-button";
import "../ha-icon-button";
import "../ha-select";
import "../ha-slider";
import "../ha-switch";

const BLOCK = "ui.components.quick_control";

/** How long the stepper waits after the last press before it sends. */
const STEPPER_SEND_MS = 700;

/** Which part of the control to draw, so a row can place each part. */
export type QuickControlSection = "all" | "main" | "level";

/**
 * The control for an entity, shown in place wherever the entity is listed:
 * a switch, a slider, a colour button, a press button, an option list or
 * just the value. Every change goes through the same service call the
 * more-info controls use. Things that secure the home ask first through the
 * app's own two-key confirmation.
 *
 * `section="main"` draws only what fits at the end of a row (switch, press
 * button, stepper, option list or value); `section="level"` only what needs
 * the width of the row (slider and colour button). `compact` keeps the
 * whole control on one short line, for tables.
 */
@customElement("ha-entity-quick-controls")
export class HaEntityQuickControls extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public entityId?: string;

  @property({ type: Boolean, reflect: true }) public compact = false;

  @property({ reflect: true }) public section: QuickControlSection = "all";

  /** Leave out the value of read-only things, where the row already shows it. */
  @property({ type: Boolean, attribute: "no-value" }) public noValue = false;

  /** Shown until the entity reports its new state. */
  @state() private _pendingOn?: boolean;

  @state() private _pendingValue?: number;

  @state() private _pendingOption?: string;

  /** The slider value while it is being dragged. */
  @state() private _dragValue?: number;

  @state() private _error?: string;

  @state() private _busy = false;

  @state() private _colourOpen = false;

  @state() private _colourLoaded = false;

  private _stateObj?: HassEntity;

  private _stepTimer?: number;

  private _lang = new LanguageModeController(this);

  public connectedCallback(): void {
    super.connectedCallback();
    // A control in a list row must never open, select or move the row.
    this.addEventListener("click", this._stopEvent);
    this.addEventListener("keydown", this._stopActivationKeys);
    this.addEventListener("pointerdown", this._stopEvent);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this.removeEventListener("click", this._stopEvent);
    this.removeEventListener("keydown", this._stopActivationKeys);
    this.removeEventListener("pointerdown", this._stopEvent);
    window.clearTimeout(this._stepTimer);
  }

  private _stopEvent = (ev: Event) => ev.stopPropagation();

  // Only Enter and Space belong to the control; arrows and Escape still
  // reach the list around it.
  private _stopActivationKeys = (ev: KeyboardEvent) => {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.stopPropagation();
    }
  };

  protected willUpdate(changedProps: PropertyValues<this>): void {
    super.willUpdate(changedProps);
    if (!changedProps.has("hass") && !changedProps.has("entityId")) {
      return;
    }
    const stateObj = this.entityId
      ? this.hass?.states[this.entityId]
      : undefined;
    if (stateObj !== this._stateObj) {
      // The entity reported a new state: what it says is the truth now.
      if (this._stateObj && stateObj) {
        this._pendingOn = undefined;
        this._pendingValue = undefined;
        this._pendingOption = undefined;
      }
      this._stateObj = stateObj;
    }
  }

  private _t(key: string, values?: Record<string, string | number>): string {
    return this._lang.text(this.hass.localize, `${BLOCK}.${key}`, values);
  }

  private get _name(): string {
    return this._stateObj ? this.hass.formatEntityName(this._stateObj) : "";
  }

  protected render(): TemplateResult | typeof nothing {
    const stateObj = this._stateObj;
    if (!this.hass || !stateObj) {
      return nothing;
    }
    const control = quickControlFor(stateObj);
    const showMain = this.section !== "level";
    const showLevel = this.section !== "main";

    const main = showMain ? this._renderMain(stateObj, control) : nothing;
    const level = showLevel ? this._renderLevel(control) : nothing;

    return html`
      <div class=${classMap({ quick: true, compact: this.compact })}>
        ${level}${main}
      </div>
      ${
        this._error
          ? html`<p class="error" role="alert">${this._error}</p>`
          : nothing
      }
      ${this._colourLoaded ? this._renderColourDialog(stateObj) : nothing}
    `;
  }

  private _renderMain(stateObj: HassEntity, control: QuickControl) {
    switch (control.kind) {
      case "none":
      case "value":
        return this.noValue
          ? nothing
          : html`<span class="value"
              >${this.hass.formatEntityState(stateObj)}</span
            >`;
      case "press":
        return html`<ha-button
          size="s"
          appearance="outlined"
          .disabled=${this._busy}
          @click=${this._press}
          aria-label=${this._t(`press_label.${this._pressWord(stateObj)}`, {
            name: this._name,
          })}
          >${this._t(`press.${this._pressWord(stateObj)}`)}</ha-button
        >`;
      case "select":
        return this._renderSelect(control);
      default:
        break;
    }
    if (control.slider?.stepper) {
      return this._renderStepper(control);
    }
    if (!control.toggle) {
      // A slider-only kind: the value sits in the slider's own section.
      return this.section === "main" && !this.noValue
        ? html`<span class="value"
            >${this.hass.formatEntityState(stateObj)}</span
          >`
        : nothing;
    }
    if (control.risky) {
      const action = control.toggle.nextAction ?? "turn_on";
      return html`<ha-button
        size="s"
        appearance="outlined"
        class="risky"
        .disabled=${this._busy}
        @click=${this._riskyPressed}
        aria-label=${this._t(`action_label.${action}`, { name: this._name })}
        >${this._t(`action.${action}`)}</ha-button
      >`;
    }
    const on = this._pendingOn ?? control.toggle.on;
    return html`<ha-switch
      .checked=${on}
      .disabled=${this._busy}
      .accessibleLabel=${this._t("toggle", { name: this._name })}
      @change=${this._toggleChanged}
    ></ha-switch>`;
  }

  private _renderLevel(control: QuickControl) {
    const slider = control.slider;
    const showSlider =
      slider &&
      !slider.stepper &&
      // In a table row a light keeps only its switch; the level is one
      // press away in more-info.
      !(this.compact && control.toggle);
    const showColour = control.colour && control.kind === "colour";
    if (!showSlider && !showColour) {
      return nothing;
    }
    const value = this._dragValue ?? this._pendingValue ?? slider?.value;
    return html`
      ${
        showSlider && slider
          ? html`<div class="level">
              <ha-slider
                .min=${slider.min}
                .max=${slider.max}
                .step=${slider.step}
                .value=${value ?? slider.min}
                .disabled=${this._busy}
                .accessibleLabel=${this._t("level", { name: this._name })}
                @input=${this._sliderInput}
                @change=${this._sliderChange}
              ></ha-slider>
              <span class="level-value" aria-hidden="true"
                >${this._formatNumber(value, slider.unit)}</span
              >
            </div>`
          : nothing
      }
      ${
        showColour
          ? html`<button
              class="colour"
              type="button"
              aria-haspopup="dialog"
              aria-label=${this._t("colour", { name: this._name })}
              title=${this._t("colour", { name: this._name })}
              @click=${this._openColour}
            ></button>`
          : nothing
      }
    `;
  }

  private _renderStepper(control: QuickControl) {
    const slider = control.slider!;
    const value = this._pendingValue ?? slider.value;
    const unit =
      typeof this._stateObj?.attributes.unit_of_measurement === "string"
        ? this._stateObj.attributes.unit_of_measurement
        : this.hass.config.unit_system.temperature;
    return html`<div class="stepper">
      <ha-icon-button
        .path=${mdiMinus}
        .label=${this._t("decrease", { name: this._name })}
        .disabled=${value === undefined || value <= slider.min}
        @click=${this._stepDown}
      ></ha-icon-button>
      <span class="stepper-value" aria-live="polite"
        >${this._formatNumber(value, unit)}</span
      >
      <ha-icon-button
        .path=${mdiPlus}
        .label=${this._t("increase", { name: this._name })}
        .disabled=${value === undefined || value >= slider.max}
        @click=${this._stepUp}
      ></ha-icon-button>
    </div>`;
  }

  private _renderSelect(control: QuickControl) {
    const select = control.select!;
    const stateObj = this._stateObj!;
    return html`<ha-select
      class="select"
      .label=${this._t("select", { name: this._name })}
      .value=${this._pendingOption ?? select.current}
      .disabled=${this._busy}
      .options=${select.options.map((option) => ({
        value: option,
        label: this.hass.formatEntityState(stateObj, option),
      }))}
      @selected=${this._optionSelected}
    ></ha-select>`;
  }

  private _renderColourDialog(stateObj: HassEntity) {
    return html`<ha-adaptive-dialog
      .open=${this._colourOpen}
      header-title=${this._t("colour_title", { name: this._name })}
      @closed=${this._colourClosed}
    >
      <light-color-rgb-picker .stateObj=${stateObj}></light-color-rgb-picker>
    </ha-adaptive-dialog>`;
  }

  private _formatNumber(value: number | undefined, unit?: string): string {
    if (value === undefined) {
      return "—";
    }
    const number = new Intl.NumberFormat(this.hass.locale.language, {
      maximumFractionDigits: 2,
    }).format(value);
    if (!unit) {
      return number;
    }
    return unit === "%" ? `${number}%` : `${number} ${unit}`;
  }

  private _pressWord(stateObj: HassEntity): "press" | "activate" | "run" {
    const domain = stateObj.entity_id.split(".")[0];
    return domain === "scene"
      ? "activate"
      : domain === "script"
        ? "run"
        : "press";
  }

  // #region actions

  private async _call(
    service: QuickService,
    data: Record<string, unknown> = {}
  ): Promise<void> {
    await this.hass.callService(service.domain, service.service, {
      entity_id: this.entityId,
      ...data,
    });
  }

  /** Runs one change, shows a plain error line and rolls back when it fails. */
  private async _run(
    change: () => Promise<void>,
    rollback: () => void
  ): Promise<void> {
    this._error = undefined;
    this._busy = true;
    try {
      await change();
    } catch (err: unknown) {
      rollback();
      // A code dialog the person closed is not an error.
      if (!(err instanceof Error && err.message === "Code dialog closed")) {
        this._error = this._t("error", {
          name: this._name,
          message:
            err && typeof err === "object" && "message" in err
              ? String((err as { message: unknown }).message)
              : String(err),
        });
      }
    } finally {
      this._busy = false;
    }
  }

  private _toggleChanged(ev: Event) {
    const control = this._control();
    const toggle = control?.toggle;
    if (!toggle) {
      return;
    }
    const checked = (ev.target as HTMLInputElement).checked;
    forwardHaptic(this, "light");
    this._pendingOn = checked;
    this._run(
      () => this._call(checked ? toggle.onService : toggle.offService),
      () => {
        this._pendingOn = undefined;
        (ev.target as HTMLInputElement).checked = toggle.on;
      }
    );
  }

  private async _riskyPressed() {
    const control = this._control();
    const toggle = control?.toggle;
    const stateObj = this._stateObj;
    if (!toggle || !stateObj) {
      return;
    }
    const action: QuickActionName = toggle.nextAction ?? "turn_on";
    const confirmed = await showConfirmationDialog(this, {
      title: this._t(`confirm.${action}`, { name: this._name }),
      text: this._t("confirm_text", { name: this._name }),
      confirmText: this._t(`action.${action}`),
      dismissText: this.hass.localize("ui.common.cancel"),
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    const goOn = !toggle.on;
    this._pendingOn = goOn;
    await this._run(
      () => this._riskyCall(stateObj, goOn, toggle),
      () => {
        this._pendingOn = undefined;
      }
    );
  }

  private async _riskyCall(
    stateObj: HassEntity,
    goOn: boolean,
    toggle: NonNullable<QuickControl["toggle"]>
  ): Promise<void> {
    const domain = stateObj.entity_id.split(".")[0];
    if (domain === "lock") {
      // Asks for the code the same way the lock's own control does.
      await callProtectedLockService(
        this,
        this.hass.callService,
        this.hass.callWS,
        this.hass.localize,
        stateObj as LockEntity,
        goOn ? "unlock" : "lock"
      );
      return;
    }
    if (domain === "alarm_control_panel") {
      const alarm = stateObj as AlarmControlPanelEntity;
      let mode: AlarmMode = "disarmed";
      if (!goOn) {
        const modes = supportedAlarmModes(alarm).filter(
          (m) => m !== "disarmed"
        );
        mode = modes.includes("armed_away")
          ? "armed_away"
          : (modes[0] ?? "armed_away");
      }
      await setProtectedAlarmControlPanelMode(this, this.hass, alarm, mode);
      return;
    }
    await this._call(goOn ? toggle.onService : toggle.offService);
  }

  private async _press() {
    const control = this._control();
    if (!control?.press) {
      return;
    }
    forwardHaptic(this, "light");
    if (control.risky) {
      const confirmed = await showConfirmationDialog(this, {
        title: this._t("confirm.turn_on", { name: this._name }),
        text: this._t("confirm_text", { name: this._name }),
        confirmText: this._t("action.turn_on"),
        dismissText: this.hass.localize("ui.common.cancel"),
        destructive: true,
      });
      if (!confirmed) {
        return;
      }
    }
    await this._run(
      () => this._call(control.press!.service),
      () => undefined
    );
  }

  private _sliderInput(ev: Event) {
    this._dragValue = Number((ev.target as HTMLInputElement).value);
  }

  private _sliderChange(ev: Event) {
    const slider = this._control()?.slider;
    this._dragValue = undefined;
    if (!slider) {
      return;
    }
    const value = Number((ev.target as HTMLInputElement).value);
    if (value === slider.value) {
      return;
    }
    this._pendingValue = value;
    this._run(
      () =>
        this._call(slider.service, {
          [slider.field]: slider.scale ? value / slider.scale : value,
        }),
      () => {
        this._pendingValue = undefined;
      }
    );
  }

  private _stepDown() {
    this._step(-1);
  }

  private _stepUp() {
    this._step(1);
  }

  private _step(direction: number) {
    const slider = this._control()?.slider;
    if (!slider) {
      return;
    }
    const current = this._pendingValue ?? slider.value;
    if (current === undefined) {
      return;
    }
    const next = Math.min(
      slider.max,
      Math.max(
        slider.min,
        Math.round((current + direction * slider.step) * 1000) / 1000
      )
    );
    this._pendingValue = next;
    window.clearTimeout(this._stepTimer);
    // Several presses in a row send one change.
    this._stepTimer = window.setTimeout(() => {
      const value = this._pendingValue;
      if (value === undefined || value === slider.value) {
        return;
      }
      this._run(
        () => this._call(slider.service, { [slider.field]: value }),
        () => {
          this._pendingValue = undefined;
        }
      );
    }, STEPPER_SEND_MS);
  }

  private _optionSelected(ev: CustomEvent<{ value?: string }>) {
    const select = this._control()?.select;
    const option = ev.detail?.value;
    if (!select || option === undefined || option === select.current) {
      return;
    }
    this._pendingOption = option;
    this._run(
      () => this._call(select.service, { option }),
      () => {
        this._pendingOption = undefined;
      }
    );
  }

  private async _openColour() {
    // The picker is loaded only when someone asks for it.
    await import("../../dialogs/more-info/components/lights/light-color-rgb-picker");
    this._colourLoaded = true;
    this._colourOpen = true;
  }

  private _colourClosed() {
    this._colourOpen = false;
  }

  private _control(): QuickControl | undefined {
    return this._stateObj ? quickControlFor(this._stateObj) : undefined;
  }

  // #endregion actions

  static styles: CSSResultGroup = css`
    :host {
      display: block;
      min-width: 0;
      max-width: 100%;
    }
    :host([section="main"]) {
      display: inline-block;
    }
    .quick {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      flex-wrap: wrap;
      gap: var(--ha-space-2);
      min-width: 0;
    }
    :host([section="level"]) .quick {
      justify-content: flex-start;
      flex-wrap: nowrap;
    }
    .quick.compact {
      flex-wrap: nowrap;
    }
    .value {
      font-weight: var(--ha-font-weight-medium);
      color: var(--primary-text-color);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 16ch;
    }
    ha-switch {
      /* The switch keeps a 48 px hit area without growing the row. */
      padding-block: var(--ha-space-2);
    }
    ha-button.risky {
      --ha-button-border-color: var(--ha-color-border-warning-normal);
    }
    /* The small press buttons keep a 48 px tall hit area without growing
       the row they sit in. */
    ha-button {
      position: relative;
    }
    ha-button::after {
      content: "";
      position: absolute;
      inset: -8px 0;
    }
    .level {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      flex: 1 1 160px;
      min-width: 0;
      min-height: 48px;
    }
    .compact .level {
      flex: 0 1 112px;
    }
    .level ha-slider {
      flex: 1 1 auto;
      min-width: 64px;
    }
    .level-value {
      flex: none;
      min-width: 4ch;
      text-align: end;
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
    .colour {
      flex: none;
      width: 40px;
      height: 40px;
      margin: var(--ha-space-1);
      border-radius: var(--ha-border-radius-circle);
      border: var(--ha-border-width-sm) solid var(--divider-color);
      background: conic-gradient(red, yellow, lime, aqua, blue, magenta, red);
      cursor: pointer;
      padding: 0;
    }
    .colour:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    .stepper {
      display: flex;
      align-items: center;
    }
    .stepper-value {
      min-width: 5ch;
      text-align: center;
      font-weight: var(--ha-font-weight-bold);
      font-variant-numeric: tabular-nums;
    }
    .select {
      min-width: 140px;
      max-width: 220px;
    }
    .error {
      margin: var(--ha-space-1) 0 0;
      font-size: var(--ha-font-size-s);
      color: var(--error-color);
      overflow-wrap: anywhere;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-entity-quick-controls": HaEntityQuickControls;
  }
}
