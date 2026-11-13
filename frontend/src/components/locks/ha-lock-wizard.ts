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
import { LanguageModeController } from "../../common/language-mode/language-mode-controller";
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
  EITHER_POLICIES,
  POLICY_FACTORS,
  totpMatches,
  totpUri,
} from "../../common/locks/lock-credentials";
import "../ha-checkbox";
import type { HaCheckbox } from "../ha-checkbox";
import "../ha-qr-code";
import "../ha-svg-icon";
import "../input/ha-input";
import "../radio/ha-radio-group";
import type { HaRadioGroup } from "../radio/ha-radio-group";
import "../radio/ha-radio-option";
import type { HaInput } from "../input/ha-input";
import "./ha-lock-nfc-listen";
import "./ha-lock-pin-entry";
import type { HaLockPinEntry } from "./ha-lock-pin-entry";
import { lockPanelStyles, raiseToTopLayer } from "./lock-panel-styles";
import {
  buildLockSummary,
  passwordRules,
  tryNewLock,
} from "./lock-wizard-logic";
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
  /**
   * More things locked with the same choices in the same wizard: each gets
   * its own lock record with the same unlock way, so one pass locks them all.
   * `label` then names the whole group, such as "3 pages".
   */
  also?: { key: string; label: string }[];
  /**
   * Whether "locked on start" begins ticked. On by default; a lock on one
   * small thing, such as a tab, starts with it off so the whole app is not
   * covered at start by surprise.
   */
  onStartDefault?: boolean;
}

/** The seven steps, in order. The names are lock wording keys. */
const STEPS = [
  "step_target",
  "policy_title",
  "step_create",
  "step_duration",
  "step_disclosure",
  "step_try",
  "step_confirm",
] as const;

const TARGET = 0;
const POLICY = 1;
const CREATE = 2;
const DURATION = 3;
const DISCLOSURE = 4;
const TRY = 5;
const CONFIRM = 6;

/**
 * The wizard that makes one lock in seven steps: what is locked, what unlocks
 * it, each credential made in the order it will be asked for, how long an
 * unlock lasts, the plain disclosure and recovery line, an optional try of
 * the lock before it is saved, and the confirmation. Wide, it floats beside
 * the element with the steps listed;
 * on a phone it is a full-height sheet with a segmented line. It does not
 * darken the page. Nothing is carried over from another lock.
 */
@customElement("ha-lock-wizard")
export class HaLockWizard extends LitElement {
  // Draws the wording again when the language mode changes.
  protected _languageMode = new LanguageModeController(this);

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

  @state() private _passwordRepeat = "";

  /** The outcome of the try step. Only the outcome is kept, never what was typed. */
  @state() private _tryResult?: "ok" | "wrong" | "invalid";

  @state() private _trying = false;

  /** Bumped whenever credentials or the step change, to drop a late result. */
  private _tryGeneration = 0;

  @state() private _totpSecret = newTotpSecret();

  @state() private _totpChecked = false;

  /** The identity of the NFC tag read during set-up; never shown. */
  @state() private _nfcTag = "";

  /** The identity read on the try step, used once and dropped. */
  private _tryNfc = "";

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
    if (this.target.onStartDefault === false) {
      this._onStart = false;
    }
    const active = document.activeElement;
    this._returnTo =
      active instanceof HTMLElement && active !== document.body
        ? active
        : (this.target.anchor as HTMLElement | undefined);
    this._stopNarrow = onNarrowChange((narrow) => {
      this._narrow = narrow;
    });
    window.addEventListener("keydown", this._escape, true);
    raiseToTopLayer(this);
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
          "ha-lock-pin-entry, ha-input, ha-radio-option[checked]"
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
    const passwordStage = this._step === CREATE && this._factor === "password";
    const nfcStage = this._step === CREATE && this._factor === "nfc";
    const blocked =
      this._busy ||
      this._trying ||
      (last && !this._ack) ||
      (this._step === DISCLOSURE && !this._ack) ||
      (pinStage && !this._pinValid) ||
      (passwordStage && !this._rules.ok) ||
      (nfcStage && !this._nfcTag);
    // The try step is optional: without a good try the button says Skip.
    const skipping = this._step === TRY && this._tryResult !== "ok";
    return html`<div class="buttons">
      ${
        this._step === TARGET
          ? html`<button type="button" class="text" @click=${this._close}>
              ${lockText("cancel")}
            </button>`
          : html`<span class="left">
              <button type="button" class="text" @click=${this._back}>
                ${lockText("back")}
              </button>
              <button type="button" class="text" @click=${this._close}>
                ${lockText("cancel")}
              </button>
            </span>`
      }
      <button
        type="button"
        class="primary"
        ?disabled=${blocked}
        @click=${last ? this._create : this._next}
      >
        ${
          last
            ? lockText("create")
            : skipping
              ? lockText("skip")
              : lockText("next")
        }
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
      case TRY:
        return this._renderTry();
      default:
        return this._renderSummary();
    }
  }

  private get _rules() {
    return passwordRules(
      this._password,
      this._passwordRepeat,
      PASSWORD_MIN,
      PASSWORD_MAX
    );
  }

  /** One rule of a live list, with its state said in words as well as shown. */
  private _renderRule(met: boolean, text: string): TemplateResult {
    return html`<li class=${met ? "met" : "unmet"}>
      <ha-svg-icon .path=${met ? mdiCheck : mdiClose}></ha-svg-icon>
      <span>${text}</span>
      <span class="visually-hidden"
        >${met ? lockText("rule_met") : lockText("rule_unmet")}</span
      >
    </li>`;
  }

  private _renderSummary(): TemplateResult {
    const summary = buildLockSummary({
      policy: this._policy,
      duration: this._duration,
      onStart: this._onStart,
    });
    return html`<p>
        ${lockText("summary", {
          name: this.target.label,
          policy: lockText(`policy_${this._policy}`),
        })}
      </p>
      <dl class="facts">
        <dt>${lockText("summary_locks")}</dt>
        <dd>${this.target.label}</dd>
        <dt>${lockText("unlocks_with")}</dt>
        <dd>
          ${summary.factors
            .map((f) => lockText(`factor_${f}`))
            .join(
              EITHER_POLICIES.has(this._policy) ? lockText("either_join") : ", "
            )}
        </dd>
        <dt>${lockText("unlock_lasts")}</dt>
        <dd>${this._durationText()}</dd>
        <dt>${lockText("on_start_label")}</dt>
        <dd>
          ${summary.onStart ? lockText("summary_yes") : lockText("summary_no")}
        </dd>
        <dt>${lockText("step_try")}</dt>
        <dd>
          ${
            this._tryResult === "ok"
              ? lockText("try_summary_ok")
              : lockText("try_summary_skipped")
          }
        </dd>
      </dl>
      <p class="note">${lockText("summary_secret_note")}</p>`;
  }

  private _renderTry(): TemplateResult {
    return html`<p class="note">${lockText("try_intro")}</p>
      ${this._factors.map((factor) => {
        if (factor === "nfc") {
          return html`<ha-lock-nfc-listen
            .prompt=${lockText("nfc_try_prompt")}
            .disabled=${this._trying}
            @lock-nfc-tag=${this._nfcTry}
          ></ha-lock-nfc-listen>`;
        }
        if (factor === "totp") {
          return html`<ha-input
            name="try_totp"
            inputmode="numeric"
            autocomplete="off"
            maxlength="6"
            .label=${lockText("factor_totp_field")}
            .disabled=${this._trying}
          ></ha-input>`;
        }
        return html`<ha-input
          name=${`try_${factor}`}
          type="password"
          password-toggle
          autocomplete="off"
          inputmode=${factor === "pin" ? "numeric" : "text"}
          .label=${lockText(`factor_${factor}_label`)}
          .disabled=${this._trying}
        ></ha-input>`;
      })}
      <div class="try-row">
        <button
          type="button"
          class="linkbutton"
          ?disabled=${this._trying}
          @click=${this._runTry}
        >
          ${this._trying ? lockText("try_running") : lockText("try_action")}
        </button>
      </div>
      <p
        class=${
          this._tryResult === "ok"
            ? "callout ok"
            : this._tryResult
              ? "callout bad"
              : "visually-hidden"
        }
        role="status"
      >
        ${
          this._tryResult === "ok"
            ? lockText("try_ok")
            : this._tryResult === "wrong"
              ? lockText("try_wrong")
              : this._tryResult === "invalid"
                ? lockText("create_failed")
                : ""
        }
      </p>`;
  }

  private async _runTry(): Promise<void> {
    if (this._trying) {
      return;
    }
    const read = (name: string) =>
      this.renderRoot.querySelector<HaInput>(`ha-input[name='${name}']`)
        ?.value ?? "";
    const generation = this._tryGeneration;
    this._trying = true;
    try {
      const result = await tryNewLock(
        {
          key: this.target.key,
          label: this.target.label,
          policy: this._policy,
          duration: this._duration,
          pin: this._factors.includes("pin") ? this._pin : undefined,
          password: this._factors.includes("password")
            ? this._password
            : undefined,
          totpSecret: this._factors.includes("totp")
            ? this._totpSecret
            : undefined,
          nfcTag: this._factors.includes("nfc") ? this._nfcTag : undefined,
        },
        {
          pin: read("try_pin"),
          // With a tag just read, the tag is tried; otherwise what was typed.
          password: this._tryNfc ? "" : read("try_password"),
          totp: read("try_totp"),
          nfc: this._tryNfc,
        },
        Date.now()
      );
      this._tryNfc = "";
      // A result for credentials the person has since changed or left behind
      // must not mark the new ones as tried.
      if (generation === this._tryGeneration) {
        this._tryResult = result;
      }
    } finally {
      if (generation === this._tryGeneration) {
        this._trying = false;
      }
    }
  }

  /** Drops any "Try it" still running: its result is ignored when it arrives. */
  private _invalidateTry(): void {
    this._tryGeneration += 1;
    this._trying = false;
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
        ></ha-lock-pin-entry>
        <ul class="rules" aria-label=${lockText("rules_label")}>
          ${this._renderRule(this._pinValid, lockText("pin_rule"))}
        </ul>`;
    }
    if (factor === "password") {
      const rules = this._rules;
      return html`${header}
        <ha-input
          name="password"
          type="password"
          password-toggle
          autocomplete="new-password"
          maxlength=${PASSWORD_MAX}
          .label=${lockText("password_new")}
          .value=${this._password}
          @input=${this._passwordInput}
        ></ha-input>
        <ha-input
          name="password_repeat"
          type="password"
          password-toggle
          autocomplete="new-password"
          maxlength=${PASSWORD_MAX}
          .label=${lockText("password_repeat")}
          .value=${this._passwordRepeat}
          @input=${this._passwordRepeatInput}
        ></ha-input>
        <ul class="rules" aria-label=${lockText("rules_label")}>
          ${this._renderRule(
            rules.lengthOk,
            lockText("password_rule_length", {
              min: PASSWORD_MIN,
              max: PASSWORD_MAX,
            })
          )}
          ${this._renderRule(rules.matchOk, lockText("password_rule_match"))}
        </ul>
        <p class="visually-hidden" role="status">
          ${rules.ok ? lockText("rules_all_met") : ""}
        </p>`;
    }
    if (factor === "nfc") {
      return html`${header}
        <p class="note">${lockText("nfc_backup_note")}</p>
        <ha-lock-nfc-listen
          .prompt=${lockText("nfc_setup_prompt")}
          .done=${Boolean(this._nfcTag)}
          @lock-nfc-tag=${this._nfcHeard}
        ></ha-lock-nfc-listen>
        ${
          this._nfcTag
            ? html`<button
                type="button"
                class="linkbutton"
                @click=${this._nfcAgain}
              >
                ${lockText("nfc_scan_again")}
              </button>`
            : nothing
        }`;
    }
    const uri = totpUri(this._totpSecret, this.target.label);
    return html`${header}
      <p>${lockText("totp_intro")}</p>
      <p>${lockText("totp_saved_note")}</p>
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
    return html`<ha-radio-group
      name="policy"
      .value=${this._policy}
      @change=${this._policyChanged}
    >
      <span slot="label" class="visually-hidden"
        >${lockText("policy_title")}</span
      >
      ${LOCK_POLICIES.map(
        (policy) =>
          html`<ha-radio-option
            class=${classMap({
              choice: true,
              card: true,
              selected: this._policy === policy,
            })}
            .value=${policy}
          >
            <span class="card-text">
              <span class="card-title">${lockText(`policy_${policy}`)}</span>
              <span class="card-desc"
                >${lockText(`policy_${policy}_desc`)}</span
              >
            </span>
          </ha-radio-option>`
      )}
    </ha-radio-group>`;
  }

  private _renderDuration(): TemplateResult {
    return html`<div class="durations">
      <p class="note">${lockText("duration_title")}</p>
      <ha-radio-group
        name="duration"
        .value=${this._durationKind}
        @change=${this._durationChanged}
      >
        <span slot="label" class="visually-hidden"
          >${lockText("duration_title")}</span
        >
        ${(["surface", "session", "minutes"] as const).map(
          (kind) =>
            html`<ha-radio-option
              class=${classMap({
                choice: true,
                selected: this._durationKind === kind,
              })}
              .value=${kind}
              >${lockText(`duration_${kind}`)}</ha-radio-option
            >`
        )}
      </ha-radio-group>
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
      <ha-checkbox
        class="check"
        .checked=${this._onStart}
        @change=${this._onStartChanged}
        >${lockText("on_start_label")}</ha-checkbox
      >
      <p class="note">${lockText("on_start_note")}</p>
    </div>`;
  }

  private _onStartChanged(ev: Event): void {
    this._onStart = (ev.target as HaCheckbox).checked;
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
      <ha-checkbox
        class="check"
        .checked=${this._ack}
        @change=${this._ackChanged}
        >${lockText("ack")}</ha-checkbox
      >
      <dl class="facts">
        <dt>${lockText("unlocks_with")}</dt>
        <dd>${lockText(`policy_${this._policy}`)}</dd>
        <dt>${lockText("unlock_lasts")}</dt>
        <dd>${this._durationText()}</dd>
      </dl>`;
  }

  private _policyChanged(ev: Event): void {
    this._choosePolicy((ev.currentTarget as HaRadioGroup).value as LockPolicy);
  }

  private _durationChanged(ev: Event): void {
    this._durationKind = (ev.currentTarget as HaRadioGroup)
      .value as LockDuration["kind"];
  }

  private _ackChanged(ev: Event): void {
    this._ack = (ev.target as HaCheckbox).checked;
  }

  private _choosePolicy(policy: LockPolicy): void {
    this._policy = policy;
    this._resetCredentials();
  }

  private _resetCredentials(): void {
    this._invalidateTry();
    this._pin = "";
    this._password = "";
    this._passwordRepeat = "";
    this._tryResult = undefined;
    this._totpChecked = false;
    this._totpSecret = newTotpSecret();
    this._nfcTag = "";
    this._tryNfc = "";
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

  private _passwordRepeatInput(ev: Event): void {
    this._passwordRepeat = (ev.target as HaInput).value ?? "";
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

  private _nfcHeard(ev: CustomEvent<{ identity: string }>): void {
    this._nfcTag = ev.detail.identity;
    this._error = "";
  }

  private _nfcAgain(): void {
    this._nfcTag = "";
    this.renderRoot
      .querySelector<HTMLElement & { restart(): void }>("ha-lock-nfc-listen")
      ?.restart();
  }

  private _nfcTry(ev: CustomEvent<{ identity: string }>): void {
    this._tryNfc = ev.detail.identity;
    void this._runTry();
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
    this._invalidateTry();
    if (index === CREATE) {
      // Credentials are made again, in order.
      this._resetCredentials();
    }
    this._step = index;
    this._focusFirst();
  }

  private _back(): void {
    this._error = "";
    this._invalidateTry();
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
    if (this._step !== TRY) {
      this._invalidateTry();
    }
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
    if (this._step === TRY) {
      this._tryResult = undefined;
    }
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
      const repeat = this._passwordRepeat;
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
    } else if (factor === "nfc") {
      if (!this._nfcTag) {
        this._error = lockText("nfc_missing");
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
      const members = [
        { key: this.target.key, label: this.target.label },
        ...(this.target.also ?? []),
      ];
      // Locks made together are each named for what they lock.
      const records = await Promise.all(
        members.map((member) =>
          createLockRecord(
            {
              key: member.key,
              label: member.label,
              policy: this._policy,
              duration: this._duration,
              page: this.target.page ?? document.title,
              onStart: this._onStart,
              pin: has("pin") ? this._pin : undefined,
              password: has("password") ? this._password : undefined,
              totpSecret: has("totp") ? this._totpSecret : undefined,
              nfcTag: has("nfc") ? this._nfcTag : undefined,
            },
            Date.now()
          )
        )
      );
      const store = records.reduce(
        (current, record) => withLockRecord(current, record),
        readLocks()
      );
      writeLocks(store);
      applyElementLocks();
      this._pin = "";
      this._password = "";
      this._passwordRepeat = "";
      this._totpSecret = "";
      this._nfcTag = "";
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
      /* The steps scroll inside their own row, so the last choice is never
         drawn under the buttons below it. */
      .layout {
        min-height: 0;
        overflow-y: auto;
        padding-bottom: var(--ha-space-2);
        scroll-padding-bottom: var(--ha-space-4);
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
      .left {
        display: inline-flex;
        gap: var(--ha-space-1);
      }
      .rules {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: var(--ha-space-1);
      }
      .rules li {
        display: flex;
        align-items: center;
        gap: var(--ha-space-2);
        font-size: var(--ha-font-size-s, 0.85rem);
        color: var(--secondary-text-color);
      }
      .rules li ha-svg-icon {
        --mdc-icon-size: 18px;
      }
      .rules li.met {
        color: var(--success-color);
      }
      .rules li.unmet ha-svg-icon {
        color: var(--error-color);
      }
      .choice.card {
        align-items: flex-start;
        padding: var(--ha-space-3);
        min-height: 56px;
      }
      .card-text {
        display: grid;
        gap: 2px;
      }
      .card-title {
        font-weight: 500;
      }
      .card-desc {
        font-size: var(--ha-font-size-s, 0.85rem);
        color: var(--secondary-text-color);
      }
      .try-row {
        display: flex;
      }
      .callout.bad {
        background: var(
          --ha-color-error-container,
          color-mix(in srgb, var(--error-color) 18%, transparent)
        );
        color: var(--ha-color-on-error-container, var(--primary-text-color));
      }
      .segments {
        display: grid;
        grid-auto-flow: column;
        grid-auto-columns: 1fr;
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
        background: var(
          --ha-color-primary-container,
          color-mix(in srgb, var(--primary-color) 18%, transparent)
        );
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
      .durations {
        border: 0;
        margin: 0;
        padding: 0;
        display: grid;
        gap: var(--ha-space-2);
      }
      ha-radio-group {
        display: block;
        min-width: 0;
      }
      ha-radio-option.choice {
        display: block;
        margin-bottom: var(--ha-space-2);
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
        background: var(
          --ha-color-primary-container,
          color-mix(in srgb, var(--primary-color) 18%, transparent)
        );
        color: var(--ha-color-on-primary-container, inherit);
      }
      /* The method cards: one big card per way to unlock, the chosen one outlined. */
      .choice.card {
        border: 1.5px solid var(--ha-color-outline, var(--divider-color));
        border-radius: var(--ha-border-radius-2xl, 20px);
        padding: var(--ha-space-4);
        min-height: 72px;
      }
      .choice.card.selected {
        border: 2px solid var(--primary-color);
        padding: calc(var(--ha-space-4) - 0.5px);
      }
      .choice.card .card-desc {
        color: inherit;
        opacity: 0.8;
      }
      .check {
        display: flex;
        align-items: center;
        gap: var(--ha-space-3);
        min-height: 44px;
        --ha-checkbox-min-touch-size: 44px;
      }
      .check::part(base) {
        flex: 1;
        min-height: 44px;
        cursor: pointer;
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
        background: var(
          --ha-color-success-container,
          color-mix(in srgb, var(--success-color) 22%, transparent)
        );
        color: var(--ha-color-on-success-container, var(--primary-text-color));
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
