/* eslint-disable lit/prefer-query-decorators -- the fields asked for depend on the step shown */
import { mdiCheck, mdiClose, mdiLifebuoy, mdiTimerSand } from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import { LanguageModeController } from "../../common/language-mode/language-mode-controller";
import {
  grantUnlock,
  isUnlocked,
} from "../../common/locks/element-lock-session";
import {
  isLocked,
  readLocks,
  tryPin,
  UNLOCK_HOLD_MS,
  writeLocks,
  withUpdatedRecord,
} from "../../common/locks/element-locks";
import { lockPageName } from "../../common/locks/lock-where";
import type {
  LockFactor,
  LockRecord,
} from "../../common/locks/lock-credentials";
import { waitForFailures } from "../../common/locks/lock-wait";
import {
  checkFactor,
  finishAttempt,
  POLICY_FACTORS,
} from "../../common/locks/lock-credentials";
import "../ha-svg-icon";
import "../input/ha-input";
import type { HaInput } from "../input/ha-input";
import { openSupportDesk } from "../support/ha-support-desk";
import "./ha-lock-pin-entry";
import type { HaLockPinEntry } from "./ha-lock-pin-entry";
import { lockPanelStyles } from "./lock-panel-styles";
import { anchorStyle, isNarrow, lockText, onNarrowChange } from "./lock-text";

export interface LockPromptOptions {
  /** Opens the lock for its chosen time on success. On by default. */
  grant?: boolean;
  /** Called after every factor was right. */
  onSuccess?: () => void;
  /** Where focus goes back to; the element itself when left out. */
  returnTo?: HTMLElement;
  /** A title instead of "Unlock ...". */
  title?: string;
}

/**
 * The unlock prompt of one lock. It floats beside the element that was
 * pressed, takes no focus trap and does not darken the page. The factors of
 * the lock's policy are asked one by one in their order; a wrong answer
 * starts the attempt again and spends the one budget the lock has.
 */
@customElement("ha-lock-prompt")
export class HaLockPrompt extends LitElement {
  // Draws the wording again when the language mode changes.
  protected _languageMode = new LanguageModeController(this);

  @property({ attribute: false }) public lockKey = "";

  @property({ attribute: false }) public anchor?: Element;

  @property({ attribute: false }) public options: LockPromptOptions = {};

  @state() private _step = 0;

  @state() private _message = "";

  @state() private _busy = false;

  @state() private _now = Date.now();

  @state() private _narrow = isNarrow();

  /** An older lock without a PIN is opened by holding its button. */
  @state() private _holding = false;

  private _holdTimer?: number;

  private _stopNarrow?: () => void;

  private _timer?: number;

  private _returnTo?: HTMLElement;

  @query(".panel") private _panel?: HTMLElement;

  public connectedCallback(): void {
    super.connectedCallback();
    const active = document.activeElement;
    this._returnTo =
      this.options.returnTo ??
      (active instanceof HTMLElement && active !== document.body
        ? active
        : (this.anchor as HTMLElement | undefined));
    this._timer = window.setInterval(() => {
      this._now = Date.now();
    }, 1000);
    this._stopNarrow = onNarrowChange((narrow) => {
      this._narrow = narrow;
    });
    window.addEventListener("keydown", this._escape, true);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._stopNarrow?.();
    window.clearInterval(this._timer);
    window.clearTimeout(this._holdTimer);
    window.removeEventListener("keydown", this._escape, true);
  }

  private get _record(): LockRecord | undefined {
    return readLocks().records?.[this.lockKey];
  }

  protected firstUpdated(_changed: PropertyValues): void {
    this._focusFirst();
  }

  private _focusFirst(): void {
    this.updateComplete.then(() => {
      const target = this.renderRoot.querySelector<HTMLElement>(
        "ha-lock-pin-entry, ha-input, .close"
      );
      (target as HTMLElement | null)?.focus?.();
    });
  }

  private _escape = (ev: KeyboardEvent): void => {
    if (ev.key === "Escape") {
      ev.stopPropagation();
      this._close();
    }
  };

  private _close(): void {
    const target = this._returnTo;
    this.remove();
    if (target?.isConnected) {
      target.focus?.();
    }
  }

  private get _waitSeconds(): number {
    const blocked = this._record
      ? this._record.blockedUntil
      : readLocks().blockedUntil;
    return Math.max(0, Math.ceil((blocked - this._now) / 1000));
  }

  protected render(): TemplateResult {
    const record = this._record;
    const factors = record ? POLICY_FACTORS[record.policy] : [];
    // An older lock has no record but still needs to be placed: without a
    // position the fixed panel falls to the end of the page, off the screen.
    const style = this._narrow
      ? {}
      : anchorStyle(
          this.anchor,
          record && factors[this._step] === "pin" ? 640 : 400
        );
    return html`
      <div
        class=${classMap({
          panel: true,
          sheet: this._narrow,
          bottom: this._narrow,
        })}
        role="dialog"
        aria-modal="false"
        aria-labelledby="title"
        style=${styleMap(style)}
      >
        <header>
          <div class="titles">
            <h2 id="title">
              ${
                this.options.title ??
                lockText("unlock_title", {
                  name:
                    record?.label ??
                    lockPageName(readLocks(), this.lockKey) ??
                    this.lockKey,
                })
              }
            </h2>
            ${
              factors.length > 1
                ? html`<p class="sub">
                    ${lockText("wizard_step", {
                      current: this._step + 1,
                      total: factors.length,
                    })}
                  </p>`
                : nothing
            }
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
        ${record ? this._renderSteps(record) : this._renderLegacy()}
        <button type="button" class="text forgot" @click=${this._forgot}>
          <ha-svg-icon .path=${mdiLifebuoy}></ha-svg-icon>
          ${lockText("forgot")}
        </button>
        ${
          record && (record.failures > 0 || this._message)
            ? html`<p class="callout">
                <ha-svg-icon .path=${mdiLifebuoy}></ha-svg-icon>
                <span>${lockText("recovery")}</span>
              </p>`
            : nothing
        }
      </div>
    `;
  }

  /** An older lock: opened with the one shared PIN, or by holding the button when there is none. */
  private _renderLegacy(): TemplateResult {
    const store = readLocks();
    if (!isLocked(store, this.lockKey)) {
      return html`<p>${lockText("legacy_lock")}</p>`;
    }
    const wait = this._waitSeconds;
    const callout =
      wait > 0
        ? html`<p class="callout" role="status">
            <ha-svg-icon .path=${mdiTimerSand}></ha-svg-icon>
            <span>${lockText("wait", { seconds: wait })}</span>
          </p>`
        : this._message
          ? html`<p class="callout error" role="alert">
              <ha-svg-icon .path=${mdiTimerSand}></ha-svg-icon>
              <span>${this._message}</span>
            </p>`
          : nothing;
    if (store.pin) {
      return html`${callout}
        <ha-lock-pin-entry
          .prompt=${lockText("legacy_pin_prompt")}
          .submitLabel=${lockText("unlock")}
          .disabled=${wait > 0}
          @lock-pin-submit=${this._legacySubmitted}
          @lock-pin-cancel=${this._close}
        ></ha-lock-pin-entry>`;
    }
    return html`<p class="note">${lockText("legacy_hold_hint")}</p>
      <div class="buttons">
        <button type="button" class="text" @click=${this._close}>
          ${lockText("cancel")}
        </button>
        <button
          type="button"
          class="primary hold"
          @pointerdown=${this._holdStart}
          @pointerup=${this._holdEnd}
          @pointerleave=${this._holdEnd}
          @pointercancel=${this._holdEnd}
          @keydown=${this._holdKey}
          @keyup=${this._holdEnd}
          @blur=${this._holdEnd}
        >
          ${this._holding ? lockText("legacy_holding") : lockText("legacy_hold")}
        </button>
      </div>`;
  }

  private _holdKey(ev: KeyboardEvent): void {
    if ((ev.key === "Enter" || ev.key === " ") && !ev.repeat) {
      this._holdStart();
    }
  }

  private _holdStart(): void {
    if (this._holding) {
      return;
    }
    this._holding = true;
    this._holdTimer = window.setTimeout(() => {
      this._holding = false;
      this._finishLegacy();
    }, UNLOCK_HOLD_MS);
  }

  private _holdEnd(): void {
    window.clearTimeout(this._holdTimer);
    this._holding = false;
  }

  private _legacySubmitted(ev: CustomEvent<{ value: string }>): void {
    const result = tryPin(readLocks(), ev.detail.value, Date.now());
    writeLocks(result.store);
    if (result.outcome === "ok") {
      this._finishLegacy();
      return;
    }
    this._now = Date.now();
    this._message =
      result.outcome === "wait"
        ? ""
        : lockText("wrong", { count: result.store.failures });
    this._panel?.querySelector<HaLockPinEntry>("ha-lock-pin-entry")?.clear();
    this._focusFirst();
  }

  /** The shared PIN or the hold was right: open it for this page, as asked. */
  private _finishLegacy(): void {
    if (this.options.grant !== false && !isUnlocked(this.lockKey)) {
      grantUnlock(this.lockKey, { kind: "surface" });
    }
    const done = this.options.onSuccess;
    this._close();
    done?.();
  }

  private _forgot(): void {
    const anchor = this._returnTo ?? this.anchor;
    this.remove();
    openSupportDesk(anchor);
  }

  private _duration(ms: number): string {
    return ms < 60000
      ? lockText("seconds_value", { count: Math.round(ms / 1000) })
      : lockText("minutes_value", { count: Math.round(ms / 60000) });
  }

  private _renderSteps(record: LockRecord): TemplateResult {
    const factors = POLICY_FACTORS[record.policy];
    const factor = factors[this._step];
    const wait = this._waitSeconds;
    const last = this._step === factors.length - 1;
    const nextWait = waitForFailures(record.failures + 1);
    return html`
      ${
        factors.length > 1
          ? html`<ol class="chips" aria-label=${lockText("steps_label")}>
              ${factors.map(
                (item, index) =>
                  html`<li
                    aria-current=${index === this._step ? "step" : "false"}
                    class=${index < this._step ? "done" : ""}
                  >
                    ${
                      index < this._step
                        ? html`<ha-svg-icon .path=${mdiCheck}></ha-svg-icon
                            ><span class="visually-hidden"
                              >${lockText("step_done")}</span
                            >`
                        : nothing
                    }
                    ${lockText(`factor_${item}`)}
                  </li>`
              )}
            </ol>`
          : nothing
      }
      ${
        wait > 0
          ? html`<p class="callout" role="status">
              <ha-svg-icon .path=${mdiTimerSand}></ha-svg-icon>
              <span>${lockText("wait", { seconds: wait })}</span>
            </p>`
          : this._message
            ? html`<p class="callout error" role="alert">
                <ha-svg-icon .path=${mdiTimerSand}></ha-svg-icon>
                <span>${this._message}</span>
              </p>`
            : nothing
      }
      ${
        factor === "pin"
          ? html`<ha-lock-pin-entry
              .submitLabel=${last ? lockText("unlock") : lockText("next")}
              .disabled=${this._busy || wait > 0}
              @lock-pin-submit=${this._pinSubmitted}
              @lock-pin-cancel=${this._close}
            ></ha-lock-pin-entry>`
          : html`<form @submit=${this._textSubmitted} novalidate>
              <p>${lockText(`factor_${factor}_label`)}</p>
              <ha-input
                name="value"
                type=${factor === "password" ? "password" : "text"}
                inputmode=${factor === "totp" ? "numeric" : "text"}
                autocomplete="off"
                maxlength=${factor === "totp" ? 6 : 200}
                .label=${
                  factor === "totp"
                    ? lockText("factor_totp_field")
                    : lockText(`factor_${factor}_label`)
                }
                ?disabled=${this._busy || wait > 0}
              ></ha-input>
              ${
                factor === "totp"
                  ? html`<p class="note">${lockText("totp_code_hint")}</p>`
                  : nothing
              }
              <div class="buttons">
                <button
                  type="button"
                  class="text"
                  @click=${this._step > 0 ? this._back : this._close}
                >
                  ${this._step > 0 ? lockText("back") : lockText("cancel")}
                </button>
                <button
                  type="submit"
                  class="primary"
                  ?disabled=${this._busy || wait > 0}
                >
                  ${last ? lockText("submit") : lockText("next")}
                </button>
              </div>
            </form>`
      }
      ${
        record.failures > 0
          ? html`<p class="note">
              ${lockText("tries", { count: record.failures })}
              ${
                nextWait > 0
                  ? lockText("wait_next", { wait: this._duration(nextWait) })
                  : nothing
              }
            </p>`
          : nothing
      }
    `;
  }

  private _back(): void {
    this._message = "";
    this._step = Math.max(0, this._step - 1);
    this._focusFirst();
  }

  private _pinSubmitted(ev: CustomEvent<{ value: string }>): void {
    void this._submit("pin", ev.detail.value);
  }

  private _textSubmitted(ev: SubmitEvent): void {
    ev.preventDefault();
    const input = (ev.currentTarget as HTMLFormElement).querySelector<HaInput>(
      "ha-input"
    );
    const value = input?.value ?? "";
    if (input) {
      input.value = "";
    }
    const record = this._record;
    if (!record) {
      return;
    }
    void this._submit(POLICY_FACTORS[record.policy][this._step], value);
  }

  private async _submit(factor: LockFactor, value: string): Promise<void> {
    const record = this._record;
    if (!record || this._busy) {
      return;
    }
    this._busy = true;
    try {
      const result = await checkFactor(record, factor, value, Date.now());
      let saved = result.record;
      if (result.outcome === "ok") {
        const last = this._step >= POLICY_FACTORS[record.policy].length - 1;
        if (!last) {
          this._message = "";
          this._step += 1;
          this._focusFirst();
          return;
        }
        saved = finishAttempt(saved);
        writeLocks(withUpdatedRecord(readLocks(), saved));
        if (this.options.grant !== false && !isUnlocked(record.key)) {
          grantUnlock(record.key, record.duration);
        }
        const done = this.options.onSuccess;
        this._close();
        done?.();
        return;
      }
      writeLocks(withUpdatedRecord(readLocks(), saved));
      this._step = 0;
      this._now = Date.now();
      // Honest, and the same wherever the try was wrong or has to wait.
      this._message =
        result.outcome === "wait"
          ? ""
          : lockText("wrong", { count: saved.failures });
      this._panel?.querySelector<HaLockPinEntry>("ha-lock-pin-entry")?.clear();
      this._focusFirst();
    } finally {
      this._busy = false;
    }
  }

  static styles: CSSResultGroup = [
    lockPanelStyles,
    css`
      form {
        display: grid;
        gap: var(--ha-space-3);
      }
      .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
      }
      .callout.error {
        color: var(--error-color);
      }
      .buttons button.text {
        justify-self: start;
      }
      button.forgot {
        display: inline-flex;
        align-items: center;
        gap: var(--ha-space-2);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-lock-prompt": HaLockPrompt;
  }
}

/** Opens the unlock prompt of a lock, beside an element. One at a time. */
export const openLockPrompt = (
  key: string,
  anchor: Element,
  options: LockPromptOptions = {}
): void => {
  document.querySelectorAll("ha-lock-prompt").forEach((old) => old.remove());
  const prompt = document.createElement("ha-lock-prompt");
  prompt.lockKey = key;
  prompt.anchor = anchor;
  prompt.options = options;
  document.body.append(prompt);
};
