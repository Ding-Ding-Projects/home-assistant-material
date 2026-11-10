/* eslint-disable lit/prefer-query-decorators -- the fields asked for depend on the step shown */
import {
  mdiCheck,
  mdiClose,
  mdiContentCopy,
  mdiEmoticonOutline,
  mdiLifebuoy,
  mdiOpenInNew,
} from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import { applyElementLocks } from "../../common/locks/element-lock-session";
import {
  readLocks,
  withLockRecord,
  writeLocks,
} from "../../common/locks/element-locks";
import type {
  LockDuration,
  LockFactor,
  LockPolicy,
} from "../../common/locks/lock-credentials";
import {
  base32Decode,
  createLockRecord,
  LOCK_POLICIES,
  MINUTES_LIMIT,
  newTotpSecret,
  PASSWORD_MAX,
  PASSWORD_MIN,
  POLICY_FACTORS,
  totpMatches,
  totpUri,
} from "../../common/locks/lock-credentials";
import "../ha-qr-code";
import "../ha-svg-icon";
import "../input/ha-input";
import type { HaInput } from "../input/ha-input";
import "./ha-lock-pin-entry";
import type { HaLockPinEntry } from "./ha-lock-pin-entry";
import { lockPanelStyles } from "./lock-panel-styles";
import {
  anchorStyle,
  besideStyle,
  isNarrow,
  lockText,
  onNarrowChange,
} from "./lock-text";

export interface LockWizardTarget {
  /** The key of the lock to make. */
  key: string;
  /** What is being locked, in words. */
  label: string;
  /** The element the wizard opens beside. */
  anchor?: Element;
  /** The title of the page it is on; the open page's title when left out. */
  page?: string;
  /** Called after the lock was made. */
  onCreated?: () => void;
}

/** The six steps, in order. The names are lock wording keys. */
const STEPS = [
  "step_target",
  "policy_title",
  "step_create",
  "step_duration",
  "step_disclosure",
  "step_confirm",
] as const;

const TARGET = 0;
const POLICY = 1;
const CREATE = 2;
const DURATION = 3;
const DISCLOSURE = 4;
const CONFIRM = 5;

/**
 * The wizard that makes one lock in six steps: what is locked, what unlocks
 * it, each credential made in the order it will be asked for, how long an
 * unlock lasts, the plain disclosure and recovery line, and the
 * confirmation. Wide, it floats beside the element with the steps listed;
 * on a phone it is a full-height sheet with a segmented line. It does not
 * darken the page. Nothing is carried over from another lock.
 */
@customElement("ha-lock-wizard")
export class HaLockWizard extends LitElement {
  @property({ attribute: false }) public target!: LockWizardTarget;

  @state() private _policy: LockPolicy = "pin";

  @state() private _durationKind: LockDuration["kind"] = "surface";

  @state() private _minutes = 15;

  @state() private _step = TARGET;

  /** Which of the policy's credentials is being made. */
  @state() private _credIndex = 0;

  /** Whether the PIN is being chosen or repeated. */
  @state() private _pinRepeat = false;

  @state() private _pinValid = false;

  @state() private _pin = "";

  @state() private _password = "";

  @state() private _totpSecret = newTotpSecret();

  @state() private _totpChecked = false;

  @state() private _copied = false;

  @state() private _ack = false;

  @state() private _onStart = true;

  @state() private _error = "";

  @state() private _busy = false;

  @state() private _narrow = isNarrow();

  private _returnTo?: HTMLElement;

  private _stopNarrow?: () => void;

  public connectedCallback(): void {
    super.connectedCallback();
    const active = document.activeElement;
    this._returnTo =
      active instanceof HTMLElement && active !== document.body
        ? active
        : (this.target.anchor as HTMLElement | undefined);
    this._stopNarrow = onNarrowChange((narrow) => {
      this._narrow = narrow;
    });
    window.addEventListener("keydown", this._escape, true);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._stopNarrow?.();
    window.removeEventListener("keydown", this._escape, true);
  }

  protected firstUpdated(): void {
    this._focusFirst();
  }

  private _focusFirst(): void {
    this.updateComplete.then(() => {
      this.renderRoot
        .querySelector<HTMLElement>(
          "ha-lock-pin-entry, ha-input, input[type='radio']:checked"
        )
        ?.focus?.();
    });
  }

  private _escape = (ev: KeyboardEvent): void => {
    if (ev.key === "Escape") {
      ev.stopPropagation();
      this._close();
    }
  };

  private _close(): void {
    const target = this._returnTo?.isConnected
      ? this._returnTo
      : (this.target.anchor as HTMLElement | undefined);
    this.remove();
    if (target?.isConnected) {
      target.focus?.();
    }
  }

  private get _factors(): LockFactor[] {
    return POLICY_FACTORS[this._policy];
  }

  private get _factor(): LockFactor {
    return this._factors[Math.min(this._credIndex, this._factors.length - 1)];
  }

  private get _duration(): LockDuration {
    if (this._durationKind === "minutes") {
      return { kind: "minutes", minutes: this._minutes };
    }
    return { kind: this._durationKind } as LockDuration;
  }

  private _durationText(): string {
    return this._durationKind === "minutes"
      ? lockText("duration_minutes_value", { minutes: this._minutes })
      : lockText(`duration_${this._durationKind}`);
  }

  private _stepName(index: number): string {
    return lockText(STEPS[index]);
  }

  protected render(): TemplateResult {
    const placement = this._narrow
      ? undefined
      : besideStyle(this.target.anchor, 560);
    return html`
      ${
        placement?.line
          ? html`<div class="line" style=${styleMap(placement.line)}></div>`
          : nothing
      }
      <div
        class=${classMap({ panel: true, sheet: this._narrow })}
        role="dialog"
        aria-modal="false"
        aria-labelledby="title"
        style=${styleMap(
          this._narrow
            ? {}
            : (placement?.panel ?? anchorStyle(this.target.anchor, 560))
        )}
      >
        <header>
          <div class="titles">
            <h2 id="title">
              ${lockText("wizard_title", { name: this.target.label })}
            </h2>
            <p class="sub" role="status">
              ${lockText("wizard_step_named", {
                current: this._step + 1,
                total: STEPS.length,
                name: this._stepName(this._step),
              })}
            </p>
          </div>
          <button
            type="button"
            class="close"
            aria-label=${lockText("close")}
            @click=${this._close}
          >
            <ha-svg-icon .path=${mdiClose}></ha-svg-icon>
          </button>
        </header>
        ${this._narrow ? this._renderSegments() : nothing}
        <div class=${classMap({ layout: true, wide: !this._narrow })}>
          ${this._narrow ? nothing : this._renderStepList()}
          <div class="body">
            <h3 class="step-name">${this._stepName(this._step)}</h3>
            ${this._renderStep()}
            ${
              this._error
                ? html`<p class="error" role="alert">${this._error}</p>`
                : nothing
            }
          </div>
        </div>
        ${this._renderButtons()}
      </div>
    `;
  }

  private _renderSegments(): TemplateResult {
    return html`<div class="segments" aria-hidden="true">
      ${STEPS.map(
        (_name, index) =>
          html`<span
            class=${classMap({
              done: index < this._step,
              current: index === this._step,
            })}
          ></span>`
      )}
    </div>`;
  }

  private _renderStepList(): TemplateResult {
    return html`<ol class="steps" aria-label=${lockText("steps_label")}>
      ${STEPS.map((_name, index) => {
        const done = index < this._step;
        const current = index === this._step;
        const mark = done
          ? html`<ha-svg-icon .path=${mdiCheck}></ha-svg-icon>`
          : html`${index + 1}`;
        return html`<li aria-current=${current ? "step" : "false"}>
          ${
            done
              ? html`<button
                  type="button"
                  class="step done"
                  data-step=${index}
                  @click=${this._openStep}
                >
                  <span class="mark">${mark}</span>
                  <span>${this._stepName(index)}</span>
                  <span class="visually-hidden">${lockText("step_done")}</span>
                </button>`
              : html`<span class=${classMap({ step: true, current })}>
                  <span class="mark">${mark}</span>
                  <span>${this._stepName(index)}</span>
                </span>`
          }
        </li>`;
      })}
    </ol>`;
  }

  private _renderButtons(): TemplateResult {
    const last = this._step === CONFIRM;
    const pinStage = this._step === CREATE && this._factor === "pin";
    const blocked =
      this._busy ||
      (last && !this._ack) ||
      (this._step === DISCLOSURE && !this._ack) ||
      (pinStage && !this._pinValid);
    return html`<div class="buttons">
      <button type="button" class="text" @click=${this._back}>
        ${this._step === TARGET ? lockText("cancel") : lockText("back")}
      </button>
      <button
        type="button"
        class="primary"
        ?disabled=${blocked}
        @click=${last ? this._create : this._next}
      >
        ${last ? lockText("create") : lockText("next")}
      </button>
    </div>`;
  }

  private _renderStep(): TemplateResult {
    switch (this._step) {
      case TARGET:
        return html`<p class="target">${this.target.label}</p>
          <p class="note">${lockText("target_note")}</p>`;
      case POLICY:
        return this._renderPolicy();
      case CREATE:
        return this._renderCreate();
      case DURATION:
        return this._renderDuration();
      case DISCLOSURE:
        return this._renderDisclosure();
      default:
        return html`<p>
          ${lockText("summary", {
            name: this.target.label,
            policy: lockText(`policy_${this._policy}`),
          })}
        </p>`;
    }
  }

  private _renderCreate(): TemplateResult {
    const factor = this._factor;
    const header = html`<p class="credential">
      <span class="chip"
        >${lockText("credential_of", {
          current: this._credIndex + 1,
          total: this._factors.length,
        })}</span
      >
      <strong>${lockText(`factor_${factor}`)}</strong>
    </p>`;
    if (factor === "pin") {
      return html`${header}
        <ha-lock-pin-entry
          hide-actions
          .prompt=${
            this._pinRepeat ? lockText("pin_repeat") : lockText("pin_new")
          }
          @lock-pin-change=${this._pinChanged}
          @lock-pin-submit=${this._pinSubmitted}
        ></ha-lock-pin-entry>`;
    }
    if (factor === "password") {
      return html`${header}
        <ha-input
          name="password"
          type="password"
          autocomplete="new-password"
          maxlength=${PASSWORD_MAX}
          .label=${lockText("password_new")}
          .value=${this._password}
          @input=${this._passwordInput}
        ></ha-input>
        <ha-input
          name="password_repeat"
          type="password"
          autocomplete="new-password"
          maxlength=${PASSWORD_MAX}
          .label=${lockText("password_repeat")}
        ></ha-input>`;
    }
    const uri = totpUri(this._totpSecret, this.target.label);
    return html`${header}
      <p>${lockText("totp_intro")}</p>
      <p class="secret"><code>${this._groups(this._totpSecret)}</code></p>
      <div class="totp-actions">
        <a class="linkbutton" href=${uri}>
          <ha-svg-icon .path=${mdiOpenInNew}></ha-svg-icon>
          ${lockText("totp_open")}
        </a>
        <button type="button" class="text" @click=${this._copySecret}>
          <ha-svg-icon .path=${mdiContentCopy}></ha-svg-icon>
          ${this._copied ? lockText("totp_copied") : lockText("totp_copy")}
        </button>
      </div>
      <div class="qr" role="img" aria-label=${lockText("totp_qr")}>
        <ha-qr-code .data=${uri} .scale=${4} .margin=${2}></ha-qr-code>
      </div>
      <p class="note">${lockText("totp_scan")}</p>
      <ha-input
        name="totp_check"
        inputmode="numeric"
        autocomplete="off"
        maxlength="6"
        .label=${lockText("totp_check")}
        @input=${this._totpInput}
      ></ha-input>
      ${
        this._totpChecked
          ? html`<p class="callout ok" role="status">
              <ha-svg-icon .path=${mdiCheck}></ha-svg-icon>
              <span>${lockText("totp_ok")}</span>
            </p>`
          : nothing
      }`;
  }

  /** The secret in groups of four, so it can be read and typed. */
  private _groups(secret: string): string {
    return secret.match(/.{1,4}/g)?.join(" ") ?? secret;
  }

  private _renderPolicy(): TemplateResult {
    return html`<fieldset>
      <legend class="visually-hidden">${lockText("policy_title")}</legend>
      ${LOCK_POLICIES.map(
        (policy) =>
          html`<label
            class=${classMap({
              choice: true,
              selected: this._policy === policy,
            })}
          >
            <input
              type="radio"
              name="policy"
              .checked=${this._policy === policy}
              data-policy=${policy}
              @change=${this._policyChanged}
            />
            ${lockText(`policy_${policy}`)}
          </label>`
      )}
    </fieldset>`;
  }

  private _renderDuration(): TemplateResult {
    return html`<fieldset>
      <legend class="visually-hidden">${lockText("duration_title")}</legend>
      <p class="note">${lockText("duration_title")}</p>
      ${(["surface", "session", "minutes"] as const).map(
        (kind) =>
          html`<label
            class=${classMap({
              choice: true,
              selected: this._durationKind === kind,
            })}
          >
            <input
              type="radio"
              name="duration"
              .checked=${this._durationKind === kind}
              data-kind=${kind}
              @change=${this._durationChanged}
            />
            ${lockText(`duration_${kind}`)}
          </label>`
      )}
      ${
        this._durationKind === "minutes"
          ? html`<ha-input
              type="number"
              min="1"
              max=${MINUTES_LIMIT}
              .label=${lockText("minutes_field")}
              .value=${String(this._minutes)}
              @input=${this._minutesInput}
            ></ha-input>`
          : nothing
      }
      <label class="check">
        <input
          type="checkbox"
          .checked=${this._onStart}
          @change=${this._onStartChanged}
        />
        ${lockText("on_start_label")}
      </label>
      <p class="note">${lockText("on_start_note")}</p>
    </fieldset>`;
  }

  private _onStartChanged(ev: Event): void {
    this._onStart = (ev.target as HTMLInputElement).checked;
  }

  private _renderDisclosure(): TemplateResult {
    return html`<p class="callout">
        <ha-svg-icon .path=${mdiEmoticonOutline}></ha-svg-icon>
        <span>${lockText("toy_note")}</span>
      </p>
      <p class="callout">
        <ha-svg-icon .path=${mdiLifebuoy}></ha-svg-icon>
        <span>${lockText("recovery")}</span>
      </p>
      <label class="check">
        <input
          type="checkbox"
          .checked=${this._ack}
          @change=${this._ackChanged}
        />
        ${lockText("ack")}
      </label>
      <dl class="facts">
        <dt>${lockText("unlocks_with")}</dt>
        <dd>${lockText(`policy_${this._policy}`)}</dd>
        <dt>${lockText("unlock_lasts")}</dt>
        <dd>${this._durationText()}</dd>
      </dl>`;
  }

  private _policyChanged(ev: Event): void {
    this._choosePolicy(
      (ev.currentTarget as HTMLElement).dataset.policy as LockPolicy
    );
  }

  private _durationChanged(ev: Event): void {
    this._durationKind = (ev.currentTarget as HTMLElement).dataset
      .kind as LockDuration["kind"];
  }

  private _ackChanged(ev: Event): void {
    this._ack = (ev.target as HTMLInputElement).checked;
  }

  private _choosePolicy(policy: LockPolicy): void {
    this._policy = policy;
    this._resetCredentials();
  }

  private _resetCredentials(): void {
    this._pin = "";
    this._password = "";
    this._totpChecked = false;
    this._totpSecret = newTotpSecret();
    this._credIndex = 0;
    this._pinRepeat = false;
    this._pinValid = false;
  }

  private _minutesInput(ev: Event): void {
    this._minutes = Number((ev.target as HaInput).value);
  }

  private _passwordInput(ev: Event): void {
    this._password = (ev.target as HaInput).value ?? "";
  }

  private async _totpInput(ev: Event): Promise<void> {
    const code = (ev.target as HaInput).value ?? "";
    if (code.length !== 6 || !base32Decode(this._totpSecret)) {
      this._totpChecked = false;
      return;
    }
    this._totpChecked = await totpMatches(this._totpSecret, code, Date.now());
  }

  private async _copySecret(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this._totpSecret);
      this._copied = true;
    } catch (_err) {
      this._copied = false;
    }
  }

  private _pinChanged(ev: CustomEvent<{ valid: boolean }>): void {
    this._pinValid = ev.detail.valid;
  }

  private _pinSubmitted(ev: CustomEvent<{ value: string }>): void {
    this._pinValid = false;
    if (!this._pinRepeat) {
      this._pin = ev.detail.value;
      this._error = "";
      this._pinRepeat = true;
      this._focusFirst();
      return;
    }
    if (ev.detail.value !== this._pin) {
      this._error = lockText("pin_mismatch");
      this._pin = "";
      this._pinRepeat = false;
      this._focusFirst();
      return;
    }
    this._error = "";
    this._finishCredential();
  }

  /** Moves on after one credential was made: to the next one, or the next step. */
  private _finishCredential(): void {
    this._pinRepeat = false;
    this._pinValid = false;
    if (this._credIndex < this._factors.length - 1) {
      this._credIndex += 1;
    } else {
      this._step = DURATION;
    }
    this._focusFirst();
  }

  private _openStep(ev: Event): void {
    const index = Number((ev.currentTarget as HTMLElement).dataset.step);
    this._error = "";
    if (index === CREATE) {
      // Credentials are made again, in order.
      this._resetCredentials();
    }
    this._step = index;
    this._focusFirst();
  }

  private _back(): void {
    this._error = "";
    if (this._step === TARGET) {
      this._close();
      return;
    }
    if (this._step === CREATE) {
      if (this._pinRepeat) {
        this._pinRepeat = false;
        this._pin = "";
      } else if (this._credIndex > 0) {
        this._credIndex -= 1;
        this._pin = "";
      } else {
        this._step = POLICY;
      }
    } else if (this._step === DURATION) {
      this._step = CREATE;
      this._credIndex = this._factors.length - 1;
      this._pinRepeat = false;
    } else {
      this._step -= 1;
    }
    this._focusFirst();
  }

  private async _next(): Promise<void> {
    this._error = "";
    if (this._step === CREATE) {
      await this._nextCredential();
      return;
    }
    if (this._step === DURATION) {
      if (
        this._durationKind === "minutes" &&
        !(
          Number.isInteger(this._minutes) &&
          this._minutes >= 1 &&
          this._minutes <= MINUTES_LIMIT
        )
      ) {
        this._error = lockText("duration_invalid");
        return;
      }
    } else if (this._step === DISCLOSURE && !this._ack) {
      return;
    }
    if (this._step === POLICY && this._credIndex !== 0) {
      this._resetCredentials();
    }
    this._step += 1;
    this._focusFirst();
  }

  private async _nextCredential(): Promise<void> {
    const factor = this._factor;
    if (factor === "pin") {
      this.renderRoot
        .querySelector<HaLockPinEntry>("ha-lock-pin-entry")
        ?.submit();
      return;
    }
    if (factor === "password") {
      const repeat =
        this.renderRoot.querySelector<HaInput>(
          "ha-input[name='password_repeat']"
        )?.value ?? "";
      if (
        this._password.length < PASSWORD_MIN ||
        this._password.length > PASSWORD_MAX
      ) {
        this._error = lockText("password_invalid", { min: PASSWORD_MIN });
        return;
      }
      if (repeat !== this._password) {
        this._error = lockText("password_mismatch");
        return;
      }
    } else {
      const code =
        this.renderRoot.querySelector<HaInput>("ha-input[name='totp_check']")
          ?.value ?? "";
      if (
        !base32Decode(this._totpSecret) ||
        !(await totpMatches(this._totpSecret, code, Date.now()))
      ) {
        this._error = lockText("totp_wrong");
        return;
      }
      this._totpChecked = true;
    }
    this._finishCredential();
  }

  private async _create(): Promise<void> {
    if (this._busy || !this._ack) {
      return;
    }
    this._busy = true;
    try {
      const has = (factor: LockFactor) => this._factors.includes(factor);
      const record = await createLockRecord(
        {
          key: this.target.key,
          label: this.target.label,
          policy: this._policy,
          duration: this._duration,
          page: this.target.page ?? document.title,
          onStart: this._onStart,
          pin: has("pin") ? this._pin : undefined,
          password: has("password") ? this._password : undefined,
          totpSecret: has("totp") ? this._totpSecret : undefined,
        },
        Date.now()
      );
      writeLocks(withLockRecord(readLocks(), record));
      applyElementLocks();
      this._pin = "";
      this._password = "";
      this._totpSecret = "";
      const done = this.target.onCreated;
      this._close();
      done?.();
    } catch (_err) {
      this._error = lockText("create_failed");
    } finally {
      this._busy = false;
    }
  }

  static styles: CSSResultGroup = [
    lockPanelStyles,
    css`
      .line {
        position: fixed;
        z-index: 999;
        height: 2px;
        background: var(--primary-color);
      }
      .panel {
        grid-template-rows: auto auto 1fr auto;
      }
      .panel.sheet {
        grid-template-rows: auto auto 1fr auto;
        padding-bottom: 0;
      }
      .panel.sheet .buttons {
        position: sticky;
        bottom: 0;
        padding: var(--ha-space-3) 0;
        background: var(--card-background-color, #fff);
        border-top: 1px solid var(--divider-color);
      }
      .layout {
        min-height: 0;
      }
      .layout.wide {
        display: grid;
        grid-template-columns: 180px minmax(0, 1fr);
        gap: var(--ha-space-4);
      }
      .body {
        display: grid;
        gap: var(--ha-space-3);
        align-content: start;
        min-width: 0;
      }
      .step-name {
        margin: 0;
        font-size: var(--ha-font-size-m, 1rem);
        font-weight: 500;
      }
      .segments {
        display: grid;
        grid-template-columns: repeat(6, 1fr);
        gap: var(--ha-space-1);
      }
      .segments span {
        height: 4px;
        border-radius: 2px;
        background: var(--divider-color);
      }
      .segments span.done {
        background: var(--primary-color);
      }
      .segments span.current {
        background: color-mix(in srgb, var(--primary-color) 40%, transparent);
      }
      .steps {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: var(--ha-space-1);
        align-content: start;
      }
      .step {
        display: flex;
        align-items: center;
        gap: var(--ha-space-3);
        min-height: 40px;
        padding: 0;
        border: 0;
        background: none;
        color: var(--primary-text-color);
        font: inherit;
        text-align: start;
      }
      button.step {
        cursor: pointer;
      }
      .mark {
        display: grid;
        place-items: center;
        flex: none;
        width: 28px;
        height: 28px;
        box-sizing: border-box;
        border-radius: 50%;
        border: 1px solid var(--secondary-text-color);
        font-size: var(--ha-font-size-s, 0.85rem);
      }
      .mark ha-svg-icon {
        --mdc-icon-size: 16px;
      }
      .done .mark {
        background: var(--primary-color);
        border-color: var(--primary-color);
        color: var(--text-primary-color, #fff);
      }
      .current .mark {
        background: color-mix(in srgb, var(--primary-color) 18%, transparent);
        border-color: transparent;
        font-weight: 600;
      }
      .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
      }
      .target {
        font-size: var(--ha-font-size-l, 1.1rem);
        overflow-wrap: anywhere;
      }
      .credential {
        display: flex;
        align-items: center;
        gap: var(--ha-space-2);
      }
      .chip {
        padding: 2px var(--ha-space-3);
        border-radius: var(--ha-border-radius-pill);
        background: color-mix(in srgb, var(--primary-color) 18%, transparent);
        font-size: var(--ha-font-size-s, 0.85rem);
      }
      .secret code {
        display: block;
        padding: var(--ha-space-3);
        border-radius: var(--ha-border-radius-lg);
        background: var(--secondary-background-color);
        overflow-wrap: anywhere;
        font-size: var(--ha-font-size-l, 1.1rem);
        letter-spacing: 0.08em;
      }
      .totp-actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--ha-space-2);
        align-items: center;
      }
      .linkbutton,
      button.text {
        display: inline-flex;
        align-items: center;
        gap: var(--ha-space-2);
        min-height: 44px;
        padding: 0 var(--ha-space-4);
        border-radius: var(--ha-border-radius-pill, 24px);
        text-decoration: none;
        color: var(--primary-color);
      }
      .linkbutton {
        background: color-mix(in srgb, var(--primary-color) 16%, transparent);
      }
      .linkbutton ha-svg-icon,
      button.text ha-svg-icon {
        --mdc-icon-size: 20px;
      }
      .qr {
        justify-self: start;
        padding: var(--ha-space-2);
        border-radius: var(--ha-border-radius-lg);
        background: var(--secondary-background-color);
      }
      fieldset {
        border: 0;
        margin: 0;
        padding: 0;
        display: grid;
        gap: var(--ha-space-2);
      }
      .choice {
        display: flex;
        align-items: center;
        gap: var(--ha-space-3);
        min-height: 48px;
        padding: 0 var(--ha-space-3);
        border-radius: var(--ha-border-radius-lg);
        background: var(--secondary-background-color);
        cursor: pointer;
      }
      .choice.selected {
        background: color-mix(in srgb, var(--primary-color) 18%, transparent);
      }
      .choice input,
      .check input {
        width: 20px;
        height: 20px;
        flex: none;
      }
      .check {
        display: flex;
        align-items: center;
        gap: var(--ha-space-3);
        min-height: 44px;
      }
      .facts {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: var(--ha-space-1) var(--ha-space-4);
        margin: 0;
      }
      .facts dt {
        color: var(--secondary-text-color);
      }
      .facts dd {
        margin: 0;
        font-weight: 500;
        text-align: end;
      }
      .callout.ok {
        background: color-mix(in srgb, var(--success-color) 22%, transparent);
        color: var(--primary-text-color);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-lock-wizard": HaLockWizard;
  }
}

/** Opens the lock wizard beside an element and returns focus to it after. */
export const openLockWizard = (target: LockWizardTarget): void => {
  document.querySelectorAll("ha-lock-wizard").forEach((old) => old.remove());
  const wizard = document.createElement("ha-lock-wizard");
  wizard.target = target;
  document.body.append(wizard);
};
