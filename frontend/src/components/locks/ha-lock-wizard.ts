/* eslint-disable lit/prefer-query-decorators -- the fields asked for depend on the step shown */
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
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
import "../input/ha-input";
import type { HaInput } from "../input/ha-input";
import "./ha-lock-pin-entry";
import { anchorStyle, lockText } from "./lock-text";

export interface LockWizardTarget {
  /** The key of the lock to make. */
  key: string;
  /** What is being locked, in words. */
  label: string;
  /** The element the wizard opens beside. */
  anchor?: Element;
  /** Called after the lock was made. */
  onCreated?: () => void;
}

type Stage = "choose" | "pin" | "pin_confirm" | "password" | "totp" | "confirm";

/**
 * The wizard that makes one lock: it names what is locked, picks one of
 * the six policies, creates that lock's own credentials, picks how long an
 * unlock lasts and shows the plain disclosure. It floats beside the element
 * and does not darken the page. Nothing is carried over from another lock.
 */
@customElement("ha-lock-wizard")
export class HaLockWizard extends LitElement {
  @property({ attribute: false }) public target!: LockWizardTarget;

  @state() private _policy: LockPolicy = "pin";

  @state() private _durationKind: LockDuration["kind"] = "surface";

  @state() private _minutes = 15;

  @state() private _stageIndex = 0;

  @state() private _pin = "";

  @state() private _password = "";

  @state() private _totpSecret = newTotpSecret();

  @state() private _totpChecked = false;

  @state() private _ack = false;

  @state() private _error = "";

  @state() private _busy = false;

  private _returnTo?: HTMLElement;

  public connectedCallback(): void {
    super.connectedCallback();
    const active = document.activeElement;
    this._returnTo =
      active instanceof HTMLElement && active !== document.body
        ? active
        : (this.target.anchor as HTMLElement | undefined);
    window.addEventListener("keydown", this._escape, true);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
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

  private get _stages(): Stage[] {
    const stages: Stage[] = ["choose"];
    POLICY_FACTORS[this._policy].forEach((factor) => {
      if (factor === "pin") {
        stages.push("pin", "pin_confirm");
      } else {
        stages.push(factor);
      }
    });
    stages.push("confirm");
    return stages;
  }

  private get _stage(): Stage {
    return this._stages[Math.min(this._stageIndex, this._stages.length - 1)];
  }

  private get _duration(): LockDuration {
    if (this._durationKind === "minutes") {
      return { kind: "minutes", minutes: this._minutes };
    }
    return { kind: this._durationKind } as LockDuration;
  }

  protected render(): TemplateResult {
    const stages = this._stages;
    return html`
      <div
        class="panel"
        role="dialog"
        aria-modal="false"
        aria-labelledby="title"
        style=${styleMap(anchorStyle(this.target.anchor, 400))}
      >
        <h2 id="title">
          ${lockText("wizard_title", { name: this.target.label })}
        </h2>
        <p class="note" role="status">
          ${lockText("wizard_step", {
            current: this._stageIndex + 1,
            total: stages.length,
          })}
        </p>
        ${this._renderStage()}
        ${
          this._error
            ? html`<p class="error" role="alert">${this._error}</p>`
            : nothing
        }
        ${
          this._stage === "pin" || this._stage === "pin_confirm"
            ? nothing
            : this._renderButtons()
        }
      </div>
    `;
  }

  private _renderButtons(): TemplateResult {
    const stage = this._stage;
    const last = stage === "confirm";
    return html`<div class="buttons">
      <button type="button" @click=${this._back}>
        ${this._stageIndex === 0 ? lockText("cancel") : lockText("back")}
      </button>
      <button
        type="button"
        class="primary"
        ?disabled=${this._busy || (last && !this._ack)}
        @click=${last ? this._create : this._next}
      >
        ${last ? lockText("create") : lockText("next")}
      </button>
    </div>`;
  }

  private _renderStage(): TemplateResult {
    switch (this._stage) {
      case "choose":
        return this._renderChoose();
      case "pin":
        return html`<p>${lockText("pin_new")}</p>
          <ha-lock-pin-entry
            .submitLabel=${lockText("next")}
            @lock-pin-submit=${this._pinChosen}
            @lock-pin-cancel=${this._back}
          ></ha-lock-pin-entry>`;
      case "pin_confirm":
        return html`<p>${lockText("pin_repeat")}</p>
          <ha-lock-pin-entry
            .submitLabel=${lockText("next")}
            @lock-pin-submit=${this._pinRepeated}
            @lock-pin-cancel=${this._back}
          ></ha-lock-pin-entry>`;
      case "password":
        return html`<ha-input
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
      case "totp":
        return html`<p>${lockText("totp_intro")}</p>
          <p class="secret">
            <code>${this._totpSecret}</code>
          </p>
          <p class="note">
            <a href=${totpUri(this._totpSecret, this.target.label)}
              >${lockText("totp_open")}</a
            >
          </p>
          <ha-input
            name="totp_check"
            inputmode="numeric"
            autocomplete="off"
            maxlength="6"
            .label=${lockText("totp_check")}
          ></ha-input>
          ${
            this._totpChecked
              ? html`<p class="ok" role="status">${lockText("totp_ok")}</p>`
              : nothing
          }`;
      default:
        return this._renderConfirm();
    }
  }

  private _renderChoose(): TemplateResult {
    return html`
      <fieldset>
        <legend>${lockText("policy_title")}</legend>
        ${LOCK_POLICIES.map(
          (policy) =>
            html`<label class="choice">
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
      </fieldset>
      <fieldset>
        <legend>${lockText("duration_title")}</legend>
        ${(["surface", "minutes", "session"] as const).map(
          (kind) =>
            html`<label class="choice">
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
      </fieldset>
    `;
  }

  private _renderConfirm(): TemplateResult {
    return html`<p>
        ${lockText("summary", {
          name: this.target.label,
          policy: lockText(`policy_${this._policy}`),
        })}
      </p>
      <p class="note">${lockText("toy_note")}</p>
      <p class="note">${lockText("recovery")}</p>
      <label class="choice">
        <input
          type="checkbox"
          .checked=${this._ack}
          @change=${this._ackChanged}
        />
        ${lockText("ack")}
      </label>`;
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
    this._pin = "";
    this._password = "";
    this._totpChecked = false;
    this._totpSecret = newTotpSecret();
  }

  private _minutesInput(ev: Event): void {
    this._minutes = Number((ev.target as HaInput).value);
  }

  private _passwordInput(ev: Event): void {
    this._password = (ev.target as HaInput).value ?? "";
  }

  private _pinChosen(ev: CustomEvent<{ value: string }>): void {
    this._pin = ev.detail.value;
    this._error = "";
    this._stageIndex += 1;
    this._focusFirst();
  }

  private _pinRepeated(ev: CustomEvent<{ value: string }>): void {
    if (ev.detail.value !== this._pin) {
      this._error = lockText("pin_mismatch");
      this._pin = "";
      this._stageIndex -= 1;
      this._focusFirst();
      return;
    }
    this._error = "";
    this._stageIndex += 1;
    this._focusFirst();
  }

  private _back(): void {
    this._error = "";
    if (this._stageIndex === 0) {
      this._close();
      return;
    }
    this._stageIndex -= 1;
    this._focusFirst();
  }

  private async _next(): Promise<void> {
    this._error = "";
    const stage = this._stage;
    if (stage === "choose") {
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
    } else if (stage === "password") {
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
    } else if (stage === "totp") {
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
    this._stageIndex += 1;
    this._focusFirst();
  }

  private async _create(): Promise<void> {
    if (this._busy || !this._ack) {
      return;
    }
    this._busy = true;
    try {
      const factors = POLICY_FACTORS[this._policy];
      const has = (factor: LockFactor) => factors.includes(factor);
      const record = await createLockRecord(
        {
          key: this.target.key,
          label: this.target.label,
          policy: this._policy,
          duration: this._duration,
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

  static styles: CSSResultGroup = css`
    :host {
      display: contents;
    }
    .panel {
      position: fixed;
      z-index: 1000;
      box-sizing: border-box;
      overflow: auto;
      padding: var(--ha-space-4);
      border-radius: var(--ha-border-radius-3xl);
      background: var(--card-background-color, #fff);
      color: var(--primary-text-color);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
      border: 1px solid var(--divider-color);
      display: grid;
      gap: var(--ha-space-2);
    }
    h2 {
      margin: 0;
      font-size: var(--ha-font-size-l, 1.1rem);
      overflow-wrap: anywhere;
    }
    p {
      margin: 0;
    }
    .note {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s, 0.85rem);
    }
    .error {
      color: var(--error-color);
    }
    .ok {
      color: var(--success-color);
    }
    .secret code {
      overflow-wrap: anywhere;
      font-size: var(--ha-font-size-l, 1.1rem);
    }
    fieldset {
      border: 1px solid var(--divider-color);
      border-radius: var(--ha-border-radius-lg);
      margin: 0;
      padding: var(--ha-space-2);
    }
    .choice {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      min-height: 44px;
    }
    .choice input {
      width: 20px;
      height: 20px;
      flex: none;
    }
    .buttons {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--ha-space-2);
    }
    button {
      min-height: 48px;
      border: 1px solid var(--divider-color);
      border-radius: var(--ha-border-radius-lg);
      background: var(--secondary-background-color);
      color: var(--primary-text-color);
      font: inherit;
      cursor: pointer;
    }
    button.primary {
      background: var(--primary-color);
      color: var(--text-primary-color, #fff);
      border-color: var(--primary-color);
    }
    button:focus-visible,
    input:focus-visible,
    a:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    button:disabled {
      opacity: 0.5;
      cursor: default;
    }
  `;
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
